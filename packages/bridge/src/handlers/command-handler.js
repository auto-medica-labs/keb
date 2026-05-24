// @ts-check

// ---------------------------------------------------------------------------
// Handler: command (add / repair)
//
// Processes 'add' and 'repair' messages from the extension. Performs
// registry dedup checks before spawning pi for the actual LLM work.
// ---------------------------------------------------------------------------

import { safeStringify, log, isUrl, findByUrl } from "../lib/utils.js";

// ---------------------------------------------------------------------------
// Public entry-point
// ---------------------------------------------------------------------------

/**
 * Route a command message to the appropriate sub-handler.
 *
 * @param {object} opts
 * @param {import('ws').WebSocket} opts.ws       - Connected extension client
 * @param {'add'|'repair'} opts.command           - Which command to execute
 * @param {string} [opts.url]                     - URL for 'add' commands
 * @param {string|undefined} opts.workspace       - Target workspace
 * @param {import('../ports/kb-store.js').KbStore} opts.kbStore - KB storage adapter
 * @param {import('../adapters/pi-rpc-spawner.js').spawnPi} opts.spawn - pi process spawner
 * @returns {import('node:child_process').ChildProcess|null} Spawned child, or null if short-circuited
 */
export function handleCommand({ ws, command, url, workspace, kbStore, spawn }) {
  if (command === "add") {
    return handleAdd({ ws, url: /** @type {string} */ (url), workspace, kbStore, spawn });
  }
  if (command === "repair") {
    return handleRepair({ ws, workspace, kbStore, spawn });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Add
// ---------------------------------------------------------------------------

/**
 * Handle an 'add' request: dedup-check the registry, then spawn pi for /kb-add.
 *
 * If the URL is already registered and fully compiled, a short-circuit
 * "Already in KB" message is sent instead of spawning pi. If the entry
 * exists but was never fully compiled (compiled === false), we pass
 * through so /kb-add can re-compile it.
 *
 * @param {object} opts
 * @param {import('ws').WebSocket} opts.ws
 * @param {string} opts.url
 * @param {string|undefined} opts.workspace
 * @param {import('../ports/kb-store.js').KbStore} opts.kbStore
 * @param {import('../adapters/pi-rpc-spawner.js').spawnPi} opts.spawn
 * @returns {import('node:child_process').ChildProcess|null}
 */
function handleAdd({ ws, url, workspace, kbStore, spawn }) {
  // Dedup check for HTTP URLs: scan registry before spawning pi
  if (isUrl(url)) {
    const reg = kbStore.readRegistry(workspace);
    const entry = findByUrl(url, reg);

    if (entry) {
      // compiled !== false → already processed, no LLM needed
      if (entry.compiled !== false) {
        log(`add: already in KB: ${url} (added ${entry.addedAt?.slice(0, 10) || "?"})`);
        ws.send(
          safeStringify({
            type: "event",
            data: {
              type: "message_update",
              assistantMessageEvent: {
                type: "text_delta",
                delta: `Already in KB: ${url} (added ${entry.addedAt?.slice(0, 10) || "previously"})`,
              },
            },
          }),
        );
        ws.send(safeStringify({ type: "done", command: "add" }));
        return null;
      }

      // compiled === false: interrupted compilation — pass through to re-compile
      log(
        `add: re-compiling interrupted entry: ${url} (added ${entry.addedAt?.slice(0, 10) || "?"})`,
      );
    }
  }

  const prompt = workspace ? `/kb-add -w ${workspace} ${url}` : `/kb-add ${url}`;

  return spawn(prompt, "add", {
    onEvent: (event) => {
      ws.send(safeStringify({ type: "event", data: event }));
    },
    onDone: () => {
      ws.send(safeStringify({ type: "done", command: "add" }));
    },
    onStderr: (text) => {
      ws.send(safeStringify({ type: "stderr", text }));
    },
    onError: (message) => {
      ws.send(safeStringify({ type: "error", message }));
    },
  });
}

// ---------------------------------------------------------------------------
// Repair
// ---------------------------------------------------------------------------

/**
 * Handle a 'repair' request: count pending (compiled === false) entries.
 * Only spawn pi if there is at least one pending document — otherwise
 * a short-circuit "All compiled" message is sent.
 *
 * @param {object} opts
 * @param {import('ws').WebSocket} opts.ws
 * @param {string|undefined} opts.workspace
 * @param {import('../ports/kb-store.js').KbStore} opts.kbStore
 * @param {import('../adapters/pi-rpc-spawner.js').spawnPi} opts.spawn
 * @returns {import('node:child_process').ChildProcess|null}
 */
function handleRepair({ ws, workspace, kbStore, spawn }) {
  const reg = kbStore.readRegistry(workspace);
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
    return null;
  }

  log(`repair: ${pendingCount} pending doc(s)${workspace ? ` in ${workspace}` : ""}`);

  const prompt = workspace ? `/kb-repair -w ${workspace}` : `/kb-repair`;

  return spawn(prompt, "repair", {
    onEvent: (event) => {
      ws.send(safeStringify({ type: "event", data: event }));
    },
    onDone: () => {
      ws.send(safeStringify({ type: "done", command: "repair" }));
    },
    onStderr: (text) => {
      ws.send(safeStringify({ type: "stderr", text }));
    },
    onError: (message) => {
      ws.send(safeStringify({ type: "error", message }));
    },
  });
}
