// @ts-check

// ---------------------------------------------------------------------------
// Port: User storage (types & contract)
//
// Defines the UserStore interface for user credential persistence.
// Adapters implement these operations — currently JSON file, swappable
// to PostgreSQL, SQLite, etc. without touching auth handlers.
// ---------------------------------------------------------------------------

/**
 * A stored user record.
 * @typedef {Object} UserRecord
 * @property {string} username     - Normalized username (lowercase, slugified)
 * @property {string} passwordHash - bcrypt hash
 * @property {string} createdAt    - ISO timestamp
 */

/**
 * User storage port.
 *
 * All methods are async to accommodate network-backed adapters
 * (PostgreSQL, Redis). JSON adapter resolves synchronously but
 * returns Promises for interface consistency.
 *
 * @typedef {Object} UserStore
 * @property {(username: string, passwordHash: string) => Promise<UserRecord>} createUser
 *     Create a new user. Throws if username already exists.
 * @property {(username: string) => Promise<UserRecord|null>} findUser
 *     Look up a user by username. Returns null if not found.
 * @property {(username: string) => Promise<boolean>} userExists
 *     Check whether a username is already registered.
 */

export {};
