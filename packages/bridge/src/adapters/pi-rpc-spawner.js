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
 * Spawn a child `pi` process in RPC mode.
 *
 * Wires stdout (JSON lines → onEvent / onDone) and stderr (→ onStderr)
 * to the provided callbacks. The caller is responsible for sending
 * responses over the transport (e.g. WebSocket).
 *
 * @param {string} promptText - The pi prompt to execute (e.g. "/kb-add https://...")
 * @param {'add'|'query'|'repair'} command - Operation type (used for logging)
 * @param {SpawnCallbacks} callbacks - Output wiring
 * @returns {import('node:child_process').ChildProcess} The spawned child process
 */
export function spawnPi(promptText, command, callbacks) {
  log(`spawn: pi --mode rpc --no-session → ${command}: ${promptText.slice(0, 80)}...`);

  const child = spawn("pi", ["--mode", "rpc", "--no-session", "--no-builtin-tools"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.on("error", (/** @type {NodeJS.ErrnoException} */ err) => {
    const msg =
      err.code === "ENOENT" ? "pi binary not found in PATH" : `Failed to spawn pi: ${err.message}`;
    log(`error: ${msg}`);
    callbacks.onError(msg);
  });

  child.on("exit", (code, signal) => {
    log(`child exit: ${command} (code=${code}, signal=${signal})`);
  });

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
        callbacks.onEvent(event);

        if (event.type === "agent_end") {
          callbacks.onDone();
          try {
            child.stdin?.end();
          } catch {
            /* ignore */
          }
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
