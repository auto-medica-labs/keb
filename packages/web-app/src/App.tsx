import { useState, useEffect, useRef, useCallback } from "react";
import { BridgeClient, type ConnectionStatus } from "./lib/ws";
import { loadConfig, saveConfig, clearConfig, getDefaultConfig, type AppConfig, type BridgeMode } from "./lib/store";
import { fetchConfig, getMe } from "./lib/api";
import AuthScreen from "./components/AuthScreen";
import ChatScreen from "./components/ChatScreen";
import SettingsPanel from "./components/SettingsPanel";

type Page = "loading" | "settings" | "auth" | "chat";

export default function App() {
  const [page, setPage] = useState<Page>("loading");
  const [config, setConfig] = useState<AppConfig>(getDefaultConfig());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [showSettings, setShowSettings] = useState(false);
  const clientRef = useRef<BridgeClient | null>(null);

  // Initialize: load config and determine initial page
  useEffect(() => {
    const saved = loadConfig();
    if (saved) {
      setConfig(saved);

      if (saved.mode === "hosted") {
        if (saved.token) {
          // Verify token is still valid, then go to chat
          verifyAndConnect(saved);
        } else {
          // No token — need auth
          setPage("auth");
        }
      } else {
        // Local mode — auto-connect
        setPage("chat");
        connectClient(saved);
      }
    } else {
      // First visit — show settings
      setPage("settings");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Verify token and connect
  async function verifyAndConnect(cfg: AppConfig) {
    if (!cfg.token) {
      setPage("auth");
      return;
    }
    try {
      await getMe(cfg.bridgeUrl, cfg.token);
      // Token valid — connect WS
      connectClient(cfg);
      setPage("chat");
    } catch {
      // Token expired/invalid — clear and show auth
      const updated = { ...cfg, token: undefined, username: undefined };
      setConfig(updated);
      saveConfig(updated);
      setPage("auth");
    }
  }

  // Create or reuse bridge client and connect
  function connectClient(cfg: AppConfig) {
    if (!clientRef.current) {
      clientRef.current = new BridgeClient((status) => {
        setConnectionStatus(status);
      });
    }
    clientRef.current.connect(cfg.bridgeUrl, cfg.token);
  }

  // Disconnect and reset
  function disconnectClient() {
    clientRef.current?.disconnect();
  }

  // Settings: save and reconnect
  function handleSaveSettings(mode: BridgeMode, bridgeUrl: string) {
    const newConfig: AppConfig = {
      mode,
      bridgeUrl,
      // Preserve token/username if mode stays hosted, otherwise clear
      ...(mode === "hosted" ? { token: config.token, username: config.username } : {}),
    };
    setConfig(newConfig);
    saveConfig(newConfig);
    setShowSettings(false);

    // Disconnect existing
    disconnectClient();

    if (mode === "hosted") {
      if (newConfig.token) {
        connectClient(newConfig);
        setPage("chat");
      } else {
        setPage("auth");
      }
    } else {
      connectClient(newConfig);
      setPage("chat");
    }
  }

  // Auth: token received from login/signup
  function handleAuthenticated(token: string, username: string) {
    const updated: AppConfig = { ...config, token, username };
    setConfig(updated);
    saveConfig(updated);
    connectClient(updated);
    setPage("chat");
  }

  // Auth: go back to settings
  function handleAuthBack() {
    disconnectClient();
    setPage("settings");
  }

  // Disconnect from chat
  function handleDisconnect() {
    disconnectClient();
    // Go back to settings
    setPage("settings");
  }

  // Logout from settings
  function handleLogout() {
    const updated: AppConfig = { ...config, token: undefined, username: undefined };
    setConfig(updated);
    saveConfig(updated);
    disconnectClient();
    setShowSettings(false);
    setPage("auth");
  }

  // ── Render ─────────────────────────────────────────────────────

  // Loading screen
  if (page === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  // Settings screen (first-time setup)
  if (page === "settings" && !showSettings) {
    return (
      <div className="flex h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight">Keb Chat</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Connect to your Keb knowledge base to start asking questions.
            </p>
          </div>
          <SettingsPanel
            mode={config.mode}
            bridgeUrl={config.bridgeUrl}
            username={config.username}
            onSave={handleSaveSettings}
            onClose={() => {}} // No close on first-time setup
            onLogout={config.username ? handleLogout : undefined}
          />
        </div>
      </div>
    );
  }

  // Auth screen (hosted mode, no token)
  if (page === "auth") {
    return (
      <AuthScreen
        bridgeUrl={config.bridgeUrl}
        onAuthenticated={handleAuthenticated}
        onBack={handleAuthBack}
      />
    );
  }

  // Chat screen
  return (
    <>
      {showSettings && (
        <SettingsPanel
          mode={config.mode}
          bridgeUrl={config.bridgeUrl}
          username={config.username}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
          onLogout={handleLogout}
        />
      )}
      {clientRef.current && (
        <ChatScreen
          client={clientRef.current}
          connectionStatus={connectionStatus}
          username={config.username}
          onDisconnect={handleDisconnect}
          onSettings={() => setShowSettings(true)}
        />
      )}
    </>
  );
}
