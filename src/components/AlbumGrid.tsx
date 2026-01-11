import { useMemo, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Grid, CellComponentProps } from "react-window";
import { AutoSizer } from "react-virtualized-auto-sizer";
import { Disc3, X, Play } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import { useLibraryStore, usePlayerStore } from "@/store";
import { useQuery } from "@tanstack/react-query";
import { getSongs, playSong } from "@/api/tauri";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Album, Song } from "@/types";

const CARD_WIDTH = 180;
const CARD_HEIGHT = 220;
const GAP = 16;

function songsToAlbums(songs: Song[]): Album[] {
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
        dateAdded: song.dateAdded,
      });
    }

    const album = albumMap.get(key)!;
    album.trackCount++;
    album.totalDurationMs += song.durationMs;

    if (!album.artCachePath && song.artCachePath) {
      album.artCachePath = song.artCachePath;
    }
  }

  return Array.from(albumMap.values()).sort((a, b) =>
    (a.albumArtist || a.artist || "").localeCompare(
      b.albumArtist || b.artist || ""
    )
  );
}

interface AlbumCardProps {
  album: Album;
  onClick: () => void;
}

function AlbumCard({ album, onClick }: AlbumCardProps) {
  // Convert local file path to URL that Tauri can load
  const artworkUrl = album.artCachePath
    ? convertFileSrc(album.artCachePath)
    : null;

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
            <Disc3 className="w-12 h-12 text-muted-foreground/50" />
          </div>
        )}
      </div>
      <div className="album-info">
        <p className="text-sm font-medium truncate" title={album.title}>
          {album.title}
        </p>
        <p
          className="text-xs text-muted-foreground truncate"
          title={album.albumArtist || album.artist || ""}
        >
          {album.albumArtist || album.artist || "Unknown Artist"}
        </p>
        <p className="text-xs text-muted-foreground">
          {album.trackCount} tracks • {formatDuration(album.totalDurationMs)}
        </p>
      </div>
    </div>
  );
}

interface CellData {
  albums: Album[];
  columnCount: number;
  handleClick: (album: Album) => void;
}

// Cell component for react-window v2
function VirtualCell({
  columnIndex,
  rowIndex,
  style,
  ...cellProps
}: CellComponentProps<CellData>) {
  const { albums, columnCount, handleClick } = cellProps;
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
      <AlbumCard album={album} onClick={() => handleClick(album)} />
    </div>
  );
}

export function AlbumGrid() {
  const { t } = useTranslation();
  const { songs, setSongs, searchQuery } = useLibraryStore();
  const { setQueue, setCurrentSong, setIsPlaying } = usePlayerStore();
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);

  const { data: fetchedSongs } = useQuery({
    queryKey: ["songs"],
    queryFn: getSongs,
  });

  useEffect(() => {
    if (fetchedSongs) {
      setSongs(fetchedSongs);
    }
  }, [fetchedSongs, setSongs]);

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

    return songsToAlbums(filtered);
  }, [songs, searchQuery]);

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
    setQueue(albumSongs);
    setCurrentSong(albumSongs[0]);
    setIsPlaying(true);
    try {
      await playSong(albumSongs[0].filePath);
    } catch (error) {
      console.error("Failed to play album:", error);
    }
  }, [albumSongs, setQueue, setCurrentSong, setIsPlaying]);

  const handlePlaySong = useCallback(
    async (song: Song, index: number) => {
      const queue = albumSongs.slice(index);
      setQueue(queue);
      setCurrentSong(song);
      setIsPlaying(true);
      try {
        await playSong(song.filePath);
      } catch (error) {
        console.error("Failed to play song:", error);
      }
    },
    [albumSongs, setQueue, setCurrentSong, setIsPlaying]
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
    const artworkUrl = selectedAlbum.artCachePath
      ? convertFileSrc(selectedAlbum.artCachePath)
      : null;

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
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
            <button
              onClick={() => setSelectedAlbum(null)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              <X className="w-3 h-3" />
              {t("common.back", "Back to albums")}
            </button>
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

        {/* Song List */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-2">
            {albumSongs.map((song, index) => (
              <div
                key={song.id}
                className="flex items-center gap-3 px-3 py-2 rounded hover:bg-accent cursor-pointer group"
                onDoubleClick={() => handlePlaySong(song, index)}
              >
                <span className="w-6 text-sm text-muted-foreground text-right tabular-nums">
                  {song.trackNumber || "-"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="truncate">{song.title}</p>
                  {song.artist !== selectedAlbum.albumArtist &&
                    song.artist !== selectedAlbum.artist && (
                      <p className="text-xs text-muted-foreground truncate">
                        {song.artist}
                      </p>
                    )}
                </div>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {formatDuration(song.durationMs)}
                </span>
                <button
                  onClick={() => handlePlaySong(song, index)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-primary/20 rounded transition-all"
                >
                  <Play className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
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
              Math.floor((width - GAP) / (CARD_WIDTH + GAP))
            );
            const rowCount = Math.ceil(albums.length / columnCount);

            return (
              <Grid
                style={{ height, width }}
                columnCount={columnCount}
                rowCount={rowCount}
                columnWidth={CARD_WIDTH + GAP}
                rowHeight={CARD_HEIGHT + GAP}
                cellProps={{
                  albums,
                  columnCount,
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
