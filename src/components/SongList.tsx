import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FixedSizeList as List, ListChildComponentProps } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { Check, AlertCircle, Music } from 'lucide-react';
import { cn, formatDuration } from '@/lib/utils';
import { useLibraryStore, usePlayerStore } from '@/store';
import { useQuery } from '@tanstack/react-query';
import { getSongs, playSong } from '@/api/tauri';
import type { Song, SongGroup } from '@/types';

const ROW_HEIGHT = 32; // Compact row height for high-density

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
  const { t } = useTranslation();

  // Sync status indicator
  const SyncIndicator = () => {
    switch (song.syncStatus) {
      case 'synced':
        return <Check className="w-3 h-3 text-synced" />;
      case 'update_needed':
        return <AlertCircle className="w-3 h-3 text-sync-warning" />;
      default:
        return <span className="w-3 h-3" />;
    }
  };

  return (
    <div
      className={cn(
        'song-row',
        isSelected && 'selected',
        isPlaying && 'playing'
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {/* Album Art (only for first song of album group) */}
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

      {/* Track Number */}
      <span className="w-8 text-xs text-muted-foreground text-right flex-shrink-0">
        {song.trackNumber || '-'}
      </span>

      {/* Title */}
      <span className="flex-1 min-w-0 px-2 truncate">{song.title}</span>

      {/* Artist */}
      <span className="w-40 px-2 truncate text-muted-foreground">
        {song.artist || '-'}
      </span>

      {/* Album */}
      <span className="w-40 px-2 truncate text-muted-foreground">
        {song.album || '-'}
      </span>

      {/* Duration */}
      <span className="w-14 text-right duration flex-shrink-0">
        {formatDuration(song.durationMs)}
      </span>

      {/* Format Badge */}
      <span className="w-12 flex justify-center flex-shrink-0">
        <span className="format-badge text-[10px]">
          {song.format.toUpperCase()}
        </span>
      </span>

      {/* Sync Status */}
      <span className="w-6 flex justify-center flex-shrink-0">
        <SyncIndicator />
      </span>
    </div>
  );
}

// Group songs by album for visual grouping
function groupSongsByAlbum(songs: Song[]): SongGroup[] {
  const groups: SongGroup[] = [];
  let currentGroup: SongGroup | null = null;

  for (const song of songs) {
    const albumKey = `${song.albumArtist || song.artist || ''}-${song.album || ''}`;
    
    if (!currentGroup || 
        `${currentGroup.albumArtist || ''}-${currentGroup.album}` !== albumKey) {
      currentGroup = {
        album: song.album || 'Unknown Album',
        albumArtist: song.albumArtist || song.artist,
        artCachePath: song.artCachePath,
        songs: [],
      };
      groups.push(currentGroup);
    }
    
    currentGroup.songs.push(song);
  }

  return groups;
}

export function SongList() {
  const { t } = useTranslation();
  const listRef = useRef<List>(null);
  
  const { 
    songs, 
    setSongs, 
    selectedSongIds, 
    selectSong, 
    searchQuery,
    sortConfig,
  } = useLibraryStore();
  
  const { currentSong, setQueue, setCurrentSong, setIsPlaying } = usePlayerStore();

  // Fetch songs
  useQuery({
    queryKey: ['songs'],
    queryFn: getSongs,
    onSuccess: setSongs,
  });

  // Filter and sort songs
  const filteredSongs = useMemo(() => {
    let result = [...songs];

    // Filter by search query
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

    // Sort
    result.sort((a, b) => {
      const aValue = a[sortConfig.field as keyof Song];
      const bValue = b[sortConfig.field as keyof Song];

      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      let comparison = 0;
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue);
      } else if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      }

      return sortConfig.order === 'ascending' ? comparison : -comparison;
    });

    return result;
  }, [songs, searchQuery, sortConfig]);

  // Create flattened list with album grouping info
  const flattenedList = useMemo(() => {
    const groups = groupSongsByAlbum(filteredSongs);
    const items: Array<{ song: Song; showAlbumArt: boolean }> = [];

    for (const group of groups) {
      group.songs.forEach((song, index) => {
        items.push({
          song,
          showAlbumArt: index === 0, // Only first song shows album art
        });
      });
    }

    return items;
  }, [filteredSongs]);

  const handleSongClick = useCallback((e: React.MouseEvent, song: Song) => {
    const isMultiSelect = e.ctrlKey || e.metaKey;
    selectSong(song.id, isMultiSelect);
  }, [selectSong]);

  const handleSongDoubleClick = useCallback(async (song: Song) => {
    try {
      await playSong(song.filePath);
      setCurrentSong(song);
      setIsPlaying(true);
      setQueue(filteredSongs, filteredSongs.findIndex(s => s.id === song.id));
    } catch (error) {
      console.error('Play error:', error);
    }
  }, [filteredSongs, setCurrentSong, setIsPlaying, setQueue]);

  // Row renderer for virtualized list
  const Row = useCallback(({ index, style }: ListChildComponentProps) => {
    const item = flattenedList[index];
    if (!item) return null;

    const { song, showAlbumArt } = item;
    const isSelected = selectedSongIds.has(song.id);
    const isPlaying = currentSong?.id === song.id;

    return (
      <div style={style}>
        <SongRow
          song={song}
          showAlbumArt={showAlbumArt}
          isSelected={isSelected}
          isPlaying={isPlaying}
          onClick={(e) => handleSongClick(e, song)}
          onDoubleClick={() => handleSongDoubleClick(song)}
        />
      </div>
    );
  }, [flattenedList, selectedSongIds, currentSong, handleSongClick, handleSongDoubleClick]);

  if (songs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <Music className="w-16 h-16 text-muted-foreground/50 mb-4" />
        <h2 className="text-lg font-medium mb-2">{t('library.noSongs')}</h2>
        <p className="text-sm text-muted-foreground">{t('library.addMusic')}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="flex items-center px-2 py-1.5 border-b border-border bg-background-secondary text-xs font-medium text-muted-foreground">
        <span className="w-8 flex-shrink-0" /> {/* Art */}
        <span className="w-8 text-right flex-shrink-0">#</span>
        <span className="flex-1 px-2">{t('view.columns.title')}</span>
        <span className="w-40 px-2">{t('view.columns.artist')}</span>
        <span className="w-40 px-2">{t('view.columns.album')}</span>
        <span className="w-14 text-right flex-shrink-0">{t('view.columns.duration')}</span>
        <span className="w-12 text-center flex-shrink-0">{t('view.columns.format')}</span>
        <span className="w-6 text-center flex-shrink-0">{t('view.columns.syncStatus')}</span>
      </div>

      {/* Virtualized List */}
      <div className="flex-1">
        <AutoSizer>
          {({ height, width }) => (
            <List
              ref={listRef}
              height={height}
              width={width}
              itemCount={flattenedList.length}
              itemSize={ROW_HEIGHT}
              overscanCount={10}
            >
              {Row}
            </List>
          )}
        </AutoSizer>
      </div>

      {/* Status Bar */}
      <div className="px-3 py-1.5 border-t border-border bg-background-secondary text-xs text-muted-foreground">
        {t('library.songs', { count: filteredSongs.length })}
        {searchQuery && ` (filtered from ${songs.length})`}
      </div>
    </div>
  );
}
