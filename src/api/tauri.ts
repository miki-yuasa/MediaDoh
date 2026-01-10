/**
 * MediaDoh - Tauri API bindings
 * Type-safe wrappers for Tauri commands
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  Device,
  PlayerState,
  RepeatMode,
  Song,
  SyncComparison,
  SyncResult,
  ThemePreference,
  ViewMode,
} from "@/types";

// ============================================================================
// Library API
// ============================================================================

/**
 * Scan a directory for music files
 */
export async function scanLibrary(path: string): Promise<Song[]> {
  return invoke<Song[]>("scan_library", { path });
}

/**
 * Get all songs from the library
 */
export async function getSongs(): Promise<Song[]> {
  return invoke<Song[]>("get_songs");
}

/**
 * Search songs by query
 */
export async function searchSongs(query: string): Promise<Song[]> {
  return invoke<Song[]>("search_songs", { query });
}

// ============================================================================
// Library Folder API
// ============================================================================

export interface LibraryFolder {
  id: string;
  path: string;
  isEnabled: boolean;
  lastScan: string | null;
  fileCount: number;
  dateAdded: string;
}

/**
 * Get all library folders
 */
export async function getLibraryFolders(): Promise<LibraryFolder[]> {
  return invoke<LibraryFolder[]>("get_library_folders");
}

/**
 * Add a library folder
 */
export async function addLibraryFolder(path: string): Promise<LibraryFolder> {
  return invoke<LibraryFolder>("add_library_folder", { path });
}

/**
 * Remove a library folder
 */
export async function removeLibraryFolder(id: string): Promise<void> {
  return invoke("remove_library_folder", { id });
}

/**
 * Set default library folder
 */
export async function setDefaultLibraryFolder(path: string): Promise<void> {
  return invoke("set_default_library_folder", { path });
}

/**
 * Get default library folder
 */
export async function getDefaultLibraryFolder(): Promise<string | null> {
  return invoke<string | null>("get_default_library_folder");
}

/**
 * Scan all enabled library folders
 */
export async function scanAllLibraries(): Promise<Song[]> {
  return invoke<Song[]>("scan_all_libraries");
}

// ============================================================================
// Event Listeners
// ============================================================================

export interface ScanProgress {
  scanned: number;
  currentFile: string;
}

/**
 * Listen for song added events during scanning
 */
export function onSongAdded(callback: (song: Song) => void): Promise<UnlistenFn> {
  return listen<Song>("song-added", (event) => callback(event.payload));
}

/**
 * Listen for scan progress events
 */
export function onScanProgress(callback: (progress: ScanProgress) => void): Promise<UnlistenFn> {
  return listen<ScanProgress>("scan-progress", (event) => callback(event.payload));
}

/**
 * Listen for scan started events
 */
export function onScanStarted(callback: (path: string) => void): Promise<UnlistenFn> {
  return listen<string>("scan-started", (event) => callback(event.payload));
}

/**
 * Listen for scan completed events
 */
export function onScanCompleted(callback: (count: number) => void): Promise<UnlistenFn> {
  return listen<number>("scan-completed", (event) => callback(event.payload));
}

// ============================================================================
// Playback API
// ============================================================================

/**
 * Play a song by file path
 */
export async function playSong(filePath: string): Promise<void> {
  return invoke("play_song", { filePath });
}

/**
 * Pause playback
 */
export async function pause(): Promise<void> {
  return invoke("pause");
}

/**
 * Resume playback
 */
export async function resume(): Promise<void> {
  return invoke("resume");
}

/**
 * Stop playback
 */
export async function stop(): Promise<void> {
  return invoke("stop");
}

/**
 * Set volume (0.0 to 1.0)
 */
export async function setVolume(volume: number): Promise<void> {
  return invoke("set_volume", { volume });
}

/**
 * Get current player state
 */
export async function getPlayerState(): Promise<PlayerState> {
  return invoke<PlayerState>("get_player_state");
}

/**
 * Set repeat mode
 */
export async function setRepeatMode(mode: RepeatMode): Promise<void> {
  return invoke("set_repeat_mode", { mode });
}

// ============================================================================
// Device API
// ============================================================================

/**
 * Detect connected devices
 */
export async function getDevices(): Promise<Device[]> {
  return invoke<Device[]>("get_devices");
}

/**
 * Compare library with device for sync
 */
export async function compareDevice(
  devicePath: string
): Promise<SyncComparison> {
  return invoke<SyncComparison>("compare_device", { devicePath });
}

/**
 * Sync songs to device
 */
export async function syncSongs(
  devicePath: string,
  songIds: string[]
): Promise<SyncResult[]> {
  return invoke<SyncResult[]>("sync_songs", { devicePath, songIds });
}

// ============================================================================
// Settings API
// ============================================================================

/**
 * Get a setting value
 */
export async function getSetting(key: string): Promise<string | null> {
  return invoke<string | null>("get_setting", { key });
}

/**
 * Set a setting value
 */
export async function setSetting(key: string, value: string): Promise<void> {
  return invoke("set_setting", { key, value });
}

/**
 * Get theme preference
 */
export async function getTheme(): Promise<ThemePreference> {
  return invoke<ThemePreference>("get_theme");
}

/**
 * Set theme preference
 */
export async function setTheme(theme: ThemePreference): Promise<void> {
  return invoke("set_theme", { theme });
}

/**
 * Get view mode
 */
export async function getViewMode(): Promise<ViewMode> {
  return invoke<ViewMode>("get_view_mode");
}

/**
 * Set view mode
 */
export async function setViewMode(mode: ViewMode): Promise<void> {
  return invoke("set_view_mode", { mode });
}
