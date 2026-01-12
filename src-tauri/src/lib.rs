//! MediaBo (Media坊) - Music management application for Sony Walkman
//!
//! A cross-platform desktop application for managing music libraries
//! and synchronizing with Sony Walkman devices.

pub mod commands;
pub mod database;
pub mod devices;
pub mod error;
pub mod models;
pub mod onedrive;
pub mod player;
pub mod scanner;
pub mod sync;

use commands::AppState;
use database::{get_app_data_dir, init_database};
use onedrive::OneDriveClient;
use player::AudioPlayer;
use std::sync::{Arc, Mutex};
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    log::info!("Starting MediaBo...");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Build the application menu
            let app_menu = SubmenuBuilder::new(app, "MediaBo")
                .item(&PredefinedMenuItem::about(
                    app,
                    Some("About MediaBo"),
                    None,
                )?)
                .separator()
                .item(&PredefinedMenuItem::services(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::hide(app, Some("Hide MediaBo"))?)
                .item(&PredefinedMenuItem::hide_others(app, Some("Hide Others"))?)
                .item(&PredefinedMenuItem::show_all(app, Some("Show All"))?)
                .separator()
                .item(&PredefinedMenuItem::quit(app, Some("Quit MediaBo"))?)
                .build()?;

            let import_item = MenuItemBuilder::new("Import Playlist...")
                .id("import_playlist")
                .accelerator("CmdOrCtrl+I")
                .build(app)?;

            let export_item = MenuItemBuilder::new("Export Playlist...")
                .id("export_playlist")
                .accelerator("CmdOrCtrl+E")
                .build(app)?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&import_item)
                .item(&export_item)
                .separator()
                .item(&PredefinedMenuItem::close_window(
                    app,
                    Some("Close Window"),
                )?)
                .build()?;

            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .item(&PredefinedMenuItem::undo(app, None)?)
                .item(&PredefinedMenuItem::redo(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::cut(app, None)?)
                .item(&PredefinedMenuItem::copy(app, None)?)
                .item(&PredefinedMenuItem::paste(app, None)?)
                .item(&PredefinedMenuItem::select_all(app, None)?)
                .build()?;

            let view_menu = SubmenuBuilder::new(app, "View")
                .item(&PredefinedMenuItem::fullscreen(
                    app,
                    Some("Toggle Fullscreen"),
                )?)
                .build()?;

            let window_menu = SubmenuBuilder::new(app, "Window")
                .item(&PredefinedMenuItem::minimize(app, None)?)
                .item(&PredefinedMenuItem::maximize(app, Some("Zoom"))?)
                .separator()
                .item(&PredefinedMenuItem::close_window(app, None)?)
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_menu)
                .item(&file_menu)
                .item(&edit_menu)
                .item(&view_menu)
                .item(&window_menu)
                .build()?;

            app.set_menu(menu)?;

            // Initialize database
            let app_data_dir = get_app_data_dir().expect("Failed to get app data directory");

            let db = tauri::async_runtime::block_on(async {
                init_database(&app_data_dir)
                    .await
                    .expect("Failed to initialize database")
            });

            // Initialize audio player
            let player = AudioPlayer::new().expect("Failed to initialize audio player");

            // Load OneDrive client ID from database if available
            let onedrive_client_id = tauri::async_runtime::block_on(async {
                sqlx::query_scalar::<_, String>(
                    "SELECT value FROM settings WHERE key = 'onedrive_client_id'",
                )
                .fetch_optional(&db)
                .await
                .ok()
                .flatten()
            });

            // Initialize OneDrive client
            let onedrive_client = Arc::new(OneDriveClient::new(onedrive_client_id));

            // Load OneDrive tokens from database if available
            tauri::async_runtime::block_on(async {
                if let Ok(Some(tokens_json)) = sqlx::query_scalar::<_, String>(
                    "SELECT value FROM settings WHERE key = 'onedrive_tokens'",
                )
                .fetch_optional(&db)
                .await
                {
                    if let Ok(tokens) =
                        serde_json::from_str::<onedrive::OneDriveTokens>(&tokens_json)
                    {
                        onedrive_client.set_tokens(tokens).await;
                        log::info!("Loaded OneDrive tokens from database");
                    }
                }
            });

            // Create app state
            let state = AppState {
                db,
                player: Mutex::new(player),
                onedrive: onedrive_client,
                scan_cancelled: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            };

            app.manage(state);

            log::info!("MediaBo initialized successfully");
            Ok(())
        })
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "import_playlist" => {
                    // Emit event to frontend to handle import
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.emit("menu-import-playlist", ());
                    }
                }
                "export_playlist" => {
                    // Emit event to frontend to handle export
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.emit("menu-export-playlist", ());
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Library commands
            commands::scan_library,
            commands::stop_scan,
            commands::get_songs,
            commands::search_songs,
            commands::clear_library,
            commands::delete_songs,
            commands::update_song_metadata,
            // Playback commands
            commands::play_song,
            commands::pause,
            commands::resume,
            commands::stop,
            commands::seek_to,
            commands::set_volume,
            commands::get_player_state,
            commands::set_repeat_mode,
            // Device commands
            commands::get_devices,
            commands::compare_device,
            commands::sync_songs,
            // Settings commands
            commands::get_setting,
            commands::set_setting,
            commands::get_theme,
            commands::set_theme,
            commands::get_view_mode,
            commands::set_view_mode,
            // Library folder commands
            commands::get_library_folders,
            commands::add_library_folder,
            commands::remove_library_folder,
            commands::set_default_library_folder,
            commands::get_default_library_folder,
            commands::scan_all_libraries,
            // OneDrive commands
            commands::onedrive_start_auth,
            commands::onedrive_poll_auth,
            commands::onedrive_is_authenticated,
            commands::onedrive_disconnect,
            commands::onedrive_set_client_id,
            commands::onedrive_get_client_id,
            // Playlist commands
            commands::get_playlists,
            commands::create_playlist,
            commands::update_playlist,
            commands::delete_playlist,
            commands::get_playlist_songs,
            commands::add_song_to_playlist,
            commands::add_songs_to_playlist,
            commands::remove_song_from_playlist,
            commands::reorder_playlist_songs,
            commands::export_playlist_m3u,
            commands::import_playlist_m3u,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
