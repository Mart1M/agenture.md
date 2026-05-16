mod commands;
mod types;

use commands::cli::run_cli_command;
use commands::fetch::fetch_url;
use commands::git::{
    git_checkout_branch, git_commit, git_create_branch, git_file_diff, git_graph_snapshot,
    git_pull, git_push, git_restore_paths, git_stage_paths, git_working_tree,
};
use commands::files::{
    create_directory, create_skill_scaffold, delete_file, move_path, read_file, rename_file,
    search_files_content, write_file,
};
use commands::packages::{detect_npm_client, list_package_workspaces};
use commands::scan::scan_repository;
use commands::terminal::{
    default_interactive_shell, detect_ai_tools, kill_terminal, resize_terminal, spawn_terminal,
    write_terminal,
};

const MENU_OPEN_REPOSITORY: &str = "open_repository";
const MENU_SETTINGS: &str = "settings";
const MENU_SETUP_AGENTURE: &str = "setup_agenture";
const MENU_CHECK_UPDATES: &str = "check_for_updates";

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
            create_directory,
            create_skill_scaffold,
            move_path,
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
            git_graph_snapshot,
            git_working_tree,
            git_file_diff,
            git_stage_paths,
            git_restore_paths,
            git_commit,
            git_pull,
            git_push,
            git_checkout_branch,
            git_create_branch,
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

                let settings =
                    MenuItemBuilder::with_id(MENU_SETTINGS, "Settings…")
                        .accelerator("CmdOrCtrl+,")
                        .build(app)?;

                let setup_agenture =
                    MenuItemBuilder::with_id(MENU_SETUP_AGENTURE, "Setup Agenture…")
                        .build(app)?;

                let check_updates =
                    MenuItemBuilder::with_id(MENU_CHECK_UPDATES, "Check for Updates…")
                        .build(app)?;

                let mut added_to_file = false;
                for entry in menu.items()? {
                    if let Some(sub) = entry.as_submenu() {
                        if let Ok(label) = sub.text() {
                            if label == "File" {
                                sub.prepend(&check_updates)?;
                                sub.prepend(&settings)?;
                                sub.prepend(&setup_agenture)?;
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
                        .item(&setup_agenture)
                        .item(&settings)
                        .item(&check_updates)
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
                if event.id() == MENU_SETTINGS {
                    let _ = app.emit("open-settings", ());
                }
                if event.id() == MENU_SETUP_AGENTURE {
                    let _ = app.emit("open-setup-agenture", ());
                }
                if event.id() == MENU_CHECK_UPDATES {
                    let _ = app.emit("check-for-updates", ());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
