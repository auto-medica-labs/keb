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
import { log } from "./lib/utils.js";
import { createPiKbStore } from "./adapters/pi-keb-store.js";
import { createSqliteUserStore } from "./adapters/user-store-sqlite.js";
import { createAuthHandler } from "./handlers/auth-handler.js";
import { spawnPi } from "./adapters/pi-rpc-spawner.js";
import { StatusTracker } from "./lib/status-tracker.js";
import { Connection } from "./lib/connection.js";
import { createHttpHandler } from "./lib/http-routes.js";

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
 * @typedef {Object} BridgeClearMessage
 * @property {'clear'} type
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
 * @typedef {BridgeAuthMessage|BridgeAddMessage|BridgeQueryMessage|BridgeSyncMessage|BridgeRepairMessage|BridgeAddContentMessage|BridgeClearMessage} BridgeMessage
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

const authHandler = createAuthHandler({ userStore, kbStore });

// ---------------------------------------------------------------------------
// Server: HTTP + WebSocket on same port
// ---------------------------------------------------------------------------

/**
 * Start the combined HTTP + WebSocket bridge server.
 *
 * @param {number} port - TCP port to listen on
 * @param {string} host - IP address to bind to
 */
function startBridge(port, host) {
  // ── WebSocket server (noServer — we handle upgrade manually) ──
  const wss = new WebSocketServer({ noServer: true });

  // ── Status tracker ────────────────────────────────────────────
  const statusTracker = new StatusTracker({ kbStore, mode: MODE, wss });

  // ── HTTP server ───────────────────────────────────────────────
  const httpServer = createServer(
    createHttpHandler({ mode: MODE, adminKey: ADMIN_KEY, authHandler, statusTracker }),
  );

  // ── Shared child process set (for graceful shutdown) ──────────
  /** @type {Set<import('node:child_process').ChildProcess>} */
  const childProcesses = new Set();

  // ── Graceful shutdown ─────────────────────────────────────────
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

  // ── Connection factory ────────────────────────────────────────
  wss.on("connection", (ws) => {
    log(`🔗 Client connected`);
    new Connection(ws, {
      kbStore,
      spawnPi,
      mode: MODE,
      maxDocuments: MAX_DOCUMENTS,
      statusTracker,
      childProcesses,
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
