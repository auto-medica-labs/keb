import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Wrench, CheckCircle2 } from "lucide-react";

type QueryEntry = {
  question: string;
  toolEvents: { text: string; cls: string }[];
  answerBlocks: string[];
};

interface QueryPanelProps {
  isQuerying: boolean;
  results: QueryEntry[];
  connected: boolean;
  onQuery: (text: string) => void;
}

export default function QueryPanel({
  isQuerying,
  results,
  connected,
  onQuery,
}: QueryPanelProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onQuery(trimmed);
    setText("");
    inputRef.current?.focus();
  }

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex-shrink-0">
        <label className="text-xs text-muted-foreground font-medium block mb-1.5">
          Ask the knowledge base
        </label>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            type="text"
            placeholder="What is the architecture?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            disabled={isQuerying}
            className="flex-1 h-9 text-sm"
          />
          <Button
            onClick={handleSubmit}
            disabled={!connected || !text.trim() || isQuerying}
            className="h-9"
          >
            {isQuerying ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Ask"
            )}
          </Button>
        </div>
      </div>

      {results.length > 0 && (
        <ScrollArea className="flex-1 min-h-0 border rounded-md bg-muted/30 p-3">
          <div className="space-y-4">
            {results.map((r, i) => (
              <div key={i} className="space-y-2">
                {/* Question */}
                <div className="bg-accent border-l-2 border-primary rounded-r-md px-3 py-2 text-sm font-medium">
                  {r.question}
                </div>

                {/* Tool events */}
                {r.toolEvents.length > 0 && (
                  <div className="rounded-md border bg-muted/50 p-2 font-mono text-[11px] leading-relaxed space-y-0.5">
                    {r.toolEvents.map((ev, j) => (
                      <div key={j} className={`flex items-center gap-1.5 ${ev.cls}`}>
                        {ev.cls.includes("green") ? (
                          <CheckCircle2 className="size-3 flex-shrink-0" />
                        ) : (
                          <Wrench className="size-3 flex-shrink-0" />
                        )}
                        {ev.text}
                      </div>
                    ))}
                  </div>
                )}

                {/* Answer blocks */}
                {r.answerBlocks.map((block, j) =>
                  block ? (
                    <div
                      key={j}
                      className="text-sm leading-relaxed whitespace-pre-wrap py-2 px-1 border-b border-border last:border-b-0"
                    >
                      {block}
                    </div>
                  ) : null
                )}
              </div>
            ))}
            {isQuerying && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                <Loader2 className="size-3 animate-spin" />
                Thinking...
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
