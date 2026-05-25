import { useState, useEffect, useCallback, useRef } from "react";
import { Toaster } from "sonner";
import { toast } from "sonner";
import { FilePlusCorner, BookSearch, Library } from "lucide-react";
import { WSClient, type ConnectionStatus, type BridgeEvent, type SyncResult } from "../lib/ws";
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

// Unified timeline — interleaves tool events and text deltas (used by both tabs)
type TimelineEntry = { type: "tool"; text: string; cls: string } | { type: "text"; text: string };

type QueryEntry = {
  question: string;
  timeline: TimelineEntry[];
};

export default function App() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [workspace, setWorkspaceState] = useState("default");
  const [activeTab, setActiveTab] = useState<ActiveTab>("add");
  const [docCount, setDocCount] = useState(0);
  const [conceptCount, setConceptCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [agentStatus, setAgentStatus] = useState<"compiling" | "repairing" | "thinking" | "">("");
  const [addTimeline, setAddTimeline] = useState<TimelineEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [addDone, setAddDone] = useState(false);
  const [queryResults, setQueryResults] = useState<QueryEntry[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);

  const wsRef = useRef<WSClient | null>(null);
  const doneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for latest state (avoids stale closure in WS callbacks)
  const isAddingRef = useRef(false);
  const isQueryingRef = useRef(false);
  const addTimelineRef = useRef<TimelineEntry[]>([]);
  const queryResultsRef = useRef<QueryEntry[]>([]);

  // ── Helpers: update timeline from WS events ────────────────────────

  function addToolToTimeline(text: string, cls: string) {
    setAddTimeline((prev) => [...prev, { type: "tool", text, cls }]);
  }

  function appendTextToTimeline(delta: string) {
    setAddTimeline((prev) => {
      const last = prev[prev.length - 1];
      if (last?.type === "text") {
        // Append to the current text block
        const updated = [...prev];
        updated[updated.length - 1] = { type: "text", text: last.text + delta };
        return updated;
      }
      // Start a new text block after a tool event
      return [...prev, { type: "text", text: delta }];
    });
  }

  // ── Initialize WS client (runs once) ──────────────────────────────

  const initWS = useCallback(() => {
    const client = new WSClient({
      onStatusChange: (status) => {
        setConnectionStatus(status);
        if (status === "connected") {
          toast.success("Connected to Keb bridge server");
        } else if (status === "disconnected") {
          toast.error("Disconnected from Keb bridge server");
        } else if (status === "max_retries") {
          toast.error("Bridge server not running. Start bridge server & reopen extension to retry.");
        }
      },
      onEvent: (event: BridgeEvent) => handleBridgeEvent(event),
      onSyncResult: (data: SyncResult) => handleSyncResult(data),
      onDone: (command: string) => handleDone(command),
      onError: (message: string) => {
        toast.error(message);
      },
    });
    wsRef.current = client;
    return client;
  }, []);

  // ── Connect on mount ──────────────────────────────────────────────

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

  // ── Keep refs in sync with state every render ─────────────────────

  isAddingRef.current = isAdding;
  isQueryingRef.current = isQuerying;
  addTimelineRef.current = addTimeline;
  queryResultsRef.current = queryResults;

  // ── Bridge event handler (always reads latest values via refs) ────

  function handleBridgeEvent(event: BridgeEvent) {
    const etype = event.type;

    // ── Text deltas (streaming LLM output) ──
    if (etype === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
      const delta = event.assistantMessageEvent.delta || "";

      if (isAddingRef.current) {
        appendTextToTimeline(delta);
      } else if (isQueryingRef.current) {
        setQueryResults((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (!last) return prev;
          const tline = [...last.timeline];
          const lastEntry = tline[tline.length - 1];
          if (lastEntry?.type === "text") {
            tline[tline.length - 1] = { type: "text", text: lastEntry.text + delta };
          } else {
            tline.push({ type: "text", text: delta });
          }
          updated[updated.length - 1] = { ...last, timeline: tline };
          return updated;
        });
      }
      return;
    }

    // ── Tool execution events ──
    if (etype === "tool_execution_start") {
      const toolName = event.toolName || "unknown tool";
      if (isAddingRef.current) {
        addToolToTimeline(`Running ${toolName}...`, "text-yellow-400");
      } else if (isQueryingRef.current) {
        setQueryResults((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (!last) return prev;
          updated[updated.length - 1] = {
            ...last,
            timeline: [
              ...last.timeline,
              { type: "tool", text: `Running ${toolName}...`, cls: "text-yellow-500" },
            ],
          };
          return updated;
        });
      }
      return;
    }

    if (etype === "tool_execution_end") {
      const toolName = event.toolName || "unknown tool";
      if (isAddingRef.current) {
        addToolToTimeline(`Finished ${toolName}`, "text-green-400");
      } else if (isQueryingRef.current) {
        setQueryResults((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (!last) return prev;
          updated[updated.length - 1] = {
            ...last,
            timeline: [
              ...last.timeline,
              { type: "tool", text: `Finished ${toolName}`, cls: "text-green-500" },
            ],
          };
          return updated;
        });
      }
      return;
    }
  }

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

  function handleDone(command: string) {
    if (command === "add") {
      setAddDone(true);
      addToolToTimeline("Compilation complete. Re-syncing...", "text-green-400 font-semibold");
      setTimeout(() => {
        wsRef.current?.sync();
      }, 500);
      setIsAdding(false);
      setAgentStatus("");

      // Auto-reset the check icon after 2s so the button reverts to "Fetch & Add"
      if (doneTimeoutRef.current) clearTimeout(doneTimeoutRef.current);
      doneTimeoutRef.current = setTimeout(() => {
        setAddDone(false);
        doneTimeoutRef.current = null;
      }, 2000);
    }

    if (command === "repair") {
      addToolToTimeline("Repair complete. Re-syncing...", "text-green-400 font-semibold");
      setTimeout(() => {
        wsRef.current?.sync();
      }, 500);
      setIsAdding(false);
      setAgentStatus("");
    }

    if (command === "query") {
      setIsQuerying(false);
      setAgentStatus("");
    }
  }

  function handleAdd(url: string) {
    if (!wsRef.current?.send({ type: "add", url })) {
      toast.error("Not connected to KB bridge");
      return;
    }
    // Clear any pending done timeout so the button reverts immediately
    if (doneTimeoutRef.current) {
      clearTimeout(doneTimeoutRef.current);
      doneTimeoutRef.current = null;
    }
    setIsAdding(true);
    setAddDone(false);
    setAddTimeline([
      { type: "tool", text: `Adding: ${url}`, cls: "text-blue-400" },
      { type: "tool", text: `Workspace: ${workspace}`, cls: "text-blue-400" },
    ]);
    setAgentStatus("compiling");
  }

  function handleRepair() {
    if (!wsRef.current?.send({ type: "repair" })) {
      toast.error("Not connected to KB bridge");
      return;
    }
    if (doneTimeoutRef.current) {
      clearTimeout(doneTimeoutRef.current);
      doneTimeoutRef.current = null;
    }
    setIsAdding(true);
    setAddDone(false);
    setAddTimeline([
      { type: "tool", text: "Repairing interrupted compilations...", cls: "text-blue-400" },
      { type: "tool", text: `Workspace: ${workspace}`, cls: "text-blue-400" },
    ]);
    setAgentStatus("repairing");
    // Switch to add tab so the user can see repair progress
    setActiveTab("add");
  }

  function handleQuery(text: string) {
    if (!wsRef.current?.send({ type: "query", text })) {
      toast.error("Not connected to KB bridge");
      return;
    }
    setIsQuerying(true);
    setQueryResults([{ question: text, timeline: [] }]);
    setAgentStatus("thinking");
  }

  function handleSwitchWorkspace(name: string) {
    setWorkspaceState(name);
    wsRef.current?.setWorkspace(name);
    setConfig({ workspace: name });
    wsRef.current?.sync();
  }

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
              isAdding={isAdding}
              isDone={addDone}
              timeline={addTimeline}
              connected={connectionStatus === "connected"}
              onAdd={handleAdd}
            />
          </TabsContent>
          <TabsContent value="query" className="h-full mt-0">
            <QueryPanel
              isQuerying={isQuerying}
              results={queryResults}
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
