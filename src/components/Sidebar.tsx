import { useTranslation } from 'react-i18next';
import { 
  Music, 
  Disc3, 
  Users, 
  ListMusic, 
  Settings, 
  Plus,
  HardDrive,
  Smartphone,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore, useDeviceStore } from '@/store';
import { useQuery } from '@tanstack/react-query';
import { getDevices } from '@/api/tauri';

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
      className={cn(
        'sidebar-item w-full',
        active && 'active'
      )}
      title={sidebarCollapsed ? label : undefined}
    >
      <span className="flex-shrink-0">{icon}</span>
      {!sidebarCollapsed && <span className="truncate">{label}</span>}
    </button>
  );
}

function SidebarSection({ 
  title, 
  children 
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
  const { sidebarCollapsed, toggleSidebar, activeSection, setActiveSection } = useUIStore();
  const { devices, setDevices } = useDeviceStore();

  // Query devices
  useQuery({
    queryKey: ['devices'],
    queryFn: getDevices,
    onSuccess: setDevices,
    refetchInterval: 5000, // Poll every 5 seconds
  });

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-border bg-background-secondary transition-all duration-200',
        sidebarCollapsed ? 'w-14' : 'w-56'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2">
            <Disc3 className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm">{t('common.appName')}</span>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1 rounded hover:bg-accent transition-colors"
          title={sidebarCollapsed ? 'Expand' : 'Collapse'}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        <SidebarSection title={t('sidebar.library')}>
          <SidebarItem
            icon={<Music className="w-4 h-4" />}
            label={t('sidebar.songs')}
            active={activeSection === 'songs'}
            onClick={() => setActiveSection('songs')}
          />
          <SidebarItem
            icon={<Disc3 className="w-4 h-4" />}
            label={t('sidebar.albums')}
            active={activeSection === 'albums'}
            onClick={() => setActiveSection('albums')}
          />
          <SidebarItem
            icon={<Users className="w-4 h-4" />}
            label={t('sidebar.artists')}
            active={activeSection === 'artists'}
            onClick={() => setActiveSection('artists')}
          />
        </SidebarSection>

        <SidebarSection title={t('sidebar.playlists')}>
          <SidebarItem
            icon={<Plus className="w-4 h-4" />}
            label={t('sidebar.newPlaylist')}
            onClick={() => {/* TODO: Create playlist dialog */}}
          />
          {/* TODO: List playlists here */}
        </SidebarSection>

        <SidebarSection title={t('sidebar.devices')}>
          {devices.length === 0 ? (
            !sidebarCollapsed && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {t('sidebar.noDevices')}
              </p>
            )
          ) : (
            devices.map((device) => (
              <SidebarItem
                key={device.id}
                icon={
                  device.deviceType === 'other' ? (
                    <HardDrive className="w-4 h-4" />
                  ) : (
                    <Smartphone className="w-4 h-4" />
                  )
                }
                label={device.name}
                active={activeSection === `device-${device.id}`}
                onClick={() => setActiveSection(`device-${device.id}`)}
              />
            ))
          )}
        </SidebarSection>
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-border">
        <SidebarItem
          icon={<Settings className="w-4 h-4" />}
          label={t('common.settings')}
          active={activeSection === 'settings'}
          onClick={() => setActiveSection('settings')}
        />
      </div>
    </aside>
  );
}
