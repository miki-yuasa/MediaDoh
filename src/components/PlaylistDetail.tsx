import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Play,
  Trash2,
  Edit2,
  Download,
  Music,
  MoreVertical,
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { usePlayerStore } from "@/store";
import {
  getPlaylistSongs,
  getPlaylists,
  updatePlaylist,
  deletePlaylist,
  removeSongFromPlaylist,
  exportPlaylistM3U,
  playSong,
} from "@/api/tauri";
import { save } from "@tauri-apps/plugin-dialog";
import type { Song } from "@/types";
import { convertFileSrc } from "@tauri-apps/api/core";

interface PlaylistDetailProps {
  playlistId: string;
}

export function PlaylistDetail({ playlistId }: PlaylistDetailProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const {
    setQueue,
    setCurrentSong,
    setIsPlaying,
    setIsPaused,
    shuffle,
    currentSong,
  } = usePlayerStore();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMenu]);

  // Fetch playlist info
  const { data: playlists } = useQuery({
    queryKey: ["playlists"],
    queryFn: getPlaylists,
  });

  const playlist = playlists?.find((p) => p.id === playlistId);

  // Fetch playlist songs
  const { data: songs = [] } = useQuery({
    queryKey: ["playlist-songs", playlistId],
    queryFn: () => getPlaylistSongs(playlistId),
  });

  const totalDuration = useMemo(() => {
    return songs.reduce((acc, song) => acc + song.durationMs, 0);
  }, [songs]);

  const handlePlayAll = useCallback(async () => {
    if (songs.length === 0) return;

    const orderedSongs = shuffle
      ? [...songs].sort(() => Math.random() - 0.5)
      : songs;

    setQueue(orderedSongs);
    setCurrentSong(orderedSongs[0]);
    setIsPlaying(true);
    setIsPaused(false);

    try {
      await playSong(orderedSongs[0].filePath);
    } catch (error) {
      console.error("Failed to play:", error);
    }
  }, [songs, shuffle, setQueue, setCurrentSong, setIsPlaying, setIsPaused]);

  const handlePlaySong = useCallback(
    async (song: Song, _index: number) => {
      setQueue(songs);
      setCurrentSong(song);
      setIsPlaying(true);
      setIsPaused(false);

      try {
        await playSong(song.filePath);
      } catch (error) {
        console.error("Failed to play:", error);
      }
    },
    [songs, setQueue, setCurrentSong, setIsPlaying, setIsPaused]
  );

  const handleRemoveSong = useCallback(
    async (songId: string) => {
      try {
        await removeSongFromPlaylist(playlistId, songId);
        queryClient.invalidateQueries({
          queryKey: ["playlist-songs", playlistId],
        });
        queryClient.invalidateQueries({ queryKey: ["playlists"] });
      } catch (error) {
        console.error("Failed to remove song:", error);
      }
    },
    [playlistId, queryClient]
  );

  const handleEditPlaylist = useCallback(() => {
    if (!playlist) return;
    setEditName(playlist.name);
    setEditDescription(playlist.description || "");
    setIsEditing(true);
    setShowMenu(false);
  }, [playlist]);

  const handleSaveEdit = useCallback(async () => {
    if (!editName.trim()) return;

    try {
      await updatePlaylist(
        playlistId,
        editName.trim(),
        editDescription.trim() || undefined
      );
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update playlist:", error);
    }
  }, [playlistId, editName, editDescription, queryClient]);

  const handleDeletePlaylist = useCallback(async () => {
    if (
      !confirm(
        t(
          "playlist.deleteConfirm",
          "Are you sure you want to delete this playlist?"
        )
      )
    )
      return;

    try {
      await deletePlaylist(playlistId);
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      // Navigation will be handled by parent
    } catch (error) {
      console.error("Failed to delete playlist:", error);
    }
  }, [playlistId, queryClient, t]);

  const handleExport = useCallback(async () => {
    if (!playlist) return;

    try {
      const filePath = await save({
        defaultPath: `${playlist.name}.m3u`,
        filters: [{ name: "M3U Playlist", extensions: ["m3u"] }],
      });

      if (filePath) {
        await exportPlaylistM3U(playlistId, filePath);
      }
    } catch (error) {
      console.error("Failed to export playlist:", error);
    }
    setShowMenu(false);
  }, [playlistId, playlist]);

  if (!playlist) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        {t("playlist.notFound", "Playlist not found")}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 p-6 bg-background-secondary border-b border-border">
        <div className="flex items-start gap-6">
          {/* Playlist Icon */}
          <div className="w-32 h-32 bg-muted rounded-lg flex items-center justify-center shadow-lg">
            <Music className="w-16 h-16 text-muted-foreground" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase text-muted-foreground font-medium mb-1">
              {t("playlist.title", "Playlist")}
            </p>

            {isEditing ? (
              <div className="space-y-2">
                <input
                  type="text"
                  className="w-full px-3 py-2 text-2xl font-bold bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                />
                <input
                  type="text"
                  className="w-full px-3 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={t(
                    "playlist.descriptionPlaceholder",
                    "Add a description"
                  )}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEdit}
                    className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
                  >
                    {t("common.save", "Save")}
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1 text-sm bg-muted text-muted-foreground rounded hover:bg-muted/80"
                  >
                    {t("common.cancel", "Cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-3xl font-bold truncate">{playlist.name}</h1>
                {playlist.description && (
                  <p className="text-muted-foreground mt-1">
                    {playlist.description}
                  </p>
                )}
                <p className="text-sm text-muted-foreground mt-2">
                  {t("playlist.trackCount", "{{count}} songs", {
                    count: songs.length,
                  })}{" "}
                  • {formatDuration(totalDuration)}
                </p>
              </>
            )}
          </div>

          {/* Actions */}
          {!isEditing && (
            <div className="flex items-center gap-2">
              <button
                onClick={handlePlayAll}
                disabled={songs.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4" fill="currentColor" />
                {t("common.play", "Play")}
              </button>

              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-2 rounded-full hover:bg-accent"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>

                {showMenu && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-background border border-border rounded-lg shadow-lg z-50">
                    <button
                      onClick={handleEditPlaylist}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                    >
                      <Edit2 className="w-4 h-4" />
                      {t("common.edit", "Edit")}
                    </button>
                    <button
                      onClick={handleExport}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                    >
                      <Download className="w-4 h-4" />
                      {t("playlist.export", "Export to M3U")}
                    </button>
                    <hr className="border-border" />
                    <button
                      onClick={handleDeletePlaylist}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                      {t("common.delete", "Delete")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Song List */}
      <div className="flex-1 overflow-y-auto">
        {songs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Music className="w-16 h-16 mb-4 opacity-50" />
            <p>{t("playlist.empty", "This playlist is empty")}</p>
            <p className="text-sm mt-1">
              {t("playlist.addSongsHint", "Add songs from your library")}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-background border-b border-border">
              <tr className="text-left text-xs text-muted-foreground uppercase">
                <th className="w-12 px-4 py-2">#</th>
                <th className="px-2 py-2">{t("library.title", "Title")}</th>
                <th className="w-40 px-2 py-2">
                  {t("library.artist", "Artist")}
                </th>
                <th className="w-40 px-2 py-2">
                  {t("library.album", "Album")}
                </th>
                <th className="w-20 px-2 py-2 text-right">
                  {t("library.duration", "Duration")}
                </th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {songs.map((song, index) => {
                const isPlaying = currentSong?.id === song.id;
                const artworkSrc =
                  song.artworkData ||
                  (song.artCachePath
                    ? convertFileSrc(song.artCachePath)
                    : null);

                return (
                  <tr
                    key={song.id}
                    className={cn(
                      "hover:bg-accent/50 cursor-pointer",
                      isPlaying && "bg-primary/5"
                    )}
                    onDoubleClick={() => handlePlaySong(song, index)}
                  >
                    <td className="w-12 px-4 py-2 text-sm text-muted-foreground">
                      {index + 1}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-muted rounded flex-shrink-0 flex items-center justify-center overflow-hidden">
                          {artworkSrc ? (
                            <img
                              src={artworkSrc}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Music className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <span
                          className={cn(
                            "truncate",
                            isPlaying && "text-primary font-medium"
                          )}
                        >
                          {song.title}
                        </span>
                      </div>
                    </td>
                    <td className="w-40 px-2 py-2 text-sm text-muted-foreground truncate">
                      {song.artist || "-"}
                    </td>
                    <td className="w-40 px-2 py-2 text-sm text-muted-foreground truncate">
                      {song.album || "-"}
                    </td>
                    <td className="w-20 px-2 py-2 text-sm text-muted-foreground text-right tabular-nums">
                      {formatDuration(song.durationMs)}
                    </td>
                    <td className="w-12 px-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveSong(song.id);
                        }}
                        className="p-1 rounded hover:bg-accent opacity-0 group-hover:opacity-100 hover:text-destructive"
                        title={t("playlist.removeSong", "Remove from playlist")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
