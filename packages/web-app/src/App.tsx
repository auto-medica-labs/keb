import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Toaster, toast } from "sonner";
import { BookSearch, Library } from "lucide-react";
import { nanoid } from "nanoid";
import {
  WSClient,
  type ConnectionStatus,
  type BridgeEvent,
  type OperationCallbacks,
  type WSClientConfig,
} from "./lib/ws";
import type { SyncResult } from "./lib/ws";
import {
  setKebState,
  getConfig,
  getBridgeConfig,
  setBridgeConfig,
  isEntryCompiled,
  type RegistryEntry,
  type BridgeMode,
} from "./lib/store";
import { HOSTED_BRIDGE_URL } from "@keb/shared/lib/env";
import Header from "./components/Header";
import AuthScreen from "./components/AuthScreen";
import SettingsPanel from "./components/SettingsPanel";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import QueryPanel from "@keb/shared/components/QueryPanel";
import BrowsePanel from "./components/BrowsePanel";
import Footer from "@keb/shared/components/Footer";
import type { ActiveOperation, TimelineEntry } from "@keb/shared/components/OperationTimeline";

type ActiveTab = "query" | "browse";

export default function App() {
  // ── UI state ──────────────────────────────────────────────────
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [activeTab, setActiveTab] = useState<ActiveTab>("query");
  const [docCount, setDocCount] = useState(0);
  const [conceptCount, setConceptCount] = useState(0);
  const [hasPending, setHasPending] = useState(false);

  // ── Auth / config state ───────────────────────────────────────
  const [bridgeMode, setBridgeMode] = useState<BridgeMode>("hosted");
  const [bridgeUrl, setBridgeUrl] = useState("wss://api.mdevd.co/keb/v1");
  const [authToken, setAuthToken] = useState<string | undefined>(undefined);
  const [username, setUsername] = useState<string | undefined>(undefined);
  const [showSettings, setShowSettings] = useState(false);
  const [appLoading, setAppLoading] = useState(true);

  // ── Operations state ──────────────────────────────────────────
  const [operations, setOperations] = useState<ActiveOperation[]>([]);

  const wsRef = useRef<WSClient | null>(null);
  const doneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const tline: TimelineEntry[] = [...op.timeline];
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

  function markOperationDone(opId: string, _command: string) {
    setOperations((prev) =>
      prev.map((op) => {
        if (op.id !== opId) return op;
        return { ...op, done: true };
      }),
    );
  }

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

  function createOperationCallbacks(opId: string): OperationCallbacks {
    return {
      onEvent: (event: BridgeEvent) => {
        const etype = event.type;
        if (etype === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
          appendTextToOperation(opId, event.assistantMessageEvent.delta || "");
          return;
        }
        if (etype === "tool_execution_start") {
          appendToolToOperation(
            opId,
            `Running ${event.toolName || "unknown tool"}...`,
            "text-yellow-400",
          );
          return;
        }
        if (etype === "tool_execution_end") {
          appendToolToOperation(
            opId,
            `Finished ${event.toolName || "unknown tool"}`,
            "text-green-400",
          );
          return;
        }
      },
      onDone: () => {
        markOperationDone(opId, "query");
      },
      onError: (message: string, toastMsg?: string) => {
        markOperationError(opId, message);
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
    });
  }

  // ── Config helpers ─────────────────────────────────────────────

  function getWSConfig(): WSClientConfig {
    return {
      mode: bridgeMode,
      bridgeUrl: bridgeMode === "hosted" ? HOSTED_BRIDGE_URL : bridgeUrl,
      token: authToken,
      workspace: "default",
    };
  }

  function persistBridgeConfig(
    updates: Partial<{ mode: BridgeMode; bridgeUrl: string; token?: string; username?: string }>,
  ) {
    if (updates.mode !== undefined) setBridgeMode(updates.mode);
    if (updates.bridgeUrl !== undefined) setBridgeUrl(updates.bridgeUrl);
    if ("token" in updates) setAuthToken(updates.token);
    if ("username" in updates) setUsername(updates.username);
    setBridgeConfig(updates);
  }

  // ── Create WS client and connect ──────────────────────────────

  const connectWithConfig = useCallback((config: WSClientConfig) => {
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
            toast.error("Bridge server not running. Refresh to retry.");
          }
        },
        onAuthOk: (uname: string) => {
          setUsername(uname);
          persistBridgeConfig({ username: uname });
        },
        onAuthError: (message: string) => {
          toast.error(`Auth failed: ${message}`);
          persistBridgeConfig({ token: undefined, username: undefined });
        },
        onEvent: () => {},
        onDone: () => {},
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
      const kebConfig = await getConfig();
      if (kebConfig.workspace && kebConfig.workspace !== "default") {
        // workspace tracking if needed
      }

      const bc = await getBridgeConfig();
      setBridgeMode(bc.mode || "local");
      setBridgeUrl(
        bc.mode === "hosted" ? HOSTED_BRIDGE_URL : bc.bridgeUrl || "ws://127.0.0.1:9876",
      );
      if (bc.token) setAuthToken(bc.token);
      if (bc.username) setUsername(bc.username);

      setAppLoading(false);
    })();
  }, []);

  // ── Connect after config is loaded ────────────────────────────

  useEffect(() => {
    if (appLoading) return;
    if (bridgeMode === "hosted" && !authToken) return;

    const config = getWSConfig();
    connectWithConfig(config);

    return () => {
      wsRef.current?.disconnect();
      if (doneTimeoutRef.current) {
        clearTimeout(doneTimeoutRef.current);
      }
    };
  }, [appLoading, bridgeMode, authToken, bridgeUrl, connectWithConfig]);

  // ── Auth handler ──────────────────────────────────────────────

  function handleAuthenticated(token: string, uname: string) {
    persistBridgeConfig({ token, username: uname });
    setShowSettings(false);
  }

  // ── Settings handlers ─────────────────────────────────────────

  function handleModeChange(newMode: BridgeMode) {
    if (newMode === bridgeMode) return;
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
    if (bridgeMode === "hosted") return;
    wsRef.current?.disconnect();
    persistBridgeConfig({ bridgeUrl: url });
  }

  function handleSwitchToLocal() {
    wsRef.current?.disconnect();
    persistBridgeConfig({
      mode: "local",
      bridgeUrl: "ws://127.0.0.1:9876",
      token: undefined,
      username: undefined,
    });
    setShowSettings(false);
  }

  // ── Action handlers ───────────────────────────────────────────

  function handleRepair() {
    if (doneTimeoutRef.current) {
      clearTimeout(doneTimeoutRef.current);
    }
    setActiveTab("query");

    const operationId = nanoid();
    const op: ActiveOperation = {
      id: operationId,
      type: "repair",
      timeline: [
        { type: "tool", text: "Repairing interrupted compilations...", cls: "text-blue-400" },
        { type: "tool", text: "Workspace: default", cls: "text-blue-400" },
      ],
      label: "Repair",
      done: false,
    };
    setOperations((prev) => [...prev.filter((o) => o.type !== "repair"), op]);
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

  // ── Derived state ─────────────────────────────────────────────

  const queryOperations = operations.filter((op) => op.type === "query");
  const repairOperations = operations.filter((op) => op.type === "repair");

  const agentStatus = useMemo(() => {
    if (repairOperations.some((op) => !op.done)) return "repairing" as const;
    if (queryOperations.some((op) => !op.done)) return "thinking" as const;
    return "" as const;
  }, [repairOperations, queryOperations]);

  // ── Loading screen ────────────────────────────────────────────

  if (appLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  // ── Auth screen ───────────────────────────────────────────────

  if (needsAuth) {
    return (
      <div className="h-screen overflow-hidden bg-background text-foreground">
        <Toaster position="bottom-center" />
        <AuthScreen
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
          mode={bridgeMode}
          username={username}
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
