/**
 * HTTP client for bridge auth and config endpoints.
 *
 * The bridge base URL is the WebSocket URL (e.g., "wss://api.mdevd.co/keb/v1").
 * HTTP calls use the same base but with http/https scheme.
 */

export type BridgeConfig = {
  mode: "local" | "hosted";
  version: string;
  auth: { endpoints: string[] };
};

/** Derive the HTTP base URL from a WebSocket bridge URL. */
function httpBase(wsUrl: string): string {
  return wsUrl.replace(/^ws/, "http");
}

async function request(url: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return body;
}

/** Fetch server config (mode, version, available auth endpoints). */
export async function fetchConfig(bridgeUrl: string): Promise<BridgeConfig> {
  return request(`${httpBase(bridgeUrl)}/api/config`);
}

/** Login with username and password. Returns JWT token. */
export async function login(
  bridgeUrl: string,
  username: string,
  password: string,
): Promise<{ token: string; username: string }> {
  return request(`${httpBase(bridgeUrl)}/api/login`, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

/** Sign up with username and password. Returns JWT token. */
export async function signup(
  bridgeUrl: string,
  username: string,
  password: string,
): Promise<{ token: string; username: string }> {
  return request(`${httpBase(bridgeUrl)}/api/signup`, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

/** Verify a token and get current user info. */
export async function getMe(bridgeUrl: string, token: string): Promise<{ username: string }> {
  return request(`${httpBase(bridgeUrl)}/api/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
