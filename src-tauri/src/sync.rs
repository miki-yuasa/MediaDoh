//! MediaDoh - Walkman synchronization module

use crate::database::DbPool;
use crate::devices::get_device_by_path;
use crate::error::{MediaDohError, Result};
use crate::models::{Device, Song, SyncStatus};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use walkdir::WalkDir;

/// Sync result for a single file
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub song_id: String,
    pub action: SyncAction,
    pub success: bool,
    pub error: Option<String>,
}

/// Sync action
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SyncAction {
    Copy,
    Skip,
    Update,
    Delete,
}

/// Sync comparison result
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncComparison {
    pub to_copy: Vec<String>,      // Song IDs to copy
    pub to_update: Vec<String>,    // Song IDs to update
    pub already_synced: Vec<String>, // Song IDs already synced
    pub device: Device,
}

/// Compare local library with device to determine sync actions
pub async fn compare_with_device(pool: &DbPool, device_path: &PathBuf) -> Result<SyncComparison> {
    let device = get_device_by_path(device_path)?
        .ok_or_else(|| MediaDohError::DeviceNotFound(device_path.to_string_lossy().to_string()))?;

    let music_folder = device.music_folder.clone()
        .ok_or_else(|| MediaDohError::Sync("No music folder found on device".to_string()))?;

    // Get all songs from local library
    let songs = crate::scanner::get_all_songs(pool).await?;

    // Build a map of files on device
    let device_files = scan_device_files(&music_folder)?;

    let mut to_copy = Vec::new();
    let mut to_update = Vec::new();
    let mut already_synced = Vec::new();

    for song in songs {
        let relative_path = build_device_path(&song);
        let _device_file_path = music_folder.join(&relative_path);

        if let Some(device_file_info) = device_files.get(&relative_path) {
            // File exists on device, check if it needs updating
            if needs_update(&song, device_file_info)? {
                to_update.push(song.id);
            } else {
                already_synced.push(song.id);
            }
        } else {
            // File doesn't exist on device
            to_copy.push(song.id);
        }
    }

    Ok(SyncComparison {
        to_copy,
        to_update,
        already_synced,
        device,
    })
}

/// Info about a file on the device
#[derive(Debug)]
#[allow(dead_code)]
struct DeviceFileInfo {
    path: PathBuf,
    size: u64,
    modified: std::time::SystemTime,
}

/// Scan files on the device
fn scan_device_files(music_folder: &PathBuf) -> Result<HashMap<PathBuf, DeviceFileInfo>> {
    let mut files = HashMap::new();

    if !music_folder.exists() {
        return Ok(files);
    }

    for entry in WalkDir::new(music_folder)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file() {
            if let Ok(metadata) = fs::metadata(path) {
                let relative = path.strip_prefix(music_folder)
                    .unwrap_or(path)
                    .to_path_buf();

                files.insert(relative, DeviceFileInfo {
                    path: path.to_path_buf(),
                    size: metadata.len(),
                    modified: metadata.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH),
                });
            }
        }
    }

    Ok(files)
}

/// Build the path structure for a song on the device
/// Format: MUSIC/Artist/Album/TrackNum - Title.ext
fn build_device_path(song: &Song) -> PathBuf {
    let artist = sanitize_filename(
        song.album_artist.as_ref()
            .or(song.artist.as_ref())
            .map(|s| s.as_str())
            .unwrap_or("Unknown Artist")
    );

    let album = sanitize_filename(
        song.album.as_ref()
            .map(|s| s.as_str())
            .unwrap_or("Unknown Album")
    );

    let track_num = song.track_number.unwrap_or(0);
    let title = sanitize_filename(&song.title);
    let ext = song.format.as_str();

    let filename = if track_num > 0 {
        format!("{:02} - {}.{}", track_num, title, ext)
    } else {
        format!("{}.{}", title, ext)
    };

    PathBuf::from(artist).join(album).join(filename)
}

/// Sanitize a string for use in a filename
fn sanitize_filename(name: &str) -> String {
    let invalid_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
    let mut result = name.to_string();
    
    for ch in invalid_chars {
        result = result.replace(ch, "_");
    }

    // Trim whitespace and dots from ends
    result = result.trim().trim_matches('.').to_string();

    // Limit length
    if result.len() > 200 {
        result = result[..200].to_string();
    }

    if result.is_empty() {
        result = "Unknown".to_string();
    }

    result
}

/// Check if a file needs to be updated on the device
fn needs_update(song: &Song, device_file: &DeviceFileInfo) -> Result<bool> {
    // Compare file sizes first (fast check)
    if song.file_size != device_file.size {
        return Ok(true);
    }

    // If sizes match, compare modification times
    let local_modified = fs::metadata(&song.file_path)?
        .modified()
        .unwrap_or(std::time::SystemTime::UNIX_EPOCH);

    if local_modified > device_file.modified {
        return Ok(true);
    }

    // Files appear to be the same
    Ok(false)
}

