/**
 * Minimal WebSocket client for Keb bridge.
 *
 * Only handles auth + query operations — no add, repair, sync, or clear.
 * Designed for the chat-only web app.
 */

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface QueryCallbacks {
  onEvent: (event: BridgeEvent) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export interface BridgeEvent {
  type: string;
  assistantMessageEvent?: { type: string; delta?: string };
  toolName?: string;
  message?: Record<string, unknown>;
}

type WSResponse =
  | { type: "auth_ok"; username: string }
  | { type: "event"; operationId?: string; data: BridgeEvent }
  | { type: "done"; operationId?: string; command: string }
  | { type: "error"; operationId?: string; message: string; toast?: string }
  | { type: "stderr"; operationId?: string; text: string };

type StatusCallback = (status: ConnectionStatus) => void;

export class BridgeClient {
  private ws: WebSocket | null = null;
  private url: string = "";
  private token: string | undefined;
  private onStatusChange: StatusCallback;
  private queryCallbacks: QueryCallbacks | null = null;
  private curOpId: string | null = null;
  private authComplete = false;

  constructor(onStatusChange: StatusCallback) {
    this.onStatusChange = onStatusChange;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.authComplete;
  }

  connect(url: string, token?: string): void {
    this.disconnect();
    this.url = url;
    this.token = token;
    this.authComplete = false;
    this.onStatusChange("connecting");

    // Normalize URL to have /ws suffix
    const wsUrl = url.replace(/\/+$/, "") + (url.endsWith("/ws") ? "" : "/ws");

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      if (this.token) {
        // Hosted mode: send auth first
        this.ws!.send(JSON.stringify({ type: "auth", token: this.token }));
      } else {
        // Local mode: ready immediately
        this.authComplete = true;
        this.onStatusChange("connected");
      }
    };

    this.ws.onmessage = (event) => {
      let msg: WSResponse;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }
      this.handleMessage(msg);
    };

    this.ws.onclose = () => {
      this.authComplete = false;
      this.queryCallbacks = null;
      this.curOpId = null;
      this.onStatusChange("disconnected");
    };

    this.ws.onerror = () => {
      this.onStatusChange("error");
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.onclose = null; // prevent reconnect logic
      this.ws.close();
      this.ws = null;
    }
    this.authComplete = false;
    this.queryCallbacks = null;
    this.curOpId = null;
  }

  /** Send a query. Returns the operationId. */
  query(text: string, callbacks: QueryCallbacks): string | null {
    if (!this.connected) {
      callbacks.onError("Not connected");
      return null;
    }
    const opId = crypto.randomUUID();
    this.queryCallbacks = callbacks;
    this.curOpId = opId;
    this.ws!.send(JSON.stringify({ type: "query", operationId: opId, text }));
    return opId;
  }

  private handleMessage(msg: WSResponse): void {
    // Auth response
    if (msg.type === "auth_ok") {
      this.authComplete = true;
      this.onStatusChange("connected");
      return;
    }

    // Auth error (error without operationId before auth)
    if (!this.authComplete && msg.type === "error" && !msg.operationId) {
      this.onStatusChange("error");
      return;
    }

    // Route to query callbacks
    const qc = this.queryCallbacks;
    if (!qc) return;

    const opId = msg.operationId;
    if (opId && opId !== this.curOpId) return; // not our operation

    switch (msg.type) {
      case "event":
        qc.onEvent(msg.data);
        break;
      case "done":
        qc.onDone();
        this.queryCallbacks = null;
        this.curOpId = null;
        break;
      case "error":
        qc.onError(msg.message);
        this.queryCallbacks = null;
        this.curOpId = null;
        break;
      case "stderr":
        console.warn("[keb] stderr:", msg.text);
        break;
    }
  }
}
