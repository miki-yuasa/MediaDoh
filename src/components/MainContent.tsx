import { useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { debounce } from "lodash-es";
import {
  Search,
  FolderPlus,
  RefreshCw,
  LayoutList,
  LayoutGrid,
  StopCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore, useLibraryStore } from "@/store";
import { open } from "@tauri-apps/plugin-dialog";
import { scanLibrary, stopScan, onSongAdded, onScanCompleted, onScanCancelled } from "@/api/tauri";
import { useQueryClient } from "@tanstack/react-query";
import { SongList } from "./SongList";
import { AlbumGrid } from "./AlbumGrid";
import { SettingsPanel } from "./SettingsPanel";

export function MainContent() {
  const { t } = useTranslation();
  const { activeSection, viewMode, setViewMode } = useUIStore();
  const { setSearchQuery, isScanning, setIsScanning } = useLibraryStore();
  const queryClient = useQueryClient();

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

    // Library views
    switch (activeSection) {
      case "songs":
        return viewMode === "list" ? <SongList /> : <AlbumGrid />;
      case "albums":
        return <AlbumGrid />;
      case "artists":
        return (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p>{t("common.comingSoon")}</p>
          </div>
        );
      default:
        return viewMode === "list" ? <SongList /> : <AlbumGrid />;
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
            <span className="hidden sm:inline">
              {t("library.addFolder")}
            </span>
          </button>
        )}

        {/* Scanning indicator */}
        {isScanning && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="hidden sm:inline">{t("library.scanning", "Scanning...")}</span>
          </div>
        )}

        {/* View Mode Toggle */}
        {activeSection !== "settings" && (
          <div className="flex items-center border border-border rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-1.5 transition-colors",
                viewMode === "list"
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50"
              )}
              title={t("view.list")}
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1.5 transition-colors",
                viewMode === "grid"
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50"
              )}
              title={t("view.grid")}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {renderContent()}
    </main>
  );
}
