interface FooterProps {
  docCount: number;
  conceptCount: number;
  agentStatus: string;
}

export default function Footer({ docCount, conceptCount, agentStatus }: FooterProps) {
  return (
    <footer className="flex justify-between items-center px-3 py-1.5 border-t bg-card text-[11px] text-muted-foreground flex-shrink-0">
      <span>
        📊 {docCount} docs · {conceptCount} concepts
      </span>
      {agentStatus && <span>{agentStatus}</span>}
    </footer>
  );
}
