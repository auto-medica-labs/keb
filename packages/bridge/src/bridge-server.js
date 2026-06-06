#!/usr/bin/env node
// @ts-check

/**
 * bridge-server.js — WebSocket + HTTP bridge for Keb.
 *
 * Runs a combined HTTP + WebSocket server. Two modes:
 *
 *   local  (default) — No auth. Workspace sent by client. HTTP auth
 *                       endpoints are disabled. Good for personal use.
 *
 *   hosted — HTTP handles auth endpoints (signup, login, /me).
 *            WebSocket requires JWT auth. Workspace is enforced
 *            from the authenticated username.
 *
 * Architecture (port & adapter):
 *   Ports          Adapters                Handlers
 *   ────────────   ─────────────────────   ─────────────────────
 *   KbStore   ←    FilesystemKbStore   ←   SyncHandler
 *   UserStore ←    JsonUserStore       ←   AuthHandler (HTTP, hosted only)
 *   (spawnPi) ←    PiRpcSpawner        ←   QueryHandler
 *                                      ←   CommandHandler
 *
 * Usage:
 *   node bridge-server.js                    # local mode (HOST=127.0.0.1 PORT=9876)
 *   KEB_MODE=hosted JWT_SECRET=... node bridge-server.js  # hosted mode
 *   HOST=0.0.0.0 PORT=9876 node bridge-server.js  # all interfaces
 *
 * The server runs until Ctrl+C.
 */

import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { safeStringify, log } from "./lib/utils.js";
import { verifyToken } from "./lib/auth.js";
import { createPiKbStore } from "./adapters/pi-kb-store.js";
import { createSqliteUserStore } from "./adapters/user-store-sqlite.js";
import { createAuthHandler } from "./handlers/auth-handler.js";
import { spawnPi } from "./adapters/pi-rpc-spawner.js";
import { handleQuery } from "./handlers/query-handler.js";
import { handleAddUrl } from "./handlers/add-url-handler.js";
import { handleRepair } from "./handlers/repair-handler.js";
import { handleAddContent } from "./handlers/add-content-handler.js";
import { handleSync } from "./handlers/sync-handler.js";

// ---------------------------------------------------------------------------
// Type definitions — WebSocket message shapes
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} TrackedSocket
 * @property {string|null} _authenticatedUser
 * @property {number} _connectedAt
 */

/**
 * @typedef {Object} BridgeAuthMessage
 * @property {'auth'} type
 * @property {string} token - JWT from /api/login or /api/signup
 * @property {string} [workspace] - Ignored (only present for union type compatibility)
 */

/**
 * @typedef {Object} BridgeAddMessage
 * @property {'add'} type
 * @property {string} operationId
 * @property {string} url
 * @property {string} [workspace] - Ignored in hosted mode; server uses auth username
 */

/**
 * @typedef {Object} BridgeQueryMessage
 * @property {'query'} type
 * @property {string} operationId
 * @property {string} text
 * @property {string} [workspace] - Ignored in hosted mode
 */

/**
 * @typedef {Object} BridgeSyncMessage
 * @property {'sync'} type
 * @property {string} [workspace] - Ignored in hosted mode
 */

/**
 * @typedef {Object} BridgeRepairMessage
 * @property {'repair'} type
 * @property {string} operationId
 * @property {string} [workspace] - Ignored in hosted mode
 */

/**
 * @typedef {Object} BridgeAddContentMessage
 * @property {'add-content'} type
 * @property {string} operationId
 * @property {string} html
 * @property {string} [url]
 * @property {string} [title]
 * @property {string} [workspace] - Ignored in hosted mode
 */

/**
 * @typedef {BridgeAuthMessage|BridgeAddMessage|BridgeQueryMessage|BridgeSyncMessage|BridgeRepairMessage|BridgeAddContentMessage} BridgeMessage
 */

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** @type {number} */
const PORT =
  parseInt(process.env.PORT || process.argv[process.argv.indexOf("--port") + 1] || "9876", 10) ||
  9876;

/** @type {string} */
const HOST = process.env.HOST || "127.0.0.1";

/**
 * Bridge mode: "local" (no auth) or "hosted" (auth required).
 * Defaults to "local" for backward compatibility.
 * @type {'local' | 'hosted'}
 */
