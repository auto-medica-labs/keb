import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getSummaries, getConcepts } from "../../lib/store";
import type { Summary, Concept } from "../../lib/store";
import { escapeHtml } from "../../lib/utils";

export default function BrowsePanel() {
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [concepts, setConcepts] = useState<Record<string, Concept>>({});

  useEffect(() => {
    (async () => {
      const [sums, cons] = await Promise.all([getSummaries(), getConcepts()]);
      setSummaries(sums);
      setConcepts(cons);
    })();

    // Re-render when storage changes
    const listener = () => {
      getSummaries().then(setSummaries);
      getConcepts().then(setConcepts);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const summNames = Object.keys(summaries);
  const concSlugs = Object.keys(concepts);

  if (summNames.length === 0 && concSlugs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground text-sm text-center">
          No documents yet. Add a URL to get started.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4">
        {summNames.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Documents
            </h3>
            <div className="space-y-0.5">
              {summNames.map((name) => (
                <div
                  key={name}
                  className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent cursor-pointer transition-colors"
                >
                  <span className="text-sm flex-shrink-0">📄</span>
                  <span className="text-sm font-medium text-primary">{escapeHtml(name)}</span>
                  {summaries[name].source && (
                    <span className="text-[11px] text-muted-foreground ml-auto truncate max-w-[120px]">
                      {escapeHtml(summaries[name].source)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {concSlugs.length > 0 && (
          <div>
            {summNames.length > 0 && <Separator />}
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 mt-4">
              Concepts
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {concSlugs.map((slug) => (
                <Badge key={slug} variant="secondary" className="cursor-pointer">
                  🏷️ {escapeHtml(slug)}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
