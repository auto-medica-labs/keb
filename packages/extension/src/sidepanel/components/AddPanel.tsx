import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2 } from "lucide-react";
import OperationTimeline from "./OperationTimeline";
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
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const prevTextLengthRef = useRef(0);

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

  // Auto-scroll to bottom when text content grows (streaming) or new entries arrive
  const totalTextLength = useMemo(() => {
    return operations.reduce((sum, op) => {
      return (
        sum +
        op.timeline.reduce((s, entry) => s + (entry.type === "text" ? entry.text.length : 0), 0)
      );
    }, 0);
  }, [operations]);

  useEffect(() => {
    if (totalTextLength > prevTextLengthRef.current) {
      const viewport = scrollViewportRef.current;
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
    prevTextLengthRef.current = totalTextLength;
  }, [totalTextLength]);

  // Scroll to bottom on initial render when there are operations
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
      {/* URL input — shrink to content */}
      <div className="shrink-0">
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">URL</label>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            type="url"
            placeholder="https://example.com/article"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            disabled={hasInProgress}
            className="h-9 flex-1 text-sm"
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
        <div className="flex min-h-0 flex-1 flex-col rounded-md border bg-muted/50">
          {/* Status header */}
          <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
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
                <span className="text-xs font-medium text-green-500">Complete!</span>
              </>
            )}
          </div>

          {/* Scrollable timeline — one card per operation */}
          <div
            ref={scrollViewportRef}
            className="min-h-0 flex-1 overflow-y-auto"
            style={{ scrollbarWidth: "thin" }}
          >
            <div className="space-y-3 p-3 leading-relaxed">
              {operations.map((op) => (
                <OperationTimeline key={op.id} operation={op} />
              ))}
              {/* Bottom anchor for auto-scroll */}
              <div style={{ height: 1 }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
