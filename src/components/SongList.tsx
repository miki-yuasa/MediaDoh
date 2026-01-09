import { useCallback, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { List, RowComponentProps } from "react-window";
import { AutoSizer } from "react-virtualized-auto-sizer";
import { Check, AlertCircle, Music } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { useLibraryStore, usePlayerStore } from "@/store";
import { useQuery } from "@tanstack/react-query";
import { getSongs, playSong } from "@/api/tauri";
import type { Song, SongGroup } from "@/types";

const ROW_HEIGHT = 32;

interface SongRowData {
  items: Array<{ song: Song; showAlbumArt: boolean }>;
  selectedSongIds: Set<string>;
  currentSongId: string | null;
  onSongClick: (e: React.MouseEvent, songId: string) => void;
  onSongDoubleClick: (song: Song) => void;
}

interface SongRowProps {
  song: Song;
  showAlbumArt: boolean;
  isSelected: boolean;
  isPlaying: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
}

function SongRow({
  song,
  showAlbumArt,
  isSelected,
  isPlaying,
  onClick,
  onDoubleClick,
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
      />
    </div>
  );
}

export function SongList() {
  const { t } = useTranslation();

  const {
    songs,
    setSongs,
    selectedSongIds,
    selectSong,
    searchQuery,
    sortConfig,
  } = useLibraryStore();

  const { currentSong, setQueue, setCurrentSong, setIsPlaying } =
    usePlayerStore();

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

    result.sort((a, b) => {
      const aValue = a[sortConfig.field as keyof Song];
      const bValue = b[sortConfig.field as keyof Song];

      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      let comparison: number;
      if (typeof aValue === "string" && typeof bValue === "string") {
        comparison = aValue.localeCompare(bValue);
      } else if (typeof aValue === "number" && typeof bValue === "number") {
        comparison = aValue - bValue;
      } else {
        comparison = String(aValue).localeCompare(String(bValue));
      }

      return sortConfig.order === "ascending" ? comparison : -comparison;
    });

    return result;
  }, [songs, searchQuery, sortConfig]);

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

  const rowData: SongRowData = useMemo(
    () => ({
      items: flattenedList,
      selectedSongIds,
      currentSongId: currentSong?.id || null,
      onSongClick: handleSongClick,
      onSongDoubleClick: handleSongDoubleClick,
    }),
    [
      flattenedList,
      selectedSongIds,
      currentSong,
      handleSongClick,
      handleSongDoubleClick,
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

      {/* Status Bar */}
      <div className="px-3 py-1.5 border-t border-border bg-background-secondary text-xs text-muted-foreground">
        {t("library.songs", { count: filteredSongs.length })}
        {searchQuery && ` (filtered from ${songs.length})`}
      </div>
    </div>
  );
}
