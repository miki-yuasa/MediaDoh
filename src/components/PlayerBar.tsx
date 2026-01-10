import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
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
  setVolume,
  getPlayerState,
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

  // Poll player state for position updates
  useEffect(() => {
    if (isPlaying && !isPaused) {
      intervalRef.current = window.setInterval(async () => {
        try {
          const state = await getPlayerState();
          setPosition(state.positionMs);
        } catch (error) {
          console.error("Failed to get player state:", error);
        }
      }, 500); // Update every 500ms
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
  }, [isPlaying, isPaused, setPosition]);

  const handlePlayPause = async () => {
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
  };

  const handleVolumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolumeState(newVolume);
    try {
      await setVolume(newVolume);
    } catch (error) {
      console.error("Volume error:", error);
    }
  };

  const handleNext = () => {
    const next = nextTrack();
    if (next) {
      playSong(next.filePath).catch(console.error);
    }
  };

  const handlePrevious = () => {
    const prev = previousTrack();
    if (prev) {
      playSong(prev.filePath).catch(console.error);
    }
  };

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
            <div className="w-12 h-12 bg-muted rounded flex-shrink-0 flex items-center justify-center">
              {currentSong.artCachePath ? (
                <img
                  src={convertFileSrc(currentSong.artCachePath)}
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
            className={cn("player-button", shuffle && "text-primary")}
            title={t("player.shuffle")}
          >
            <Shuffle className="w-4 h-4" />
          </button>

          <button
            onClick={handlePrevious}
            className="player-button"
            title={t("player.previous")}
          >
            <SkipBack className="w-5 h-5" />
          </button>

          <button
            onClick={handlePlayPause}
            className="player-button primary w-10 h-10"
            title={
              isPlaying && !isPaused ? t("player.pause") : t("player.play")
            }
          >
            {isPlaying && !isPaused ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 ml-0.5" />
            )}
          </button>

          <button
            onClick={handleNext}
            className="player-button"
            title={t("player.next")}
          >
            <SkipForward className="w-5 h-5" />
          </button>

          <button
            onClick={cycleRepeatMode}
            className={cn(
              "player-button",
              repeatMode !== "off" && "text-primary"
            )}
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
          <div className="flex-1 progress-bar">
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
