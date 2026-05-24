#!/usr/bin/env node
// @ts-check

/**
 * bridge-server.js — Standalone WebSocket bridge for chrome-kb.
 *
 * Runs independently of pi's TUI. Connects the Chrome extension to pi-kb
 * via WebSocket on ws://127.0.0.1:9876. Spawns child pi processes for
 * add/query operations, and reads the filesystem directly for sync.
 *
 * Usage:
 *   node bridge-server.js                # start the server
 *   node bridge-server.js --port 9876    # custom port
 *
 * The server runs until Ctrl+C. No pi TUI session needed.
 */

import { WebSocketServer } from "ws";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Type definitions (JSDoc)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} RegistryEntry
 * @property {string} originalPath - Normalized source URL
 * @property {string} [addedAt]    - ISO timestamp when the entry was added
 * @property {string} [docName]    - Slug of the generated summary doc
 * @property {string} [hash]       - Content hash for change detection
 */

/**
 * @typedef {Object<string, RegistryEntry>} Registry
 */

/**
 * @typedef {Object} ConceptPage
 * @property {string} slug      - URL-friendly concept identifier
 * @property {string[]} sources - List of source filenames this concept was derived from
 * @property {string} updated   - ISO timestamp of last update
 * @property {string} body      - Markdown body (frontmatter stripped)
 */

/**
 * @typedef {Object} SummaryEntry
 * @property {string} content - Markdown summary content
 * @property {string} source  - Original source URL or file path
 * @property {string} added   - ISO timestamp when the summary was created
 */

/**
 * @typedef {Object} SyncData
 * @property {Registry} registry   - All registered documents
 * @property {string} index        - Raw index.md content
 * @property {Object<string, SummaryEntry>} summaries - Doc name → summary
 * @property {Object<string, ConceptPage>} concepts   - Slug → concept page
 * @property {string[]} workspaces - Available workspace names
 */

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
 * @typedef {BridgeAddMessage|BridgeQueryMessage|BridgeSyncMessage} BridgeMessage
 */

/**
 * @typedef {Object} BridgeEventResponse
 * @property {'event'} type
 * @property {import('ws').RawData} data
 */

/**
 * @typedef {Object} BridgeSyncResultResponse
 * @property {'sync_result'} type
 * @property {SyncData} data
 */

/**
 * @typedef {Object} BridgeDoneResponse
 * @property {'done'} type
 * @property {string} command
 */

/**
 * @typedef {Object} BridgeErrorResponse
 * @property {'error'} type
 * @property {string} message
 */

/**
 * @typedef {Object} BridgeStderrResponse
 * @property {'stderr'} type
 * @property {string} text
 */

/**
 * @typedef {BridgeEventResponse|BridgeSyncResultResponse|BridgeDoneResponse|BridgeErrorResponse|BridgeStderrResponse} BridgeResponse
 */

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** @type {number} */
const PORT = parseInt(process.argv[process.argv.indexOf("--port") + 1] || "9876", 10) || 9876;

// ---------------------------------------------------------------------------
// Helper: tiny pi-kb store clone for sync (filesystem reads only)
// ---------------------------------------------------------------------------

/** @type {string} */
const KB_ROOT = join(homedir(), ".pi", "agent", "kb");

/**
 * Resolve the filesystem root for a given workspace.
 * @param {string|undefined} name - Workspace name (undefined or "default" → default)
 * @returns {string} Absolute path to the workspace directory
 */
function getWorkspaceRoot(name) {
  if (!name || name === "default") return KB_ROOT;
  return join(KB_ROOT, "workspaces", name);
}

/**
 * Read the registry.json for a workspace.
 * @param {string} [workspace] - Workspace name
 * @returns {Registry} Parsed registry object (empty if missing)
 */
function readRegistry(workspace) {
  const p = join(getWorkspaceRoot(workspace), "registry.json");
  if (!existsSync(p)) return /** @type {Registry} */ ({});
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return /** @type {Registry} */ ({});
  }
}

/**
 * Read the wiki index.md for a workspace.
 * @param {string} [workspace] - Workspace name
 * @returns {string} Raw markdown content (empty string if missing)
 */
function readIndex(workspace) {
  const p = join(getWorkspaceRoot(workspace), "wiki", "index.md");
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf-8");
}

/**
 * List all summary document names in a workspace.
 * @param {string} [workspace] - Workspace name
 * @returns {string[]} Array of document name slugs (without .md extension)
 */
