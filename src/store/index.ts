/**
 * MediaDoh - Application State Store
 * Using Zustand for global state management
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Device,
  PlayerState,
  RepeatMode,
  Song,
  SortConfig,
  ThemePreference,
  ViewMode,
} from '@/types';

// ============================================================================
// Player Store
// ============================================================================

interface PlayerStore {
  // State
  isPlaying: boolean;
  isPaused: boolean;
  currentSong: Song | null;
  queue: Song[];
  queueIndex: number;
  volume: number;
  isMuted: boolean;
  repeatMode: RepeatMode;
  shuffle: boolean;
  positionMs: number;

  // Actions
  setIsPlaying: (isPlaying: boolean) => void;
  setIsPaused: (isPaused: boolean) => void;
  setCurrentSong: (song: Song | null) => void;
  setQueue: (songs: Song[], startIndex?: number) => void;
  nextTrack: () => Song | null;
  previousTrack: () => Song | null;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
  toggleShuffle: () => void;
  setPosition: (positionMs: number) => void;
}

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set, get) => ({
      // Initial state
      isPlaying: false,
      isPaused: false,
      currentSong: null,
      queue: [],
      queueIndex: -1,
      volume: 1.0,
      isMuted: false,
      repeatMode: 'off',
      shuffle: false,
      positionMs: 0,

      // Actions
      setIsPlaying: (isPlaying) => set({ isPlaying }),
      setIsPaused: (isPaused) => set({ isPaused }),
      setCurrentSong: (song) => set({ currentSong: song }),
      
      setQueue: (songs, startIndex = 0) => {
        set({ 
          queue: songs, 
          queueIndex: startIndex,
          currentSong: songs[startIndex] || null,
        });
      },

      nextTrack: () => {
        const { queue, queueIndex, repeatMode, shuffle } = get();
        if (queue.length === 0) return null;

        let nextIndex: number;

        if (shuffle) {
          nextIndex = Math.floor(Math.random() * queue.length);
        } else if (queueIndex >= queue.length - 1) {
          if (repeatMode === 'all') {
            nextIndex = 0;
          } else {
            return null;
          }
        } else {
          nextIndex = queueIndex + 1;
        }

        const nextSong = queue[nextIndex];
        set({ queueIndex: nextIndex, currentSong: nextSong, positionMs: 0 });
        return nextSong;
      },

      previousTrack: () => {
        const { queue, queueIndex, positionMs } = get();
        if (queue.length === 0) return null;

        // If more than 3 seconds in, restart current track
        if (positionMs > 3000) {
          set({ positionMs: 0 });
          return get().currentSong;
        }

        const prevIndex = queueIndex <= 0 ? queue.length - 1 : queueIndex - 1;
        const prevSong = queue[prevIndex];
        set({ queueIndex: prevIndex, currentSong: prevSong, positionMs: 0 });
        return prevSong;
      },

      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
      toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
      setRepeatMode: (mode) => set({ repeatMode: mode }),
      toggleShuffle: () => set((state) => ({ shuffle: !state.shuffle })),
      setPosition: (positionMs) => set({ positionMs }),
    }),
    {
      name: 'mediadoh-player',
      partialize: (state) => ({
        volume: state.volume,
        repeatMode: state.repeatMode,
        shuffle: state.shuffle,
      }),
    }
  )
);

// ============================================================================
// Library Store
// ============================================================================

interface LibraryStore {
  // State
  songs: Song[];
  selectedSongIds: Set<string>;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  viewMode: ViewMode;
  sortConfig: SortConfig;

  // Actions
  setSongs: (songs: Song[]) => void;
  addSongs: (songs: Song[]) => void;
  selectSong: (id: string, multi?: boolean) => void;
  selectSongs: (ids: string[]) => void;
  clearSelection: () => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setSearchQuery: (query: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setSortConfig: (config: SortConfig) => void;
}

export const useLibraryStore = create<LibraryStore>()(
  persist(
    (set, get) => ({
      // Initial state
      songs: [],
      selectedSongIds: new Set(),
      isLoading: false,
      error: null,
      searchQuery: '',
      viewMode: 'list',
      sortConfig: { field: 'title', order: 'ascending' },

      // Actions
      setSongs: (songs) => set({ songs }),
      addSongs: (songs) => set((state) => ({ songs: [...state.songs, ...songs] })),
      
      selectSong: (id, multi = false) => {
        const { selectedSongIds } = get();
        const newSelection = new Set(multi ? selectedSongIds : []);
        
        if (newSelection.has(id)) {
          newSelection.delete(id);
        } else {
          newSelection.add(id);
        }
        
        set({ selectedSongIds: newSelection });
      },

      selectSongs: (ids) => set({ selectedSongIds: new Set(ids) }),
      clearSelection: () => set({ selectedSongIds: new Set() }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setViewMode: (mode) => set({ viewMode: mode }),
      setSortConfig: (config) => set({ sortConfig: config }),
    }),
    {
      name: 'mediadoh-library',
      partialize: (state) => ({
        viewMode: state.viewMode,
        sortConfig: state.sortConfig,
      }),
    }
  )
);

// ============================================================================
// UI Store
// ============================================================================

interface UIStore {
  // State
  theme: ThemePreference;
  sidebarCollapsed: boolean;
  activeSection: string;
  
  // Actions
  setTheme: (theme: ThemePreference) => void;
  toggleSidebar: () => void;
  setActiveSection: (section: string) => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      // Initial state
      theme: 'system',
      sidebarCollapsed: false,
      activeSection: 'songs',

      // Actions
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setActiveSection: (section) => set({ activeSection: section }),
    }),
    {
      name: 'mediadoh-ui',
    }
  )
);

// ============================================================================
// Device Store
// ============================================================================

interface DeviceStore {
  // State
  devices: Device[];
  selectedDevice: Device | null;
  isScanning: boolean;

  // Actions
  setDevices: (devices: Device[]) => void;
  selectDevice: (device: Device | null) => void;
  setScanning: (isScanning: boolean) => void;
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  // Initial state
  devices: [],
  selectedDevice: null,
  isScanning: false,

  // Actions
  setDevices: (devices) => set({ devices }),
  selectDevice: (device) => set({ selectedDevice: device }),
  setScanning: (isScanning) => set({ isScanning }),
}));
