// lib/store.ts — chrome.storage.local cache wrapper for KEB state
//
// The bridge sends sync results; this module stores them and provides
// convenient getter functions for the side panel UI.

const KEYS = {
  config: "keb:config",
  bridgeConfig: "keb:bridgeConfig",
  registry: "keb:registry",
  index: "keb:index",
  summaries: "keb:summaries",
  concepts: "keb:concepts",
  workspaces: "keb:workspaces",
  connectionState: "keb:connectionState",
} as const;

// ── Types ───────────────────────────────────────────────────────────────

export interface ConnectionState {
  connected: boolean;
  lastSync: string | null;
}

export type BridgeMode = "local" | "hosted";

export interface BridgeConfig {
  /** Bridge operation mode. Defaults to "local" on first run. */
  mode: BridgeMode;
  /** Bridge server URL (default: ws://127.0.0.1:9876). */
  bridgeUrl: string;
  /** JWT token (hosted mode only). Cleared on logout. */
  token?: string;
  /** Authenticated username (hosted mode only). */
  username?: string;
}

export interface KebConfig {
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

/** Mirror of pi-keb's RegistryEntry. `compiled` tracks whether ALL wiki
 *  artifacts (summary, concepts, index) were written. Set to false on add,
 *  flipped to true by the final keb_update_index compilation step. */
export interface RegistryEntry {
  name: string;
  sourcePath: string;
  originalPath: string;
  docName: string;
  addedAt: string;
  lastCompiledAt?: string;
  /** True only after ALL wiki artifacts (summary, concepts, index) are written. */
  compiled: boolean;
}

export type Registry = Record<string, RegistryEntry>;

export interface KebSyncData {
  registry?: Registry;
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
  const { [KEYS.connectionState]: state } = await chrome.storage.local.get(KEYS.connectionState);
  return (state as ConnectionState) || { connected: false, lastSync: null };
}

// ── Full state sync ──────────────────────────────────────────────────────

export async function setKebState(data: KebSyncData): Promise<void> {
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

// ── Bridge config ────────────────────────────────────────────────────────

const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  mode: "hosted",
  bridgeUrl: "wss://api.mdevd.co/keb/v1",
};

export async function getBridgeConfig(): Promise<BridgeConfig> {
  const { [KEYS.bridgeConfig]: cfg } = await chrome.storage.local.get(KEYS.bridgeConfig);
  return (cfg as BridgeConfig) || { ...DEFAULT_BRIDGE_CONFIG };
}

export async function setBridgeConfig(cfg: Partial<BridgeConfig>): Promise<void> {
  const current = await getBridgeConfig();
  await chrome.storage.local.set({
    [KEYS.bridgeConfig]: { ...current, ...cfg },
  });
}

// ── Config (workspace) ───────────────────────────────────────────────────

export async function getConfig(): Promise<KebConfig> {
  const { [KEYS.config]: cfg } = await chrome.storage.local.get(KEYS.config);
  return (cfg as KebConfig) || { workspace: "default" };
}

export async function setConfig(cfg: Partial<KebConfig>): Promise<void> {
  const current = await getConfig();
  await chrome.storage.local.set({
    [KEYS.config]: { ...current, ...cfg },
  });
}

// ── Registry helpers (eventual consistency) ─────────────────────────────

/** Check whether a registry entry is fully compiled.
 *  Missing `compiled` field is treated as true for backward compatibility. */
export function isEntryCompiled(entry: RegistryEntry): boolean {
  return entry.compiled !== false;
}

/** Count registry entries that are not yet fully compiled. */
export async function countPendingCompilations(): Promise<number> {
  const reg = await getRegistry();
  return Object.values(reg).filter((e) => !isEntryCompiled(e as RegistryEntry)).length;
}

// ── Clear ────────────────────────────────────────────────────────────────

export async function clearAll(): Promise<void> {
  await chrome.storage.local.remove(Object.values(KEYS));
}

// ── First-use tracking ──────────────────────────────────────────────────

const FIRST_USE_KEY = "keb:firstUse";

export async function isFirstUse(): Promise<boolean> {
  const { [FIRST_USE_KEY]: firstUse } = await chrome.storage.local.get(FIRST_USE_KEY);
  // If not set, it's the first use
  return firstUse !== false;
}

export async function setFirstUseComplete(): Promise<void> {
  await chrome.storage.local.set({ [FIRST_USE_KEY]: false });
}
