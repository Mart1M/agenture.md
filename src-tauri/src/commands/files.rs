use std::path::Path;

fn validate_extension(file_path: &str) -> Result<(), String> {
    let ext = Path::new(file_path)
        .extension()
        .map(|e| e.to_string_lossy().to_string())
        .unwrap_or_default();

    if !["md", "mdc", "txt", "yaml", "yml", "json"].contains(&ext.as_str()) {
        return Err(format!("Unsupported file extension: .{}", ext));
    }

    Ok(())
}

fn validate_read_path(file_path: &str, repo_path: &str) -> Result<(), String> {
    let canonical_file = Path::new(file_path)
        .canonicalize()
        .map_err(|e| format!("Invalid file path: {}", e))?;
    let canonical_repo = Path::new(repo_path)
        .canonicalize()
        .map_err(|e| format!("Invalid repo path: {}", e))?;

    if !canonical_file.starts_with(&canonical_repo) {
        return Err("Access denied: path outside repository".into());
    }

    validate_extension(file_path)
}

fn validate_write_path(file_path: &str, repo_path: &str) -> Result<(), String> {
    let file = Path::new(file_path);
    let canonical_repo = Path::new(repo_path)
        .canonicalize()
        .map_err(|e| format!("Invalid repo path: {}", e))?;

    let canonical_parent = file
        .parent()
        .ok_or_else(|| "Invalid file path: missing parent directory".to_string())?
        .canonicalize()
        .map_err(|e| format!("Invalid target directory: {}", e))?;

    if !canonical_parent.starts_with(&canonical_repo) {
        return Err("Access denied: path outside repository".into());
    }

    validate_extension(file_path)
}

#[tauri::command]
pub fn read_file(file_path: String, repo_path: String) -> Result<String, String> {
    validate_read_path(&file_path, &repo_path)?;
    std::fs::read_to_string(&file_path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn write_file(file_path: String, content: String, repo_path: String) -> Result<(), String> {
    validate_write_path(&file_path, &repo_path)?;
    std::fs::write(&file_path, &content).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
pub fn rename_file(
    old_path: String,
    new_name: String,
    repo_path: String,
) -> Result<String, String> {
    // Validate old path is within repo and has allowed extension
    validate_read_path(&old_path, &repo_path)?;

    // new_name must be a plain filename (no directory separators)
    if new_name.contains('/') || new_name.contains('\\') {
        return Err("New name cannot contain path separators".into());
    }
    if new_name.is_empty() {
        return Err("New name cannot be empty".into());
    }

    let old = Path::new(&old_path);
    let parent = old
        .parent()
        .ok_or_else(|| "Invalid file path: missing parent directory".to_string())?;
    let new_path = parent.join(&new_name);
    let new_path_str = new_path.to_string_lossy().to_string();

    // Validate extension of new name
    validate_extension(&new_path_str)?;

    // Validate new path is still within repo
    let canonical_repo = Path::new(&repo_path)
        .canonicalize()
        .map_err(|e| format!("Invalid repo path: {}", e))?;
    let canonical_parent = parent
        .canonicalize()
        .map_err(|e| format!("Invalid parent directory: {}", e))?;
    if !canonical_parent.starts_with(&canonical_repo) {
        return Err("Access denied: path outside repository".into());
    }

    // Refuse to silently overwrite
    if new_path.exists() {
        return Err(format!(
            "A file named '{}' already exists in this directory",
            new_name
        ));
    }

    std::fs::rename(&old_path, &new_path).map_err(|e| format!("Failed to rename file: {}", e))?;

    Ok(new_path_str)
}

#[tauri::command]
pub fn delete_file(file_path: String, repo_path: String) -> Result<(), String> {
    validate_read_path(&file_path, &repo_path)?;
    std::fs::remove_file(&file_path).map_err(|e| format!("Failed to delete file: {}", e))
}

const SEARCH_MAX_FILE_BYTES: u64 = 512 * 1024;
const SEARCH_DEFAULT_MAX_HITS: usize = 80;

#[derive(serde::Serialize)]
pub struct FileSearchHit {
    pub file_path: String,
    pub relative_path: String,
    pub line: usize,
    pub preview: String,
}

fn truncate_chars(s: &str, max: usize) -> String {
    let mut iter = s.chars();
    let head: String = iter.by_ref().take(max).collect();
    if iter.next().is_some() {
        format!("{head}…")
    } else {
        head
    }
}

/// Search `needle` inside text files under `repo_path` (line-level, case-insensitive).
/// Skips paths outside the repo, oversized files, or read errors.
#[tauri::command]
pub fn search_files_content(
    repo_path: String,
    file_paths: Vec<String>,
    query: String,
    max_hits: Option<usize>,
) -> Result<Vec<FileSearchHit>, String> {
    let needle = query.trim();
    if needle.is_empty() {
        return Ok(vec![]);
    }
    let needle_lower = needle.to_lowercase();
    let cap = max_hits.unwrap_or(SEARCH_DEFAULT_MAX_HITS).min(200).max(1);

    let canonical_repo = Path::new(&repo_path)
        .canonicalize()
        .map_err(|e| format!("Invalid repo path: {}", e))?;

    let mut paths: Vec<String> = file_paths.into_iter().collect();
    paths.sort();
    paths.dedup();

    let mut hits: Vec<FileSearchHit> = Vec::new();

    for file_path in paths {
        if hits.len() >= cap {
            break;
        }
        if validate_read_path(&file_path, &repo_path).is_err() {
            continue;
        }

        let canonical_file = match Path::new(&file_path).canonicalize() {
            Ok(p) => p,
            Err(_) => continue,
        };

        let meta = match std::fs::metadata(&file_path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if !meta.is_file() || meta.len() > SEARCH_MAX_FILE_BYTES {
            continue;
        }

        let text = match std::fs::read_to_string(&file_path) {
            Ok(t) => t,
            Err(_) => continue,
        };

        let relative_path = canonical_file
            .strip_prefix(&canonical_repo)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| file_path.clone());

        for (idx, line) in text.lines().enumerate() {
            if hits.len() >= cap {
                break;
            }
            if line.to_lowercase().contains(&needle_lower) {
                hits.push(FileSearchHit {
                    file_path: file_path.clone(),
                    relative_path: relative_path.clone(),
                    line: idx + 1,
                    preview: truncate_chars(line.trim(), 160),
                });
            }
        }
    }

    Ok(hits)
}
