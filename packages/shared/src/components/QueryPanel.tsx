import { useState, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2 } from "lucide-react";
import OperationTimeline from "./OperationTimeline";
import { AutoScrollArea } from "@/components/ui/auto-scroll-area";
import type { ActiveOperation } from "./OperationTimeline";

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

  const op = operations[0];
  const hasInProgress = op && !op.done;
  const hasAnyOps = operations.length > 0;

  const totalTextLength = useMemo(() => {
    if (!op) return 0;
    return op.timeline.reduce(
      (sum, entry) => sum + (entry.type === "text" ? entry.text.length : 0),
      0,
    );
  }, [op?.timeline]);

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Chat area — fills remaining space, scrolls from bottom */}
      {hasAnyOps && (
        <div className="flex min-h-0 flex-1 flex-col rounded-md border bg-muted/50">
          <AutoScrollArea trigger={totalTextLength} className="min-h-0 flex-1">
            <div className="space-y-1 p-3 leading-relaxed">
              {operations.map((op) => (
                <div key={op.id}>
                  {/* Question */}
                  <div
                    className="mb-2 rounded-r-md px-3 py-2 text-sm font-medium"
                    style={{
                      borderLeftWidth: "4px",
                      borderLeftStyle: "solid",
                      borderLeftColor: "#1e3a8a",
                      backgroundColor: "#eff6ff",
                      color: "#000000",
                    }}
                  >
                    {op.label}
                  </div>

                  {/* Timeline */}
                  <OperationTimeline operation={op} />
                </div>
              ))}
            </div>
          </AutoScrollArea>

          {/* Status header at bottom */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-t px-3 py-2">
            <div className="flex items-center gap-2">
              {hasInProgress ? (
                <>
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Thinking — keep this page open until done
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-3.5 text-green-500" />
                  <span className="text-xs font-medium text-green-500">Complete!</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="shrink-0">
        <label className="mb-3 block text-xs font-medium text-muted-foreground" style={{ paddingLeft: 5 }}>
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
            className="h-9 flex-1 text-sm"
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
    </div>
  );
}
