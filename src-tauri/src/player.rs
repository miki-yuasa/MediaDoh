//! MediaDoh - Audio playback module

use crate::error::{MediaDohError, Result};
use crate::models::RepeatMode;
use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink, Source};
use std::fs::File;
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Audio player state
pub struct AudioPlayer {
    _stream: OutputStream,
    stream_handle: OutputStreamHandle,
    sink: Arc<Mutex<Option<Sink>>>,
    current_file: Arc<Mutex<Option<PathBuf>>>,
    volume: Arc<Mutex<f32>>,
    repeat_mode: Arc<Mutex<RepeatMode>>,
}

impl AudioPlayer {
    /// Create a new audio player
    pub fn new() -> Result<Self> {
        let (stream, stream_handle) = OutputStream::try_default()
            .map_err(|e| MediaDohError::Playback(format!("Failed to initialize audio: {}", e)))?;

        Ok(Self {
            _stream: stream,
            stream_handle,
            sink: Arc::new(Mutex::new(None)),
            current_file: Arc::new(Mutex::new(None)),
            volume: Arc::new(Mutex::new(1.0)),
            repeat_mode: Arc::new(Mutex::new(RepeatMode::Off)),
        })
    }

    /// Play an audio file
    pub fn play(&self, file_path: &PathBuf) -> Result<()> {
        // Stop any current playback
        self.stop()?;

        let file = File::open(file_path)?;
        let reader = BufReader::new(file);

        let source = Decoder::new(reader)
            .map_err(|e| MediaDohError::Playback(format!("Failed to decode audio: {}", e)))?;

        let sink = Sink::try_new(&self.stream_handle)
            .map_err(|e| MediaDohError::Playback(format!("Failed to create sink: {}", e)))?;

        // Set volume
        let volume = *self.volume.lock().unwrap();
        sink.set_volume(volume);

        sink.append(source);

        // Store the sink and current file
        *self.sink.lock().unwrap() = Some(sink);
        *self.current_file.lock().unwrap() = Some(file_path.clone());

        Ok(())
    }

    /// Pause playback
    pub fn pause(&self) -> Result<()> {
        if let Some(ref sink) = *self.sink.lock().unwrap() {
            sink.pause();
        }
        Ok(())
    }

    /// Resume playback
    pub fn resume(&self) -> Result<()> {
        if let Some(ref sink) = *self.sink.lock().unwrap() {
            sink.play();
        }
        Ok(())
    }

    /// Stop playback
    pub fn stop(&self) -> Result<()> {
        if let Some(sink) = self.sink.lock().unwrap().take() {
            sink.stop();
        }
        *self.current_file.lock().unwrap() = None;
        Ok(())
    }

    /// Set volume (0.0 to 1.0)
    pub fn set_volume(&self, volume: f32) -> Result<()> {
        let volume = volume.clamp(0.0, 1.0);
        *self.volume.lock().unwrap() = volume;

        if let Some(ref sink) = *self.sink.lock().unwrap() {
            sink.set_volume(volume);
        }
        Ok(())
    }

    /// Get current volume
    pub fn get_volume(&self) -> f32 {
        *self.volume.lock().unwrap()
    }

    /// Check if playing
    pub fn is_playing(&self) -> bool {
        if let Some(ref sink) = *self.sink.lock().unwrap() {
            !sink.is_paused() && !sink.empty()
        } else {
            false
        }
    }

    /// Check if paused
    pub fn is_paused(&self) -> bool {
        if let Some(ref sink) = *self.sink.lock().unwrap() {
            sink.is_paused()
        } else {
            false
        }
    }

    /// Get current position in milliseconds
    pub fn get_position_ms(&self) -> u64 {
        // Note: rodio's Sink doesn't provide position tracking out of the box
        // This would need to be implemented with a custom wrapper
        0
    }

    /// Seek to position (requires custom implementation)
    pub fn seek(&self, _position_ms: u64) -> Result<()> {
        // Seeking in rodio requires re-creating the source
        // This is a simplified implementation
        Err(MediaDohError::Playback("Seek not implemented yet".to_string()))
    }

    /// Set repeat mode
    pub fn set_repeat_mode(&self, mode: RepeatMode) -> Result<()> {
        *self.repeat_mode.lock().unwrap() = mode;
        Ok(())
    }

    /// Get repeat mode
    pub fn get_repeat_mode(&self) -> RepeatMode {
        self.repeat_mode.lock().unwrap().clone()
    }

    /// Get currently playing file
    pub fn get_current_file(&self) -> Option<PathBuf> {
        self.current_file.lock().unwrap().clone()
    }
}

/// Player state for frontend
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerState {
    pub is_playing: bool,
    pub is_paused: bool,
    pub current_file: Option<String>,
    pub position_ms: u64,
    pub volume: f32,
    pub repeat_mode: RepeatMode,
}

impl AudioPlayer {
    /// Get full player state
    pub fn get_state(&self) -> PlayerState {
        PlayerState {
            is_playing: self.is_playing(),
            is_paused: self.is_paused(),
            current_file: self.get_current_file().map(|p| p.to_string_lossy().to_string()),
            position_ms: self.get_position_ms(),
            volume: self.get_volume(),
            repeat_mode: self.get_repeat_mode(),
        }
    }
}
