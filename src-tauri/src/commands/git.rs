use serde::Serialize;
use std::collections::HashMap;
use std::process::Command;

const LOG_LIMIT: u32 = 800;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitGraphCommit {
    pub id: String,
    pub parents: Vec<String>,
    pub subject: String,
    pub author_name: String,
    pub author_email: String,
    pub committed_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitGraphRef {
    pub tip: String,
    pub name: String,
    pub full_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitGraphSnapshot {
    pub commits: Vec<GitGraphCommit>,
    pub refs: Vec<GitGraphRef>,
    pub head_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChangedFile {
    pub path: String,
    pub display_path: String,
    /// Short badge: M, A, D, ?, R
    pub status_code: String,
    /// Human label: modified, new, deleted, …
    pub status_label: String,
    pub staged: bool,
    pub unstaged: bool,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorkingTree {
    pub is_repo: bool,
    pub branch: Option<String>,
    pub local_branches: Vec<String>,
    pub remote_branches: Vec<String>,
    pub has_upstream: bool,
    pub ahead: u32,
    pub behind: u32,
    pub remote_url: Option<String>,
    pub files: Vec<GitChangedFile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffResult {
    pub path: String,
    pub diff: String,
    pub is_empty: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommandResult {
    pub stdout: String,
    pub stderr: String,
}

fn run_git(repo_path: &str, args: &[&str]) -> Result<std::process::Output, String> {
    Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .output()
        .map_err(|e| format!("git exec failed: {e}"))
}

fn run_git_stdout(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let output = run_git(repo_path, args)?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(err.trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn ensure_repo(repo_path: &str) -> Result<(), String> {
    let out = run_git_stdout(repo_path, &["rev-parse", "--is-inside-work-tree"])?;
    if !out.trim().eq_ignore_ascii_case("true") {
        return Err("Not a Git repository.".to_string());
    }
    Ok(())
}

fn status_label(index: char, worktree: char) -> (String, String) {
    if index == '?' || worktree == '?' {
        return ("?".to_string(), "new".to_string());
    }
    if index == 'D' || worktree == 'D' {
        return ("D".to_string(), "deleted".to_string());
    }
    if index == 'A' || worktree == 'A' {
        return ("A".to_string(), "added".to_string());
    }
    if index == 'R' || worktree == 'R' {
        return ("R".to_string(), "renamed".to_string());
    }
    if index == 'M' || worktree == 'M' {
        return ("M".to_string(), "modified".to_string());
    }
    ("M".to_string(), "changed".to_string())
}

fn parse_numstat(repo_path: &str, cached: bool) -> Result<HashMap<String, (u32, u32)>, String> {
    let mut args = vec!["diff", "--numstat"];
    if cached {
        args.push("--cached");
    }
    let out = run_git_stdout(repo_path, &args)?;
    let mut map = HashMap::new();
    for line in out.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let mut parts = line.split('\t');
        let add_s = parts.next().unwrap_or("0");
        let del_s = parts.next().unwrap_or("0");
        let path = parts.next().unwrap_or("").trim();
        if path.is_empty() {
            continue;
        }
        let additions = if add_s == "-" {
            0
        } else {
            add_s.parse().unwrap_or(0)
        };
        let deletions = if del_s == "-" {
            0
        } else {
            del_s.parse().unwrap_or(0)
        };
        map.insert(path.to_string(), (additions, deletions));
    }
    Ok(map)
}

fn parse_porcelain(repo_path: &str) -> Result<Vec<GitChangedFile>, String> {
    let out = run_git_stdout(repo_path, &["status", "--porcelain"])?;
    let staged_stats = parse_numstat(repo_path, true)?;
    let unstaged_stats = parse_numstat(repo_path, false)?;

    let mut files = Vec::new();
    for line in out.lines() {
        if line.len() < 4 {
            continue;
        }
        let index = line.chars().next().unwrap_or(' ');
        let worktree = line.chars().nth(1).unwrap_or(' ');
        let rest = line[3..].trim();
        if rest.is_empty() {
            continue;
        }

        let path = if let Some((_, new)) = rest.split_once(" -> ") {
            new.trim().to_string()
        } else {
            rest.to_string()
        };

        let staged = index != ' ' && index != '?';
        let unstaged = worktree != ' ';
        let (status_code, status_label) = if staged && unstaged {
            status_label(index, worktree)
        } else if staged {
            status_label(index, ' ')
        } else {
            status_label(' ', worktree)
        };

        let (additions, deletions) = if staged {
            staged_stats
                .get(&path)
                .copied()
                .or_else(|| unstaged_stats.get(&path).copied())
                .unwrap_or((0, 0))
        } else {
            unstaged_stats.get(&path).copied().unwrap_or((0, 0))
        };

        let display_path = path.clone();

        files.push(GitChangedFile {
            path: path.clone(),
            display_path,
            status_code,
            status_label,
            staged,
            unstaged,
            additions,
            deletions,
        });
    }

    files.sort_by(|a, b| a.display_path.cmp(&b.display_path));
    Ok(files)
}

/// Returns commit history (newest first) and refs for the Git graph UI.
#[tauri::command]
pub fn git_graph_snapshot(repo_path: String) -> Result<GitGraphSnapshot, String> {
    ensure_repo(&repo_path)?;

    let head_id = match run_git_stdout(&repo_path, &["rev-parse", "HEAD"]) {
        Ok(s) => {
            let line = s.lines().next().unwrap_or("").trim();
            if line.is_empty() {
                None
            } else {
                Some(line.to_string())
            }
        }
        Err(_) => None,
    };

    let limit_str = LOG_LIMIT.to_string();
    let pretty = "--pretty=format:%H\x1f%P\x1f%s\x1f%an\x1f%ae\x1f%ci\x1e";
    let log_cmd = run_git(
        &repo_path,
        &["log", "--all", "--topo-order", "-n", &limit_str, pretty],
    )?;
    if !log_cmd.status.success() {
        let err = String::from_utf8_lossy(&log_cmd.stderr);
        return Err(err.trim().to_string());
    }
    let log_out = String::from_utf8_lossy(&log_cmd.stdout).to_string();

    let mut commits = Vec::new();
    for record in log_out.split('\x1e') {
        let record = record.trim();
        if record.is_empty() {
            continue;
        }
        let mut parts = record.split('\x1f');
        let id = parts.next().unwrap_or("").trim();
        if id.is_empty() {
            continue;
        }
        let parents_str = parts.next().unwrap_or("").trim();
        let parents = if parents_str.is_empty() {
            Vec::new()
        } else {
            parents_str.split_whitespace().map(String::from).collect()
        };
        commits.push(GitGraphCommit {
            id: id.to_string(),
            parents,
            subject: parts.next().unwrap_or("").to_string(),
            author_name: parts.next().unwrap_or("").to_string(),
            author_email: parts.next().unwrap_or("").to_string(),
            committed_at: parts.next().unwrap_or("").trim().to_string(),
        });
    }

    let refs_out = run_git_stdout(
        &repo_path,
        &[
            "for-each-ref",
            "--format=%(objectname)\x1f%(refname:short)\x1f%(refname)",
            "refs/heads",
            "refs/remotes",
        ],
    )
    .unwrap_or_default();

    let mut refs = Vec::new();
    for line in refs_out.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let mut p = line.split('\x1f');
        let tip = p.next().unwrap_or("").trim();
        let name = p.next().unwrap_or("").trim();
        let full = p.next().unwrap_or("").trim();
        if tip.is_empty() || name.is_empty() {
            continue;
        }
        refs.push(GitGraphRef {
            tip: tip.to_string(),
            name: name.to_string(),
            full_name: if full.is_empty() {
                name.to_string()
            } else {
                full.to_string()
            },
        });
    }

    Ok(GitGraphSnapshot {
        commits,
        refs,
        head_id,
    })
}

#[tauri::command]
pub fn git_working_tree(repo_path: String) -> Result<GitWorkingTree, String> {
    if ensure_repo(&repo_path).is_err() {
        return Ok(GitWorkingTree {
            is_repo: false,
            branch: None,
            local_branches: vec![],
            remote_branches: vec![],
            has_upstream: false,
            ahead: 0,
            behind: 0,
            remote_url: None,
            files: vec![],
        });
    }

    let branch = run_git_stdout(&repo_path, &["branch", "--show-current"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let local_out =
        run_git_stdout(&repo_path, &["for-each-ref", "--format=%(refname:short)", "refs/heads"])
            .unwrap_or_default();
    let local_branches: Vec<String> = local_out
        .lines()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect();

    let remote_out = run_git_stdout(
        &repo_path,
        &[
            "for-each-ref",
            "--format=%(refname:short)",
            "refs/remotes",
        ],
    )
    .unwrap_or_default();
    let remote_branches: Vec<String> = remote_out
        .lines()
        .map(str::trim)
        .filter(|s| {
            !s.is_empty()
                && !s.ends_with("/HEAD")
                && *s != "origin"
                && s.contains('/')
        })
        .map(String::from)
        .collect();

    let remote_url = run_git_stdout(&repo_path, &["remote", "get-url", "origin"]).ok();

    let has_upstream = has_upstream(&repo_path);

    let (ahead, behind) = if has_upstream {
        let counts = run_git_stdout(
            &repo_path,
            &["rev-list", "--left-right", "--count", "@{u}...HEAD"],
        )
        .unwrap_or_else(|_| "0\t0".to_string());
        let mut parts = counts.split_whitespace();
        let behind = parts.next().unwrap_or("0").parse().unwrap_or(0);
        let ahead = parts.next().unwrap_or("0").parse().unwrap_or(0);
        (ahead, behind)
    } else {
        (0, 0)
    };

    let files = parse_porcelain(&repo_path)?;

    Ok(GitWorkingTree {
        is_repo: true,
        branch,
        local_branches,
        remote_branches,
        has_upstream,
        ahead,
        behind,
        remote_url,
        files,
    })
}

#[tauri::command]
pub fn git_file_diff(
    repo_path: String,
    path: String,
    staged: bool,
) -> Result<GitDiffResult, String> {
    ensure_repo(&repo_path)?;
    let mut args = vec!["diff", "--color=never"];
    if staged {
        args.push("--cached");
    }
    args.push("--");
    args.push(&path);

    let diff = run_git_stdout(&repo_path, &args).unwrap_or_default();
    let is_empty = diff.trim().is_empty();
    Ok(GitDiffResult {
        path,
        diff,
        is_empty,
    })
}

#[tauri::command]
pub fn git_stage_paths(
    repo_path: String,
    paths: Vec<String>,
    stage: bool,
) -> Result<(), String> {
    ensure_repo(&repo_path)?;
    if paths.is_empty() {
        return Ok(());
    }
    if stage {
        let mut args = vec!["add", "--"];
        for p in &paths {
            args.push(p.as_str());
        }
        run_git_stdout(&repo_path, &args)?;
    } else {
        let mut args = vec!["restore", "--staged", "--"];
        for p in &paths {
            args.push(p.as_str());
        }
        run_git_stdout(&repo_path, &args)?;
    }
    Ok(())
}

#[tauri::command]
pub fn git_restore_paths(repo_path: String, paths: Vec<String>) -> Result<(), String> {
    ensure_repo(&repo_path)?;
    if paths.is_empty() {
        return Ok(());
    }

    let status = run_git_stdout(&repo_path, &["status", "--porcelain"])?;
    let mut untracked = Vec::new();
    let mut tracked = Vec::new();

    for path in &paths {
        let line = status
            .lines()
            .find(|l| l.len() > 3 && l[3..].trim().starts_with(path.as_str()));
        let is_untracked = line.map(|l| l.starts_with("??")).unwrap_or(false);
        if is_untracked {
            untracked.push(path.as_str());
        } else {
            tracked.push(path.as_str());
        }
    }

    if !tracked.is_empty() {
        let mut args = vec!["restore", "--worktree", "--staged", "--"];
        args.extend(tracked.iter().copied());
        run_git_stdout(&repo_path, &args)?;
    }

    for path in untracked {
        let full = std::path::Path::new(&repo_path).join(path);
        if full.exists() {
            if full.is_dir() {
                std::fs::remove_dir_all(&full).map_err(|e| e.to_string())?;
            } else {
                std::fs::remove_file(&full).map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn git_commit(repo_path: String, message: String) -> Result<(), String> {
    ensure_repo(&repo_path)?;
    let msg = message.trim();
    if msg.is_empty() {
        return Err("Commit message cannot be empty.".to_string());
    }
    run_git_stdout(&repo_path, &["commit", "-m", msg])?;
    Ok(())
}

#[tauri::command]
pub fn git_pull(repo_path: String) -> Result<GitCommandResult, String> {
    ensure_repo(&repo_path)?;
    let output = run_git(&repo_path, &["pull", "--ff-only"])?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(err.trim().to_string());
    }
    Ok(GitCommandResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

fn has_upstream(repo_path: &str) -> bool {
    run_git(repo_path, &["rev-parse", "--abbrev-ref", "@{u}"])
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn default_push_remote(repo_path: &str) -> String {
    run_git_stdout(
        repo_path,
        &["config", "--get", "remote.pushDefault"],
    )
    .ok()
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .or_else(|| {
        run_git_stdout(repo_path, &["remote"])
            .ok()
            .and_then(|out| {
                out.lines()
                    .map(str::trim)
                    .find(|line| !line.is_empty())
                    .map(str::to_string)
            })
    })
    .unwrap_or_else(|| "origin".to_string())
}

#[tauri::command]
pub fn git_push(repo_path: String) -> Result<GitCommandResult, String> {
    ensure_repo(&repo_path)?;

    let output = if has_upstream(&repo_path) {
        run_git(&repo_path, &["push"])?
    } else {
        let remote = default_push_remote(&repo_path);
        let branch = run_git_stdout(&repo_path, &["rev-parse", "--abbrev-ref", "HEAD"])?
            .trim()
            .to_string();
        if branch.is_empty() || branch == "HEAD" {
            return Err("Not on a named branch — cannot push.".to_string());
        }
        run_git(
            &repo_path,
            &["push", "--set-upstream", &remote, &branch],
        )?
    };

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(err.trim().to_string());
    }
    Ok(GitCommandResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

fn humanize_checkout_error(raw: &str) -> String {
    if raw.contains("already used by worktree") {
        return "This branch is checked out in an Agenture agent worktree. \
                Close that agent session, or update Git (2.39+) so the branch can be \
                viewed here while the agent keeps running."
            .to_string();
    }
    if raw.contains("would be overwritten by checkout") || raw.contains("local changes") {
        return "You have uncommitted changes. Save or undo them before switching branch."
            .to_string();
    }
    raw.to_string()
}

fn branch_checkout_target(branch: &str) -> (String, Option<String>) {
    let trimmed = branch.trim();
    if let Some((remote, local)) = trimmed.split_once('/') {
        if !remote.is_empty() && !local.is_empty() {
            return (local.to_string(), Some(trimmed.to_string()));
        }
    }
    (trimmed.to_string(), None)
}

/// Switch branch in the main repository worktree.
///
/// Agent sessions use linked worktrees under `.agenture/worktrees/`, which blocks a
/// plain `git checkout`. Prefer `git switch --ignore-other-worktrees` (Git 2.39+).
#[tauri::command]
pub fn git_checkout_branch(repo_path: String, branch: String) -> Result<(), String> {
    ensure_repo(&repo_path)?;
    let raw = branch.trim();
    if raw.is_empty() {
        return Err("Branch name cannot be empty.".to_string());
    }

    let (local_name, remote_ref) = branch_checkout_target(raw);

    let attempts: Vec<Vec<&str>> = {
        let mut list = vec![
            vec!["switch", "--ignore-other-worktrees", &local_name],
            vec!["checkout", "--ignore-other-worktrees", &local_name],
            vec!["switch", &local_name],
            vec!["checkout", &local_name],
        ];
        if let Some(remote) = remote_ref.as_deref() {
            list.push(vec![
                "switch",
                "-c",
                &local_name,
                "--track",
                remote,
                "--ignore-other-worktrees",
            ]);
        }
        list
    };

    let attempts_refs: Vec<&[&str]> = attempts.iter().map(|v| v.as_slice()).collect();

    let mut last_err = String::new();
    for args in attempts_refs {
        let output = match run_git(&repo_path, args) {
            Ok(o) => o,
            Err(e) => {
                last_err = e;
                continue;
            }
        };
        if output.status.success() {
            return Ok(());
        }
        let stderr = String::from_utf8_lossy(&output.stderr);
        last_err = stderr.trim().to_string();
        // Unknown flag on older Git — try the next strategy.
        if last_err.contains("unknown option") || last_err.contains("unknown switch") {
            continue;
        }
        // Worktree conflict: only `--ignore-other-worktrees` can help; don't fall through
        // to plain checkout (same error).
        if last_err.contains("already used by worktree") {
            break;
        }
    }

    Err(humanize_checkout_error(&last_err))
}

#[tauri::command]
pub fn git_create_branch(repo_path: String, branch: String) -> Result<(), String> {
    ensure_repo(&repo_path)?;
    let name = branch.trim();
    if name.is_empty() {
        return Err("Branch name cannot be empty.".to_string());
    }
    if name.contains(char::is_whitespace) || name.contains("..") {
        return Err("Branch name cannot contain spaces or '..'.".to_string());
    }

    let attempts: &[&[&str]] = &[
        &["switch", "-c", name, "--ignore-other-worktrees"],
        &["checkout", "-b", name, "--ignore-other-worktrees"],
        &["switch", "-c", name],
        &["checkout", "-b", name],
    ];

    let mut last_err = String::new();
    for args in attempts {
        let output = match run_git(&repo_path, args) {
            Ok(o) => o,
            Err(e) => {
                last_err = e;
                continue;
            }
        };
        if output.status.success() {
            return Ok(());
        }
        last_err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if last_err.contains("unknown option") {
            continue;
        }
    }

    Err(humanize_checkout_error(&last_err))
}
