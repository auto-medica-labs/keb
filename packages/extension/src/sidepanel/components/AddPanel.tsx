import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle2, Wrench } from "lucide-react";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import type { ActiveOperation } from "../App";

interface AddPanelProps {
  operations: ActiveOperation[];
  connected: boolean;
  onAdd: (url: string) => void;
}

export default function AddPanel({ operations, connected, onAdd }: AddPanelProps) {
  const [url, setUrl] = useState("");
  const [doneFlash, setDoneFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for context menu URL
  useEffect(() => {
    const handler = () => {
      const ctxUrl = localStorage.getItem("kb:context-url");
      if (ctxUrl) {
        setUrl(ctxUrl);
        localStorage.removeItem("kb:context-url");
        inputRef.current?.focus();
      }
    };
    window.addEventListener("kb:context-url", handler);
    handler();
    return () => window.removeEventListener("kb:context-url", handler);
  }, []);

  // Flash check icon when the last in-progress add finishes
  const hasInProgress = operations.some((op) => !op.done);
  const hasDone = operations.length > 0 && !hasInProgress;
  const prevDoneRef = useRef(hasDone);
  useEffect(() => {
    if (hasDone && !prevDoneRef.current) {
      // All operations just completed — flash check icon
      setDoneFlash(true);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => {
        setDoneFlash(false);
        flashTimerRef.current = null;
      }, 2000);
    }
    prevDoneRef.current = hasDone;
    return () => {
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
    };
  }, [hasDone]);

  function handleSubmit() {
    const trimmed = url.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setUrl("");
    setDoneFlash(false);
  }

  const hasAnyOps = operations.length > 0;

  return (
    <div className="flex flex-col h-full gap-3">
      {/* URL input — shrink to content */}
      <div className="shrink-0">
        <label className="text-xs text-muted-foreground font-medium block mb-1.5">URL</label>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            type="url"
            placeholder="https://example.com/article"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            disabled={hasInProgress}
            className="flex-1 h-9 text-sm"
          />
          <Button
            onClick={handleSubmit}
            disabled={!connected || !url.trim() || hasInProgress}
            size="default"
            className="h-9"
          >
            {hasInProgress ? (
              <Loader2 className="size-4 animate-spin" />
            ) : doneFlash ? (
              <CheckCircle2 className="size-4" />
            ) : (
              "Fetch & Add"
            )}
          </Button>
        </div>
      </div>

      {/* Progress / timeline area — fills remaining space */}
      {hasAnyOps && (
        <div className="flex-1 min-h-0 border rounded-md bg-muted/50 flex flex-col">
          {/* Status header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
            {hasInProgress ? (
              <>
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Compiling — keep this tab open until done
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3.5 text-green-500" />
                <span className="text-xs text-green-500 font-medium">Complete!</span>
              </>
            )}
          </div>

          {/* Scrollable timeline — one card per operation */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3 leading-relaxed space-y-3">
              {operations.map((op) => (
                <OperationTimeline key={op.id} operation={op} />
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

/** Renders the timeline entries for a single operation (no outer card border). */
function OperationTimeline({ operation }: { operation: ActiveOperation }) {
  const { timeline } = operation;

  return (
    <div>
      {/* Timeline entries */}
      {timeline.map((entry, i) =>
        entry.type === "tool" ? (
          <div
            key={i}
            className={`flex items-center gap-1.5 font-mono text-[11px] ${entry.cls}${i > 0 && timeline[i - 1].type === "text" ? " mt-3" : ""}`}
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
          <div key={i} className="py-2 border-b border-border last:border-b-0">
            <MarkdownRenderer text={entry.text} />
          </div>
        ),
      )}
    </div>
  );
}
