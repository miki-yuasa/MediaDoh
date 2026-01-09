//! MediaDoh - Audio playback module

use crate::error::{MediaDohError, Result};
use crate::models::RepeatMode;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;

/// Audio player state - thread-safe wrapper
/// We use a separate thread for audio to avoid Send/Sync issues with rodio
pub struct AudioPlayer {
    volume: Arc<Mutex<f32>>,
    repeat_mode: Arc<Mutex<RepeatMode>>,
    is_playing: Arc<Mutex<bool>>,
    is_paused: Arc<Mutex<bool>>,
    current_file: Arc<Mutex<Option<PathBuf>>>,
    // Command sender for the audio thread
    command_tx: std::sync::mpsc::Sender<PlayerCommand>,
}

enum PlayerCommand {
    Play(PathBuf),
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

        let volume_clone = volume.clone();
        let is_playing_clone = is_playing.clone();
        let is_paused_clone = is_paused.clone();

        // Spawn audio thread
        thread::spawn(move || {
            use rodio::{Decoder, OutputStream, Sink};
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
                                    Ok(source) => {
                                        match Sink::try_new(&stream_handle) {
                                            Ok(new_sink) => {
                                                let vol = *volume_clone.lock().unwrap();
                                                new_sink.set_volume(vol);
                                                new_sink.append(source);
                                                *is_playing_clone.lock().unwrap() = true;
                                                *is_paused_clone.lock().unwrap() = false;
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
                        }
                    }
                    PlayerCommand::Resume => {
                        if let Some(ref s) = sink {
                            s.play();
                            *is_paused_clone.lock().unwrap() = false;
                        }
                    }
                    PlayerCommand::Stop => {
                        if let Some(s) = sink.take() {
                            s.stop();
                        }
                        *is_playing_clone.lock().unwrap() = false;
                        *is_paused_clone.lock().unwrap() = false;
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
            command_tx,
        })
    }

    /// Play an audio file
    pub fn play(&self, file_path: &PathBuf) -> Result<()> {
        *self.current_file.lock().unwrap() = Some(file_path.clone());
        self.command_tx
            .send(PlayerCommand::Play(file_path.clone()))
            .map_err(|e| MediaDohError::Playback(format!("Failed to send play command: {}", e)))?;
        Ok(())
    }

    /// Pause playback
    pub fn pause(&self) -> Result<()> {
        self.command_tx
            .send(PlayerCommand::Pause)
            .map_err(|e| MediaDohError::Playback(format!("Failed to send pause command: {}", e)))?;
        Ok(())
    }

    /// Resume playback
    pub fn resume(&self) -> Result<()> {
        self.command_tx
            .send(PlayerCommand::Resume)
            .map_err(|e| MediaDohError::Playback(format!("Failed to send resume command: {}", e)))?;
        Ok(())
    }

    /// Stop playback
    pub fn stop(&self) -> Result<()> {
        *self.current_file.lock().unwrap() = None;
        self.command_tx
            .send(PlayerCommand::Stop)
            .map_err(|e| MediaDohError::Playback(format!("Failed to send stop command: {}", e)))?;
        Ok(())
    }

    /// Set volume (0.0 to 1.0)
    pub fn set_volume(&self, volume: f32) -> Result<()> {
        let volume = volume.clamp(0.0, 1.0);
        self.command_tx
            .send(PlayerCommand::SetVolume(volume))
            .map_err(|e| MediaDohError::Playback(format!("Failed to send volume command: {}", e)))?;
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
        // Note: Position tracking requires a custom implementation
        0
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
            current_file: self.get_current_file().map(|p| p.to_string_lossy().to_string()),
            position_ms: self.get_position_ms(),
            volume: self.get_volume(),
            repeat_mode: self.get_repeat_mode(),
        }
    }
}
