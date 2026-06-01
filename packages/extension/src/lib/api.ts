// lib/api.ts — HTTP client for bridge auth endpoints
//
// Calls the bridge's REST API for signup, login, and token verification.
// Only used in hosted mode (KEB_MODE=hosted on the bridge).

export interface AuthResult {
  token: string;
  username: string;
}

export interface MeResult {
  username: string;
  createdAt: string;
}

export interface ApiError {
  error: string;
}

/**
 * Ensure a bridge URL has an http:// prefix.
 */
function normalizeBridgeUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  // Convert ws:// or wss:// to http:// or https:// for REST calls
  const httpUrl = trimmed.replace(/^ws(s?):\/\//, "http$1://");
  if (/^https?:\/\//.test(httpUrl)) return httpUrl;
  return `http://${httpUrl}`;
}

/**
 * Generic POST to the bridge API.
 */
async function apiPost(
  bridgeUrl: string,
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data: AuthResult } | { ok: false; error: string }> {
  try {
    const base = normalizeBridgeUrl(bridgeUrl);
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      return { ok: false, error: (data as ApiError).error || `HTTP ${res.status}` };
    }

    return { ok: true, data: data as AuthResult };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return { ok: false, error: `Cannot reach bridge: ${message}` };
  }
}

/**
 * Sign up a new user account on the bridge.
 */
export async function signup(
  bridgeUrl: string,
  username: string,
  password: string,
): Promise<{ ok: true; data: AuthResult } | { ok: false; error: string }> {
  return apiPost(bridgeUrl, "/api/signup", { username, password });
}

/**
 * Log in to an existing account on the bridge.
 */
export async function login(
  bridgeUrl: string,
  username: string,
  password: string,
): Promise<{ ok: true; data: AuthResult } | { ok: false; error: string }> {
  return apiPost(bridgeUrl, "/api/login", { username, password });
}

/**
 * Verify the current token and get user info.
 */
export async function getMe(
  bridgeUrl: string,
  token: string,
): Promise<{ ok: true; data: MeResult } | { ok: false; error: string }> {
  try {
    const base = normalizeBridgeUrl(bridgeUrl);
    const res = await fetch(`${base}/api/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();

    if (!res.ok) {
      return { ok: false, error: (data as ApiError).error || `HTTP ${res.status}` };
    }

    return { ok: true, data: data as MeResult };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return { ok: false, error: `Cannot reach bridge: ${message}` };
  }
}
