#!/usr/bin/env node
// @ts-check

/**
 * bridge-server.js — Hosted WebSocket + HTTP bridge for Keb.
 *
 * Runs a combined HTTP + WebSocket server. HTTP handles auth endpoints
 * (signup, login, /me). WebSocket handles KB operations (add, query, sync,
 * repair, add-content). Each WebSocket connection is authenticated via JWT;
 * the authenticated username is enforced as the workspace for all operations.
 *
 * Architecture (port & adapter):
 *   Ports          Adapters                Handlers
 *   ────────────   ─────────────────────   ─────────────────────
 *   KbStore   ←    FilesystemKbStore   ←   SyncHandler
 *   UserStore ←    JsonUserStore       ←   AuthHandler (HTTP)
 *   (spawnPi) ←    PiRpcSpawner        ←   QueryHandler
 *                                      ←   CommandHandler
 *
 * Usage:
 *   node bridge-server.js                    # start (HOST=127.0.0.1 PORT=9876)
 *   HOST=0.0.0.0 PORT=9876 node bridge-server.js  # all interfaces
 *   JWT_SECRET=... node bridge-server.js     # production: set JWT secret
 *
 * The server runs until Ctrl+C.
 */

import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { safeStringify, log } from "./lib/utils.js";
import { verifyToken } from "./lib/auth.js";
import { createPiKbStore } from "./adapters/pi-kb-store.js";
import { createJsonUserStore } from "./adapters/user-store-json.js";
import { createAuthHandler } from "./handlers/auth-handler.js";
import { spawnPi } from "./adapters/pi-rpc-spawner.js";
import { handleQuery } from "./handlers/query-handler.js";
import { handleCommand } from "./handlers/command-handler.js";
import { handleAddContent } from "./handlers/add-content-handler.js";
import { handleSync } from "./handlers/sync-handler.js";

// ---------------------------------------------------------------------------
// Type definitions — WebSocket message shapes
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} BridgeAuthMessage
 * @property {'auth'} type
 * @property {string} token - JWT from /api/login or /api/signup
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

// ---------------------------------------------------------------------------
// Bootstrap adapters
// ---------------------------------------------------------------------------

/** @type {import('./ports/kb-store.js').KbStore} */
const kbStore = createPiKbStore();

/** @type {import('./ports/user-store.js').UserStore} */
const userStore = createJsonUserStore();

const authHandler = createAuthHandler({ userStore });

// ---------------------------------------------------------------------------
// Server: HTTP + WebSocket on same port
// ---------------------------------------------------------------------------

/**
 * Start the combined HTTP + WebSocket bridge server.
 *
 * HTTP paths:
 *   POST /api/signup  — create account + workspace, return JWT
 *   POST /api/login   — authenticate, return JWT
 *   GET  /api/me      — verify token, return user info
 *
 * WebSocket (upgrade on any path):
 *   First message must be { type: "auth", token: "<jwt>" }
 *   Subsequent messages enforce workspace = authenticated username.
 *
 * @param {number} port - TCP port to listen on
 * @param {string} host - IP address to bind to
 */
function startBridge(port, host) {
  const httpServer = createServer(async (req, res) => {
    // Try auth routes first
    const handled = await authHandler(req, res);

    // If not an auth route, return 404 (WebSocket upgrade is handled
    // by the ws library attaching to the same httpServer, not here)
    if (!handled) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
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

      // ── Auth must be the first message ─────────────────────
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
          authComplete = true;
          log(`🔐 User authenticated: ${username}`);
          ws.send(safeStringify({ type: "auth_ok", username }));
        } catch {
          ws.send(safeStringify({ type: "error", message: "Invalid or expired token." }));
          ws.close(4001, "Invalid token");
        }
        return;
      }

      // ── All subsequent messages use authenticatedUser as workspace ──
      const workspace = /** @type {string} */ (authenticatedUser);
      const operationId =
        msg.operationId || `srv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      switch (msg.type) {
        // ── Command actions (add / repair) ──────────────────────
        case "add": {
          if (!msg.url) {
            ws.send(safeStringify({ type: "error", operationId, message: "Missing 'url' field" }));
            return;
          }
          const child = handleCommand({
            ws,
            operationId,
            command: "add",
            url: msg.url,
            workspace,
            kbStore,
            spawn: spawnPi,
          });
          if (child) {
            activeChildren.set(operationId, child);
            childProcesses.add(child);
            child.on("exit", () => {
              activeChildren.delete(operationId);
              childProcesses.delete(child);
            });
          }
          break;
        }

        case "repair": {
          const child = handleCommand({
            ws,
            operationId,
            command: "repair",
            workspace,
            kbStore,
            spawn: spawnPi,
          });
          if (child) {
            activeChildren.set(operationId, child);
            childProcesses.add(child);
            child.on("exit", () => {
              activeChildren.delete(operationId);
              childProcesses.delete(child);
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
            spawn: spawnPi,
          });
          if (child) {
            activeChildren.set(operationId, child);
            childProcesses.add(child);
            child.on("exit", () => {
              activeChildren.delete(operationId);
              childProcesses.delete(child);
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
          child.on("exit", () => {
            activeChildren.delete(operationId);
            childProcesses.delete(child);
          });
          break;
        }

        // ── Sync action (pure read, no pi needed) ───────────────
        case "sync": {
          try {
            handleSync({ ws, workspace, kbStore });
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
    log(`   HTTP:  POST /api/signup  |  POST /api/login  |  GET /api/me`);
    log(`   WS:    ws://${host}:${port}  (auth required)`);
    log(`   Press Ctrl+C to stop.`);
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

startBridge(PORT, HOST);
