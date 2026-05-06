use serde::Serialize;
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

fn run_git_stdout(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .output()
        .map_err(|e| format!("git exec failed: {e}"))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(err.trim().to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Returns commit history (newest first) and refs for the Git graph UI.
#[tauri::command]
pub fn git_graph_snapshot(repo_path: String) -> Result<GitGraphSnapshot, String> {
    let out = run_git_stdout(
        &repo_path,
        &["rev-parse", "--is-inside-work-tree"],
    )?;
    if !out.trim().eq_ignore_ascii_case("true") {
        return Err("Not a Git repository.".to_string());
    }

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

    // Newest-first, topo order. Unit sep U+001F between fields, record sep U+001E between commits.
    let limit_str = LOG_LIMIT.to_string();
    let pretty = "--pretty=format:%H\x1f%P\x1f%s\x1f%an\x1f%ae\x1f%ci\x1e";
    let log_cmd = Command::new("git")
        .arg("-C")
        .arg(&repo_path)
        .args(["log", "--all", "--topo-order", "-n"])
        .arg(&limit_str)
        .arg(pretty)
        .output()
        .map_err(|e| format!("git exec failed: {e}"))?;
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
        let subject = parts.next().unwrap_or("").to_string();
        let author_name = parts.next().unwrap_or("").to_string();
        let author_email = parts.next().unwrap_or("").to_string();
        let committed_at = parts.next().unwrap_or("").trim().to_string();
        commits.push(GitGraphCommit {
            id: id.to_string(),
            parents,
            subject,
            author_name,
            author_email,
            committed_at,
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
