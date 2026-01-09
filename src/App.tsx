import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Sidebar } from "@/components/Sidebar";
import { MainContent } from "@/components/MainContent";
import { PlayerBar } from "@/components/PlayerBar";
import { useUIStore } from "@/store";
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
