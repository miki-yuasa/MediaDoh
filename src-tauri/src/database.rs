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

    // Read and execute the initial schema
    let schema = include_str!("../migrations/001_initial_schema.sql");

    // Split by semicolons and execute each statement
    for statement in schema.split(';') {
        let trimmed = statement.trim();
        if !trimmed.is_empty() && !trimmed.starts_with("--") {
            if let Err(e) = sqlx::query(trimmed).execute(pool).await {
                // Log but don't fail on "already exists" errors
                let err_str = e.to_string();
                if !err_str.contains("already exists") {
                    log::warn!("Migration statement warning: {}", e);
                }
            }
        }
    }

    log::info!("Database migrations completed");
    Ok(())
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
    let base = dirs::cache_dir().ok_or_else(|| {
        MediaDohError::Config("Could not determine cache directory".to_string())
    })?;

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