/// Sync songs to a device
pub async fn sync_to_device(
    pool: &DbPool,
    device_path: &PathBuf,
    song_ids: &[String],
) -> Result<Vec<SyncResult>> {
    let device = get_device_by_path(device_path)?
        .ok_or_else(|| MediaDohError::DeviceNotFound(device_path.to_string_lossy().to_string()))?;

    let music_folder = device.music_folder.clone()
        .ok_or_else(|| MediaDohError::Sync("No music folder found on device".to_string()))?;

    // Ensure music folder exists
    fs::create_dir_all(&music_folder)?;

    let mut results = Vec::new();

    for song_id in song_ids {
        let result = sync_single_song(pool, song_id, &music_folder).await;
        results.push(result);
    }

    Ok(results)
}

/// Sync a single song to the device
async fn sync_single_song(
    pool: &DbPool,
    song_id: &str,
    music_folder: &PathBuf,
) -> SyncResult {
    // Get song from database
    let song = match get_song_by_id(pool, song_id).await {
        Ok(Some(s)) => s,
        Ok(None) => {
            return SyncResult {
                song_id: song_id.to_string(),
                action: SyncAction::Skip,
                success: false,
                error: Some("Song not found in library".to_string()),
            };
        }
        Err(e) => {
            return SyncResult {
                song_id: song_id.to_string(),
                action: SyncAction::Skip,
                success: false,
                error: Some(e.to_string()),
            };
        }
    };

    // Build destination path
    let relative_path = build_device_path(&song);
    let dest_path = music_folder.join(&relative_path);

    // Create parent directories
    if let Some(parent) = dest_path.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            return SyncResult {
                song_id: song_id.to_string(),
                action: SyncAction::Copy,
                success: false,
                error: Some(format!("Failed to create directory: {}", e)),
            };
        }
    }

    // Copy the file
    match fs::copy(&song.file_path, &dest_path) {
        Ok(_) => {
            // Update sync status in database
            let _ = update_sync_status(pool, song_id, SyncStatus::Synced).await;

            SyncResult {
                song_id: song_id.to_string(),
                action: SyncAction::Copy,
                success: true,
                error: None,
            }
        }
        Err(e) => SyncResult {
            song_id: song_id.to_string(),
            action: SyncAction::Copy,
            success: false,
            error: Some(format!("Failed to copy file: {}", e)),
        },
    }
}

/// Get a song by ID from the database
async fn get_song_by_id(pool: &DbPool, id: &str) -> Result<Option<Song>> {
    let songs = crate::scanner::get_all_songs(pool).await?;
    Ok(songs.into_iter().find(|s| s.id == id))
}

/// Update sync status in database
async fn update_sync_status(pool: &DbPool, song_id: &str, status: SyncStatus) -> Result<()> {
    sqlx::query("UPDATE songs SET sync_status = ?, synced_at = ? WHERE id = ?")
        .bind(status.as_str())
        .bind(chrono::Utc::now().to_rfc3339())
        .bind(song_id)
        .execute(pool)
        .await?;

    Ok(())
}

/// Export playlist as M3U file
pub fn export_playlist_m3u(
    songs: &[Song],
    output_path: &PathBuf,
    relative_to: Option<&PathBuf>,
) -> Result<()> {
    let mut content = String::from("#EXTM3U\n");

    for song in songs {
        // Extended info line
        let duration_secs = song.duration_ms / 1000;
        let artist = song.artist.as_deref().unwrap_or("Unknown Artist");
        content.push_str(&format!("#EXTINF:{},{} - {}\n", duration_secs, artist, song.title));

        // File path
        let path = if let Some(base) = relative_to {
            song.file_path
                .strip_prefix(base)
                .unwrap_or(&song.file_path)
                .to_string_lossy()
                .to_string()
        } else {
            song.file_path.to_string_lossy().to_string()
        };

        content.push_str(&path);
        content.push('\n');
    }

    fs::write(output_path, content)?;
    Ok(())
}

/// Import playlist from M3U file
pub fn import_playlist_m3u(m3u_path: &PathBuf, base_path: Option<&PathBuf>) -> Result<Vec<PathBuf>> {
    let content = fs::read_to_string(m3u_path)?;
    let mut paths = Vec::new();

    for line in content.lines() {
        let line = line.trim();

        // Skip empty lines and comments
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        // Parse the path
        let path = if let Some(base) = base_path {
            base.join(line)
        } else {
            PathBuf::from(line)
        };

        // Normalize the path
        let normalized = dunce::canonicalize(&path).unwrap_or(path);
        paths.push(normalized);
    }

    Ok(paths)
}
