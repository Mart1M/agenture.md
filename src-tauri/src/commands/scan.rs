use std::path::Path;
use walkdir::WalkDir;

use crate::types::{DetectedAgent, DetectedSkill, RepoScanResult, SkillFile, SkillFolder};

/// Directories scanned for agent .md / .mdc files
const AGENT_DIRS: &[&str] = &[
    ".agents",
    ".claude",
    ".cursor/rules",
    ".github/agents",
    ".github",
];

/// Root-level .md filenames that count as agent context
const ROOT_AGENT_FILES: &[&str] = &[
    "CLAUDE.md",
    "AGENTS.md",
    "DESIGN.md",
    "copilot-instructions.md",
];

/// Root-level plain filenames (no extension) that count as agent context
const ROOT_AGENT_FILES_PLAIN: &[&str] = &[".windsurfrules", ".cursorrules"];

/// Filenames that identify the root of a skill directory
const SKILL_README_NAMES: &[&str] = &["SKILL.md", "skills.md"];

const SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "__pycache__",
    ".venv",
    "venv",
];

/// Returns the known agent dir prefix if this relative path falls under one
fn agent_source(relative: &str) -> Option<String> {
    let mut dirs = AGENT_DIRS.to_vec();
    dirs.sort_by(|a, b| b.len().cmp(&a.len())); // longest first
    for dir in dirs {
        if relative.starts_with(dir)
            && relative.len() > dir.len()
            && relative.as_bytes()[dir.len()] == b'/'
        {
            return Some(dir.to_string());
        }
    }
    None
}

fn is_inside_skill_container(relative: &str) -> bool {
    relative == "skills" || relative.starts_with("skills/") || relative.contains("/skills/")
}

/// Scan a skill directory for sub-folders and their .md files
fn scan_skill_directory(
    repo_root: &Path,
    skill_dir: &Path,
    readme_filename: &str,
) -> (Vec<SkillFolder>, Vec<SkillFile>) {
    let mut folders: Vec<SkillFolder> = Vec::new();
    let mut root_files: Vec<SkillFile> = Vec::new();

    let entries = match std::fs::read_dir(skill_dir) {
        Ok(e) => e,
        Err(_) => return (folders, root_files),
    };

    let mut dir_entries: Vec<_> = entries.flatten().collect();
    dir_entries.sort_by_key(|e| e.file_name());

    for entry in dir_entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if path.is_dir() {
            // Collect .md files inside this sub-folder (1 level deep)
            let mut files: Vec<SkillFile> = Vec::new();
            if let Ok(sub_entries) = std::fs::read_dir(&path) {
                let mut sub: Vec<_> = sub_entries.flatten().collect();
                sub.sort_by_key(|e| e.file_name());
                for sub_entry in sub {
                    let sub_path = sub_entry.path();
                    if !sub_path.is_file() {
                        continue;
                    }
                    let ext = sub_path
                        .extension()
                        .map(|e| e.to_string_lossy().to_string())
                        .unwrap_or_default();
                    if ext != "md" {
                        continue;
                    }
                    let raw_name = sub_path
                        .file_stem()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let rel = sub_path
                        .strip_prefix(repo_root)
                        .unwrap_or(&sub_path)
                        .to_string_lossy()
                        .to_string();
                    let size = sub_entry.metadata().map(|m| m.len()).unwrap_or(0);
                    files.push(SkillFile {
                        raw_name,
                        path: sub_path.to_string_lossy().to_string(),
                        relative_path: rel,
                        size_bytes: size,
                    });
                }
            }
            if !files.is_empty() {
                folders.push(SkillFolder { name, files });
            }
        } else if path.is_file() {
            let ext = path
                .extension()
                .map(|e| e.to_string_lossy().to_string())
                .unwrap_or_default();
            if ext == "md" && name != readme_filename {
                let raw_name = path
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                let rel = path
                    .strip_prefix(repo_root)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .to_string();
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                root_files.push(SkillFile {
                    raw_name,
                    path: path.to_string_lossy().to_string(),
                    relative_path: rel,
                    size_bytes: size,
                });
            }
        }
    }

    (folders, root_files)
}

