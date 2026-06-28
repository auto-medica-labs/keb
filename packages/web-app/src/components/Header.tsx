import { useState, useEffect, useRef } from "react";
import { Settings, User } from "lucide-react";
import type { ConnectionStatus } from "../lib/ws";
import type { BridgeMode } from "../lib/store";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface HeaderProps {
  connectionStatus: ConnectionStatus;
  mode: BridgeMode;
  username?: string;
  onOpenSettings: () => void;
}

const statusColors: Record<ConnectionStatus, string> = {
  connected: "bg-green-500 shadow-[0_0_6px_var(--color-green-500)]",
  disconnected: "bg-red-500 shadow-[0_0_6px_var(--color-red-500)]",
  connecting: "bg-yellow-500 shadow-[0_0_6px_var(--color-yellow-500)] animate-pulse",
  reconnecting: "bg-red-500 shadow-[0_0_6px_var(--color-red-500)]",
  max_retries: "bg-red-500 shadow-[0_0_6px_var(--color-red-500)]",
};

export default function Header({
  connectionStatus,
  mode,
  username,
  onOpenSettings,
}: HeaderProps) {
  const [isNarrow, setIsNarrow] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setIsNarrow(entry.contentRect.width < 500);
    });
    observer.observe(el);
    setIsNarrow(el.getBoundingClientRect().width < 500);
    return () => observer.disconnect();
  }, []);

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
            onClick={() => window.open("https://keb.mdevd.co/how-to-use", "_blank")}
            className="rounded p-0.5 transition-colors hover:bg-muted"
            aria-label="Learn how to use Keb"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5 text-muted-foreground"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
            </svg>
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