const MODE = process.env.KEB_MODE === "hosted" ? "hosted" : "local";

/**
 * Document limit for hosted free tier (no limit in local mode).
 * @type {number|undefined}
 */
const MAX_DOCUMENTS = MODE === "hosted" ? 50 : undefined;

/**
 * Admin API key for /api/status endpoint.
 * If unset, /api/status returns 501. Sent via X-API-Key header.
 * @type {string|undefined}
 */
const ADMIN_KEY = process.env.ADMIN_KEY || undefined;

// ---------------------------------------------------------------------------
// Bootstrap adapters
// ---------------------------------------------------------------------------

/** @type {import('./ports/kb-store.js').KbStore} */
const kbStore = createPiKbStore();

/** @type {import('./ports/user-store.js').UserStore} */
const userStore = createSqliteUserStore();

const authHandler = createAuthHandler({ userStore });

// ---------------------------------------------------------------------------
// Server: HTTP + WebSocket on same port
// ---------------------------------------------------------------------------

/**
 * Start the combined HTTP + WebSocket bridge server.
 *
 * In hosted mode:
 *   HTTP:  POST /api/signup  |  POST /api/login  |  GET /api/me
 *   WS:    first message must be { type: "auth", token: "<jwt>" }
 *          workspace is enforced from authenticated username.
 *
 * In local mode:
 *   HTTP:  all routes return 404 (no auth endpoints)
 *   WS:    no auth required, workspace sent by client in each message.
 *
 * @param {number} port - TCP port to listen on
 * @param {string} host - IP address to bind to
 */
