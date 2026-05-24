// @ts-check

// ---------------------------------------------------------------------------
// Adapter: Filesystem KbStore
//
// Implements the KbStore port by reading pi-kb artifacts directly
// from ~/.pi/agent/kb on disk. No pi process needed for reads.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/** @type {string} */
const KB_ROOT = join(homedir(), ".pi", "agent", "kb");

/**
 * Resolve the filesystem root for a given workspace.
 * @param {string|undefined} name - Workspace name (undefined or "default" → default)
 * @returns {string} Absolute path to the workspace directory
 */
function getWorkspaceRoot(name) {
  if (!name || name === "default") return KB_ROOT;
  return join(KB_ROOT, "workspaces", name);
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Read the registry.json for a workspace.
 * @param {string} [workspace] - Workspace name
 * @returns {import('../ports/kb-store.js').Registry} Parsed registry (empty if missing)
 */
function readRegistry(workspace) {
  const p = join(getWorkspaceRoot(workspace), "registry.json");
  if (!existsSync(p)) return /** @type {import('../ports/kb-store.js').Registry} */ ({});
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return /** @type {import('../ports/kb-store.js').Registry} */ ({});
  }
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

/**
 * Read the wiki index.md for a workspace.
 * @param {string} [workspace] - Workspace name
 * @returns {string} Raw markdown content (empty string if missing)
 */
function readIndex(workspace) {
  const p = join(getWorkspaceRoot(workspace), "wiki", "index.md");
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf-8");
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

/**
 * List all summary document names in a workspace.
 * @param {string} [workspace] - Workspace name
 * @returns {string[]} Array of document name slugs (without .md extension)
 */
function listSummaries(workspace) {
  const dir = join(getWorkspaceRoot(workspace), "wiki", "summaries");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

/**
 * Read a single summary document.
 * @param {string} name - Document name slug
 * @param {string} [workspace] - Workspace name
 * @returns {string|null} Raw markdown content (null if missing)
 */
function readSummary(name, workspace) {
  const p = join(getWorkspaceRoot(workspace), "wiki", "summaries", `${name}.md`);
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf-8");
}

// ---------------------------------------------------------------------------
// Concepts
// ---------------------------------------------------------------------------

/**
 * List all concept slugs in a workspace.
 * @param {string} [workspace] - Workspace name
 * @returns {string[]} Array of concept slugs (without .md extension)
 */
function listConcepts(workspace) {
  const dir = join(getWorkspaceRoot(workspace), "wiki", "concepts");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

/**
 * Read a single concept page, parsing its YAML frontmatter.
 * @param {string} slug - Concept slug
 * @param {string} [workspace] - Workspace name
 * @returns {import('../ports/kb-store.js').ConceptPage|null} Parsed concept page (null if missing)
 */
function readConcept(slug, workspace) {
  const p = join(getWorkspaceRoot(workspace), "wiki", "concepts", `${slug}.md`);
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, "utf-8");

  /** @type {string[]} */
  let sources = [];
  /** @type {string} */
  let updated = "";
  let body = raw;

  if (raw.startsWith("---")) {
    const end = raw.indexOf("---", 3);
    if (end !== -1) {
      const fm = raw.slice(3, end);
      body = raw.slice(end + 3).trimStart();
      for (const line of fm.split("\n")) {
        const t = line.trim();
        if (t.startsWith("sources:")) {
          const m = t.match(/sources:\s*\[(.*)\]/);
          if (m)
            sources = m[1]
              .split(",")
              .map((s) => s.trim().replace(/^["']|["']$/g, ""))
              .filter(Boolean);
        } else if (t.startsWith("updated:")) {
          updated = t
            .slice("updated:".length)
            .trim()
            .replace(/^["']|["']$/g, "");
        }
      }
    }
  }
  return { slug, sources, updated, body };
}

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

/**
 * List all available workspace names.
 * @returns {string[]} Array of workspace directory names
 */
function listWorkspaces() {
  const dir = join(KB_ROOT, "workspaces");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

// ---------------------------------------------------------------------------
// Sync payload builder
// ---------------------------------------------------------------------------

/**
 * Build the full sync payload for sending to the extension.
 * Reads registry, index, all summaries, and all concepts from disk.
 * @param {string} [workspace] - Workspace name
 * @returns {import('../ports/kb-store.js').SyncData} Complete KB state snapshot
 */
function buildSyncData(workspace) {
  const reg = readRegistry(workspace);

  /** @type {Object<string, import('../ports/kb-store.js').SummaryEntry>} */
  const summaries = {};
  for (const name of listSummaries(workspace)) {
    const full = readSummary(name, workspace);
    if (!full) continue;
    let source = "",
      added = "",
      content = full;
    if (full.startsWith("---")) {
      const end = full.indexOf("---", 3);
      if (end !== -1) {
        const fm = full.slice(3, end);
        content = full.slice(end + 3).trimStart();
        for (const line of fm.split("\n")) {
          const t = line.trim();
          if (t.startsWith("source:"))
            source = t
              .slice("source:".length)
              .trim()
              .replace(/^["']|["']$/g, "");
          else if (t.startsWith("added:"))
            added = t
              .slice("added:".length)
              .trim()
              .replace(/^["']|["']$/g, "");
        }
      }
    }
    summaries[name] = { content, source, added };
  }

  /** @type {Object<string, import('../ports/kb-store.js').ConceptPage>} */
  const concepts = {};
  for (const slug of listConcepts(workspace)) {
    const c = readConcept(slug, workspace);
    if (!c) continue;
    concepts[slug] = { slug: c.slug, sources: c.sources, updated: c.updated || "", body: c.body };
  }

  return {
    registry: reg,
    index: readIndex(workspace),
    summaries,
    concepts,
    workspaces: listWorkspaces(),
  };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Create a filesystem-backed KbStore adapter.
 * @returns {import('../ports/kb-store.js').KbStore}
 */
export function createFilesystemKbStore() {
  return {
    readRegistry,
    readIndex,
    listSummaries,
    readSummary,
    listConcepts,
    readConcept,
    listWorkspaces,
    buildSyncData,
  };
}
