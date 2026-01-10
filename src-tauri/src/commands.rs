//! MediaDoh - Tauri command handlers

use crate::database::DbPool;
use crate::devices::detect_devices;
use crate::error::Result;
use crate::models::{Device, RepeatMode, Song, ThemePreference, ViewMode};
use crate::onedrive::{OneDriveClient, OneDriveTokens};
use crate::player::{AudioPlayer, PlayerState};
use crate::scanner::{get_all_songs, scan_directory_with_options, ScanOptions};
use crate::sync::{compare_with_device, sync_to_device, SyncComparison, SyncResult};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

/// Application state managed by Tauri
pub struct AppState {
    pub db: DbPool,
    pub player: Mutex<AudioPlayer>,
    pub onedrive: Arc<OneDriveClient>,
    pub scan_cancelled: Arc<AtomicBool>,
}

/// Library folder info
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFolder {
    pub id: String,
    pub path: String,
    pub is_enabled: bool,
    pub last_scan: Option<String>,
    pub file_count: i32,
    pub date_added: String,
}

// ============================================================================
// Library Commands
// ============================================================================

/// Scan a directory for music files with progress events
#[tauri::command]
pub async fn scan_library(
    path: String,
    skip_cloud_only: Option<bool>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Vec<Song>> {
    let path = PathBuf::from(&path);

    // Reset cancellation flag before starting
    state.scan_cancelled.store(false, Ordering::SeqCst);

    // Emit scan started event
    let _ = app.emit("scan-started", &path.to_string_lossy().to_string());

    let options = ScanOptions {
        skip_cloud_only: skip_cloud_only.unwrap_or(false),
        use_onedrive_api: true,
    };

    let songs = scan_directory_with_options(
        &path,
        &state.db,
        Some(&app),
        options,
        Some(state.onedrive.clone()),
        Some(state.scan_cancelled.clone()),
    )
    .await?;

    // Emit scan completed event
    let _ = app.emit("scan-completed", songs.len());

    Ok(songs)
}

/// Stop the current library scan
#[tauri::command]
pub async fn stop_scan(state: State<'_, AppState>) -> Result<()> {
    state.scan_cancelled.store(true, Ordering::SeqCst);
    log::info!("Scan cancellation requested");
    Ok(())
}

/// Get all songs from the library
#[tauri::command]
pub async fn get_songs(state: State<'_, AppState>) -> Result<Vec<Song>> {
    let songs = get_all_songs(&state.db).await?;
    Ok(songs)
}

/// Clear the library index (delete all songs from database, not files)
#[tauri::command]
pub async fn clear_library(state: State<'_, AppState>) -> Result<u64> {
    // Delete all songs from the database
    let result = sqlx::query("DELETE FROM songs").execute(&state.db).await?;

    let deleted_count = result.rows_affected();
    log::info!(
        "Cleared library: {} songs removed from index",
        deleted_count
    );

    Ok(deleted_count)
}

/// Delete specific songs from the library index by their IDs
#[tauri::command]
pub async fn delete_songs(song_ids: Vec<String>, state: State<'_, AppState>) -> Result<u64> {
    if song_ids.is_empty() {
        return Ok(0);
    }

    // Build placeholders for the IN clause
    let placeholders: Vec<String> = (1..=song_ids.len()).map(|i| format!("${}", i)).collect();
    let query = format!(
        "DELETE FROM songs WHERE id IN ({})",
        placeholders.join(", ")
    );

    let mut query_builder = sqlx::query(&query);
    for id in &song_ids {
        query_builder = query_builder.bind(id);
    }

    let result = query_builder.execute(&state.db).await?;
    let deleted_count = result.rows_affected();

    log::info!(
        "Deleted {} songs from index (requested: {})",
        deleted_count,
        song_ids.len()
    );

    Ok(deleted_count)
}

/// Metadata update payload
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongMetadataUpdate {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_number: Option<u32>,
    pub track_total: Option<u32>,
    pub disc_number: Option<u32>,
    pub disc_total: Option<u32>,
    pub year: Option<i32>,
    pub genre: Option<String>,
}

/// Update song metadata in the database
#[tauri::command]
pub async fn update_song_metadata(
    song_id: String,
    metadata: SongMetadataUpdate,
    state: State<'_, AppState>,
) -> Result<Song> {
    // Build dynamic UPDATE query
    let mut updates = Vec::new();
    let mut values: Vec<Box<dyn std::any::Any + Send>> = Vec::new();
    let mut param_idx = 1;

    if let Some(ref title) = metadata.title {
        updates.push(format!("title = ${}", param_idx));
        param_idx += 1;
        values.push(Box::new(title.clone()));
    }
    if let Some(ref artist) = metadata.artist {
        updates.push(format!("artist = ${}", param_idx));
        param_idx += 1;
        values.push(Box::new(artist.clone()));
    }
    if let Some(ref album) = metadata.album {
        updates.push(format!("album = ${}", param_idx));
        param_idx += 1;
        values.push(Box::new(album.clone()));
    }
    if let Some(ref album_artist) = metadata.album_artist {
        updates.push(format!("album_artist = ${}", param_idx));
        param_idx += 1;
        values.push(Box::new(album_artist.clone()));
    }
    if let Some(track_number) = metadata.track_number {
        updates.push(format!("track_number = ${}", param_idx));
        param_idx += 1;
        values.push(Box::new(track_number as i32));
    }
    if let Some(track_total) = metadata.track_total {
        updates.push(format!("track_total = ${}", param_idx));
        param_idx += 1;
        values.push(Box::new(track_total as i32));
    }
    if let Some(disc_number) = metadata.disc_number {
        updates.push(format!("disc_number = ${}", param_idx));
        param_idx += 1;
        values.push(Box::new(disc_number as i32));
    }
    if let Some(disc_total) = metadata.disc_total {
        updates.push(format!("disc_total = ${}", param_idx));
        param_idx += 1;
        values.push(Box::new(disc_total as i32));
    }
    if let Some(year) = metadata.year {
        updates.push(format!("year = ${}", param_idx));
        param_idx += 1;
        values.push(Box::new(year));
    }
    if let Some(ref genre) = metadata.genre {
        updates.push(format!("genre = ${}", param_idx));
        param_idx += 1;
        values.push(Box::new(genre.clone()));
    }

    if updates.is_empty() {
        // No updates, just return the existing song
        let songs = get_all_songs(&state.db).await?;
        return songs.into_iter().find(|s| s.id == song_id).ok_or_else(|| {
            crate::error::MediaDohError::FileNotFound(format!("Song not found: {}", song_id))
        });
    }

    // Update date_modified
    updates.push(format!("date_modified = ${}", param_idx));
    let now = chrono::Utc::now().to_rfc3339();

    // Build search text
    let search_text = format!(
        "{} {} {} {}",
        metadata.title.as_deref().unwrap_or(""),
        metadata.artist.as_deref().unwrap_or(""),
        metadata.album.as_deref().unwrap_or(""),
        metadata.album_artist.as_deref().unwrap_or("")
    );

    // Execute update using a simpler approach
    let query = format!(
        "UPDATE songs SET {} WHERE id = ${}",
        updates.join(", "),
        param_idx + 1
    );

    // Use a simpler approach - direct SQL with optional fields
    sqlx::query(
        "UPDATE songs SET 
            title = COALESCE($1, title),
            artist = COALESCE($2, artist),
            album = COALESCE($3, album),
            album_artist = COALESCE($4, album_artist),
            track_number = COALESCE($5, track_number),
            track_total = COALESCE($6, track_total),
            disc_number = COALESCE($7, disc_number),
            disc_total = COALESCE($8, disc_total),
            year = COALESCE($9, year),
            genre = COALESCE($10, genre),
            date_modified = $11
        WHERE id = $12",
    )
    .bind(&metadata.title)
    .bind(&metadata.artist)
    .bind(&metadata.album)
    .bind(&metadata.album_artist)
    .bind(metadata.track_number.map(|n| n as i32))
    .bind(metadata.track_total.map(|n| n as i32))
    .bind(metadata.disc_number.map(|n| n as i32))
    .bind(metadata.disc_total.map(|n| n as i32))
    .bind(metadata.year)
    .bind(&metadata.genre)
    .bind(&now)
    .bind(&song_id)
    .execute(&state.db)
    .await?;

    log::info!("Updated metadata for song: {}", song_id);

    // Return updated song
    let songs = get_all_songs(&state.db).await?;
    songs.into_iter().find(|s| s.id == song_id).ok_or_else(|| {
        crate::error::MediaDohError::FileNotFound(format!("Song not found: {}", song_id))
    })
}

/// Search songs by query
#[tauri::command]
pub async fn search_songs(query: String, state: State<'_, AppState>) -> Result<Vec<Song>> {
    let all_songs = get_all_songs(&state.db).await?;
    let query_lower = query.to_lowercase();

    let results: Vec<Song> = all_songs
        .into_iter()
        .filter(|song| {
            song.title.to_lowercase().contains(&query_lower)
                || song
                    .artist
                    .as_ref()
                    .map(|a| a.to_lowercase().contains(&query_lower))
                    .unwrap_or(false)
                || song
                    .album
                    .as_ref()
                    .map(|a| a.to_lowercase().contains(&query_lower))
                    .unwrap_or(false)
                || song
                    .album_artist
                    .as_ref()
                    .map(|a| a.to_lowercase().contains(&query_lower))
                    .unwrap_or(false)
        })
        .collect();

    Ok(results)
}

// ============================================================================
// Playback Commands
// ============================================================================

/// Play a song by file path
#[tauri::command]
pub async fn play_song(file_path: String, state: State<'_, AppState>) -> Result<()> {
    let path = PathBuf::from(file_path);
    let player = state.player.lock().unwrap();
    player.play(&path)?;
    Ok(())
}

/// Pause playback
#[tauri::command]
pub async fn pause(state: State<'_, AppState>) -> Result<()> {
    let player = state.player.lock().unwrap();
    player.pause()?;
    Ok(())
}

/// Resume playback
#[tauri::command]
pub async fn resume(state: State<'_, AppState>) -> Result<()> {
    let player = state.player.lock().unwrap();
    player.resume()?;
    Ok(())
}

/// Stop playback
#[tauri::command]
pub async fn stop(state: State<'_, AppState>) -> Result<()> {
    let player = state.player.lock().unwrap();
    player.stop()?;
    Ok(())
}

/// Set volume
#[tauri::command]
pub async fn set_volume(volume: f32, state: State<'_, AppState>) -> Result<()> {
    let player = state.player.lock().unwrap();
    player.set_volume(volume)?;
    Ok(())
}

/// Get player state
#[tauri::command]
pub async fn get_player_state(state: State<'_, AppState>) -> Result<PlayerState> {
    let player = state.player.lock().unwrap();
    Ok(player.get_state())
}

/// Set repeat mode
#[tauri::command]
pub async fn set_repeat_mode(mode: RepeatMode, state: State<'_, AppState>) -> Result<()> {
    let player = state.player.lock().unwrap();
    player.set_repeat_mode(mode)?;
    Ok(())
}

// ============================================================================
// Device Commands
// ============================================================================

/// Detect connected devices
#[tauri::command]
pub async fn get_devices() -> Result<Vec<Device>> {
    let devices = detect_devices()?;
    Ok(devices)
}

/// Compare library with device for sync
#[tauri::command]
pub async fn compare_device(
    device_path: String,
    state: State<'_, AppState>,
) -> Result<SyncComparison> {
    let path = PathBuf::from(device_path);
    let comparison = compare_with_device(&state.db, &path).await?;
    Ok(comparison)
}

/// Sync songs to device
#[tauri::command]
pub async fn sync_songs(
    device_path: String,
    song_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<SyncResult>> {
    let path = PathBuf::from(device_path);
    let results = sync_to_device(&state.db, &path, &song_ids).await?;
    Ok(results)
}

// ============================================================================
// Settings Commands
// ============================================================================

/// Get a setting value
#[tauri::command]
pub async fn get_setting(key: String, state: State<'_, AppState>) -> Result<Option<String>> {
    let result = sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(&key)
        .fetch_optional(&state.db)
        .await?;

    Ok(result)
}

/// Set a setting value
#[tauri::command]
pub async fn set_setting(key: String, value: String, state: State<'_, AppState>) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?",
    )
    .bind(&key)
    .bind(&value)
    .bind(&now)
    .bind(&value)
    .bind(&now)
    .execute(&state.db)
    .await?;

    Ok(())
}

/// Get theme preference
#[tauri::command]
pub async fn get_theme(state: State<'_, AppState>) -> Result<ThemePreference> {
    let result = get_setting("theme".to_string(), state).await?;
    Ok(match result.as_deref() {
        Some("light") => ThemePreference::Light,
        Some("dark") => ThemePreference::Dark,
        _ => ThemePreference::System,
    })
}

/// Set theme preference
#[tauri::command]
pub async fn set_theme(theme: ThemePreference, state: State<'_, AppState>) -> Result<()> {
    let value = match theme {
        ThemePreference::Light => "light",
        ThemePreference::Dark => "dark",
        ThemePreference::System => "system",
    };
    set_setting("theme".to_string(), value.to_string(), state).await
}

/// Get view mode
#[tauri::command]
pub async fn get_view_mode(state: State<'_, AppState>) -> Result<ViewMode> {
    let result = get_setting("view_mode".to_string(), state).await?;
    Ok(match result.as_deref() {
        Some("grid") => ViewMode::Grid,
        _ => ViewMode::List,
    })
}

/// Set view mode
#[tauri::command]
pub async fn set_view_mode(mode: ViewMode, state: State<'_, AppState>) -> Result<()> {
    let value = match mode {
        ViewMode::List => "list",
        ViewMode::Grid => "grid",
    };
    set_setting("view_mode".to_string(), value.to_string(), state).await
}

// ============================================================================
// Library Folder Commands
// ============================================================================

/// Get all library folders
#[tauri::command]
pub async fn get_library_folders(state: State<'_, AppState>) -> Result<Vec<LibraryFolder>> {
    let rows = sqlx::query_as::<_, (String, String, i32, Option<String>, i32, String)>(
        "SELECT id, path, is_enabled, last_scan, file_count, date_added FROM library_folders ORDER BY date_added"
    )
    .fetch_all(&state.db)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(id, path, is_enabled, last_scan, file_count, date_added)| LibraryFolder {
                id,
                path,
                is_enabled: is_enabled != 0,
                last_scan,
                file_count,
                date_added,
            },
        )
        .collect())
}

