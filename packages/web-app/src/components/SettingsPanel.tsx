import { useState, type FormEvent } from "react";
import type { BridgeMode } from "../lib/store";

interface SettingsPanelProps {
  mode: BridgeMode;
  bridgeUrl: string;
  username?: string;
  onSave: (mode: BridgeMode, bridgeUrl: string) => void;
  onClose: () => void;
  onLogout?: () => void;
}

export default function SettingsPanel({
  mode: initialMode,
  bridgeUrl: initialUrl,
  username,
  onSave,
  onClose,
  onLogout,
}: SettingsPanelProps) {
  const [mode, setMode] = useState<BridgeMode>(initialMode);
  const [bridgeUrl, setBridgeUrl] = useState(initialUrl);
  const [error, setError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const url = bridgeUrl.trim();
    if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
      setError("Bridge URL must start with ws:// or wss://");
      return;
    }
    // Remove trailing /ws if present
    const clean = url.replace(/\/ws\/?$/, "").replace(/\/+$/, "");
    onSave(mode, clean);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Configure your bridge connection.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Mode toggle */}
          <div>
            <label className="block text-sm font-medium mb-2">Mode</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("hosted")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  mode === "hosted"
                    ? "border-primary bg-primary/10 text-foreground font-medium"
                    : "border-input text-muted-foreground hover:text-foreground"
                }`}
              >
                Hosted
              </button>
              <button
                type="button"
                onClick={() => setMode("local")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  mode === "local"
                    ? "border-primary bg-primary/10 text-foreground font-medium"
                    : "border-input text-muted-foreground hover:text-foreground"
                }`}
              >
                Local
              </button>
            </div>
          </div>

          {/* Bridge URL */}
          <div>
            <label htmlFor="bridgeUrl" className="block text-sm font-medium mb-1">
              Bridge URL
            </label>
            <input
              id="bridgeUrl"
              type="text"
              value={bridgeUrl}
              onChange={(e) => setBridgeUrl(e.target.value)}
              placeholder="wss://api.mdevd.co/keb/v1"
              className="block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {mode === "hosted"
                ? "The hosted Keb bridge URL. Login/signup required."
                : "Your local bridge server URL (e.g., ws://127.0.0.1:9876)."}
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 pt-2">
            {username && onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="rounded-lg border border-destructive/30 px-3 py-2 text-xs text-destructive hover:bg-destructive/10"
              >
                Log out ({username})
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-input px-4 py-2 text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Save & Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
