#[cfg(unix)]
use libc;
use portable_pty::{native_pty_system, Child as PtyChild, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

/// GUI-launched apps on macOS inherit a stripped `PATH`, so CLI tools installed
/// via Homebrew (~ `/opt/homebrew/bin`) are invisible. Extend PATH for lookup and PTY spawns.
static EFFECTIVE_PATH: OnceLock<String> = OnceLock::new();

fn push_path_segment(bucket: &mut Vec<String>, seen: &mut HashSet<String>, seg: &str) {
    let seg = seg.trim().trim_end_matches('/');
    if seg.is_empty() || !seen.insert(seg.to_string()) {
        return;
    }
    bucket.push(seg.to_string());
}

/// NVM keeps each Node under ~/.nvm/versions/node/<ver>/bin
fn append_nvm_node_bins(home: &str, segments: &mut Vec<String>, seen: &mut HashSet<String>) {
    let base = Path::new(home).join(".nvm/versions/node");
    let Ok(rd) = fs::read_dir(&base) else {
        return;
    };
    for ent in rd.flatten() {
        let bin_dir = ent.path().join("bin");
        if bin_dir.is_dir() {
            if let Some(s) = bin_dir.to_str() {
                push_path_segment(segments, seen, s);
            }
        }
    }
}

/// fnm installs to ~/.fnm/node-versions/<name>/installation/bin
fn append_fnm_node_bins(home: &str, segments: &mut Vec<String>, seen: &mut HashSet<String>) {
    let base = Path::new(home).join(".fnm/node-versions");
    let Ok(rd) = fs::read_dir(&base) else {
        return;
    };
    for ent in rd.flatten() {
        let bin_dir = ent.path().join("installation/bin");
        if bin_dir.is_dir() {
            if let Some(s) = bin_dir.to_str() {
                push_path_segment(segments, seen, s);
            }
        }
    }
}

fn join_os_paths(segments: &[String]) -> String {
    #[cfg(target_family = "windows")]
    {
        segments.join(";")
    }
    #[cfg(not(target_family = "windows"))]
    {
        segments.join(":")
    }
}

fn build_effective_path() -> String {
    let mut segments: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    if let Ok(p) = std::env::var("PATH") {
        #[cfg(target_family = "windows")]
        let parts = p.split(';');
        #[cfg(not(target_family = "windows"))]
        let parts = p.split(':');
        for seg in parts {
            push_path_segment(&mut segments, &mut seen, seg);
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(o) = std::process::Command::new("/usr/libexec/path_helper")
            .arg("-s")
            .output()
        {
            if o.status.success() {
                let s = String::from_utf8_lossy(&o.stdout);
                if let Some(pos) = s.find("PATH=\"") {
                    let rest = &s[pos + 6..];
                    if let Some(end) = rest.find('"') {
                        for seg in rest[..end].split(':') {
                            push_path_segment(&mut segments, &mut seen, seg);
                        }
                    }
                }
            }
        }
        for extra in ["/opt/homebrew/bin", "/usr/local/bin"] {
            push_path_segment(&mut segments, &mut seen, extra);
        }
    }

    #[cfg(not(target_family = "windows"))]
    {
        if let Ok(home) = std::env::var("HOME") {
            for tail in [
                "bin",
                ".local/bin",
                ".cargo/bin",
                ".volta/bin",
                ".bun/bin",
                ".npm-global/bin",
                ".local/share/mise/shims",
                ".local/state/mise/installs/default/bin",
                "Library/pnpm",
            ] {
                push_path_segment(&mut segments, &mut seen, &format!("{home}/{tail}"));
            }
            append_nvm_node_bins(&home, &mut segments, &mut seen);
            append_fnm_node_bins(&home, &mut segments, &mut seen);
        }
    }

    #[cfg(target_family = "windows")]
    {
        if let Ok(prof) = std::env::var("USERPROFILE") {
            let base = std::path::PathBuf::from(prof);
            for rel in [".cargo\\bin", ".local\\bin"] {
                if let Some(s) = base.join(rel).to_str() {
                    push_path_segment(&mut segments, &mut seen, s);
                }
            }
        }
    }

    #[cfg(not(target_family = "windows"))]
    {
        for extra in ["/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"] {
            push_path_segment(&mut segments, &mut seen, extra);
        }
    }

    join_os_paths(&segments)
}

fn effective_path() -> &'static str {
    EFFECTIVE_PATH.get_or_init(build_effective_path)
}

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct AiTool {
    pub id: String,
    pub label: String,
    pub description: String,
    pub command: String,
    pub args: Vec<String>,
    pub detected: bool,
}

struct TerminalHandle {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    /// Spawned foreground process (`std::process::Child`). Must stay alive until the tab is killed.
    child: Box<dyn PtyChild + Send + Sync>,
}

/// Stop the PTY child and (on Unix) the whole process group (shell + grandchildren like `next dev`).
fn terminate_terminal_handle(mut h: TerminalHandle) {
    #[cfg(unix)]
    unix_terminate_terminal_tree(&mut h.child);

    #[cfg(not(unix))]
    {
        let _ = h.child.kill();
        let _ = h.child.wait();
    }

    // Drop master PTY last so the foreground group has already received signals.
}

#[cfg(unix)]
fn unix_terminate_terminal_tree(child: &mut Box<dyn PtyChild + Send + Sync>) {
    let pid = match child.process_id() {
        Some(p) => p as i32,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return;
        }
    };

    let pgid = unsafe { libc::getpgid(pid) };
    if pgid <= 1 {
        let _ = child.kill();
        let _ = child.wait();
        return;
    }

    let our_pgrp = unsafe { libc::getpgrp() };
    if pgid != our_pgrp {
        unsafe {
            let _ = libc::kill(-pgid, libc::SIGTERM);
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
        unsafe {
            let _ = libc::kill(-pgid, libc::SIGKILL);
        }
    }

    let _ = child.kill();
    let _ = child.wait();
}

// ── Session store ─────────────────────────────────────────────────────────────

static TERMINALS: OnceLock<Mutex<HashMap<String, TerminalHandle>>> = OnceLock::new();

fn sessions() -> &'static Mutex<HashMap<String, TerminalHandle>> {
    TERMINALS.get_or_init(|| Mutex::new(HashMap::new()))
}

