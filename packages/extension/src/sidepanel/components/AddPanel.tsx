import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle2, Wrench } from "lucide-react";
import MarkdownRenderer from "@/components/MarkdownRenderer";

type TimelineEntry = { type: "tool"; text: string; cls: string } | { type: "text"; text: string };

interface AddPanelProps {
  isAdding: boolean;
  isDone: boolean;
  timeline: TimelineEntry[];
  connected: boolean;
  onAdd: (url: string) => void;
}

export default function AddPanel({ isAdding, isDone, timeline, connected, onAdd }: AddPanelProps) {
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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

  function handleSubmit() {
    const trimmed = url.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setUrl("");
  }

  const hasTimeline = timeline.length > 0;

  return (
    <div className="flex flex-col h-full gap-3">
      {/* URL input — shrink to content */}
      <div className="flex-shrink-0">
        <label className="text-xs text-muted-foreground font-medium block mb-1.5">URL</label>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            type="url"
            placeholder="https://example.com/article"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            disabled={isAdding}
            className="flex-1 h-9 text-sm"
          />
          <Button
            onClick={handleSubmit}
            disabled={!connected || !url.trim() || isAdding}
            size="default"
            className="h-9"
          >
            {isAdding ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isDone ? (
              <CheckCircle2 className="size-4" />
            ) : (
              "Fetch & Add"
            )}
          </Button>
        </div>
      </div>

      {/* Progress / timeline area — fills remaining space */}
      {hasTimeline && (
        <div className="flex-1 min-h-0 border rounded-md bg-muted/50 flex flex-col">
          {/* Status header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0">
            {isAdding && !isDone ? (
              <>
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Compiling...</span>
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
              {timeline.map((entry, i) =>
                entry.type === "tool" ? (
                  <div key={i} className={`flex items-center gap-1.5 font-mono text-[11px] ${entry.cls}`}>
                    {entry.cls.includes("green") ? (
                      <CheckCircle2 className="size-3 flex-shrink-0" />
                    ) : (
                      <Wrench className="size-3 flex-shrink-0" />
                    )}
                    {entry.text}
                  </div>
                ) : (
                  <div
                    key={i}
                    className="py-2 border-b border-border last:border-b-0"
                  >
                    <MarkdownRenderer text={entry.text} />
                  </div>
                ),
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
