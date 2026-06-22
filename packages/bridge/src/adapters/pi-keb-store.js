// @ts-check

// ---------------------------------------------------------------------------
// Adapter: PiKebStore
//
// Wraps pi-keb's FilesystemStore (from the git submodule) to implement
// the bridge's KebStore port. The heavy lifting (registry reads, concept
// parsing, workspace listing, etc.) lives in pi-keb. This adapter adds
// only the bridge-specific `buildSyncData` method for the sync protocol.
//
// Requires pi-keb to be compiled first:
//   npx tsc -p tsconfig.build-pi-keb.json
// ---------------------------------------------------------------------------

import { FilesystemStore } from "../../../pi-keb/dist/standalone/extensions/keb/adapters/filesystem-store.js";
import { parseOkfFrontmatter } from "../../../pi-keb/dist/standalone/extensions/keb/utils.js";

/** @type {FilesystemStore} */
const store = new FilesystemStore();

// ---------------------------------------------------------------------------
// Re-export pi-keb workspace utilities for signup flow
// ---------------------------------------------------------------------------

/**
 * Create a named workspace. Idempotent — returns false if already exists.
 * Delegates to pi-keb's FilesystemStore.ensureKebDir().
 * @param {string} name - Workspace name (slugified username)
 * @returns {boolean} true if newly created, false if already existed
 */
export function ensureWorkspace(name) {
  return store.ensureKebDir(name);
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
// Public factory — KebStore port
// ---------------------------------------------------------------------------

/**
 * Create a pi-keb-backed KebStore adapter.
 * @returns {import('../ports/keb-store.js').KebStore}
 */
export function createPiKebStore() {
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
        title: c.title,
        description: c.description,
        tags: c.tags,
      };
    },

    listWorkspaces() {
      return store.listWorkspaces();
    },

    countDocuments(workspace) {
      return Object.keys(store.readRegistry(workspace)).length;
    },

    ensureWorkspace(name) {
      return store.ensureKebDir(name);
    },

    clearWorkspace(workspace) {
      return store.clearWorkspace(workspace);
    },

    buildSyncData(workspace) {
      const reg = store.readRegistry(workspace);
      const summariesList = store.listSummaries(workspace);
      const conceptsList = store.listConcepts(workspace);

      /** @type {Object<string, import('../ports/keb-store.js').SummaryEntry>} */
      const summaries = {};
      for (const name of summariesList) {
        const raw = store.readSummary(name, workspace);
        if (!raw) continue;
        // Parse OKF frontmatter: keb_source, timestamp
        const { frontmatter, body } = parseOkfFrontmatter(raw);
        summaries[name] = {
          content: body,
          source: frontmatter.keb_source ?? "",
          added: frontmatter.timestamp ?? "",
          title: frontmatter.title,
          description: frontmatter.description,
          tags: frontmatter.tags,
        };
      }

      /** @type {Object<string, import('../ports/keb-store.js').ConceptPage>} */
      const concepts = {};
      for (const slug of conceptsList) {
        const c = store.readConcept(slug, workspace);
        if (!c) continue;
        concepts[slug] = {
          slug: c.slug,
          sources: c.sources,
          updated: c.dateAdded ?? "",
          content: c.body,
          title: c.title,
          description: c.description,
          tags: c.tags,
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
