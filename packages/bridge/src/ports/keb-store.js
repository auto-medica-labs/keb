// @ts-check

// ---------------------------------------------------------------------------
// Port: Knowledge-base storage (types & contract)
//
// Defines the domain types and the KebStore interface. An adapter
// (e.g. filesystem-keb-store) implements these operations.
// ---------------------------------------------------------------------------

/**
 * A single entry in the document registry.
 * @typedef {Object} RegistryEntry
 * @property {string} originalPath - Normalized source URL
 * @property {string} [addedAt]    - ISO timestamp when added
 * @property {string} [docName]    - Slug of the generated summary doc
 * @property {string} [hash]       - Content hash for change detection
 * @property {boolean} [compiled]  - Whether LLM compilation completed (false = interrupted)
 */

/**
 * Maps original-path keys to registry entries.
 * @typedef {Object<string, RegistryEntry>} Registry
 */

/**
 * A concept page parsed from the wiki.
 * @typedef {Object} ConceptPage
 * @property {string} slug      - URL-friendly concept identifier
 * @property {string[]} sources - Source filenames this concept was derived from
 * @property {string} updated   - ISO timestamp of last update
 * @property {string} content   - Markdown body (frontmatter stripped)
 * @property {string} [title]   - Optional display title from OKF frontmatter
 * @property {string} [description] - Optional one-line description from OKF frontmatter
 * @property {string[]} [tags]  - Optional tags from OKF frontmatter
 */

/**
 * A summary document entry.
 * @typedef {Object} SummaryEntry
 * @property {string} content - Markdown summary content
 * @property {string} source  - Original source URL or file path
 * @property {string} added   - ISO timestamp when created
 * @property {string} [title] - Optional display title from OKF frontmatter
 * @property {string} [description] - Optional one-line description from OKF frontmatter
 * @property {string[]} [tags] - Optional tags from OKF frontmatter
 */

/**
 * Complete Keb state snapshot sent to the extension on sync.
 * @typedef {Object} SyncData
 * @property {Registry} registry   - All registered documents
 * @property {string} index        - Raw index.md content
 * @property {Object<string, SummaryEntry>} summaries - Doc name → summary
 * @property {Object<string, ConceptPage>} concepts   - Slug → concept page
 * @property {string[]} workspaces - Available workspace names
 */

/**
 * Knowledge-base storage port.
 *
 * Adapters must implement every method. All methods are synchronous
 * (filesystem reads) and never throw — missing / corrupt files yield
 * empty defaults.
 *
 * @typedef {Object} KebStore
 * @property {(workspace?: string) => Registry} readRegistry
 * @property {(workspace?: string) => string} readIndex
 * @property {(workspace?: string) => string[]} listSummaries
 * @property {(name: string, workspace?: string) => string|null} readSummary
 * @property {(workspace?: string) => string[]} listConcepts
 * @property {(slug: string, workspace?: string) => ConceptPage|null} readConcept
 * @property {() => string[]} listWorkspaces
 * @property {(workspace?: string) => number} countDocuments
 * @property {(workspace?: string) => SyncData} buildSyncData
 * @property {(name: string) => boolean} ensureWorkspace
 * @property {(workspace?: string) => string} clearWorkspace - Clear all content from a workspace
 */

export {};
