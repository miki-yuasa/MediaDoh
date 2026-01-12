//! MediaBo - Core database models and types

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Audio format enum
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AudioFormat {
    Mp3,
    Flac,
    Alac,
    Aac,
    Wav,
    Ogg,
    Wma,
    Unknown,
}

impl AudioFormat {
    pub fn from_extension(ext: &str) -> Self {
        match ext.to_lowercase().as_str() {
            "mp3" => AudioFormat::Mp3,
            "flac" => AudioFormat::Flac,
            "m4a" | "alac" => AudioFormat::Alac,
            "aac" => AudioFormat::Aac,
            "wav" => AudioFormat::Wav,
            "ogg" | "opus" => AudioFormat::Ogg,
            "wma" => AudioFormat::Wma,
            _ => AudioFormat::Unknown,
        }
    }

    pub fn is_lossless(&self) -> bool {
        matches!(
            self,
            AudioFormat::Flac | AudioFormat::Alac | AudioFormat::Wav
        )
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            AudioFormat::Mp3 => "mp3",
            AudioFormat::Flac => "flac",
            AudioFormat::Alac => "alac",
            AudioFormat::Aac => "aac",
            AudioFormat::Wav => "wav",
            AudioFormat::Ogg => "ogg",
            AudioFormat::Wma => "wma",
            AudioFormat::Unknown => "unknown",
        }
    }
}

/// Sync status for tracks
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SyncStatus {
    #[default]
    NotSynced,
    Synced,
    UpdateNeeded,
    Pending,
    Error,
}

impl SyncStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            SyncStatus::NotSynced => "not_synced",
            SyncStatus::Synced => "synced",
            SyncStatus::UpdateNeeded => "update_needed",
            SyncStatus::Pending => "pending",
            SyncStatus::Error => "error",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "synced" => SyncStatus::Synced,
            "update_needed" => SyncStatus::UpdateNeeded,
            "pending" => SyncStatus::Pending,
            "error" => SyncStatus::Error,
            _ => SyncStatus::NotSynced,
        }
    }
}

/// Song/Track model
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Song {
    pub id: String,
    pub file_path: PathBuf,
    pub file_name: String,
    pub file_size: u64,
    pub file_hash: Option<String>,

    // Core metadata
    pub title: String,
    pub artist: Option<String>,
    pub album_artist: Option<String>,
    pub album: Option<String>,
    pub track_number: Option<u32>,
    pub track_total: Option<u32>,
    pub disc_number: Option<u32>,
    pub disc_total: Option<u32>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub composer: Option<String>,

    // Audio properties
    pub duration_ms: u64,
    pub sample_rate: Option<u32>,
    pub bit_depth: Option<u32>,
    pub bitrate: Option<u32>,
    pub channels: Option<u32>,
    pub format: AudioFormat,
    pub is_lossless: bool,

    // Album art
    pub has_embedded_art: bool,
    pub art_cache_path: Option<PathBuf>,
    /// Base64 data URI for album art (e.g., "data:image/jpeg;base64,...")
    pub artwork_data: Option<String>,

    // Timestamps
    pub date_added: DateTime<Utc>,
    pub date_modified: DateTime<Utc>,
    pub last_played: Option<DateTime<Utc>>,
    pub play_count: u32,

    // Sync
    pub sync_status: SyncStatus,
    pub synced_to_device: Option<String>,
    pub synced_at: Option<DateTime<Utc>>,

    // Rating (0-5)
    pub rating: u8,
}

/// Album model
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Album {
    pub id: String,
    pub title: String,
    pub artist: Option<String>,
    pub album_artist: Option<String>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub track_count: u32,
    pub total_duration_ms: u64,
    pub art_cache_path: Option<PathBuf>,
    pub date_added: DateTime<Utc>,
}

/// Artist model
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Artist {
    pub id: String,
    pub name: String,
    pub album_count: u32,
    pub track_count: u32,
    pub date_added: DateTime<Utc>,
}

/// Playlist model
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub track_count: u32,
    pub total_duration_ms: u64,
    pub date_created: DateTime<Utc>,
    pub date_modified: DateTime<Utc>,
    pub is_smart_playlist: bool,
    pub smart_criteria: Option<String>,
}

/// Playlist entry - song in a playlist
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistEntry {
    pub id: String,
    pub playlist_id: String,
    pub song_id: String,
    pub position: u32,
    pub date_added: DateTime<Utc>,
}

/// Device type enum
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DeviceType {
    WalkmanInternal,
    WalkmanSdCard,
    Other,
}

impl DeviceType {
    pub fn as_str(&self) -> &'static str {
        match self {
            DeviceType::WalkmanInternal => "walkman_internal",
            DeviceType::WalkmanSdCard => "walkman_sdcard",
            DeviceType::Other => "other",
        }
    }
}

/// Connected device model
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub name: String,
    pub device_type: DeviceType,
    pub mount_path: Option<PathBuf>,
    pub music_folder: Option<PathBuf>,
    pub total_space: Option<u64>,
    pub free_space: Option<u64>,
    pub last_connected: Option<DateTime<Utc>>,
    pub sync_enabled: bool,
}

/// Sync action type
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SyncAction {
    Copy,
    Delete,
    Update,
}

/// Sync status for history
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SyncHistoryStatus {
    Pending,
    Success,
    Failed,
}

/// Sync history entry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncHistoryEntry {
    pub id: String,
    pub device_id: String,
    pub song_id: String,
    pub action: SyncAction,
    pub status: SyncHistoryStatus,
    pub error_message: Option<String>,
    pub timestamp: DateTime<Utc>,
}

/// Library folder model
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFolder {
    pub id: String,
    pub path: PathBuf,
    pub is_enabled: bool,
    pub last_scan: Option<DateTime<Utc>>,
    pub file_count: u32,
    pub date_added: DateTime<Utc>,
}

/// App settings keys
pub mod settings_keys {
    pub const THEME: &str = "theme";
    pub const LOCALE: &str = "locale";
    pub const VOLUME: &str = "volume";
    pub const SHUFFLE: &str = "shuffle";
    pub const REPEAT_MODE: &str = "repeat_mode";
    pub const LAST_PLAYED_SONG: &str = "last_played_song";
    pub const LAST_POSITION: &str = "last_position";
    pub const VIEW_MODE: &str = "view_mode";
    pub const SORT_BY: &str = "sort_by";
    pub const SORT_ORDER: &str = "sort_order";
}

/// View mode for the library
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ViewMode {
    #[default]
    List,
    Grid,
}

/// Sort order
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum SortOrder {
    #[default]
    Ascending,
    Descending,
}

/// Repeat mode
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum RepeatMode {
    #[default]
    Off,
    All,
    One,
}

/// Theme preference
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ThemePreference {
    Light,
    Dark,
    #[default]
    System,
}
