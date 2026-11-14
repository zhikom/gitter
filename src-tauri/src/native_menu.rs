//! macOS menu items delegate to the same commands as Gitter's webview.
//! The webview supplies their current enabled state, labels, and shortcuts.

use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MenuItemState {
    id: String,
    title: String,
    enabled: bool,
    accelerator: Option<String>,
}

#[cfg(target_os = "macos")]
mod macos {
    use super::MenuItemState;
    use std::collections::HashMap;
    use std::sync::Mutex;
    use tauri::menu::{AboutMetadata, MenuBuilder, MenuItem, SubmenuBuilder};
    use tauri::{App, AppHandle, Emitter, Manager, Wry};

    pub struct NativeMenu {
        items: HashMap<String, MenuItem<Wry>>,
        last: Mutex<HashMap<String, (String, bool, Option<String>)>>,
    }

    pub fn install(app: &mut App) -> tauri::Result<()> {
        let handle = app.handle();
        let mut items = HashMap::new();
        macro_rules! command {
            ($id:expr, $label:expr) => {{
                // Disabled until the webview has registered its listener and sent state.
                let item = MenuItem::with_id(handle, $id, $label, false, None::<&str>)?;
                items.insert($id.to_string(), item.clone());
                item
            }};
        }
        let about = AboutMetadata {
            name: Some("Gitter".into()),
            version: Some(handle.package_info().version.to_string()),
            ..Default::default()
        };
        let application = SubmenuBuilder::new(handle, "Gitter")
            .about(Some(about)).separator()
            .item(&command!("settings", "Settings…"))
            .item(&command!("check-updates", "Check for Updates…"))
            .separator().services().separator().hide().hide_others().show_all().separator().quit().build()?;
        let file = SubmenuBuilder::new(handle, "File")
            .item(&command!("repositories", "Open Repository…"))
            .item(&command!("new-tab", "Open Repository in New Tab…"))
            .item(&command!("close-tab", "Close Tab"))
            .separator()
            .item(&command!("reveal", "Show in Finder"))
            .item(&command!("open-in", "Open In…"))
            .build()?;
        let edit = SubmenuBuilder::new(handle, "Edit")
            .undo().redo().separator().cut().copy().paste().select_all().build()?;
        let repository = SubmenuBuilder::new(handle, "Repository")
            .item(&command!("fetch", "Fetch All Remotes"))
            .item(&command!("pull", "Pull"))
            .item(&command!("pull-rebase", "Pull with Rebase"))
            .item(&command!("push", "Push"))
            .item(&command!("push-force", "Push with Force-with-Lease"))
            .separator()
            .item(&command!("new-branch", "New Branch…"))
            .item(&command!("pull-request", "New Pull Request…"))
            .item(&command!("stash", "Stash Changes…"))
            .item(&command!("pop-stash", "Pop Latest Stash"))
            .item(&command!("stage-all", "Stage All Changes"))
            .item(&command!("undo", "Undo Last Git Action"))
            .separator()
            .item(&command!("history-search", "Search History…"))
            .item(&command!("reflog", "Reflog…"))
            .item(&command!("worktrees", "Worktrees…"))
            .build()?;
        let view = SubmenuBuilder::new(handle, "View")
            .item(&command!("toggle-sidebar", "Hide Sidebar"))
            .item(&command!("toggle-staging", "Hide Working Tree"))
            .item(&command!("toggle-assistant", "Show Assistant"))
            .item(&command!("agent-rail", "Hide Agent Rail"))
            .separator()
            .item(&command!("zoom-in", "Zoom In"))
            .item(&command!("zoom-out", "Zoom Out"))
            .item(&command!("zoom-reset", "Actual Size"))
            .separator()
            .item(&command!("palette", "Command Palette…"))
            .item(&command!("refresh", "Reload Repository"))
            .separator().fullscreen().build()?;
        let window = SubmenuBuilder::new(handle, "Window").minimize().maximize().separator().bring_all_to_front().build()?;
        let help = SubmenuBuilder::new(handle, "Help")
            .item(&command!("guide", "Gitter User Guide"))
            .build()?;
        let menu = MenuBuilder::new(handle).items(&[&application, &file, &edit, &repository, &view, &window, &help]).build()?;
        app.set_menu(menu)?;
        app.manage(NativeMenu { items, last: Mutex::new(HashMap::new()) });
        app.on_menu_event(|handle, event| {
            let id = event.id().0.as_str();
            if handle.state::<NativeMenu>().items.contains_key(id) {
                // Unknown/predefined menu items never become renderer commands.
                let _ = handle.emit_to("main", "gitter:menu-action", id.to_owned());
            }
        });
        Ok(())
    }

    pub fn sync(app: &AppHandle, updates: Vec<MenuItemState>) -> Result<(), String> {
        let menu = app.state::<NativeMenu>();
        if updates.len() > menu.items.len() { return Err("Too many menu items.".into()); }
        let mut last = menu.last.lock().map_err(|_| "Menu state is unavailable.")?;
        for update in updates {
            let Some(item) = menu.items.get(&update.id) else { continue };
            if update.title.len() > 160 || update.title.chars().any(char::is_control)
                || update.accelerator.as_ref().is_some_and(|value| value.len() > 80 || value.chars().any(char::is_control)) {
                return Err("Invalid menu item state.".into());
            }
            let state = (update.title.clone(), update.enabled, update.accelerator.clone());
            if last.get(&update.id) == Some(&state) { continue; }
            // Ampersands are mnemonics in Tauri menu text, not user-facing text.
            item.set_text(update.title.replace('&', "&&")).map_err(|e| e.to_string())?;
            item.set_enabled(update.enabled).map_err(|e| e.to_string())?;
            item.set_accelerator(update.accelerator.as_deref()).map_err(|e| e.to_string())?;
            last.insert(update.id, state);
        }
        Ok(())
    }
}

#[cfg(target_os = "macos")]
pub use macos::{install, sync};
