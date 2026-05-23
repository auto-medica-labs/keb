import type { ConnectionStatus } from "../../lib/ws";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getWorkspaces } from "../../lib/store";
import { useState, useEffect } from "react";

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

export default function Header({ connectionStatus, workspace, onSwitchWorkspace }: HeaderProps) {
  const [workspaces, setWorkspaces] = useState<string[]>(["default"]);

  useEffect(() => {
    getWorkspaces().then((ws) => {
      if (ws.length > 0) setWorkspaces(["default", ...ws.filter((w) => w !== "default")]);
    });
  }, [connectionStatus]);

  return (
    <header className="flex justify-between items-center px-3 py-2.5 border-b bg-card flex-shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-base">🧠</span>
        <span className="font-semibold text-sm">KB</span>
        <Select value={workspace} onValueChange={(value) => value && onSwitchWorkspace(value)}>
          <SelectTrigger className="h-7 w-32 text-xs border-border ml-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((ws) => (
              <SelectItem key={ws} value={ws}>
                {ws}
              </SelectItem>
            ))}
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
