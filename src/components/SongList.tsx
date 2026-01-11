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
  Save,
  ArrowUp,
  ArrowDown,
  ChevronRight,
} from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cn, formatDuration } from "@/lib/utils";
import { useLibraryStore, usePlayerStore } from "@/store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSongs,
  playSong,
  deleteSongs,
  updateSongMetadata,
  getPlaylists,
  addSongsToPlaylist,
  createPlaylist,
} from "@/api/tauri";
import type { Song, SongGroup } from "@/types";

const ROW_HEIGHT = 32; // Standard row height

// Column width configuration
interface ColumnWidths {
  artwork: number;
  trackNumber: number;
  title: number; // flex-1, this is min-width
  artist: number;
  album: number;
  year: number;
  dateAdded: number;
  duration: number;
  format: number;
  sync: number;
}

const DEFAULT_COLUMN_WIDTHS: ColumnWidths = {
  artwork: 40,
  trackNumber: 32,
  title: 200, // resizable column
  artist: 160,
  album: 160,
  year: 50,
  dateAdded: 90,
  duration: 56,
  format: 48,
  sync: 24,
};

const MIN_COLUMN_WIDTHS: ColumnWidths = {
  artwork: 40,
  trackNumber: 32,
  title: 80,
  artist: 80,
  album: 80,
  year: 45,
  dateAdded: 70,
  duration: 56,
  format: 48,
  sync: 24,
};

// Load saved column widths from localStorage
const loadColumnWidths = (): ColumnWidths => {
  try {
    const saved = localStorage.getItem("songListColumnWidths");
    if (saved) {
      return { ...DEFAULT_COLUMN_WIDTHS, ...JSON.parse(saved) };
    }
  } catch {
    // ignore
  }
  return DEFAULT_COLUMN_WIDTHS;
};

// Save column widths to localStorage
const saveColumnWidths = (widths: ColumnWidths) => {
  try {
    localStorage.setItem("songListColumnWidths", JSON.stringify(widths));
  } catch {
    // ignore
  }
};

interface SongRowData {
  items: Array<{
    song: Song;
    showAlbumArt: boolean;
    isFirstOfAlbum: boolean;
    isLastOfAlbum: boolean;
    albumSongCount: number;
  }>;
  selectedSongIds: Set<string>;
  currentSongId: string | null;
  columnWidths: ColumnWidths;
  onSongClick: (e: React.MouseEvent, songId: string) => void;
  onSongDoubleClick: (song: Song) => void;
  onSongContextMenu: (e: React.MouseEvent, song: Song) => void;
  onMouseDown: (e: React.MouseEvent, songId: string) => void;
  onMouseEnter: (songId: string) => void;
}

interface SongRowProps {
  song: Song;
  showAlbumArt: boolean;
  isFirstOfAlbum: boolean;
  isSelected: boolean;
  isPlaying: boolean;
  columnWidths: ColumnWidths;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
}

