import { useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
  Repeat,
  Repeat1,
  Shuffle,
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { usePlayerStore } from "@/store";
import {
  playSong,
  pause,
  resume,
  stop,
  setVolume,
  getPlayerState,
  seekTo,
} from "@/api/tauri";
import { convertFileSrc } from "@tauri-apps/api/core";

export function PlayerBar() {
  const { t } = useTranslation();
  const {
    isPlaying,
    isPaused,
    currentSong,
    volume,
    isMuted,
    repeatMode,
    shuffle,
    positionMs,
    setIsPlaying,
    setIsPaused,
    setVolume: setVolumeState,
    toggleMute,
    setRepeatMode,
    toggleShuffle,
    nextTrack,
    previousTrack,
    setPosition,
  } = usePlayerStore();

  const intervalRef = useRef<number | null>(null);
  const isHandlingTrackEndRef = useRef(false);

  // Handle track end - check for repeat mode
  const handleTrackEnd = useCallback(async () => {
    if (isHandlingTrackEndRef.current) return;
    isHandlingTrackEndRef.current = true;

    try {
      if (repeatMode === "one" && currentSong) {
        // Repeat current song
        setPosition(0);
        await playSong(currentSong.filePath);
      } else {
        // Try to go to next track (handles repeat all in nextTrack)
        const next = nextTrack();
        if (next) {
          await playSong(next.filePath);
        } else {
          // No more tracks, stop playback
          setIsPlaying(false);
          setIsPaused(false);
          setPosition(0);
        }
      }
    } catch (error) {
      console.error("Error handling track end:", error);
    } finally {
      isHandlingTrackEndRef.current = false;
    }
  }, [
    repeatMode,
    currentSong,
    nextTrack,
    setPosition,
    setIsPlaying,
    setIsPaused,
  ]);

  // Poll player state for position updates and track end detection
  useEffect(() => {
    if (isPlaying && !isPaused) {
      intervalRef.current = window.setInterval(async () => {
        try {
          const state = await getPlayerState();
          setPosition(state.positionMs);

          // Check if track has ended (position at or past duration with small buffer)
          if (currentSong && state.positionMs >= currentSong.durationMs - 500) {
            handleTrackEnd();
          }
        } catch (error) {
          console.error("Failed to get player state:", error);
        }
      }, 250); // Update every 250ms for more responsive track end detection
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, isPaused, currentSong, setPosition, handleTrackEnd]);

  const handlePlayPause = useCallback(async () => {
    if (!currentSong) return;

    try {
      if (isPlaying && !isPaused) {
        await pause();
        setIsPaused(true);
      } else if (isPaused) {
        await resume();
        setIsPaused(false);
      } else {
        await playSong(currentSong.filePath);
        setIsPlaying(true);
        setIsPaused(false);
      }
    } catch (error) {
      console.error("Playback error:", error);
    }
  }, [currentSong, isPlaying, isPaused, setIsPlaying, setIsPaused]);

  const handleStop = useCallback(async () => {
    try {
      await stop();
      setIsPlaying(false);
      setIsPaused(false);
      setPosition(0);
    } catch (error) {
      console.error("Stop error:", error);
    }
  }, [setIsPlaying, setIsPaused, setPosition]);

  const handleVolumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolumeState(newVolume);
    try {
      await setVolume(newVolume);
    } catch (error) {
      console.error("Volume error:", error);
    }
  };

  const handleSeek = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      if (!currentSong) return;

      const progressBar = e.currentTarget;
      const rect = progressBar.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, clickX / rect.width));
      const newPositionMs = Math.floor(percentage * currentSong.durationMs);

      // Optimistically update position immediately
      setPosition(newPositionMs);

      try {
        // Always seek - backend will handle playback state
        await seekTo(newPositionMs);

        // If we're playing, ensure we stay in playing state
        if (isPlaying && !isPaused) {
          // Re-fetch player state immediately to sync UI
          const state = await getPlayerState();
          setPosition(state.positionMs);
        }
      } catch (error) {
        console.error("Seek error:", error);
      }
    },
    [currentSong, isPlaying, isPaused, setPosition]
  );

  const handleNext = useCallback(() => {
    const next = nextTrack();
    if (next) {
      playSong(next.filePath).catch(console.error);
    }
  }, [nextTrack]);

  const handlePrevious = useCallback(() => {
    const prev = previousTrack();
    if (prev) {
      playSong(prev.filePath).catch(console.error);
    }
  }, [previousTrack]);

  // State for accelerating hold behavior
  const holdIntervalRef = useRef<number | null>(null);
  const holdCountRef = useRef(0);
  const holdStartRef = useRef<number>(0);

  // Calculate interval based on how long button is held (accelerates over time)
  const getHoldInterval = useCallback(() => {
    const elapsed = Date.now() - holdStartRef.current;
    if (elapsed > 2000) return 100; // Fast after 2 seconds
    if (elapsed > 1000) return 200; // Medium after 1 second
    return 400; // Slow at first
  }, []);

  const startHold = useCallback(
    (action: () => void) => {
      holdCountRef.current = 0;
      holdStartRef.current = Date.now();

      const tick = () => {
        action();
        holdCountRef.current++;
        holdIntervalRef.current = window.setTimeout(tick, getHoldInterval());
      };

      // Start after initial delay
      holdIntervalRef.current = window.setTimeout(tick, 500);
    },
    [getHoldInterval]
  );

  const stopHold = useCallback(() => {
    if (holdIntervalRef.current) {
      clearTimeout(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    holdCountRef.current = 0;
  }, []);

  const handleNextMouseDown = useCallback(() => {
    startHold(handleNext);
  }, [startHold, handleNext]);

  const handlePrevMouseDown = useCallback(() => {
    startHold(handlePrevious);
  }, [startHold, handlePrevious]);

  const handleButtonMouseUp = useCallback(() => {
    // If we held for some time, don't trigger another action
    if (holdCountRef.current > 0) {
      stopHold();
      return;
    }
    stopHold();
  }, [stopHold]);

  // Clean up hold interval on unmount
  useEffect(() => {
    return () => {
      if (holdIntervalRef.current) {
        clearTimeout(holdIntervalRef.current);
      }
    };
  }, []);

  // Keyboard shortcuts with arrow key support
  const keyHoldRef = useRef<{
    key: string;
    interval: number | null;
    startTime: number;
  }>({
    key: "",
    interval: null,
    startTime: 0,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        case " ":
          e.preventDefault();
          handlePlayPause();
          break;
        case "ArrowRight":
          e.preventDefault();
          if (
            !keyHoldRef.current.interval ||
            keyHoldRef.current.key !== "ArrowRight"
          ) {
            // First press or different key
            if (keyHoldRef.current.interval) {
              clearInterval(keyHoldRef.current.interval);
            }
            handleNext();
            keyHoldRef.current = {
              key: "ArrowRight",
              startTime: Date.now(),
              interval: window.setInterval(() => {
                const elapsed = Date.now() - keyHoldRef.current.startTime;
                // Accelerate: more frequent after holding longer
                if (elapsed > 2000 || elapsed % 100 < 50) {
                  handleNext();
                } else if (elapsed > 1000 || elapsed % 200 < 50) {
                  handleNext();
                } else if (elapsed % 400 < 50) {
                  handleNext();
                }
              }, 50),
            };
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (
            !keyHoldRef.current.interval ||
            keyHoldRef.current.key !== "ArrowLeft"
          ) {
            // First press or different key
            if (keyHoldRef.current.interval) {
              clearInterval(keyHoldRef.current.interval);
            }
            handlePrevious();
            keyHoldRef.current = {
              key: "ArrowLeft",
              startTime: Date.now(),
              interval: window.setInterval(() => {
                const elapsed = Date.now() - keyHoldRef.current.startTime;
                // Accelerate: more frequent after holding longer
                if (elapsed > 2000 || elapsed % 100 < 50) {
                  handlePrevious();
                } else if (elapsed > 1000 || elapsed % 200 < 50) {
                  handlePrevious();
                } else if (elapsed % 400 < 50) {
                  handlePrevious();
                }
              }, 50),
            };
          }
          break;
        case "s":
          if (e.metaKey || e.ctrlKey) {
            // Don't capture Cmd+S for stop, it's used for save
          } else {
            e.preventDefault();
            handleStop();
          }
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        if (keyHoldRef.current.interval && keyHoldRef.current.key === e.key) {
          clearInterval(keyHoldRef.current.interval);
          keyHoldRef.current = { key: "", interval: null, startTime: 0 };
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      if (keyHoldRef.current.interval) {
        clearInterval(keyHoldRef.current.interval);
      }
    };
  }, [handlePlayPause, handleNext, handlePrevious, handleStop]);

  const cycleRepeatMode = () => {
    const modes: Array<"off" | "all" | "one"> = ["off", "all", "one"];
    const currentIndex = modes.indexOf(repeatMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    setRepeatMode(nextMode);
  };

  const progress = currentSong
    ? (positionMs / currentSong.durationMs) * 100
    : 0;

  return (
    <footer className="h-20 border-t border-border bg-background-secondary flex items-center px-4 gap-4">
      {/* Current Song Info */}
      <div className="flex items-center gap-3 w-64 min-w-0">
        {currentSong ? (
          <>
            <div className="w-12 h-12 bg-muted rounded flex-shrink-0 flex items-center justify-center overflow-hidden">
              {currentSong.artworkData || currentSong.artCachePath ? (
                <img
                  src={
                    currentSong.artworkData ||
                    convertFileSrc(currentSong.artCachePath!)
                  }
                  alt={currentSong.album || ""}
                  className="w-full h-full object-cover rounded"
                />
              ) : (
                <div className="w-8 h-8 text-muted-foreground">♪</div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {currentSong.title}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {currentSong.artist || "Unknown Artist"}
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("player.nowPlaying")}
          </p>
        )}
      </div>

      {/* Center Controls */}
      <div className="flex-1 flex flex-col items-center gap-1 max-w-2xl">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleShuffle}
            className={cn("player-button", shuffle && "active")}
            title={t("player.shuffle")}
          >
            <Shuffle className="w-4 h-4" />
          </button>

          <button
            onClick={handlePrevious}
            onMouseDown={handlePrevMouseDown}
            onMouseUp={handleButtonMouseUp}
            onMouseLeave={stopHold}
            className="player-button"
            title={t("player.previous")}
          >
            <SkipBack className="w-5 h-5" />
          </button>

          <button
            onClick={handlePlayPause}
            className="player-button primary w-10 h-10 flex items-center justify-center"
            title={
              isPlaying && !isPaused ? t("player.pause") : t("player.play")
            }
          >
            {isPlaying && !isPaused ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" />
            )}
          </button>

          <button
            onClick={handleStop}
            className="player-button"
            title={t("player.stop")}
          >
            <Square className="w-4 h-4" />
          </button>

          <button
            onClick={handleNext}
            onMouseDown={handleNextMouseDown}
            onMouseUp={handleButtonMouseUp}
            onMouseLeave={stopHold}
            className="player-button"
            title={t("player.next")}
          >
            <SkipForward className="w-5 h-5" />
          </button>

          <button
            onClick={cycleRepeatMode}
            className={cn("player-button", repeatMode !== "off" && "active")}
            title={
              repeatMode === "one"
                ? t("player.repeatOne")
                : repeatMode === "all"
                ? t("player.repeatAll")
                : t("player.repeat")
            }
          >
            {repeatMode === "one" ? (
              <Repeat1 className="w-4 h-4" />
            ) : (
              <Repeat className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full flex items-center gap-2">
          <span className="text-xs duration w-10 text-right">
            {formatDuration(positionMs)}
          </span>
          <div
            className="flex-1 progress-bar"
            onClick={handleSeek}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={currentSong?.durationMs || 0}
            aria-valuenow={positionMs}
            tabIndex={0}
          >
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs duration w-10">
            {currentSong ? formatDuration(currentSong.durationMs) : "--:--"}
          </span>
        </div>
      </div>

      {/* Volume Control */}
      <div className="flex items-center gap-2 w-40">
        <button
          onClick={toggleMute}
          className="player-button"
          title={isMuted ? "Unmute" : t("player.mute")}
        >
          {isMuted || volume === 0 ? (
            <VolumeX className="w-4 h-4" />
          ) : (
            <Volume2 className="w-4 h-4" />
          )}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          className="flex-1 h-1 bg-muted rounded-full appearance-none cursor-pointer"
          title={t("player.volume")}
        />
      </div>
    </footer>
  );
}
