-- MediaDoh Database Schema
-- SQLite database for music library metadata

-- Songs table - main track metadata
CREATE TABLE IF NOT EXISTS songs (
    id TEXT PRIMARY KEY NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_hash TEXT,  -- SHA256 for sync comparison
    
    -- Core metadata
    title TEXT NOT NULL,
    artist TEXT,
    album_artist TEXT,
    album TEXT,
    track_number INTEGER,
    track_total INTEGER,
    disc_number INTEGER,
    disc_total INTEGER,
    year INTEGER,
    genre TEXT,
    composer TEXT,
    
    -- Audio properties
    duration_ms INTEGER NOT NULL,
    sample_rate INTEGER,
    bit_depth INTEGER,
    bitrate INTEGER,
    channels INTEGER,
    format TEXT NOT NULL,  -- mp3, flac, alac, etc.
    is_lossless INTEGER NOT NULL DEFAULT 0,
    
    -- Album art
    has_embedded_art INTEGER NOT NULL DEFAULT 0,
    art_cache_path TEXT,
    
    -- Timestamps
    date_added TEXT NOT NULL,
    date_modified TEXT NOT NULL,
    last_played TEXT,
    play_count INTEGER NOT NULL DEFAULT 0,
    
    -- Sync status
    sync_status TEXT NOT NULL DEFAULT 'not_synced',  -- not_synced, synced, update_needed
    synced_to_device TEXT,  -- device identifier
    synced_at TEXT,
    
    -- Rating (0-5 stars, 0 = unrated)
    rating INTEGER NOT NULL DEFAULT 0,
    
    -- Full-text search
    search_text TEXT  -- concatenated searchable fields
);

-- Albums table - aggregated album data
CREATE TABLE IF NOT EXISTS albums (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    artist TEXT,
    album_artist TEXT,
    year INTEGER,
    genre TEXT,
    track_count INTEGER NOT NULL DEFAULT 0,
    total_duration_ms INTEGER NOT NULL DEFAULT 0,
    art_cache_path TEXT,
    date_added TEXT NOT NULL,
    
    UNIQUE(title, album_artist)
);

-- Artists table
CREATE TABLE IF NOT EXISTS artists (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    album_count INTEGER NOT NULL DEFAULT 0,
    track_count INTEGER NOT NULL DEFAULT 0,
    date_added TEXT NOT NULL
);

-- Playlists table
CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    track_count INTEGER NOT NULL DEFAULT 0,
    total_duration_ms INTEGER NOT NULL DEFAULT 0,
    date_created TEXT NOT NULL,
    date_modified TEXT NOT NULL,
    is_smart_playlist INTEGER NOT NULL DEFAULT 0,
    smart_criteria TEXT  -- JSON for smart playlist rules
);

-- Playlist entries - many-to-many relationship
CREATE TABLE IF NOT EXISTS playlist_entries (
    id TEXT PRIMARY KEY NOT NULL,
    playlist_id TEXT NOT NULL,
    song_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    date_added TEXT NOT NULL,
    
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
    UNIQUE(playlist_id, song_id)
);

-- Devices table - connected Walkman devices
CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    device_type TEXT NOT NULL,  -- walkman_internal, walkman_sdcard, other
    mount_path TEXT,
    music_folder TEXT,
    total_space INTEGER,
    free_space INTEGER,
    last_connected TEXT,
    sync_enabled INTEGER NOT NULL DEFAULT 1
);

-- Sync history
CREATE TABLE IF NOT EXISTS sync_history (
    id TEXT PRIMARY KEY NOT NULL,
    device_id TEXT NOT NULL,
    song_id TEXT NOT NULL,
    action TEXT NOT NULL,  -- copy, delete, update
    status TEXT NOT NULL,  -- pending, success, failed
    error_message TEXT,
    timestamp TEXT NOT NULL,
    
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

-- App settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Library folders - watched directories
CREATE TABLE IF NOT EXISTS library_folders (
    id TEXT PRIMARY KEY NOT NULL,
    path TEXT NOT NULL UNIQUE,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    last_scan TEXT,
    file_count INTEGER NOT NULL DEFAULT 0,
    date_added TEXT NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_songs_album ON songs(album);
CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);
CREATE INDEX IF NOT EXISTS idx_songs_album_artist ON songs(album_artist);
CREATE INDEX IF NOT EXISTS idx_songs_genre ON songs(genre);
CREATE INDEX IF NOT EXISTS idx_songs_year ON songs(year);
CREATE INDEX IF NOT EXISTS idx_songs_sync_status ON songs(sync_status);
CREATE INDEX IF NOT EXISTS idx_songs_file_path ON songs(file_path);
CREATE INDEX IF NOT EXISTS idx_songs_search ON songs(search_text);

CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(album_artist);
CREATE INDEX IF NOT EXISTS idx_albums_year ON albums(year);

CREATE INDEX IF NOT EXISTS idx_playlist_entries_playlist ON playlist_entries(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_entries_song ON playlist_entries(song_id);
CREATE INDEX IF NOT EXISTS idx_playlist_entries_position ON playlist_entries(playlist_id, position);

CREATE INDEX IF NOT EXISTS idx_sync_history_device ON sync_history(device_id);
CREATE INDEX IF NOT EXISTS idx_sync_history_timestamp ON sync_history(timestamp);

-- Full-text search virtual table
CREATE VIRTUAL TABLE IF NOT EXISTS songs_fts USING fts5(
    title,
    artist,
    album_artist,
    album,
    genre,
    composer,
    content='songs',
    content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS songs_ai AFTER INSERT ON songs BEGIN
    INSERT INTO songs_fts(rowid, title, artist, album_artist, album, genre, composer)
    VALUES (NEW.rowid, NEW.title, NEW.artist, NEW.album_artist, NEW.album, NEW.genre, NEW.composer);
END;

CREATE TRIGGER IF NOT EXISTS songs_ad AFTER DELETE ON songs BEGIN
    INSERT INTO songs_fts(songs_fts, rowid, title, artist, album_artist, album, genre, composer)
    VALUES ('delete', OLD.rowid, OLD.title, OLD.artist, OLD.album_artist, OLD.album, OLD.genre, OLD.composer);
END;

CREATE TRIGGER IF NOT EXISTS songs_au AFTER UPDATE ON songs BEGIN
    INSERT INTO songs_fts(songs_fts, rowid, title, artist, album_artist, album, genre, composer)
    VALUES ('delete', OLD.rowid, OLD.title, OLD.artist, OLD.album_artist, OLD.album, OLD.genre, OLD.composer);
    INSERT INTO songs_fts(rowid, title, artist, album_artist, album, genre, composer)
    VALUES (NEW.rowid, NEW.title, NEW.artist, NEW.album_artist, NEW.album, NEW.genre, NEW.composer);
END;
