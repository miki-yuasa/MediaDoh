//! MediaDoh - Device detection module for Walkman and external storage

use crate::error::Result;
use crate::models::{Device, DeviceType};
use chrono::Utc;
use std::path::PathBuf;
use sysinfo::Disks;
use uuid::Uuid;

/// Known Walkman volume names and identifiers
const WALKMAN_IDENTIFIERS: &[&str] = &[
    "WALKMAN",
    "NW-",
    "Sony",
    "SONY",
];

/// Detect connected external volumes that might be Walkman devices
pub fn detect_devices() -> Result<Vec<Device>> {
    let disks = Disks::new_with_refreshed_list();
    let mut devices = Vec::new();

    for disk in disks.list() {
        let mount_point = disk.mount_point().to_path_buf();
        let name = disk.name().to_string_lossy().to_string();

        // Skip system volumes
        if is_system_volume(&mount_point) {
            continue;
        }

        // Check if this looks like a Walkman
        let device_type = classify_device(&name, &mount_point);

        // Check for MUSIC folder (common on Walkman devices)
        let music_folder = find_music_folder(&mount_point);

        let device = Device {
            id: Uuid::new_v4().to_string(),
            name: if name.is_empty() {
                mount_point
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("Unknown Device")
                    .to_string()
            } else {
                name
            },
            device_type,
            mount_path: Some(mount_point),
            music_folder,
            total_space: Some(disk.total_space()),
            free_space: Some(disk.available_space()),
            last_connected: Some(Utc::now()),
            sync_enabled: true,
        };

        devices.push(device);
    }

    Ok(devices)
}

/// Check if a volume is a system volume that should be skipped
fn is_system_volume(mount_point: &PathBuf) -> bool {
    let path_str = mount_point.to_string_lossy().to_lowercase();

    #[cfg(target_os = "macos")]
    {
        // Skip macOS system volumes
        path_str == "/"
            || path_str.starts_with("/system")
            || path_str.starts_with("/private")
            || path_str.contains("timemachine")
            || path_str.contains("recovery")
    }

    #[cfg(target_os = "windows")]
    {
        // Skip Windows system drive (usually C:)
        path_str == "c:\\" || path_str == "c:"
    }

    #[cfg(target_os = "linux")]
    {
        // Skip Linux system paths
        path_str == "/"
            || path_str.starts_with("/boot")
            || path_str.starts_with("/home")
            || path_str.starts_with("/snap")
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        path_str == "/"
    }
}

/// Classify a device based on its name and mount point
fn classify_device(name: &str, mount_point: &PathBuf) -> DeviceType {
    let name_upper = name.to_uppercase();
    let mount_str = mount_point.to_string_lossy().to_uppercase();

    // Check for Walkman identifiers
    for identifier in WALKMAN_IDENTIFIERS {
        if name_upper.contains(identifier) || mount_str.contains(identifier) {
            // Try to distinguish between internal storage and SD card
            if name_upper.contains("SD") || mount_str.contains("SD_CARD") {
                return DeviceType::WalkmanSdCard;
            }
            return DeviceType::WalkmanInternal;
        }
    }

    // Check if mount point contains SD card indicators
    if name_upper.contains("SD")
        || mount_str.contains("SDCARD")
        || mount_str.contains("SD_CARD")
    {
        // Could be Walkman SD card if there's also a Walkman internal storage
        return DeviceType::Other;
    }

    DeviceType::Other
}

/// Find the MUSIC folder on a device
fn find_music_folder(mount_point: &PathBuf) -> Option<PathBuf> {
    // Common music folder names on Walkman devices
    let music_folders = ["MUSIC", "Music", "music"];

    for folder_name in music_folders {
        let music_path = mount_point.join(folder_name);
        if music_path.exists() && music_path.is_dir() {
            return Some(music_path);
        }
    }

    // If no MUSIC folder exists, check if we can create one
    // Return the path where it would be
    Some(mount_point.join("MUSIC"))
}

/// Get external volume mount points based on OS
pub fn get_external_volume_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    #[cfg(target_os = "macos")]
    {
        roots.push(PathBuf::from("/Volumes"));
    }

    #[cfg(target_os = "windows")]
    {
        // On Windows, check all drive letters
        for letter in b'D'..=b'Z' {
            let drive = format!("{}:\\", letter as char);
            let path = PathBuf::from(&drive);
            if path.exists() {
                roots.push(path);
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        roots.push(PathBuf::from("/media"));
        roots.push(PathBuf::from("/mnt"));
        roots.push(PathBuf::from("/run/media"));
        
        // Also check user-specific media mounts
        if let Some(user) = std::env::var("USER").ok() {
            roots.push(PathBuf::from(format!("/media/{}", user)));
            roots.push(PathBuf::from(format!("/run/media/{}", user)));
        }
    }

    roots
}

/// Check if a path is on an external/removable device
pub fn is_external_path(path: &PathBuf) -> bool {
    let roots = get_external_volume_roots();
    let path = dunce::canonicalize(path).unwrap_or_else(|_| path.clone());

    for root in roots {
        if path.starts_with(&root) {
            return true;
        }
    }

    false
}

/// Get device info by mount path
pub fn get_device_by_path(path: &PathBuf) -> Result<Option<Device>> {
    let devices = detect_devices()?;
    let path = dunce::canonicalize(path).unwrap_or_else(|_| path.clone());

    for device in devices {
        if let Some(ref mount_path) = device.mount_path {
            if path.starts_with(mount_path) {
                return Ok(Some(device));
            }
        }
    }

    Ok(None)
}
