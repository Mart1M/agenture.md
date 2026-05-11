use std::path::Path;
use std::process::Command;

use crate::types::CommandOutput;

const ALLOWED_PACKAGES: &[&str] = &["agenture-cli", "skills"];

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

    if !ALLOWED_PACKAGES.contains(&package_arg.as_str()) {
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
    #[cfg(target_os = "windows")]
    let child = Command::new("cmd.exe")
        .args(["/C", &command])
        .args(&npx_args)
        .current_dir(cwd_path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    #[cfg(not(target_os = "windows"))]
    let child = Command::new(&command)
        .args(&npx_args)
        .current_dir(cwd_path)
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
