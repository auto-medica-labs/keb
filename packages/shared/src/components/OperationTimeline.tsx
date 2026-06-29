import { CheckCircle2, Wrench } from "lucide-react";
import MarkdownRenderer from "./MarkdownRenderer";

export type TimelineEntry =
  | { type: "tool"; text: string; cls: string }
  | { type: "text"; text: string };

export type ActiveOperation = {
  id: string;
  type: "add" | "query" | "repair";
  timeline: TimelineEntry[];
  label: string;
  done: boolean;
  blocked?: boolean;
};

interface OperationTimelineProps {
  operation: ActiveOperation;
}

export default function OperationTimeline({ operation }: OperationTimelineProps) {
  const { timeline } = operation;
  const visibleEntries = timeline.filter(
    (entry) => entry.type !== "text" || entry.text.trim() !== "",
  );

  return (
    <div>
      {visibleEntries.map((entry, i) =>
        entry.type === "tool" ? (
          <div
            key={i}
            className={`flex items-start gap-1.5 font-mono text-[11px] whitespace-pre-wrap ${entry.cls}${i > 0 && visibleEntries[i - 1].type === "text" ? " mt-5" : ""}`}
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
          <div
            key={i}
            className={`py-2${i > 0 && visibleEntries[i - 1].type === "tool" ? " mt-5" : ""}`}
          >
            <MarkdownRenderer text={entry.text} />
          </div>
        ),
      )}
    </div>
  );
}
