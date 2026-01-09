import { useTranslation } from 'react-i18next';
import { Moon, Sun, Monitor, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store';
import type { ThemePreference } from '@/types';

export function SettingsPanel() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useUIStore();

  const themes: Array<{ value: ThemePreference; icon: React.ReactNode; label: string }> = [
    { value: 'light', icon: <Sun className="w-4 h-4" />, label: t('settings.themeLight') },
    { value: 'dark', icon: <Moon className="w-4 h-4" />, label: t('settings.themeDark') },
    { value: 'system', icon: <Monitor className="w-4 h-4" />, label: t('settings.themeSystem') },
  ];

  const languages = [
    { code: 'en', label: 'English' },
    { code: 'ja', label: '日本語' },
  ];

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>

        {/* Appearance Section */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">{t('settings.appearance')}</h2>

          {/* Theme */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('settings.theme')}</label>
            <div className="flex gap-2">
              {themes.map(({ value, icon, label }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-md border transition-colors',
                    theme === value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:bg-accent'
                  )}
                >
                  {icon}
                  <span className="text-sm">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Language */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('settings.language')}</label>
            <div className="flex gap-2">
              {languages.map(({ code, label }) => (
                <button
                  key={code}
                  onClick={() => i18n.changeLanguage(code)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-md border transition-colors',
                    i18n.language === code
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:bg-accent'
                  )}
                >
                  <Globe className="w-4 h-4" />
                  <span className="text-sm">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Library Section */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">{t('settings.library')}</h2>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('settings.folders')}</label>
            <div className="p-4 border border-border rounded-md bg-background-secondary">
              <p className="text-sm text-muted-foreground">
                Library folder management coming soon...
              </p>
            </div>
          </div>
        </section>

        {/* Audio Section */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">{t('settings.audio')}</h2>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('settings.outputDevice')}</label>
            <div className="p-4 border border-border rounded-md bg-background-secondary">
              <p className="text-sm text-muted-foreground">
                Audio device selection coming soon...
              </p>
            </div>
          </div>
        </section>

        {/* About */}
        <section className="space-y-4 pt-8 border-t border-border">
          <div className="text-center space-y-2">
            <h2 className="text-xl font-semibold">
              {t('common.appName')} <span className="text-muted-foreground">{t('common.appSubtitle')}</span>
            </h2>
            <p className="text-sm text-muted-foreground">
              Version 0.1.0
            </p>
            <p className="text-xs text-muted-foreground">
              Music management for Sony Walkman devices
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
