// @ts-check

// ---------------------------------------------------------------------------
// Handler: query
//
// Processes 'query' messages from the extension. Spawns a pi child
// process for `/kb-query` and wires stdout/stderr back to the WebSocket.
// ---------------------------------------------------------------------------

import { safeStringify } from "../lib/utils.js";

/**
 * Handle a query request.
 *
 * @param {object} opts
 * @param {import('ws').WebSocket} opts.ws       - Connected extension client
 * @param {string} opts.text                     - Natural-language query
 * @param {string|undefined} opts.workspace      - Target workspace (undefined = default)
 * @param {import('../adapters/pi-rpc-spawner.js').spawnPi} opts.spawn - pi process spawner
 * @returns {import('node:child_process').ChildProcess} The spawned child
 */
export function handleQuery({ ws, text, workspace, spawn }) {
  const prompt = workspace
    ? `/kb-query -w ${workspace} ${text}`
    : `/kb-query ${text}`;

  return spawn(prompt, "query", {
    onEvent: (event) => {
      ws.send(safeStringify({ type: "event", data: event }));
    },
    onDone: () => {
      ws.send(safeStringify({ type: "done", command: "query" }));
    },
    onStderr: (text) => {
      ws.send(safeStringify({ type: "stderr", text }));
    },
    onError: (message) => {
      ws.send(safeStringify({ type: "error", message }));
    },
  });
}
