// @ts-check

// ---------------------------------------------------------------------------
// StatusTracker — runtime metrics for GET /api/status
//
// Tracks active pi child processes (by operation ID) and connected
// WebSocket clients. Exposes buildStatus() for the status endpoint.
// ---------------------------------------------------------------------------

/**
 * Tracks runtime state for the /api/status endpoint.
 *
 * Owns the activeOperations map and server start time. Receives a
 * reference to the WebSocket server for client enumeration.
 */
export class StatusTracker {
  /** @type {Map<string, { type: string, workspace: string, startedAt: number }>} */
  #activeOperations;

  /** @type {number} */
  #serverStartTime;

  /** @type {import('../ports/kb-store.js').KbStore} */
  #kbStore;

  /** @type {'local' | 'hosted'} */
  #mode;

  /** @type {import('ws').WebSocketServer} */
  #wss;

  /**
   * @param {object} opts
   * @param {import('../ports/kb-store.js').KbStore} opts.kbStore
   * @param {'local' | 'hosted'} opts.mode
   * @param {import('ws').WebSocketServer} opts.wss
   */
  constructor({ kbStore, mode, wss }) {
    this.#activeOperations = new Map();
    this.#serverStartTime = Date.now();
    this.#kbStore = kbStore;
    this.#mode = mode;
    this.#wss = wss;
  }

  /**
   * Register a new active operation (pi child process started).
   * @param {string} opId
   * @param {string} type - "add" | "repair" | "add-content" | "query"
   * @param {string} workspace
   */
  trackOperation(opId, type, workspace) {
    this.#activeOperations.set(opId, { type, workspace, startedAt: Date.now() });
  }

  /**
   * Remove a finished operation (pi child process exited).
   * @param {string} opId
   */
  untrackOperation(opId) {
    this.#activeOperations.delete(opId);
  }

  /**
   * Build the /api/status response payload.
   * @returns {object}
   */
  buildStatus() {
    const clients = this.#getConnectedClients();

    /** @type {Object<string, number>} */
    const byType = {};
    for (const [, op] of this.#activeOperations) {
      byType[op.type] = (byType[op.type] || 0) + 1;
    }

    const workspaceNames = this.#kbStore.listWorkspaces();
    const workspaces = workspaceNames.map((name) => ({
      name,
      documents: this.#kbStore.countDocuments(name),
      lastDocumentAdded: this.#deriveLastDocumentAdded(name),
    }));

    return {
      status: "ok",
      mode: this.#mode,
      uptime: Math.floor((Date.now() - this.#serverStartTime) / 1000),
      connections: {
        active: clients.length,
        clients,
      },
      operations: {
        active: this.#activeOperations.size,
        byType,
      },
      workspaces: {
        total: workspaces.length,
        details: workspaces,
      },
    };
  }

  // ── Private helpers ──────────────────────────────────────────

  /**
   * Enumerate open WebSocket clients with auth info.
   * @returns {{ user: string, connectedSince: number }[]}
   */
  #getConnectedClients() {
    /** @type {{ user: string, connectedSince: number }[]} */
    const clients = [];
    for (const client of this.#wss.clients) {
      const c =
        /** @type {import('ws').WebSocket & {_authenticatedUser?: string|null, _connectedAt?: number}} */ (
          client
        );
      if (c.readyState === 1 && c._authenticatedUser && c._connectedAt) {
        clients.push({
          user: c._authenticatedUser,
          connectedSince: c._connectedAt,
        });
      }
    }
    return clients;
  }

  /**
   * Find the ISO timestamp of the most recently added document in a workspace.
   * @param {string} name - Workspace name
   * @returns {string|null}
   */
  #deriveLastDocumentAdded(name) {
    const reg = this.#kbStore.readRegistry(name);
    let latest = null;
    for (const entry of Object.values(reg)) {
      if (entry.addedAt && (!latest || entry.addedAt > latest)) {
        latest = entry.addedAt;
      }
    }
    return latest;
  }
}
