// @ts-check

// ---------------------------------------------------------------------------
// Adapter: PiKbStore
//
// Wraps pi-keb's FilesystemStore (from the git submodule) to implement
// the bridge's KbStore port. The heavy lifting (registry reads, concept
// parsing, workspace listing, etc.) lives in pi-keb. This adapter adds
// only the bridge-specific `buildSyncData` method for the sync protocol.
//
// Requires pi-keb to be compiled first:
//   npx tsc -p tsconfig.build-pi-keb.json
// ---------------------------------------------------------------------------

import { FilesystemStore } from "../../../pi-keb/dist/standalone/extensions/kb/adapters/filesystem-store.js";

/** @type {FilesystemStore} */
const store = new FilesystemStore();

// ---------------------------------------------------------------------------
// Re-export pi-keb workspace utilities for signup flow
// ---------------------------------------------------------------------------

/**
 * Create a named workspace. Idempotent — returns false if already exists.
 * Delegates to pi-keb's FilesystemStore.ensureKbDir().
 * @param {string} name - Workspace name (slugified username)
 * @returns {boolean} true if newly created, false if already existed
 */
export function ensureWorkspace(name) {
  return store.ensureKbDir(name);
}

/**
 * Check whether a workspace exists.
 * @param {string} name
 * @returns {boolean}
 */
export function workspaceExists(name) {
  return store.workspaceExists(name);
}

// ---------------------------------------------------------------------------
// Public factory — KbStore port
// ---------------------------------------------------------------------------

/**
 * Create a pi-keb-backed KbStore adapter.
 * @returns {import('../ports/kb-store.js').KbStore}
 */
export function createPiKbStore() {
  return {
    readRegistry(workspace) {
      return store.readRegistry(workspace);
    },

    readIndex(workspace) {
      return store.readIndex(workspace);
    },

    listSummaries(workspace) {
      return store.listSummaries(workspace);
    },

    readSummary(name, workspace) {
      return store.readSummary(name, workspace);
    },

    listConcepts(workspace) {
      return store.listConcepts(workspace);
    },

    readConcept(slug, workspace) {
      const c = store.readConcept(slug, workspace);
      if (!c) return null;
      return {
        slug: c.slug,
        sources: c.sources,
        updated: c.dateAdded ?? "",
        content: c.body,
      };
    },

    listWorkspaces() {
      return store.listWorkspaces();
    },

    countDocuments(workspace) {
      return Object.keys(store.readRegistry(workspace)).length;
    },

    ensureWorkspace(name) {
      return store.ensureKbDir(name);
    },

    clearWorkspace(workspace) {
      return store.clearWorkspace(workspace);
    },

    buildSyncData(workspace) {
      const reg = store.readRegistry(workspace);
      const summariesList = store.listSummaries(workspace);
      const conceptsList = store.listConcepts(workspace);

      /** @type {Object<string, import('../ports/kb-store.js').SummaryEntry>} */
      const summaries = {};
      for (const name of summariesList) {
        const raw = store.readSummary(name, workspace);
        if (!raw) continue;
        // Parse pi-keb summary frontmatter: source, date_added
        let source = "",
          added = "",
          content = raw;
        if (raw.startsWith("---")) {
          const end = raw.indexOf("---", 3);
          if (end !== -1) {
            const fm = raw.slice(3, end);
            content = raw.slice(end + 3).trimStart();
            for (const line of fm.split("\n")) {
              const t = line.trim();
              if (t.startsWith("source:"))
                source = t
                  .slice("source:".length)
                  .trim()
                  .replace(/^["']|["']$/g, "");
              else if (t.startsWith("date_added:"))
                added = t
                  .slice("date_added:".length)
                  .trim()
                  .replace(/^["']|["']$/g, "");
            }
          }
        }
        summaries[name] = { content, source, added };
      }

      /** @type {Object<string, import('../ports/kb-store.js').ConceptPage>} */
      const concepts = {};
      for (const slug of conceptsList) {
        const c = store.readConcept(slug, workspace);
        if (!c) continue;
        concepts[slug] = {
          slug: c.slug,
          sources: c.sources,
          updated: c.dateAdded ?? "",
          content: c.body,
        };
      }

      return {
        registry: reg,
        index: store.readIndex(workspace),
        summaries,
        concepts,
        workspaces: store.listWorkspaces(),
      };
    },
  };
}
