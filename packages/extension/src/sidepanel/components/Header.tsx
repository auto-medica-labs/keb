import type { ConnectionStatus } from "../../lib/ws";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getWorkspaces, type BridgeMode } from "../../lib/store";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Settings, User, CircleHelp } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

const NARROW_BREAKPOINT = 500;

interface HeaderProps {
  connectionStatus: ConnectionStatus;
  workspace: string;
  mode: BridgeMode;
  username?: string;
  onSwitchWorkspace: (name: string) => void;
  onOpenSettings: () => void;
}

const statusColors: Record<ConnectionStatus, string> = {
  connected: "bg-green-500 shadow-[0_0_6px_var(--color-green-500)]",
  disconnected: "bg-red-500 shadow-[0_0_6px_var(--color-red-500)]",
  connecting: "bg-yellow-500 shadow-[0_0_6px_var(--color-yellow-500)] animate-pulse",
  reconnecting: "bg-red-500 shadow-[0_0_6px_var(--color-red-500)]",
  max_retries: "bg-red-500 shadow-[0_0_6px_var(--color-red-500)]",
};

const KB_WORKSPACES_KEY = "kb:workspaces";

export default function Header({
  connectionStatus,
  workspace,
  mode,
  username,
  onSwitchWorkspace,
  onOpenSettings,
}: HeaderProps) {
  const [workspaces, setWorkspaces] = useState<string[]>(["default"]);
  const [isNarrow, setIsNarrow] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
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

  // Fetch on mount (local mode only)
  useEffect(() => {
    if (mode !== "hosted") refreshWorkspaces();
    mountedRef.current = true;
  }, [refreshWorkspaces, mode]);

  // Refresh when connection is (re-)established (local mode only)
  useEffect(() => {
    if (mode !== "hosted" && connectionStatus === "connected" && mountedRef.current) {
      refreshWorkspaces();
    }
  }, [connectionStatus, refreshWorkspaces, mode]);

  // Resize observer to detect narrow panel
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setIsNarrow(entry.contentRect.width < NARROW_BREAKPOINT);
    });
    observer.observe(el);
    // Check initial width in case the panel is already narrow on mount
    setIsNarrow(el.getBoundingClientRect().width < NARROW_BREAKPOINT);
    return () => observer.disconnect();
  }, []);

  // Listen for storage changes (workspaces arrive via sync after connection)
  useEffect(() => {
    if (mode === "hosted") return;
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && changes[KB_WORKSPACES_KEY]) {
        refreshWorkspaces();
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [refreshWorkspaces, mode]);

  // Base UI Select requires an `items` prop on the root for internal state management
  const workspaceItems = useMemo(
    () => workspaces.map((ws) => ({ label: ws, value: ws })),
    [workspaces],
  );

  return (
    <header
      ref={headerRef}
      className="flex shrink-0 items-center justify-between bg-card px-3 py-2.5"
    >
      <div className="flex items-center gap-2">
        <img
          src="https://r2.mdevd.co/asset/logo_transparent.png"
          alt="logo"
          className="size-5 object-contain"
        />
        <span className="text-sm font-semibold">{isNarrow ? "Keb" : "Keb — Knowledge Bases"}</span>
        {/* Workspace selector — only in local mode (hosted enforces username) */}
        {mode !== "hosted" && (
          <Select
            value={workspace}
            items={workspaceItems}
            onValueChange={(value) => value && onSwitchWorkspace(value)}
          >
            <SelectTrigger className="ml-1 h-7 w-32 border-border text-xs">
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
        )}
        {/* Username badge — only in hosted mode */}
        {mode === "hosted" && username && (
          <span className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <User className="size-3" />
            {username}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger
            render={<button />}
            onClick={() => chrome.tabs.create({ url: "https://keb.mdevd.co/how-to-use" })}
            className="rounded p-0.5 transition-colors hover:bg-muted"
            aria-label="Learn how to use Keb"
          >
            <CircleHelp className="size-3.5 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent side="bottom">Learn how to use Keb</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={<button />}
            onClick={onOpenSettings}
            className="rounded p-0.5 transition-colors hover:bg-muted"
            aria-label="Settings"
          >
            <Settings className="size-3.5 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent side="bottom">Settings</TooltipContent>
        </Tooltip>
        <span className={`size-2 shrink-0 rounded-full ${statusColors[connectionStatus]}`} />
        {connectionStatus === "max_retries" ? (
          <span className="text-right text-[11px] leading-tight text-destructive">OFFLINE</span>
        ) : (
          <span className="text-[11px] tracking-wider text-muted-foreground uppercase">
            {connectionStatus}
          </span>
        )}
      </div>
    </header>
  );
}
