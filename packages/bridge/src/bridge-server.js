#!/usr/bin/env node
// @ts-check

/**
 * bridge-server.js — Standalone WebSocket bridge for chrome-kb.
 *
 * Runs independently of pi's TUI. Connects the Chrome extension to pi-kb
 * via WebSocket on ws://127.0.0.1:9876. Spawns child pi processes for
 * add/query operations, and reads the filesystem directly for sync.
 *
 * Architecture (port & adapter):
 *   Ports          Adapters                Handlers
 *   ────────────   ─────────────────────   ─────────────────────
 *   KbStore   ←    FilesystemKbStore   ←   SyncHandler
 *   (spawnPi) ←    PiRpcSpawner        ←   QueryHandler
 *                                      ←   CommandHandler
 *
 * Usage:
 *   node bridge-server.js                # start the server
 *   node bridge-server.js --port 9876    # custom port
 */

import { WebSocketServer } from "ws";
import { safeStringify, log } from "./lib/utils.js";
import { createFilesystemKbStore } from "./adapters/filesystem-kb-store.js";
import { spawnPi } from "./adapters/pi-rpc-spawner.js";
import { handleQuery } from "./handlers/query-handler.js";
import { handleCommand } from "./handlers/command-handler.js";
import { handleSync } from "./handlers/sync-handler.js";

// ---------------------------------------------------------------------------
// Type definitions — WebSocket message shapes
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} BridgeAddMessage
 * @property {'add'} type
 * @property {string} url
 * @property {string} [workspace]
 */

/**
 * @typedef {Object} BridgeQueryMessage
 * @property {'query'} type
 * @property {string} text
 * @property {string} [workspace]
 */

/**
 * @typedef {Object} BridgeSyncMessage
 * @property {'sync'} type
 * @property {string} [workspace]
 */

/**
 * @typedef {Object} BridgeRepairMessage
 * @property {'repair'} type
 * @property {string} [workspace]
 */

/**
 * @typedef {BridgeAddMessage|BridgeQueryMessage|BridgeSyncMessage|BridgeRepairMessage} BridgeMessage
 */

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** @type {number} */
const PORT = parseInt(process.argv[process.argv.indexOf("--port") + 1] || "9876", 10) || 9876;

// ---------------------------------------------------------------------------
// Bootstrap adapters
// ---------------------------------------------------------------------------

/** @type {import('./ports/kb-store.js').KbStore} */
const kbStore = createFilesystemKbStore();

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------

/**
 * Start the WebSocket bridge server.
 * @param {number} port - TCP port to listen on
 * @returns {void}
 */
function startBridge(port) {
  const wss = new WebSocketServer({ host: "127.0.0.1", port });

  /** @type {Set<import('node:child_process').ChildProcess>} */
  const childProcesses = new Set();

  let shuttingDown = false;

  /**
   * Gracefully shut down: kill children, terminate clients, close server.
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
      log(`✅ Bridge stopped.`);
      process.exit(0);
    });

    setTimeout(() => {
      log(`⚠️  Graceful shutdown timed out — forcing exit.`);
      process.exit(1);
    }, 5000).unref();
  }

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  wss.on("listening", () => {
    log(`✅ Bridge listening on ws://127.0.0.1:${port}`);
    log(`   Chrome extension can now connect. Press Ctrl+C to stop.`);
  });

  wss.on("error", (err) => {
    log(`❌ Server error: ${err.message}`);
    if (/** @type {NodeJS.ErrnoException} */ (err).code === "EADDRINUSE") {
      log(`   Port ${port} is already in use. Is another bridge running?`);
    }
    process.exit(1);
  });

  wss.on("connection", (ws) => {
    log(`🔗 Chrome extension connected`);

    /** @type {import('node:child_process').ChildProcess|null} */
    let activeChild = null;

    /** Kill the active child process and clean up tracking. */
    function killActiveChild() {
      if (activeChild) {
        activeChild.kill();
        childProcesses.delete(activeChild);
        activeChild = null;
      }
    }

    ws.on("message", (/** @type {import('ws').RawData} */ raw) => {
      /** @type {BridgeMessage} */
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(safeStringify({ type: "error", message: "Invalid JSON" }));
        return;
      }

      const workspace = msg.workspace && msg.workspace !== "default" ? msg.workspace : undefined;

      switch (msg.type) {
        // ── Command actions (add / repair) ──────────────────────────
        case "add": {
          if (!msg.url) {
            ws.send(safeStringify({ type: "error", message: "Missing 'url' field" }));
            return;
          }
          killActiveChild();
          const child = handleCommand({
            ws,
            command: "add",
            url: msg.url,
            workspace,
            kbStore,
            spawn: spawnPi,
          });
          if (child) {
            activeChild = child;
            childProcesses.add(child);
          }
          break;
        }

        case "repair": {
          killActiveChild();
          const child = handleCommand({
            ws,
            command: "repair",
            workspace,
            kbStore,
            spawn: spawnPi,
          });
          if (child) {
            activeChild = child;
            childProcesses.add(child);
          }
          break;
        }

        // ── Query action ────────────────────────────────────────────
        case "query": {
          if (!msg.text) {
            ws.send(safeStringify({ type: "error", message: "Missing 'text' field" }));
            return;
          }
          killActiveChild();
          const child = handleQuery({ ws, text: msg.text, workspace, spawn: spawnPi });
          activeChild = child;
          childProcesses.add(child);
          break;
        }

        // ── Sync action (pure read, no pi needed) ───────────────────
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
              message: `Unknown type: ${/** @type {{type: string}} */ (msg).type}`,
            }),
          );
      }
    });

    ws.on("close", () => {
      log(`🔌 Chrome extension disconnected`);
      killActiveChild();
    });

    ws.on("error", (/** @type {Error} */ err) => {
      log(`⚠️  WebSocket error: ${err.message}`);
    });
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

startBridge(PORT);
