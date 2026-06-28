/** localStorage-backed config store for the web app. */

export type BridgeMode = "local" | "hosted";

export interface AppConfig {
  mode: BridgeMode;
  bridgeUrl: string;
  token?: string;
  username?: string;
}

const STORAGE_KEY = "keb:config";
const DEFAULT_BRIDGE_URL = "wss://api.mdevd.co/keb/v1";

export function loadConfig(): AppConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppConfig;
  } catch {
    return null;
  }
}

export function saveConfig(config: AppConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getDefaultConfig(): AppConfig {
  return {
    mode: "hosted",
    bridgeUrl: DEFAULT_BRIDGE_URL,
  };
}
