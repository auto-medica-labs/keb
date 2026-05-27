import { useState, useEffect, useCallback, useRef } from "react";
import { Toaster } from "sonner";
import { toast } from "sonner";
import { FilePlusCorner, BookSearch, Library } from "lucide-react";
import { nanoid } from "nanoid";
import {
  WSClient,
  type ConnectionStatus,
  type BridgeEvent,
  type OperationCallbacks,
  type SyncResult,
} from "../lib/ws";
import {
  setKBState,
  getConfig,
  setConfig,
  isEntryCompiled,
  type RegistryEntry,
} from "../lib/store";
import Header from "./components/Header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AddPanel from "./components/AddPanel";
import QueryPanel from "./components/QueryPanel";
import BrowsePanel from "./components/BrowsePanel";
import Footer from "./components/Footer";

type ActiveTab = "add" | "query" | "browse";

// Unified timeline — interleaves tool events and text deltas
export type TimelineEntry =
  | { type: "tool"; text: string; cls: string }
  | { type: "text"; text: string };

/** A single in-flight or completed operation (add, query, or repair). */
export type ActiveOperation = {
  id: string;
  type: "add" | "query" | "repair";
  timeline: TimelineEntry[];
  /** Display label (URL for add, question for query). */
  label: string;
  done: boolean;
};

