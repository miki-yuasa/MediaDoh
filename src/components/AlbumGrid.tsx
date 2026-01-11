import { useMemo, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Grid, CellComponentProps } from "react-window";
import { AutoSizer } from "react-virtualized-auto-sizer";
import { Disc3, Play, ArrowLeft, Check, AlertCircle } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { useLibraryStore, usePlayerStore } from "@/store";
import { useQuery } from "@tanstack/react-query";
import { getSongs, playSong } from "@/api/tauri";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Album, Song } from "@/types";
import type { AlbumSize, AlbumSortField } from "./MainContent";

// Album card sizes
const ALBUM_SIZES = {
  small: { width: 140, height: 180 },
  medium: { width: 180, height: 220 },
  large: { width: 220, height: 270 },
};
const GAP = 16;

function songsToAlbums(songs: Song[], sortField: AlbumSortField): Album[] {
  const albumMap = new Map<string, Album>();

  for (const song of songs) {
    const key = `${song.albumArtist || song.artist || ""}-${song.album || ""}`;

    if (!albumMap.has(key)) {
      albumMap.set(key, {
        id: key,
        title: song.album || "Unknown Album",
        artist: song.artist,
        albumArtist: song.albumArtist,
        year: song.year,
        genre: song.genre,
        trackCount: 0,
        totalDurationMs: 0,
        artCachePath: song.artCachePath,
        artworkData: song.artworkData,
        dateAdded: song.dateAdded,
      });
    }

    const album = albumMap.get(key)!;
    album.trackCount++;
    album.totalDurationMs += song.durationMs;

    // Prefer artworkData over artCachePath
    if (!album.artworkData && song.artworkData) {
      album.artworkData = song.artworkData;
    }
    if (!album.artCachePath && song.artCachePath) {
      album.artCachePath = song.artCachePath;
    }
  }

  const albums = Array.from(albumMap.values());

  // Sort based on sortField
  switch (sortField) {
    case "year":
      return albums.sort((a, b) => (b.year || 0) - (a.year || 0));
    case "dateAdded":
      return albums.sort(
        (a, b) =>
          new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()
      );
    case "title":
      return albums.sort((a, b) => a.title.localeCompare(b.title));
    case "artist":
    default:
      return albums.sort((a, b) =>
        (a.albumArtist || a.artist || "").localeCompare(
          b.albumArtist || b.artist || ""
        )
      );
  }
}

interface AlbumCardProps {
  album: Album;
  size: AlbumSize;
  onClick: () => void;
}

