// lib/store.ts — chrome.storage.local cache wrapper for KB state
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
} as const;

// ── Types ───────────────────────────────────────────────────────────────

export interface ConnectionState {
  connected: boolean;
  lastSync: string | null;
}

export interface KBConfig {
  workspace: string;
}

export interface Summary {
  content: string;
  source: string;
  added: string;
}

export interface Concept {
  content: string;
  sources: string[];
  updated: string;
}

export interface KBSyncData {
  registry?: Record<string, unknown>;
  index?: string;
  summaries?: Record<string, Summary>;
  concepts?: Record<string, Concept>;
  workspaces?: string[];
}

// ── Connection state ────────────────────────────────────────────────────

export async function setConnectionState(state: ConnectionState): Promise<void> {
  await chrome.storage.local.set({ [KEYS.connectionState]: state });
}

export async function getConnectionState(): Promise<ConnectionState> {
  const { [KEYS.connectionState]: state } =
    await chrome.storage.local.get(KEYS.connectionState);
  return (state as ConnectionState) || { connected: false, lastSync: null };
}

// ── Full state sync ──────────────────────────────────────────────────────

export async function setKBState(data: KBSyncData): Promise<void> {
  const batch: Record<string, unknown> = {};
  if (data.registry) batch[KEYS.registry] = data.registry;
  if (data.index) batch[KEYS.index] = data.index;
  if (data.summaries) batch[KEYS.summaries] = data.summaries;
  if (data.concepts) batch[KEYS.concepts] = data.concepts;
  if (data.workspaces) batch[KEYS.workspaces] = data.workspaces;

  if (Object.keys(batch).length > 0) {
    await chrome.storage.local.set(batch);
  }

  await setConnectionState({
    connected: true,
    lastSync: new Date().toISOString(),
  });
}

// ── Individual getters ───────────────────────────────────────────────────

export async function getRegistry(): Promise<Record<string, unknown>> {
  const { [KEYS.registry]: reg } = await chrome.storage.local.get(KEYS.registry);
  return (reg as Record<string, unknown>) || {};
}

export async function getIndex(): Promise<string> {
  const { [KEYS.index]: idx } = await chrome.storage.local.get(KEYS.index);
  return (idx as string) || "";
}

export async function getSummaries(): Promise<Record<string, Summary>> {
  const { [KEYS.summaries]: s } = await chrome.storage.local.get(KEYS.summaries);
  return (s as Record<string, Summary>) || {};
}

export async function getConcepts(): Promise<Record<string, Concept>> {
  const { [KEYS.concepts]: c } = await chrome.storage.local.get(KEYS.concepts);
  return (c as Record<string, Concept>) || {};
}

export async function getWorkspaces(): Promise<string[]> {
  const { [KEYS.workspaces]: ws } = await chrome.storage.local.get(KEYS.workspaces);
  return (ws as string[]) || [];
}

// ── Config ───────────────────────────────────────────────────────────────

export async function getConfig(): Promise<KBConfig> {
  const { [KEYS.config]: cfg } = await chrome.storage.local.get(KEYS.config);
  return (cfg as KBConfig) || { workspace: "default" };
}

export async function setConfig(cfg: Partial<KBConfig>): Promise<void> {
  const current = await getConfig();
  await chrome.storage.local.set({
    [KEYS.config]: { ...current, ...cfg },
  });
}

// ── Clear ────────────────────────────────────────────────────────────────

export async function clearAll(): Promise<void> {
  await chrome.storage.local.remove(Object.values(KEYS));
}
