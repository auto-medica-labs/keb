// lib/ws.ts — WebSocket client for the bridge server
//
// Manages the WebSocket connection to the pi-kb bridge server,
// handling reconnection, message routing, and typed events.
//
// Each operation (add/query/repair) gets a unique operationId (nanoid).
// The server echoes it back in responses so multiple concurrent
// operations can be routed independently.

import { nanoid } from "nanoid";
import type { RegistryEntry, Summary, Concept } from "./store";

export type WSMessage =
  | { type: "add"; url: string; operationId: string; workspace?: string }
  | {
      type: "add-content";
      html: string;
      url?: string;
      title?: string;
      operationId: string;
      workspace?: string;
    }
  | { type: "query"; text: string; operationId: string; workspace?: string }
  | { type: "repair"; operationId: string; workspace?: string }
  | { type: "sync"; workspace?: string };

export type BridgeEvent = {
  type: string;
  assistantMessageEvent?: { type: string; delta?: string };
  toolName?: string;
  message?: Record<string, unknown>;
};

export type WSResponse =
  | { type: "event"; operationId?: string; data: BridgeEvent }
  | { type: "sync_result"; operationId?: string; data: SyncResult }
  | { type: "done"; operationId?: string; command: string }
  | { type: "error"; operationId?: string; message: string }
  | { type: "stderr"; operationId?: string; text: string };

export interface SyncResult {
  registry: Record<string, RegistryEntry>;
  index: string;
  summaries: Record<string, Summary>;
  concepts: Record<string, Concept>;
  workspaces: string[];
}

export type ConnectionStatus =
  | "connected"
  | "disconnected"
  | "connecting"
  | "reconnecting"
  | "max_retries";

/** Per-operation callbacks — fired for a specific add/query/repair. */
export interface OperationCallbacks {
  onEvent: (event: BridgeEvent) => void;
  onDone: (command: string) => void;
  onError: (message: string) => void;
}

/** Global callbacks — status changes and sync results (no operationId). */
export interface WSCallbacks {
  onStatusChange: (status: ConnectionStatus) => void;
  onSyncResult: (data: SyncResult) => void;
  /** Fallback for events/done/error without an operationId. */
  onEvent: (event: BridgeEvent) => void;
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

  /** Active operations waiting for responses. */
  private operations = new Map<string, OperationCallbacks>();

  constructor(callbacks: WSCallbacks) {
    this.callbacks = callbacks;
  }

  setWorkspace(ws: string) {
    this.workspace = ws;
  }

  getWorkspace(): string {
    return this.workspace;
  }

  // ── Connection lifecycle ──────────────────────────────────────────

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
    this.operations.clear();
  }

  // ── Operation methods (return operationId) ────────────────────────

  /**
   * Start an 'add' operation.
   * @param operationId - Optional pre-generated ID (from nanoid). Generated if omitted.
   */
  add(url: string, callbacks: OperationCallbacks, operationId?: string): string {
    const id = operationId || nanoid();
    this.operations.set(id, callbacks);
    if (!this._send({ type: "add", operationId: id, url })) {
      callbacks.onError("Not connected to KB bridge");
      this.operations.delete(id);
    }
    return id;
  }

  /**
   * Start an 'add-content' operation (captured page HTML).
   * Sends raw page HTML to the bridge, which converts it to markdown
   * and compiles it via /kb-add-content.
   * @param operationId - Optional pre-generated ID.
   */
  addContent(
    html: string,
    url: string,
    title: string,
    callbacks: OperationCallbacks,
    operationId?: string,
  ): string {
    const id = operationId || nanoid();
    this.operations.set(id, callbacks);
    if (!this._send({ type: "add-content", operationId: id, html, url, title })) {
      callbacks.onError("Not connected to KB bridge");
      this.operations.delete(id);
    }
    return id;
  }

  /**
   * Start a 'query' operation.
   * @param operationId - Optional pre-generated ID.
   */
  query(text: string, callbacks: OperationCallbacks, operationId?: string): string {
    const id = operationId || nanoid();
    this.operations.set(id, callbacks);
    if (!this._send({ type: "query", operationId: id, text })) {
      callbacks.onError("Not connected to KB bridge");
      this.operations.delete(id);
    }
    return id;
  }

  /**
   * Start a 'repair' operation.
   * @param operationId - Optional pre-generated ID.
   */
  repair(callbacks: OperationCallbacks, operationId?: string): string {
    const id = operationId || nanoid();
    this.operations.set(id, callbacks);
    if (!this._send({ type: "repair", operationId: id })) {
      callbacks.onError("Not connected to KB bridge");
      this.operations.delete(id);
    }
    return id;
  }

  // ── Low-level send (for sync, no operationId) ─────────────────────

  send(data: WSMessage): boolean {
    return this._send(data);
  }

  sync() {
    this.send({ type: "sync", workspace: this.workspace });
  }

  // ── Internal ──────────────────────────────────────────────────────

  private _send(data: WSMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.ws.send(JSON.stringify({ ...data, workspace: this.workspace }));
    return true;
  }

  private handleMessage(msg: WSResponse) {
    const opId = msg.operationId;

    // ── Route to per-operation callbacks if we have them ──────────
    if (opId && this.operations.has(opId)) {
      const op = this.operations.get(opId)!;
      switch (msg.type) {
        case "event":
          op.onEvent(msg.data);
          return;
        case "done":
          op.onDone(msg.command);
          this.operations.delete(opId);
          return;
        case "error":
          op.onError(msg.message);
          this.operations.delete(opId);
          return;
        case "stderr":
          console.warn("[keb] Bridge stderr:", msg.text);
          return;
      }
    }

    // ── Fallback: global callbacks (sync_result, orphan messages) ──
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

  // ── Reconnection ──────────────────────────────────────────────────

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
    console.log(
      `[keb] Reconnecting in ${delay}ms (attempt ${this.retryCount}/${MAX_RECONNECT_RETRIES})`,
    );
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
