//! MediaDoh - Database module

use crate::error::{MediaDohError, Result};
use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use std::path::PathBuf;

pub type DbPool = Pool<Sqlite>;

/// Initialize the database connection pool and run migrations
pub async fn init_database(app_data_dir: &PathBuf) -> Result<DbPool> {
    // Ensure the directory exists
    std::fs::create_dir_all(app_data_dir)?;

    let db_path = app_data_dir.join("mediadoh.db");
    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

    log::info!("Initializing database at: {}", db_path.display());

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    // Run migrations
    run_migrations(&pool).await?;

    Ok(pool)
}

/// Run database migrations
async fn run_migrations(pool: &DbPool) -> Result<()> {
    log::info!("Running database migrations...");

    // Execute each migration statement separately for proper handling
    let migrations = get_migration_statements();
    
    for statement in migrations {
        if !statement.is_empty() {
            if let Err(e) = sqlx::query(&statement).execute(pool).await {
                let err_str = e.to_string();
                // Ignore "already exists" errors - these are expected on subsequent runs
                if !err_str.contains("already exists") && !err_str.contains("duplicate column") {
                    log::debug!("Migration note: {}", e);
                }
            }
        }
    }

    log::info!("Database migrations completed");
    Ok(())
}

/// Get migration statements - each as a complete statement
fn get_migration_statements() -> Vec<String> {
    vec![
        // Songs table
        r#"CREATE TABLE IF NOT EXISTS songs (
            id TEXT PRIMARY KEY NOT NULL,
            file_path TEXT NOT NULL UNIQUE,
            file_name TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            file_hash TEXT,
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
            duration_ms INTEGER NOT NULL,
            sample_rate INTEGER,
            bit_depth INTEGER,
            bitrate INTEGER,
            channels INTEGER,
            format TEXT NOT NULL,
            is_lossless INTEGER NOT NULL DEFAULT 0,
            has_embedded_art INTEGER NOT NULL DEFAULT 0,
            art_cache_path TEXT,
            artwork_data TEXT,
            date_added TEXT NOT NULL,
            date_modified TEXT NOT NULL,
            last_played TEXT,
            play_count INTEGER NOT NULL DEFAULT 0,
            sync_status TEXT NOT NULL DEFAULT 'not_synced',
            synced_to_device TEXT,
            synced_at TEXT,
            rating INTEGER NOT NULL DEFAULT 0,
            search_text TEXT
        )"#.to_string(),
        
        // Albums table
        r#"CREATE TABLE IF NOT EXISTS albums (
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
        )"#.to_string(),
        
        // Artists table
        r#"CREATE TABLE IF NOT EXISTS artists (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL UNIQUE,
            album_count INTEGER NOT NULL DEFAULT 0,
            track_count INTEGER NOT NULL DEFAULT 0,
            date_added TEXT NOT NULL
        )"#.to_string(),
        
        // Playlists table
        r#"CREATE TABLE IF NOT EXISTS playlists (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            track_count INTEGER NOT NULL DEFAULT 0,
            total_duration_ms INTEGER NOT NULL DEFAULT 0,
            date_created TEXT NOT NULL,
            date_modified TEXT NOT NULL,
            is_smart_playlist INTEGER NOT NULL DEFAULT 0,
            smart_criteria TEXT
        )"#.to_string(),
        
        // Playlist entries
        r#"CREATE TABLE IF NOT EXISTS playlist_entries (
            id TEXT PRIMARY KEY NOT NULL,
            playlist_id TEXT NOT NULL,
            song_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            date_added TEXT NOT NULL,
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
            UNIQUE(playlist_id, song_id)
        )"#.to_string(),
        
        // Devices table
        r#"CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            device_type TEXT NOT NULL,
            mount_path TEXT,
            music_folder TEXT,
            total_space INTEGER,
            free_space INTEGER,
            last_connected TEXT,
            sync_enabled INTEGER NOT NULL DEFAULT 1
        )"#.to_string(),
        
        // Sync history
        r#"CREATE TABLE IF NOT EXISTS sync_history (
            id TEXT PRIMARY KEY NOT NULL,
            device_id TEXT NOT NULL,
            song_id TEXT NOT NULL,
            action TEXT NOT NULL,
            status TEXT NOT NULL,
            error_message TEXT,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
            FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
        )"#.to_string(),
        
        // Settings table
        r#"CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"#.to_string(),
        
        // Library folders
        r#"CREATE TABLE IF NOT EXISTS library_folders (
            id TEXT PRIMARY KEY NOT NULL,
            path TEXT NOT NULL UNIQUE,
            is_enabled INTEGER NOT NULL DEFAULT 1,
            last_scan TEXT,
            file_count INTEGER NOT NULL DEFAULT 0,
            date_added TEXT NOT NULL
        )"#.to_string(),
        
        // Indexes
        "CREATE INDEX IF NOT EXISTS idx_songs_album ON songs(album)".to_string(),
        "CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist)".to_string(),
        "CREATE INDEX IF NOT EXISTS idx_songs_album_artist ON songs(album_artist)".to_string(),
        "CREATE INDEX IF NOT EXISTS idx_songs_genre ON songs(genre)".to_string(),
        "CREATE INDEX IF NOT EXISTS idx_songs_year ON songs(year)".to_string(),
        "CREATE INDEX IF NOT EXISTS idx_songs_sync_status ON songs(sync_status)".to_string(),
        "CREATE INDEX IF NOT EXISTS idx_songs_file_path ON songs(file_path)".to_string(),
        "CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(album_artist)".to_string(),
        "CREATE INDEX IF NOT EXISTS idx_albums_year ON albums(year)".to_string(),
        "CREATE INDEX IF NOT EXISTS idx_playlist_entries_playlist ON playlist_entries(playlist_id)".to_string(),
        "CREATE INDEX IF NOT EXISTS idx_playlist_entries_song ON playlist_entries(song_id)".to_string(),
        "CREATE INDEX IF NOT EXISTS idx_sync_history_device ON sync_history(device_id)".to_string(),
        "CREATE INDEX IF NOT EXISTS idx_sync_history_timestamp ON sync_history(timestamp)".to_string(),
        
        // Migration: Add artwork_data column to existing databases
        "ALTER TABLE songs ADD COLUMN artwork_data TEXT".to_string(),
        
        // FTS5 virtual table for full-text search
        r#"CREATE VIRTUAL TABLE IF NOT EXISTS songs_fts USING fts5(
            title, artist, album_artist, album, genre, composer,
            content='songs', content_rowid='rowid'
        )"#.to_string(),
        
        // Triggers for FTS sync
        r#"CREATE TRIGGER IF NOT EXISTS songs_ai AFTER INSERT ON songs BEGIN
            INSERT INTO songs_fts(rowid, title, artist, album_artist, album, genre, composer)
            VALUES (NEW.rowid, NEW.title, NEW.artist, NEW.album_artist, NEW.album, NEW.genre, NEW.composer);
        END"#.to_string(),
        
        r#"CREATE TRIGGER IF NOT EXISTS songs_ad AFTER DELETE ON songs BEGIN
            INSERT INTO songs_fts(songs_fts, rowid, title, artist, album_artist, album, genre, composer)
            VALUES ('delete', OLD.rowid, OLD.title, OLD.artist, OLD.album_artist, OLD.album, OLD.genre, OLD.composer);
        END"#.to_string(),
        
        r#"CREATE TRIGGER IF NOT EXISTS songs_au AFTER UPDATE ON songs BEGIN
            INSERT INTO songs_fts(songs_fts, rowid, title, artist, album_artist, album, genre, composer)
            VALUES ('delete', OLD.rowid, OLD.title, OLD.artist, OLD.album_artist, OLD.album, OLD.genre, OLD.composer);
            INSERT INTO songs_fts(rowid, title, artist, album_artist, album, genre, composer)
            VALUES (NEW.rowid, NEW.title, NEW.artist, NEW.album_artist, NEW.album, NEW.genre, NEW.composer);
        END"#.to_string(),
    ]
}

/// Get the app data directory in a cross-platform way
pub fn get_app_data_dir() -> Result<PathBuf> {
    let base = dirs::data_dir().ok_or_else(|| {
        MediaDohError::Config("Could not determine app data directory".to_string())
    })?;

    Ok(base.join("MediaDoh"))
}

/// Get the cache directory for album art etc.
pub fn get_cache_dir() -> Result<PathBuf> {
    let base = dirs::cache_dir()
        .ok_or_else(|| MediaDohError::Config("Could not determine cache directory".to_string()))?;

    let cache_dir = base.join("MediaDoh");
    std::fs::create_dir_all(&cache_dir)?;

    Ok(cache_dir)
}

/// Get the album art cache directory
pub fn get_art_cache_dir() -> Result<PathBuf> {
    let cache = get_cache_dir()?;
    let art_dir = cache.join("album_art");
    std::fs::create_dir_all(&art_dir)?;

    Ok(art_dir)
}
