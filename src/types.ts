export interface DetectedAgent {
  raw_name: string;
  path: string;
  relative_path: string;
  source: string;
  size_bytes: number;
}

export interface SkillFile {
  raw_name: string;
  path: string;
  relative_path: string;
  size_bytes: number;
}

export interface SkillFolder {
  name: string;
  /** Relative to skill directory, e.g. `references` or `references/deep` */
  rel_path: string;
  files: SkillFile[];
  folders: SkillFolder[];
}

export interface DetectedSkill {
  raw_name: string;
  readme_path: string;
  readme_relative: string;
  size_bytes: number;
  folders: SkillFolder[];
  root_files: SkillFile[];
}

export interface MemoryFile {
  raw_name: string;
  path: string;
  relative_path: string;
  size_bytes: number;
}

export interface MemoryFolder {
  name: string;
  files: MemoryFile[];
}

export interface MemoryScan {
  index_file: MemoryFile | null;
  folders: MemoryFolder[];
}

export interface RepoScanResult {
  repo_path: string;
  agents: DetectedAgent[];
  skills: DetectedSkill[];
  has_agent_context: boolean;
  memory: MemoryScan | null;
}

/** Unified item for the sidebar list (agent or skill entry point) */
export interface FileItem {
  name: string;
  raw_name: string;
  path: string;
  relative_path: string;
  type: "agent" | "skill";
  size_bytes: number;
  /** Only present for skills */
  skill?: DetectedSkill;
}

export interface FileSearchHit {
  file_path: string;
  relative_path: string;
  line: number;
  preview: string;
}

/** The actual file shown in the markdown viewer */
export interface ViewerFile {
  name: string;
  path: string;
  relative_path: string;
}

export interface SkillSearchResult {
  name: string;
  description: string;
  owner: string;
  repo: string;
  skill_id: string;
  install_command: string;
}

export interface SkillDetail {
  summary: string;
  weekly_installs: string;
  stars: string;
  first_seen: string;
  audits: { name: string; status: string }[];
  readme: string;
}

export interface CommandOutput {
  stdout: string;
  stderr: string;
  exit_code: number;
}

/** One package.json workspace under a repo (from Rust list_package_workspaces) */
export interface PackageWorkspace {
  relative_path: string;
  directory: string;
  package_name: string | null;
  scripts: Record<string, string>;
  /** Whether this folder has a `node_modules` directory */
  has_node_modules: boolean;
}

export interface PackageWorkspaceList {
  workspaces: PackageWorkspace[];
  repo_has_node_modules: boolean;
}
