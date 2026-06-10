// @ts-check

// ---------------------------------------------------------------------------
// HTTP route handler — healthcheck, status, auth
//
// Mounted on the bridge's HTTP server (same port as WebSocket).
// Handles non-upgrade HTTP requests. WebSocket upgrades are handled
// separately by the ws library.
// ---------------------------------------------------------------------------

/**
 * Create an HTTP request handler for the bridge.
 *
 * Routes:
 *   GET  /api/healthcheck  — always available, no auth
 *   GET  /api/status       — requires X-API-Key matching ADMIN_KEY
 *   POST /api/signup       — hosted mode only
 *   POST /api/login        — hosted mode only
 *   GET  /api/me           — hosted mode only
 *
 * Returns true if the request was handled, false otherwise (404).
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
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    // ── Health check: always available, no auth required ────
    if (url.pathname === "/api/healthcheck" && req.method?.toUpperCase() === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", mode }));
      return;
    }

    // ── Status: admin key required ──────────────────────────
    if (url.pathname === "/api/status" && req.method?.toUpperCase() === "GET") {
      if (!adminKey) {
        res.writeHead(501, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ error: "ADMIN_KEY not configured on server. Set ADMIN_KEY env var." }),
        );
        return;
      }
      const apiKey = req.headers["x-api-key"];
      if (!apiKey || apiKey !== adminKey) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid or missing X-API-Key header." }));
        return;
      }
      const payload = JSON.stringify(statusTracker.buildStatus());
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(payload);
      return;
    }

    // Auth endpoints only active in hosted mode
    if (mode === "hosted") {
      const handled = await authHandler(req, res);
      if (handled) return;
    }

    // If not an auth route, return 404 (WebSocket upgrade is handled
    // by the ws library attaching to the same httpServer, not here)
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  };
}
