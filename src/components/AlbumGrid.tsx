import { useMemo, useCallback, useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Grid,
  List,
  CellComponentProps,
  RowComponentProps,
} from "react-window";
import { AutoSizer } from "react-virtualized-auto-sizer";
import {
  Disc3,
  Play,
  ArrowLeft,
  Check,
  AlertCircle,
  ListPlus,
  ChevronRight,
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { useLibraryStore, usePlayerStore } from "@/store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSongs,
  playSong,
  getPlaylists,
  addSongsToPlaylist,
  createPlaylist,
  getPlaylistSongs,
} from "@/api/tauri";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Album, Song } from "@/types";
import type { AlbumSize, AlbumSortField, AlbumViewMode } from "./MainContent";

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
    <div className="album-card" onClick={onClick} title={album.title}>
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

// List row height
const LIST_ROW_HEIGHT = 48;

interface ListItemData {
  albums: Album[];
  handleClick: (album: Album) => void;
}

// List row component for react-window v2
function VirtualListRow({
  index,
  style,
  ...itemProps
}: RowComponentProps<ListItemData>) {
  const { t } = useTranslation();
  const { albums, handleClick } = itemProps;
  const album = albums[index];

  if (!album) return <div style={style} />;

  // Prefer artworkData (base64), fall back to artCachePath
  const artworkUrl =
    album.artworkData ||
    (album.artCachePath ? convertFileSrc(album.artCachePath) : null);

  return (
    <div
      style={style}
      className="flex items-center px-2 hover:bg-accent/50 cursor-pointer transition-colors border-b border-border/50"
      onClick={() => handleClick(album)}
    >
      {/* Album Art */}
      <div className="w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-muted mr-3">
        {artworkUrl ? (
          <img
            src={artworkUrl}
            alt={album.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Disc3 className="w-5 h-5 text-muted-foreground/50" />
          </div>
        )}
      </div>
      {/* Album Title */}
      <span className="flex-1 min-w-0 truncate font-medium text-sm pr-2">
        {album.title}
      </span>
      {/* Album Artist */}
      <span className="w-48 truncate text-sm text-muted-foreground px-2">
        {album.albumArtist ||
          album.artist ||
          t("common.unknownArtist", "Unknown Artist")}
      </span>
      {/* Year */}
      <span className="w-16 text-center text-xs text-muted-foreground tabular-nums">
        {album.year || "-"}
      </span>
      {/* Track Count */}
      <span className="w-16 text-center text-xs text-muted-foreground tabular-nums">
        {album.trackCount}
      </span>
      {/* Duration */}
      <span className="w-20 text-right text-xs text-muted-foreground tabular-nums pr-2">
        {formatDuration(album.totalDurationMs)}
      </span>
    </div>
  );
}

interface AlbumGridProps {
  albumSize?: AlbumSize;
  sortField?: AlbumSortField;
  viewMode?: AlbumViewMode;
}

export function AlbumGrid({
  albumSize = "medium",
  sortField = "artist",
  viewMode = "grid",
}: AlbumGridProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { songs, setSongs, searchQuery } = useLibraryStore();
  const { setQueue, setCurrentSong, setIsPlaying, setIsPaused, shuffle } =
    usePlayerStore();
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    song: Song;
  } | null>(null);
  const [showPlaylistSubmenu, setShowPlaylistSubmenu] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Fetch playlists for context menu
  const { data: playlists = [] } = useQuery({
    queryKey: ["playlists"],
    queryFn: getPlaylists,
  });

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
      setIsPaused(false);
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
    setIsPaused(false);
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
    setIsPaused,
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
        setIsPaused(false);
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
      setIsPaused(false);
      try {
        await playSong(song.filePath);
      } catch (error) {
        console.error("Failed to play song:", error);
      }
    },
    [
      albumSongs,
      sortedSongs,
      shuffle,
      setQueue,
      setCurrentSong,
      setIsPlaying,
      setIsPaused,
    ]
  );

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
      const index = albumSongs.findIndex((s) => s.id === song.id);
      if (index !== -1) {
        await handlePlaySong(song, index);
      }
      setContextMenu(null);
    },
    [albumSongs, handlePlaySong]
  );

  // Helper function to add songs to playlist with duplicate check
  const handleAddToPlaylist = useCallback(
    async (playlistId: string, songIds: string[]) => {
      try {
        const existingSongs = await getPlaylistSongs(playlistId);
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
          playlistId,
          newSongs.length > 0 ? newSongs : songIds
        );
        queryClient.invalidateQueries({ queryKey: ["playlists"] });
        queryClient.invalidateQueries({
          queryKey: ["playlist-songs", playlistId],
        });
        setContextMenu(null);
      } catch (error) {
        console.error("Failed to add to playlist:", error);
      }
    },
    [queryClient, t]
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
          <span className="w-8 text-right flex-shrink-0 pr-2">#</span>
          <span className="flex-1 min-w-0 px-2">
            {t("view.columns.title", "Title")}
          </span>
          <span className="w-40 px-2">
            {t("view.columns.artist", "Artist")}
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
                onContextMenu={(e) => handleSongContextMenu(e, song)}
              >
                <span className="w-8 text-xs text-muted-foreground text-right flex-shrink-0 pr-2">
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
                <span className="w-12 text-center flex-shrink-0 text-xs text-muted-foreground tabular-nums">
                  {song.year || "-"}
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
                          const playlist = await createPlaylist(name);
                          await addSongsToPlaylist(playlist.id, [
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
                  {playlists.length > 0 && (
                    <>
                      <div className="border-t border-border my-1" />
                      {playlists.map((playlist) => (
                        <button
                          key={playlist.id}
                          onClick={() =>
                            handleAddToPlaylist(playlist.id, [
                              contextMenu.song.id,
                            ])
                          }
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
          </div>
        )}

        {/* Status Bar */}
        <div className="px-3 py-1.5 border-t border-border bg-background-secondary text-xs text-muted-foreground">
          {albumSongs.length} {t("library.tracks", "tracks")} •{" "}
          {formatDuration(selectedAlbum.totalDurationMs)}
        </div>
      </div>
    );
  }

  // List View
  if (viewMode === "list") {
    return (
      <div className="flex-1 flex flex-col">
        {/* Column Headers */}
        <div className="flex items-center px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase border-b border-border bg-background-secondary">
          <span className="w-10 flex-shrink-0 mr-3"></span>
          <span className="flex-1 min-w-0 pr-2">
            {t("view.columns.album", "Album")}
          </span>
          <span className="w-48 px-2">
            {t("view.columns.albumArtist", "Album Artist")}
          </span>
          <span className="w-16 text-center">
            {t("view.columns.year", "Year")}
          </span>
          <span className="w-16 text-center">
            {t("view.columns.tracks", "Tracks")}
          </span>
          <span className="w-20 text-right pr-2">
            {t("view.columns.duration", "Duration")}
          </span>
        </div>

        <div className="flex-1">
          <AutoSizer
            renderProp={({ height, width }) => {
              if (!height || !width) return null;

              return (
                <List
                  style={{ height, width }}
                  rowCount={albums.length}
                  rowHeight={LIST_ROW_HEIGHT}
                  rowProps={{
                    albums,
                    handleClick: handleAlbumClick,
                  }}
                  overscanCount={5}
                  rowComponent={VirtualListRow}
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

  // Grid View
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
