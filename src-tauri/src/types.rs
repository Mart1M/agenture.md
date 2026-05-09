use serde::{Deserialize, Serialize};

/// A detected agent file (.md) in a known agent directory
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedAgent {
    pub raw_name: String,
    pub path: String,
    pub relative_path: String,
    pub source: String,
    pub size_bytes: u64,
}

/// A single .md file inside a skill's sub-folder
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillFile {
    pub raw_name: String, // filename without .md
    pub path: String,
    pub relative_path: String,
    pub size_bytes: u64,
}

/// A sub-folder inside a skill directory (may contain nested folders)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillFolder {
    pub name: String, // last path segment (e.g. "rules")
    /// Path relative to the skill directory, POSIX-style (e.g. `references` or `references/deep`)
    pub rel_path: String,
    pub files: Vec<SkillFile>,
    pub folders: Vec<SkillFolder>,
}

/// A detected skill — a directory containing SKILL.md or skills.md
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedSkill {
    pub raw_name: String,        // camelCase directory name (the skill identifier)
    pub readme_path: String,     // absolute path to SKILL.md / skills.md
    pub readme_relative: String, // relative path to SKILL.md
    pub size_bytes: u64,
    pub folders: Vec<SkillFolder>,  // sub-folders with their .md files
    pub root_files: Vec<SkillFile>, // extra .md files at the skill root (not the readme)
}

/// A single file inside .memory/<category>/
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryFile {
    pub raw_name: String,
    pub path: String,
    pub relative_path: String,
    pub size_bytes: u64,
}

/// A category folder inside .memory/ (context, decision, pattern, preference)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryFolder {
    pub name: String,
    pub files: Vec<MemoryFile>,
}

/// Scanned .memory/ directory
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryScan {
    pub index_file: Option<MemoryFile>,
    pub folders: Vec<MemoryFolder>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoScanResult {
    pub repo_path: String,
    pub agents: Vec<DetectedAgent>,
    pub skills: Vec<DetectedSkill>,
    pub has_agent_context: bool,
    pub memory: Option<MemoryScan>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}