#[tauri::command]
pub fn scan_repository(repo_path: String) -> Result<RepoScanResult, String> {
    let root = Path::new(&repo_path);
    if !root.is_dir() {
        return Err(format!("Not a directory: {}", repo_path));
    }

    let mut agents: Vec<DetectedAgent> = Vec::new();
    let mut skills: Vec<DetectedSkill> = Vec::new();
    // Track skill directories already processed to avoid duplicates
    let mut skill_dirs_seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    for entry in WalkDir::new(root)
        .max_depth(6)
        .into_iter()
        .filter_entry(|e| {
            if !e.file_type().is_dir() {
                return true;
            }
            let name = e.file_name().to_string_lossy();
            !SKIP_DIRS.contains(&name.as_ref())
        })
    {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        let ext = path
            .extension()
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_default();

        let file_name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let is_md = ext == "md";
        let is_mdc = ext == "mdc";
        let is_plain_root = ROOT_AGENT_FILES_PLAIN.contains(&file_name.as_str());

        if !is_md && !is_mdc && !is_plain_root {
            continue;
        }

        let relative = path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();

        let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let abs_path = path.to_string_lossy().to_string();

        // --- Skill readme detection ---
        if SKILL_README_NAMES.contains(&file_name.as_str()) {
            if let Some(skill_dir) = path.parent() {
                let skill_dir_str = skill_dir.to_string_lossy().to_string();

                // Avoid processing the same skill directory twice
                if skill_dirs_seen.contains(&skill_dir_str) {
                    continue;
                }

                let folder_name = skill_dir
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();

                // The parent must not be the repo root itself
                let is_repo_root = skill_dir == root;
                if is_repo_root || folder_name.is_empty() {
                    continue;
                }

                skill_dirs_seen.insert(skill_dir_str);

                let (folders, root_files) = scan_skill_directory(root, skill_dir, &file_name);

                skills.push(DetectedSkill {
                    raw_name: folder_name,
                    readme_path: abs_path,
                    readme_relative: relative,
                    size_bytes,
                    folders,
                    root_files,
                });
                continue;
            }
        }

        // --- Root-level plain files (.windsurfrules, .cursorrules) ---
        if is_plain_root && !relative.contains('/') {
            agents.push(DetectedAgent {
                raw_name: file_name.clone(),
                path: abs_path,
                relative_path: relative,
                source: "root".to_string(),
                size_bytes,
            });
            continue;
        }

        // --- Root-level .md agent files ---
        if ROOT_AGENT_FILES.contains(&file_name.as_str()) && !relative.contains('/') {
            let raw_name = file_name
                .strip_suffix(".md")
                .unwrap_or(&file_name)
                .to_string();
            agents.push(DetectedAgent {
                raw_name,
                path: abs_path,
                relative_path: relative,
                source: "root".to_string(),
                size_bytes,
            });
            continue;
        }

        // --- Agent directory detection (.md and .mdc) ---
        if !is_inside_skill_container(&relative) {
            if let Some(source) = agent_source(&relative) {
                // .cursor/rules accepts .mdc; all other agent dirs require .md
                if !is_md && !(is_mdc && source == ".cursor/rules") {
                    continue;
                }
                let raw_name = path
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| file_name.clone());
                agents.push(DetectedAgent {
                    raw_name,
                    path: abs_path,
                    relative_path: relative,
                    source,
                    size_bytes,
                });
            }
        }
    }

    agents.sort_by(|a, b| a.raw_name.cmp(&b.raw_name));
    skills.sort_by(|a, b| a.raw_name.cmp(&b.raw_name));

    let has_agent_context = !agents.is_empty() || !skills.is_empty();

    Ok(RepoScanResult {
        repo_path,
        agents,
        skills,
        has_agent_context,
    })
}