function listSummaries(workspace) {
  const dir = join(getWorkspaceRoot(workspace), "wiki", "summaries");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

/**
 * Read a single summary document.
 * @param {string} name - Document name slug
 * @param {string} [workspace] - Workspace name
 * @returns {string|null} Raw markdown content (null if missing)
 */
function readSummary(name, workspace) {
  const p = join(getWorkspaceRoot(workspace), "wiki", "summaries", `${name}.md`);
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf-8");
}

/**
 * List all concept slugs in a workspace.
 * @param {string} [workspace] - Workspace name
 * @returns {string[]} Array of concept slugs (without .md extension)
 */
function listConcepts(workspace) {
  const dir = join(getWorkspaceRoot(workspace), "wiki", "concepts");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

/**
 * Read a single concept page, parsing its YAML frontmatter.
 * @param {string} slug - Concept slug
 * @param {string} [workspace] - Workspace name
 * @returns {ConceptPage|null} Parsed concept page (null if missing)
 */
function readConcept(slug, workspace) {
  const p = join(getWorkspaceRoot(workspace), "wiki", "concepts", `${slug}.md`);
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, "utf-8");

  /** @type {string[]} */
  let sources = [];
  /** @type {string} */
  let updated = "";
  let body = raw;

  if (raw.startsWith("---")) {
    const end = raw.indexOf("---", 3);
    if (end !== -1) {
      const fm = raw.slice(3, end);
      body = raw.slice(end + 3).trimStart();
      for (const line of fm.split("\n")) {
        const t = line.trim();
        if (t.startsWith("sources:")) {
          const m = t.match(/sources:\s*\[(.*)\]/);
          if (m)
            sources = m[1]
              .split(",")
              .map((s) => s.trim().replace(/^["']|["']$/g, ""))
              .filter(Boolean);
        } else if (t.startsWith("updated:")) {
          updated = t
            .slice("updated:".length)
            .trim()
            .replace(/^["']|["']$/g, "");
        }
      }
    }
  }
  return { slug, sources, updated, body };
}

/**
 * List all available workspace names.
 * @returns {string[]} Array of workspace directory names
 */
function listWorkspaces() {
  const dir = join(KB_ROOT, "workspaces");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

/**
 * Build the full sync payload for sending to the extension.
 * Reads registry, index, all summaries, and all concepts from disk.
 * @param {string} [workspace] - Workspace name
 * @returns {SyncData} Complete KB state snapshot
 */
function buildSyncData(workspace) {
  const reg = readRegistry(workspace);

  /** @type {Object<string, SummaryEntry>} */
  const summaries = {};
  for (const name of listSummaries(workspace)) {
    const full = readSummary(name, workspace);
    if (!full) continue;
    let source = "",
      added = "",
      content = full;
    if (full.startsWith("---")) {
      const end = full.indexOf("---", 3);
      if (end !== -1) {
        const fm = full.slice(3, end);
        content = full.slice(end + 3).trimStart();
        for (const line of fm.split("\n")) {
          const t = line.trim();
          if (t.startsWith("source:"))
            source = t
              .slice("source:".length)
              .trim()
              .replace(/^["']|["']$/g, "");
          else if (t.startsWith("added:"))
            added = t
              .slice("added:".length)
              .trim()
              .replace(/^["']|["']$/g, "");
        }
      }
    }
    summaries[name] = { content, source, added };
  }

  /** @type {Object<string, ConceptPage>} */
  const concepts = {};
  for (const slug of listConcepts(workspace)) {
    const c = readConcept(slug, workspace);
    if (!c) continue;
    concepts[slug] = { slug: c.slug, sources: c.sources, updated: c.updated || "", body: c.body };
  }

  return {
    registry: reg,
    index: readIndex(workspace),
    summaries,
    concepts,
    workspaces: listWorkspaces(),
  };
}

// ---------------------------------------------------------------------------
// URL normalization & registry lookup (mirrors extensions/kb/store.ts)
// ---------------------------------------------------------------------------

/**
 * Normalize a URL for dedup comparison.
 * Strips trailing slash (unless root), fragment, and default ports (443/80).
 * @param {string} url - Raw URL string
 * @returns {string} Normalized URL
 */
function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    if (
      (parsed.protocol === "https:" && parsed.port === "443") ||
      (parsed.protocol === "http:" && parsed.port === "80")
    ) {
      parsed.port = "";
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Check if a URL is already in the registry.
 * Compares normalized forms of originalPath.
 * @param {string} url - URL to check
 * @param {string} [workspace] - Workspace name
 * @returns {boolean} True if the URL is already registered
 */
function isUrlInRegistry(url, workspace) {
  const normalized = normalizeUrl(url);
  const reg = readRegistry(workspace);
  return Object.values(reg).some((e) => normalizeUrl(e.originalPath) === normalized);
}

/**
 * Find a registry entry by URL.
 * @param {string} url - URL to look up
 * @param {string} [workspace] - Workspace name
 * @returns {RegistryEntry|null} Matching entry or null
 */
function findByUrl(url, workspace) {
  const normalized = normalizeUrl(url);
  const reg = readRegistry(workspace);
  return Object.values(reg).find((e) => normalizeUrl(e.originalPath) === normalized) ?? null;
}

/**
 * Quick check: does a string look like an HTTP URL?
 * @param {string} str - String to test
 * @returns {boolean}
 */
function isUrl(str) {
  return /^https?:\/\//i.test(str);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely JSON-stringify an object, returning "{}" on circular/error.
 * @param {unknown} obj - Value to stringify
 * @returns {string} JSON string (never throws)
 */
function safeStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return "{}";
  }
}

/**
 * Write a timestamped log line to stdout.
 * @param {string} msg - Log message
 * @returns {void}
 */
function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${ts}] ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Child pi spawner
// ---------------------------------------------------------------------------

/**
 * Spawn a child `pi` process in RPC mode for add/query operations.
 * Forwards stdout (JSON events) and stderr to the WebSocket client.
 * @param {import('ws').WebSocket} ws - Connected WebSocket client
 * @param {string} promptText - The pi command to execute (e.g. "/kb-add https://...")
 * @param {'add'|'query'} command - Operation type (used for done events and logging)
 * @returns {import('node:child_process').ChildProcess} The spawned child process
 */
function spawnPiRpc(ws, promptText, command) {
  log(`spawn: pi --mode rpc --no-session → ${command}: ${promptText.slice(0, 80)}...`);

  const child = spawn("pi", ["--mode", "rpc", "--no-session", "--no-builtin-tools"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.on("error", (/** @type {NodeJS.ErrnoException} */ err) => {
    const msg =
      err.code === "ENOENT" ? "pi binary not found in PATH" : `Failed to spawn pi: ${err.message}`;
    log(`error: ${msg}`);
    ws.send(safeStringify({ type: "error", message: msg }));
  });

  child.on("exit", (code, signal) => {
    log(`child exit: ${command} (code=${code}, signal=${signal})`);
  });

  // stdout → forward as events
  let buffer = "";
  child.stdout?.on("data", (/** @type {Buffer} */ chunk) => {
    buffer += chunk.toString("utf-8");
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed);
        ws.send(safeStringify({ type: "event", data: event }));

        if (event.type === "agent_end") {
          ws.send(safeStringify({ type: "done", command }));
          try {
            child.stdin?.end();
          } catch {
            /* ignore */
          }
        }
      } catch {
        ws.send(safeStringify({ type: "stderr", text: trimmed }));
      }
    }
  });

  // stderr → forward
  child.stderr?.on("data", (/** @type {Buffer} */ chunk) => {
    ws.send(safeStringify({ type: "stderr", text: chunk.toString("utf-8") }));
  });

  // Send prompt
  child.stdin?.write(safeStringify({ type: "prompt", message: promptText }) + "\n");

  return child;
}

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------

/**
 * Start the WebSocket bridge server.
 * Listens on ws://127.0.0.1:{port} and handles add/query/sync messages
 * from the Chrome extension by spawning child pi processes or reading
 * the KB filesystem directly.
 * @param {number} port - TCP port to listen on
 * @returns {void}
 */
function startBridge(port) {
  const wss = new WebSocketServer({ host: "127.0.0.1", port });

  /** @type {Set<import('node:child_process').ChildProcess>} */
  const childProcesses = new Set();

  let shuttingDown = false;

  /**
   * Gracefully shut down the bridge: close all connections, kill children, exit.
   * @param {string} signal - Signal name for logging
   */
  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`🛑 Received ${signal} — shutting down gracefully...`);

    // Kill all active child processes
    for (const child of childProcesses) {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
    childProcesses.clear();

    // Forcibly terminate all connected WebSocket clients
    for (const client of wss.clients) {
      client.terminate();
    }

    // Close the WebSocket server
    wss.close(() => {
      log(`✅ Bridge stopped.`);
      process.exit(0);
    });

    // Force exit after 5s if graceful shutdown hangs
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
        case "add": {
          if (!msg.url) {
            ws.send(safeStringify({ type: "error", message: "Missing 'url' field" }));
            return;
          }

          // Dedup check: if it's a URL, scan the registry before spawning pi.
          // Avoids a hang where pi short-circuits with no agent turn → no agent_end.
          // BUT: if the entry exists but was never fully compiled (interrupted
          // compilation), we must pass through to pi so /kb-add can re-compile it.
          if (isUrl(msg.url) && isUrlInRegistry(msg.url, workspace)) {
            const entry = findByUrl(msg.url, workspace);
            // compiled === false means the LLM session was interrupted before
            // finishing all wiki artifacts. Pass through so pi can re-compile.
            if (entry && entry.compiled !== false) {
              log(`add: already in KB: ${msg.url} (added ${entry?.addedAt?.slice(0, 10) || "?"})`);
              ws.send(
                safeStringify({
                  type: "event",
                  data: {
                    type: "message_update",
                    assistantMessageEvent: {
                      type: "text_delta",
                      delta: `Already in KB: ${msg.url} (added ${entry?.addedAt?.slice(0, 10) || "previously"})`,
                    },
                  },
                }),
              );
              ws.send(safeStringify({ type: "done", command: "add" }));
              return;
            }
            if (entry) {
              log(`add: re-compiling interrupted entry: ${msg.url} (added ${entry.addedAt.slice(0, 10)})`);
            }
          }

          if (activeChild) {
            activeChild.kill();
            childProcesses.delete(activeChild);
            activeChild = null;
          }
          const prompt = workspace ? `/kb-add -w ${workspace} ${msg.url}` : `/kb-add ${msg.url}`;
          activeChild = spawnPiRpc(ws, prompt, "add");
          childProcesses.add(activeChild);
          break;
        }

        case "query": {
          if (!msg.text) {
            ws.send(safeStringify({ type: "error", message: "Missing 'text' field" }));
            return;
          }
          if (activeChild) {
            activeChild.kill();
            childProcesses.delete(activeChild);
            activeChild = null;
          }
          const prompt = workspace
            ? `/kb-query -w ${workspace} ${msg.text}`
            : `/kb-query ${msg.text}`;
          activeChild = spawnPiRpc(ws, prompt, "query");
          childProcesses.add(activeChild);
          break;
        }

        case "repair": {
          // Safety guard: only spawn pi if there are actually pending entries.
          // pi's /kb-repair short-circuits with no LLM turn when nothing is
          // pending, which would cause the bridge to hang (no agent_end).
          const reg = readRegistry(workspace);
          const pendingCount = Object.values(reg).filter((e) => e.compiled === false).length;
          if (pendingCount === 0) {
            ws.send(
              safeStringify({
                type: "event",
                data: {
                  type: "message_update",
                  assistantMessageEvent: {
                    type: "text_delta",
                    delta: workspace
                      ? `All documents are compiled in workspace "${workspace}". Nothing to repair.`
                      : "All documents are compiled. Nothing to repair.",
                  },
                },
              }),
            );
            ws.send(safeStringify({ type: "done", command: "repair" }));
            break;
          }

          if (activeChild) {
            activeChild.kill();
            childProcesses.delete(activeChild);
            activeChild = null;
          }
          const repairPrompt = workspace
            ? `/kb-repair -w ${workspace}`
            : `/kb-repair`;
          log(`repair: ${pendingCount} pending doc(s)${workspace ? ` in ${workspace}` : ""}`);
          activeChild = spawnPiRpc(ws, repairPrompt, "repair");
          childProcesses.add(activeChild);
          break;
        }

        case "sync": {
          try {
            const data = buildSyncData(workspace);
            ws.send(safeStringify({ type: "sync_result", data }));
            log(
              `sync: ${Object.keys(data.registry).length} docs, ${Object.keys(data.concepts).length} concepts`,
            );
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
              message: `Unknown type: ${/** @type {{type: string}} */ (msg)}.type`,
            }),
          );
      }
    });

    ws.on("close", () => {
      log(`🔌 Chrome extension disconnected`);
      if (activeChild) {
        activeChild.kill();
        childProcesses.delete(activeChild);
        activeChild = null;
      }
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
