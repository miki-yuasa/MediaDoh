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
  GripVertical,
  Check,
  AlertCircle,
  ListPlus,
  ChevronRight,
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
  reorderPlaylistSongs,
  addSongsToPlaylist,
  createPlaylist,
} from "@/api/tauri";
import { save } from "@tauri-apps/plugin-dialog";
import type { Song } from "@/types";
import { convertFileSrc } from "@tauri-apps/api/core";

interface PlaylistDetailProps {
  playlistId: string;
  onDelete?: () => void;
}

export function PlaylistDetail({ playlistId, onDelete }: PlaylistDetailProps) {
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

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    song: Song;
  } | null>(null);
  const [showPlaylistSubmenu, setShowPlaylistSubmenu] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

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

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (draggedIndex !== null && index !== draggedIndex) {
        setDragOverIndex(index);
      }
    },
    [draggedIndex]
  );

  const handleDragEnd = useCallback(async () => {
    if (
      draggedIndex !== null &&
      dragOverIndex !== null &&
      draggedIndex !== dragOverIndex
    ) {
      // Reorder the songs array
      const newSongs = [...songs];
      const [removed] = newSongs.splice(draggedIndex, 1);
      newSongs.splice(dragOverIndex, 0, removed);

      // Update the playlist order on the backend
      try {
        await reorderPlaylistSongs(
          playlistId,
          newSongs.map((s) => s.id)
        );
        queryClient.invalidateQueries({
          queryKey: ["playlist-songs", playlistId],
        });
      } catch (error) {
        console.error("Failed to reorder songs:", error);
      }
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [draggedIndex, dragOverIndex, songs, playlistId, queryClient]);

  const handleSongContextMenu = useCallback(
    (e: React.MouseEvent, song: Song) => {
      e.preventDefault();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        song,
      });
    },
    []
  );

  const handlePlayFromContext = useCallback(
    async (song: Song) => {
      const index = songs.findIndex((s) => s.id === song.id);
      if (index !== -1) {
        await handlePlaySong(song, index);
      }
      setContextMenu(null);
    },
    [songs, handlePlaySong]
  );

  // Helper function to add songs to playlist with duplicate check
  const handleAddToPlaylist = useCallback(
    async (targetPlaylistId: string, songIds: string[]) => {
      try {
        const existingSongs = await getPlaylistSongs(targetPlaylistId);
        const existingIds = new Set(existingSongs.map((s) => s.id));
        const duplicates = songIds.filter((id) => existingIds.has(id));
        const newSongs = songIds.filter((id) => !existingIds.has(id));

        if (duplicates.length > 0 && newSongs.length === 0) {
          alert(
            t(
              "playlist.allDuplicates",
              "All selected songs are already in this playlist."
            )
          );
          return;
        }

        if (duplicates.length > 0) {
          const proceed = confirm(
            t(
              "playlist.duplicateWarning",
              "{{count}} song(s) already exist in this playlist. Add anyway?",
              {
                count: duplicates.length,
              }
            )
          );
          if (!proceed) return;
        }

        await addSongsToPlaylist(
          targetPlaylistId,
          newSongs.length > 0 ? newSongs : songIds
        );
        queryClient.invalidateQueries({ queryKey: ["playlists"] });
        queryClient.invalidateQueries({
          queryKey: ["playlist-songs", targetPlaylistId],
        });
        setContextMenu(null);
      } catch (error) {
        console.error("Failed to add to playlist:", error);
      }
    },
    [queryClient, t]
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
      // Navigate away after deletion
      onDelete?.();
    } catch (error) {
      console.error("Failed to delete playlist:", error);
    }
  }, [playlistId, queryClient, t, onDelete]);

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
      <div className="flex-1 flex flex-col overflow-hidden">
        {songs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Music className="w-16 h-16 mb-4 opacity-50" />
            <p>{t("playlist.empty", "This playlist is empty")}</p>
            <p className="text-sm mt-1">
              {t("playlist.addSongsHint", "Add songs from your library")}
            </p>
          </div>
        ) : (
          <>
            {/* Column Headers */}
            <div className="flex items-center px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase border-b border-border bg-background-secondary">
              <span className="w-6 flex-shrink-0"></span>
              <span className="w-8 text-right flex-shrink-0 pr-2">#</span>
              <span className="w-10 flex-shrink-0"></span>
              <span className="flex-1 min-w-0 px-2">
                {t("view.columns.title", "Title")}
              </span>
              <span className="w-40 px-2">
                {t("view.columns.artist", "Artist")}
              </span>
              <span className="w-40 px-2">
                {t("view.columns.album", "Album")}
              </span>
              <span className="w-12 text-center flex-shrink-0">
                {t("view.columns.year", "Year")}
              </span>
              <span className="w-14 text-right flex-shrink-0">
                {t("view.columns.duration", "Duration")}
              </span>
              <span className="w-12 text-center flex-shrink-0">
                {t("view.columns.format", "Format")}
              </span>
              <span className="w-6 flex-shrink-0"></span>
              <span className="w-8 flex-shrink-0"></span>
            </div>

            {/* Songs */}
            <div className="flex-1 overflow-y-auto">
              {songs.map((song, index) => {
                const isPlaying = currentSong?.id === song.id;
                const artworkSrc =
                  song.artworkData ||
                  (song.artCachePath
                    ? convertFileSrc(song.artCachePath)
                    : null);

                const SyncIndicator = ({ status }: { status: string }) => {
                  switch (status) {
                    case "synced":
                      return <Check className="w-3 h-3 text-synced" />;
                    case "update_needed":
                      return (
                        <AlertCircle className="w-3 h-3 text-sync-warning" />
                      );
                    default:
                      return <span className="w-3 h-3" />;
                  }
                };

                return (
                  <div
                    key={song.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      "song-row select-none cursor-pointer group",
                      isPlaying && "playing",
                      dragOverIndex === index && "border-t-2 border-primary"
                    )}
                    onDoubleClick={() => handlePlaySong(song, index)}
                    onContextMenu={(e) => handleSongContextMenu(e, song)}
                  >
                    {/* Drag Handle */}
                    <span className="w-6 flex-shrink-0 flex items-center justify-center cursor-grab opacity-0 group-hover:opacity-100 text-muted-foreground">
                      <GripVertical className="w-4 h-4" />
                    </span>
                    {/* Track Number */}
                    <span className="w-8 text-xs text-muted-foreground text-right flex-shrink-0 pr-2">
                      {index + 1}
                    </span>
                    {/* Album Art */}
                    <span className="w-10 flex-shrink-0 py-1">
                      <div className="w-8 h-8 bg-muted rounded flex items-center justify-center overflow-hidden">
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
                    </span>
                    {/* Title */}
                    <span
                      className={cn(
                        "flex-1 min-w-0 px-2 truncate text-sm",
                        isPlaying && "text-primary font-medium"
                      )}
                    >
                      {song.title}
                    </span>
                    {/* Artist */}
                    <span className="w-40 px-2 truncate text-sm text-muted-foreground">
                      {song.artist || "-"}
                    </span>
                    {/* Album */}
                    <span className="w-40 px-2 truncate text-sm text-muted-foreground">
                      {song.album || "-"}
                    </span>
                    {/* Year */}
                    <span className="w-12 text-center flex-shrink-0 text-xs text-muted-foreground tabular-nums">
                      {song.year || "-"}
                    </span>
                    {/* Duration */}
                    <span className="w-14 text-right flex-shrink-0 text-muted-foreground tabular-nums">
                      {formatDuration(song.durationMs)}
                    </span>
                    {/* Format */}
                    <span className="w-12 text-center flex-shrink-0 text-xs text-muted-foreground uppercase">
                      {song.format}
                    </span>
                    {/* Sync Status */}
                    <span className="w-6 flex-shrink-0 flex items-center justify-center">
                      <SyncIndicator status={song.syncStatus} />
                    </span>
                    {/* Remove Button */}
                    <span className="w-8 flex-shrink-0 flex items-center justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveSong(song.id);
                        }}
                        className="p-1 rounded hover:bg-accent opacity-0 group-hover:opacity-100 hover:text-destructive"
                        title={t("playlist.removeSong", "Remove from playlist")}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Context Menu */}
        {contextMenu && (
          <div
            ref={contextMenuRef}
            className="fixed z-50 min-w-[160px] bg-background border border-border rounded-md shadow-xl py-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => handlePlayFromContext(contextMenu.song)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-left"
            >
              <Play className="w-4 h-4" />
              {t("contextMenu.playFromHere", "Play from here")}
            </button>
            <div
              className="relative"
              onMouseEnter={() => setShowPlaylistSubmenu(true)}
              onMouseLeave={() => setShowPlaylistSubmenu(false)}
            >
              <button className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-left">
                <span className="flex items-center gap-2">
                  <ListPlus className="w-4 h-4" />
                  {t("contextMenu.addToPlaylist", "Add to Playlist...")}
                </span>
                <ChevronRight className="w-4 h-4" />
              </button>
              {showPlaylistSubmenu && (
                <div className="absolute left-full top-0 ml-1 w-48 py-1 bg-background border border-border rounded-lg shadow-lg z-50">
                  <button
                    onClick={async () => {
                      const name = prompt(
                        t("playlist.newPlaylistName", "Enter playlist name:")
                      );
                      if (name) {
                        try {
                          const newPlaylist = await createPlaylist(name);
                          await addSongsToPlaylist(newPlaylist.id, [
                            contextMenu.song.id,
                          ]);
                          queryClient.invalidateQueries({
                            queryKey: ["playlists"],
                          });
                          setContextMenu(null);
                        } catch (error) {
                          console.error("Failed to create playlist:", error);
                        }
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-left"
                  >
                    <ListPlus className="w-4 h-4" />
                    {t("playlist.createNew", "Create New Playlist")}
                  </button>
                  {playlists && playlists.length > 0 && (
                    <>
                      <div className="border-t border-border my-1" />
                      {playlists.map((pl) => (
                        <button
                          key={pl.id}
                          onClick={() =>
                            handleAddToPlaylist(pl.id, [contextMenu.song.id])
                          }
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-left truncate"
                        >
                          {pl.name}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="border-t border-border my-1" />
            <button
              onClick={() => {
                handleRemoveSong(contextMenu.song.id);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-destructive/10 text-destructive transition-colors text-left"
            >
              <Trash2 className="w-4 h-4" />
              {t("playlist.removeSong", "Remove from playlist")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
