use std::process::Command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct GitResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
}

#[tauri::command]
pub fn run_git(args: Vec<String>, cwd: String) -> Result<GitResult, String> {
    let output = Command::new("git")
        .args(&args)
        .current_dir(&cwd)
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    Ok(GitResult {
        success: output.status.success(),
        stdout,
        stderr,
    })
}

#[tauri::command]
pub fn get_system_info() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "app": "Gitter",
        "version": "1.0.0",
        "backend": "Tauri 2.0 (Rust)",
        "engine": "WebView2 / Rust Native Core",
    }))
}
