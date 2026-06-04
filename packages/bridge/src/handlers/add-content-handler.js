// @ts-check

// ---------------------------------------------------------------------------
// Handler: add-content
//
// Processes 'add-content' messages from the extension. The extension
// captures a page's HTML via a content script and sends it here. We
// convert HTML → Markdown using @kreuzberg/html-to-markdown-node, then
// spawn pi with /kb-add-content to compile it into the knowledge base.
// ---------------------------------------------------------------------------

import { createRequire } from "node:module";
import { safeStringify, log } from "../lib/utils.js";

const require = createRequire(import.meta.url);
const { convert } = require("@kreuzberg/html-to-markdown-node");

// ---------------------------------------------------------------------------
// Public entry-point
// ---------------------------------------------------------------------------

/**
 * Handle an 'add-content' request: convert the captured page HTML to
 * markdown, then spawn pi for /kb-add-content.
 *
 * @param {object} opts
 * @param {import('ws').WebSocket} opts.ws          - Connected extension client
 * @param {string} opts.operationId                  - Client-assigned operation ID
 * @param {string} opts.html                         - Raw HTML of the page
 * @param {string} [opts.url]                        - Page URL for metadata
 * @param {string} [opts.title]                      - Page title for metadata
 * @param {string|undefined} opts.workspace          - Target workspace
 * @param {import('../ports/kb-store.js').KbStore} opts.kbStore - KB storage adapter
 * @param {import('../adapters/pi-rpc-spawner.js').spawnPi} opts.spawn - pi process spawner
 * @param {number} [opts.maxDocuments] - Document limit (hosted free tier)
 * @returns {import('node:child_process').ChildProcess|null} Spawned child
 */
export function handleAddContent({
  ws,
  operationId,
  html,
  url,
  title,
  workspace,
  kbStore,
  spawn,
  maxDocuments,
}) {
  // ── 1. Convert HTML → Markdown ──────────────────────────────────
  /** @type {string} */
  let markdownContent;
  try {
    const result = convert(html);
    if (!result.content || result.content.trim().length === 0) {
      ws.send(
        safeStringify({
          type: "error",
          operationId,
          message: "HTML to markdown conversion produced empty output",
        }),
      );
      return null;
    }
    markdownContent = result.content;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`add-content: conversion failed: ${message}`);
    ws.send(
      safeStringify({
        type: "error",
        operationId,
        message: `Failed to convert page to markdown: ${message}`,
      }),
    );
    return null;
  }

  // ── 2. Prepend metadata header ──────────────────────────────────
  const headerParts = [];
  if (title && title.trim()) {
    headerParts.push(`# ${title.trim()}`);
  }
  if (url && url.trim()) {
    headerParts.push(`> Source: ${url.trim()}`);
  }
  const header = headerParts.length > 0 ? headerParts.join("\n") + "\n\n" : "";

  const fullContent = header + markdownContent;

  log(
    `add-content: converted ${(html.length / 1024).toFixed(1)}KB HTML → ${(markdownContent.length / 1024).toFixed(1)}KB markdown${title ? ` (${title.slice(0, 60)})` : ""}`,
  );

  // ── 3. Document limit check (hosted free tier) ──────────────────
  if (maxDocuments != null) {
    const docCount = kbStore.countDocuments(workspace);
    if (docCount >= maxDocuments) {
      const message = `Free tier limit reached (${maxDocuments} documents). Upgrade to Standard for unlimited documents.`;
      log(`add-content: blocked (limit): ${docCount}/${maxDocuments} docs`);
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

  // ── 4. Spawn pi with /kb-add-content ────────────────────────────
  const prompt = workspace
    ? `/kb-add-content -f -w ${workspace} ${fullContent}`
    : `/kb-add-content -f ${fullContent}`;

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
      ws.send(safeStringify({ type: "error", operationId, message }));
    },
  });
}
