import { useEffect, useCallback } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Sidebar } from "@/components/Sidebar";
import { MainContent } from "@/components/MainContent";
import { PlayerBar } from "@/components/PlayerBar";
import { useUIStore } from "@/store";
import {
  importPlaylistM3U,
  exportPlaylistM3U,
  getPlaylists,
} from "@/api/tauri";
import "@/i18n";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function AppContent() {
  const { theme } = useUIStore();
  const { i18n } = useTranslation();
  const qc = useQueryClient();

  // Handle menu import playlist
  const handleImportPlaylist = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "M3U Playlist",
            extensions: ["m3u", "m3u8"],
          },
        ],
      });

      if (selected) {
        const path = typeof selected === "string" ? selected : selected;
        await importPlaylistM3U(path);
        qc.invalidateQueries({ queryKey: ["playlists"] });
      }
    } catch (error) {
      console.error("Failed to import playlist:", error);
    }
  }, [qc]);

  // Handle menu export playlist
  const handleExportPlaylist = useCallback(async () => {
    try {
      // Get available playlists
      const playlists = await getPlaylists();
      if (playlists.length === 0) {
        return;
      }

      // For now, export the first playlist - in future could show picker
      const playlist = playlists[0];

      const savePath = await save({
        defaultPath: `${playlist.name}.m3u`,
        filters: [
          {
            name: "M3U Playlist",
            extensions: ["m3u"],
          },
        ],
      });

      if (savePath) {
        await exportPlaylistM3U(playlist.id, savePath);
      }
    } catch (error) {
      console.error("Failed to export playlist:", error);
    }
  }, []);

  // Listen for menu events from Tauri
  useEffect(() => {
    const unlisten1 = listen("menu-import-playlist", () => {
      handleImportPlaylist();
    });

    const unlisten2 = listen("menu-export-playlist", () => {
      handleExportPlaylist();
    });

    return () => {
      unlisten1.then((fn) => fn());
      unlisten2.then((fn) => fn());
    };
  }, [handleImportPlaylist, handleExportPlaylist]);

  // Apply theme class to document
  useEffect(() => {
    const root = document.documentElement;

    if (theme === "system") {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", isDark);

      const listener = (e: MediaQueryListEvent) => {
        root.classList.toggle("dark", e.matches);
      };

      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", listener);

      return () => mediaQuery.removeEventListener("change", listener);
    } else {
      root.classList.toggle("dark", theme === "dark");
    }
  }, [theme]);

  // Set document lang attribute
  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <MainContent />
      </div>
      <PlayerBar />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
