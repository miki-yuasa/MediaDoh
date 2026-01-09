//! MediaDoh - Library scanner module

use crate::database::DbPool;
use crate::error::{MediaDohError, Result};
use crate::models::{AudioFormat, Song, SyncStatus};
use chrono::Utc;
use lofty::prelude::*;
use lofty::probe::Probe;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use uuid::Uuid;
use walkdir::WalkDir;

/// Supported audio file extensions
const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "m4a", "alac", "aac", "wav", "ogg", "opus", "wma",
];

/// Check if a path is an audio file
fn is_audio_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| AUDIO_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Scan a directory recursively for audio files
pub async fn scan_directory(path: &PathBuf, pool: &DbPool) -> Result<Vec<Song>> {
    let path = dunce::canonicalize(path).map_err(|e| {
        MediaDohError::InvalidPath(format!("Cannot canonicalize path: {}", e))
    })?;

    log::info!("Scanning directory: {}", path.display());

    let mut songs = Vec::new();
    let walker = WalkDir::new(&path)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok());

    for entry in walker {
        let file_path = entry.path();
        if file_path.is_file() && is_audio_file(file_path) {
            match parse_audio_file(file_path).await {
                Ok(song) => {
                    // Check if song already exists in database
                    let exists = check_song_exists(pool, &song.file_path).await?;
                    if !exists {
                        insert_song(pool, &song).await?;
                        songs.push(song);
                    }
                }
                Err(e) => {
                    log::warn!("Failed to parse {}: {}", file_path.display(), e);
                }
            }
        }
    }

    log::info!("Found {} new audio files", songs.len());
    Ok(songs)
}

/// Parse audio file metadata
async fn parse_audio_file(path: &Path) -> Result<Song> {
    let path = dunce::canonicalize(path)?;
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let metadata = std::fs::metadata(&path)?;
    let file_size = metadata.len();

    // Parse audio metadata with lofty
    let tagged_file = Probe::open(&path)
        .map_err(|e| MediaDohError::Metadata(e.to_string()))?
        .read()
        .map_err(|e| MediaDohError::Metadata(e.to_string()))?;

    let properties = tagged_file.properties();
    let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());

    // Extract metadata
    let title = tag
        .and_then(|t| t.title().map(|s| s.to_string()))
        .unwrap_or_else(|| {
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Unknown")
                .to_string()
        });

    let artist = tag.and_then(|t| t.artist().map(|s| s.to_string()));
    let album_artist = tag.and_then(|t| t.get_string(&ItemKey::AlbumArtist).map(|s| s.to_string()));
    let album = tag.and_then(|t| t.album().map(|s| s.to_string()));
    let track_number = tag.and_then(|t| t.track());
    let track_total = tag.and_then(|t| t.track_total());
    let disc_number = tag.and_then(|t| t.disk());
    let disc_total = tag.and_then(|t| t.disk_total());
    let year = tag.and_then(|t| t.year()).map(|y| y as i32);
    let genre = tag.and_then(|t| t.genre().map(|s| s.to_string()));
    let composer = tag.and_then(|t| t.get_string(&ItemKey::Composer).map(|s| s.to_string()));

    // Audio properties
    let duration_ms = properties.duration().as_millis() as u64;
    let sample_rate = properties.sample_rate();
    let bit_depth = properties.bit_depth().map(|b| b as u32);
    let bitrate = properties.audio_bitrate();
    let channels = properties.channels().map(|c| c as u32);

    // Determine format
    let format = path
        .extension()
        .and_then(|e| e.to_str())
        .map(AudioFormat::from_extension)
        .unwrap_or(AudioFormat::Unknown);

    let is_lossless = format.is_lossless();

    // Check for embedded album art
    let has_embedded_art = tag.map(|t| !t.pictures().is_empty()).unwrap_or(false);

    let now = Utc::now();

    Ok(Song {
        id: Uuid::new_v4().to_string(),
        file_path: path,
        file_name,
        file_size,
        file_hash: None,
        title,
        artist,
        album_artist,
        album,
        track_number,
        track_total,
        disc_number,
        disc_total,
        year,
        genre,
        composer,
        duration_ms,
        sample_rate,
        bit_depth,
        bitrate,
        channels,
        format,
        is_lossless,
        has_embedded_art,
        art_cache_path: None,
        date_added: now,
        date_modified: now,
        last_played: None,
        play_count: 0,
        sync_status: SyncStatus::NotSynced,
        synced_to_device: None,
        synced_at: None,
        rating: 0,
    })
}

/// Calculate file hash for sync comparison
pub fn calculate_file_hash(path: &Path) -> Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];

    loop {
        let bytes_read = file.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(hex::encode(hasher.finalize()))
}

/// Check if a song already exists in the database
async fn check_song_exists(pool: &DbPool, file_path: &Path) -> Result<bool> {
    let path_str = file_path.to_string_lossy().to_string();
    let result = sqlx::query_scalar::<_, i32>("SELECT COUNT(*) FROM songs WHERE file_path = ?")
        .bind(&path_str)
        .fetch_one(pool)
        .await?;

    Ok(result > 0)
}

