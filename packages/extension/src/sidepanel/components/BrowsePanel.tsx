import { useState, useEffect } from "react";
import { FileText, TriangleAlert, Tag, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import {
  getSummaries,
  getConcepts,
  getRegistry,
  isEntryCompiled,
  type RegistryEntry,
} from "../../lib/store";
import type { Summary, Concept } from "../../lib/store";
import { escapeHtml } from "../../lib/utils";

interface BrowsePanelProps {
  onClearWorkspace: () => void;
}

export default function BrowsePanel({ onClearWorkspace }: BrowsePanelProps) {
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [concepts, setConcepts] = useState<Record<string, Concept>>({});
  const [pendingDocs, setPendingDocs] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const [sums, cons, reg] = await Promise.all([getSummaries(), getConcepts(), getRegistry()]);
      setSummaries(sums);
      setConcepts(cons);
      computePending(reg);
    })();

    // Re-render when storage changes
    const listener = () => {
      Promise.all([getSummaries(), getConcepts(), getRegistry()]).then(([sums, cons, reg]) => {
        setSummaries(sums);
        setConcepts(cons);
        computePending(reg);
      });
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  function computePending(reg: Record<string, unknown>) {
    const pending = new Set<string>();
    for (const entry of Object.values(reg)) {
      const e = entry as RegistryEntry;
      if (!isEntryCompiled(e) && e.docName) {
        pending.add(e.docName);
      }
    }
    setPendingDocs(pending);
  }

  const summNames = Object.keys(summaries);
  const concSlugs = Object.keys(concepts);

  if (summNames.length === 0 && concSlugs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-center text-sm text-muted-foreground">
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
            <h3 className="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Documents
            </h3>
            <div className="space-y-0.5">
              {summNames.map((name) => (
                <div
                  key={name}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 transition-colors hover:bg-accent"
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium text-primary">{escapeHtml(name)}</span>
                  {pendingDocs.has(name) && (
                    <span title="Compilation interrupted — pending">
                      <TriangleAlert className="size-3.5 shrink-0 text-amber-500" />
                    </span>
                  )}
                  {summaries[name].source && (
                    <span className="ml-auto max-w-30 truncate text-[11px] text-muted-foreground">
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
            <h3 className="mt-4 mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Concepts
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {concSlugs.map((slug) => (
                <Badge key={slug} variant="secondary" className="cursor-pointer">
                  <Tag className="size-3" /> {escapeHtml(slug)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Danger Zone */}
        <Separator />
        <div className="rounded-lg border border-destructive/40 p-3">
          <h3 className="mb-1 text-xs font-medium tracking-wider text-destructive uppercase">
            Danger Zone
          </h3>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Once cleared, all documents, summaries, and concepts in this workspace are permanently
            deleted. This action cannot be undone.
          </p>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="destructive" size="sm">
                  <Trash2 data-icon="inline-start" />
                  Clear Workspace
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear Workspace?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all documents, summaries, and concepts in this
                  workspace. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogPrimitive.Close
                  render={
                    <Button variant="destructive" size="default" onClick={onClearWorkspace}>
                      Clear Workspace
                    </Button>
                  }
                />
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </ScrollArea>
  );
}
