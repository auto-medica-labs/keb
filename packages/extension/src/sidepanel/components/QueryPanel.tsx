import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
    <div className="flex h-full flex-col gap-3">
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

      {hasAnyOps && (
        <div className="flex min-h-0 flex-1 flex-col rounded-md border bg-muted/50">
          {/* Status header */}
          <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
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

          {/* Scrollable timeline */}
          <ScrollArea className="min-h-0 flex-1">
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
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
