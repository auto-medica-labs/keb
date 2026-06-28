// lib/ws.ts — WebSocket client for the Keb bridge server
//
// Supports two modes:
//   local  — No auth. Workspace sent by client. Direct connect.
//   hosted — JWT auth required. First message is { type: "auth", token }.
//            Workspace is enforced server-side from the JWT username.

import { nanoid } from "nanoid";
import type { BridgeMode, KebSyncData, RegistryEntry, Summary, Concept } from "./store";

export type WSMessage =
  | { type: "auth"; token: string }
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
  | { type: "sync"; workspace?: string }
  | { type: "clear"; workspace?: string };

export type BridgeEvent = {
  type: string;
  assistantMessageEvent?: { type: string; delta?: string };
  toolName?: string;
  message?: Record<string, unknown>;
};

export type WSResponse =
  | { type: "auth_ok"; username: string }
  | { type: "event"; operationId?: string; data: BridgeEvent }
  | { type: "sync_result"; operationId?: string; data: SyncResult }
  | { type: "done"; operationId?: string; command: string }
  | { type: "error"; operationId?: string; message: string; toast?: string }
  | { type: "stderr"; operationId?: string; text: string };

export interface SyncResult extends KebSyncData {
  registry: Record<string, RegistryEntry>;
  index: string;
  summaries: Record<string, Summary>;
  concepts: Record<string, Concept>;
}

export type ConnectionStatus =
  | "connected"
  | "disconnected"
  | "connecting"
  | "reconnecting"
  | "max_retries";

export interface OperationCallbacks {
  onEvent: (event: BridgeEvent) => void;
  onDone: (command: string) => void;
  onError: (message: string, toast?: string) => void;
}

export interface WSCallbacks {
  onStatusChange: (status: ConnectionStatus) => void;
  onSyncResult: (data: SyncResult) => void;
  onAuthOk: (username: string) => void;
  onAuthError: (message: string) => void;
  onEvent: (event: BridgeEvent) => void;
  onDone: (command: string) => void;
  onError: (message: string) => void;
}

export interface WSClientConfig {
  mode: BridgeMode;
  bridgeUrl: string;
  token?: string;
  workspace?: string;
}

const BASE_RECONNECT_DELAY = 2000;
const MAX_RECONNECT_RETRIES = 3;

function normalizeWsUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  if (trimmed.endsWith("/ws")) return trimmed;
  return `${trimmed}/ws`;
}

export class WSClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private callbacks: WSCallbacks;
  private workspace: string = "default";
  private retryCount: number = 0;
  private intentionalClose: boolean = false;
  private mode: BridgeMode;
  private bridgeUrl: string;
  private token: string | undefined;
  private authComplete: boolean = false;
  private username: string | undefined;

  private operations = new Map<string, OperationCallbacks>();

  constructor(callbacks: WSCallbacks, config: WSClientConfig) {
    this.callbacks = callbacks;
    this.mode = config.mode;
    this.bridgeUrl = config.bridgeUrl;
    this.token = config.token;
    this.workspace = config.workspace || "default";
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.authComplete;
  }

  updateConfig(config: Partial<WSClientConfig>) {
    if (config.mode !== undefined) this.mode = config.mode;
    if (config.bridgeUrl !== undefined) this.bridgeUrl = config.bridgeUrl;
    if (config.token !== undefined) this.token = config.token;
  }

  getMode(): BridgeMode {
    return this.mode;
  }

  getUsername(): string | undefined {
    return this.username;
  }

  setWorkspace(ws: string) {
    this.workspace = ws;
  }

  connect() {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (this.mode === "hosted" && !this.token) {
      console.warn("[keb] Hosted mode but no token — skipping connect");
      return;
    }

    this.authComplete = false;
    this.callbacks.onStatusChange("connecting");

    this.ws = new WebSocket(normalizeWsUrl(this.bridgeUrl));

    this.ws.onopen = () => {
      this.retryCount = 0;
      this.intentionalClose = false;
      this.clearReconnectTimer();

      if (this.mode === "hosted" && this.token) {
        this._send({ type: "auth", token: this.token });
        return;
      }

      this.authComplete = true;
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
      this.callbacks.onStatusChange("disconnected");
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after this
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

  // ── Operation methods ────────────────────────────────────────────────

  add(url: string, callbacks: OperationCallbacks, operationId?: string): string {
    const id = operationId || nanoid();
    this.operations.set(id, callbacks);
    if (!this._send({ type: "add", operationId: id, url })) {
      callbacks.onError("Not connected to Keb bridge");
      this.operations.delete(id);
    }
    return id;
  }

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
      callbacks.onError("Not connected to Keb bridge");
      this.operations.delete(id);
    }
    return id;
  }

  query(text: string, callbacks: OperationCallbacks, operationId?: string): string {
    const id = operationId || nanoid();
    this.operations.set(id, callbacks);
    if (!this._send({ type: "query", operationId: id, text })) {
      callbacks.onError("Not connected to Keb bridge");
      this.operations.delete(id);
    }
    return id;
  }

  repair(callbacks: OperationCallbacks, operationId?: string): string {
    const id = operationId || nanoid();
    this.operations.set(id, callbacks);
    if (!this._send({ type: "repair", operationId: id })) {
      callbacks.onError("Not connected to Keb bridge");
      this.operations.delete(id);
    }
    return id;
  }

  send(data: WSMessage): boolean {
    return this._send(data);
  }

  sync() {
    this.send({ type: "sync", workspace: this.workspace });
  }

  clear() {
    this.send({ type: "clear", workspace: this.workspace });
  }

  // ── Internal ─────────────────────────────────────────────────────────

  private _send(data: WSMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.ws.send(
      JSON.stringify(
        "workspace" in data || this.mode === "hosted"
          ? data
          : { ...data, workspace: this.workspace },
      ),
    );
    return true;
  }

  private handleMessage(msg: WSResponse) {
    if (msg.type === "auth_ok") {
      this.authComplete = true;
      this.username = msg.username;
      this.callbacks.onStatusChange("connected");
      this.callbacks.onAuthOk(msg.username);
      this.send({ type: "sync" });
      return;
    }

    if (!this.authComplete && msg.type === "error" && !msg.operationId) {
      this.callbacks.onAuthError(msg.message);
      this.ws?.close();
      return;
    }

    const opId = msg.operationId;

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
          op.onError(msg.message, msg.toast);
          this.operations.delete(opId);
          return;
        case "stderr":
          console.warn("[keb] Bridge stderr:", msg.text);
          return;
      }
    }

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

  // ── Reconnection ─────────────────────────────────────────────────────

  private scheduleReconnect() {
    if (this.intentionalClose) return;
    if (this.reconnectTimer) return;

    if (this.retryCount >= MAX_RECONNECT_RETRIES) {
      this.callbacks.onStatusChange("max_retries");
      return;
    }

    this.retryCount++;
    const delay = BASE_RECONNECT_DELAY * Math.pow(2, this.retryCount - 1);
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
