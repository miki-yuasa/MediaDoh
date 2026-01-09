import { useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Grid, CellComponentProps } from "react-window";
import { AutoSizer } from "react-virtualized-auto-sizer";
import { Disc3 } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import { useLibraryStore } from "@/store";
import { useQuery } from "@tanstack/react-query";
import { getSongs } from "@/api/tauri";
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
  return (
    <div className="album-card" onClick={onClick}>
      <div className="album-art">
        {album.artCachePath ? (
          <img
            src={album.artCachePath}
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

  const handleAlbumClick = useCallback((album: Album) => {
    console.log("Album clicked:", album);
  }, []);

  if (songs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
        <Disc3 className="w-16 h-16 text-muted-foreground/50 mb-4" />
        <h2 className="text-lg font-medium mb-2">{t("library.noSongs")}</h2>
        <p className="text-sm text-muted-foreground">{t("library.addMusic")}</p>
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
