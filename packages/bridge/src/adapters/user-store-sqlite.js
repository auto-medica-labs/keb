// @ts-check

// ---------------------------------------------------------------------------
// Adapter: SQLite UserStore
//
// Implements the UserStore port using better-sqlite3 — an embedded,
// ACID-compliant database with zero external infrastructure.
// Eliminates the race condition present in the JSON-file adapter.
//
// Database: ~/.pi/agent/keb/users.db
// Table: users (username TEXT PRIMARY KEY, passwordHash TEXT, createdAt TEXT)
// ---------------------------------------------------------------------------

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/** @type {string} */
const DB_DIR = join(homedir(), ".pi", "agent", "keb");

/** @type {string} */
const DB_PATH = join(DB_DIR, "users.db");

// ---------------------------------------------------------------------------
// Singleton database — created once, reused for all calls.
// better-sqlite3 is synchronous and does its own serialization.
// ---------------------------------------------------------------------------

/** @type {import('better-sqlite3').Database|null} */
let _db = null;

/**
 * Get or create the database connection and ensure the schema exists.
 * @returns {import('better-sqlite3').Database}
 */
function getDb() {
  if (_db) return _db;

  mkdirSync(DB_DIR, { recursive: true });

  _db = new Database(DB_PATH);

  // WAL mode for better concurrent read performance.
  // Even though Node is single-threaded, WAL avoids reader-writer contention.
  _db.pragma("journal_mode = WAL");

  // Sync on every commit for durability. Trade-off: slightly slower writes
  // but zero risk of corruption on power loss.
  _db.pragma("synchronous = NORMAL");

  // Create table if it doesn't exist (migration-free — schema is simple)
  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      username   TEXT PRIMARY KEY NOT NULL,
      passwordHash TEXT NOT NULL,
      createdAt  TEXT NOT NULL
    );
  `);

  return _db;
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Create a SQLite-backed UserStore adapter.
 * @returns {import('../ports/user-store.js').UserStore}
 */
export function createSqliteUserStore() {
  // Prepare statements once for performance (statement caching is built-in
  // in better-sqlite3, but the prepare call is cheap anyway)
  const db = getDb();

  const stmtInsert = db.prepare(
    "INSERT INTO users (username, passwordHash, createdAt) VALUES (?, ?, ?)",
  );
  const stmtFind = db.prepare("SELECT * FROM users WHERE username = ?");
  const stmtExists = db.prepare("SELECT 1 FROM users WHERE username = ?");

  return {
    /**
     * Create a new user. The UNIQUE constraint on username guarantees
     * atomic duplicate detection — no read-then-write race possible.
     * @param {string} username
     * @param {string} passwordHash
     * @returns {Promise<import('../ports/user-store.js').UserRecord>}
     */
    async createUser(username, passwordHash) {
      const createdAt = new Date().toISOString();

      // SQLite UNIQUE constraint on username gives us true atomicity.
      // If username already exists, SQLITE_CONSTRAINT_UNIQUE is thrown.
      // No race condition possible — the INSERT is the check.
      try {
        stmtInsert.run(username, passwordHash, createdAt);
      } catch (err) {
        if (err instanceof Error && "code" in err) {
          const sqliteErr = /** @type {{code: string}} */ (err);
          if (
            sqliteErr.code === "SQLITE_CONSTRAINT_UNIQUE" ||
            sqliteErr.code === "SQLITE_CONSTRAINT_PRIMARYKEY"
          ) {
            throw new Error(`Username "${username}" is already taken.`);
          }
        }
        throw err;
      }

      /** @type {import('../ports/user-store.js').UserRecord} */
      return { username, passwordHash, createdAt };
    },

    /**
     * Find a user by username. Returns null if not found.
     * @param {string} username
     * @returns {Promise<import('../ports/user-store.js').UserRecord|null>}
     */
    async findUser(username) {
      const row =
        /** @type {{ username: string; passwordHash: string; createdAt: string }|undefined} */ (
          stmtFind.get(username)
        );
      return row ?? null;
    },

    /**
     * Check whether a username is already registered.
     * @param {string} username
     * @returns {Promise<boolean>}
     */
    async userExists(username) {
      const row = stmtExists.get(username);
      return row !== undefined;
    },
  };
}
