// @ts-check

// @ts-check

// ---------------------------------------------------------------------------
// HTTP route handler — healthcheck, status, auth, config
//
// Mounted on the bridge's HTTP server (same port as WebSocket).
// Handles non-upgrade HTTP requests. WebSocket upgrades are handled
// separately by the ws library.
//
// All endpoints return CORS headers so browser-based clients (PWA, web app)
// can call them cross-origin.
// ---------------------------------------------------------------------------

/**
 * CORS headers applied to every response.
 * Allows any origin so the web app can live on any domain.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
  "Access-Control-Max-Age": "86400",
};

/**
 * Wrap res.writeHead to include CORS headers.
 * @param {import('node:http').ServerResponse} res
 * @param {number} statusCode
 * @param {Record<string, string>} [headers]
 */
function writeHead(res, statusCode, headers = {}) {
  const allHeaders = { ...CORS_HEADERS, ...headers };
  res.writeHead(statusCode, allHeaders);
}

/**
 * Send a JSON response with CORS headers.
 * @param {import('node:http').ServerResponse} res
 * @param {number} statusCode
 * @param {object} body
 */
function json(res, statusCode, body) {
  const payload = JSON.stringify(body);
  writeHead(res, statusCode, {
    "Content-Type": "application/json",
    "Content-Length": String(Buffer.byteLength(payload)),
  });
  res.end(payload);
}

/**
 * Create an HTTP request handler for the bridge.
 *
 * Routes:
 *   GET  /api/healthcheck  — always available, no auth
 *   GET  /api/config       — server config (mode, etc.), no auth
 *   GET  /api/status       — requires X-API-Key matching ADMIN_KEY
 *   POST /api/signup       — hosted mode only
 *   POST /api/login        — hosted mode only
 *   GET  /api/me           — hosted mode only
 *
 * @param {object} opts
 * @param {'local' | 'hosted'} opts.mode
 * @param {string|undefined} opts.adminKey
 * @param {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<boolean>} opts.authHandler
 * @param {import('./status-tracker.js').StatusTracker} opts.statusTracker
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function createHttpHandler({ mode, adminKey, authHandler, statusTracker }) {
  return async function httpHandler(req, res) {
    const method = req.method?.toUpperCase() || "";

    // ── CORS preflight: handle OPTIONS for all paths ────────
    if (method === "OPTIONS") {
      writeHead(res, 204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    // ── Health check: always available, no auth required ────
    if (url.pathname === "/api/healthcheck" && method === "GET") {
      json(res, 200, { status: "ok", mode });
      return;
    }

    // ── Config: expose server mode + bridge version info ────
    if (url.pathname === "/api/config" && method === "GET") {
      json(res, 200, {
        mode,
        version: "0.1.0",
        auth: mode === "hosted" ? { endpoints: ["signup", "login", "me"] } : { endpoints: [] },
      });
      return;
    }

    // ── Status: admin key required ──────────────────────────
    if (url.pathname === "/api/status" && method === "GET") {
      if (!adminKey) {
        json(res, 501, { error: "ADMIN_KEY not configured on server. Set ADMIN_KEY env var." });
        return;
      }
      const apiKey = req.headers["x-api-key"];
      if (!apiKey || apiKey !== adminKey) {
        json(res, 401, { error: "Invalid or missing X-API-Key header." });
        return;
      }
      json(res, 200, statusTracker.buildStatus());
      return;
    }

    // Auth endpoints only active in hosted mode
    if (mode === "hosted") {
      const handled = await authHandler(req, res);
      if (handled) return;
    }

    // 404 for everything else
    json(res, 404, { error: "Not found" });
  };
}
