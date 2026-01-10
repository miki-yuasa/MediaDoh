//! MediaDoh (Media道) - Music management application for Sony Walkman
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
use tauri::Manager;
use tokio::sync::RwLock;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    log::info!("Starting MediaDoh...");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
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

            log::info!("MediaDoh initialized successfully");
            Ok(())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
