// @ts-check

// ---------------------------------------------------------------------------
// Handler: sync
//
// Processes 'sync' messages from the extension. Reads the entire KB
// state from disk (no pi process needed) and returns it as a snapshot.
// ---------------------------------------------------------------------------

import { safeStringify, log } from "../lib/utils.js";

/**
 * Handle a sync request: read registry, index, summaries, and concepts
 * from the filesystem and send them back to the extension.
 *
 * @param {object} opts
 * @param {import('ws').WebSocket} opts.ws       - Connected extension client
 * @param {string|undefined} opts.workspace       - Target workspace
 * @param {import('../ports/kb-store.js').KbStore} opts.kbStore - KB storage adapter
 * @returns {void}
 */
export function handleSync({ ws, workspace, kbStore }) {
  const data = kbStore.buildSyncData(workspace);
  ws.send(safeStringify({ type: "sync_result", data }));
  log(
    `sync: ${Object.keys(data.registry).length} docs, ${Object.keys(data.concepts).length} concepts`,
  );
}
