// The desktop app is a window onto Gitter's backend. It starts the bundled
// backend (the `gitter-server` sidecar), waits for it to report its port and
// access token, then opens the main window with that location injected.
mod integrations;
mod credential_store;
mod git_core;
mod ssh_native;

use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Deserialize;
use tauri::{AppHandle, Manager, RunEvent, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[derive(Default)]
struct Backend {
    child: Mutex<Option<CommandChild>>,
    exiting: AtomicBool,
}

/// The line the backend prints once it is listening: `GITTER_READY {"port":…,"token":"…"}`.
/// This prefix and the `--desktop` / `--parent-pid=` arguments must match
/// shared/host.ts, which the backend reads them from.
#[derive(Deserialize)]
struct Ready {
    port: u16,
    token: String,
}

fn integration_settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_config_dir().map(integrations::config_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_integrations(app: AppHandle) -> Result<Vec<integrations::Integration>, String> {
    integrations::list(&integration_settings_path(&app)?)
}

#[tauri::command]
async fn connect_integration(app: AppHandle, kind: String, base_url: String, label: String, token: String) -> Result<integrations::Integration, String> {
    let token = zeroize::Zeroizing::new(token);
    integrations::connect(&integration_settings_path(&app)?, &kind, &base_url, &label, &token).await
}

#[tauri::command]
async fn reconnect_integration(app: AppHandle, id: String, token: String) -> Result<(), String> {
    let token = zeroize::Zeroizing::new(token);
    integrations::reconnect(&integration_settings_path(&app)?, &id, &token).await
}

#[tauri::command]
fn disconnect_integration(app: AppHandle, id: String) -> Result<(), String> {
    integrations::disconnect(&integration_settings_path(&app)?, &id)
}

#[tauri::command]
async fn bitbucket_repositories(app: AppHandle, id: String, start: u64, search: Option<String>) -> Result<serde_json::Value, String> {
    integrations::bitbucket_repositories(&integration_settings_path(&app)?, &id, start, search.as_deref().unwrap_or("")).await
}

#[tauri::command]
async fn bitbucket_pull_requests(app: AppHandle, id: String, project: String, slug: String, start: u64) -> Result<serde_json::Value, String> {
    integrations::bitbucket_pull_requests(&integration_settings_path(&app)?, &id, &project, &slug, start).await
}

#[tauri::command]
async fn bitbucket_pull_request(app: AppHandle, id: String, project: String, slug: String, number: u64) -> Result<serde_json::Value, String> {
    integrations::bitbucket_pull_request(&integration_settings_path(&app)?, &id, &project, &slug, number).await
}

#[tauri::command]
async fn bitbucket_review(app: AppHandle, id: String, project: String, slug: String, number: u64) -> Result<serde_json::Value, String> {
    integrations::bitbucket_review(&integration_settings_path(&app)?, &id, &project, &slug, number).await
}

#[tauri::command]
async fn bitbucket_review_action(app: AppHandle, id: String, project: String, slug: String, number: u64, head: String, base: String, action: String, body: Option<String>, anchor: Option<integrations::ReviewAnchor>) -> Result<(), String> {
    integrations::bitbucket_review_action(&integration_settings_path(&app)?, &id, &project, &slug, number, &head, &base, &action, body.as_deref(), anchor).await
}

#[tauri::command]
async fn create_bitbucket_pull_request(app: AppHandle, id: String, project: String, slug: String, pull_request: integrations::NewPullRequest) -> Result<serde_json::Value, String> {
    integrations::create_bitbucket_pull_request(&integration_settings_path(&app)?, &id, &project, &slug, &pull_request).await
}

#[tauri::command]
async fn list_ssh_keys() -> Result<Vec<ssh_native::SshPublicKey>, String> {
    tauri::async_runtime::spawn_blocking(ssh_native::list_public_keys).await.map_err(|error| error.to_string())?
}

#[tauri::command]
async fn copy_ssh_public_key(public_key: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || ssh_native::copy_public_key(&public_key)).await.map_err(|error| error.to_string())?
}

#[tauri::command]
async fn generate_ssh_key(name: String, comment: String, passphrase: String) -> Result<String, String> {
    let passphrase = zeroize::Zeroizing::new(passphrase);
    tauri::async_runtime::spawn_blocking(move || ssh_native::generate_key(&name, &comment, &passphrase)).await.map_err(|error| error.to_string())?
}

#[tauri::command]
async fn test_ssh_remote(remote: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || ssh_native::test_remote(&remote)).await.map_err(|error| error.to_string())?
}

#[tauri::command]
async fn native_git_request(operation: String, input: serde_json::Value) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || git_core::dispatch(&operation, &input))
        .await.map_err(|error| error.to_string())?
}

