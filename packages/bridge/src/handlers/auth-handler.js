// @ts-check

// ---------------------------------------------------------------------------
// Handler: HTTP auth endpoints
//
// Mounted on the bridge's HTTP server (same port as WebSocket).
// Handles signup, login, and token verification.
//
// Endpoints:
//   POST /api/signup  — { username, password } → { token }
//   POST /api/login   — { username, password } → { token }
//   GET  /api/me      — Authorization: Bearer <token> → { username }
// ---------------------------------------------------------------------------

import {
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
  validateUsername,
  validatePassword,
} from "../lib/auth.js";
import { ensureWorkspace } from "../adapters/pi-kb-store.js";
import { log } from "../lib/utils.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read and parse JSON body from an incoming HTTP request.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<any>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    req.on("data", (chunk) => chunks.push(/** @type {Buffer} */ (chunk)));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Send a JSON response.
 * @param {import('node:http').ServerResponse} res
 * @param {number} statusCode
 * @param {object} body
 */
/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} statusCode
 * @param {object} body
 * @returns {true}
 */
function json(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": String(Buffer.byteLength(payload)),
  });
  res.end(payload);
  return true;
}

/**
 * Extract Bearer token from Authorization header.
 * @param {import('node:http').IncomingMessage} req
 * @returns {string|null}
 */
function extractBearer(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice(7).trim();
}

// ---------------------------------------------------------------------------
// Route handler factory
// ---------------------------------------------------------------------------

/**
 * Create an HTTP request handler for auth routes.
 *
 * @param {object} deps
 * @param {import('../ports/user-store.js').UserStore} deps.userStore
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<boolean>}
 *     Returns true if the request was handled (route matched), false otherwise.
 */
export function createAuthHandler({ userStore }) {
  return async function authHandler(req, res) {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const path = url.pathname;
    const method = req.method?.toUpperCase() || "";

    // ── POST /api/signup ────────────────────────────────────
    if (path === "/api/signup" && method === "POST") {
      try {
        const body = await readBody(req);
        const rawUsername = String(body.username || "").trim();
        const password = String(body.password || "");

        // Validate username
        const username = validateUsername(rawUsername);
        if (!username) {
          return json(res, 400, {
            error: "Invalid username. Use 3-30 characters: letters, numbers, hyphens.",
          });
        }

        // Validate password
        const pwError = validatePassword(password);
        if (pwError) {
          return json(res, 400, { error: pwError });
        }

        // Check uniqueness
        const exists = await userStore.userExists(username);
        if (exists) {
          return json(res, 409, { error: "Username is already taken." });
        }

        // Hash password
        const passwordHash = await hashPassword(password);

        // Store user
        await userStore.createUser(username, passwordHash);

        // Create workspace
        const created = ensureWorkspace(username);
        log(
          `auth: user "${username}" signed up${created ? " (workspace created)" : " (workspace already existed)"}`,
        );

        // Issue token
        const token = generateToken(username);
        return json(res, 201, { token, username });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Internal error";
        log(`auth: signup error: ${message}`);
        return json(res, 500, { error: message });
      }
    }

    // ── POST /api/login ─────────────────────────────────────
    if (path === "/api/login" && method === "POST") {
      try {
        const body = await readBody(req);
        const rawUsername = String(body.username || "").trim();
        const password = String(body.password || "");

        const username = validateUsername(rawUsername);
        if (!username) {
          return json(res, 400, { error: "Invalid username." });
        }

        const user = await userStore.findUser(username);
        if (!user) {
          return json(res, 401, { error: "Invalid username or password." });
        }

        const valid = await comparePassword(password, user.passwordHash);
        if (!valid) {
          return json(res, 401, { error: "Invalid username or password." });
        }

        const token = generateToken(username);
        log(`auth: user "${username}" logged in`);
        return json(res, 200, { token, username });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Internal error";
        log(`auth: login error: ${message}`);
        return json(res, 500, { error: message });
      }
    }

    // ── GET /api/me ─────────────────────────────────────────
    if (path === "/api/me" && method === "GET") {
      const token = extractBearer(req);
      if (!token) {
        return json(res, 401, { error: "Missing Authorization header." });
      }

      try {
        const { username } = verifyToken(token);
        const user = await userStore.findUser(username);
        if (!user) {
          return json(res, 401, { error: "User not found." });
        }
        return json(res, 200, { username: user.username, createdAt: user.createdAt });
      } catch {
        return json(res, 401, { error: "Invalid or expired token." });
      }
    }

    // ── Not an auth route ───────────────────────────────────
    return false;
  };
}
