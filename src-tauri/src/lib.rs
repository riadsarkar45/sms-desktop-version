use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};
use std::{fs, path::Path, process::Command};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from the Rust side!", name)
}

fn downloads_directory(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .download_dir()
        .map_err(|error| format!("Unable to locate Downloads folder: {error}"))
}

#[tauri::command]
fn save_export(
    app: tauri::AppHandle,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let safe_name = Path::new(&file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "Invalid export filename".to_string())?;

    let directory = downloads_directory(&app)?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Unable to create Downloads folder: {error}"))?;

    let file_path = directory.join(safe_name);
    fs::write(&file_path, bytes)
        .map_err(|error| format!("Unable to save export: {error}"))?;

    file_path
        .to_str()
        .map(str::to_owned)
        .ok_or_else(|| "Export path contains invalid characters".to_string())
}

#[tauri::command]
fn open_downloads_folder(app: tauri::AppHandle) -> Result<(), String> {
    let directory = downloads_directory(&app)?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Unable to create Downloads folder: {error}"))?;

    Command::new("explorer.exe")
        .arg(&directory)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Unable to open Downloads folder: {error}"))
}

#[tauri::command]
fn open_exported_file(app: tauri::AppHandle, file_name: String) -> Result<(), String> {
    let safe_name = Path::new(&file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "Invalid export filename".to_string())?;

    let file_path = downloads_directory(&app)?.join(safe_name);
    if !file_path.is_file() {
        return Err(format!("Export file does not exist: {}", file_path.display()));
    }

    Command::new("explorer.exe")
        .arg(&file_path)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Unable to open exported file: {error}"))
}

fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .setup(|app| {
            // Enable automatic launch when the current user signs in.
            #[cfg(desktop)]
            {
                use tauri_plugin_autostart::ManagerExt;
                app.autolaunch().enable()?;
            }

            let launched_hidden = std::env::args().any(|arg| arg == "--hidden");

            let open_item =
                MenuItem::with_id(app, "open", "Open SM Sourcing", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let exit_item = MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_item, &separator, &exit_item])?;

            let icon = app
                .default_window_icon()
                .cloned()
                .expect("SM Sourcing default window icon is missing");

            TrayIconBuilder::with_id("sm-sourcing-tray")
                .icon(icon)
                .tooltip("SM Sourcing")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_main_window(app),
                    "exit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // Windows startup launches the process with --hidden, keeping it in the tray.
            if launched_hidden {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            save_export,
            open_downloads_folder,
            open_exported_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running SM Sourcing");
}
