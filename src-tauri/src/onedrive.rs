//! MediaDoh - OneDrive integration module
//!
//! Provides functionality to:
//! 1. Detect if files are OneDrive cloud-only placeholders
//! 2. Authenticate with Microsoft Graph API using Device Code Flow
//! 3. Fetch audio metadata from OneDrive without downloading files

use crate::error::{MediaDohError, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use std::sync::Arc;
use tokio::sync::RwLock;

/// OneDrive client ID for Microsoft Graph API
/// This is a public client ID that can be used for device code flow
/// Users can also register their own app at https://portal.azure.com
const DEFAULT_CLIENT_ID: &str = "your-client-id-here";
const GRAPH_API_BASE: &str = "https://graph.microsoft.com/v1.0";

/// Device code response from Microsoft
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: i64,
    pub interval: i64,
    pub message: String,
}

/// Cloud file status
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CloudFileStatus {
    /// File is fully available locally
    Local,
    /// File is a cloud-only placeholder (OneDrive, iCloud, etc.)
    CloudOnly,
    /// File status is unknown (treat as local)
    Unknown,
}

/// OneDrive authentication tokens
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OneDriveTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: i64,
}

/// Audio metadata from OneDrive
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OneDriveAudioMetadata {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track: Option<u32>,
    pub track_count: Option<u32>,
    pub disc: Option<u32>,
    pub disc_count: Option<u32>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub duration_ms: Option<u64>,
    pub bitrate: Option<u32>,
}

