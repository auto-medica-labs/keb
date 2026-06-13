# OKF Migration Plan

**Migrate pi-kb and the Keb stack from proprietary format to [Open Knowledge Format v0.1](OKF_SPEC.md).**

---

## 1. Motivation

pi-kb's current on-disk format uses a custom frontmatter schema, proprietary `[[wiki-link]]` syntax, code-generated footers, and a separate `registry.json`. OKF standardizes all of this: YAML frontmatter with a required `type` field, standard markdown links, and reserved filenames (`index.md`, `log.md`). Migrating makes the knowledge base:

- **Interoperable** — any OKF-compatible tool can read/write pi-kb bundles.
- **Self-describing** — no `registry.json` needed; metadata lives in frontmatter.
- **Simpler** — removes code-generated footers, wiki-link parsing, and frontmatter custom schemas.
- **Forward-compatible** — pi-kb becomes a reference implementation of OKF.

---

## 2. Scope

This plan covers all 4 layers of the Keb stack:

| Layer | Package | Impact |
|---|---|---|
| **1. pi-kb extension** | `packages/pi-kb/extensions/kb/` | High — file format rewrite |
| **2. Bridge** | `packages/bridge/src/` | Medium — sync data parsing |
| **3. Chrome Extension** | `packages/extension/src/` | Low — rendering adapts |
| **4. Migration tooling** | `packages/pi-kb/scripts/` | New — one-time conversion |

---

## 3. Format Mapping

### 3.1 Summaries

Current (pi-kb):

```markdown
---
name: "architecture"
source: "architecture.md"
date_added: "2026-05-26T..."
---

<summary prose>

---

**Concepts**
[[concept/caching-strategy]]
```

OKF:

```markdown
---
type: Summary
title: Architecture
description: Key architectural decisions and patterns in the codebase.
resource: https://github.com/org/repo/blob/main/docs/architecture.md
tags: [architecture, design]
timestamp: 2026-05-26T14:30:00Z
okf_docname: "architecture"
okf_source: "architecture.md"
okf_sources_list: ["summary/design"]
---

<summary prose>

The [caching strategy](/concepts/caching-strategy.md) is documented as a separate concept.
```

**Changes:**
- Frontmatter gets `type: Summary` (required OKF), plus `title`, `description`, `resource`, `tags`, `timestamp`
- pi-kb-specific fields (`name`→`okf_docname`, `source`→`okf_source`, `date_added`→in `timestamp`) become producer keys (OKF §4.1 allows arbitrary extras)
- Code-generated `**Concepts**` footer is **removed** — cross-reference links go in the body as standard markdown
- `[[concept/foo]]` → `/concepts/foo.md` (bundle-relative, OKF §5.1)
- `[[summary/bar]]` → `/summaries/bar.md`

### 3.2 Concepts

Current (pi-kb):

```markdown
---
name: "caching-strategy"
sources: [summary/architecture, summary/design]
date_added: "2026-05-26T..."
needs_review: false
---

<concept prose>

---

**Sources**
[[summary/architecture]]
[[summary/design]]
```

OKF:

```markdown
---
type: Concept
title: Caching Strategy
description: How caching is implemented across the architecture and design.
tags: [caching, performance]
timestamp: 2026-05-26T14:30:00Z
okf_slug: "caching-strategy"
okf_sources: ["summary/architecture", "summary/design"]
okf_needs_review: false
---

<concept prose>

This concept synthesizes information from the [architecture](/summaries/architecture.md)
and [design](/summaries/design.md) documents.
```