// ── Helpers ──────────────────────────────────────────────────────────────────

#[cfg(unix)]
fn unix_is_executable(bin: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    match fs::symlink_metadata(bin) {
        Ok(m) => {
            if m.is_dir() {
                false
            } else {
                m.permissions().mode() & 0o111 != 0
            }
        }
        Err(_) => false,
    }
}

/// When `which` fails (sandboxed PATH, symlink-only installs), look for `cmd` under
/// dirs where npm/mise/Homebrew binaries usually live — common for Claude Code.
#[cfg(unix)]
fn executable_file_in_well_known_dirs(program: &str) -> Option<PathBuf> {
    let p = Path::new(program);
    if p.is_absolute() && unix_is_executable(p) {
        return Some(p.to_path_buf());
    }

    let home = std::env::var("HOME").ok()?;
    let mut dirs = vec![
        PathBuf::from(&home).join(".local/bin"),
        PathBuf::from(&home).join("bin"),
        PathBuf::from(&home).join(".volta/bin"),
        PathBuf::from(&home).join(".bun/bin"),
        PathBuf::from(&home).join(".cargo/bin"),
        PathBuf::from(&home).join(".npm-global/bin"),
        PathBuf::from(&home).join(".local/share/mise/shims"),
        PathBuf::from(&home).join("Library/pnpm"),
    ];

    #[cfg(target_os = "macos")]
    {
        dirs.push(PathBuf::from("/opt/homebrew/bin"));
        dirs.push(PathBuf::from("/usr/local/bin"));
        let nv = PathBuf::from(&home).join(".nvm/versions/node");
        if let Ok(rd) = fs::read_dir(&nv) {
            for ent in rd.flatten() {
                dirs.push(ent.path().join("bin"));
            }
        }
        let fv = PathBuf::from(&home).join(".fnm/node-versions");
        if let Ok(rd) = fs::read_dir(&fv) {
            for ent in rd.flatten() {
                dirs.push(ent.path().join("installation/bin"));
            }
        }
    }

    dirs.into_iter()
        .map(|p| p.join(program))
        .find(|candidate| unix_is_executable(candidate.as_path()))
}

