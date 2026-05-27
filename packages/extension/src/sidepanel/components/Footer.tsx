import { BarChart3, TriangleAlert, Cog, Search } from "lucide-react";

interface FooterProps {
  docCount: number;
  conceptCount: number;
  pendingCount: number;
  agentStatus: "compiling" | "repairing" | "thinking" | "";
  onRepair: () => void;
}

function AgentStatusIcon({ status }: { status: FooterProps["agentStatus"] }) {
  switch (status) {
    case "compiling":
    case "repairing":
      return <Cog className="size-3 animate-spin" />;
    case "thinking":
      return <Search className="size-3" />;
    default:
      return null;
  }
}

function AgentStatusLabel({ status }: { status: FooterProps["agentStatus"] }) {
  switch (status) {
    case "compiling":
      return "Compiling...";
    case "repairing":
      return "Repairing...";
    case "thinking":
      return "Thinking...";
    default:
      return null;
  }
}

export default function Footer({
  docCount,
  conceptCount,
  pendingCount,
  agentStatus,
  onRepair,
}: FooterProps) {
  return (
    <footer className="flex justify-between items-center px-3 py-1.5 border-t bg-card text-[11px] text-muted-foreground shrink-0">
      <span className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <BarChart3 className="size-3" />
          {docCount} docs · {conceptCount} concepts
        </span>
        {pendingCount > 0 && (
          <button
            onClick={onRepair}
            disabled={agentStatus !== ""}
            className="inline-flex items-center gap-1 whitespace-nowrap text-amber-500 hover:text-amber-400 underline cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
            title={
              agentStatus !== ""
                ? "Wait for current operation to finish"
                : "Repair interrupted compilations"
            }
          >
            <TriangleAlert className="size-3" />
            {pendingCount} pending
          </button>
        )}
      </span>
      {agentStatus && (
        <span className="flex items-center gap-1">
          <AgentStatusIcon status={agentStatus} />
          <AgentStatusLabel status={agentStatus} />
        </span>
      )}
    </footer>
  );
}
