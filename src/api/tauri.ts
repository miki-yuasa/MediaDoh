/**
 * MediaBo - Tauri API bindings
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
 * Stop the current library scan
 */
export async function stopScan(): Promise<void> {
  return invoke("stop_scan");
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

/**
 * Clear the library index (removes all songs from database, not files)
 * Returns the number of songs removed
 */
export async function clearLibrary(): Promise<number> {
  return invoke<number>("clear_library");
}

/**
 * Delete specific songs from the library index
 * Returns the number of songs removed
 */
export async function deleteSongs(songIds: string[]): Promise<number> {
  return invoke<number>("delete_songs", { songIds });
}

/**
 * Metadata update payload
 */
export interface SongMetadataUpdate {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  trackNumber?: number;
  trackTotal?: number;
  discNumber?: number;
  discTotal?: number;
  year?: number;
  genre?: string;
}

/**
 * Update song metadata in the database
 */
export async function updateSongMetadata(
  songId: string,
  metadata: SongMetadataUpdate
): Promise<Song> {
  return invoke<Song>("update_song_metadata", { songId, metadata });
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
export function onSongAdded(
  callback: (song: Song) => void
): Promise<UnlistenFn> {
  return listen<Song>("song-added", (event) => callback(event.payload));
}

/**
 * Listen for scan progress events
 */
export function onScanProgress(
  callback: (progress: ScanProgress) => void
): Promise<UnlistenFn> {
  return listen<ScanProgress>("scan-progress", (event) =>
    callback(event.payload)
  );
}

/**
 * Listen for scan started events
 */
export function onScanStarted(
  callback: (path: string) => void
): Promise<UnlistenFn> {
  return listen<string>("scan-started", (event) => callback(event.payload));
}

/**
 * Listen for scan completed events
 */
export function onScanCompleted(
  callback: (count: number) => void
): Promise<UnlistenFn> {
  return listen<number>("scan-completed", (event) => callback(event.payload));
}

/**
 * Listen for scan cancelled events
 */
export function onScanCancelled(
  callback: (count: number) => void
): Promise<UnlistenFn> {
  return listen<number>("scan-cancelled", (event) => callback(event.payload));
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
 * Seek to a specific position in milliseconds
 * @param preservePause If true, maintains paused state when seeking while paused
 */
export async function seekTo(
  positionMs: number,
  preservePause: boolean = true
): Promise<void> {
  return invoke("seek_to", { positionMs, preserve_pause: preservePause });
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

// ============================================================================
// OneDrive API
// ============================================================================

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
}

/**
 * Start OneDrive device code authentication flow
 * Returns info for user to authenticate at microsoft.com/devicelogin
 */
export async function startOneDriveAuth(): Promise<DeviceCodeResponse> {
  return invoke<DeviceCodeResponse>("onedrive_start_auth");
}

/**
 * Poll for OneDrive authentication completion
 * Returns true if authenticated, false if still pending
 */
export async function pollOneDriveAuth(deviceCode: string): Promise<boolean> {
  return invoke<boolean>("onedrive_poll_auth", { deviceCode });
}

/**
 * Check if user is authenticated with OneDrive
 */
export async function isOneDriveAuthenticated(): Promise<boolean> {
  return invoke<boolean>("onedrive_is_authenticated");
}

/**
 * Disconnect from OneDrive
 */
export async function disconnectOneDrive(): Promise<void> {
  return invoke("onedrive_disconnect");
}

/**
 * Set OneDrive client ID
 */
export async function setOneDriveClientId(clientId: string): Promise<void> {
  return invoke("onedrive_set_client_id", { clientId });
}

// ============================================================================
// Playlist API
// ============================================================================

import type { Playlist } from "@/types";

/**
 * Get all playlists
 */
export async function getPlaylists(): Promise<Playlist[]> {
  return invoke<Playlist[]>("get_playlists");
}

/**
 * Create a new playlist
 */
export async function createPlaylist(
  name: string,
  description?: string
): Promise<Playlist> {
  return invoke<Playlist>("create_playlist", { name, description });
}

/**
 * Update a playlist
 */
export async function updatePlaylist(
  playlistId: string,
  name: string,
  description?: string
): Promise<Playlist> {
  return invoke<Playlist>("update_playlist", { playlistId, name, description });
}

/**
 * Delete a playlist
 */
export async function deletePlaylist(playlistId: string): Promise<void> {
  return invoke("delete_playlist", { playlistId });
}

/**
 * Get songs in a playlist
 */
export async function getPlaylistSongs(playlistId: string): Promise<Song[]> {
  return invoke<Song[]>("get_playlist_songs", { playlistId });
}

/**
 * Add a song to a playlist
 */
export async function addSongToPlaylist(
  playlistId: string,
  songId: string
): Promise<void> {
  return invoke("add_song_to_playlist", { playlistId, songId });
}

/**
 * Add multiple songs to a playlist
 */
export async function addSongsToPlaylist(
  playlistId: string,
  songIds: string[]
): Promise<void> {
  return invoke("add_songs_to_playlist", { playlistId, songIds });
}

/**
 * Remove a song from a playlist
 */
export async function removeSongFromPlaylist(
  playlistId: string,
  songId: string
): Promise<void> {
  return invoke("remove_song_from_playlist", { playlistId, songId });
}

/**
 * Reorder songs in a playlist
 */
export async function reorderPlaylistSongs(
  playlistId: string,
  songIds: string[]
): Promise<void> {
  return invoke("reorder_playlist_songs", { playlistId, songIds });
}

/**
 * Export playlist to M3U file
 */
export async function exportPlaylistM3U(
  playlistId: string,
  filePath: string
): Promise<void> {
  return invoke("export_playlist_m3u", { playlistId, filePath });
}

/**
 * Import playlist from M3U file
 */
export async function importPlaylistM3U(filePath: string): Promise<Playlist> {
  return invoke<Playlist>("import_playlist_m3u", { filePath });
}

/**
 * Get OneDrive client ID
 */
export async function getOneDriveClientId(): Promise<string> {
  return invoke<string>("onedrive_get_client_id");
}