fn command_exists(cmd: &str) -> bool {
    #[cfg(target_os = "macos")]
    let which_bin = "/usr/bin/which";
    #[cfg(target_os = "windows")]
    let which_bin = "where.exe";
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let which_bin = "which";

    let path = effective_path();
    let which_ok = std::process::Command::new(which_bin)
        .arg(cmd)
        .env("PATH", path)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);

    if which_ok {
        return true;
    }

    #[cfg(unix)]
    {
        executable_file_in_well_known_dirs(cmd).is_some()
    }
    #[cfg(target_os = "windows")]
    {
        windows_executable_exists(cmd)
    }
    #[cfg(not(any(unix, target_os = "windows")))]
    {
        false
    }
}

#[cfg(target_os = "windows")]
fn windows_executable_exists(cmd: &str) -> bool {
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    let localappdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let userprofile = std::env::var("USERPROFILE").unwrap_or_default();

    // npm global installs land in %APPDATA%\npm\<cmd>.cmd
    // Scoop installs to %USERPROFILE%\scoop\shims\<cmd>.exe
    // Winget / manual installs vary
    let candidates: Vec<PathBuf> = vec![
        PathBuf::from(&appdata).join("npm").join(format!("{cmd}.cmd")),
        PathBuf::from(&appdata).join("npm").join(format!("{cmd}.exe")),
        PathBuf::from(&localappdata).join("Programs").join(cmd).join(format!("{cmd}.exe")),
        PathBuf::from(&localappdata).join(cmd).join(format!("{cmd}.exe")),
        PathBuf::from(&userprofile).join("scoop").join("shims").join(format!("{cmd}.exe")),
        PathBuf::from(&userprofile).join("scoop").join("shims").join(format!("{cmd}.cmd")),
        PathBuf::from(&userprofile).join(".volta").join("bin").join(format!("{cmd}.cmd")),
        PathBuf::from(&userprofile).join(".volta").join("bin").join(format!("{cmd}.exe")),
    ];

    candidates.into_iter().any(|p| p.is_file())
}

// ── Commands ─────────────────────────────────────────────────────────────────

fn resolved_interactive_shell() -> Result<String, String> {
    #[cfg(unix)]
    {
        if let Ok(shell) = std::env::var("SHELL") {
            let t = shell.trim();
            if !t.is_empty() {
                let p = Path::new(t);
                if p.is_absolute() && unix_is_executable(p) {
                    return Ok(t.to_string());
                }
            }
        }
        for fallback in ["/bin/zsh", "/bin/bash", "/bin/sh"] {
            let p = Path::new(fallback);
            if unix_is_executable(p) {
                return Ok(fallback.to_string());
            }
        }
        Ok("/bin/sh".into())
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(cs) = std::env::var("ComSpec") {
            let t = cs.trim();
            if !t.is_empty() {
                return Ok(t.to_string());
            }
        }
        Ok("cmd.exe".into())
    }
    #[cfg(not(any(unix, target_os = "windows")))]
    {
        Err("Unsupported platform".into())
    }
}

