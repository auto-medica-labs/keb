import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  type WSClientConfig,
} from "../lib/ws";
import {
  setKebState,
  getConfig,
  setConfig,
  getBridgeConfig,
  setBridgeConfig,
  isEntryCompiled,
  type RegistryEntry,
  type BridgeMode,
  isFirstUse,
  setFirstUseComplete,
} from "../lib/store";
import { HOSTED_BRIDGE_URL } from "../lib/env";
import Header from "./components/Header";
import AuthPanel from "./components/AuthPanel";
import SettingsPanel from "./components/SettingsPanel";
import { TooltipProvider } from "@/components/ui/tooltip";
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
  /** True when the bridge reported a 403/401 — the target site blocked fetching. */
  blocked?: boolean;
};

export default function App() {
  // ── UI state ──────────────────────────────────────────────────
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [workspace, setWorkspaceState] = useState("default");
  const [activeTab, setActiveTab] = useState<ActiveTab>("query");
  const [docCount, setDocCount] = useState(0);
  const [conceptCount, setConceptCount] = useState(0);
  const [hasPending, setHasPending] = useState(false);

  // ── Auth / config state ───────────────────────────────────────
  const [bridgeMode, setBridgeMode] = useState<BridgeMode>("local");
  const [bridgeUrl, setBridgeUrl] = useState("wss://api.mdevd.co/keb/v1");
  const [authToken, setAuthToken] = useState<string | undefined>(undefined);
  const [username, setUsername] = useState<string | undefined>(undefined);
  const [showSettings, setShowSettings] = useState(false);
  const [appLoading, setAppLoading] = useState(true);

  // ── Operations state ──────────────────────────────────────────
  const [operations, setOperations] = useState<ActiveOperation[]>([]);

  const wsRef = useRef<WSClient | null>(null);
  const doneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for latest state (avoids stale closure in WS callbacks)
  const operationsRef = useRef<ActiveOperation[]>([]);

  // ── Derived: does the user need to authenticate? ──────────────
  const needsAuth = bridgeMode === "hosted" && !authToken;

  // ── Operation helpers ───────────────────────────────────────────

  function appendToolToOperation(opId: string, text: string, cls: string) {
    setOperations((prev) =>
      prev.map((op) =>
        op.id === opId ? { ...op, timeline: [...op.timeline, { type: "tool", text, cls }] } : op,
      ),
    );
  }

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

  function markOperationError(opId: string, message: string, blocked?: boolean) {
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
              ...(blocked ? { blocked } : {}),
            }
          : op,
      ),
    );
  }

  function createOperationCallbacks(opId: string): OperationCallbacks {
    return {
      onEvent: (event: BridgeEvent) => {
        const etype = event.type;
        if (etype === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
          appendTextToOperation(opId, event.assistantMessageEvent.delta || "");
          return;
        }
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
          setTimeout(() => wsRef.current?.sync(), 500);
          if (command === "add" && doneTimeoutRef.current) {
            clearTimeout(doneTimeoutRef.current);
            doneTimeoutRef.current = null;
          }
        }
      },
      onError: (message: string, toastMsg?: string) => {
        // Detect 403/401 fetch errors from the bridge so the UI can
        // surface a link to the "Common Issues" section.
        const isBlocked = /blocked Keb from accessing its content/i.test(message);
        markOperationError(opId, message, isBlocked);
        toast.error(toastMsg || message);
      },
    };
  }

  // ── Sync result handler ───────────────────────────────────────

  function handleSyncResult(data: SyncResult) {
    setKebState(data).then(() => {
      setDocCount(Object.keys(data.summaries || {}).length);
      setConceptCount(Object.keys(data.concepts || {}).length);
      const pending = Object.values(data.registry || {}).some(
        (e: RegistryEntry) => !isEntryCompiled(e),
      );
      setHasPending(pending);
      // In hosted mode, server returns workspaces including the auth user's
      if (bridgeMode === "hosted" && data.workspaces?.length) {
        // Auto-switch workspace to the authenticated user's (server enforces this)
      }
    });
  }

  // ── Bridge config helpers ─────────────────────────────────────

  /** Build WSClientConfig from current auth/config state.
   *  In hosted mode, bridgeUrl is always the build-time constant (ignores stored value). */
  function getWSConfig(): WSClientConfig {
    return {
      mode: bridgeMode,
      bridgeUrl: bridgeMode === "hosted" ? HOSTED_BRIDGE_URL : bridgeUrl,
      token: authToken,
      workspace: workspace,
    };
  }

  /** Store updated bridge config and sync state. React state is set
   *  synchronously; chrome.storage is persisted in the background. */
  function persistBridgeConfig(
    updates: Partial<{ mode: BridgeMode; bridgeUrl: string; token?: string; username?: string }>,
  ) {
    // Update React state immediately so UI responds without waiting for storage I/O
    if (updates.mode !== undefined) setBridgeMode(updates.mode);
    if (updates.bridgeUrl !== undefined) setBridgeUrl(updates.bridgeUrl);
    // Use `in` instead of `!== undefined` so explicitly setting to undefined (logout) works
    if ("token" in updates) setAuthToken(updates.token);
    if ("username" in updates) setUsername(updates.username);
    // Persist to chrome.storage in the background
    setBridgeConfig(updates);
  }

  // ── Create WS client and connect ──────────────────────────────

  const connectWithConfig = useCallback((config: WSClientConfig) => {
    // Disconnect existing
    if (wsRef.current) wsRef.current.disconnect();

    const client = new WSClient(
      {
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
        onAuthOk: (uname: string) => {
          setUsername(uname);
          persistBridgeConfig({ username: uname });
        },
        onAuthError: (message: string) => {
          toast.error(`Auth failed: ${message}`);
          // Clear token so user sees auth screen again
          persistBridgeConfig({ token: undefined, username: undefined });
        },
        onEvent: (_event: BridgeEvent) => {},
        onDone: (_command: string) => {},
        onError: (message: string) => toast.error(message),
        onSyncResult: (data: SyncResult) => handleSyncResult(data),
      },
      config,
    );

    wsRef.current = client;
    client.connect();
  }, []);

  // ── Initialization ────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      // Load saved Keb config (workspace)
      const kebConfig = await getConfig();
      if (kebConfig.workspace && kebConfig.workspace !== "default") {
        setWorkspaceState(kebConfig.workspace);
      }

      // Load bridge config
      const bc = await getBridgeConfig();
      setBridgeMode(bc.mode || "local");
      // In hosted mode, always use the build-time constant (ignore stored URL
      // from dev builds). In local mode, fall through to the stored URL.
      setBridgeUrl(
        bc.mode === "hosted" ? HOSTED_BRIDGE_URL : bc.bridgeUrl || "ws://127.0.0.1:9876",
      );
      if (bc.token) setAuthToken(bc.token);
      if (bc.username) setUsername(bc.username);

      // Check first use and redirect if needed
      const firstUse = await isFirstUse();
      if (firstUse) {
        await setFirstUseComplete();
        chrome.tabs.create({ url: "https://keb.mdevd.co/how-to-use" });
      }

      setAppLoading(false);
    })();
  }, []);

  // ── Connect after config is loaded ────────────────────────────

  useEffect(() => {
    if (appLoading) return;

    // Don't connect if hosted mode and no token — user needs to auth first
    if (bridgeMode === "hosted" && !authToken) return;

    const config = getWSConfig();
    connectWithConfig(config);

    // ── Runtime message listener (context menu) ───────────────
    const msgListener = (msg: { type: string; url?: string; storageKey?: string }) => {
      if (msg.type === "add-url-from-context" && msg.url) {
        setActiveTab("add");
        localStorage.setItem("keb:context-url", msg.url);
        window.dispatchEvent(new Event("keb:context-url"));
      }
      if (msg.type === "add-content-from-context" && msg.storageKey) {
        (async () => {
          const stored = await chrome.storage.local.get(msg.storageKey!);
          const data = stored[msg.storageKey!] as
            | { html: string; title: string; url: string }
            | undefined;
          chrome.storage.local.remove(msg.storageKey!);
          if (!data || !data.html) {
            console.warn("[keb] No captured content found in storage");
            return;
          }
          setActiveTab("add");
          handleAddContent(data.html, data.url, data.title);
        })();
      }
    };
    chrome.runtime.onMessage.addListener(msgListener);

    return () => {
      chrome.runtime.onMessage.removeListener(msgListener);
      wsRef.current?.disconnect();
      if (doneTimeoutRef.current) {
        clearTimeout(doneTimeoutRef.current);
        doneTimeoutRef.current = null;
      }
    };
  }, [appLoading, bridgeMode, authToken, bridgeUrl, connectWithConfig]);

  // ── Keep refs in sync ────────────────────────────────────────

  useEffect(() => {
    operationsRef.current = operations;
  }, [operations]);

  // ── Auth handler (called by AuthPanel) ────────────────────────

  function handleAuthenticated(token: string, uname: string) {
    persistBridgeConfig({ token, username: uname });
    // Ensure settings overlay is not shown after sign-in
    setShowSettings(false);
    // The useEffect watching authToken will trigger connectWithConfig
  }

  // ── Settings handlers ─────────────────────────────────────────

  function handleModeChange(newMode: BridgeMode) {
    // No-op if already in this mode (avoids unnecessary disconnect)
    if (newMode === bridgeMode) return;

    // Disconnect existing WS before switching modes
    wsRef.current?.disconnect();

    if (newMode === "local") {
      persistBridgeConfig({
        mode: "local",
        bridgeUrl: "ws://127.0.0.1:9876",
        token: undefined,
        username: undefined,
      });
    } else {
      persistBridgeConfig({
        mode: "hosted",
        bridgeUrl: HOSTED_BRIDGE_URL,
      });
    }
  }

  function handleLogout() {
    persistBridgeConfig({ token: undefined, username: undefined });
    wsRef.current?.disconnect();
  }

  function handleBridgeUrlChange(url: string) {
    // In hosted mode, the URL is fixed at build time — ignore user edits
    if (bridgeMode === "hosted") return;
    // Disconnect existing WS before changing URL
    wsRef.current?.disconnect();
    persistBridgeConfig({ bridgeUrl: url });
  }

  function handleSwitchToLocal() {
    // Disconnect existing WS (if any) before switching modes
    wsRef.current?.disconnect();
    // Switch to local mode, reset URL to localhost, clear hosted auth state
    persistBridgeConfig({
      mode: "local",
      bridgeUrl: "ws://127.0.0.1:9876",
      token: undefined,
      username: undefined,
    });
    // Ensure settings overlay is not shown on the main page
    setShowSettings(false);
  }

  // ── Action handlers ───────────────────────────────────────────

  function handleAdd(url: string) {
    if (doneTimeoutRef.current) {
      clearTimeout(doneTimeoutRef.current);
      doneTimeoutRef.current = null;
    }

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
    setOperations((prev) => [...prev.filter((o) => o.type === "query"), op]);
    wsRef.current?.add(url, createOperationCallbacks(operationId), operationId);
  }

  function handleAddContent(html: string, pageUrl: string, pageTitle: string) {
    if (doneTimeoutRef.current) {
      clearTimeout(doneTimeoutRef.current);
      doneTimeoutRef.current = null;
    }

    const label = pageTitle || pageUrl || "Page content";
    const operationId = nanoid();
    const shortLabel = label.length > 30 ? label.slice(0, 30) + "..." : label;

    const op: ActiveOperation = {
      id: operationId,
      type: "add",
      label,
      timeline: [
        { type: "tool", text: `adding content: "${shortLabel}"`, cls: "text-blue-400" },
        { type: "tool", text: `Workspace: ${workspace}`, cls: "text-blue-400" },
      ],
      done: false,
    };
    setOperations((prev) => [...prev.filter((o) => o.type === "query"), op]);
    wsRef.current?.addContent(
      html,
      pageUrl,
      pageTitle,
      createOperationCallbacks(operationId),
      operationId,
    );
  }

  function handleRepair() {
    if (doneTimeoutRef.current) {
      clearTimeout(doneTimeoutRef.current);
      doneTimeoutRef.current = null;
    }
    setActiveTab("add");

    const operationId = nanoid();
    const op: ActiveOperation = {
      id: operationId,
      type: "repair",
      timeline: [
        { type: "tool", text: "Repairing interrupted compilations...", cls: "text-blue-400" },
        { type: "tool", text: `Workspace: ${workspace}`, cls: "text-blue-400" },
      ],
      label: "Repair",
      done: false,
    };
    setOperations((prev) => [...prev.filter((o) => o.type === "query"), op]);
    wsRef.current?.repair(createOperationCallbacks(operationId), operationId);
  }

  function handleQuery(text: string) {
    const operationId = nanoid();
    const op: ActiveOperation = {
      id: operationId,
      type: "query",
      timeline: [],
      label: text,
      done: false,
    };
    setOperations((prev) => [...prev.filter((o) => o.type !== "query"), op]);
    wsRef.current?.query(text, createOperationCallbacks(operationId), operationId);
  }

  function handleClearWorkspace() {
    wsRef.current?.clear();
  }

  function handleSwitchWorkspace(name: string) {
    // In hosted mode, workspace switching is disabled (server enforces it)
    if (bridgeMode === "hosted") return;
    setWorkspaceState(name);
    wsRef.current?.setWorkspace(name);
    setConfig({ workspace: name });
    wsRef.current?.sync();
  }

  // ── Derived state ─────────────────────────────────────────────

  const addOperations = operations.filter((op) => op.type === "add" || op.type === "repair");
  const queryOperations = operations.filter((op) => op.type === "query");

  const agentStatus = useMemo(() => {
    if (activeTab === "add" || activeTab === "browse") {
      const inc = addOperations.filter((op) => !op.done);
      if (inc.some((op) => op.type === "repair")) return "repairing";
      if (inc.some((op) => op.type === "add")) return "compiling";
      return "";
    }
    if (activeTab === "query") {
      if (queryOperations.some((op) => !op.done)) return "thinking";
      return "";
    }
    return "";
  }, [activeTab, addOperations, queryOperations]);

  // ── Loading screen ────────────────────────────────────────────

  if (appLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  // ── Auth screen (hosted mode, no token) ───────────────────────

  if (needsAuth) {
    return (
      <div className="h-screen overflow-hidden bg-background text-foreground">
        <Toaster position="bottom-center" />
        <AuthPanel
          mode={bridgeMode}
          bridgeUrl={bridgeMode === "hosted" ? HOSTED_BRIDGE_URL : bridgeUrl}
          onAuthenticated={handleAuthenticated}
          onSwitchToLocal={handleSwitchToLocal}
        />
      </div>
    );
  }

  // ── Main app UI ───────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <Toaster position="bottom-center" />

        {/* Settings overlay */}
        {showSettings && (
          <SettingsPanel
            config={{ mode: bridgeMode, bridgeUrl, token: authToken, username }}
            onModeChange={handleModeChange}
            onBridgeUrlChange={handleBridgeUrlChange}
            onLogout={handleLogout}
            onClose={() => setShowSettings(false)}
          />
        )}

        <Header
          connectionStatus={connectionStatus}
          workspace={workspace}
          mode={bridgeMode}
          username={username}
          onSwitchWorkspace={handleSwitchWorkspace}
          onOpenSettings={() => setShowSettings(true)}
        />
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as ActiveTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList variant="line" className="h-auto w-full rounded-none px-3">
            <TabsTrigger
              value="query"
              className="flex-1 gap-1.5 rounded-none py-2.5 text-xs font-medium"
            >
              <BookSearch className="size-4" />
              Consult
            </TabsTrigger>
            <TabsTrigger
              value="add"
              className="flex-1 gap-1.5 rounded-none py-2.5 text-xs font-medium"
            >
              <FilePlusCorner className="size-4" />
              Add Knowledge
            </TabsTrigger>
            <TabsTrigger
              value="browse"
              className="flex-1 gap-1.5 rounded-none py-2.5 text-xs font-medium"
            >
              <Library className="size-4" />
              Browse
            </TabsTrigger>
          </TabsList>
          <div className="min-h-0 flex-1 overflow-hidden p-4">
            <TabsContent value="query" className="mt-0 h-full">
              <QueryPanel
                operations={queryOperations}
                connected={connectionStatus === "connected"}
                onQuery={handleQuery}
              />
            </TabsContent>
            <TabsContent value="add" className="mt-0 h-full">
              <AddPanel
                operations={addOperations}
                connected={connectionStatus === "connected"}
                onAdd={handleAdd}
              />
            </TabsContent>
            <TabsContent value="browse" className="mt-0 h-full">
              <BrowsePanel onClearWorkspace={handleClearWorkspace} />
            </TabsContent>
          </div>
        </Tabs>
        <Footer
          docCount={docCount}
          conceptCount={conceptCount}
          hasPending={hasPending}
          agentStatus={agentStatus}
          onRepair={handleRepair}
        />
      </div>
    </TooltipProvider>
  );
}