// The destination comes only from the native save dialog, never from the webview.
#[tauri::command]
async fn export_settings_backup(app: AppHandle, content: String) -> Result<bool, String> {
    if content.len() > 32_768 { return Err("The settings backup is too large.".into()); }
    let data: serde_json::Value = serde_json::from_str(&content).map_err(|_| "Invalid settings backup.")?;
    if data.get("format").and_then(|v| v.as_str()) != Some("gitter-settings")
        || data.get("version").and_then(|v| v.as_u64()) != Some(1)
        || !data.get("settings").is_some_and(|v| v.is_object()) {
        return Err("Invalid settings backup.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app.dialog().file().set_title("Save Gitter settings")
            .set_file_name("gitter-settings.json").add_filter("JSON", &["json"]).blocking_save_file();
        match selected {
            None => Ok(false),
            Some(file) => {
                let path = file.into_path().map_err(|error| error.to_string())?;
                std::fs::write(path, content).map_err(|error| error.to_string())?;
                Ok(true)
            }
        }
    }).await.map_err(|error| error.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Backend::default())
        .invoke_handler(tauri::generate_handler![
            list_integrations, connect_integration, reconnect_integration, disconnect_integration,
            bitbucket_repositories, bitbucket_pull_requests, bitbucket_pull_request, create_bitbucket_pull_request, bitbucket_review, bitbucket_review_action,
            list_ssh_keys, copy_ssh_public_key, generate_ssh_key, test_ssh_remote, native_git_request, export_settings_backup
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(message) = run_backend(&handle).await {
                    if !handle.state::<Backend>().exiting.load(Ordering::SeqCst) {
                        handle
                            .dialog()
                            .message(format!("{message}\n\nDetails are in {}.", log_path(&handle)))
                            .title("Gitter")
                            .kind(MessageDialogKind::Error)
                            .blocking_show();
                        handle.exit(1);
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Gitter")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                let backend = app.state::<Backend>();
                backend.exiting.store(true, Ordering::SeqCst);
                let child = backend.child.lock().unwrap().take();
                if let Some(child) = child {
                    let _ = child.kill();
                }
            }
        });
}

fn log_path(app: &AppHandle) -> String {
    app.path()
        .app_log_dir()
        .map(|dir| dir.join("gitter-server.log").display().to_string())
        .unwrap_or_else(|_| "the app log folder".into())
}

/// Starts the backend, opens the window once it is ready, and returns only if
/// the backend fails to start or stops while the app is running.
async fn run_backend(app: &AppHandle) -> Result<(), String> {
    let command = app
        .shell()
        .sidecar("gitter-server")
        .map_err(|e| format!("Gitter's backend is missing from this install: {e}"))?
        .args(["--desktop", &format!("--parent-pid={}", std::process::id())]);
    // Finder-launched apps may not inherit the shell's Homebrew paths. Git,
    // gh and configured credential helpers should still be discoverable.
    #[cfg(target_os = "macos")]
    let command = {
        let inherited = std::env::var_os("PATH").unwrap_or_default();
        let paths = [std::path::PathBuf::from("/opt/homebrew/bin"), std::path::PathBuf::from("/usr/local/bin")]
            .into_iter().chain(std::env::split_paths(&inherited));
        command.env("PATH", std::env::join_paths(paths).map_err(|e| e.to_string())?)
    };
    let (mut events, child) = command
        .spawn()
        .map_err(|e| format!("Gitter could not start its backend: {e}"))?;
    app.state::<Backend>().child.lock().unwrap().replace(child);

    let mut log = app.path().app_log_dir().ok().and_then(|dir| {
        std::fs::create_dir_all(&dir).ok()?;
        std::fs::File::create(dir.join("gitter-server.log")).ok()
    });
    let mut window_open = false;

    while let Some(event) = events.recv().await {
        match event {
            CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                let line = String::from_utf8_lossy(&bytes);
                if let Some(file) = log.as_mut() {
                    // The ready message contains the per-launch backend token.
                    // Keep it out of the persistent application log.
                    if !line.trim().starts_with("GITTER_READY ") {
                        let _ = writeln!(file, "{}", line.trim_end());
                    }
                }
                if !window_open {
                    if let Some(ready) = line.trim().strip_prefix("GITTER_READY ") {
                        let ready: Ready = serde_json::from_str(ready)
                            .map_err(|e| format!("Gitter's backend sent an unreadable start message: {e}"))?;
                        open_main_window(app, &ready)?;
                        window_open = true;
                    }
                }
            }
            CommandEvent::Terminated(status) => {
                return Err(if window_open {
                    format!("Gitter's backend stopped unexpectedly (exit code {:?}).", status.code)
                } else {
                    format!("Gitter's backend exited before it was ready (exit code {:?}).", status.code)
                });
            }
            _ => {}
        }
    }
    Ok(())
}

fn open_main_window(app: &AppHandle, ready: &Ready) -> Result<(), String> {
    let location = serde_json::json!({
        "baseUrl": format!("http://127.0.0.1:{}/api", ready.port),
        "token": ready.token,
    });
    let config = app
        .config()
        .app
        .windows
        .first()
        .ok_or("tauri.conf.json defines no window")?;
    WebviewWindowBuilder::from_config(app, config)
        .map_err(|e| e.to_string())?
        .initialization_script(&format!("window.__GITTER_BACKEND__ = {location};"))
        .build()
        .map_err(|e| format!("Gitter could not open its window: {e}"))?;
    Ok(())
}