/// AI assistants found on PATH plus a plain shell entry when available (listed first).
#[tauri::command]
pub fn detect_ai_tools() -> Vec<AiTool> {
    let candidates: &[(&str, &str, &str, &str, &[&str])] = &[
        (
            "claude",
            "Claude Code",
            "Anthropic's agentic coding assistant",
            "claude",
            &[],
        ),
        (
            "codex",
            "OpenAI Codex",
            "OpenAI's CLI coding agent",
            "codex",
            &[],
        ),
        (
            "gemini",
            "Gemini CLI",
            "Google's Gemini coding assistant",
            "gemini",
            &[],
        ),
        (
            "opencode",
            "OpenCode",
            "Open-source AI coding terminal",
            "opencode",
            &[],
        ),
        (
            "aider",
            "Aider",
            "AI pair programming in your terminal",
            "aider",
            &[],
        ),
        (
            "mistral",
            "Mistral Vibe",
            "Mistral AI coding assistant",
            "vibe",
            &[],
        ),
        (
            "amazon-q",
            "Amazon Q",
            "AWS AI developer assistant",
            "q",
            &["chat"],
        ),
        (
            "continue",
            "Continue",
            "Open-source AI code assistant",
            "continue",
            &[],
        ),
        (
            "copilot",
            "GitHub Copilot",
            "GitHub's AI pair programmer",
            "copilot",
            &[],
        ),
        (
            "codeium",
            "Windsurf",
            "Codeium's AI coding environment",
            "windsurf",
            &[],
        ),
        (
            "cursor",
            "Cursor",
            "AI-first code editor by Anysphere",
            "agent",
            &[],
        ),
    ];

    let mut tools: Vec<AiTool> = candidates
        .iter()
        .map(|(id, label, description, command, args)| {
            let detected = command_exists(command);
            AiTool {
                id: id.to_string(),
                label: label.to_string(),
                description: description.to_string(),
                command: command.to_string(),
                args: args.iter().map(|s| s.to_string()).collect(),
                detected,
            }
        })
        .collect();

    if let Ok(shell_path) = resolved_interactive_shell() {
        #[cfg(unix)]
        let shell_detected = unix_is_executable(Path::new(&shell_path));
        #[cfg(not(unix))]
        let shell_detected = true;

        tools.insert(
            0,
            AiTool {
                id: "shell".to_string(),
                label: "Terminal".to_string(),
                description: "Plain interactive shell in the project folder".to_string(),
                command: shell_path,
                args: Vec::new(),
                detected: shell_detected,
            },
        );
    }

    tools
}

/// Spawns a PTY for the given session ID. Output is streamed via
/// `terminal-output-{session_id}` events; exit via `terminal-exit-{session_id}`.
#[tauri::command]
pub fn spawn_terminal(
    session_id: String,
    command: String,
    args: Vec<String>,
    cwd: String,
    cols: u16,
    rows: u16,
    app: AppHandle,
) -> Result<(), String> {
    // Replace any existing session with the same ID (kill PTY tree first)
    {
        let mut guard = sessions().lock().map_err(|e| e.to_string())?;
        if let Some(old) = guard.remove(&session_id) {
            terminate_terminal_handle(old);
        }
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    #[cfg(unix)]
    let command_path =
        executable_file_in_well_known_dirs(&command).unwrap_or_else(|| PathBuf::from(&command));

    #[cfg(not(unix))]
    let command_path = PathBuf::from(&command);

    let mut cmd = CommandBuilder::new(command_path.as_os_str());
    for arg in &args {
        cmd.arg(arg);
    }
    cmd.cwd(&cwd);
    cmd.env("PATH", effective_path());
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    let output_event = format!("terminal-output-{}", session_id);
    let exit_event = format!("terminal-exit-{}", session_id);

    std::thread::spawn(move || {
        let mut buf = vec![0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let _ = app.emit(&output_event, buf[..n].to_vec());
                }
            }
        }
        let _ = app.emit(&exit_event, ());
    });

    let mut guard = sessions().lock().map_err(|e| e.to_string())?;
    guard.insert(
        session_id,
        TerminalHandle {
            master: pair.master,
            writer: Box::new(writer),
            child,
        },
    );

    Ok(())
}

/// Sends raw bytes to the given session's PTY (keyboard input).
#[tauri::command]
pub fn write_terminal(session_id: String, data: Vec<u8>) -> Result<(), String> {
    let mut guard = sessions().lock().map_err(|e| e.to_string())?;
    if let Some(t) = guard.get_mut(&session_id) {
        t.writer.write_all(&data).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Notifies the given session's PTY of a terminal resize.
#[tauri::command]
pub fn resize_terminal(session_id: String, cols: u16, rows: u16) -> Result<(), String> {
    let guard = sessions().lock().map_err(|e| e.to_string())?;
    if let Some(t) = guard.get(&session_id) {
        t.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Path to an interactive shell for a plain terminal tab (no AI tool).
#[tauri::command]
pub fn default_interactive_shell() -> Result<String, String> {
    resolved_interactive_shell()
}

/// Kills a specific terminal session.
#[tauri::command]
pub fn kill_terminal(session_id: String) -> Result<(), String> {
    let mut guard = sessions().lock().map_err(|e| e.to_string())?;
    if let Some(h) = guard.remove(&session_id) {
        terminate_terminal_handle(h);
    }
    Ok(())
}
