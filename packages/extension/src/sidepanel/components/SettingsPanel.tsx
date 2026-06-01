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
    <div className="absolute inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Settings className="size-4 text-muted-foreground" />
          <span className="font-semibold text-sm">Settings</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-muted transition-colors"
          aria-label="Close settings"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 space-y-5 overflow-y-auto">
        {/* Mode */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Bridge Mode</label>
          <div className="flex gap-2">
            <button
              onClick={() => onModeChange("local")}
              className={`flex-1 px-3 py-2 rounded-md text-xs font-medium border transition-colors ${
                config.mode === "local"
                  ? "bg-primary/10 border-primary text-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              <Monitor className="size-4 mx-auto mb-1" />
              Local
              <span className="block text-[10px] font-normal text-muted-foreground mt-0.5">
                No login required
              </span>
            </button>
            <button
              onClick={() => onModeChange("hosted")}
              className={`flex-1 px-3 py-2 rounded-md text-xs font-medium border transition-colors ${
                config.mode === "hosted"
                  ? "bg-primary/10 border-primary text-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              <Globe className="size-4 mx-auto mb-1" />
              Hosted
              <span className="block text-[10px] font-normal text-muted-foreground mt-0.5">
                Login required
              </span>
            </button>
          </div>
        </div>

        {/* Sign out (hosted mode only) */}
        {config.mode === "hosted" && config.username && (
          <div className="pt-3 border-t border-border space-y-2">
            <p className="text-xs text-muted-foreground">
              Signed in as{" "}
              <span className="font-medium text-foreground">{config.username}</span>
            </p>
            <button
              onClick={() => {
                onLogout();
                onClose();
              }}
              className="w-full flex items-center justify-center gap-2 h-9 rounded-md text-xs font-medium border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
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
