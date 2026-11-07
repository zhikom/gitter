mod commands;

use commands::{get_system_info, run_git};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![run_git, get_system_info])
        .run(tauri::generate_context!())
        .expect("error while running Gitter Tauri application");
}
