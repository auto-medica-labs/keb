// lib/ws.ts — WebSocket client for the bridge server
//
// Manages the WebSocket connection to the pi-kb bridge server,
// handling reconnection, message routing, and typed events.

export type WSMessage =
  | { type: "add"; url: string; workspace?: string }
  | { type: "query"; text: string; workspace?: string }
  | { type: "sync"; workspace?: string };

export type BridgeEvent = {
  type: string;
  assistantMessageEvent?: { type: string; delta?: string };
  toolName?: string;
  message?: Record<string, unknown>;
};

export type WSResponse =
  | { type: "event"; data: BridgeEvent }
  | { type: "sync_result"; data: SyncResult }
  | { type: "done"; command: string }
  | { type: "error"; message: string }
  | { type: "stderr"; text: string };

export interface SyncResult {
  registry: Record<string, unknown>;
  index: string;
  summaries: Record<string, { content: string; source: string; added: string }>;
  concepts: Record<string, { content: string; sources: string[]; updated: string }>;
  workspaces: string[];
}

export type ConnectionStatus =
  | "connected"
  | "disconnected"
  | "connecting"
  | "reconnecting";

export interface WSCallbacks {
  onStatusChange: (status: ConnectionStatus) => void;
  onEvent: (event: BridgeEvent) => void;
  onSyncResult: (data: SyncResult) => void;
  onDone: (command: string) => void;
  onError: (message: string) => void;
}

const WS_URL = "ws://127.0.0.1:9876";
const RECONNECT_DELAY = 2000;

export class WSClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private callbacks: WSCallbacks;
  private workspace: string = "default";

  constructor(callbacks: WSCallbacks) {
    this.callbacks = callbacks;
  }

  setWorkspace(ws: string) {
    this.workspace = ws;
  }

  getWorkspace(): string {
    return this.workspace;
  }

  connect() {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.callbacks.onStatusChange("connecting");

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      console.log("[chrome-kb] WS connected");
      this.clearReconnectTimer();
      this.callbacks.onStatusChange("connected");
      this.send({ type: "sync", workspace: this.workspace });
    };

    this.ws.onmessage = (event: MessageEvent) => {
      let msg: WSResponse;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }
      this.handleMessage(msg);
    };

    this.ws.onclose = () => {
      console.log("[chrome-kb] WS disconnected");
      this.callbacks.onStatusChange("disconnected");
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error("[chrome-kb] WS error:", err);
    };
  }

  disconnect() {
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(data: WSMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.callbacks.onStatusChange("disconnected");
      return false;
    }
    this.ws.send(JSON.stringify({ ...data, workspace: this.workspace }));
    return true;
  }

  sync() {
    this.send({ type: "sync", workspace: this.workspace });
  }

  private handleMessage(msg: WSResponse) {
    switch (msg.type) {
      case "event":
        this.callbacks.onEvent(msg.data);
        break;
      case "sync_result":
        this.callbacks.onSyncResult(msg.data);
        break;
      case "done":
        this.callbacks.onDone(msg.command);
        break;
      case "error":
        console.error("[chrome-kb] Bridge error:", msg.message);
        this.callbacks.onError(msg.message);
        break;
      case "stderr":
        console.warn("[chrome-kb] Bridge stderr:", msg.text);
        break;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.callbacks.onStatusChange("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
