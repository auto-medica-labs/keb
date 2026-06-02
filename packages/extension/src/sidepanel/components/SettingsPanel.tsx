import { LogOut, Settings, X, Monitor, Globe } from "lucide-react";
import type { BridgeMode, BridgeConfig } from "../../lib/store";

export interface SettingsPanelProps {
  config: BridgeConfig;
  onModeChange: (mode: BridgeMode) => void;
  onLogout: () => void;
  onClose: () => void;
}

export default function SettingsPanel({
  config,
  onModeChange,
  onLogout,
  onClose,
}: SettingsPanelProps) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Settings className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Settings</span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 transition-colors hover:bg-muted"
          aria-label="Close settings"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {/* Mode */}
        <label className="text-xs font-medium text-muted-foreground">Bridge Mode</label>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => onModeChange("local")}
            className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
              config.mode === "local"
                ? "bg-primary/10 border-primary text-primary"
                : "border-border hover:bg-muted"
            }`}
          >
            <Monitor className="mx-auto mb-1 size-4" />
            Local
            <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
              No login required
            </span>
          </button>
          <button
            onClick={() => onModeChange("hosted")}
            className={`flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
              config.mode === "hosted"
                ? "bg-primary/10 border-primary text-primary"
                : "border-border hover:bg-muted"
            }`}
          >
            <Globe className="mx-auto mb-1 size-4" />
            Hosted
            <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
              Login required
            </span>
          </button>
        </div>

        {/* Sign out (hosted mode only) */}
        {config.mode === "hosted" && config.username && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{config.username}</span>
            </p>
            <button
              onClick={() => {
                onLogout();
                onClose();
              }}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-destructive/30 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="size-4" />
              Sign Out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