/// Insert a song into the database
async fn insert_song(pool: &DbPool, song: &Song) -> Result<()> {
    let file_path = song.file_path.to_string_lossy().to_string();
    let format = song.format.as_str();
    let sync_status = song.sync_status.as_str();
    let date_added = song.date_added.to_rfc3339();
    let date_modified = song.date_modified.to_rfc3339();

    // Build search text
    let search_text = [
        Some(song.title.clone()),
        song.artist.clone(),
        song.album_artist.clone(),
        song.album.clone(),
        song.genre.clone(),
        song.composer.clone(),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(" ");

    sqlx::query(
        r#"
        INSERT INTO songs (
            id, file_path, file_name, file_size, file_hash,
            title, artist, album_artist, album, track_number, track_total,
            disc_number, disc_total, year, genre, composer,
            duration_ms, sample_rate, bit_depth, bitrate, channels, format, is_lossless,
            has_embedded_art, art_cache_path,
            date_added, date_modified, last_played, play_count,
            sync_status, synced_to_device, synced_at, rating, search_text
        ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?
        )
        "#,
    )
    .bind(&song.id)
    .bind(&file_path)
    .bind(&song.file_name)
    .bind(song.file_size as i64)
    .bind(&song.file_hash)
    .bind(&song.title)
    .bind(&song.artist)
    .bind(&song.album_artist)
    .bind(&song.album)
    .bind(song.track_number.map(|n| n as i32))
    .bind(song.track_total.map(|n| n as i32))
    .bind(song.disc_number.map(|n| n as i32))
    .bind(song.disc_total.map(|n| n as i32))
    .bind(song.year)
    .bind(&song.genre)
    .bind(&song.composer)
    .bind(song.duration_ms as i64)
    .bind(song.sample_rate.map(|r| r as i32))
    .bind(song.bit_depth.map(|b| b as i32))
    .bind(song.bitrate.map(|b| b as i32))
    .bind(song.channels.map(|c| c as i32))
    .bind(format)
    .bind(song.is_lossless as i32)
    .bind(song.has_embedded_art as i32)
    .bind(song.art_cache_path.as_ref().map(|p| p.to_string_lossy().to_string()))
    .bind(&date_added)
    .bind(&date_modified)
    .bind::<Option<String>>(None)
    .bind(song.play_count as i32)
    .bind(sync_status)
    .bind(&song.synced_to_device)
    .bind::<Option<String>>(None)
    .bind(song.rating as i32)
    .bind(&search_text)
    .execute(pool)
    .await?;

    Ok(())
}

/// Get all songs from the database
pub async fn get_all_songs(pool: &DbPool) -> Result<Vec<Song>> {
    let rows = sqlx::query_as::<_, SongRow>(
        "SELECT * FROM songs ORDER BY album_artist, album, disc_number, track_number",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|r| r.into()).collect())
}

/// Database row representation
#[derive(sqlx::FromRow)]
struct SongRow {
    id: String,
    file_path: String,
    file_name: String,
    file_size: i64,
    file_hash: Option<String>,
    title: String,
    artist: Option<String>,
    album_artist: Option<String>,
    album: Option<String>,
    track_number: Option<i32>,
    track_total: Option<i32>,
    disc_number: Option<i32>,
    disc_total: Option<i32>,
    year: Option<i32>,
    genre: Option<String>,
    composer: Option<String>,
    duration_ms: i64,
    sample_rate: Option<i32>,
    bit_depth: Option<i32>,
    bitrate: Option<i32>,
    channels: Option<i32>,
    format: String,
    is_lossless: i32,
    has_embedded_art: i32,
    art_cache_path: Option<String>,
    date_added: String,
    date_modified: String,
    last_played: Option<String>,
    play_count: i32,
    sync_status: String,
    synced_to_device: Option<String>,
    synced_at: Option<String>,
    rating: i32,
    #[allow(dead_code)]
    search_text: Option<String>,
}

impl From<SongRow> for Song {
    fn from(row: SongRow) -> Self {
        Song {
            id: row.id,
            file_path: PathBuf::from(row.file_path),
            file_name: row.file_name,
            file_size: row.file_size as u64,
            file_hash: row.file_hash,
            title: row.title,
            artist: row.artist,
            album_artist: row.album_artist,
            album: row.album,
            track_number: row.track_number.map(|n| n as u32),
            track_total: row.track_total.map(|n| n as u32),
            disc_number: row.disc_number.map(|n| n as u32),
            disc_total: row.disc_total.map(|n| n as u32),
            year: row.year,
            genre: row.genre,
            composer: row.composer,
            duration_ms: row.duration_ms as u64,
            sample_rate: row.sample_rate.map(|r| r as u32),
            bit_depth: row.bit_depth.map(|b| b as u32),
            bitrate: row.bitrate.map(|b| b as u32),
            channels: row.channels.map(|c| c as u32),
            format: AudioFormat::from_extension(&row.format),
            is_lossless: row.is_lossless != 0,
            has_embedded_art: row.has_embedded_art != 0,
            art_cache_path: row.art_cache_path.map(PathBuf::from),
            date_added: chrono::DateTime::parse_from_rfc3339(&row.date_added)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            date_modified: chrono::DateTime::parse_from_rfc3339(&row.date_modified)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            last_played: row.last_played.and_then(|s| {
                chrono::DateTime::parse_from_rfc3339(&s)
                    .map(|dt| dt.with_timezone(&Utc))
                    .ok()
            }),
            play_count: row.play_count as u32,
            sync_status: SyncStatus::from_str(&row.sync_status),
            synced_to_device: row.synced_to_device,
            synced_at: row.synced_at.and_then(|s| {
                chrono::DateTime::parse_from_rfc3339(&s)
                    .map(|dt| dt.with_timezone(&Utc))
                    .ok()
            }),
            rating: row.rating as u8,
        }
    }
}
