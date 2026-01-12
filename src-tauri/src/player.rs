//! MediaBo - Audio playback module

use crate::error::{MediaBoError, Result};
use crate::models::RepeatMode;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;

/// Audio player state - thread-safe wrapper
/// We use a separate thread for audio to avoid Send/Sync issues with rodio
pub struct AudioPlayer {
    volume: Arc<Mutex<f32>>,
    repeat_mode: Arc<Mutex<RepeatMode>>,
    is_playing: Arc<Mutex<bool>>,
    is_paused: Arc<Mutex<bool>>,
    current_file: Arc<Mutex<Option<PathBuf>>>,
    // Position tracking
    playback_start_time: Arc<Mutex<Option<Instant>>>,
    pause_position_ms: Arc<Mutex<u64>>,
    // Command sender for the audio thread
    command_tx: std::sync::mpsc::Sender<PlayerCommand>,
}

enum PlayerCommand {
    Play(PathBuf),
    PlayFrom(PathBuf, u64),   // Play from a specific position in milliseconds
    SeekPaused(PathBuf, u64), // Seek to position but stay paused
    Pause,
    Resume,
    Stop,
    SetVolume(f32),
}

impl AudioPlayer {
    /// Create a new audio player
    pub fn new() -> Result<Self> {
        let (command_tx, command_rx) = std::sync::mpsc::channel::<PlayerCommand>();
        let volume = Arc::new(Mutex::new(1.0f32));
        let is_playing = Arc::new(Mutex::new(false));
        let is_paused = Arc::new(Mutex::new(false));
        let playback_start_time: Arc<Mutex<Option<Instant>>> = Arc::new(Mutex::new(None));
        let pause_position_ms = Arc::new(Mutex::new(0u64));

        let volume_clone = volume.clone();
        let is_playing_clone = is_playing.clone();
        let is_paused_clone = is_paused.clone();
        let playback_start_clone = playback_start_time.clone();
        let pause_position_clone = pause_position_ms.clone();

        // Spawn audio thread
        thread::spawn(move || {
            use rodio::{Decoder, OutputStream, Sink, Source};
            use std::fs::File;
            use std::io::BufReader;

            let (_stream, stream_handle) = match OutputStream::try_default() {
                Ok(s) => s,
                Err(e) => {
                    log::error!("Failed to initialize audio output: {}", e);
                    return;
                }
            };

            let mut sink: Option<Sink> = None;

            for command in command_rx {
                match command {
                    PlayerCommand::Play(path) => {
                        // Stop existing playback
                        if let Some(s) = sink.take() {
                            s.stop();
                        }

                        match File::open(&path) {
                            Ok(file) => {
                                let reader = BufReader::new(file);
                                match Decoder::new(reader) {
                                    Ok(source) => match Sink::try_new(&stream_handle) {
                                        Ok(new_sink) => {
                                            let vol = *volume_clone.lock().unwrap();
                                            new_sink.set_volume(vol);
                                            new_sink.append(source);
                                            *is_playing_clone.lock().unwrap() = true;
                                            *is_paused_clone.lock().unwrap() = false;
                                            *playback_start_clone.lock().unwrap() =
                                                Some(Instant::now());
                                            *pause_position_clone.lock().unwrap() = 0;
                                            sink = Some(new_sink);
                                        }
                                        Err(e) => {
                                            log::error!("Failed to create sink: {}", e);
                                        }
                                    },
                                    Err(e) => {
                                        log::error!("Failed to decode audio: {}", e);
                                    }
                                }
                            }
                            Err(e) => {
                                log::error!("Failed to open file: {}", e);
                            }
                        }
                    }
                    PlayerCommand::PlayFrom(path, position_ms) => {
                        // Stop existing playback
                        if let Some(s) = sink.take() {
                            s.stop();
                        }

                        match File::open(&path) {
                            Ok(file) => {
                                let reader = BufReader::new(file);
                                match Decoder::new(reader) {
                                    Ok(source) => {
                                        // Skip to the desired position using duration-based skip
                                        let skipped_source = source.skip_duration(
                                            std::time::Duration::from_millis(position_ms),
                                        );

                                        match Sink::try_new(&stream_handle) {
                                            Ok(new_sink) => {
                                                let vol = *volume_clone.lock().unwrap();
                                                new_sink.set_volume(vol);
                                                new_sink.append(skipped_source);
                                                *is_playing_clone.lock().unwrap() = true;
                                                *is_paused_clone.lock().unwrap() = false;
                                                *playback_start_clone.lock().unwrap() =
                                                    Some(Instant::now());
                                                *pause_position_clone.lock().unwrap() = position_ms;
                                                sink = Some(new_sink);
                                            }
                                            Err(e) => {
                                                log::error!("Failed to create sink: {}", e);
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        log::error!("Failed to decode audio: {}", e);
                                    }
                                }
                            }
                            Err(e) => {
                                log::error!("Failed to open file: {}", e);
                            }
                        }
                    }
                    PlayerCommand::SeekPaused(path, position_ms) => {
                        // Stop existing playback
                        if let Some(s) = sink.take() {
                            s.stop();
                        }

                        match File::open(&path) {
                            Ok(file) => {
                                let reader = BufReader::new(file);
                                match Decoder::new(reader) {
                                    Ok(source) => {
                                        // Skip to the desired position using duration-based skip
                                        let skipped_source = source.skip_duration(
                                            std::time::Duration::from_millis(position_ms),
                                        );

                                        match Sink::try_new(&stream_handle) {
                                            Ok(new_sink) => {
                                                let vol = *volume_clone.lock().unwrap();
                                                new_sink.set_volume(vol);
                                                new_sink.append(skipped_source);
                                                // Immediately pause the sink
                                                new_sink.pause();
                                                *is_playing_clone.lock().unwrap() = true;
                                                *is_paused_clone.lock().unwrap() = true;
                                                *playback_start_clone.lock().unwrap() = None;
                                                *pause_position_clone.lock().unwrap() = position_ms;
                                                sink = Some(new_sink);
                                            }
                                            Err(e) => {
                                                log::error!("Failed to create sink: {}", e);
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        log::error!("Failed to decode audio: {}", e);
                                    }
                                }
                            }
                            Err(e) => {
                                log::error!("Failed to open file: {}", e);
                            }
                        }
                    }
                    PlayerCommand::Pause => {
                        if let Some(ref s) = sink {
                            s.pause();
                            *is_paused_clone.lock().unwrap() = true;
                            // Store current position when pausing
                            if let Some(start) = *playback_start_clone.lock().unwrap() {
                                let elapsed = start.elapsed().as_millis() as u64;
                                let current_pause = *pause_position_clone.lock().unwrap();
                                *pause_position_clone.lock().unwrap() = current_pause + elapsed;
                            }
                            *playback_start_clone.lock().unwrap() = None;
                        }
                    }
                    PlayerCommand::Resume => {
                        if let Some(ref s) = sink {
                            s.play();
                            *is_paused_clone.lock().unwrap() = false;
                            *playback_start_clone.lock().unwrap() = Some(Instant::now());
                        }
                    }
                    PlayerCommand::Stop => {
                        if let Some(s) = sink.take() {
                            s.stop();
                        }
                        *is_playing_clone.lock().unwrap() = false;
                        *is_paused_clone.lock().unwrap() = false;
                        *playback_start_clone.lock().unwrap() = None;
                        *pause_position_clone.lock().unwrap() = 0;
                    }
                    PlayerCommand::SetVolume(vol) => {
                        *volume_clone.lock().unwrap() = vol;
                        if let Some(ref s) = sink {
                            s.set_volume(vol);
                        }
                    }
                }
            }
        });

        Ok(Self {
            volume,
            repeat_mode: Arc::new(Mutex::new(RepeatMode::Off)),
            is_playing,
            is_paused,
            current_file: Arc::new(Mutex::new(None)),
            playback_start_time,
            pause_position_ms,
            command_tx,
        })
    }

    /// Play an audio file
    pub fn play(&self, file_path: &PathBuf) -> Result<()> {
        *self.current_file.lock().unwrap() = Some(file_path.clone());
        self.command_tx
            .send(PlayerCommand::Play(file_path.clone()))
            .map_err(|e| MediaBoError::Playback(format!("Failed to send play command: {}", e)))?;
        Ok(())
    }

    /// Seek to a specific position in milliseconds
    pub fn seek_to(&self, position_ms: u64) -> Result<()> {
        let current_file = self.get_current_file();
        if let Some(file_path) = current_file {
            self.command_tx
                .send(PlayerCommand::PlayFrom(file_path, position_ms))
                .map_err(|e| {
                    MediaBoError::Playback(format!("Failed to send seek command: {}", e))
                })?;
            Ok(())
        } else {
            Err(MediaBoError::Playback(
                "No file is currently playing".to_string(),
            ))
        }
    }

    /// Seek to a specific position in milliseconds but stay paused
    pub fn seek_to_paused(&self, position_ms: u64) -> Result<()> {
        let current_file = self.get_current_file();
        if let Some(file_path) = current_file {
            self.command_tx
                .send(PlayerCommand::SeekPaused(file_path, position_ms))
                .map_err(|e| {
                    MediaBoError::Playback(format!("Failed to send seek paused command: {}", e))
                })?;
            Ok(())
        } else {
            Err(MediaBoError::Playback(
                "No file is currently playing".to_string(),
            ))
        }
    }

    /// Pause playback
    pub fn pause(&self) -> Result<()> {
        self.command_tx
            .send(PlayerCommand::Pause)
            .map_err(|e| MediaBoError::Playback(format!("Failed to send pause command: {}", e)))?;
        Ok(())
    }

    /// Resume playback
    pub fn resume(&self) -> Result<()> {
        self.command_tx
            .send(PlayerCommand::Resume)
            .map_err(|e| MediaBoError::Playback(format!("Failed to send resume command: {}", e)))?;
        Ok(())
    }

    /// Stop playback
    pub fn stop(&self) -> Result<()> {
        *self.current_file.lock().unwrap() = None;
        self.command_tx
            .send(PlayerCommand::Stop)
            .map_err(|e| MediaBoError::Playback(format!("Failed to send stop command: {}", e)))?;
        Ok(())
    }

    /// Set volume (0.0 to 1.0)
    pub fn set_volume(&self, volume: f32) -> Result<()> {
        let volume = volume.clamp(0.0, 1.0);
        self.command_tx
            .send(PlayerCommand::SetVolume(volume))
            .map_err(|e| MediaBoError::Playback(format!("Failed to send volume command: {}", e)))?;
        Ok(())
    }

    /// Get current volume
    pub fn get_volume(&self) -> f32 {
        *self.volume.lock().unwrap()
    }

    /// Check if playing
    pub fn is_playing(&self) -> bool {
        *self.is_playing.lock().unwrap()
    }

    /// Check if paused
    pub fn is_paused(&self) -> bool {
        *self.is_paused.lock().unwrap()
    }

    /// Get current position in milliseconds
    pub fn get_position_ms(&self) -> u64 {
        let pause_position = *self.pause_position_ms.lock().unwrap();

        if let Some(start) = *self.playback_start_time.lock().unwrap() {
            // Currently playing - add elapsed time to pause position
            pause_position + start.elapsed().as_millis() as u64
        } else {
            // Paused or stopped - return stored position
            pause_position
        }
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

// Make AudioPlayer Send + Sync safe
unsafe impl Send for AudioPlayer {}
unsafe impl Sync for AudioPlayer {}

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
            current_file: self
                .get_current_file()
                .map(|p| p.to_string_lossy().to_string()),
            position_ms: self.get_position_ms(),
            volume: self.get_volume(),
            repeat_mode: self.get_repeat_mode(),
        }
    }
}
