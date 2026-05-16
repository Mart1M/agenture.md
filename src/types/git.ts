export interface GitChangedFile {
  path: string;
  displayPath: string;
  statusCode: string;
  statusLabel: string;
  staged: boolean;
  unstaged: boolean;
  additions: number;
  deletions: number;
}

export interface GitWorkingTree {
  isRepo: boolean;
  branch: string | null;
  localBranches: string[];
  remoteBranches: string[];
  hasUpstream: boolean;
  ahead: number;
  behind: number;
  remoteUrl: string | null;
  files: GitChangedFile[];
}

export interface GitDiffResult {
  path: string;
  diff: string;
  isEmpty: boolean;
}

export type GitPanelTab = "commit" | "update" | "pr";
