//! MediaDoh - Tauri command handlers

use crate::database::DbPool;
use crate::devices::detect_devices;
use crate::error::Result;
use crate::models::{Device, RepeatMode, Song, ThemePreference, ViewMode};
use crate::player::{AudioPlayer, PlayerState};
use crate::scanner::{get_all_songs, scan_directory};
use crate::sync::{compare_with_device, sync_to_device, SyncComparison, SyncResult};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

/// Application state managed by Tauri
pub struct AppState {
    pub db: DbPool,
    pub player: Mutex<AudioPlayer>,
}

// ============================================================================
// Library Commands
// ============================================================================

/// Scan a directory for music files
#[tauri::command]
pub async fn scan_library(path: String, state: State<'_, AppState>) -> Result<Vec<Song>> {
    let path = PathBuf::from(path);
    let songs = scan_directory(&path, &state.db).await?;
    Ok(songs)
}

/// Get all songs from the library
#[tauri::command]
pub async fn get_songs(state: State<'_, AppState>) -> Result<Vec<Song>> {
    let songs = get_all_songs(&state.db).await?;
    Ok(songs)
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
