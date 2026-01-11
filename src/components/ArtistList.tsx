import { useMemo, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { User, Disc3, Play, X } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import { useLibraryStore, usePlayerStore } from "@/store";
import { useQuery } from "@tanstack/react-query";
import { getSongs, playSong } from "@/api/tauri";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Song, Album } from "@/types";

interface ArtistWithAlbums {
  name: string;
  albumCount: number;
  trackCount: number;
  albums: Album[];
  artworkData?: string | null;
  artCachePath?: string | null;
}

function songsToArtists(songs: Song[]): ArtistWithAlbums[] {
  const artistMap = new Map<string, ArtistWithAlbums>();
  const artistAlbums = new Map<string, Map<string, Album>>();

  for (const song of songs) {
    const artistName = song.albumArtist || song.artist || "Unknown Artist";
    const albumKey = `${artistName}-${song.album || ""}`;

    if (!artistMap.has(artistName)) {
      artistMap.set(artistName, {
        name: artistName,
        albumCount: 0,
        trackCount: 0,
        albums: [],
        artworkData: song.artworkData,
        artCachePath: song.artCachePath,
      });
      artistAlbums.set(artistName, new Map());
    }

    const artist = artistMap.get(artistName)!;
    artist.trackCount++;

    // Prefer artworkData
    if (!artist.artworkData && song.artworkData) {
      artist.artworkData = song.artworkData;
    }
    if (!artist.artCachePath && song.artCachePath) {
      artist.artCachePath = song.artCachePath;
    }

    // Track albums
    const albums = artistAlbums.get(artistName)!;
    if (!albums.has(albumKey)) {
      albums.set(albumKey, {
        id: albumKey,
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
    const album = albums.get(albumKey)!;
    album.trackCount++;
    album.totalDurationMs += song.durationMs;
    if (!album.artworkData && song.artworkData) {
      album.artworkData = song.artworkData;
    }
  }

  // Convert albums map to array
  for (const [artistName, albums] of artistAlbums) {
    const artist = artistMap.get(artistName)!;
    artist.albums = Array.from(albums.values()).sort(
      (a, b) => (b.year || 0) - (a.year || 0)
    );
    artist.albumCount = artist.albums.length;
  }

  return Array.from(artistMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export function ArtistList() {
  const { t } = useTranslation();
  const { songs, setSongs, searchQuery } = useLibraryStore();
  const { setQueue, setCurrentSong, setIsPlaying, setIsPaused } =
    usePlayerStore();
  const [selectedArtist, setSelectedArtist] = useState<ArtistWithAlbums | null>(
    null
  );

  const { data: fetchedSongs } = useQuery({
    queryKey: ["songs"],
    queryFn: getSongs,
  });

  useEffect(() => {
    if (fetchedSongs) {
      setSongs(fetchedSongs);
    }
  }, [fetchedSongs, setSongs]);

  const artists = useMemo(() => {
    let filtered = songs;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = songs.filter(
        (song) =>
          song.artist?.toLowerCase().includes(query) ||
          song.albumArtist?.toLowerCase().includes(query)
      );
    }

    return songsToArtists(filtered);
  }, [songs, searchQuery]);

  // Get songs for selected artist
  const artistSongs = useMemo(() => {
    if (!selectedArtist) return [];
    return songs
      .filter((song) => {
        const artistName = song.albumArtist || song.artist || "Unknown Artist";
        return artistName === selectedArtist.name;
      })
      .sort((a, b) => {
        // Sort by album, then disc, then track
        const albumCmp = (a.album || "").localeCompare(b.album || "");
        if (albumCmp !== 0) return albumCmp;
        const discA = a.discNumber || 1;
        const discB = b.discNumber || 1;
        if (discA !== discB) return discA - discB;
        return (a.trackNumber || 999) - (b.trackNumber || 999);
      });
  }, [selectedArtist, songs]);

  const handlePlayArtist = useCallback(async () => {
    if (artistSongs.length === 0) return;
    setQueue(artistSongs);
    setCurrentSong(artistSongs[0]);
    setIsPlaying(true);
    setIsPaused(false);
    try {
      await playSong(artistSongs[0].filePath);
    } catch (error) {
      console.error("Failed to play artist:", error);
    }
  }, [artistSongs, setQueue, setCurrentSong, setIsPlaying, setIsPaused]);

  const handlePlaySong = useCallback(
    async (song: Song, index: number) => {
      const queue = artistSongs.slice(index);
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
    [artistSongs, setQueue, setCurrentSong, setIsPlaying, setIsPaused]
  );

  if (songs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
        <User className="w-16 h-16 text-muted-foreground/50 mb-4" />
        <h2 className="text-lg font-medium mb-2">{t("library.noSongs")}</h2>
        <p className="text-sm text-muted-foreground">{t("library.addMusic")}</p>
      </div>
    );
  }

  // Artist Detail View
  if (selectedArtist) {
    const artworkUrl =
      selectedArtist.artworkData ||
      (selectedArtist.artCachePath
        ? convertFileSrc(selectedArtist.artCachePath)
        : null);

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Artist Header */}
        <div className="flex items-start gap-6 p-6 bg-background-secondary border-b border-border">
          {/* Artist Image */}
          <div className="w-48 h-48 flex-shrink-0 rounded-full overflow-hidden bg-muted shadow-lg">
            {artworkUrl ? (
              <img
                src={artworkUrl}
                alt={selectedArtist.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="w-16 h-16 text-muted-foreground/50" />
              </div>
            )}
          </div>

          {/* Artist Info */}
          <div className="flex-1 min-w-0">
            <button
              onClick={() => setSelectedArtist(null)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              <X className="w-3 h-3" />
              {t("common.back", "Back to artists")}
            </button>
            <h1 className="text-2xl font-bold truncate mb-1">
              {selectedArtist.name}
            </h1>
            <p className="text-sm text-muted-foreground mb-4">
              {selectedArtist.albumCount} {t("library.albums", "albums")} •{" "}
              {selectedArtist.trackCount} {t("library.tracks", "tracks")}
            </p>
            <button
              onClick={handlePlayArtist}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors"
            >
              <Play className="w-4 h-4 fill-current" />
              {t("player.play", "Play")}
            </button>
          </div>
        </div>

        {/* Albums and Songs */}
        <div className="flex-1 overflow-y-auto">
          {selectedArtist.albums.map((album) => {
            const albumSongs = artistSongs.filter(
              (s) =>
                `${s.albumArtist || s.artist || ""}-${s.album || ""}` ===
                album.id
            );
            const albumArt =
              album.artworkData ||
              (album.artCachePath ? convertFileSrc(album.artCachePath) : null);

            return (
              <div key={album.id} className="border-b border-border">
                {/* Album Header */}
                <div className="flex items-center gap-4 p-4 bg-background-secondary/50">
                  <div className="w-16 h-16 flex-shrink-0 rounded overflow-hidden bg-muted">
                    {albumArt ? (
                      <img
                        src={albumArt}
                        alt={album.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Disc3 className="w-8 h-8 text-muted-foreground/50" />
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{album.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {album.year && `${album.year} • `}
                      {album.trackCount} {t("library.tracks", "tracks")}
                    </p>
                  </div>
                </div>

                {/* Songs */}
                <div className="px-4 py-2">
                  {albumSongs.map((song) => {
                    const songIndex = artistSongs.indexOf(song);
                    return (
                      <div
                        key={song.id}
                        className="flex items-center gap-3 px-3 py-2 rounded hover:bg-accent cursor-pointer group"
                        onDoubleClick={() => handlePlaySong(song, songIndex)}
                      >
                        <span className="w-6 text-sm text-muted-foreground text-right tabular-nums">
                          {song.trackNumber || "-"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="truncate">{song.title}</p>
                        </div>
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {formatDuration(song.durationMs)}
                        </span>
                        <button
                          onClick={() => handlePlaySong(song, songIndex)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-primary/20 rounded transition-all"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Status Bar */}
        <div className="px-3 py-1.5 border-t border-border bg-background-secondary text-xs text-muted-foreground">
          {selectedArtist.albumCount} {t("library.albums", "albums")} •{" "}
          {selectedArtist.trackCount} {t("library.tracks", "tracks")}
        </div>
      </div>
    );
  }

  // Artist List View
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {artists.map((artist) => {
          const artworkUrl =
            artist.artworkData ||
            (artist.artCachePath ? convertFileSrc(artist.artCachePath) : null);

          return (
            <div
              key={artist.name}
              className="flex items-center gap-4 px-4 py-3 border-b border-border/50 hover:bg-accent/50 cursor-pointer transition-colors"
              onClick={() => setSelectedArtist(artist)}
            >
              {/* Artist Image */}
              <div className="w-12 h-12 flex-shrink-0 rounded-full overflow-hidden bg-muted">
                {artworkUrl ? (
                  <img
                    src={artworkUrl}
                    alt={artist.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User className="w-6 h-6 text-muted-foreground/50" />
                  </div>
                )}
              </div>

              {/* Artist Info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{artist.name}</p>
                <p className="text-sm text-muted-foreground">
                  {artist.albumCount}{" "}
                  {artist.albumCount === 1
                    ? t("library.album", "album")
                    : t("library.albums", "albums")}{" "}
                  • {artist.trackCount}{" "}
                  {artist.trackCount === 1
                    ? t("library.track", "track")
                    : t("library.tracks", "tracks")}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Status Bar */}
      <div className="px-3 py-1.5 border-t border-border bg-background-secondary text-xs text-muted-foreground">
        {artists.length} {t("library.artists", "artists")}
        {searchQuery && ` (${t("common.filtered", "filtered")})`}
      </div>
    </div>
  );
}
