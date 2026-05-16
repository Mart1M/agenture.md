import { invoke } from "@tauri-apps/api/core";
import type { GitChangedFile, GitDiffResult, GitWorkingTree } from "@/types/git";

export async function fetchWorkingTree(repoPath: string): Promise<GitWorkingTree> {
  return invoke<GitWorkingTree>("git_working_tree", { repoPath });
}

export async function fetchFileDiff(
  repoPath: string,
  path: string,
  staged: boolean,
): Promise<GitDiffResult> {
  return invoke<GitDiffResult>("git_file_diff", { repoPath, path, staged });
}

export async function stagePaths(
  repoPath: string,
  paths: string[],
  stage: boolean,
): Promise<void> {
  await invoke("git_stage_paths", { repoPath, paths, stage });
}

export async function restorePaths(repoPath: string, paths: string[]): Promise<void> {
  await invoke("git_restore_paths", { repoPath, paths });
}

export async function commitChanges(repoPath: string, message: string): Promise<void> {
  await invoke("git_commit", { repoPath, message });
}

export async function pullChanges(repoPath: string): Promise<void> {
  const result = await invoke<{ stdout: string; stderr: string }>("git_pull", { repoPath });
  if (result.stderr && !result.stdout) {
    throw new Error(result.stderr.trim());
  }
}

export async function pushChanges(repoPath: string): Promise<void> {
  await invoke("git_push", { repoPath });
}

/** Short label for branch selectors; use `title` for the full name. */
export function formatBranchLabel(name: string, maxLen = 34): string {
  if (name.length <= maxLen) return name;
  const head = Math.ceil(maxLen * 0.42);
  const tail = Math.floor(maxLen * 0.42);
  return `${name.slice(0, head)}…${name.slice(-tail)}`;
}

export async function createBranch(repoPath: string, branch: string): Promise<void> {
  await invoke("git_create_branch", { repoPath, branch });
}

export async function checkoutBranch(repoPath: string, branch: string): Promise<void> {
  try {
    await invoke("git_checkout_branch", { repoPath, branch });
  } catch (e) {
    throw new Error(formatCheckoutError(String(e)));
  }
}

function formatCheckoutError(message: string): string {
  if (message.includes("already used by worktree")) {
    return (
      "This branch is open in an Agenture agent worktree. " +
      "Close that agent session, or update Git to 2.39+ to view the branch here while the agent runs."
    );
  }
  return message;
}

/** Plain-language status for non-technical users. */
export function friendlyStatusLabel(file: GitChangedFile): string {
  switch (file.statusLabel) {
    case "new":
      return "New file";
    case "deleted":
      return "Deleted";
    case "added":
      return "Added";
    case "renamed":
      return "Renamed";
    case "modified":
      return "Modified";
    default:
      return "Changed";
  }
}

export function statusBadgeClass(code: string): string {
  switch (code) {
    case "?":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
    case "A":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "D":
      return "bg-red-500/15 text-red-700 dark:text-red-300";
    default:
      return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
  }
}

export function generateCommitMessage(files: GitChangedFile[]): string {
  if (files.length === 0) return "";
  const names = files.map((f) => f.displayPath.split("/").pop() ?? f.displayPath);
  if (files.length === 1) {
    const f = files[0];
    switch (f.statusLabel) {
      case "new":
        return `Add ${names[0]}`;
      case "deleted":
        return `Remove ${names[0]}`;
      default:
        return `Update ${names[0]}`;
    }
  }
  const summary = `Update ${files.length} files`;
  const list = names.slice(0, 8).map((n) => `- ${n}`).join("\n");
  const more = names.length > 8 ? `\n- …and ${names.length - 8} more` : "";
  return `${summary}\n\n${list}${more}`;
}

export function githubCompareUrl(remoteUrl: string | null, branch: string | null): string | null {
  if (!remoteUrl || !branch) return null;
  const m = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/i);
  if (!m) return null;
  const [, owner, repo] = m;
  return `https://github.com/${owner}/${repo}/compare/${encodeURIComponent(branch)}?expand=1`;
}

export function githubRepoUrl(remoteUrl: string | null): string | null {
  if (!remoteUrl) return null;
  const m = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/i);
  if (!m) return null;
  return `https://github.com/${m[1]}/${m[2]}`;
}
