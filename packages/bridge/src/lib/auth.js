// @ts-check

// ---------------------------------------------------------------------------
// Auth utilities: JWT sign/verify, password hashing, username validation
//
// JWT_SECRET must be set via environment variable in production.
// Falls back to a random per-process secret in dev (sessions don't
// survive restarts — convenient for local dev, not for production).
// ---------------------------------------------------------------------------

import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// JWT secret
// ---------------------------------------------------------------------------

const MODE = process.env.KEB_MODE;

/**
 * JWT signing secret.
 *
 *   hosted mode — MUST be set via JWT_SECRET env var. Crashes on startup
 *                  if missing (random secrets invalidate all sessions on
 *                  restart, breaking the user experience).
 *   local mode  — Falls back to a random per-process secret for convience.
 */
/** @type {string} */
let JWT_SECRET;

if (MODE === "hosted") {
  if (!process.env.JWT_SECRET) {
    console.error(
      "[auth] ❌ FATAL: JWT_SECRET is required in hosted mode.\n" +
        "        Set JWT_SECRET in .env and restart.",
    );
    process.exit(1);
  }
  JWT_SECRET = process.env.JWT_SECRET;
} else {
  // local mode: random per-process secret is fine (there are no user
  // accounts or persisted tokens)
  JWT_SECRET =
    process.env.JWT_SECRET ||
    (() => {
      const fallback = randomBytes(32).toString("hex");
      console.warn(
        `[auth] ⚠️  JWT_SECRET not set — using random per-process secret.\n` +
          `        Sessions will not survive restarts.`,
      );
      return fallback;
    })();
}

/** JWT expiration: 30 days */
const JWT_EXPIRES_IN = "30d";

// ---------------------------------------------------------------------------
// Token utilities
// ---------------------------------------------------------------------------

/**
 * Generate a JWT for an authenticated user.
 * @param {string} username
 * @returns {string} Signed JWT
 */
export function generateToken(username) {
  return jwt.sign({ username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify a JWT and extract the username.
 * @param {string} token - Raw JWT string
 * @returns {{ username: string }} Decoded payload
 * @throws {Error} If token is invalid or expired
 */
export function verifyToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  if (typeof payload !== "object" || !payload.username) {
    throw new Error("Invalid token payload");
  }
  return { username: /** @type {string} */ (payload.username) };
}

// ---------------------------------------------------------------------------
// Password utilities
// ---------------------------------------------------------------------------

const BCRYPT_ROUNDS = 12;

/**
 * Hash a plaintext password with bcrypt.
 * @param {string} password
 * @returns {Promise<string>} bcrypt hash
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Compare a plaintext password against a bcrypt hash.
 * @param {string} password - Plaintext candidate
 * @param {string} hash - Stored bcrypt hash
 * @returns {Promise<boolean>}
 */
export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// ---------------------------------------------------------------------------
// Username validation
// ---------------------------------------------------------------------------

/**
 * Validate a raw username input.
 * Returns the slugified (normalized) version or null if invalid.
 *
 * Rules:
 *   - 3-30 characters after slugification
 *   - Only lowercase letters, numbers, hyphens
 *   - No leading/trailing hyphens
 *   - No consecutive hyphens
 *
 * @param {string} raw - Raw user input
 * @returns {string|null} Slugified username or null if invalid
 */
export function validateUsername(raw) {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length < 3 || slug.length > 30) return null;
  if (/--/.test(slug)) return null;
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && slug.length > 1) return null;
  if (slug.length === 1 && !/^[a-z0-9]$/.test(slug)) return null;

  return slug;
}

/**
 * Validate a password.
 * @param {string} password - Raw password
 * @returns {string|null} Error message or null if valid
 */
export function validatePassword(password) {
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (password.length > 128) {
    return "Password must be at most 128 characters.";
  }
  return null;
}
