use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

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

#[derive(Debug, Clone, Serialize)]
pub struct PackageWorkspace {
    pub relative_path: String,
    pub directory: String,
    pub package_name: Option<String>,
    pub scripts: HashMap<String, String>,
    /// `true` when this package folder has a `node_modules` directory.
    pub has_node_modules: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct PackageWorkspaceList {
    pub workspaces: Vec<PackageWorkspace>,
    /// `true` when the repository root has `node_modules` (typical install heuristic).
    pub repo_has_node_modules: bool,
}

#[tauri::command]
pub fn list_package_workspaces(repo_path: String) -> Result<PackageWorkspaceList, String> {
    let root = PathBuf::from(&repo_path);
    if !root.is_dir() {
        return Err(format!("Not a directory: {}", repo_path));
    }

    let mut out: Vec<PackageWorkspace> = Vec::new();
    let repo_has_node_modules = root.join("node_modules").is_dir();

    for entry in WalkDir::new(&root).into_iter().filter_entry(|e| {
        if !e.file_type().is_dir() {
            return true;
        }
        let name = e.file_name().to_string_lossy();
        !SKIP_DIRS.contains(&name.as_ref())
    }) {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().is_file() {
            continue;
        }
        if entry.file_name() != "package.json" {
            continue;
        }

        let path = entry.path();
        let relative = path
            .strip_prefix(&root)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");

        let content = fs::read_to_string(path).map_err(|e| e.to_string())?;

        let v: Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let package_name = v
            .get("name")
            .and_then(|x| x.as_str())
            .map(std::string::ToString::to_string);

        let mut scripts = HashMap::new();
        if let Some(map) = v.get("scripts").and_then(|s| s.as_object()) {
            for (key, val) in map {
                if let Some(s) = val.as_str() {
                    scripts.insert(key.clone(), s.to_string());
                }
            }
        }

        let directory = path
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| repo_path.clone());

        let pkg_dir = Path::new(&directory);
        let has_node_modules = pkg_dir.join("node_modules").is_dir();

        out.push(PackageWorkspace {
            relative_path: relative,
            directory,
            package_name,
            scripts,
            has_node_modules,
        });
    }

    out.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(PackageWorkspaceList {
        workspaces: out,
        repo_has_node_modules,
    })
}

#[tauri::command]
pub fn detect_npm_client(repo_path: String) -> Result<String, String> {
    let root = Path::new(&repo_path);
    if !root.is_dir() {
        return Err(format!("Not a directory: {}", repo_path));
    }

    if root.join("pnpm-lock.yaml").exists() || root.join("pnpm-workspace.yaml").exists() {
        return Ok("pnpm".to_string());
    }
    if root.join("bun.lockb").exists() || root.join("bun.lock").exists() {
        return Ok("bun".to_string());
    }
    if root.join("yarn.lock").exists() {
        return Ok("yarn".to_string());
    }
    Ok("npm".to_string())
}