/// OneDrive file info from Graph API
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OneDriveFileInfo {
    pub id: String,
    pub name: String,
    pub size: u64,
    #[serde(default)]
    pub audio: Option<GraphAudioMetadata>,
    #[serde(default)]
    pub file: Option<GraphFileFacet>,
    #[serde(rename = "parentReference")]
    pub parent_reference: Option<GraphParentReference>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphAudioMetadata {
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub artist: Option<String>,
    pub bitrate: Option<u32>,
    pub composers: Option<String>,
    pub disc: Option<u32>,
    pub disc_count: Option<u32>,
    pub duration: Option<u64>, // in milliseconds
    pub genre: Option<String>,
    pub title: Option<String>,
    pub track: Option<u32>,
    pub track_count: Option<u32>,
    pub year: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphFileFacet {
    pub mime_type: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphParentReference {
    pub path: Option<String>,
}

/// OneDrive API client
pub struct OneDriveClient {
    http_client: Client,
    tokens: Arc<RwLock<Option<OneDriveTokens>>>,
    client_id: Arc<RwLock<String>>,
}

impl OneDriveClient {
    /// Create a new OneDrive client
    pub fn new(client_id: Option<String>) -> Self {
        Self {
            http_client: Client::new(),
            tokens: Arc::new(RwLock::new(None)),
            client_id: Arc::new(RwLock::new(
                client_id.unwrap_or_else(|| DEFAULT_CLIENT_ID.to_string()),
            )),
        }
    }

    /// Set the client ID
    pub async fn set_client_id(&self, client_id: String) {
        let mut id = self.client_id.write().await;
        *id = client_id;
    }

    /// Get the current client ID
    pub async fn get_client_id(&self) -> String {
        self.client_id.read().await.clone()
    }

    /// Check if the client is authenticated
    pub async fn is_authenticated(&self) -> bool {
        let tokens = self.tokens.read().await;
        if let Some(ref t) = *tokens {
            let now = chrono::Utc::now().timestamp();
            t.expires_at > now
        } else {
            false
        }
    }

    /// Set tokens (loaded from storage)
    pub async fn set_tokens(&self, tokens: OneDriveTokens) {
        let mut t = self.tokens.write().await;
        *t = Some(tokens);
    }

    /// Get the current tokens
    pub async fn get_tokens(&self) -> Option<OneDriveTokens> {
        self.tokens.read().await.clone()
    }

    /// Clear tokens (disconnect)
    pub async fn clear_tokens(&self) {
        let mut t = self.tokens.write().await;
        *t = None;
    }

    /// Start Device Code Flow - returns info for user to authenticate
    /// User goes to verification_uri and enters user_code
    pub async fn start_device_code_flow(&self) -> Result<DeviceCodeResponse> {
        let client_id = self.client_id.read().await;

        // Check if client ID is configured
        if *client_id == "your-client-id-here" || client_id.is_empty() {
            return Err(MediaDohError::Network(
                "OneDrive client ID not configured. Please enter your Azure App Client ID in Settings.".to_string()
            ));
        }

        let scopes = "Files.Read Files.Read.All offline_access";

        let params = [("client_id", client_id.as_str()), ("scope", scopes)];

        let response = self
            .http_client
            .post("https://login.microsoftonline.com/common/oauth2/v2.0/devicecode")
            .form(&params)
            .send()
            .await
            .map_err(|e| MediaDohError::Network(e.to_string()))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(MediaDohError::Network(format!(
                "Device code request failed: {}",
                error_text
            )));
        }

        let device_code: DeviceCodeResponse = response
            .json::<DeviceCodeResponse>()
            .await
            .map_err(|e: reqwest::Error| MediaDohError::Network(e.to_string()))?;

        Ok(device_code)
    }

    /// Poll for tokens after user has authenticated via device code
    /// Returns Ok(Some(tokens)) when authenticated, Ok(None) if still pending
    pub async fn poll_device_code(&self, device_code: &str) -> Result<Option<OneDriveTokens>> {
        let client_id = self.client_id.read().await;
        let params = [
            ("client_id", client_id.as_str()),
            ("device_code", device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ];

        let response = self
            .http_client
            .post("https://login.microsoftonline.com/common/oauth2/v2.0/token")
            .form(&params)
            .send()
            .await
            .map_err(|e| MediaDohError::Network(e.to_string()))?;

        if response.status().is_success() {
            #[derive(Deserialize)]
            struct TokenResponse {
                access_token: String,
                refresh_token: Option<String>,
                expires_in: i64,
            }

            let token_resp: TokenResponse = response
                .json::<TokenResponse>()
                .await
                .map_err(|e: reqwest::Error| MediaDohError::Network(e.to_string()))?;

            let tokens = OneDriveTokens {
                access_token: token_resp.access_token,
                refresh_token: token_resp.refresh_token,
                expires_at: chrono::Utc::now().timestamp() + token_resp.expires_in - 60,
            };

            // Store tokens
            let mut t = self.tokens.write().await;
            *t = Some(tokens.clone());

            return Ok(Some(tokens));
        }

        // Check if authorization is pending
        #[derive(Deserialize)]
        struct ErrorResponse {
            error: String,
        }

        let error_resp: ErrorResponse = response
            .json::<ErrorResponse>()
            .await
            .map_err(|e: reqwest::Error| MediaDohError::Network(e.to_string()))?;

        match error_resp.error.as_str() {
            "authorization_pending" => Ok(None), // Still waiting for user
            "slow_down" => Ok(None),             // Need to slow down polling
            "expired_token" => Err(MediaDohError::Network("Device code expired".to_string())),
            "access_denied" => Err(MediaDohError::Network("User denied access".to_string())),
            _ => Err(MediaDohError::Network(format!(
                "Auth error: {}",
                error_resp.error
            ))),
        }
    }

    /// Refresh access token using refresh token
    pub async fn refresh_tokens(&self) -> Result<OneDriveTokens> {
        let current = self.tokens.read().await.clone();
        let refresh_token = current
            .and_then(|t| t.refresh_token)
            .ok_or_else(|| MediaDohError::Network("No refresh token available".to_string()))?;

        let client_id = self.client_id.read().await;
        let params = [
            ("client_id", client_id.as_str()),
            ("refresh_token", refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ];

        let response = self
            .http_client
            .post("https://login.microsoftonline.com/common/oauth2/v2.0/token")
            .form(&params)
            .send()
            .await
            .map_err(|e| MediaDohError::Network(e.to_string()))?;

        if !response.status().is_success() {
            return Err(MediaDohError::Network("Token refresh failed".to_string()));
        }

        #[derive(Deserialize)]
        struct TokenResponse {
            access_token: String,
            refresh_token: Option<String>,
            expires_in: i64,
        }

        let token_resp: TokenResponse = response
            .json::<TokenResponse>()
            .await
            .map_err(|e: reqwest::Error| MediaDohError::Network(e.to_string()))?;

        let tokens = OneDriveTokens {
            access_token: token_resp.access_token,
            refresh_token: token_resp.refresh_token.or(Some(refresh_token)),
            expires_at: chrono::Utc::now().timestamp() + token_resp.expires_in - 60,
        };

        let mut t = self.tokens.write().await;
        *t = Some(tokens.clone());

        Ok(tokens)
    }

    /// Get file metadata from OneDrive by path
    /// The path should be relative to OneDrive root
    pub async fn get_file_metadata(&self, onedrive_path: &str) -> Result<OneDriveFileInfo> {
        // Ensure we have valid tokens
        if !self.is_authenticated().await {
            self.refresh_tokens().await?;
        }

        let tokens = self.tokens.read().await;
        let access_token = tokens
            .as_ref()
            .map(|t| t.access_token.clone())
            .ok_or_else(|| MediaDohError::Network("Not authenticated".to_string()))?;

        // Encode the path for the URL
        let encoded_path = onedrive_path
            .split('/')
            .map(|segment| urlencoding::encode(segment).to_string())
            .collect::<Vec<_>>()
            .join("/");

        let url = format!(
            "{}/me/drive/root:/{}?$select=id,name,size,audio,file,parentReference",
            GRAPH_API_BASE, encoded_path
        );

        let response = self
            .http_client
            .get(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .map_err(|e| MediaDohError::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(MediaDohError::Network(format!(
                "Graph API error ({}): {}",
                status, error_text
            )));
        }

        let file_info: OneDriveFileInfo = response
            .json::<OneDriveFileInfo>()
            .await
            .map_err(|e: reqwest::Error| MediaDohError::Network(e.to_string()))?;

        Ok(file_info)
    }

    /// Search for audio files in a OneDrive folder
    pub async fn search_audio_files(&self, folder_path: &str) -> Result<Vec<OneDriveFileInfo>> {
        if !self.is_authenticated().await {
            self.refresh_tokens().await?;
        }

        let tokens = self.tokens.read().await;
        let access_token = tokens
            .as_ref()
            .map(|t| t.access_token.clone())
            .ok_or_else(|| MediaDohError::Network("Not authenticated".to_string()))?;

        let encoded_path = folder_path
            .split('/')
            .map(|segment| urlencoding::encode(segment).to_string())
            .collect::<Vec<_>>()
            .join("/");

        // Get all children recursively with audio metadata
        let url = format!(
            "{}/me/drive/root:/{}:/children?$select=id,name,size,audio,file,parentReference&$top=1000",
            GRAPH_API_BASE, encoded_path
        );

        let response = self
            .http_client
            .get(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .map_err(|e| MediaDohError::Network(e.to_string()))?;

        if !response.status().is_success() {
            return Err(MediaDohError::Network("Failed to list files".to_string()));
        }

        #[derive(Deserialize)]
        struct ListResponse {
            value: Vec<OneDriveFileInfo>,
            #[serde(rename = "@odata.nextLink")]
            next_link: Option<String>,
        }

        let list: ListResponse = response
            .json::<ListResponse>()
            .await
            .map_err(|e: reqwest::Error| MediaDohError::Network(e.to_string()))?;

        // Filter for audio files
        let audio_extensions = ["mp3", "flac", "m4a", "aac", "wav", "ogg", "opus", "wma"];
        let audio_files: Vec<OneDriveFileInfo> = list
            .value
            .into_iter()
            .filter(|f| {
                let ext = f.name.split('.').last().unwrap_or("").to_lowercase();
                audio_extensions.contains(&ext.as_str())
            })
            .collect();

        Ok(audio_files)
    }

    /// Get thumbnail/album art URL for a file
    pub async fn get_thumbnail_url(&self, file_id: &str) -> Result<Option<String>> {
        if !self.is_authenticated().await {
            self.refresh_tokens().await?;
        }

        let tokens = self.tokens.read().await;
        let access_token = tokens
            .as_ref()
            .map(|t| t.access_token.clone())
            .ok_or_else(|| MediaDohError::Network("Not authenticated".to_string()))?;

        let url = format!(
            "{}/me/drive/items/{}/thumbnails/0/large",
            GRAPH_API_BASE, file_id
        );

        let response = self
            .http_client
            .get(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .map_err(|e| MediaDohError::Network(e.to_string()))?;

        if !response.status().is_success() {
            return Ok(None);
        }

        #[derive(Deserialize)]
        struct ThumbnailResponse {
            url: String,
        }

        let thumb: ThumbnailResponse = response
            .json::<ThumbnailResponse>()
            .await
            .map_err(|e: reqwest::Error| MediaDohError::Network(e.to_string()))?;

        Ok(Some(thumb.url))
    }
}

/// Check if a file is a cloud-only placeholder (OneDrive, iCloud)
/// Returns the cloud status of the file
pub fn get_cloud_file_status(path: &Path) -> CloudFileStatus {
    #[cfg(target_os = "macos")]
    {
        // Method 1: Check for OneDrive extended attribute
        let output = Command::new("xattr").arg("-l").arg(path).output();

        if let Ok(output) = output {
            let attrs = String::from_utf8_lossy(&output.stdout);

            // OneDrive cloud-only files have this attribute
            if attrs.contains("com.microsoft.OneDrive.RecallOnDataAccess") {
                return CloudFileStatus::CloudOnly;
            }
        }

        // Method 2: Compare logical size vs physical blocks
        // Cloud-only files have full logical size but 0 blocks allocated
        if let Ok(output) = Command::new("stat")
            .arg("-f")
            .arg("%z %b") // size and blocks
            .arg(path)
            .output()
        {
            let stat_output = String::from_utf8_lossy(&output.stdout);
            let parts: Vec<&str> = stat_output.trim().split_whitespace().collect();
            if parts.len() == 2 {
                if let (Ok(size), Ok(blocks)) = (parts[0].parse::<u64>(), parts[1].parse::<u64>()) {
                    // If file has size but no blocks, it's cloud-only
                    if size > 0 && blocks == 0 {
                        return CloudFileStatus::CloudOnly;
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        // On Windows, check for FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS
        use std::os::windows::fs::MetadataExt;

        if let Ok(metadata) = std::fs::metadata(path) {
            let attrs = metadata.file_attributes();
            // FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS = 0x00400000
            // FILE_ATTRIBUTE_RECALL_ON_OPEN = 0x00040000
            const RECALL_ON_DATA_ACCESS: u32 = 0x00400000;
            const RECALL_ON_OPEN: u32 = 0x00040000;

            if (attrs & RECALL_ON_DATA_ACCESS) != 0 || (attrs & RECALL_ON_OPEN) != 0 {
                return CloudFileStatus::CloudOnly;
            }
        }
    }

    CloudFileStatus::Local
}

/// Convert a local OneDrive path to relative OneDrive path
/// e.g., "/Users/miki/OneDrive/Music/song.mp3" -> "Music/song.mp3"
/// e.g., "/Users/miki/Library/CloudStorage/OneDrive-UniversityofIllinois-Urbana/Music/song.mp3" -> "Music/song.mp3"
pub fn local_path_to_onedrive_path(local_path: &Path) -> Option<String> {
    let path_str = local_path.to_string_lossy();

    // macOS CloudStorage format: /Library/CloudStorage/OneDrive-AccountName/...
    // This is the most common format on modern macOS
    if path_str.contains("/Library/CloudStorage/OneDrive") {
        // Find "OneDrive" and then find the slash after the account name
        if let Some(onedrive_idx) = path_str.find("/OneDrive") {
            let after_onedrive = &path_str[onedrive_idx + 1..]; // Skip the leading /
                                                                // Find the first slash after "OneDrive-AccountName"
            if let Some(slash_idx) = after_onedrive.find('/') {
                let remaining = &after_onedrive[slash_idx + 1..];
                if !remaining.is_empty() {
                    return Some(remaining.to_string());
                }
            }
        }
    }

    // Traditional OneDrive folder patterns
    let patterns = [
        "/OneDrive/",
        "/OneDrive - ",  // Business accounts: "OneDrive - Company Name"
        "\\OneDrive\\",  // Windows
        "\\OneDrive - ", // Windows business
    ];

    for pattern in &patterns {
        if let Some(idx) = path_str.find(pattern) {
            let after_onedrive = &path_str[idx + pattern.len()..];
            // For business accounts, skip the company name folder
            if pattern.contains(" - ") {
                // Find the next path separator
                if let Some(sep_idx) = after_onedrive.find(&['/', '\\'][..]) {
                    return Some(after_onedrive[sep_idx + 1..].replace('\\', "/"));
                }
            }
            return Some(after_onedrive.replace('\\', "/"));
        }
    }

    None
}

/// Convert OneDrive Graph API metadata to our format
pub fn graph_metadata_to_audio(info: &OneDriveFileInfo) -> OneDriveAudioMetadata {
    let audio = info.audio.as_ref();

    OneDriveAudioMetadata {
        title: audio.and_then(|a| a.title.clone()).or_else(|| {
            // Fall back to filename without extension
            info.name.rsplit_once('.').map(|(name, _)| name.to_string())
        }),
        artist: audio.and_then(|a| a.artist.clone()),
        album: audio.and_then(|a| a.album.clone()),
        album_artist: audio.and_then(|a| a.album_artist.clone()),
        track: audio.and_then(|a| a.track),
        track_count: audio.and_then(|a| a.track_count),
        disc: audio.and_then(|a| a.disc),
        disc_count: audio.and_then(|a| a.disc_count),
        year: audio.and_then(|a| a.year),
        genre: audio.and_then(|a| a.genre.clone()),
        duration_ms: audio.and_then(|a| a.duration),
        bitrate: audio.and_then(|a| a.bitrate),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_local_to_onedrive_path() {
        // Traditional OneDrive path
        let path = Path::new("/Users/miki/OneDrive/Music/Artist/Album/song.mp3");
        let result = local_path_to_onedrive_path(path);
        assert_eq!(result, Some("Music/Artist/Album/song.mp3".to_string()));
    }

    #[test]
    fn test_local_to_onedrive_path_cloudstorage() {
        // macOS CloudStorage path (business/edu accounts)
        let path = Path::new("/Users/miki/Library/CloudStorage/OneDrive-UniversityofIllinois-Urbana/Music/Music/EPO/song.mp3");
        let result = local_path_to_onedrive_path(path);
        assert_eq!(result, Some("Music/Music/EPO/song.mp3".to_string()));
    }

    #[test]
    fn test_local_to_onedrive_path_personal() {
        // macOS CloudStorage path (personal account)
        let path = Path::new("/Users/miki/Library/CloudStorage/OneDrive-Personal/Music/song.mp3");
        let result = local_path_to_onedrive_path(path);
        assert_eq!(result, Some("Music/song.mp3".to_string()));
    }
}
