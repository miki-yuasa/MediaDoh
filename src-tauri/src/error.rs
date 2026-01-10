//! MediaDoh - Error types

use thiserror::Error;

#[derive(Error, Debug)]
pub enum MediaDohError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Audio metadata error: {0}")]
    Metadata(String),

    #[error("Audio playback error: {0}")]
    Playback(String),

    #[error("File not found: {0}")]
    FileNotFound(String),

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("Device not found: {0}")]
    DeviceNotFound(String),

    #[error("Sync error: {0}")]
    Sync(String),

    #[error("Network error: {0}")]
    Network(String),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Unknown error: {0}")]
    Unknown(String),
}

// Make the error serializable for Tauri
impl serde::Serialize for MediaDohError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, MediaDohError>;
