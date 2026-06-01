// @ts-check

// ---------------------------------------------------------------------------
// Adapter: JSON-file UserStore
//
// Implements the UserStore port using a single JSON file on disk.
// Simple, zero-dependency, swap to PostgreSQL later by implementing
// the same interface.
//
// File: ~/.pi/agent/kb/users.json
// Format: { "alice": { "passwordHash": "...", "createdAt": "..." }, ... }
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

/** @type {string} */
const USERS_PATH = join(homedir(), ".pi", "agent", "kb", "users.json");

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** @returns {Object<string, import('../ports/user-store.js').UserRecord>} */
function readAll() {
  if (!existsSync(USERS_PATH)) return {};
  try {
    const raw = readFileSync(USERS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** @param {Object<string, import('../ports/user-store.js').UserRecord>} users */
function writeAll(users) {
  mkdirSync(dirname(USERS_PATH), { recursive: true });
  writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Create a JSON-file-backed UserStore adapter.
 * @returns {import('../ports/user-store.js').UserStore}
 */
export function createJsonUserStore() {
  return {
    async createUser(username, passwordHash) {
      const users = readAll();
      if (users[username]) {
        throw new Error(`Username "${username}" is already taken.`);
      }
      const record = {
        username,
        passwordHash,
        createdAt: new Date().toISOString(),
      };
      users[username] = record;
      writeAll(users);
      return record;
    },

    async findUser(username) {
      const users = readAll();
      return users[username] ?? null;
    },

    async userExists(username) {
      const users = readAll();
      return username in users;
    },
  };
}
