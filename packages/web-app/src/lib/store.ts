// lib/store.ts — localStorage-backed cache for Keb state

const KEYS = {
  config: "keb:config",
  bridgeConfig: "keb:bridgeConfig",
  registry: "keb:registry",
  index: "keb:index",
  summaries: "keb:summaries",
  concepts: "keb:concepts",
  workspaces: "keb:workspaces",
} as const;

// ── Types ───────────────────────────────────────────────────────────────

export type BridgeMode = "local" | "hosted";

export interface BridgeConfig {
  mode: BridgeMode;
  bridgeUrl: string;
  token?: string;
  username?: string;
}

export interface KebConfig {
  workspace: string;
}

export interface Summary {
  content: string;
  source: string;
  added: string;
  title?: string;
  description?: string;
  tags?: string[];
}

export interface Concept {
  content: string;
  sources: string[];
  updated: string;
  title?: string;
  description?: string;
  tags?: string[];
}

export interface RegistryEntry {
  name: string;
  sourcePath: string;
  originalPath: string;
  docName: string;
  addedAt: string;
  lastCompiledAt?: string;
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

// ── Generic helpers ─────────────────────────────────────────────────────

function getItem<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function setItem(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// ── Full state sync ──────────────────────────────────────────────────────

export async function setKebState(data: KebSyncData): Promise<void> {
  const batch: Record<string, unknown> = {};
  if (data.registry) batch[KEYS.registry] = data.registry;
  if (data.index) batch[KEYS.index] = data.index;
  if (data.summaries) batch[KEYS.summaries] = data.summaries;
  if (data.concepts) batch[KEYS.concepts] = data.concepts;
  if (data.workspaces) batch[KEYS.workspaces] = data.workspaces;

  for (const [key, value] of Object.entries(batch)) {
    setItem(key, value);
  }

  // Dispatch a custom event so components can react to storage changes
  window.dispatchEvent(new CustomEvent("keb:storage-changed"));
}

// ── Individual getters ───────────────────────────────────────────────────

export async function getRegistry(): Promise<Record<string, RegistryEntry>> {
  return getItem(KEYS.registry, {});
}

export async function getIndex(): Promise<string> {
  return getItem(KEYS.index, "");
}

export async function getSummaries(): Promise<Record<string, Summary>> {
  return getItem(KEYS.summaries, {});
}

export async function getConcepts(): Promise<Record<string, Concept>> {
  return getItem(KEYS.concepts, {});
}

export async function getWorkspaces(): Promise<string[]> {
  return getItem(KEYS.workspaces, []);
}

// ── Bridge config ────────────────────────────────────────────────────────

const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  mode: "hosted",
  bridgeUrl: "wss://api.mdevd.co/keb/v1",
};

export async function getBridgeConfig(): Promise<BridgeConfig> {
  return getItem(KEYS.bridgeConfig, { ...DEFAULT_BRIDGE_CONFIG });
}

export async function setBridgeConfig(cfg: Partial<BridgeConfig>): Promise<void> {
  const current = await getBridgeConfig();
  setItem(KEYS.bridgeConfig, { ...current, ...cfg });
}

// ── Config (workspace) ───────────────────────────────────────────────────

export async function getConfig(): Promise<KebConfig> {
  return getItem(KEYS.config, { workspace: "default" });
}

export async function setConfig(cfg: Partial<KebConfig>): Promise<void> {
  const current = await getConfig();
  setItem(KEYS.config, { ...current, ...cfg });
}

// ── Registry helpers ─────────────────────────────────────────────────────

export function isEntryCompiled(entry: RegistryEntry): boolean {
  return entry.compiled !== false;
}

export async function countPendingCompilations(): Promise<number> {
  const reg = await getRegistry();
  return Object.values(reg).filter((e) => !isEntryCompiled(e)).length;
}

// ── Clear ────────────────────────────────────────────────────────────────

export async function clearAll(): Promise<void> {
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
}
