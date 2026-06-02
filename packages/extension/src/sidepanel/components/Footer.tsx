import { BarChart3, TriangleAlert, Cog, Search } from "lucide-react";

interface FooterProps {
  docCount: number;
  conceptCount: number;
  hasPending: boolean;
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
  hasPending,
  agentStatus,
  onRepair,
}: FooterProps) {
  return (
    <footer className="flex shrink-0 items-center justify-between border-t bg-card px-3 py-1.5 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <BarChart3 className="size-3" />
          {docCount} docs · {conceptCount} concepts
        </span>
        {hasPending && (
          <button
            onClick={onRepair}
            disabled={agentStatus !== ""}
            className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap text-amber-500 underline transition-colors hover:text-amber-400 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40"
            title={
              agentStatus !== ""
                ? "Wait for current operation to finish"
                : "Repair interrupted compilations"
            }
          >
            <TriangleAlert className="size-3" />
            pending
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
