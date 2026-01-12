import { useMemo, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { debounce } from "lodash-es";
import {
  Search,
  FolderPlus,
  RefreshCw,
  StopCircle,
  ArrowUpDown,
  Grid3X3,
  Grid2X2,
  LayoutGrid,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore, useLibraryStore } from "@/store";
import { open } from "@tauri-apps/plugin-dialog";
import {
  scanLibrary,
  stopScan,
  onSongAdded,
  onScanCompleted,
  onScanCancelled,
} from "@/api/tauri";
import { useQueryClient } from "@tanstack/react-query";
import { SongList } from "./SongList";
import { AlbumGrid } from "./AlbumGrid";
import { ArtistList } from "./ArtistList";
import { PlaylistDetail } from "./PlaylistDetail";
import { SettingsPanel } from "./SettingsPanel";

export type AlbumSize = "small" | "medium" | "large";
export type AlbumSortField = "artist" | "year" | "dateAdded" | "title";
export type AlbumViewMode = "grid" | "list";

export function MainContent() {
  const { t } = useTranslation();
  const { activeSection, setActiveSection } = useUIStore();
  const { setSearchQuery, isScanning, setIsScanning } = useLibraryStore();
  const queryClient = useQueryClient();

  // Album view state
  const [albumSize, setAlbumSize] = useState<AlbumSize>("medium");
  const [albumSortField, setAlbumSortField] =
    useState<AlbumSortField>("artist");
  const [albumViewMode, setAlbumViewMode] = useState<AlbumViewMode>("grid");
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Listen for song-added events during scanning for incremental updates
  useEffect(() => {
    let unlistenSongAdded: (() => void) | null = null;
    let unlistenScanCompleted: (() => void) | null = null;
    let unlistenScanCancelled: (() => void) | null = null;

    const setupListeners = async () => {
      unlistenSongAdded = await onSongAdded(() => {
        // Invalidate and refetch songs query when a new song is added
        queryClient.invalidateQueries({ queryKey: ["songs"] });
      });

      unlistenScanCompleted = await onScanCompleted(() => {
        setIsScanning(false);
        queryClient.invalidateQueries({ queryKey: ["songs"] });
      });

      unlistenScanCancelled = await onScanCancelled(() => {
        setIsScanning(false);
        queryClient.invalidateQueries({ queryKey: ["songs"] });
      });
    };

    setupListeners();

    return () => {
      if (unlistenSongAdded) unlistenSongAdded();
      if (unlistenScanCompleted) unlistenScanCompleted();
      if (unlistenScanCancelled) unlistenScanCancelled();
    };
  }, [queryClient, setIsScanning]);

  // Debounced search
  const debouncedSearch = useMemo(
    () => debounce((query: string) => setSearchQuery(query), 300),
    [setSearchQuery]
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      debouncedSearch(e.target.value);
    },
    [debouncedSearch]
  );

  const handleScanFolder = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: true,
        title: t("library.selectFolder"),
      });

      if (selected) {
        setIsScanning(true);
        // Start scanning - events will handle incremental updates
        scanLibrary(selected as string).catch((error) => {
          console.error("Failed to scan folder:", error);
          setIsScanning(false);
        });
      }
    } catch (error) {
      console.error("Failed to open folder dialog:", error);
      setIsScanning(false);
    }
  }, [t, setIsScanning]);

  const handleStopScan = useCallback(async () => {
    try {
      await stopScan();
    } catch (error) {
      console.error("Failed to stop scan:", error);
    }
  }, []);

  // Render content based on active section
  const renderContent = () => {
    if (activeSection === "settings") {
      return <SettingsPanel />;
    }

    // Check if viewing a device
    if (activeSection.startsWith("device-")) {
      return (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p>{t("common.comingSoon")}</p>
        </div>
      );
    }

    // Check if viewing a playlist
    if (activeSection.startsWith("playlist-")) {
      const playlistId = activeSection.replace("playlist-", "");
      return (
        <PlaylistDetail
          playlistId={playlistId}
          onDelete={() => setActiveSection("songs")}
        />
      );
    }

    // Library views
    switch (activeSection) {
      case "songs":
        // Always show song list for songs tab
        return <SongList />;
      case "albums":
        return (
          <AlbumGrid
            albumSize={albumSize}
            sortField={albumSortField}
            viewMode={albumViewMode}
          />
        );
      case "artists":
        return <ArtistList />;
      default:
        return <SongList />;
    }
  };

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background-secondary">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={t("library.search")}
            onChange={handleSearchChange}
            className="w-full h-8 pl-8 pr-3 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Scan Folder / Stop Scan */}
        {isScanning ? (
          <button
            onClick={handleStopScan}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
              "bg-destructive/10 text-destructive hover:bg-destructive/20"
            )}
            title={t("library.stopScan", "Stop scanning")}
          >
            <StopCircle className="w-4 h-4" />
            <span className="hidden sm:inline">
              {t("library.stopScan", "Stop")}
            </span>
          </button>
        ) : (
          <button
            onClick={handleScanFolder}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
              "hover:bg-accent"
            )}
            title={t("library.addFolder")}
          >
            <FolderPlus className="w-4 h-4" />
            <span className="hidden sm:inline">{t("library.addFolder")}</span>
          </button>
        )}

        {/* Scanning indicator */}
        {isScanning && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="hidden sm:inline">
              {t("library.scanning", "Scanning...")}
            </span>
          </div>
        )}

        {/* Album view controls - only show for albums tab */}
        {activeSection === "albums" && (
          <>
            {/* Album Sort */}
            <div className="relative">
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-md transition-colors",
                  "hover:bg-accent",
                  "min-w-[140px]" // Min width for sort button
                )}
                title={t("view.sortBy")}
              >
                <ArrowUpDown className="w-4 h-4 flex-shrink-0" />
                <span className="text-xs truncate">
                  {albumSortField === "artist" && t("view.columns.artist")}
                  {albumSortField === "year" && t("view.columns.year")}
                  {albumSortField === "dateAdded" &&
                    t("library.dateAdded", "Date Added")}
                  {albumSortField === "title" &&
                    t("view.columns.album", "Album")}
                </span>
              </button>
              {showSortMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-background border border-border rounded-md shadow-lg py-1 min-w-[120px]">
                  <button
                    onClick={() => {
                      setAlbumSortField("artist");
                      setShowSortMenu(false);
                    }}
                    className={cn(
                      "w-full px-3 py-1.5 text-left text-sm hover:bg-accent",
                      albumSortField === "artist" && "bg-accent"
                    )}
                  >
                    {t("view.columns.artist")}
                  </button>
                  <button
                    onClick={() => {
                      setAlbumSortField("year");
                      setShowSortMenu(false);
                    }}
                    className={cn(
                      "w-full px-3 py-1.5 text-left text-sm hover:bg-accent",
                      albumSortField === "year" && "bg-accent"
                    )}
                  >
                    {t("view.columns.year")}
                  </button>
                  <button
                    onClick={() => {
                      setAlbumSortField("dateAdded");
                      setShowSortMenu(false);
                    }}
                    className={cn(
                      "w-full px-3 py-1.5 text-left text-sm hover:bg-accent",
                      albumSortField === "dateAdded" && "bg-accent"
                    )}
                  >
                    {t("library.dateAdded", "Date Added")}
                  </button>
                  <button
                    onClick={() => {
                      setAlbumSortField("title");
                      setShowSortMenu(false);
                    }}
                    className={cn(
                      "w-full px-3 py-1.5 text-left text-sm hover:bg-accent",
                      albumSortField === "title" && "bg-accent"
                    )}
                  >
                    {t("view.columns.album", "Album")}
                  </button>
                </div>
              )}
            </div>

            {/* Album Size Selector - only show for grid mode */}
            {albumViewMode === "grid" && (
              <div className="flex items-center border border-border rounded-md overflow-hidden">
                <button
                  onClick={() => setAlbumSize("small")}
                  className={cn(
                    "p-1.5 transition-colors",
                    albumSize === "small"
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  )}
                  title={t("view.albumSize.small", "Small")}
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setAlbumSize("medium")}
                  className={cn(
                    "p-1.5 transition-colors",
                    albumSize === "medium"
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  )}
                  title={t("view.albumSize.medium", "Medium")}
                >
                  <Grid2X2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setAlbumSize("large")}
                  className={cn(
                    "p-1.5 transition-colors",
                    albumSize === "large"
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  )}
                  title={t("view.albumSize.large", "Large")}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* View Mode Toggle */}
            <div className="flex items-center border border-border rounded-md overflow-hidden">
              <button
                onClick={() => setAlbumViewMode("list")}
                className={cn(
                  "p-1.5 transition-colors",
                  albumViewMode === "list"
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50"
                )}
                title={t("view.list", "List View")}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setAlbumViewMode("grid")}
                className={cn(
                  "p-1.5 transition-colors",
                  albumViewMode === "grid"
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50"
                )}
                title={t("view.grid", "Grid View")}
              >
                <Grid2X2 className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Content */}
      {renderContent()}
    </main>
  );
}
