// lib/store.js — chrome.storage.local cache wrapper for KB state
//
// The bridge sends sync results; this module stores them and provides
// convenient getter functions for the side panel UI.

const KEYS = {
  config: "kb:config",
  registry: "kb:registry",
  index: "kb:index",
  summaries: "kb:summaries",
  concepts: "kb:concepts",
  workspaces: "kb:workspaces",
  connectionState: "kb:connectionState",
};

// ── Connection state ────────────────────────────────────────────────────

/**
 * Persist WS connection state so the side panel can show status even
 * across page reloads.
 */
export async function setConnectionState(state) {
  // state: { connected: boolean, lastSync: string, error?: string }
  await chrome.storage.local.set({ [KEYS.connectionState]: state });
}

export async function getConnectionState() {
  const { [KEYS.connectionState]: state } = await chrome.storage.local.get(
    KEYS.connectionState,
  );
  return state || { connected: false, lastSync: null };
}

// ── Full state sync ──────────────────────────────────────────────────────

/**
 * Store a complete KB state dump from a sync_result message.
 */
export async function setKBState(data) {
  const batch = {};
  if (data.registry) batch[KEYS.registry] = data.registry;
  if (data.index) batch[KEYS.index] = data.index;
  if (data.summaries) batch[KEYS.summaries] = data.summaries;
  if (data.concepts) batch[KEYS.concepts] = data.concepts;
  if (data.workspaces) batch[KEYS.workspaces] = data.workspaces;

  if (Object.keys(batch).length > 0) {
    await chrome.storage.local.set(batch);
  }

  await setConnectionState({ connected: true, lastSync: new Date().toISOString() });
}

// ── Individual getters ───────────────────────────────────────────────────

export async function getRegistry() {
  const { [KEYS.registry]: reg } = await chrome.storage.local.get(
    KEYS.registry,
  );
  return reg || {};
}

export async function getIndex() {
  const { [KEYS.index]: idx } = await chrome.storage.local.get(KEYS.index);
  return idx || "";
}

export async function getSummaries() {
  const { [KEYS.summaries]: s } = await chrome.storage.local.get(
    KEYS.summaries,
  );
  return s || {};
}

export async function getConcepts() {
  const { [KEYS.concepts]: c } = await chrome.storage.local.get(
    KEYS.concepts,
  );
  return c || {};
}

export async function getWorkspaces() {
  const { [KEYS.workspaces]: ws } = await chrome.storage.local.get(
    KEYS.workspaces,
  );
  return ws || [];
}

// ── Config ───────────────────────────────────────────────────────────────

export async function getConfig() {
  const { [KEYS.config]: cfg } = await chrome.storage.local.get(KEYS.config);
  return cfg || { workspace: "default" };
}

export async function setConfig(cfg) {
  await chrome.storage.local.set({ [KEYS.config]: cfg });
}

// ── Clear ────────────────────────────────────────────────────────────────

export async function clearAll() {
  await chrome.storage.local.remove(Object.values(KEYS));
}