export default function App() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [workspace, setWorkspaceState] = useState("default");
  const [activeTab, setActiveTab] = useState<ActiveTab>("add");
  const [docCount, setDocCount] = useState(0);
  const [conceptCount, setConceptCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [agentStatus, setAgentStatus] = useState<"compiling" | "repairing" | "thinking" | "">("");

  // Operations-driven state — each concurrent operation has its own card
  const [operations, setOperations] = useState<ActiveOperation[]>([]);

  const wsRef = useRef<WSClient | null>(null);
  const doneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for latest state (avoids stale closure in WS callbacks)
  const operationsRef = useRef<ActiveOperation[]>([]);

  // ── Operation helpers ───────────────────────────────────────────

  /** Append a tool entry to a specific operation's timeline. */
  function appendToolToOperation(opId: string, text: string, cls: string) {
    setOperations((prev) =>
      prev.map((op) =>
        op.id === opId ? { ...op, timeline: [...op.timeline, { type: "tool", text, cls }] } : op,
      ),
    );
  }

  /** Append text delta to a specific operation's timeline. */
  function appendTextToOperation(opId: string, delta: string) {
    setOperations((prev) =>
      prev.map((op) => {
        if (op.id !== opId) return op;
        const tline = [...op.timeline];
        const last = tline[tline.length - 1];
        if (last?.type === "text") {
          tline[tline.length - 1] = { type: "text", text: last.text + delta };
        } else {
          tline.push({ type: "text", text: delta });
        }
        return { ...op, timeline: tline };
      }),
    );
  }

  /** Mark an operation as done. */
  function markOperationDone(opId: string, command: string) {
    setOperations((prev) =>
      prev.map((op) => {
        if (op.id !== opId) return op;
        const label =
          command === "add"
            ? ("Compilation complete. Re-syncing..." as const)
            : command === "repair"
              ? ("Repair complete. Re-syncing..." as const)
              : null;
        const tline: TimelineEntry[] = label
          ? [
              ...op.timeline,
              { type: "tool" as const, text: label, cls: "text-green-400 font-semibold" },
            ]
          : op.timeline;
        return { ...op, timeline: tline, done: true };
      }),
    );
  }

  /** Mark an operation as errored. */
  function markOperationError(opId: string, message: string) {
    setOperations((prev) =>
      prev.map((op) =>
        op.id === opId
          ? {
              ...op,
              timeline: [
                ...op.timeline,
                { type: "tool", text: `Error: ${message}`, cls: "text-red-400" },
              ],
              done: true,
            }
          : op,
      ),
    );
  }

  /** Build per-operation callbacks for a given operation ID. */
  function createOperationCallbacks(opId: string): OperationCallbacks {
    return {
      onEvent: (event: BridgeEvent) => {
        const etype = event.type;

        // ── Text deltas ──
        if (etype === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
          appendTextToOperation(opId, event.assistantMessageEvent.delta || "");
          return;
        }

        // ── Tool execution events ──
        if (etype === "tool_execution_start") {
          const toolName = event.toolName || "unknown tool";
          appendToolToOperation(opId, `Running ${toolName}...`, "text-yellow-400");
          return;
        }

        if (etype === "tool_execution_end") {
          const toolName = event.toolName || "unknown tool";
          appendToolToOperation(opId, `Finished ${toolName}`, "text-green-400");
          return;
        }
      },
      onDone: (command: string) => {
        markOperationDone(opId, command);

        if (command === "add" || command === "repair") {
          // Re-sync KB state after add/repair
          setTimeout(() => {
            wsRef.current?.sync();
          }, 500);
          setAgentStatus("");

          if (command === "add" && doneTimeoutRef.current) {
            clearTimeout(doneTimeoutRef.current);
            doneTimeoutRef.current = null;
          }
        }

        if (command === "query") {
          setAgentStatus("");
        }
      },
      onError: (message: string) => {
        markOperationError(opId, message);
        toast.error(message);
        setAgentStatus("");
      },
    };
  }

  // ── Initialize WS client (runs once) ──────────────────────────

  const initWS = useCallback(() => {
    const client = new WSClient({
      onStatusChange: (status) => {
        setConnectionStatus(status);
        if (status === "connected") {
          toast.success("Connected to Keb bridge server");
        } else if (status === "disconnected") {
          toast.error("Disconnected from Keb bridge server");
        } else if (status === "max_retries") {
          toast.error(
            "Bridge server not running. Start bridge server & reopen extension to retry.",
          );
        }
      },
      // Fallback: events without operationId (shouldn't happen with new bridge)
      onEvent: (_event: BridgeEvent) => {},
      onDone: (_command: string) => {},
      onError: (message: string) => {
        toast.error(message);
      },
      onSyncResult: (data: SyncResult) => handleSyncResult(data),
    });
    wsRef.current = client;
    return client;
  }, []);

  // ── Connect on mount ──────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const config = await getConfig();
      if (config.workspace && config.workspace !== "default") {
        setWorkspaceState(config.workspace);
      }
    })();
    const client = initWS();
    client.connect();

    chrome.runtime.onMessage.addListener((msg: { type: string; url?: string }) => {
      if (msg.type === "add-url-from-context" && msg.url) {
        setActiveTab("add");
        localStorage.setItem("kb:context-url", msg.url);
        window.dispatchEvent(new Event("kb:context-url"));
      }
    });

    return () => {
      client.disconnect();
      if (doneTimeoutRef.current) {
        clearTimeout(doneTimeoutRef.current);
        doneTimeoutRef.current = null;
      }
    };
  }, [initWS]);

  // ── Keep refs in sync with state every render ─────────────────

  useEffect(() => {
    operationsRef.current = operations;
  }, [operations]);

  // ── Sync result handler ───────────────────────────────────────

  function handleSyncResult(data: SyncResult) {
    setKBState(data).then(() => {
      setDocCount(Object.keys(data.summaries || {}).length);
      setConceptCount(Object.keys(data.concepts || {}).length);
      const pending = Object.values(data.registry || {}).filter(
        (e: RegistryEntry) => !isEntryCompiled(e),
      ).length;
      setPendingCount(pending);
    });
  }

  // ── Action handlers ───────────────────────────────────────────

  function handleAdd(url: string) {
    if (doneTimeoutRef.current) {
      clearTimeout(doneTimeoutRef.current);
      doneTimeoutRef.current = null;
    }

    setAgentStatus("compiling");

    const operationId = nanoid();
    const op: ActiveOperation = {
      id: operationId,
      type: "add",
      label: url,
      timeline: [
        { type: "tool", text: `Adding: ${url}`, cls: "text-blue-400" },
        { type: "tool", text: `Workspace: ${workspace}`, cls: "text-blue-400" },
      ],
      done: false,
    };

    // Replace previous add/repair ops, keep query ops untouched
    setOperations((prev) => [...prev.filter((o) => o.type === "query"), op]);
    wsRef.current?.add(url, createOperationCallbacks(operationId), operationId);
  }

  function handleRepair() {
    if (doneTimeoutRef.current) {
      clearTimeout(doneTimeoutRef.current);
      doneTimeoutRef.current = null;
    }

    setAgentStatus("repairing");
    setActiveTab("add");

    const operationId = nanoid();
    const op: ActiveOperation = {
      id: operationId,
      type: "repair",
      timeline: [
        {
          type: "tool",
          text: "Repairing interrupted compilations...",
          cls: "text-blue-400",
        },
        { type: "tool", text: `Workspace: ${workspace}`, cls: "text-blue-400" },
      ],
      label: "Repair",
      done: false,
    };

    // Replace previous add/repair ops, keep query ops untouched
    setOperations((prev) => [...prev.filter((o) => o.type === "query"), op]);
    wsRef.current?.repair(createOperationCallbacks(operationId), operationId);
  }

  function handleQuery(text: string) {
    setAgentStatus("thinking");

    const operationId = nanoid();
    const op: ActiveOperation = {
      id: operationId,
      type: "query",
      timeline: [],
      label: text,
      done: false,
    };

    // Replace previous query ops, keep add/repair ops untouched
    setOperations((prev) => [...prev.filter((o) => o.type !== "query"), op]);
    wsRef.current?.query(text, createOperationCallbacks(operationId), operationId);
  }

  function handleSwitchWorkspace(name: string) {
    setWorkspaceState(name);
    wsRef.current?.setWorkspace(name);
    setConfig({ workspace: name });
    wsRef.current?.sync();
  }

  // ── Derived state for panels ──────────────────────────────────

  const addOperations = operations.filter((op) => op.type === "add" || op.type === "repair");
  const queryOperations = operations.filter((op) => op.type === "query");

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <Toaster position="bottom-center" />
      <Header
        connectionStatus={connectionStatus}
        workspace={workspace}
        onSwitchWorkspace={handleSwitchWorkspace}
      />
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as ActiveTab)}
        className="flex flex-col flex-1 min-h-0"
      >
        <TabsList variant="line" className="w-full rounded-none h-auto px-3">
          <TabsTrigger
            value="add"
            className="flex-1 rounded-none py-2.5 text-xs font-medium gap-1.5"
          >
            <FilePlusCorner className="size-4" />
            Add Knowledge
          </TabsTrigger>
          <TabsTrigger
            value="query"
            className="flex-1 rounded-none py-2.5 text-xs font-medium gap-1.5"
          >
            <BookSearch className="size-4" />
            Consult
          </TabsTrigger>
          <TabsTrigger
            value="browse"
            className="flex-1 rounded-none py-2.5 text-xs font-medium gap-1.5"
          >
            <Library className="size-4" />
            Browse
          </TabsTrigger>
        </TabsList>
        <div className="flex-1 min-h-0 overflow-hidden p-4">
          <TabsContent value="add" className="h-full mt-0">
            <AddPanel
              operations={addOperations}
              connected={connectionStatus === "connected"}
              onAdd={handleAdd}
            />
          </TabsContent>
          <TabsContent value="query" className="h-full mt-0">
            <QueryPanel
              operations={queryOperations}
              connected={connectionStatus === "connected"}
              onQuery={handleQuery}
            />
          </TabsContent>
          <TabsContent value="browse" className="h-full mt-0">
            <BrowsePanel />
          </TabsContent>
        </div>
      </Tabs>
      <Footer
        docCount={docCount}
        conceptCount={conceptCount}
        pendingCount={pendingCount}
        agentStatus={agentStatus}
        onRepair={handleRepair}
      />
    </div>
  );
}
