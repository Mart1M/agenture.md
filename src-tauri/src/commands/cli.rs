use std::process::Command;

use crate::commands::terminal::effective_path;
#[cfg(unix)]
use crate::commands::terminal::executable_file_in_well_known_dirs;
#[cfg(unix)]
use std::path::{Path, PathBuf};
use crate::types::CommandOutput;

const ALLOWED_PACKAGES: &[&str] = &["agenture-cli", "skills"];

/// Resolve the absolute path for `npx` (or any npm binary).
///
/// GUI apps inherit a stripped PATH that often omits nvm/fnm/Homebrew/Volta
/// directories, so `Command::new("npx")` fails with "No such file or directory"
/// even when npx is clearly installed. We first try the enriched `effective_path`,
/// then fall back to the well-known-dirs scan used by the PTY terminal.
#[cfg(unix)]
fn resolve_npx() -> PathBuf {
    // Check whether the enriched PATH already contains npx.
    let path = effective_path();
    for dir in path.split(':') {
        let candidate = Path::new(dir).join("npx");
        if candidate.is_file() {
            return candidate;
        }
    }
    // Fallback: filesystem scan of well-known install directories.
    executable_file_in_well_known_dirs("npx").unwrap_or_else(|| PathBuf::from("npx"))
}

#[tauri::command]
pub fn run_cli_command(
    command: String,
    args: Vec<String>,
    cwd: String,
) -> Result<CommandOutput, String> {
    if command != "npx" {
        return Err(format!("Command not allowed: {}", command));
    }

    if args.is_empty() {
        return Err("No arguments provided".into());
    }

    let package_arg = args
        .iter()
        .find(|arg| !arg.starts_with('-'))
        .ok_or_else(|| "No package provided".to_string())?;

    // Strip optional version/tag suffix (e.g. "skills@latest" → "skills")
    let package_name = package_arg.split('@').next().unwrap_or(package_arg);

    if !ALLOWED_PACKAGES.contains(&package_name) {
        return Err(format!("Package not allowed: {}", package_arg));
    }

    let cwd_path = Path::new(&cwd);
    if !cwd_path.is_dir() {
        return Err(format!("Invalid working directory: {}", cwd));
    }

    // Inject -y so npx never prompts "Ok to proceed?" — the process has no TTY
    // and would hang indefinitely waiting for stdin input.
    let npx_args: Vec<String> = std::iter::once("-y".to_string()).chain(args).collect();

    // On Windows, npm tools like npx are installed as .cmd files which
    // CreateProcessW cannot execute directly — wrap with cmd.exe /C.
    // Always inject the enriched PATH so nvm/fnm/Homebrew/Volta installs are visible.
    #[cfg(target_os = "windows")]
    let child = Command::new("cmd.exe")
        .args(["/C", &command])
        .args(&npx_args)
        .current_dir(cwd_path)
        .env("PATH", effective_path())
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    #[cfg(unix)]
    let child = Command::new(resolve_npx())
        .args(&npx_args)
        .current_dir(cwd_path)
        .env("PATH", effective_path())
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    #[cfg(not(any(target_os = "windows", unix)))]
    let child = Command::new(&command)
        .args(&npx_args)
        .current_dir(cwd_path)
        .env("PATH", effective_path())
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for process: {}", e))?;

    Ok(CommandOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}
