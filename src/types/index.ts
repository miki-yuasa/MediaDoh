/**
 * MediaDoh TypeScript Types
 * These types mirror the Rust models for type-safe frontend development
 */

// Audio format enum
export type AudioFormat = 'mp3' | 'flac' | 'alac' | 'aac' | 'wav' | 'ogg' | 'wma' | 'unknown';

// Sync status
export type SyncStatus = 'not_synced' | 'synced' | 'update_needed' | 'pending' | 'error';

// View mode
export type ViewMode = 'list' | 'grid';

// Repeat mode
export type RepeatMode = 'off' | 'all' | 'one';

// Theme preference
export type ThemePreference = 'light' | 'dark' | 'system';

// Sort order
export type SortOrder = 'ascending' | 'descending';

// Device type
export type DeviceType = 'walkman_internal' | 'walkman_sdcard' | 'other';

// Song/Track interface
export interface Song {
  id: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  fileHash: string | null;

  // Core metadata
  title: string;
  artist: string | null;
  albumArtist: string | null;
  album: string | null;
  trackNumber: number | null;
  trackTotal: number | null;
  discNumber: number | null;
  discTotal: number | null;
  year: number | null;
  genre: string | null;
  composer: string | null;

  // Audio properties
  durationMs: number;
  sampleRate: number | null;
  bitDepth: number | null;
  bitrate: number | null;
  channels: number | null;
  format: AudioFormat;
  isLossless: boolean;

  // Album art
  hasEmbeddedArt: boolean;
  artCachePath: string | null;

  // Timestamps
  dateAdded: string;
  dateModified: string;
  lastPlayed: string | null;
  playCount: number;

  // Sync
  syncStatus: SyncStatus;
  syncedToDevice: string | null;
  syncedAt: string | null;

  // Rating (0-5)
  rating: number;
}

// Album interface
export interface Album {
  id: string;
  title: string;
  artist: string | null;
  albumArtist: string | null;
  year: number | null;
  genre: string | null;
  trackCount: number;
  totalDurationMs: number;
  artCachePath: string | null;
  dateAdded: string;
}

// Artist interface
export interface Artist {
  id: string;
  name: string;
  albumCount: number;
  trackCount: number;
  dateAdded: string;
}

// Playlist interface
export interface Playlist {
  id: string;
  name: string;
  description: string | null;
  trackCount: number;
  totalDurationMs: number;
  dateCreated: string;
  dateModified: string;
  isSmartPlaylist: boolean;
  smartCriteria: string | null;
}

// Device interface
export interface Device {
  id: string;
  name: string;
  deviceType: DeviceType;
  mountPath: string | null;
  musicFolder: string | null;
  totalSpace: number | null;
  freeSpace: number | null;
  lastConnected: string | null;
  syncEnabled: boolean;
}

// Player state interface
export interface PlayerState {
  isPlaying: boolean;
  isPaused: boolean;
  currentFile: string | null;
  positionMs: number;
  volume: number;
  repeatMode: RepeatMode;
}

// Sync comparison result
export interface SyncComparison {
  toCopy: string[];
  toUpdate: string[];
  alreadySynced: string[];
  device: Device;
}

// Sync result for a single file
export interface SyncResult {
  songId: string;
  action: 'copy' | 'skip' | 'update' | 'delete';
  success: boolean;
  error: string | null;
}

// Sort options
export type SortField = 
  | 'title'
  | 'artist'
  | 'album'
  | 'albumArtist'
  | 'year'
  | 'genre'
  | 'dateAdded'
  | 'duration'
  | 'trackNumber';

export interface SortConfig {
  field: SortField;
  order: SortOrder;
}

// Library folder
export interface LibraryFolder {
  id: string;
  path: string;
  isEnabled: boolean;
  lastScan: string | null;
  fileCount: number;
  dateAdded: string;
}

// Settings
export interface AppSettings {
  theme: ThemePreference;
  locale: string;
  volume: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  viewMode: ViewMode;
  sortBy: SortField;
  sortOrder: SortOrder;
}

// Grouped songs for list view (album grouping)
export interface SongGroup {
  album: string;
  albumArtist: string | null;
  artCachePath: string | null;
  songs: Song[];
}

// Context menu item
export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  onClick?: () => void;
}
