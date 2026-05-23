#!/usr/bin/env node
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
import { readFileSync, readdirSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const PORT = parseInt(process.argv[process.argv.indexOf("--port") + 1] || "9876", 10) || 9876;

// ---------------------------------------------------------------------------
// Helper: tiny pi-kb store clone for sync (filesystem reads only)
// ---------------------------------------------------------------------------

const KB_ROOT = join(homedir(), ".pi", "agent", "kb");

function getWorkspaceRoot(name) {
  if (!name || name === "default") return KB_ROOT;
  return join(KB_ROOT, "workspaces", name);
}

function readRegistry(workspace) {
  const p = join(getWorkspaceRoot(workspace), "registry.json");
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}

function readIndex(workspace) {
  const p = join(getWorkspaceRoot(workspace), "wiki", "index.md");
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf-8");
}

function listSummaries(workspace) {
  const dir = join(getWorkspaceRoot(workspace), "wiki", "summaries");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
}

function readSummary(name, workspace) {
  const p = join(getWorkspaceRoot(workspace), "wiki", "summaries", `${name}.md`);
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf-8");
}

function listConcepts(workspace) {
  const dir = join(getWorkspaceRoot(workspace), "wiki", "concepts");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
}

function readConcept(slug, workspace) {
  const p = join(getWorkspaceRoot(workspace), "wiki", "concepts", `${slug}.md`);
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, "utf-8");
  let sources = [];
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
          if (m) sources = m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
        } else if (t.startsWith("updated:")) {
          updated = t.slice("updated:".length).trim().replace(/^["']|["']$/g, "");
        }
      }
    }
  }
  return { slug, sources, updated, body };
}

