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

fn validate_create_directory_path(directory_path: &str, repo_path: &str) -> Result<(), String> {
    let dir = Path::new(directory_path);
    let canonical_repo = Path::new(repo_path)
        .canonicalize()
        .map_err(|e| format!("Invalid repo path: {}", e))?;

    let canonical_parent = dir
        .parent()
        .ok_or_else(|| "Invalid directory path: missing parent directory".to_string())?
        .canonicalize()
        .map_err(|e| format!("Invalid target parent directory: {}", e))?;

    if !canonical_parent.starts_with(&canonical_repo) {
        return Err("Access denied: path outside repository".into());
    }

    Ok(())
}

fn validate_move_paths(old_path: &str, new_path: &str, repo_path: &str) -> Result<(), String> {
    let old = Path::new(old_path);
    if !old.exists() {
        return Err("Source path does not exist".into());
    }

    let canonical_repo = Path::new(repo_path)
        .canonicalize()
        .map_err(|e| format!("Invalid repo path: {}", e))?;

    let canonical_old = old
        .canonicalize()
        .map_err(|e| format!("Invalid source path: {}", e))?;
    if !canonical_old.starts_with(&canonical_repo) {
        return Err("Access denied: source outside repository".into());
    }

    let new_parent = Path::new(new_path)
        .parent()
        .ok_or_else(|| "Invalid destination path: missing parent directory".to_string())?;
    let canonical_new_parent = new_parent
        .canonicalize()
        .map_err(|e| format!("Invalid destination parent directory: {}", e))?;
    if !canonical_new_parent.starts_with(&canonical_repo) {
        return Err("Access denied: destination outside repository".into());
    }

    if Path::new(new_path).exists() {
        return Err("Destination already exists".into());
    }

    Ok(())
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
pub fn create_directory(directory_path: String, repo_path: String) -> Result<(), String> {
    validate_create_directory_path(&directory_path, &repo_path)?;
    if Path::new(&directory_path).exists() {
        return Err("Directory already exists".into());
    }
    std::fs::create_dir(&directory_path)
        .map_err(|e| format!("Failed to create directory: {}", e))
}

#[tauri::command]
pub fn move_path(old_path: String, new_path: String, repo_path: String) -> Result<String, String> {
    validate_move_paths(&old_path, &new_path, &repo_path)?;
    std::fs::rename(&old_path, &new_path).map_err(|e| format!("Failed to move path: {}", e))?;
    Ok(new_path)
}

fn to_kebab_case(input: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;

    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }

    out.trim_matches('-').to_string()
}

#[tauri::command]
pub fn create_skill_scaffold(
    name: String,
    description: String,
    repo_path: String,
) -> Result<String, String> {
    let canonical_repo = Path::new(&repo_path)
        .canonicalize()
        .map_err(|e| format!("Invalid repo path: {}", e))?;

    let slug = to_kebab_case(&name);
    if slug.is_empty() {
        return Err("Skill name must contain at least one letter or number".into());
    }

    let skill_dir = canonical_repo.join(".agents").join("skills").join(&slug);
    std::fs::create_dir_all(&skill_dir)
        .map_err(|e| format!("Failed to create skill directory: {}", e))?;

    let skill_file = skill_dir.join("SKILL.md");
    if skill_file.exists() {
        return Err(format!("Skill already exists: {}", slug));
    }

    let content = format!(
        "---\nname: {}\ndescription: {}\n---\n",
        slug,
        description.trim()
    );

    std::fs::write(&skill_file, content)
        .map_err(|e| format!("Failed to write SKILL.md: {}", e))?;

    Ok(skill_file.to_string_lossy().to_string())
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