function SongRow({
  song,
  showAlbumArt,
  isFirstOfAlbum,
  isSelected,
  isPlaying,
  columnWidths,
  onClick,
  onDoubleClick,
  onContextMenu,
  onMouseDown,
  onMouseEnter,
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

  // Get artwork source - prefer artworkData (base64), fall back to artCachePath
  const artworkSrc =
    song.artworkData ||
    (song.artCachePath ? convertFileSrc(song.artCachePath) : null);

  // Artwork fits within row height (ROW_HEIGHT = 32px, so use 28px with 2px padding)
  const artworkSize = "w-7 h-7";

  return (
    <div
      className={cn(
        "song-row select-none",
        isSelected && "selected",
        isPlaying && "playing"
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
    >
      {/* Album artwork column - fits within row height */}
      <div
        className="flex-shrink-0 flex items-center justify-center"
        style={{ width: columnWidths.artwork }}
      >
        {isFirstOfAlbum && showAlbumArt ? (
          <div
            className={cn(
              "bg-muted rounded flex items-center justify-center overflow-hidden shadow-sm",
              artworkSize
            )}
          >
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
        ) : null}
      </div>
      <span
        className="text-xs text-muted-foreground text-right flex-shrink-0 tabular-nums pr-2"
        style={{ width: columnWidths.trackNumber }}
      >
        {song.trackNumber || "-"}
      </span>
      <span
        className="flex-1 min-w-0 px-2 truncate"
        style={{ minWidth: columnWidths.title }}
      >
        {song.title}
      </span>
      <span
        className="px-2 truncate text-muted-foreground flex-shrink-0"
        style={{ width: columnWidths.artist }}
      >
        {song.artist || "-"}
      </span>
      <span
        className="px-2 truncate text-muted-foreground flex-shrink-0"
        style={{ width: columnWidths.album }}
      >
        {song.album || "-"}
      </span>
      <span
        className="text-center flex-shrink-0 text-xs text-muted-foreground tabular-nums"
        style={{ width: columnWidths.year }}
      >
        {song.year || "-"}
      </span>
      <span
        className="text-center flex-shrink-0 text-xs text-muted-foreground"
        style={{ width: columnWidths.dateAdded }}
      >
        {song.dateAdded ? new Date(song.dateAdded).toLocaleDateString() : "-"}
      </span>
      <span
        className="text-right flex-shrink-0 text-muted-foreground tabular-nums"
        style={{ width: columnWidths.duration }}
      >
        {formatDuration(song.durationMs)}
      </span>
      <span
        className="text-center flex-shrink-0 text-xs text-muted-foreground uppercase"
        style={{ width: columnWidths.format }}
      >
        {song.format}
      </span>
      <span
        className="flex-shrink-0 flex items-center justify-center"
        style={{ width: columnWidths.sync }}
      >
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

  const { song, showAlbumArt, isFirstOfAlbum } = item;
  const isSelected = rowProps.selectedSongIds.has(song.id);
  const isPlaying = rowProps.currentSongId === song.id;

  return (
    <div style={style}>
      <SongRow
        song={song}
        showAlbumArt={showAlbumArt}
        isFirstOfAlbum={isFirstOfAlbum}
        isSelected={isSelected}
        isPlaying={isPlaying}
        columnWidths={rowProps.columnWidths}
        onClick={(e) => rowProps.onSongClick(e, song.id)}
        onDoubleClick={() => rowProps.onSongDoubleClick(song)}
        onContextMenu={(e) => rowProps.onSongContextMenu(e, song)}
        onMouseDown={(e) => rowProps.onMouseDown(e, song.id)}
        onMouseEnter={() => rowProps.onMouseEnter(song.id)}
      />
    </div>
  );
}

// ResizableColumnHeader component for drag-to-resize columns
interface ResizableColumnHeaderProps {
  column: keyof ColumnWidths;
  label: string | React.ReactNode;
  columnWidths: ColumnWidths;
  onResize: (column: keyof ColumnWidths, newWidth: number) => void;
  sortable?: boolean;
  sortColumn?: string | null;
  sortDirection?: "asc" | "desc";
  onSort?: () => void;
  minWidth?: number;
  className?: string;
  align?: "left" | "center" | "right";
}

function ResizableColumnHeader({
  column,
  label,
  columnWidths,
  onResize,
  sortable = false,
  sortColumn,
  sortDirection,
  onSort,
  minWidth,
  className,
  align = "left",
}: ResizableColumnHeaderProps) {
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = columnWidths[column];
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const newWidth = Math.max(
        minWidth || MIN_COLUMN_WIDTHS[column],
        startWidthRef.current + delta
      );
      onResize(column, newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, column, minWidth, onResize]);

  const isSorted = sortColumn === column;
  const justifyClass =
    align === "right"
      ? "justify-end"
      : align === "center"
      ? "justify-center"
      : "justify-start";

  // Check if this is a flex column (has flex-1 in className)
  const isFlex = className?.includes("flex-1");

  return (
    <div
      className={cn(
        "relative flex items-center group",
        justifyClass,
        className
      )}
      style={
        isFlex
          ? { minWidth: columnWidths[column] }
          : { width: columnWidths[column] }
      }
    >
      {sortable && onSort ? (
        <button
          onClick={onSort}
          className={cn(
            "flex items-center gap-1 hover:text-foreground transition-colors",
            isSorted && "text-foreground"
          )}
        >
          <span className="truncate">{label}</span>
          {isSorted &&
            (sortDirection === "asc" ? (
              <ArrowUp className="w-3 h-3 flex-shrink-0" />
            ) : (
              <ArrowDown className="w-3 h-3 flex-shrink-0" />
            ))}
        </button>
      ) : (
        <span className="truncate">{label}</span>
      )}
      {/* Resize handle */}
      <div
        className={cn(
          "absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors",
          isResizing && "bg-primary"
        )}
        onMouseDown={handleMouseDown}
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
    selectSongs,
    clearSelection,
    searchQuery,
  } = useLibraryStore();

  const { currentSong, setQueue, setCurrentSong, setIsPlaying, setIsPaused } =
    usePlayerStore();

  // Column widths state with persistence
  const [columnWidths, setColumnWidths] =
    useState<ColumnWidths>(loadColumnWidths);

  const handleColumnResize = useCallback(
    (column: keyof ColumnWidths, newWidth: number) => {
      setColumnWidths((prev) => {
        const updated = { ...prev, [column]: newWidth };
        saveColumnWidths(updated);
        return updated;
      });
    },
    []
  );

  // Sorting state
  type SortColumn =
    | "title"
    | "artist"
    | "album"
    | "year"
    | "dateAdded"
    | "duration"
    | "format"
    | "trackNumber"
    | null;
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const handleColumnSort = useCallback((column: SortColumn) => {
    setSortColumn((prev) => {
      if (prev === column) {
        // Toggle direction or clear if already desc
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
        return column;
      }
      setSortDirection("asc");
      return column;
    });
  }, []);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    song: Song;
  } | null>(null);
  const [showPlaylistSubmenu, setShowPlaylistSubmenu] = useState(false);
  const [showMetadataEditor, setShowMetadataEditor] = useState(false);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Fetch playlists for context menu
  const { data: playlists = [] } = useQuery({
    queryKey: ["playlists"],
    queryFn: getPlaylists,
  });

  // Drag selection state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);

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

    // Apply column sorting if a column is selected
    if (sortColumn) {
      result.sort((a, b) => {
        let comparison = 0;
        const multiplier = sortDirection === "asc" ? 1 : -1;

        switch (sortColumn) {
          case "title":
            comparison = a.title
              .toLowerCase()
              .localeCompare(b.title.toLowerCase());
            break;
          case "artist":
            comparison = (a.artist || "")
              .toLowerCase()
              .localeCompare((b.artist || "").toLowerCase());
            break;
          case "album":
            comparison = (a.album || "")
              .toLowerCase()
              .localeCompare((b.album || "").toLowerCase());
            break;
          case "year":
            comparison = (a.year || 0) - (b.year || 0);
            break;
          case "dateAdded":
            comparison =
              new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime();
            break;
          case "duration":
            comparison = (a.durationMs || 0) - (b.durationMs || 0);
            break;
          case "format":
            comparison = a.format.localeCompare(b.format);
            break;
          case "trackNumber":
            comparison = (a.trackNumber || 999) - (b.trackNumber || 999);
            break;
        }
        return comparison * multiplier;
      });
    } else {
      // Default: sort by album artist, album, then track number to keep songs in same album together
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
    }

    return result;
  }, [songs, searchQuery, sortColumn, sortDirection]);

  const songGroups = useMemo(
    () => groupSongsByAlbum(filteredSongs),
    [filteredSongs]
  );

  const flattenedList = useMemo(() => {
    const items: Array<{
      song: Song;
      showAlbumArt: boolean;
      isFirstOfAlbum: boolean;
      isLastOfAlbum: boolean;
      albumSongCount: number;
    }> = [];

    for (const group of songGroups) {
      group.songs.forEach((song, index) => {
        items.push({
          song,
          showAlbumArt: index === 0,
          isFirstOfAlbum: index === 0,
          isLastOfAlbum: index === group.songs.length - 1,
          albumSongCount: group.songs.length,
        });
      });
    }

    return items;
  }, [songGroups]);

  // Get all song IDs in display order for range selection
  const allSongIds = useMemo(
    () => flattenedList.map((item) => item.song.id),
    [flattenedList]
  );

  const handleSongClick = useCallback(
    (e: React.MouseEvent, songId: string) => {
      selectSong(
        songId,
        {
          multi: e.metaKey || e.ctrlKey,
          range: e.shiftKey,
        },
        allSongIds
      );
    },
    [selectSong, allSongIds]
  );

  // Drag selection handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, songId: string) => {
      if (e.button !== 0) return; // Only left click
      const index = allSongIds.indexOf(songId);
      if (index !== -1) {
        setIsDragging(true);
        setDragStartIndex(index);
      }
    },
    [allSongIds]
  );

  const handleMouseEnter = useCallback(
    (songId: string) => {
      if (!isDragging || dragStartIndex === null) return;

      const currentIndex = allSongIds.indexOf(songId);
      if (currentIndex === -1) return;

      const start = Math.min(dragStartIndex, currentIndex);
      const end = Math.max(dragStartIndex, currentIndex);
      const rangeIds = allSongIds.slice(start, end + 1);
      selectSongs(rangeIds);
    },
    [isDragging, dragStartIndex, allSongIds, selectSongs]
  );

  useEffect(() => {
    const handleMouseUp = () => {
      setIsDragging(false);
      setDragStartIndex(null);
    };

    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, []);

  const handleSongDoubleClick = useCallback(
    async (song: Song) => {
      const songIndex = filteredSongs.findIndex((s) => s.id === song.id);
      const queue = filteredSongs.slice(songIndex);

      setQueue(queue);
      setCurrentSong(queue[0]);
      setIsPlaying(true);
      setIsPaused(false);

      try {
        await playSong(song.filePath);
      } catch (error) {
        console.error("Failed to play song:", error);
      }
    },
    [filteredSongs, setQueue, setCurrentSong, setIsPlaying, setIsPaused]
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
      setIsPaused(false);
      try {
        await playSong(song.filePath);
      } catch (error) {
        console.error("Failed to play song:", error);
      }
      setContextMenu(null);
    },
    [filteredSongs, setQueue, setCurrentSong, setIsPlaying, setIsPaused]
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
      columnWidths,
      onSongClick: handleSongClick,
      onSongDoubleClick: handleSongDoubleClick,
      onSongContextMenu: handleSongContextMenu,
      onMouseDown: handleMouseDown,
      onMouseEnter: handleMouseEnter,
    }),
    [
      flattenedList,
      selectedSongIds,
      currentSong,
      columnWidths,
      handleSongClick,
      handleSongDoubleClick,
      handleSongContextMenu,
      handleMouseDown,
      handleMouseEnter,
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
      {/* Header with resizable columns */}
      <div className="flex items-center px-2 py-1.5 border-b border-border bg-background-secondary text-xs font-medium text-muted-foreground">
        {/* Artwork - not resizable */}
        <div
          className="flex-shrink-0"
          style={{ width: columnWidths.artwork }}
        />

        {/* Track number - resizable */}
        <ResizableColumnHeader
          column="trackNumber"
          label="#"
          columnWidths={columnWidths}
          onResize={handleColumnResize}
          sortable
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={() => handleColumnSort("trackNumber")}
          align="right"
          className="flex-shrink-0"
        />

        {/* Title - resizable flex column */}
        <ResizableColumnHeader
          column="title"
          label={t("view.columns.title")}
          columnWidths={columnWidths}
          onResize={handleColumnResize}
          sortable
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={() => handleColumnSort("title")}
          className="flex-1 px-2"
        />

        {/* Artist - resizable */}
        <ResizableColumnHeader
          column="artist"
          label={t("view.columns.artist")}
          columnWidths={columnWidths}
          onResize={handleColumnResize}
          sortable
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={() => handleColumnSort("artist")}
          className="flex-shrink-0 px-2"
        />

        {/* Album - resizable */}
        <ResizableColumnHeader
          column="album"
          label={t("view.columns.album")}
          columnWidths={columnWidths}
          onResize={handleColumnResize}
          sortable
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={() => handleColumnSort("album")}
          className="flex-shrink-0 px-2"
        />

        {/* Year - resizable */}
        <ResizableColumnHeader
          column="year"
          label={t("view.columns.year")}
          columnWidths={columnWidths}
          onResize={handleColumnResize}
          sortable
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={() => handleColumnSort("year")}
          align="center"
          className="flex-shrink-0"
        />

        {/* Date Added - resizable */}
        <ResizableColumnHeader
          column="dateAdded"
          label={t("view.columns.dateAdded")}
          columnWidths={columnWidths}
          onResize={handleColumnResize}
          sortable
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={() => handleColumnSort("dateAdded")}
          align="center"
          className="flex-shrink-0"
        />

        {/* Duration - resizable */}
        <ResizableColumnHeader
          column="duration"
          label={t("view.columns.duration")}
          columnWidths={columnWidths}
          onResize={handleColumnResize}
          sortable
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={() => handleColumnSort("duration")}
          align="right"
          className="flex-shrink-0"
        />

        {/* Format - resizable */}
        <ResizableColumnHeader
          column="format"
          label={t("view.columns.format")}
          columnWidths={columnWidths}
          onResize={handleColumnResize}
          sortable
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={() => handleColumnSort("format")}
          align="center"
          className="flex-shrink-0"
        />

        {/* Sync status - not resizable */}
        <div
          className="text-center flex-shrink-0"
          style={{ width: columnWidths.sync }}
        >
          {t("view.columns.syncStatus")}
        </div>
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
          className="fixed z-50 min-w-[160px] bg-background border border-border rounded-md shadow-xl py-1"
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
                        const playlist = await createPlaylist(name);
                        const songIds =
                          selectedSongIds.size > 0
                            ? Array.from(selectedSongIds)
                            : [contextMenu.song.id];
                        await addSongsToPlaylist(playlist.id, songIds);
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
                {playlists.length > 0 && (
                  <>
                    <div className="border-t border-border my-1" />
                    {playlists.map((playlist) => (
                      <button
                        key={playlist.id}
                        onClick={async () => {
                          try {
                            const songIds =
                              selectedSongIds.size > 0
                                ? Array.from(selectedSongIds)
                                : [contextMenu.song.id];
                            await addSongsToPlaylist(playlist.id, songIds);
                            queryClient.invalidateQueries({
                              queryKey: ["playlists"],
                            });
                            queryClient.invalidateQueries({
                              queryKey: ["playlist-songs", playlist.id],
                            });
                            setContextMenu(null);
                          } catch (error) {
                            console.error("Failed to add to playlist:", error);
                          }
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-left truncate"
                      >
                        {playlist.name}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
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
          onSave={async (updatedSong) => {
            // Update local state
            setSongs(
              songs.map((s) => (s.id === updatedSong.id ? updatedSong : s))
            );
            await queryClient.invalidateQueries({ queryKey: ["songs"] });
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
  onSave: (song: Song) => Promise<void>;
}

function MetadataEditor({ song, onClose, onSave }: MetadataEditorProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist || "");
  const [album, setAlbum] = useState(song.album || "");
  const [albumArtist, setAlbumArtist] = useState(song.albumArtist || "");
  const [trackNumber, setTrackNumber] = useState(
    song.trackNumber?.toString() || ""
  );
  const [trackTotal, setTrackTotal] = useState(
    song.trackTotal?.toString() || ""
  );
  const [discNumber, setDiscNumber] = useState(
    song.discNumber?.toString() || ""
  );
  const [discTotal, setDiscTotal] = useState(song.discTotal?.toString() || "");
  const [year, setYear] = useState(song.year?.toString() || "");
  const [genre, setGenre] = useState(song.genre || "");

  const handleSave = async () => {
    try {
      setSaving(true);
      const metadata = {
        title: title || undefined,
        artist: artist || undefined,
        album: album || undefined,
        albumArtist: albumArtist || undefined,
        trackNumber: trackNumber ? parseInt(trackNumber, 10) : undefined,
        trackTotal: trackTotal ? parseInt(trackTotal, 10) : undefined,
        discNumber: discNumber ? parseInt(discNumber, 10) : undefined,
        discTotal: discTotal ? parseInt(discTotal, 10) : undefined,
        year: year ? parseInt(year, 10) : undefined,
        genre: genre || undefined,
      };

      const updatedSong = await updateSongMetadata(song.id, metadata);
      await onSave(updatedSong);
    } catch (error) {
      console.error("Failed to save metadata:", error);
    } finally {
      setSaving(false);
    }
  };

  // Read-only fields
  const readOnlyFields = [
    {
      label: t("metadata.duration", "Duration"),
      value: formatDuration(song.durationMs),
    },
    { label: t("metadata.format", "Format"), value: song.format.toUpperCase() },
    {
      label: t("metadata.bitrate", "Bitrate"),
      value: song.bitrate ? `${song.bitrate} kbps` : "-",
    },
    {
      label: t("metadata.sampleRate", "Sample Rate"),
      value: song.sampleRate ? `${song.sampleRate} Hz` : "-",
    },
    {
      label: t("metadata.bitDepth", "Bit Depth"),
      value: song.bitDepth ? `${song.bitDepth}-bit` : "-",
    },
    { label: t("metadata.channels", "Channels"), value: song.channels || "-" },
    {
      label: t("metadata.filePath", "File Path"),
      value: song.filePath,
      mono: true,
    },
    {
      label: t("metadata.fileSize", "File Size"),
      value: `${(song.fileSize / 1024 / 1024).toFixed(2)} MB`,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold">
            {t("metadata.editTitle", "Edit Metadata")}
          </h2>
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

          {/* Editable Metadata Fields */}
          <div className="flex-1 space-y-3">
            {/* Title */}
            <div>
              <label className="text-xs text-muted-foreground">
                {t("metadata.title", "Title")}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Artist */}
            <div>
              <label className="text-xs text-muted-foreground">
                {t("metadata.artist", "Artist")}
              </label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                className="w-full px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Album */}
            <div>
              <label className="text-xs text-muted-foreground">
                {t("metadata.album", "Album")}
              </label>
              <input
                type="text"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                className="w-full px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Album Artist */}
            <div>
              <label className="text-xs text-muted-foreground">
                {t("metadata.albumArtist", "Album Artist")}
              </label>
              <input
                type="text"
                value={albumArtist}
                onChange={(e) => setAlbumArtist(e.target.value)}
                className="w-full px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Track / Disc Numbers */}
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">
                  {t("metadata.track", "Track")}
                </label>
                <input
                  type="number"
                  value={trackNumber}
                  onChange={(e) => setTrackNumber(e.target.value)}
                  className="w-full px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
                  min="1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  {t("metadata.of", "of")}
                </label>
                <input
                  type="number"
                  value={trackTotal}
                  onChange={(e) => setTrackTotal(e.target.value)}
                  className="w-full px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
                  min="1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  {t("metadata.disc", "Disc")}
                </label>
                <input
                  type="number"
                  value={discNumber}
                  onChange={(e) => setDiscNumber(e.target.value)}
                  className="w-full px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
                  min="1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  {t("metadata.of", "of")}
                </label>
                <input
                  type="number"
                  value={discTotal}
                  onChange={(e) => setDiscTotal(e.target.value)}
                  className="w-full px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
                  min="1"
                />
              </div>
            </div>

            {/* Year & Genre */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">
                  {t("metadata.year", "Year")}
                </label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="w-full px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
                  min="1900"
                  max="2099"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  {t("metadata.genre", "Genre")}
                </label>
                <input
                  type="text"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  className="w-full px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-border my-2 pt-2">
              <h3 className="text-xs font-medium text-muted-foreground mb-2">
                {t("metadata.fileInfo", "File Information")}
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {readOnlyFields.map(({ label, value, mono }) => (
                  <div key={label} className={mono ? "col-span-2" : ""}>
                    <span className="text-xs text-muted-foreground">
                      {label}:{" "}
                    </span>
                    <span
                      className={cn("text-xs", mono && "font-mono")}
                      title={String(value)}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border bg-background-secondary">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent transition-colors"
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {t("common.save", "Save")}
          </button>
        </div>
      </div>
    </div>
  );
}
