mod commands;
mod types;

use commands::cli::run_cli_command;
use commands::fetch::fetch_url;
use commands::files::{delete_file, read_file, rename_file, search_files_content, write_file};
use commands::packages::{detect_npm_client, list_package_workspaces};
use commands::scan::scan_repository;
use commands::terminal::{
    default_interactive_shell, detect_ai_tools, kill_terminal, resize_terminal, spawn_terminal,
    write_terminal,
};

const MENU_OPEN_REPOSITORY: &str = "open_repository";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_repository,
            read_file,
            write_file,
            rename_file,
            delete_file,
            search_files_content,
            run_cli_command,
            fetch_url,
            detect_ai_tools,
            default_interactive_shell,
            spawn_terminal,
            write_terminal,
            resize_terminal,
            kill_terminal,
            list_package_workspaces,
            detect_npm_client,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri::menu::{Menu, MenuItemBuilder, SubmenuBuilder};

                let menu = Menu::default(app.handle())?;

                let open_repository =
                    MenuItemBuilder::with_id(MENU_OPEN_REPOSITORY, "Open Repository…")
                        .accelerator("CmdOrCtrl+O")
                        .build(app)?;

                let mut added_to_file = false;
                for entry in menu.items()? {
                    if let Some(sub) = entry.as_submenu() {
                        if let Ok(label) = sub.text() {
                            if label == "File" {
                                sub.prepend(&open_repository)?;
                                added_to_file = true;
                                break;
                            }
                        }
                    }
                }

                if !added_to_file {
                    let file_menu = SubmenuBuilder::new(app, "File")
                        .item(&open_repository)
                        .build()?;
                    menu.append(&file_menu)?;
                }

                app.set_menu(menu)?;
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            #[cfg(desktop)]
            {
                use tauri::Emitter;

                if event.id() == MENU_OPEN_REPOSITORY {
                    let _ = app.emit("open-repository", ());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
