// The desktop app is a window onto Gitter's backend. It starts the bundled
// backend (the `gitter-server` sidecar), waits for it to report its port and
// access token, then opens the main window with that location injected.
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
#[derive(Deserialize)]
struct Ready {
    port: u16,
    token: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Backend::default())
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
    let (mut events, child) = app
        .shell()
        .sidecar("gitter-server")
        .map_err(|e| format!("Gitter's backend is missing from this install: {e}"))?
        .args(["--desktop", &format!("--parent-pid={}", std::process::id())])
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
                    let _ = writeln!(file, "{}", line.trim_end());
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
