import { useTranslation } from 'react-i18next';
import { Search, FolderOpen, LayoutGrid, LayoutList } from 'lucide-react';
import { useUIStore, useLibraryStore } from '@/store';
import { SongList } from '@/components/SongList';
import { AlbumGrid } from '@/components/AlbumGrid';
import { SettingsPanel } from '@/components/SettingsPanel';
import { open } from '@tauri-apps/plugin-dialog';
import { scanLibrary } from '@/api/tauri';
import { cn, debounce } from '@/lib/utils';
import { useCallback, useState } from 'react';

export function MainContent() {
  const { t } = useTranslation();
  const { activeSection } = useUIStore();
  const { 
    viewMode, 
    setViewMode, 
    searchQuery, 
    setSearchQuery,
    setSongs,
    addSongs,
    setLoading,
    isLoading,
  } = useLibraryStore();

  const [localSearch, setLocalSearch] = useState(searchQuery);

  // Debounced search
  const debouncedSearch = useCallback(
    debounce((query: string) => {
      setSearchQuery(query);
    }, 300),
    [setSearchQuery]
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalSearch(value);
    debouncedSearch(value);
  };

  const handleScanFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t('library.scanFolder'),
      });

      if (selected) {
        setLoading(true);
        const newSongs = await scanLibrary(selected as string);
        addSongs(newSongs);
        setLoading(false);
      }
    } catch (error) {
      console.error('Scan error:', error);
      setLoading(false);
    }
  };

  // Render settings panel
  if (activeSection === 'settings') {
    return <SettingsPanel />;
  }

  // Render device view
  if (activeSection.startsWith('device-')) {
    return (
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border">
          <h1 className="text-lg font-semibold">{t('sync.title')}</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Device sync view coming soon...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-border gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={localSearch}
            onChange={handleSearchChange}
            placeholder={t('common.search')}
            className="w-full pl-9 pr-4 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleScanFolder}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <FolderOpen className="w-4 h-4" />
            {isLoading ? t('library.scanning') : t('library.scanFolder')}
          </button>

          {/* View Mode Toggle */}
          <div className="flex items-center border border-border rounded-md">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-1.5 rounded-l-md transition-colors',
                viewMode === 'list' ? 'bg-accent' : 'hover:bg-accent/50'
              )}
              title={t('view.list')}
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'p-1.5 rounded-r-md transition-colors',
                viewMode === 'grid' ? 'bg-accent' : 'hover:bg-accent/50'
              )}
              title={t('view.grid')}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeSection === 'albums' || viewMode === 'grid' ? (
          <AlbumGrid />
        ) : (
          <SongList />
        )}
      </div>
    </main>
  );
}
