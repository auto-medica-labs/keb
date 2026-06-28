// lib/api.ts — HTTP client for bridge auth endpoints

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

function normalizeBridgeUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  const httpUrl = trimmed.replace(/^ws(s?):\/\//, "http$1://");
  if (/^https?:\/\//.test(httpUrl)) return httpUrl;
  return `http://${httpUrl}`;
}

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

export async function signup(
  bridgeUrl: string,
  username: string,
  password: string,
): Promise<{ ok: true; data: AuthResult } | { ok: false; error: string }> {
  return apiPost(bridgeUrl, "/api/signup", { username, password });
}

export async function login(
  bridgeUrl: string,
  username: string,
  password: string,
): Promise<{ ok: true; data: AuthResult } | { ok: false; error: string }> {
  return apiPost(bridgeUrl, "/api/login", { username, password });
}

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