**Changes:**
- Frontmatter gets `type: Concept` (required OKF)
- `name` → producer key `okf_slug`
- `sources` → producer key `okf_sources` (keeps pi-kb's source-tracking intact)
- `needs_review` → producer key `okf_needs_review` (used by `/kb-remove` lifecycle)
- `date_added` → captured in `timestamp`
- Code-generated `**Sources**` footer **removed** — sources are in frontmatter and body links
- `[[summary/foo]]` → `/summaries/foo.md`

### 3.3 Index

Current (pi-kb):

```markdown
# Knowledge Base Index

## Documents

- [[summary/architecture]] — Key architectural decisions...
- [[summary/design]] — Design rationale...

## Concepts

- [[concept/caching-strategy]] — sources: summary/architecture, summary/design
```

OKF:

```markdown
# Knowledge Base Index

## Documents

* [Architecture](/summaries/architecture.md) — Key architectural decisions and patterns.
* [Design](/summaries/design.md) — Design rationale and trade-offs.

## Concepts

* [Caching Strategy](/concepts/caching-strategy.md) — How caching is implemented across the codebase.
```

**Changes:**
- Standard markdown links instead of `[[wiki-links]]`
- Brief descriptions from `description` frontmatter field
- No synthetic `sources:` suffix — that's metadata, not index content
- Follows OKF `index.md` pattern (§6)

### 3.4 Registry (`registry.json`)

**Eliminated.** Its data is migrated into:

| registry.json field | OKF destination |
|---|---|
| `name` (filename) | `okf_docname` in summary frontmatter |
| `originalPath` | `resource` + `okf_source` in summary frontmatter |
| `docName` (slug) | `okf_docname` |
| `addedAt` | `timestamp` in frontmatter |
| `compiled` | `okf_compiled` in workspace-level metadata or removed (compilation becomes all-or-nothing) |
| `lastCompiledAt` | Removed or merged into `log.md` |
| hash key | Removed (dedup moves to `resource`/`okf_source` comparison) |

**Note:** `compiled` tracking is a pi-kb operational concern (interrupted compilation recovery). Post-migration, the compilation lifecycle can be tracked via checked filesystem state (summary exists? concept bodies reference source?) rather than a flag. But for minimum disruption, `okf_compiled: true/false` can live as a producer key on the summary concept.

### 3.5 Source directory (`source/`)

**Unchanged.** The `source/` directory is a pi-kb convention, not part of the wiki itself. It can remain as-is — OKF is intentionally silent about non-reserved files (§3.1 only reserves `.md` files named `index.md` and `log.md`).

Alternatively, sources can be moved to `references/` (OKF §8 mentions a `references/` subdirectory) at the bundle root, making them first-class OKF concepts of type `Source Document`.

### 3.6 New file: `log.md`

OKF §7 defines an optional `log.md` at any level. Post-migration, each workspace can have:

```markdown
# Workspace Update Log

## 2026-06-13
* **Migration**: Converted to OKF v0.1 format.
* **Update**: Re-indexed all concepts with OKF frontmatter.

## 2026-05-26
* **Creation**: Added architecture summary and caching-strategy concept.
```

The bridge handler for add/remove operations appends entries here.

---

## 4. Layer-by-Layer Implementation Plan

### Layer 1: pi-kb FilesystemStore (`packages/pi-kb/extensions/kb/`)

#### 4.1 Frontmatter helpers

Add pure functions to `utils.ts`:

```typescript
function buildOkfFrontmatter(fields: Record<string, any>): string
function parseOkfFrontmatter(raw: string): { frontmatter: Record<string, any>, body: string }
```

These are format-aware but side-effect-free. They handle:
- `---` delimiters
- Required `type` field (validate presence; throw on read if missing)
- Producer key namespace (`okf_*`)
- Serialization/deserialization of YAML lists (`tags`, `okf_sources`)

#### 4.2 Files changes in `filesystem-store.ts`

| Method | Change |
|---|---|
| `writeSummary()` | Build OKF frontmatter (type: "Summary", title, description, tags, timestamp, okf_docname, okf_source). **Remove** code-generated footer. Write to `wiki/summaries/{docName}.md`. |
| `readSummary()` | Parse OKF frontmatter. Return body without frontmatter. |
| `writeConcept()` | Build OKF frontmatter (type: "Concept", title, tags, timestamp, okf_slug, okf_sources, okf_needs_review). **Remove** code-generated footer. Write to `wiki/concepts/{slug}.md`. |
| `readConcept()` | Parse OKF frontmatter. Return `ConceptInfo` with `okfType`, `title`, `description`, `tags`, `sources`, `needsReview`, `body`. |
| `writeIndex()` | Generate OKF-style `index.md` with standard markdown links, using `description` from frontmatter. |
| `readIndex()` | Unchanged (returns raw string). |
| `readRegistry()` / `writeRegistry()` | Legacy — keep for backward compatibility during migration, but deprecate. No new fields added. |
| `isUrlInRegistry()` / `findByUrl()` | Adapt to check `resource` frontmatter field instead of registry, or keep registry as thin cache. |
| `syncSummaryFooters()` | **Remove entirely** — no footers to sync. |

#### 4.3 Files changes in `tools.ts`

| Tool | Change |
|---|---|
| `kb_write_summary` | Call new `writeSummary(okfParams)`. Minor changes to parameter names/documentation. |
| `kb_write_concept` | Accept `type`, `title`, `description`, `tags` as optional parameters. Default `type` to `"Concept"`. |
| `kb_update_concept` | Same — accept OKF fields, preserve producer keys on merge. |
| `kb_update_index` | Generate OKF-style index. The LLM still passes briefs; the tool resolves them against disk. |
| `kb_set_docname` | No change (filename rename logic unaffected). |

#### 4.4 Files changes in `prompts.ts`

Update compile instructions to remove `[[wiki-link]]` references and add OKF conventions:

- "Use standard markdown links: `/concepts/caching-strategy.md`, not `[[concept/caching-strategy]]`"
- "Include a brief `description` in frontmatter — it feeds the index"
- "Use `tags` for cross-cutting categorization"

#### 4.5 Type changes in `ports/types.ts`

```typescript
export interface ConceptInfo {
  slug: string;
  sources: string[];
  dateAdded?: string;
  needsReview: boolean;
  body: string;
  // New OKF fields (optional, populated only after migration)
  okfType?: string;
  title?: string;
  description?: string;
  tags?: string[];
  resource?: string;
}
```

### Layer 2: Bridge (`packages/bridge/src/`)

#### 4.6 `adapters/pi-kb-store.js`

`buildSyncData()` currently parses custom frontmatter to extract `source` and `added` for summaries, and `sources`, `updated`, `content` for concepts. It needs to:

1. Try OKF frontmatter parsing first (look for `type` field)
2. Fall back to legacy parsing if `type` is absent (backward compat during migration)
3. Map OKF fields to the bridge's sync types:
   - `okf_source` → `SummaryEntry.source`
   - `timestamp` → `SummaryEntry.added`
   - `okf_sources` → `ConceptPage.sources`
   - `timestamp` → `ConceptPage.updated`

No handler changes needed — they call `spawnPi` which communicates with pi-kb internally.

### Layer 3: Chrome Extension (`packages/extension/src/`)

#### 4.7 `lib/store.ts`

Add optional OKF fields to `Summary` and `Concept` interfaces:

```typescript
export interface Summary {
  content: string;
  source: string;
  added: string;
  // OKF additions
  okfType?: string;
  title?: string;
  description?: string;
  tags?: string[];
}

export interface Concept {
  content: string;
  sources: string[];
  updated: string;
  // OKF additions
  okfType?: string;
  title?: string;
  description?: string;
  tags?: string[];
}
```

#### 4.8 `sidepanel/components/BrowsePanel.tsx`

- `stripFrontmatterAndFooter()` currently strips custom pi-kb frontmatter and the code-generated `---\n**Concepts**...` / `---\n**Sources**...` footers.
- Post-migration: still strips YAML frontmatter from display. **Footer strip logic becomes simpler** since there's only frontmatter to strip — bodies are clean markdown.
- Consider showing `type` and `tags` as badges in the detail view.

### Layer 4: Migration Tooling

#### 4.9 New script: `packages/pi-kb/scripts/migrate-to-okf.js`

A one-time Node.js script that:

1. **Discovers all workspaces** under `~/.pi/agent/kb/`
2. **For each workspace:**
   a. Reads existing `registry.json` to build metadata lookup
   b. For each summary in `wiki/summaries/`:
      - Parse existing frontmatter
      - Build OKF frontmatter using mapping in §3.1
      - Convert `[[concept/foo]]` → `/concepts/foo.md` in body
      - Convert `[[summary/bar]]` → `/summaries/bar.md` in body
      - Strip code-generated `---\n**Concepts**` footer
      - Write back
   c. For each concept in `wiki/concepts/`:
      - Parse existing frontmatter
      - Build OKF frontmatter using mapping in §3.2
      - Strip code-generated `---\n**Sources**` footer
      - Write back
   d. Rewrite `wiki/index.md` to OKF format using §3.3
   e. Generate/append `log.md` entry
   f. Add `okf_version: "0.1"` to workspace root (optional, per OKF §11)
   g. **Optionally** archive/remove `registry.json`
3. **Reports**:
   - Count of files migrated
   - Any files that failed to parse
   - Any broken links detected

---

## 5. Backward Compatibility

### 5.1 Read-path fallback

During migration (and for a grace period after), the `FilesystemStore` **read methods** detect format:

```
Read summary file:
  → Try OKF parser (look for "type" key in frontmatter)
  → If has "type": use OKF fields
  → If no "type": fall back to legacy pi-kb parser
  → Return unified ConceptInfo
```

This means:
- Post-migration workspaces read correctly from the start
- Pre-migration workspaces still work without changes
- The migration script can be run workspace-by-workspace

### 5.2 Write-path consistency

**Write methods always write OKF format.** This means:
- After the code change is deployed, `/kb-add` creates OKF files
- Existing (pre-migration) files are left untouched until migrated
- The migration script converts existing files in-place

### 5.3 Rollback

If OKF causes issues:
1. Revert the `FilesystemStore` code changes
2. Run a reverse migration script (OKF → legacy) on converted workspaces
3. Or keep a git snapshot of the workspace before migration

---

## 6. Phasing

### Phase 1 — pi-kb format layer (Layer 1)
- Rewrite `filesystem-store.ts`: frontmatter, index format, footer removal
- Update `utils.ts`: helpers, `buildIndexContent` → OKF index
- Update `types.ts`: add OKF fields
- Update `tools.ts`: wire new methods
- Update `prompts.ts`: OKF conventions

**Verify:** `/kb-add` + `/kb-query` end-to-end produces OKF files. Existing KBs still readable via fallback.

### Phase 2 — migration script (Layer 4)
- Write `migrate-to-okf.js`
- Test on a real KB workspace
- Handle edge cases: empty KB, partially compiled docs, removed docs

### Phase 3 — bridge sync layer (Layer 2)
- Update `pi-kb-store.js` frontmatter parsing in `buildSyncData()`
- Verify extension sync works with OKF files

### Phase 4 — extension rendering (Layer 3)
- Tweak `BrowsePanel.tsx` footer-strip logic
- Add optional `type`/`tags` display

---

## 7. Open Questions

1. **`compiled` field** — Should we keep `okf_compiled` as a producer key, or move to a different mechanism (e.g., summary existence = compiled)? Keeping it is simpler but adds a pi-kb-specific field to OKF docs.

2. **`needs_review` field** — Same question. It's critical for `/kb-remove` lifecycle. Store as `okf_needs_review` producer key.

3. **`resource` in summaries** — Should we populate `resource` with the original URL/path automatically? Currently this info is in `registry.json`. Post-migration, it should go in the summary frontmatter.

4. **`source/` directory** — Keep as-is, or migrate to OKF `references/`? If we move to `references/`, each source becomes an OKF concept of type `Source Document`. This is cleaner but a bigger change.

5. **Link conversion** — `[[concept/foo]]` → `/concepts/foo.md`. What about bare URLs or external links in existing bodies? The migration script should only touch `[[ ... ]]` patterns; everything else stays.

6. **Log file format** — Should the bridge append to `log.md` on add/remove operations, or is it purely for migration record? The OKF spec says it's optional — we can defer implementation.

---

## 8. File Change Summary

| File | Phase | Change |
|---|---|---|
| `pi-kb/.../adapters/filesystem-store.ts` | 1 | Rewrite frontmatter read/write; remove footer logic; OKF index |
| `pi-kb/.../ports/types.ts` | 1 | Add OKF fields to `ConceptInfo` |
| `pi-kb/.../utils.ts` | 1 | Add `buildOkfFrontmatter`, `parseOkfFrontmatter`; update `buildIndexContent` |
| `pi-kb/.../tools.ts` | 1 | Wire new write methods; accept OKF params |
| `pi-kb/.../prompts.ts` | 1 | Update instructions for OKF links and conventions |
| `pi-kb/scripts/migrate-to-okf.js` | **New** (2) | One-time migration script |
| `bridge/.../adapters/pi-kb-store.js` | 3 | Parse OKF frontmatter in `buildSyncData` |
| `bridge/.../ports/kb-store.js` | 3 | Optional OKF fields on `RegistryEntry` |
| `extension/.../lib/store.ts` | 4 | Add optional OKF fields to `Summary`/`Concept` |
| `extension/.../BrowsePanel.tsx` | 4 | Simplify footer strip; add `type`/`tags` display |

---

## 9. Out of Scope

- **Fixing the `index.md` progressive disclosure pattern** (OKF §6) — OKF defines a multi-section directory listing. pi-kb's flat index is compatible (one section is fine). No change needed unless we want multiple directories.
- **Adding a YAML dependency** — The current code parses frontmatter manually with string operations. OKF uses YAML which technically needs a parser. However, the current custom frontmatter is already YAML-like (colon-separated key-value). We can either:
  - Keep manual string parsing (brittle for multi-line values, but works for the simple fields pi-kb uses)
  - Add a lightweight YAML parser like `js-yaml` (cleaner, handles edge cases)
  This decision is deferred — the current parser is sufficient for OKF's simple key-value frontmatter.
- **`log.md` bridge integration** — Adding entries to `log.md` on add/remove is deferred. The migration script creates an initial log entry.
