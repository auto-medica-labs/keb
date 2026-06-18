// @ts-check

// ---------------------------------------------------------------------------
// Handler: clear
//
// Processes 'clear' messages from the extension. Clears all wiki content
// (source/, wiki/, registry) from a workspace while keeping the workspace
// directory. Sends back an empty sync_result so the extension resets its
// local state. No pi process needed — pure filesystem operation.
// ---------------------------------------------------------------------------

import { safeStringify, log } from "../lib/utils.js";

/**
 * Handle a clear request: delete all workspace content then send an empty
 * sync snapshot back to the extension.
 *
 * @param {object} opts
 * @param {import('ws').WebSocket} opts.ws       - Connected extension client
 * @param {string|undefined} opts.workspace       - Target workspace
 * @param {import('../ports/keb-store.js').KebStore} opts.kebStore - Keb storage adapter
 * @returns {void}
 */
export function handleClear({ ws, workspace, kebStore }) {
  const clearedPath = kebStore.clearWorkspace(workspace);
  log(`clear: ${clearedPath}`);

  // Send back an empty sync snapshot so the extension resets its local state
  const data = kebStore.buildSyncData(workspace);
  ws.send(safeStringify({ type: "sync_result", data }));
}
