// lib/ws.ts — WebSocket client for the bridge server
//
// Manages the WebSocket connection to the pi-kb bridge server,
// handling reconnection, message routing, and typed events.

import type { RegistryEntry, Summary, Concept } from "./store";

export type WSMessage =
  | { type: "add"; url: string; workspace?: string }
  | { type: "query"; text: string; workspace?: string }
  | { type: "repair"; workspace?: string }
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
  registry: Record<string, RegistryEntry>;
  index: string;
  summaries: Record<string, Summary>;
  concepts: Record<string, Concept>;
  workspaces: string[];
}

export type ConnectionStatus = "connected" | "disconnected" | "connecting" | "reconnecting" | "max_retries";

export interface WSCallbacks {
  onStatusChange: (status: ConnectionStatus) => void;
  onEvent: (event: BridgeEvent) => void;
  onSyncResult: (data: SyncResult) => void;
  onDone: (command: string) => void;
  onError: (message: string) => void;
}

const WS_URL = "ws://127.0.0.1:9876";
const BASE_RECONNECT_DELAY = 2000;
const MAX_RECONNECT_RETRIES = 3;

export class WSClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private callbacks: WSCallbacks;
  private workspace: string = "default";
  private retryCount: number = 0;
  private intentionalClose: boolean = false;

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
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.callbacks.onStatusChange("connecting");

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      console.log("[keb] WS connected");
      this.retryCount = 0;
      this.intentionalClose = false;
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
      console.log("[keb] WS disconnected");
      this.callbacks.onStatusChange("disconnected");
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error("[keb] WS error:", err);
    };
  }

  disconnect() {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(data: WSMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
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
        console.error("[keb] Bridge error:", msg.message);
        this.callbacks.onError(msg.message);
        break;
      case "stderr":
        console.warn("[keb] Bridge stderr:", msg.text);
        break;
    }
  }

  private scheduleReconnect() {
    if (this.intentionalClose) return;
    if (this.reconnectTimer) return;

    if (this.retryCount >= MAX_RECONNECT_RETRIES) {
      console.log("[keb] Max reconnection retries reached");
      this.callbacks.onStatusChange("max_retries");
      return;
    }

    this.retryCount++;
    const delay = BASE_RECONNECT_DELAY * Math.pow(2, this.retryCount - 1); // 2s, 4s, 8s
    console.log(`[keb] Reconnecting in ${delay}ms (attempt ${this.retryCount}/${MAX_RECONNECT_RETRIES})`);
    this.callbacks.onStatusChange("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
