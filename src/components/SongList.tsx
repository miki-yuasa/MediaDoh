import { useCallback, useMemo, useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { List, RowComponentProps } from "react-window";
import { AutoSizer } from "react-virtualized-auto-sizer";
import {
  Check,
  AlertCircle,
  Music,
  Trash2,
  AlertTriangle,
  Loader2,
  FileText,
  Play,
  ListPlus,
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { useLibraryStore, usePlayerStore } from "@/store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSongs, playSong, deleteSongs } from "@/api/tauri";
import type { Song, SongGroup } from "@/types";

const ROW_HEIGHT = 32;

interface SongRowData {
  items: Array<{ song: Song; showAlbumArt: boolean }>;
  selectedSongIds: Set<string>;
  currentSongId: string | null;
  onSongClick: (e: React.MouseEvent, songId: string) => void;
  onSongDoubleClick: (song: Song) => void;
  onSongContextMenu: (e: React.MouseEvent, song: Song) => void;
}

interface SongRowProps {
  song: Song;
  showAlbumArt: boolean;
  isSelected: boolean;
  isPlaying: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function SongRow({
  song,
  showAlbumArt,
  isSelected,
  isPlaying,
  onClick,
  onDoubleClick,
  onContextMenu,
}: SongRowProps) {
  const SyncIndicator = () => {
    switch (song.syncStatus) {
      case "synced":
        return <Check className="w-3 h-3 text-synced" />;
      case "update_needed":
        return <AlertCircle className="w-3 h-3 text-sync-warning" />;
      default:
        return <span className="w-3 h-3" />;
    }
  };

  return (
    <div
      className={cn(
        "song-row",
        isSelected && "selected",
        isPlaying && "playing"
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <div className="w-8 flex-shrink-0">
        {showAlbumArt ? (
          <div className="w-6 h-6 bg-muted rounded flex items-center justify-center">
            {song.hasEmbeddedArt && song.artCachePath ? (
              <img
                src={song.artCachePath}
                alt=""
                className="w-full h-full object-cover rounded"
              />
            ) : (
              <Music className="w-3 h-3 text-muted-foreground" />
            )}
          </div>
        ) : null}
      </div>
      <span className="w-8 text-xs text-muted-foreground text-right flex-shrink-0">
        {song.trackNumber || "-"}
      </span>
      <span className="flex-1 min-w-0 px-2 truncate">{song.title}</span>
      <span className="w-40 px-2 truncate text-muted-foreground">
        {song.artist || "-"}
      </span>
      <span className="w-40 px-2 truncate text-muted-foreground">
        {song.album || "-"}
      </span>
      <span className="w-14 text-right flex-shrink-0 text-muted-foreground tabular-nums">
        {formatDuration(song.durationMs)}
      </span>
      <span className="w-12 text-center flex-shrink-0 text-xs text-muted-foreground uppercase">
        {song.format}
      </span>
      <span className="w-6 flex-shrink-0 flex items-center justify-center">
        <SyncIndicator />
      </span>
    </div>
  );
}

function groupSongsByAlbum(songs: Song[]): SongGroup[] {
  const groups: SongGroup[] = [];
  let currentAlbum: string | null = null;
  let currentGroup: Song[] = [];
  let currentAlbumArtist: string | null = null;
  let currentArtPath: string | null = null;

  for (const song of songs) {
    const albumKey = `${song.albumArtist || song.artist || ""}-${
      song.album || ""
    }`;

    if (albumKey !== currentAlbum) {
      if (currentGroup.length > 0) {
        groups.push({
          album: currentAlbum || "Unknown Album",
          albumArtist: currentAlbumArtist,
          artCachePath: currentArtPath,
          songs: currentGroup,
        });
      }
      currentAlbum = albumKey;
      currentAlbumArtist = song.albumArtist || song.artist || null;
      currentArtPath = song.artCachePath;
      currentGroup = [song];
    } else {
      currentGroup.push(song);
    }
  }

  if (currentGroup.length > 0) {
    groups.push({
      album: currentAlbum || "Unknown Album",
      albumArtist: currentAlbumArtist,
      artCachePath: currentArtPath,
      songs: currentGroup,
    });
  }

  return groups;
}

// Row component for react-window v2
function VirtualRow({
  index,
  style,
  ...rowProps
}: RowComponentProps<SongRowData>) {
  const item = rowProps.items[index];
  if (!item) return <div style={style} />;

  const { song, showAlbumArt } = item;
  const isSelected = rowProps.selectedSongIds.has(song.id);
  const isPlaying = rowProps.currentSongId === song.id;

  return (
    <div style={style}>
      <SongRow
        song={song}
        showAlbumArt={showAlbumArt}
        isSelected={isSelected}
        isPlaying={isPlaying}
        onClick={(e) => rowProps.onSongClick(e, song.id)}
        onDoubleClick={() => rowProps.onSongDoubleClick(song)}
        onContextMenu={(e) => rowProps.onSongContextMenu(e, song)}
      />
    </div>
  );
}

export function SongList() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const {
    songs,
    setSongs,
    selectedSongIds,
    selectSong,
    clearSelection,
    searchQuery,
  } = useLibraryStore();

  const { currentSong, setQueue, setCurrentSong, setIsPlaying } =
    usePlayerStore();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    song: Song;
  } | null>(null);
  const [showMetadataEditor, setShowMetadataEditor] = useState(false);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data: fetchedSongs } = useQuery({
    queryKey: ["songs"],
    queryFn: getSongs,
  });

  useEffect(() => {
    if (fetchedSongs) {
      setSongs(fetchedSongs);
    }
  }, [fetchedSongs, setSongs]);

  const filteredSongs = useMemo(() => {
    let result = [...songs];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (song) =>
          song.title.toLowerCase().includes(query) ||
          song.artist?.toLowerCase().includes(query) ||
          song.album?.toLowerCase().includes(query) ||
          song.albumArtist?.toLowerCase().includes(query)
      );
    }

    // Always sort by album artist, album, then track number to keep songs in same album together
    // This groups songs by album and orders them by track number within each album
    result.sort((a, b) => {
      // First, sort by album artist (or artist if not set)
      const aAlbumArtist = (a.albumArtist || a.artist || "").toLowerCase();
      const bAlbumArtist = (b.albumArtist || b.artist || "").toLowerCase();
      const albumArtistComparison = aAlbumArtist.localeCompare(bAlbumArtist);
      if (albumArtistComparison !== 0) return albumArtistComparison;

      // Then, sort by album name
      const aAlbum = (a.album || "").toLowerCase();
      const bAlbum = (b.album || "").toLowerCase();
      const albumComparison = aAlbum.localeCompare(bAlbum);
      if (albumComparison !== 0) return albumComparison;

      // Finally, sort by track number within the same album
      const aTrack = a.trackNumber || 999;
      const bTrack = b.trackNumber || 999;
      return aTrack - bTrack;
    });

    return result;
  }, [songs, searchQuery]);

  const songGroups = useMemo(
    () => groupSongsByAlbum(filteredSongs),
    [filteredSongs]
  );

  const flattenedList = useMemo(() => {
    const items: Array<{ song: Song; showAlbumArt: boolean }> = [];

    for (const group of songGroups) {
      group.songs.forEach((song, index) => {
        items.push({
          song,
          showAlbumArt: index === 0,
        });
      });
    }

    return items;
  }, [songGroups]);

  const handleSongClick = useCallback(
    (e: React.MouseEvent, songId: string) => {
      selectSong(songId, {
        multi: e.metaKey || e.ctrlKey,
      });
    },
    [selectSong]
  );

  const handleSongDoubleClick = useCallback(
    async (song: Song) => {
      const songIndex = filteredSongs.findIndex((s) => s.id === song.id);
      const queue = filteredSongs.slice(songIndex);

      setQueue(queue);
      setCurrentSong(queue[0]);
      setIsPlaying(true);

      try {
        await playSong(song.filePath);
      } catch (error) {
        console.error("Failed to play song:", error);
      }
    },
    [filteredSongs, setQueue, setCurrentSong, setIsPlaying]
  );

  const handleDeleteSelected = useCallback(async () => {
    if (selectedSongIds.size === 0) return;

    try {
      setDeleting(true);
      const idsToDelete = Array.from(selectedSongIds);
      await deleteSongs(idsToDelete);

      // Update local state immediately
      setSongs(songs.filter((s) => !selectedSongIds.has(s.id)));
      clearSelection();

      // Invalidate query cache
      await queryClient.invalidateQueries({ queryKey: ["songs"] });

      setShowDeleteConfirm(false);
    } catch (error) {
      console.error("Failed to delete songs:", error);
    } finally {
      setDeleting(false);
    }
  }, [selectedSongIds, songs, setSongs, clearSelection, queryClient]);

  const handleSongContextMenu = useCallback(
    (e: React.MouseEvent, song: Song) => {
      e.preventDefault();
      // If the song isn't already selected, select it
      if (!selectedSongIds.has(song.id)) {
        selectSong(song.id, { multi: false });
      }
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        song,
      });
    },
    [selectedSongIds, selectSong]
  );

  const handlePlayFromHere = useCallback(
    async (song: Song) => {
      const songIndex = filteredSongs.findIndex((s) => s.id === song.id);
      const queue = filteredSongs.slice(songIndex);
      setQueue(queue);
      setCurrentSong(queue[0]);
      setIsPlaying(true);
      try {
        await playSong(song.filePath);
      } catch (error) {
        console.error("Failed to play song:", error);
      }
      setContextMenu(null);
    },
    [filteredSongs, setQueue, setCurrentSong, setIsPlaying]
  );

  const handleViewMetadata = useCallback((song: Song) => {
    setEditingSong(song);
    setShowMetadataEditor(true);
    setContextMenu(null);
  }, []);

  const handleDeleteFromContextMenu = useCallback(() => {
    setContextMenu(null);
    setShowDeleteConfirm(true);
  }, []);

  const rowData: SongRowData = useMemo(
    () => ({
      items: flattenedList,
      selectedSongIds,
      currentSongId: currentSong?.id || null,
      onSongClick: handleSongClick,
      onSongDoubleClick: handleSongDoubleClick,
      onSongContextMenu: handleSongContextMenu,
    }),
    [
      flattenedList,
      selectedSongIds,
      currentSong,
      handleSongClick,
      handleSongDoubleClick,
      handleSongContextMenu,
    ]
  );

  if (songs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
        <Music className="w-16 h-16 mb-4" />
        <h2 className="text-lg font-medium mb-2">{t("library.noSongs")}</h2>
        <p className="text-sm text-muted-foreground">{t("library.addMusic")}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="flex items-center px-2 py-1.5 border-b border-border bg-background-secondary text-xs font-medium text-muted-foreground">
        <span className="w-8 flex-shrink-0" />
        <span className="w-8 text-right flex-shrink-0">#</span>
        <span className="flex-1 px-2">{t("view.columns.title")}</span>
        <span className="w-40 px-2">{t("view.columns.artist")}</span>
        <span className="w-40 px-2">{t("view.columns.album")}</span>
        <span className="w-14 text-right flex-shrink-0">
          {t("view.columns.duration")}
        </span>
        <span className="w-12 text-center flex-shrink-0">
          {t("view.columns.format")}
        </span>
        <span className="w-6 text-center flex-shrink-0">
          {t("view.columns.syncStatus")}
        </span>
      </div>

      {/* Virtualized List */}
      <div className="flex-1">
        <AutoSizer
          renderProp={({ height, width }) => {
            if (!height || !width) return null;
            return (
              <List
                style={{ height, width }}
                rowCount={flattenedList.length}
                rowHeight={ROW_HEIGHT}
                overscanCount={10}
                rowProps={rowData}
                rowComponent={VirtualRow}
              />
            );
          }}
        />
      </div>

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="px-3 py-2 border-t border-border bg-amber-50 dark:bg-amber-900/20">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">
                {t("library.deleteConfirm", {
                  count: selectedSongIds.size,
                  defaultValue: `Remove ${selectedSongIds.size} song(s) from library index? Files will NOT be deleted.`,
                })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
                {t("common.delete", "Delete")}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-2.5 py-1 text-xs rounded border border-border hover:bg-accent transition-colors disabled:opacity-50"
              >
                {t("common.cancel", "Cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div className="px-3 py-1.5 border-t border-border bg-background-secondary text-xs text-muted-foreground flex items-center justify-between">
        <span>
          {t("library.songs", { count: filteredSongs.length })}
          {searchQuery && ` (filtered from ${songs.length})`}
        </span>
        {selectedSongIds.size > 0 && !showDeleteConfirm && (
          <div className="flex items-center gap-2">
            <span className="text-primary">
              {t("library.selected", {
                count: selectedSongIds.size,
                defaultValue: `${selectedSongIds.size} selected`,
              })}
            </span>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-destructive text-destructive hover:bg-destructive/10 transition-colors"
              title={t("library.deleteSelected", "Delete selected from index")}
            >
              <Trash2 className="w-3 h-3" />
              {t("common.delete", "Delete")}
            </button>
            <button
              onClick={clearSelection}
              className="px-2 py-0.5 text-xs rounded border border-border hover:bg-accent transition-colors"
            >
              {t("common.clearSelection", "Clear")}
            </button>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[160px] bg-popover border border-border rounded-md shadow-lg py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => handlePlayFromHere(contextMenu.song)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-left"
          >
            <Play className="w-4 h-4" />
            {t("contextMenu.playFromHere", "Play from here")}
          </button>
          <button
            onClick={() => handleViewMetadata(contextMenu.song)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-left"
          >
            <FileText className="w-4 h-4" />
            {t("contextMenu.viewMetadata", "View/Edit Metadata")}
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-left text-muted-foreground"
            disabled
          >
            <ListPlus className="w-4 h-4" />
            {t("contextMenu.addToPlaylist", "Add to Playlist...")}
          </button>
          <div className="border-t border-border my-1" />
          <button
            onClick={handleDeleteFromContextMenu}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-destructive/10 text-destructive transition-colors text-left"
          >
            <Trash2 className="w-4 h-4" />
            {t("contextMenu.deleteFromIndex", "Delete from Index")}
          </button>
        </div>
      )}

      {/* Metadata Editor Modal */}
      {showMetadataEditor && editingSong && (
        <MetadataEditor
          song={editingSong}
          onClose={() => {
            setShowMetadataEditor(false);
            setEditingSong(null);
          }}
        />
      )}
    </div>
  );
}

// Metadata Editor Component
interface MetadataEditorProps {
  song: Song;
  onClose: () => void;
}

function MetadataEditor({ song, onClose }: MetadataEditorProps) {
  const { t } = useTranslation();

  const fields = [
    { label: t("metadata.title", "Title"), value: song.title },
    { label: t("metadata.artist", "Artist"), value: song.artist || "-" },
    { label: t("metadata.album", "Album"), value: song.album || "-" },
    { label: t("metadata.albumArtist", "Album Artist"), value: song.albumArtist || "-" },
    { label: t("metadata.trackNumber", "Track"), value: song.trackNumber ? `${song.trackNumber}${song.trackTotal ? ` / ${song.trackTotal}` : ""}` : "-" },
    { label: t("metadata.discNumber", "Disc"), value: song.discNumber ? `${song.discNumber}${song.discTotal ? ` / ${song.discTotal}` : ""}` : "-" },
    { label: t("metadata.year", "Year"), value: song.year || "-" },
    { label: t("metadata.genre", "Genre"), value: song.genre || "-" },
    { label: t("metadata.duration", "Duration"), value: formatDuration(song.durationMs) },
    { label: t("metadata.format", "Format"), value: song.format.toUpperCase() },
    { label: t("metadata.bitrate", "Bitrate"), value: song.bitrate ? `${song.bitrate} kbps` : "-" },
    { label: t("metadata.sampleRate", "Sample Rate"), value: song.sampleRate ? `${song.sampleRate} Hz` : "-" },
    { label: t("metadata.bitDepth", "Bit Depth"), value: song.bitDepth ? `${song.bitDepth}-bit` : "-" },
    { label: t("metadata.channels", "Channels"), value: song.channels || "-" },
    { label: t("metadata.filePath", "File Path"), value: song.filePath, mono: true },
    { label: t("metadata.fileSize", "File Size"), value: `${(song.fileSize / 1024 / 1024).toFixed(2)} MB` },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold">{t("metadata.title", "Song Metadata")}</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex gap-4 p-4 overflow-y-auto max-h-[calc(80vh-120px)]">
          {/* Album Art */}
          <div className="flex-shrink-0">
            <div className="w-32 h-32 bg-muted rounded-lg flex items-center justify-center">
              {song.hasEmbeddedArt && song.artCachePath ? (
                <img
                  src={song.artCachePath}
                  alt={song.album || "Album art"}
                  className="w-full h-full object-cover rounded-lg"
                />
              ) : (
                <Music className="w-12 h-12 text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Metadata Fields */}
          <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2">
            {fields.map(({ label, value, mono }) => (
              <div key={label} className={mono ? "col-span-2" : ""}>
                <label className="text-xs text-muted-foreground">{label}</label>
                <p className={cn("text-sm truncate", mono && "font-mono text-xs")} title={String(value)}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border bg-background-secondary">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent transition-colors"
          >
            {t("common.close", "Close")}
          </button>
        </div>
      </div>
    </div>
  );
}
