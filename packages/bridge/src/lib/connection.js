// @ts-check

// ---------------------------------------------------------------------------
// Connection — manages a single WebSocket client lifecycle
//
// Owns per-connection state (auth, active children). Receives shared
// dependencies via constructor. Sets up message/close/error handlers.
// All cleanup is self-contained — on close, all children are killed.
// ---------------------------------------------------------------------------

import { safeStringify, log } from "./utils.js";
import { verifyToken } from "./auth.js";
import { handleQuery } from "../handlers/query-handler.js";
import { handleAddUrl } from "../handlers/add-url-handler.js";
import { handleRepair } from "../handlers/repair-handler.js";
import { handleAddContent } from "../handlers/add-content-handler.js";
import { handleSync } from "../handlers/sync-handler.js";
import { handleClear } from "../handlers/clear-handler.js";

/**
 * Manages a single WebSocket client connection.
 *
 * Sets up message dispatch, auth flow, child process tracking,
 * and cleanup. Created per-connection by bridge-server.
 */
export class Connection {
  /** @type {import('ws').WebSocket} */
  #ws;

  /** @type {import('../ports/keb-store.js').KebStore} */
  #kebStore;

  /** @type {import('../adapters/pi-rpc-spawner.js').spawnPi} */
  #spawnPi;

  /** @type {'local' | 'hosted'} */
  #mode;

  /** @type {number|undefined} */
  #maxDocuments;

  /** @type {import('./status-tracker.js').StatusTracker} */
  #statusTracker;

  /** @type {Set<import('node:child_process').ChildProcess>} */
  #childProcesses;

  /** @type {string|null} */
  #authenticatedUser = null;

  /** @type {boolean} */
  #authComplete = false;

  /** @type {Map<string, import('node:child_process').ChildProcess>} */
  #activeChildren = new Map();

