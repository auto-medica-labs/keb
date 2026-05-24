interface FooterProps {
  docCount: number;
  conceptCount: number;
  pendingCount: number;
  agentStatus: string;
  onRepair: () => void;
}

export default function Footer({ docCount, conceptCount, pendingCount, agentStatus, onRepair }: FooterProps) {
  return (
    <footer className="flex justify-between items-center px-3 py-1.5 border-t bg-card text-[11px] text-muted-foreground flex-shrink-0">
      <span className="flex items-center gap-2">
        <span>📊 {docCount} docs · {conceptCount} concepts</span>
        {pendingCount > 0 && (
          <button
            onClick={onRepair}
            className="text-amber-500 hover:text-amber-400 underline cursor-pointer transition-colors"
            title="Repair interrupted compilations"
          >
            ⚠ {pendingCount} pending
          </button>
        )}
      </span>
      {agentStatus && <span>{agentStatus}</span>}
    </footer>
  );
}