/// Add a library folder
#[tauri::command]
pub async fn add_library_folder(path: String, state: State<'_, AppState>) -> Result<LibraryFolder> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO library_folders (id, path, is_enabled, file_count, date_added) VALUES (?, ?, 1, 0, ?)"
    )
    .bind(&id)
    .bind(&path)
    .bind(&now)
    .execute(&state.db)
    .await?;

    Ok(LibraryFolder {
        id,
        path,
        is_enabled: true,
        last_scan: None,
        file_count: 0,
        date_added: now,
    })
}

/// Remove a library folder
#[tauri::command]
pub async fn remove_library_folder(id: String, state: State<'_, AppState>) -> Result<()> {
    sqlx::query("DELETE FROM library_folders WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await?;
    Ok(())
}

/// Set default library folder (the one that auto-scans)
#[tauri::command]
pub async fn set_default_library_folder(path: String, state: State<'_, AppState>) -> Result<()> {
    set_setting("default_library_folder".to_string(), path, state).await
}

/// Get default library folder
#[tauri::command]
pub async fn get_default_library_folder(state: State<'_, AppState>) -> Result<Option<String>> {
    get_setting("default_library_folder".to_string(), state).await
}

/// Scan all enabled library folders
#[tauri::command]
pub async fn scan_all_libraries(state: State<'_, AppState>, app: AppHandle) -> Result<Vec<Song>> {
    let folders = get_library_folders(state.clone()).await?;
    let mut all_songs = Vec::new();

    let options = ScanOptions::default();

    // Reset cancellation flag before starting
    state.scan_cancelled.store(false, Ordering::SeqCst);

    for folder in folders {
        // Check for cancellation between folders
        if state.scan_cancelled.load(Ordering::SeqCst) {
            log::info!("Scan all libraries cancelled by user");
            break;
        }

        if folder.is_enabled {
            let path = PathBuf::from(&folder.path);
            match scan_directory_with_options(
                &path,
                &state.db,
                Some(&app),
                options.clone(),
                Some(state.onedrive.clone()),
                Some(state.scan_cancelled.clone()),
            )
            .await
            {
                Ok(songs) => {
                    // Update folder file count
                    let count = songs.len() as i32;
                    let now = chrono::Utc::now().to_rfc3339();
                    let _ = sqlx::query(
                        "UPDATE library_folders SET file_count = file_count + ?, last_scan = ? WHERE id = ?"
                    )
                    .bind(count)
                    .bind(&now)
                    .bind(&folder.id)
                    .execute(&state.db)
                    .await;

                    all_songs.extend(songs);
                }
                Err(e) => {
                    log::error!("Failed to scan {}: {}", folder.path, e);
                }
            }
        }
    }

    Ok(all_songs)
}

// ============================================================================
// OneDrive Commands
// ============================================================================

use crate::onedrive::DeviceCodeResponse;

/// Start OneDrive Device Code authentication flow
/// Returns device code info for user to authenticate at microsoft.com/devicelogin
#[tauri::command]
pub async fn onedrive_start_auth(state: State<'_, AppState>) -> Result<DeviceCodeResponse> {
    state.onedrive.start_device_code_flow().await
}

/// Poll for OneDrive authentication completion
/// Returns true if authenticated, false if still pending
#[tauri::command]
pub async fn onedrive_poll_auth(device_code: String, state: State<'_, AppState>) -> Result<bool> {
    let result = state.onedrive.poll_device_code(&device_code).await?;

    if let Some(tokens) = result {
        // Save tokens to database for persistence
        let tokens_json = serde_json::to_string(&tokens)?;
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO settings (key, value, updated_at) VALUES ('onedrive_tokens', ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?",
        )
        .bind(&tokens_json)
        .bind(&now)
        .bind(&tokens_json)
        .bind(&now)
        .execute(&state.db)
        .await?;

        Ok(true)
    } else {
        Ok(false)
    }
}

/// Check if OneDrive is authenticated
#[tauri::command]
pub async fn onedrive_is_authenticated(state: State<'_, AppState>) -> Result<bool> {
    // Try to load tokens from database if not in memory
    if !state.onedrive.is_authenticated().await {
        let result = sqlx::query_scalar::<_, String>(
            "SELECT value FROM settings WHERE key = 'onedrive_tokens'",
        )
        .fetch_optional(&state.db)
        .await?;

        if let Some(tokens_json) = result {
            if let Ok(tokens) = serde_json::from_str::<OneDriveTokens>(&tokens_json) {
                state.onedrive.set_tokens(tokens).await;
            }
        }
    }

    Ok(state.onedrive.is_authenticated().await)
}

/// Disconnect OneDrive
#[tauri::command]
pub async fn onedrive_disconnect(state: State<'_, AppState>) -> Result<()> {
    // Clear tokens from database
    sqlx::query("DELETE FROM settings WHERE key = 'onedrive_tokens'")
        .execute(&state.db)
        .await?;

    // Clear in-memory tokens
    state.onedrive.clear_tokens().await;

    Ok(())
}

/// Set OneDrive client ID
#[tauri::command]
pub async fn onedrive_set_client_id(client_id: String, state: State<'_, AppState>) -> Result<()> {
    // Save to database for persistence
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO settings (key, value, updated_at) VALUES ('onedrive_client_id', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?",
    )
    .bind(&client_id)
    .bind(&now)
    .bind(&client_id)
    .bind(&now)
    .execute(&state.db)
    .await?;

    // Update in-memory client
    state.onedrive.set_client_id(client_id).await;

    Ok(())
}

/// Get OneDrive client ID
#[tauri::command]
pub async fn onedrive_get_client_id(state: State<'_, AppState>) -> Result<String> {
    // Try to load from database first
    let result = sqlx::query_scalar::<_, String>(
        "SELECT value FROM settings WHERE key = 'onedrive_client_id'",
    )
    .fetch_optional(&state.db)
    .await?;

    if let Some(client_id) = result {
        // Update in-memory client if different
        state.onedrive.set_client_id(client_id.clone()).await;
        Ok(client_id)
    } else {
        Ok(state.onedrive.get_client_id().await)
    }
}