  /**
   * @param {import('ws').WebSocket} ws
   * @param {object} deps
   * @param {import('../ports/keb-store.js').KebStore} deps.kebStore
   * @param {import('../adapters/pi-rpc-spawner.js').spawnPi} deps.spawnPi
   * @param {'local' | 'hosted'} deps.mode
   * @param {number|undefined} deps.maxDocuments
   * @param {import('./status-tracker.js').StatusTracker} deps.statusTracker
   * @param {Set<import('node:child_process').ChildProcess>} deps.childProcesses
   */
  constructor(ws, { kebStore, spawnPi, mode, maxDocuments, statusTracker, childProcesses }) {
    this.#ws = ws;
    this.#kebStore = kebStore;
    this.#spawnPi = spawnPi;
    this.#mode = mode;
    this.#maxDocuments = maxDocuments;
    this.#statusTracker = statusTracker;
    this.#childProcesses = childProcesses;

    // Tag ws object for /api/status tracking
    ws._connectedAt = Date.now();
    ws._authenticatedUser = null;

    ws.on("message", (raw) => this.#onMessage(raw));
    ws.on("close", () => this.#onClose());
    ws.on("error", (err) => this.#onError(err));
  }

  // ── Message dispatch ────────────────────────────────────────

  /**
   * @param {import('ws').RawData} raw
   */
  #onMessage(raw) {
    /** @type {import('../bridge-server.js').BridgeMessage & { operationId?: string }} */
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      this.#ws.send(safeStringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    // ── Auth required only in hosted mode ─────────────────────
    if (this.#mode === "hosted") {
      if (!this.#authComplete) {
        if (msg.type !== "auth" || !msg.token) {
          this.#ws.send(
            safeStringify({
              type: "error",
              message: "Authentication required. Send { type: 'auth', token: '<jwt>' } first.",
            }),
          );
          this.#ws.close(4001, "Authentication required");
          return;
        }

        try {
          const { username } = verifyToken(
            /** @type {import('../bridge-server.js').BridgeAuthMessage} */ (msg).token,
          );
          this.#authenticatedUser = username;
          this.#ws._authenticatedUser = username;
          this.#authComplete = true;
          log(`🔐 User authenticated: ${username}`);
          this.#ws.send(safeStringify({ type: "auth_ok", username }));
        } catch {
          this.#ws.send(safeStringify({ type: "error", message: "Invalid or expired token." }));
          this.#ws.close(4001, "Invalid token");
        }
        return;
      }
    } else {
      // Local mode: always auth-complete, no token needed
      this.#authComplete = true;
      this.#ws._authenticatedUser = "(local)";
    }

    // ── Determine workspace ────────────────────────────────────
    // Hosted: enforced from authenticated username
    // Local:  client-specified, fallback to "default"
    const workspace =
      this.#mode === "hosted"
        ? /** @type {string} */ (this.#authenticatedUser)
        : msg.workspace && msg.workspace !== "default"
          ? msg.workspace
          : undefined;
    const operationId =
      msg.operationId || `srv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    switch (msg.type) {
      // ── Command actions (add / repair) ──────────────────────
      case "add": {
        if (!msg.url) {
          this.#ws.send(
            safeStringify({ type: "error", operationId, message: "Missing 'url' field" }),
          );
          return;
        }
        const child = handleAddUrl({
          ws: this.#ws,
          operationId,
          url: msg.url,
          workspace,
          kebStore: this.#kebStore,
          spawn: this.#spawnPi,
          maxDocuments: this.#maxDocuments,
        });
        this.#trySpawnChild(child, operationId, "add", workspace);
        break;
      }

      case "repair": {
        const child = handleRepair({
          ws: this.#ws,
          operationId,
          workspace,
          kebStore: this.#kebStore,
          spawn: this.#spawnPi,
        });
        this.#trySpawnChild(child, operationId, "repair", workspace);
        break;
      }

      // ── Add-content action (captured page HTML) ──────────────
      case "add-content": {
        if (!msg.html) {
          this.#ws.send(
            safeStringify({
              type: "error",
              operationId,
              message: "Missing 'html' field",
            }),
          );
          return;
        }
        const child = handleAddContent({
          ws: this.#ws,
          operationId,
          html: msg.html,
          url: msg.url,
          title: msg.title,
          workspace,
          kebStore: this.#kebStore,
          spawn: this.#spawnPi,
          maxDocuments: this.#maxDocuments,
        });
        this.#trySpawnChild(child, operationId, "add-content", workspace);
        break;
      }

      // ── Query action ────────────────────────────────────────
      case "query": {
        if (!msg.text) {
          this.#ws.send(
            safeStringify({ type: "error", operationId, message: "Missing 'text' field" }),
          );
          return;
        }
        const child = handleQuery({
          ws: this.#ws,
          operationId,
          text: msg.text,
          workspace,
          spawn: this.#spawnPi,
        });
        this.#spawnChild(child, operationId, "query", workspace);
        break;
      }

      // ── Sync action (pure read, no pi needed) ───────────────
      case "sync": {
        try {
          handleSync({ ws: this.#ws, workspace, kebStore: this.#kebStore });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.#ws.send(safeStringify({ type: "error", message: `Sync failed: ${message}` }));
          log(`sync error: ${message}`);
        }
        break;
      }

      // ── Clear action (pure write, no pi needed) ──────────────
      case "clear": {
        try {
          handleClear({ ws: this.#ws, workspace, kebStore: this.#kebStore });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.#ws.send(safeStringify({ type: "error", message: `Clear failed: ${message}` }));
          log(`clear error: ${message}`);
        }
        break;
      }

      default:
        this.#ws.send(
          safeStringify({
            type: "error",
            operationId,
            message: `Unknown type: ${/** @type {{type: string}} */ (msg).type}`,
          }),
        );
    }
  }

  // ── Child tracking ──────────────────────────────────────────

  /**
   * Track a child that may be null (add, repair, add-content handlers
   * can short-circuit and return null).
   * @param {import('node:child_process').ChildProcess|null} child
   * @param {string} opId
   * @param {string} type
   * @param {string|undefined} workspace
   */
  #trySpawnChild(child, opId, type, workspace) {
    if (!child) return;
    this.#spawnChild(child, opId, type, workspace);
  }

  /**
   * Track a spawned child process. Registers with per-connection map,
   * global child set, and status tracker. Cleans up on exit.
   * @param {import('node:child_process').ChildProcess} child
   * @param {string} opId
   * @param {string} type
   * @param {string|undefined} workspace
   */
  #spawnChild(child, opId, type, workspace) {
    this.#activeChildren.set(opId, child);
    this.#childProcesses.add(child);
    this.#statusTracker.trackOperation(opId, type, workspace || "default");
    child.on("exit", () => {
      this.#activeChildren.delete(opId);
      this.#childProcesses.delete(child);
      this.#statusTracker.untrackOperation(opId);
    });
  }

  // ── Lifecycle ───────────────────────────────────────────────

  #onClose() {
    log(`🔌 Client disconnected${this.#authenticatedUser ? ` (${this.#authenticatedUser})` : ""}`);
    for (const [, child] of this.#activeChildren) {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      this.#childProcesses.delete(child);
    }
    this.#activeChildren.clear();
  }

  /**
   * @param {Error} err
   */
  #onError(err) {
    log(`⚠️  WebSocket error: ${err.message}`);
  }
}
