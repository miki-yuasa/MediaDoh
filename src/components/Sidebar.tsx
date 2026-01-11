import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Music,
  Disc3,
  Users,
  Settings,
  Plus,
  HardDrive,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  ListMusic,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore, useDeviceStore } from "@/store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getDevices,
  getPlaylists,
  createPlaylist,
  importPlaylistM3U,
} from "@/api/tauri";
import { open } from "@tauri-apps/plugin-dialog";

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

function SidebarItem({ icon, label, active, onClick }: SidebarItemProps) {
  const { sidebarCollapsed } = useUIStore();

  return (
    <button
      onClick={onClick}
      className={cn("sidebar-item w-full", active && "active")}
      title={sidebarCollapsed ? label : undefined}
    >
      <span className="flex-shrink-0">{icon}</span>
      {!sidebarCollapsed && <span className="truncate">{label}</span>}
    </button>
  );
}

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { sidebarCollapsed } = useUIStore();

  return (
    <div className="mb-4">
      {!sidebarCollapsed && (
        <h3 className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </h3>
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const { sidebarCollapsed, toggleSidebar, activeSection, setActiveSection } =
    useUIStore();
  const { setDevices } = useDeviceStore();
  const queryClient = useQueryClient();
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  // Query devices
  const { data: fetchedDevices } = useQuery({
    queryKey: ["devices"],
    queryFn: getDevices,
    refetchInterval: 5000, // Poll every 5 seconds
  });

  // Query playlists
  const { data: playlists } = useQuery({
    queryKey: ["playlists"],
    queryFn: getPlaylists,
  });

  // Update store when devices are fetched
  useEffect(() => {
    if (fetchedDevices) {
      setDevices(fetchedDevices);
    }
  }, [fetchedDevices, setDevices]);

  const devices = fetchedDevices || [];

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;

    try {
      const playlist = await createPlaylist(newPlaylistName.trim());
      setNewPlaylistName("");
      setIsCreatingPlaylist(false);
      await queryClient.invalidateQueries({ queryKey: ["playlists"] });
      setActiveSection(`playlist-${playlist.id}`);
    } catch (error) {
      console.error("Failed to create playlist:", error);
    }
  };

  const handleImportM3U = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "M3U Playlist", extensions: ["m3u", "m3u8"] }],
        title: t("playlist.importM3U"),
      });

      if (selected) {
        const playlist = await importPlaylistM3U(selected as string);
        await queryClient.invalidateQueries({ queryKey: ["playlists"] });
        setActiveSection(`playlist-${playlist.id}`);
      }
    } catch (error) {
      console.error("Failed to import M3U:", error);
    }
  };

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border bg-background-secondary transition-all duration-200",
        sidebarCollapsed ? "w-14" : "w-56"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2">
            <Disc3 className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm">{t("common.appName")}</span>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1 rounded hover:bg-accent transition-colors"
          title={sidebarCollapsed ? "Expand" : "Collapse"}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* Library Section */}
        <SidebarSection title={t("sidebar.library")}>
          <SidebarItem
            icon={<Music className="w-4 h-4" />}
            label={t("sidebar.songs")}
            active={activeSection === "songs"}
            onClick={() => setActiveSection("songs")}
          />
          <SidebarItem
            icon={<Disc3 className="w-4 h-4" />}
            label={t("sidebar.albums")}
            active={activeSection === "albums"}
            onClick={() => setActiveSection("albums")}
          />
          <SidebarItem
            icon={<Users className="w-4 h-4" />}
            label={t("sidebar.artists")}
            active={activeSection === "artists"}
            onClick={() => setActiveSection("artists")}
          />
        </SidebarSection>

        {/* Playlists Section */}
        <SidebarSection title={t("sidebar.playlists")}>
          <SidebarItem
            icon={<Plus className="w-4 h-4" />}
            label={t("sidebar.newPlaylist")}
            onClick={() => setIsCreatingPlaylist(true)}
          />
          <SidebarItem
            icon={<Upload className="w-4 h-4" />}
            label={t("playlist.importM3U")}
            onClick={handleImportM3U}
          />
          {isCreatingPlaylist && !sidebarCollapsed && (
            <div className="px-3 py-1">
              <input
                type="text"
                className="w-full px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder={t("playlist.namePlaceholder", "Playlist name")}
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreatePlaylist();
                  if (e.key === "Escape") {
                    setIsCreatingPlaylist(false);
                    setNewPlaylistName("");
                  }
                }}
                onBlur={() => {
                  // Delay to allow click on other elements to register
                  setTimeout(() => {
                    setIsCreatingPlaylist(false);
                    setNewPlaylistName("");
                  }, 150);
                }}
                autoFocus
              />
            </div>
          )}
          {playlists?.map((playlist) => (
            <SidebarItem
              key={playlist.id}
              icon={<ListMusic className="w-4 h-4" />}
              label={playlist.name}
              active={activeSection === `playlist-${playlist.id}`}
              onClick={() => setActiveSection(`playlist-${playlist.id}`)}
            />
          ))}
        </SidebarSection>

        {/* Devices Section */}
        <SidebarSection title={t("sidebar.devices")}>
          {devices.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {!sidebarCollapsed && t("sidebar.noDevices")}
            </div>
          ) : (
            devices.map((device) => (
              <SidebarItem
                key={device.id}
                icon={
                  device.deviceType === "walkman_internal" ||
                  device.deviceType === "walkman_sdcard" ? (
                    <Smartphone className="w-4 h-4" />
                  ) : (
                    <HardDrive className="w-4 h-4" />
                  )
                }
                label={device.name}
                active={activeSection === `device-${device.id}`}
                onClick={() => setActiveSection(`device-${device.id}`)}
              />
            ))
          )}
        </SidebarSection>
      </div>

      {/* Footer */}
      <div className="border-t border-border p-2">
        <SidebarItem
          icon={<Settings className="w-4 h-4" />}
          label={t("sidebar.settings")}
          active={activeSection === "settings"}
          onClick={() => setActiveSection("settings")}
        />
      </div>
    </aside>
  );
}
