import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2 } from "lucide-react";
import OperationTimeline from "./OperationTimeline";
import type { ActiveOperation } from "../App";

interface QueryPanelProps {
  operations: ActiveOperation[];
  connected: boolean;
  onQuery: (text: string) => void;
}

export default function QueryPanel({ operations, connected, onQuery }: QueryPanelProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const prevTimelineLengthRef = useRef(0);

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

  // Auto-scroll to bottom when new timeline entries arrive OR text content grows
  // (text streaming appends to last entry without changing timeline.length)
  const totalTextLength = useMemo(() => {
    if (!op) return 0;
    return op.timeline.reduce(
      (sum, entry) => sum + (entry.type === "text" ? entry.text.length : 0),
      0,
    );
  }, [op?.timeline]);

  useEffect(() => {
    if (totalTextLength > prevTimelineLengthRef.current) {
      const viewport = scrollViewportRef.current;
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
    prevTimelineLengthRef.current = totalTextLength;
  }, [totalTextLength]);

  // Scroll to bottom on initial render when there's an operation
  useEffect(() => {
    if (hasAnyOps) {
      const viewport = scrollViewportRef.current;
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [hasAnyOps]);

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Chat area — fills remaining space, scrolls from bottom */}
      {hasAnyOps && (
        <div className="flex min-h-0 flex-1 flex-col rounded-md border bg-muted/50">
          <div
            ref={scrollViewportRef}
            className="min-h-0 flex-1 overflow-y-auto"
            style={{ scrollbarWidth: "thin" }}
          >
            <div className="space-y-1 p-3 leading-relaxed">
              {operations.map((op) => (
                <div key={op.id}>
                  {/* Question */}
                  <div className="mb-2 rounded-r-md border-l-2 border-primary bg-accent px-3 py-2 text-sm font-medium">
                    {op.label}
                  </div>

                  {/* Timeline — chronological interleave of tool calls & agent output */}
                  <OperationTimeline operation={op} />
                </div>
              ))}
              {/* Bottom anchor for auto-scroll */}
              <div style={{ height: 1 }} />
            </div>
          </div>

          {/* Status header at bottom of chat area */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-t px-3 py-2">
            <div className="flex items-center gap-2">
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
                  <span className="text-xs font-medium text-green-500">Complete!</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Input area — pinned at bottom */}
      <div className="shrink-0">
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
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
