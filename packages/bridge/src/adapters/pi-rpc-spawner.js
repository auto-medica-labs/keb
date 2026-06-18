// @ts-check

// ---------------------------------------------------------------------------
// Adapter: pi RPC spawner
//
// Spawns child `pi` processes in RPC mode for LLM-backed operations
// (add, query, repair). stdout is parsed as JSON lines and forwarded
// via callbacks; stderr is forwarded as plain text.
// ---------------------------------------------------------------------------

import { spawn } from "node:child_process";
import { safeStringify, log } from "../lib/utils.js";

// ---------------------------------------------------------------------------
// Callback types for wiring to transport (WebSocket, etc.)
// ---------------------------------------------------------------------------

/**
 * Fired for every parsed JSON event from pi's stdout.
 * @callback OnEvent
 * @param {object} event - Parsed event object
 * @returns {void}
 */

/**
 * Fired when pi emits an agent_end event (compilation finished).
 * @callback OnDone
 * @returns {void}
 */

/**
 * Fired for unparseable stdout lines and stderr output.
 * @callback OnStderr
 * @param {string} text - Raw text
 * @returns {void}
 */

/**
 * Fired when the child process fails to spawn (e.g. pi not in PATH).
 * @callback OnError
 * @param {string} message - Human-readable error
 * @returns {void}
 */

/**
 * @typedef {Object} SpawnCallbacks
 * @property {OnEvent} onEvent
 * @property {OnDone} onDone
 * @property {OnStderr} onStderr
 * @property {OnError} onError
 */

// ---------------------------------------------------------------------------
// Spawner
// ---------------------------------------------------------------------------

/**
 * Agent event types that indicate the LLM turn has started.
 * Once any of these arrive, the operation is considered live.
 * @type {Set<string>}
 */
const AGENT_EVENT_TYPES = new Set([
  "agent_start",
  "turn_start",
  "message_start",
  "message_update",
  "tool_execution_start",
  "tool_execution_end",
  "agent_end",
]);

/**
 * Spawn a child `pi` process in RPC mode.
 *
 * Wires stdout (JSON lines → onEvent / onDone) and stderr (→ onStderr)
 * to the provided callbacks. The caller is responsible for sending
 * responses over the transport (e.g. WebSocket).
 *
 * Detects pre-agent failures: if an error-level notification arrives
 * before any agent event, the operation is treated as failed and the
 * child process is killed. This catches cases like URL fetch failures
 * where pi never starts an agent turn.
 *
 * @param {string} promptText - The pi prompt to execute (e.g. "/keb:add https://...")
 * @param {'add'|'query'|'repair'} command - Operation type (used for logging)
 * @param {SpawnCallbacks & { operationId?: string }} callbacks - Output wiring + optional operationId
 * @returns {import('node:child_process').ChildProcess} The spawned child process
 */
export function spawnPi(promptText, command, callbacks) {
  const opTag = callbacks.operationId ? ` [${callbacks.operationId}]` : "";
  const args = [
    "--mode",
    "rpc",
    "--no-session",
    "--no-builtin-tools",
    "--system-prompt",
    "",
    "--no-context-files",
    "--no-skills",
  ];
  log(`spawn: pi ${args.join(" ")} → ${command}${opTag}: ${promptText.slice(0, 80)}...`);

  const child = spawn("pi", args, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let settled = false;
  let agentStarted = false;

  /** Mark the operation settled (error or done) — guards against double-firing. */
  function settle() {
    if (settled) return;
    settled = true;
    try {
      child.stdin?.end();
    } catch {
      /* ignore */
    }
  }

  child.on("error", (/** @type {NodeJS.ErrnoException} */ err) => {
    settle();
    const msg =
      err.code === "ENOENT" ? "pi binary not found in PATH" : `Failed to spawn pi: ${err.message}`;
    log(`error: ${msg}`);
    callbacks.onError(msg);
  });

  child.on("exit", (code, signal) => {
    log(`child exit: ${command}${opTag} (code=${code}, signal=${signal})`);
    // If the child was killed externally (e.g. SIGTERM), notify via onDone
    // so the client can clean up. Only fire if not already settled.
    if (signal && !settled) {
      settle();
      callbacks.onDone();
    }
  });

  /**
   * Kill the child and call onError. Idempotent via settle().
   * @param {string} message - Human-readable failure reason
   */
  function fail(message) {
    log(`spawn fail: ${command}${opTag} — ${message}`);
    settle();
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    callbacks.onError(message);
  }

  // stdout → parse JSON lines, forward events
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

        // ── Pre-agent error detection ──────────────────────
        // ctx.ui.notify(…, "error") emits an extension_ui_request with
        // method "notify" and notifyType "error". If this arrives before
        // any agent event, the operation failed before the LLM turn
        // started (e.g. URL could not be fetched). Kill the child and
        // signal the error to the client.
        if (
          !agentStarted &&
          !settled &&
          event.type === "extension_ui_request" &&
          event.method === "notify" &&
          event.notifyType === "error"
        ) {
          fail(event.message || "Operation failed before agent started");
          return;
        }

        // Track whether an agent turn has started
        if (AGENT_EVENT_TYPES.has(event.type)) {
          agentStarted = true;
        }

        callbacks.onEvent(event);

        if (event.type === "agent_end") {
          settle();
          callbacks.onDone();
        }
      } catch {
        callbacks.onStderr(trimmed);
      }
    }
  });

  // stderr → forward as text
  child.stderr?.on("data", (/** @type {Buffer} */ chunk) => {
    callbacks.onStderr(chunk.toString("utf-8"));
  });

  // Send the prompt to start pi processing
  child.stdin?.write(safeStringify({ type: "prompt", message: promptText }) + "\n");

  return child;
}
