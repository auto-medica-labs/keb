// @ts-check

// ---------------------------------------------------------------------------
// Handler: add-url
//
// Processes 'add' messages from the extension. Performs registry
// dedup checks and document-limit enforcement before spawning pi.
// ---------------------------------------------------------------------------

import { safeStringify, log, isUrl, findByUrl } from "../lib/utils.js";

/**
 * Handle an 'add' request: dedup-check the registry, check document
 * limit, then spawn pi for /kb-add.
 *
 * If the URL is already registered and fully compiled, a short-circuit
 * "Already in KB" message is sent instead of spawning pi. If the entry
 * exists but was never fully compiled (compiled === false), we pass
 * through so /kb-add can re-compile it.
 *
 * @param {object} opts
 * @param {import('ws').WebSocket} opts.ws       - Connected extension client
 * @param {string} opts.operationId              - Client-assigned operation ID
 * @param {string} opts.url                      - URL to add
 * @param {string|undefined} opts.workspace      - Target workspace
 * @param {import('../ports/kb-store.js').KbStore} opts.kbStore - KB storage adapter
 * @param {import('../adapters/pi-rpc-spawner.js').spawnPi} opts.spawn - pi process spawner
 * @param {number} [opts.maxDocuments] - Document limit (hosted free tier)
 * @returns {import('node:child_process').ChildProcess|null} Spawned child, or null if short-circuited
 */
export function handleAddUrl({ ws, operationId, url, workspace, kbStore, spawn, maxDocuments }) {
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
            operationId,
            data: {
              type: "message_update",
              assistantMessageEvent: {
                type: "text_delta",
                delta: `Already in KB: ${url} (added ${entry.addedAt?.slice(0, 10) || "previously"})`,
              },
            },
          }),
        );
        ws.send(safeStringify({ type: "done", operationId, command: "add" }));
        return null;
      }

      // compiled === false: interrupted compilation — pass through to re-compile
      log(
        `add: re-compiling interrupted entry: ${url} (added ${entry.addedAt?.slice(0, 10) || "?"})`,
      );
    }
  }

  // ── Document limit check (hosted free tier) ──────────────────
  if (maxDocuments != null) {
    const docCount = kbStore.countDocuments(workspace);
    if (docCount >= maxDocuments) {
      const message = `Free tier limit reached (${maxDocuments} documents). Upgrade to Standard for unlimited documents.`;
      log(`add: blocked (limit): ${url} — ${docCount}/${maxDocuments} docs`);
      ws.send(
        safeStringify({
          type: "error",
          operationId,
          message,
        }),
      );
      return null;
    }
  }

  const prompt = workspace ? `/kb-add -f -w ${workspace} ${url}` : `/kb-add -f ${url}`;

  return spawn(prompt, "add", {
    operationId,
    onEvent: (event) => {
      ws.send(safeStringify({ type: "event", operationId, data: event }));
    },
    onDone: () => {
      ws.send(safeStringify({ type: "done", operationId, command: "add" }));
    },
    onStderr: (text) => {
      ws.send(safeStringify({ type: "stderr", operationId, text }));
    },
    onError: (message) => {
      // Detect fetch failures (403 Forbidden, 401 Unauthorized) where the
      // remote server blocked the request. Guide the user to use the
      // right-click option instead, which captures the page as seen by
      // their browser (bypassing server-side blocks).
      const blockedPattern = /Failed to fetch .+?:\s*HTTP\s+(?:403|401)\b/i;
      if (blockedPattern.test(message)) {
        ws.send(
          safeStringify({
            type: "error",
            operationId,
            toast: message,
            message: `${url} blocked Keb from accessing its content. Instead:\n\n1. Right-click on the page\n2. Select Keb menu\n3. Select "Add this content into Knowledge base"\n\nThis captures the page as your browser sees it, bypassing the block.`,
          }),
        );
      } else {
        ws.send(safeStringify({ type: "error", operationId, message }));
      }
    },
  });
}
