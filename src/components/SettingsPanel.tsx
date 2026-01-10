import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Moon,
  Sun,
  Monitor,
  Globe,
  Cloud,
  CloudOff,
  Loader2,
  Copy,
  Check,
  Settings,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { cn } from "@/lib/utils";
import { useUIStore, useLibraryStore } from "@/store";
import { useQueryClient } from "@tanstack/react-query";
import type { ThemePreference } from "@/types";
import {
  isOneDriveAuthenticated,
  startOneDriveAuth,
  pollOneDriveAuth,
  disconnectOneDrive,
  getOneDriveClientId,
  setOneDriveClientId,
  clearLibrary,
  type DeviceCodeResponse,
} from "@/api/tauri";

export function SettingsPanel() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useUIStore();
  const { setSongs, clearSelection } = useLibraryStore();
  const queryClient = useQueryClient();
  const [oneDriveConnected, setOneDriveConnected] = useState(false);
  const [oneDriveLoading, setOneDriveLoading] = useState(false);
  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientIdSaved, setClientIdSaved] = useState(false);
  const [showClientIdSetup, setShowClientIdSetup] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearingLibrary, setClearingLibrary] = useState(false);
  const [clearResult, setClearResult] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    checkOneDriveStatus();
    loadClientId();
    return () => {
      // Cleanup polling on unmount
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const loadClientId = async () => {
    try {
      const id = await getOneDriveClientId();
      if (id && id !== "your-client-id-here") {
        setClientId(id);
      }
    } catch (err) {
      console.error("Failed to load client ID:", err);
    }
  };

  const handleSaveClientId = async () => {
    if (!clientId.trim()) return;
    try {
      await setOneDriveClientId(clientId.trim());
      setClientIdSaved(true);
      setShowClientIdSetup(false);
      setTimeout(() => setClientIdSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save client ID:", err);
    }
  };

  const checkOneDriveStatus = async () => {
    try {
      const connected = await isOneDriveAuthenticated();
      setOneDriveConnected(connected);
    } catch (err) {
      console.error("Failed to check OneDrive status:", err);
    }
  };

  const handleConnectOneDrive = async () => {
    try {
      setOneDriveLoading(true);
      setAuthError(null);
      const response = await startOneDriveAuth();
      console.log("Device code response:", response);
      setDeviceCode(response);

      // Open the verification URL in the default browser
      await open(response.verification_uri);

      // Start polling for authentication completion
      const pollInterval = (response.interval || 5) * 1000;
      pollIntervalRef.current = setInterval(async () => {
        try {
          const authenticated = await pollOneDriveAuth(response.device_code);
          if (authenticated) {
            // Success! Stop polling and update UI
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setDeviceCode(null);
            setOneDriveConnected(true);
            setOneDriveLoading(false);
          }
        } catch (err) {
          // Check if it's an error that should stop polling
          const errorMsg = err instanceof Error ? err.message : String(err);
          if (
            errorMsg.includes("expired") ||
            errorMsg.includes("denied") ||
            errorMsg.includes("error")
          ) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setAuthError(errorMsg);
            setDeviceCode(null);
            setOneDriveLoading(false);
          }
        }
      }, pollInterval);
    } catch (err) {
      console.error("Failed to start OneDrive auth:", err);
      // Tauri errors can be strings or objects with message property
      let errorMsg = "Failed to start authentication";
      if (typeof err === "string") {
        errorMsg = err;
      } else if (err && typeof err === "object") {
        if ("message" in err) {
          errorMsg = String((err as { message: unknown }).message);
        } else {
          errorMsg = JSON.stringify(err);
        }
      }
      setAuthError(errorMsg);
      setOneDriveLoading(false);
    }
  };

  const handleCancelAuth = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setDeviceCode(null);
    setOneDriveLoading(false);
    setAuthError(null);
  };

  const handleCopyCode = async () => {
    if (deviceCode?.user_code) {
      await navigator.clipboard.writeText(deviceCode.user_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDisconnectOneDrive = async () => {
    try {
      setOneDriveLoading(true);
      await disconnectOneDrive();
      setOneDriveConnected(false);
    } catch (err) {
      console.error("Failed to disconnect OneDrive:", err);
    } finally {
      setOneDriveLoading(false);
    }
  };

  const handleClearLibrary = async () => {
    try {
      setClearingLibrary(true);
      const count = await clearLibrary();
      // Update the UI immediately
      setSongs([]);
      clearSelection();
      // Also invalidate the query cache so it stays in sync
      await queryClient.invalidateQueries({ queryKey: ["songs"] });
      setClearResult(t("settings.libraryCleared", { count }) || `Cleared ${count} songs from library index`);
      setShowClearConfirm(false);
      setTimeout(() => setClearResult(null), 5000);
    } catch (err) {
      console.error("Failed to clear library:", err);
      setClearResult("Failed to clear library");
    } finally {
      setClearingLibrary(false);
    }
  };

  const themes: Array<{
    value: ThemePreference;
    icon: React.ReactNode;
    label: string;
  }> = [
    {
      value: "light",
      icon: <Sun className="w-4 h-4" />,
      label: t("settings.themeLight"),
    },
    {
      value: "dark",
      icon: <Moon className="w-4 h-4" />,
      label: t("settings.themeDark"),
    },
    {
      value: "system",
      icon: <Monitor className="w-4 h-4" />,
      label: t("settings.themeSystem"),
    },
  ];

  const languages = [
    { code: "en", label: "English" },
    { code: "ja", label: "日本語" },
  ];

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>

        {/* Appearance Section */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">{t("settings.appearance")}</h2>

          {/* Theme */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("settings.theme")}</label>
            <div className="flex gap-2">
              {themes.map(({ value, icon, label }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-md border transition-colors",
                    theme === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-accent"
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
            <label className="text-sm font-medium">
              {t("settings.language")}
            </label>
            <div className="flex gap-2">
              {languages.map(({ code, label }) => (
                <button
                  key={code}
                  onClick={() => i18n.changeLanguage(code)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-md border transition-colors",
                    i18n.language === code
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-accent"
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
          <h2 className="text-lg font-medium">{t("settings.library")}</h2>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("settings.folders")}
            </label>
            <div className="p-4 border border-border rounded-md bg-background-secondary">
              <p className="text-sm text-muted-foreground">
                Library folder management coming soon...
              </p>
            </div>
          </div>

          {/* Clear Library */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("settings.libraryIndex", "Library Index")}
            </label>
            <div className="p-4 border border-border rounded-md bg-background-secondary space-y-3">
              {showClearConfirm ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <p className="text-sm">
                      {t("settings.clearLibraryWarning", "This will remove all songs from the library index. Your music files will NOT be deleted. You will need to rescan your folders to rebuild the library.")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleClearLibrary}
                      disabled={clearingLibrary}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
                    >
                      {clearingLibrary ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                      {t("settings.confirmClear", "Yes, Clear Index")}
                    </button>
                    <button
                      onClick={() => setShowClearConfirm(false)}
                      disabled={clearingLibrary}
                      className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      {t("settings.cancel", "Cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {t("settings.clearLibraryDescription", "Clear the library index to rescan from scratch")}
                  </p>
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-destructive text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t("settings.clearLibrary", "Clear Index")}
                  </button>
                </div>
              )}
              {clearResult && (
                <p className="text-sm text-green-600 dark:text-green-400">{clearResult}</p>
              )}
            </div>
          </div>
        </section>

        {/* Cloud Storage Section */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">
            {t("settings.cloudStorage", "Cloud Storage")}
          </h2>

          {/* OneDrive */}
          <div className="space-y-3">
            <label className="text-sm font-medium">OneDrive</label>
            <div className="p-4 border border-border rounded-md bg-background-secondary space-y-4">
              {oneDriveConnected ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <Cloud className="w-5 h-5" />
                    <span className="text-sm font-medium">
                      {t("settings.connected", "Connected")}
                    </span>
                  </div>
                  <button
                    onClick={handleDisconnectOneDrive}
                    disabled={oneDriveLoading}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-destructive text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                  >
                    {oneDriveLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CloudOff className="w-4 h-4" />
                    )}
                    {t("settings.disconnect", "Disconnect")}
                  </button>
                </div>
              ) : deviceCode ? (
                // Device code flow - show code to user
                <div className="space-y-4">
                  <div className="text-center space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      <span className="text-sm font-medium">
                        {t(
                          "settings.waitingForAuth",
                          "Waiting for authorization..."
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "settings.deviceCodeInstructions",
                        "A browser window has opened. Enter this code:"
                      )}
                    </p>
                  </div>

                  {/* User code display */}
                  <div className="flex items-center justify-center gap-2">
                    <code className="px-4 py-2 text-2xl font-mono font-bold bg-background border border-border rounded-lg tracking-widest">
                      {deviceCode.user_code}
                    </code>
                    <button
                      onClick={handleCopyCode}
                      className="p-2 rounded-md hover:bg-accent transition-colors"
                      title={t("settings.copyCode", "Copy code")}
                    >
                      {copied ? (
                        <Check className="w-5 h-5 text-green-500" />
                      ) : (
                        <Copy className="w-5 h-5 text-muted-foreground" />
                      )}
                    </button>
                  </div>

                  <p className="text-xs text-center text-muted-foreground">
                    {t("settings.orVisit", "Or visit:")}{" "}
                    <button
                      onClick={() => open(deviceCode.verification_uri)}
                      className="text-primary hover:underline"
                    >
                      {deviceCode.verification_uri}
                    </button>
                  </p>

                  <button
                    onClick={handleCancelAuth}
                    className="w-full px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors"
                  >
                    {t("settings.cancel", "Cancel")}
                  </button>
                </div>
              ) : (
                // Not connected - show connect button or setup
                <div className="space-y-3">
                  {showClientIdSetup ? (
                    // Client ID setup form
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <label className="text-xs font-medium">
                          Azure App Client ID
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={clientId}
                            onChange={(e) => setClientId(e.target.value)}
                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                            className="flex-1 px-3 py-1.5 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                          />
                          <button
                            onClick={handleSaveClientId}
                            disabled={!clientId.trim()}
                            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                          >
                            {clientIdSaved ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              "Save"
                            )}
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        To get a Client ID:{" "}
                        <button
                          onClick={() =>
                            open(
                              "https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                            )
                          }
                          className="text-primary hover:underline"
                        >
                          Register an app on Azure
                        </button>
                        {" → "}Enable "Allow public client flows" → Copy
                        Application (client) ID
                      </p>
                      <button
                        onClick={() => setShowClientIdSetup(false)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    // Normal connect UI
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <CloudOff className="w-5 h-5" />
                          <span className="text-sm">
                            {t("settings.notConnected", "Not connected")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowClientIdSetup(true)}
                            className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent transition-colors"
                            title="Configure Client ID"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleConnectOneDrive}
                            disabled={oneDriveLoading}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                          >
                            {oneDriveLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Cloud className="w-4 h-4" />
                            )}
                            {t("settings.connect", "Connect")}
                          </button>
                        </div>
                      </div>

                      {authError && (
                        <div className="space-y-2">
                          <p className="text-xs text-destructive">
                            {authError}
                          </p>
                          {authError.includes("Client ID") && (
                            <button
                              onClick={() => setShowClientIdSetup(true)}
                              className="text-xs text-primary hover:underline"
                            >
                              Configure Client ID →
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {t(
                  "settings.oneDriveDescription",
                  "Connect OneDrive to scan cloud-only files without downloading them."
                )}
              </p>
            </div>
          </div>
        </section>

        {/* Audio Section */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">{t("settings.audio")}</h2>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("settings.outputDevice")}
            </label>
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
              {t("common.appName")}{" "}
              <span className="text-muted-foreground">
                {t("common.appSubtitle")}
              </span>
            </h2>
            <p className="text-sm text-muted-foreground">Version 0.1.0</p>
            <p className="text-xs text-muted-foreground">
              Music management for Sony Walkman devices
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
