import type { ConnectionStatus } from "../../lib/ws";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getWorkspaces } from "../../lib/store";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";

interface HeaderProps {
  connectionStatus: ConnectionStatus;
  workspace: string;
  onSwitchWorkspace: (name: string) => void;
}

const statusColors: Record<ConnectionStatus, string> = {
  connected: "bg-green-500 shadow-[0_0_6px_var(--color-green-500)]",
  disconnected: "bg-red-500 shadow-[0_0_6px_var(--color-red-500)]",
  connecting: "bg-yellow-500 shadow-[0_0_6px_var(--color-yellow-500)] animate-pulse",
  reconnecting: "bg-red-500 shadow-[0_0_6px_var(--color-red-500)]",
};

const KB_WORKSPACES_KEY = "kb:workspaces";

export default function Header({ connectionStatus, workspace, onSwitchWorkspace }: HeaderProps) {
  const [workspaces, setWorkspaces] = useState<string[]>(["default"]);
  const mountedRef = useRef(false);

  // Fetch workspaces from storage whenever it changes (sync result arrives later)
  const refreshWorkspaces = useCallback(() => {
    getWorkspaces().then((ws) => {
      const merged = ["default"];
      for (const w of ws) {
        if (w !== "default" && !merged.includes(w)) merged.push(w);
      }
      setWorkspaces(merged);
    });
  }, []);

  // Fetch on mount
  useEffect(() => {
    refreshWorkspaces();
    mountedRef.current = true;
  }, [refreshWorkspaces]);

  // Refresh when connection is (re-)established, since sync may have just completed
  useEffect(() => {
    if (connectionStatus === "connected" && mountedRef.current) {
      refreshWorkspaces();
    }
  }, [connectionStatus, refreshWorkspaces]);

  // Listen for storage changes (workspaces arrive via sync after connection)
  useEffect(() => {
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && changes[KB_WORKSPACES_KEY]) {
        refreshWorkspaces();
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [refreshWorkspaces]);

  // Base UI Select requires an `items` prop on the root for internal state management
  const workspaceItems = useMemo(
    () => workspaces.map((ws) => ({ label: ws, value: ws })),
    [workspaces],
  );

  return (
    <header className="flex justify-between items-center px-3 py-2.5 bg-card flex-shrink-0">
      <div className="flex items-center gap-2">
        <img
          src="https://r2.mdevd.co/asset/logo_transparent.png"
          alt="logo"
          className="size-5 object-contain"
        />
        <span className="font-semibold text-sm">Knowledge Bases</span>
        <Select
          value={workspace}
          items={workspaceItems}
          onValueChange={(value) => value && onSwitchWorkspace(value)}
        >
          <SelectTrigger className="h-7 w-32 text-xs border-border ml-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {workspaces.map((ws) => (
                <SelectItem key={ws} value={ws}>
                  {ws}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`size-2 rounded-full flex-shrink-0 ${statusColors[connectionStatus]}`} />
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
          {connectionStatus}
        </span>
      </div>
    </header>
  );
}