function AlbumCard({ album, size, onClick }: AlbumCardProps) {
  // Prefer artworkData (base64), fall back to artCachePath
  const artworkUrl =
    album.artworkData ||
    (album.artCachePath ? convertFileSrc(album.artCachePath) : null);

  const iconSize =
    size === "small" ? "w-8 h-8" : size === "large" ? "w-16 h-16" : "w-12 h-12";
  const titleSize = size === "small" ? "text-xs" : "text-sm";
  const subtitleSize = size === "small" ? "text-[10px]" : "text-xs";

  return (
    <div className="album-card" onClick={onClick}>
      <div className="album-art">
        {artworkUrl ? (
          <img
            src={artworkUrl}
            alt={album.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Disc3 className={cn(iconSize, "text-muted-foreground/50")} />
          </div>
        )}
      </div>
      <div className="album-info">
        <p
          className={cn(titleSize, "font-medium truncate")}
          title={album.title}
        >
          {album.title}
        </p>
        <p
          className={cn(subtitleSize, "text-muted-foreground truncate")}
          title={album.albumArtist || album.artist || ""}
        >
          {album.albumArtist || album.artist || "Unknown Artist"}
        </p>
        <p className={cn(subtitleSize, "text-muted-foreground")}>
          {album.trackCount} tracks • {formatDuration(album.totalDurationMs)}
        </p>
      </div>
    </div>
  );
}

interface CellData {
  albums: Album[];
  columnCount: number;
  albumSize: AlbumSize;
  handleClick: (album: Album) => void;
}

// Cell component for react-window v2
function VirtualCell({
  columnIndex,
  rowIndex,
  style,
  ...cellProps
}: CellComponentProps<CellData>) {
  const { albums, columnCount, albumSize, handleClick } = cellProps;
  const index = rowIndex * columnCount + columnIndex;

  if (index >= albums.length) return <div style={style} />;

  const album = albums[index];

  return (
    <div
      style={{
        ...style,
        padding: GAP / 2,
      }}
    >
      <AlbumCard
        album={album}
        size={albumSize}
        onClick={() => handleClick(album)}
      />
    </div>
  );
}

interface AlbumGridProps {
  albumSize?: AlbumSize;
  sortField?: AlbumSortField;
}

export function AlbumGrid({
  albumSize = "medium",
  sortField = "artist",
}: AlbumGridProps) {
  const { t } = useTranslation();
  const { songs, setSongs, searchQuery } = useLibraryStore();
  const { setQueue, setCurrentSong, setIsPlaying, shuffle } = usePlayerStore();
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);

  // Get card dimensions based on size
  const cardWidth = ALBUM_SIZES[albumSize].width;
  const cardHeight = ALBUM_SIZES[albumSize].height;

  const { data: fetchedSongs } = useQuery({
    queryKey: ["songs"],
    queryFn: getSongs,
  });

  useEffect(() => {
    if (fetchedSongs) {
      setSongs(fetchedSongs);
    }
  }, [fetchedSongs, setSongs]);

  // Sort all songs by album artist, album, track for continuous playback
  const sortedSongs = useMemo(() => {
    return [...songs].sort((a, b) => {
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

      // Sort by disc number
      const discA = a.discNumber || 1;
      const discB = b.discNumber || 1;
      if (discA !== discB) return discA - discB;

      // Finally, sort by track number within the same album
      const aTrack = a.trackNumber || 999;
      const bTrack = b.trackNumber || 999;
      return aTrack - bTrack;
    });
  }, [songs]);

  const albums = useMemo(() => {
    let filtered = songs;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = songs.filter(
        (song) =>
          song.album?.toLowerCase().includes(query) ||
          song.artist?.toLowerCase().includes(query) ||
          song.albumArtist?.toLowerCase().includes(query)
      );
    }

    return songsToAlbums(filtered, sortField);
  }, [songs, searchQuery, sortField]);

  // Get songs for selected album
  const albumSongs = useMemo(() => {
    if (!selectedAlbum) return [];
    return songs
      .filter((song) => {
        const albumKey = `${song.albumArtist || song.artist || ""}-${
          song.album || ""
        }`;
        return albumKey === selectedAlbum.id;
      })
      .sort((a, b) => {
        // Sort by disc number first, then track number
        const discA = a.discNumber || 1;
        const discB = b.discNumber || 1;
        if (discA !== discB) return discA - discB;
        const trackA = a.trackNumber || 999;
        const trackB = b.trackNumber || 999;
        return trackA - trackB;
      });
  }, [selectedAlbum, songs]);

  const handleAlbumClick = useCallback((album: Album) => {
    setSelectedAlbum(album);
  }, []);

  const handlePlayAlbum = useCallback(async () => {
    if (albumSongs.length === 0) return;

    // If shuffle is on, just queue the current album songs shuffled
    if (shuffle) {
      const shuffledSongs = [...albumSongs].sort(() => Math.random() - 0.5);
      setQueue(shuffledSongs);
      setCurrentSong(shuffledSongs[0]);
      setIsPlaying(true);
      try {
        await playSong(shuffledSongs[0].filePath);
      } catch (error) {
        console.error("Failed to play album:", error);
      }
      return;
    }

    // Find the index of the first song of this album in the sorted songs list
    const firstAlbumSongIndex = sortedSongs.findIndex(
      (s) => s.id === albumSongs[0].id
    );
    // Queue all songs from this album onwards
    const queue =
      firstAlbumSongIndex >= 0
        ? sortedSongs.slice(firstAlbumSongIndex)
        : albumSongs;

    setQueue(queue);
    setCurrentSong(queue[0]);
    setIsPlaying(true);
    try {
      await playSong(queue[0].filePath);
    } catch (error) {
      console.error("Failed to play album:", error);
    }
  }, [
    albumSongs,
    sortedSongs,
    shuffle,
    setQueue,
    setCurrentSong,
    setIsPlaying,
  ]);

  const handlePlaySong = useCallback(
    async (song: Song, index: number) => {
      // If shuffle is on, just queue remaining songs in album shuffled
      if (shuffle) {
        const shuffledSongs = [...albumSongs.slice(index)].sort(
          () => Math.random() - 0.5
        );
        setQueue(shuffledSongs);
        setCurrentSong(song);
        setIsPlaying(true);
        try {
          await playSong(song.filePath);
        } catch (error) {
          console.error("Failed to play song:", error);
        }
        return;
      }

      // Find the index of this song in the sorted songs list
      const songIndexInSorted = sortedSongs.findIndex((s) => s.id === song.id);
      // Queue all songs from this song onwards (continues to next albums)
      const queue =
        songIndexInSorted >= 0
          ? sortedSongs.slice(songIndexInSorted)
          : albumSongs.slice(index);

      setQueue(queue);
      setCurrentSong(song);
      setIsPlaying(true);
      try {
        await playSong(song.filePath);
      } catch (error) {
        console.error("Failed to play song:", error);
      }
    },
    [albumSongs, sortedSongs, shuffle, setQueue, setCurrentSong, setIsPlaying]
  );

  if (songs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
        <Disc3 className="w-16 h-16 text-muted-foreground/50 mb-4" />
        <h2 className="text-lg font-medium mb-2">{t("library.noSongs")}</h2>
        <p className="text-sm text-muted-foreground">{t("library.addMusic")}</p>
      </div>
    );
  }

  // Album Detail View
  if (selectedAlbum) {
    const artworkUrl =
      selectedAlbum.artworkData ||
      (selectedAlbum.artCachePath
        ? convertFileSrc(selectedAlbum.artCachePath)
        : null);

    const currentSongId = usePlayerStore.getState().currentSong?.id;

    const SyncIndicator = ({ status }: { status: string }) => {
      switch (status) {
        case "synced":
          return <Check className="w-3 h-3 text-synced" />;
        case "update_needed":
          return <AlertCircle className="w-3 h-3 text-sync-warning" />;
        default:
          return <span className="w-3 h-3" />;
      }
    };

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Back Button */}
        <div className="px-4 py-2 border-b border-border bg-background">
          <button
            onClick={() => setSelectedAlbum(null)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("common.backToAlbums", "Back to Albums")}
          </button>
        </div>

        {/* Album Header */}
        <div className="flex items-start gap-6 p-6 bg-background-secondary border-b border-border">
          {/* Album Art */}
          <div className="w-48 h-48 flex-shrink-0 rounded-lg overflow-hidden bg-muted shadow-lg">
            {artworkUrl ? (
              <img
                src={artworkUrl}
                alt={selectedAlbum.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Disc3 className="w-16 h-16 text-muted-foreground/50" />
              </div>
            )}
          </div>

          {/* Album Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate mb-1">
              {selectedAlbum.title}
            </h1>
            <p className="text-lg text-muted-foreground truncate mb-1">
              {selectedAlbum.albumArtist ||
                selectedAlbum.artist ||
                t("common.unknownArtist", "Unknown Artist")}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              {selectedAlbum.year && `${selectedAlbum.year} • `}
              {selectedAlbum.trackCount} {t("library.tracks", "tracks")} •{" "}
              {formatDuration(selectedAlbum.totalDurationMs)}
            </p>
            <button
              onClick={handlePlayAlbum}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors"
            >
              <Play className="w-4 h-4 fill-current" />
              {t("player.play", "Play")}
            </button>
          </div>
        </div>

        {/* Column Headers */}
        <div className="flex items-center px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase border-b border-border bg-background-secondary">
          <span className="w-8 text-right flex-shrink-0">#</span>
          <span className="flex-1 min-w-0 px-2">
            {t("library.title", "Title")}
          </span>
          <span className="w-40 px-2">{t("library.artist", "Artist")}</span>
          <span className="w-14 text-right flex-shrink-0">
            {t("library.duration", "Duration")}
          </span>
          <span className="w-12 text-center flex-shrink-0">
            {t("library.format", "Format")}
          </span>
          <span className="w-6 flex-shrink-0"></span>
        </div>

        {/* Song List */}
        <div className="flex-1 overflow-y-auto">
          {albumSongs.map((song, index) => {
            const isPlaying = currentSongId === song.id;
            return (
              <div
                key={song.id}
                className={cn(
                  "song-row select-none cursor-pointer",
                  isPlaying && "playing"
                )}
                onDoubleClick={() => handlePlaySong(song, index)}
              >
                <span className="w-8 text-xs text-muted-foreground text-right flex-shrink-0">
                  {song.trackNumber || "-"}
                </span>
                <span
                  className={cn(
                    "flex-1 min-w-0 px-2 truncate",
                    isPlaying && "text-primary font-medium"
                  )}
                >
                  {song.title}
                </span>
                <span className="w-40 px-2 truncate text-muted-foreground">
                  {song.artist || "-"}
                </span>
                <span className="w-14 text-right flex-shrink-0 text-muted-foreground tabular-nums">
                  {formatDuration(song.durationMs)}
                </span>
                <span className="w-12 text-center flex-shrink-0 text-xs text-muted-foreground uppercase">
                  {song.format}
                </span>
                <span className="w-6 flex-shrink-0 flex items-center justify-center">
                  <SyncIndicator status={song.syncStatus} />
                </span>
              </div>
            );
          })}
        </div>

        {/* Status Bar */}
        <div className="px-3 py-1.5 border-t border-border bg-background-secondary text-xs text-muted-foreground">
          {albumSongs.length} {t("library.tracks", "tracks")} •{" "}
          {formatDuration(selectedAlbum.totalDurationMs)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1">
        <AutoSizer
          renderProp={({ height, width }) => {
            if (!height || !width) return null;

            const columnCount = Math.max(
              1,
              Math.floor((width - GAP) / (cardWidth + GAP))
            );
            const rowCount = Math.ceil(albums.length / columnCount);

            return (
              <Grid
                style={{ height, width }}
                columnCount={columnCount}
                rowCount={rowCount}
                columnWidth={cardWidth + GAP}
                rowHeight={cardHeight + GAP}
                cellProps={{
                  albums,
                  columnCount,
                  albumSize,
                  handleClick: handleAlbumClick,
                }}
                overscanCount={2}
                cellComponent={VirtualCell}
              />
            );
          }}
        />
      </div>

      {/* Status Bar */}
      <div className="px-3 py-1.5 border-t border-border bg-background-secondary text-xs text-muted-foreground">
        {albums.length} albums
        {searchQuery && ` (filtered)`}
      </div>
    </div>
  );
}