function startBridge(port, host) {
  // ── Runtime tracking for /api/status ────────────────────
  const serverStartTime = Date.now();

  /** @type {Map<string, { type: string, workspace: string, startedAt: number }>} */
  const activeOperations = new Map();

  /** @type {Map<string, number>} */
  const workspaceLastActivity = new Map();

  /** Record workspace activity timestamp. */
  function touchWorkspace(/** @type {string|undefined} */ ws) {
    if (ws) workspaceLastActivity.set(ws, Date.now());
  }

  /** Build /api/status response payload. */
  function buildStatus() {
    // Connected clients
    /** @type {{ user: string, connectedSince: number }[]} */
    const clients = [];
    for (const client of wss.clients) {
      const c =
        /** @type {import('ws').WebSocket & {_authenticatedUser?: string|null, _connectedAt?: number}} */ (
          client
        );
      if (c.readyState === 1 && c._authenticatedUser && c._connectedAt) {
        clients.push({
          user: c._authenticatedUser,
          connectedSince: c._connectedAt,
        });
      }
    }

    // Active operations by type
    /** @type {Object<string, number>} */
    const byType = {};
    for (const [, op] of activeOperations) {
      byType[op.type] = (byType[op.type] || 0) + 1;
    }

    // Workspace details
    const workspaceNames = kbStore.listWorkspaces();
    const workspaces = workspaceNames.map((name) => ({
      name,
      documents: kbStore.countDocuments(name),
      lastActivity: workspaceLastActivity.has(name)
        ? new Date(/** @type {number} */ (workspaceLastActivity.get(name))).toISOString()
        : null,
    }));

    return {
      status: "ok",
      mode: MODE,
      uptime: Math.floor((Date.now() - serverStartTime) / 1000),
      connections: {
        active: clients.length,
        clients,
      },
      operations: {
        active: activeOperations.size,
        byType,
      },
      workspaces: {
        total: workspaces.length,
        details: workspaces,
      },
    };
  }

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    // ── Health check: always available, no auth required ────
    if (url.pathname === "/api/healthcheck" && req.method?.toUpperCase() === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", mode: MODE }));
      return;
    }

    // ── Status: admin key required ──────────────────────────
    if (url.pathname === "/api/status" && req.method?.toUpperCase() === "GET") {
      if (!ADMIN_KEY) {
        res.writeHead(501, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ error: "ADMIN_KEY not configured on server. Set ADMIN_KEY env var." }),
        );
        return;
      }
      const apiKey = req.headers["x-api-key"];
      if (!apiKey || apiKey !== ADMIN_KEY) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid or missing X-API-Key header." }));
        return;
      }
      const payload = JSON.stringify(buildStatus());
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(payload);
      return;
    }

    // Auth endpoints only active in hosted mode
    if (MODE === "hosted") {
      const handled = await authHandler(req, res);
      if (handled) return;
    }

    // If not an auth route, return 404 (WebSocket upgrade is handled
    // by the ws library attaching to the same httpServer, not here)
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  // Attach WebSocket server to the same HTTP server
  const wss = new WebSocketServer({ noServer: true });

  /** @type {Set<import('node:child_process').ChildProcess>} */
  const childProcesses = new Set();

  let shuttingDown = false;

  /**
   * Gracefully shut down: kill children, terminate clients, close servers.
   * @param {string} signal - Signal name for logging
   */
  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`🛑 Received ${signal} — shutting down gracefully...`);

    for (const child of childProcesses) {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
    childProcesses.clear();

    for (const client of wss.clients) {
      client.terminate();
    }

    wss.close(() => {
      httpServer.close(() => {
        log(`✅ Bridge stopped.`);
        process.exit(0);
      });
    });

    setTimeout(() => {
      log(`⚠️  Graceful shutdown timed out — forcing exit.`);
      process.exit(1);
    }, 5000).unref();
  }

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  // ── WebSocket upgrade handling ───────────────────────────────
  httpServer.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  // ── WebSocket connection lifecycle ───────────────────────────
  wss.on("connection", (ws) => {
    log(`🔗 Client connected`);
    /** @type {string|null} */
    let authenticatedUser = null;
    let authComplete = false;

    // Tag ws object for /api/status tracking
    ws._connectedAt = Date.now();
    ws._authenticatedUser = null;

    /** @type {Map<string, import('node:child_process').ChildProcess>} */
    const activeChildren = new Map();

    /** Kill all active child processes for this connection. */
    function killAllChildren() {
      for (const [, child] of activeChildren) {
        try {
          child.kill("SIGTERM");
        } catch {
          /* ignore */
        }
        childProcesses.delete(child);
      }
      activeChildren.clear();
    }

    ws.on("message", (/** @type {import('ws').RawData} */ raw) => {
      /** @type {BridgeMessage & { operationId?: string }} */
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(safeStringify({ type: "error", message: "Invalid JSON" }));
        return;
      }

      // ── Auth required only in hosted mode ───────────────────
      if (MODE === "hosted") {
        if (!authComplete) {
          if (msg.type !== "auth" || !msg.token) {
            ws.send(
              safeStringify({
                type: "error",
                message: "Authentication required. Send { type: 'auth', token: '<jwt>' } first.",
              }),
            );
            ws.close(4001, "Authentication required");
            return;
          }

          try {
            const { username } = verifyToken(/** @type {BridgeAuthMessage} */ (msg).token);
            authenticatedUser = username;
            ws._authenticatedUser = username;
            authComplete = true;
            log(`🔐 User authenticated: ${username}`);
            ws.send(safeStringify({ type: "auth_ok", username }));
          } catch {
            ws.send(safeStringify({ type: "error", message: "Invalid or expired token." }));
            ws.close(4001, "Invalid token");
          }
          return;
        }
      } else {
        // Local mode: always auth-complete, no token needed
        authComplete = true;
        ws._authenticatedUser = "(local)";
      }

      // ── Determine workspace ──────────────────────────────────
      // Hosted: enforced from authenticated username
      // Local:  client-specified, fallback to "default"
      const workspace =
        MODE === "hosted"
          ? /** @type {string} */ (authenticatedUser)
          : msg.workspace && msg.workspace !== "default"
            ? msg.workspace
            : undefined;
      const operationId =
        msg.operationId || `srv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      switch (msg.type) {
        // ── Command actions (add / repair) ──────────────────────
        case "add": {
          if (!msg.url) {
            ws.send(safeStringify({ type: "error", operationId, message: "Missing 'url' field" }));
            return;
          }
          const child = handleAddUrl({
            ws,
            operationId,
            url: msg.url,
            workspace,
            kbStore,
            spawn: spawnPi,
            maxDocuments: MAX_DOCUMENTS,
          });
          if (child) {
            activeChildren.set(operationId, child);
            childProcesses.add(child);
            activeOperations.set(operationId, {
              type: "add",
              workspace: workspace || "default",
              startedAt: Date.now(),
            });
            child.on("exit", () => {
              activeChildren.delete(operationId);
              childProcesses.delete(child);
              activeOperations.delete(operationId);
              touchWorkspace(workspace);
            });
          }
          break;
        }

        case "repair": {
          const child = handleRepair({
            ws,
            operationId,
            workspace,
            kbStore,
            spawn: spawnPi,
          });
          if (child) {
            activeChildren.set(operationId, child);
            childProcesses.add(child);
            activeOperations.set(operationId, {
              type: "repair",
              workspace: workspace || "default",
              startedAt: Date.now(),
            });
            child.on("exit", () => {
              activeChildren.delete(operationId);
              childProcesses.delete(child);
              activeOperations.delete(operationId);
              touchWorkspace(workspace);
            });
          }
          break;
        }

        // ── Add-content action (captured page HTML) ──────────────
        case "add-content": {
          if (!msg.html) {
            ws.send(
              safeStringify({
                type: "error",
                operationId,
                message: "Missing 'html' field",
              }),
            );
            return;
          }
          const child = handleAddContent({
            ws,
            operationId,
            html: msg.html,
            url: msg.url,
            title: msg.title,
            workspace,
            kbStore,
            spawn: spawnPi,
            maxDocuments: MAX_DOCUMENTS,
          });
          if (child) {
            activeChildren.set(operationId, child);
            childProcesses.add(child);
            activeOperations.set(operationId, {
              type: "add-content",
              workspace: workspace || "default",
              startedAt: Date.now(),
            });
            child.on("exit", () => {
              activeChildren.delete(operationId);
              childProcesses.delete(child);
              activeOperations.delete(operationId);
              touchWorkspace(workspace);
            });
          }
          break;
        }

        // ── Query action ────────────────────────────────────────
        case "query": {
          if (!msg.text) {
            ws.send(safeStringify({ type: "error", operationId, message: "Missing 'text' field" }));
            return;
          }
          const child = handleQuery({ ws, operationId, text: msg.text, workspace, spawn: spawnPi });
          activeChildren.set(operationId, child);
          childProcesses.add(child);
          activeOperations.set(operationId, {
            type: "query",
            workspace: workspace || "default",
            startedAt: Date.now(),
          });
          child.on("exit", () => {
            activeChildren.delete(operationId);
            childProcesses.delete(child);
            activeOperations.delete(operationId);
            touchWorkspace(workspace);
          });
          break;
        }

        // ── Sync action (pure read, no pi needed) ───────────────
        case "sync": {
          try {
            handleSync({ ws, workspace, kbStore });
            touchWorkspace(workspace);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            ws.send(safeStringify({ type: "error", message: `Sync failed: ${message}` }));
            log(`sync error: ${message}`);
          }
          break;
        }

        default:
          ws.send(
            safeStringify({
              type: "error",
              operationId,
              message: `Unknown type: ${/** @type {{type: string}} */ (msg).type}`,
            }),
          );
      }
    });

    ws.on("close", () => {
      log(`🔌 Client disconnected${authenticatedUser ? ` (${authenticatedUser})` : ""}`);
      killAllChildren();
    });

    ws.on("error", (/** @type {Error} */ err) => {
      log(`⚠️  WebSocket error: ${err.message}`);
    });
  });

  httpServer.on("error", (err) => {
    log(`❌ Server error: ${err.message}`);
    if (/** @type {NodeJS.ErrnoException} */ (err).code === "EADDRINUSE") {
      log(`   Port ${port} is already in use. Is another bridge running?`);
    }
    process.exit(1);
  });

  httpServer.listen(port, host, () => {
    log(`✅ Bridge listening on http://${host}:${port}`);
    log(`   Health: GET  /api/healthcheck (no auth)`);
    log(
      `   Status: GET  /api/status (X-API-Key required${ADMIN_KEY ? "" : " — disabled, set ADMIN_KEY to enable"})`,
    );
    if (MODE === "hosted") {
      log(`   Mode:  hosted (auth required)`);
      log(`   HTTP:  POST /api/signup  |  POST /api/login  |  GET /api/me`);
      log(`   WS:    auth with JWT token`);
    } else {
      log(`   Mode:  local (no auth)`);
    }
    log(`   WS:    ws://${host}:${port}`);
    log(`   Press Ctrl+C to stop.`);
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

startBridge(PORT, HOST);
