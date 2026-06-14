// @ts-check

// ---------------------------------------------------------------------------
// Handler: repair
//
// Processes 'repair' messages from the extension. Counts pending
// (compiled === false) entries and spawns pi to finish them.
// ---------------------------------------------------------------------------

import { safeStringify, log } from "../lib/utils.js";

/**
 * Handle a 'repair' request: count pending (compiled === false) entries.
 * Only spawn pi if there is at least one pending document — otherwise
 * a short-circuit "All compiled" message is sent.
 *
 * @param {object} opts
 * @param {import('ws').WebSocket} opts.ws       - Connected extension client
 * @param {string} opts.operationId              - Client-assigned operation ID
 * @param {string|undefined} opts.workspace      - Target workspace
 * @param {import('../ports/kb-store.js').KbStore} opts.kbStore - KB storage adapter
 * @param {import('../adapters/pi-rpc-spawner.js').spawnPi} opts.spawn - pi process spawner
 * @returns {import('node:child_process').ChildProcess|null} Spawned child, or null if short-circuited
 */
export function handleRepair({ ws, operationId, workspace, kbStore, spawn }) {
  const reg = kbStore.readRegistry(workspace);
  const pendingCount = Object.values(reg).filter((e) => e.compiled === false).length;

  if (pendingCount === 0) {
    ws.send(
      safeStringify({
        type: "event",
        operationId,
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
    ws.send(safeStringify({ type: "done", operationId, command: "repair" }));
    return null;
  }

  log(`repair: ${pendingCount} pending doc(s)${workspace ? ` in ${workspace}` : ""}`);

  const prompt = workspace ? `/keb:repair -w ${workspace}` : `/keb:repair`;

  return spawn(prompt, "repair", {
    operationId,
    onEvent: (event) => {
      ws.send(safeStringify({ type: "event", operationId, data: event }));
    },
    onDone: () => {
      ws.send(safeStringify({ type: "done", operationId, command: "repair" }));
    },
    onStderr: (text) => {
      ws.send(safeStringify({ type: "stderr", operationId, text }));
    },
    onError: (message) => {
      ws.send(safeStringify({ type: "error", operationId, message }));
    },
  });
}