function listWorkspaces() {
  const dir = join(KB_ROOT, "workspaces");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function buildSyncData(workspace) {
  const reg = readRegistry(workspace);
  const summaries = {};
  for (const name of listSummaries(workspace)) {
    const full = readSummary(name, workspace);
    if (!full) continue;
    let source = "", added = "", content = full;
    if (full.startsWith("---")) {
      const end = full.indexOf("---", 3);
      if (end !== -1) {
        const fm = full.slice(3, end);
        content = full.slice(end + 3).trimStart();
        for (const line of fm.split("\n")) {
          const t = line.trim();
          if (t.startsWith("source:")) source = t.slice("source:".length).trim().replace(/^["']|["']$/g, "");
          else if (t.startsWith("added:")) added = t.slice("added:".length).trim().replace(/^["']|["']$/g, "");
        }
      }
    }
    summaries[name] = { content, source, added };
  }
  const concepts = {};
  for (const slug of listConcepts(workspace)) {
    const c = readConcept(slug, workspace);
    if (!c) continue;
    concepts[slug] = { content: c.body, sources: c.sources, updated: c.updated || "" };
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

/** Normalize a URL for dedup comparison: strip trailing slash (unless root),
 *  fragment, and default ports (443 for https, 80 for http). */
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

/** Check if a URL is already in the registry by originalPath. */
function isUrlInRegistry(url, workspace) {
  const normalized = normalizeUrl(url);
  const reg = readRegistry(workspace);
  return Object.values(reg).some(
    (e) => normalizeUrl(e.originalPath) === normalized,
  );
}

/** Find a registry entry by URL. Returns null if not found. */
function findByUrl(url, workspace) {
  const normalized = normalizeUrl(url);
  const reg = readRegistry(workspace);
  return (
    Object.values(reg).find(
      (e) => normalizeUrl(e.originalPath) === normalized,
    ) ?? null
  );
}

/** Quick check: does a string look like an HTTP URL? */
function isUrl(str) {
  return /^https?:\/\//i.test(str);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeStringify(obj) {
  try { return JSON.stringify(obj); } catch { return "{}"; }
}

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${ts}] ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Child pi spawner
// ---------------------------------------------------------------------------

function spawnPiRpc(ws, promptText, command) {
  log(`spawn: pi --mode rpc --no-session → ${command}: ${promptText.slice(0, 80)}...`);

  const child = spawn("pi", ["--mode", "rpc", "--no-session"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.on("error", (err) => {
    const msg = err.code === "ENOENT"
      ? "pi binary not found in PATH"
      : `Failed to spawn pi: ${err.message}`;
    log(`error: ${msg}`);
    ws.send(safeStringify({ type: "error", message: msg }));
  });

  child.on("exit", (code, signal) => {
    log(`child exit: ${command} (code=${code}, signal=${signal})`);
  });

  // stdout → forward as events
  let buffer = "";
  child.stdout.on("data", (chunk) => {
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
          try { child.stdin.end(); } catch {}
        }
      } catch {
        ws.send(safeStringify({ type: "stderr", text: trimmed }));
      }
    }
  });

  // stderr → forward
  child.stderr.on("data", (chunk) => {
    ws.send(safeStringify({ type: "stderr", text: chunk.toString("utf-8") }));
  });

  // Send prompt
  child.stdin.write(safeStringify({ type: "prompt", message: promptText }) + "\n");

  return child;
}

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------

function startBridge(port) {
  const wss = new WebSocketServer({ host: "127.0.0.1", port });

  wss.on("listening", () => {
    log(`✅ Bridge listening on ws://127.0.0.1:${port}`);
    log(`   Chrome extension can now connect. Press Ctrl+C to stop.`);
  });

  wss.on("error", (err) => {
    log(`❌ Server error: ${err.message}`);
    if (err.code === "EADDRINUSE") {
      log(`   Port ${port} is already in use. Is another bridge running?`);
    }
    process.exit(1);
  });

  wss.on("connection", (ws) => {
    log(`🔗 Chrome extension connected`);
    let activeChild = null;

    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch {
        ws.send(safeStringify({ type: "error", message: "Invalid JSON" }));
        return;
      }

      const workspace = (msg.workspace && msg.workspace !== "default") ? msg.workspace : undefined;

      switch (msg.type) {
        case "add": {
          if (!msg.url) {
            ws.send(safeStringify({ type: "error", message: "Missing 'url' field" }));
            return;
          }

          // Dedup check: if it's a URL, scan the registry before spawning pi.
          // Avoids a hang where pi short-circuits with no agent turn → no agent_end.
          if (isUrl(msg.url) && isUrlInRegistry(msg.url, workspace)) {
            const entry = findByUrl(msg.url, workspace);
            log(`add: already in KB: ${msg.url} (added ${entry?.addedAt?.slice(0, 10) || "?"})`);
            ws.send(safeStringify({
              type: "event",
              data: {
                type: "message_update",
                assistantMessageEvent: {
                  type: "text_delta",
                  delta: `Already in KB: ${msg.url} (added ${entry?.addedAt?.slice(0, 10) || "previously"})`,
                },
              },
            }));
            ws.send(safeStringify({ type: "done", command: "add" }));
            return;
          }

          if (activeChild) { activeChild.kill(); activeChild = null; }
          const prompt = workspace
            ? `/kb-add -w ${workspace} ${msg.url}`
            : `/kb-add ${msg.url}`;
          activeChild = spawnPiRpc(ws, prompt, "add");
          break;
        }

        case "query": {
          if (!msg.text) {
            ws.send(safeStringify({ type: "error", message: "Missing 'text' field" }));
            return;
          }
          if (activeChild) { activeChild.kill(); activeChild = null; }
          const prompt = workspace
            ? `/kb-query -w ${workspace} ${msg.text}`
            : `/kb-query ${msg.text}`;
          activeChild = spawnPiRpc(ws, prompt, "query");
          break;
        }

        case "sync": {
          try {
            const data = buildSyncData(workspace);
            ws.send(safeStringify({ type: "sync_result", data }));
            log(`sync: ${Object.keys(data.registry).length} docs, ${Object.keys(data.concepts).length} concepts`);
          } catch (err) {
            ws.send(safeStringify({ type: "error", message: `Sync failed: ${err.message}` }));
            log(`sync error: ${err.message}`);
          }
          break;
        }

        default:
          ws.send(safeStringify({ type: "error", message: `Unknown type: ${msg.type}` }));
      }
    });

    ws.on("close", () => {
      log(`🔌 Chrome extension disconnected`);
      if (activeChild) { activeChild.kill(); activeChild = null; }
    });

    ws.on("error", (err) => {
      log(`⚠️  WebSocket error: ${err.message}`);
    });
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

startBridge(PORT);
