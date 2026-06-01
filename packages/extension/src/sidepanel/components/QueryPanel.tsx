import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Wrench, CheckCircle2 } from "lucide-react";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import type { ActiveOperation } from "../App";

interface QueryPanelProps {
  operations: ActiveOperation[];
  connected: boolean;
  onQuery: (text: string) => void;
}

export default function QueryPanel({ operations, connected, onQuery }: QueryPanelProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onQuery(trimmed);
    setText("");
    inputRef.current?.focus();
  }

  const hasInProgress = operations.some((op) => !op.done);
  const hasAnyOps = operations.length > 0;

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="shrink-0">
        <label className="text-xs text-muted-foreground font-medium block mb-1.5">
          Ask the knowledge base
        </label>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            type="text"
            placeholder="Ask some question..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            disabled={hasInProgress}
            className="flex-1 h-9 text-sm"
          />
          <Button
            onClick={handleSubmit}
            disabled={!connected || !text.trim() || hasInProgress}
            className="h-9"
          >
            {hasInProgress ? <Loader2 className="size-4 animate-spin" /> : "Ask"}
          </Button>
        </div>
      </div>

      {hasAnyOps && (
        <div className="flex-1 min-h-0 border rounded-md bg-muted/50 flex flex-col">
          {/* Status header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
            {hasInProgress ? (
              <>
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Thinking — keep this tab open until done
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3.5 text-green-500" />
                <span className="text-xs text-green-500 font-medium">Complete!</span>
              </>
            )}
          </div>

          {/* Scrollable timeline */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3 leading-relaxed space-y-1">
              {operations.map((op) => (
                <div key={op.id}>
                  {/* Question */}
                  <div className="bg-accent border-l-2 border-primary rounded-r-md px-3 py-2 text-sm font-medium mb-2">
                    {op.label}
                  </div>

                  {/* Timeline — chronological interleave of tool calls & agent output */}
                  {op.timeline.map((entry, j) =>
                    entry.type === "tool" ? (
                      <div
                        key={j}
                        className={`flex items-center gap-1.5 font-mono text-[11px] ${entry.cls}${j > 0 && op.timeline[j - 1].type === "text" ? " mt-3" : ""}`}
                      >
                        {entry.cls.includes("green") ? (
                          <CheckCircle2 className="size-3 shrink-0" />
                        ) : entry.cls.includes("red") ? (
                          <Wrench className="size-3 shrink-0 text-red-400" />
                        ) : (
                          <Wrench className="size-3 shrink-0" />
                        )}
                        {entry.text}
                      </div>
                    ) : (
                      <div key={j} className="py-2 border-b border-border last:border-b-0">
                        <MarkdownRenderer text={entry.text} />
                      </div>
                    ),
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
