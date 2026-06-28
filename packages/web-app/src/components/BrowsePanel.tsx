import { useState, useEffect } from "react";
import { FileText, ArrowLeft, Tag, Trash2 } from "lucide-react";
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
import MarkdownRenderer from "@keb/shared/components/MarkdownRenderer";
import { getSummaries, getConcepts } from "../lib/store";
import type { Summary, Concept } from "../lib/store";

function stripFrontmatter(content: string): string {
  if (content.startsWith("---")) {
    const end = content.indexOf("---", 3);
    if (end !== -1) {
      content = content.slice(end + 3).trimStart();
    }
  }
  return content;
}

interface BrowsePanelProps {
  onClearWorkspace: () => void;
}

type DetailView = { type: "doc"; name: string } | { type: "concept"; slug: string } | null;

export default function BrowsePanel({ onClearWorkspace }: BrowsePanelProps) {
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [concepts, setConcepts] = useState<Record<string, Concept>>({});
  const [detail, setDetail] = useState<DetailView>(null);

  const reload = () => {
    Promise.all([getSummaries(), getConcepts()]).then(([sums, cons]) => {
      setSummaries(sums);
      setConcepts(cons);
    });
  };

  useEffect(() => {
    reload();

    const handler = () => reload();
    window.addEventListener("keb:storage-changed", handler);
    return () => window.removeEventListener("keb:storage-changed", handler);
  }, []);

  const summNames = Object.keys(summaries);
  const concSlugs = Object.keys(concepts);

  // ── Detail view ───────────────────────────────────────────────────

  if (detail?.type === "doc") {
    const doc = summaries[detail.name];
    if (!doc) {
      setDetail(null);
      return null;
    }
    return (
      <ScrollArea className="h-full">
        <div className="space-y-4">
          <button
            onClick={() => setDetail(null)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back to Browse
          </button>

          {doc.title && <h1 className="text-lg font-semibold">{doc.title}</h1>}
          {doc.tags && doc.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {doc.tags.map((t) => (
                <Badge key={t} variant="secondary" className="text-[10px]">
                  {t}
                </Badge>
              ))}
            </div>
          )}
          <MarkdownRenderer text={stripFrontmatter(doc.content)} />
        </div>
      </ScrollArea>
    );
  }

  if (detail?.type === "concept") {
    const concept = concepts[detail.slug];
    if (!concept) {
      setDetail(null);
      return null;
    }
    return (
      <ScrollArea className="h-full">
        <div className="space-y-4">
          <button
            onClick={() => setDetail(null)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back to Browse
          </button>

          {concept.title && <h1 className="text-lg font-semibold">{concept.title}</h1>}
          {concept.tags && concept.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {concept.tags.map((t) => (
                <Badge key={t} variant="secondary" className="text-[10px]">
                  {t}
                </Badge>
              ))}
            </div>
          )}
          <MarkdownRenderer text={stripFrontmatter(concept.content)} />
        </div>
      </ScrollArea>
    );
  }

  // ── List view ─────────────────────────────────────────────────────

  if (summNames.length === 0 && concSlugs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-center text-sm text-muted-foreground">
          No documents yet. Add a URL through the Keb extension to get started.
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
                  onClick={() => setDetail({ type: "doc", name })}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 transition-colors hover:bg-accent"
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium text-primary">{name}</span>
                  {summaries[name].source && (
                    <span className="ml-auto max-w-30 truncate text-[11px] text-muted-foreground">
                      {summaries[name].source}
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
                <Badge
                  key={slug}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => setDetail({ type: "concept", slug })}
                >
                  <Tag className="size-3" /> {slug}
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
