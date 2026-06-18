# OKF Migration Plan

**Migrate pi-keb and the Keb stack from proprietary format to [Open Knowledge Format v0.1](OKF_SPEC.md).**

---

## 1. Motivation

pi-keb's current on-disk format uses a custom frontmatter schema, proprietary `[[wiki-link]]` syntax, code-generated footers, and a separate `registry.json`. OKF standardizes all of this: YAML frontmatter with a required `type` field, standard markdown links, and reserved filenames (`index.md`, `log.md`). Migrating makes the knowledge base:

- **Interoperable** — any OKF-compatible tool can read/write pi-keb bundles.
- **Self-describing** — no `registry.json` needed; metadata lives in frontmatter.
- **Simpler** — removes code-generated footers, wiki-link parsing, and frontmatter custom schemas.
- **Forward-compatible** — pi-keb becomes a reference implementation of OKF.

---

## 2. Scope

This plan covers all 4 layers of the Keb stack:

| Layer | Package | Impact |
|---|---|---|
| **1. pi-keb extension** | `packages/pi-keb/extensions/keb/` | High — file format rewrite |
| **2. Bridge** | `packages/bridge/src/` | Medium — sync data parsing |
| **3. Chrome Extension** | `packages/extension/src/` | Low — rendering adapts |
| **4. Migration tooling** | `packages/pi-keb/scripts/` | New — one-time conversion |

---

## 3. Format Mapping

### 3.1 Summaries

Current (pi-keb):

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

OKF + Keb producer keys:

```markdown
---
type: Summary
title: Architecture
description: Key architectural decisions and patterns in the codebase.
resource: https://github.com/org/repo/blob/main/docs/architecture.md
tags: [architecture, design]
timestamp: 2026-05-26T14:30:00Z
keb_name: "architecture"
keb_source: "architecture.md"
---

<summary prose>

The [caching strategy](/concepts/caching-strategy.md) is documented as a separate concept.
```

**Changes:**
- **Standard OKF fields** added: `type: Summary` (required), `title`, `description`, `resource`, `tags`, `timestamp`
- **Keb producer keys** (prefixed `keb_`): `name` → `keb_name`, `source` → `keb_source`
- `date_added` is captured in `timestamp`
- Code-generated `**Concepts**` footer is **removed** — cross-reference links go in the body as standard markdown
- `[[concept/foo]]` → `/concepts/foo.md` (bundle-relative, the `wiki/` directory is the bundle root)
- `[[summary/bar]]` → `/summaries/bar.md`

### 3.2 Concepts

Current (pi-keb):

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

OKF + Keb producer keys:

```markdown
---
type: Concept
title: Caching Strategy
description: How caching is implemented across the architecture and design.
tags: [caching, performance]
timestamp: 2026-05-26T14:30:00Z
keb_name: "caching-strategy"
keb_sources: ["summary/architecture", "summary/design"]
keb_needs_review: false
---

<concept prose>

This concept synthesizes information from the [architecture](/summaries/architecture.md)
and [design](/summaries/design.md) documents.
```

**Changes:**
- **Standard OKF fields** added: `type: Concept` (required), `title`, `description`, `tags`, `timestamp`
- **Keb producer keys**: `name` → `keb_name`, `sources` → `keb_sources`, `needs_review` → `keb_needs_review`
- `date_added` → captured in `timestamp`
- Code-generated `**Sources**` footer **removed** — sources are in frontmatter and body links
- `[[summary/foo]]` → `/summaries/foo.md`

### 3.3 Index

Current (pi-keb):

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

**Kept as thin operational cache, deprecated long-term.** The registry's operational data (compilation tracking, dedup) stays in `registry.json` to avoid disrupting the compilation lifecycle. Over time, these concerns can move into frontmatter producer keys or filesystem checks.

| registry.json field | OKF destination |
|---|---|
| `name` (filename) | `keb_name` in summary frontmatter |
| `originalPath` | `resource` + `keb_source` in summary frontmatter |
| `docName` (slug) | `keb_name` |
| `addedAt` | `timestamp` |
| `compiled` | kept in registry.json (operational, not knowledge) |
| `lastCompiledAt` | kept in registry.json |
| hash key | kept in registry.json (dedup) |

### 3.5 Source directory (`source/`)

**Unchanged.** The `source/` directory is a pi-keb convention, not part of the wiki itself. It can remain as-is — OKF is intentionally silent about non-reserved files (§3.1 only reserves `.md` files named `index.md` and `log.md`).

### 3.6 Bundle root

The `wiki/` directory **is** the OKF bundle root. It contains:
- `wiki/index.md` — directory listing
- `wiki/log.md` — update history (new)
- `wiki/summaries/<docName>.md` — concept documents (type: Summary)
- `wiki/concepts/<slug>.md` — concept documents (type: Concept)

All bundle-relative links (`/summaries/foo.md`, `/concepts/bar.md`) resolve from `wiki/`. The `source/` directory and `registry.json` sit outside the bundle.

### 3.7 New file: `log.md`

OKF §7 defines an optional `log.md` at any level. Post-migration, `wiki/log.md` is created:

```markdown
# Workspace Update Log

## 2026-06-13
* **Migration**: Converted to OKF v0.1 format.
* **Update**: Re-indexed all concepts with OKF frontmatter.

## 2026-05-26
* **Creation**: Added architecture summary and caching-strategy concept.
```

---

## 4. Field Mapping Reference

### Summary frontmatter

| Legacy pi-keb | OKF standard | Keb producer | Source |
|---|---|---|---|
| `name` | — | `keb_name` | `docName` param |
| `source` | — | `keb_source` | `originalName` param (filename in `source/`) |
| `date_added` | `timestamp` | — | `addedAt` param |
| — | `type: "Summary"` | — | Hardcoded (`writeSummary` always sets this) |
| — | `title` | — | From LLM (via tool param) |
| — | `description` | — | From LLM (via tool param) |
| — | `resource` | — | From registry `originalPath` (URL or file path) |
| — | `tags` | — | From LLM (via tool param) |

### Concept frontmatter

| Legacy pi-keb | OKF standard | Keb producer | Source |
|---|---|---|---|
| `name` | — | `keb_name` | `slug` param |
| `sources` | — | `keb_sources` | `sources` param |
| `needs_review` | — | `keb_needs_review` | `needsReview` param |
| `date_added` | `timestamp` | — | Auto-generated (ISO now on write) |
| — | `type: "Concept"` | — | Hardcoded (`writeConcept` always sets this) |
| — | `title` | — | From LLM (via tool param) |
| — | `description` | — | From LLM (via tool param) |
| — | `tags` | — | From LLM (via tool param) |

---

## 5. Layer-by-Layer Implementation Plan

### Layer 1: pi-keb FilesystemStore (`packages/pi-keb/extensions/keb/`)

#### 5.1 Frontmatter helpers

Add pure functions to `utils.ts`:

```typescript
function buildOkfFrontmatter(fields: Record<string, any>): string
function parseOkfFrontmatter(raw: string): { frontmatter: Record<string, any>, body: string }
```

These are format-aware but side-effect-free. They handle:
- `---` delimiters
- Required `type` field (validate presence)
- All string values **always quoted** to avoid YAML parsing issues with colons, asterisks, etc.
- Serialization/deserialization of YAML lists (`tags`, `keb_sources`)

#### 5.2 Files changes in `filesystem-store.ts`

| Method | Change |
|---|---|
| `writeSummary()` | Emit standard OKF fields + `keb_name`, `keb_source`. Accept new params: `title?`, `description?`, `resource?`, `tags?`. **Remove** code-generated footer (`buildSummaryFooter`). |
| `readSummary()` | Parse frontmatter. Try `keb_*` keys first; fall back to bare legacy keys (`name`, `source`). Strip footer from body if present (legacy files). Return body without frontmatter. |
| `writeConcept()` | Emit standard OKF fields + `keb_name`, `keb_sources`, `keb_needs_review`. Accept new params: `title?`, `description?`, `tags?`. **Remove** code-generated footer (`buildConceptFooter`). |
| `readConcept()` | Parse frontmatter. Try `keb_*` keys first; fall back to bare legacy keys. Strip footer from body if present. Return `ConceptInfo`. |
| `writeIndex()` | Generate OKF-style `index.md` with standard markdown links, using `description` from frontmatter. |
| `readIndex()` | Unchanged (returns raw string). |
| `readRegistry()` / `writeRegistry()` | Kept — thin operational cache. No new fields added. |
| `isUrlInRegistry()` / `findByUrl()` | Unchanged — still use registry for dedup. |
| `syncSummaryFooters()` | **Remove entirely** — no footers to sync. |
| `extractConceptLinks()` / `buildSummaryFooter()` / `buildConceptFooter()` | **Remove entirely.** |

#### 5.3 Files changes in `tools.ts`

| Tool | Change |
|---|---|
| `keb_write_summary` | Accept optional `title`, `description`, `tags` params. Pass to `store.writeSummary()`. |
| `keb_write_concept` | Accept optional `title`, `description`, `tags` params. Pass to `store.writeConcept()`. `type` defaults to `"Concept"` automatically. |
| `keb_update_concept` | Same — accept optional OKF fields, pass through on write. |
| `keb_update_index` | Generate OKF-style index. **Remove** `syncSummaryFooters()` call and import. |
| `keb_read_concept` | Show `title`, `tags` in output header alongside sources. |
| `keb_set_docname` | No change (filename rename logic unaffected). |

#### 5.4 Files changes in `prompts.ts`

Update compile instructions:

- Replace `[[wiki-link]]` references with standard markdown: `/concepts/foo.md`
- Add: "Use standard markdown links: `[text](/concepts/foo.md)`"
- Add: "Include a brief `description` in the frontmatter — it feeds the index"
- Add: "Use `tags` for cross-cutting categorization"
- Remove: "Do NOT write footer sections — they are generated automatically" (no more footers)
- `buildQueryPrompt`: Change "NEVER use [[wiki-links]]" → "Use standard markdown links"

#### 5.5 Type changes in `ports/types.ts`

```typescript
export interface ConceptInfo {
  slug: string;
  sources: string[];
  dateAdded?: string;
  needsReview: boolean;
  body: string;
  // OKF fields (optional, populated from frontmatter)
  title?: string;
  description?: string;
  tags?: string[];
}
```

`writeSummary` signature update:
```typescript
writeSummary(
  docName: string, content: string, originalName: string, addedAt: string,
  workspace?: string,
  okfFields?: { title?: string; description?: string; resource?: string; tags?: string[] }
): void;
```

`writeConcept` signature update:
```typescript
writeConcept(
  slug: string, content: string, sources: string[],
  workspace?: string, needsReview?: boolean,
  okfFields?: { title?: string; description?: string; tags?: string[] }
): void;
```

### Layer 2: Bridge (`packages/bridge/src/`)

#### 5.6 `adapters/pi-keb-store.js`

`buildSyncData()` currently parses custom frontmatter to extract `source` and `added` for summaries, and `sources`, `updated`, `content` for concepts. Update to:

1. Try `keb_*` keys first (post-migration format): `keb_source`, `keb_sources`, `timestamp`
2. Fall back to legacy keys (`source`, `sources`, `date_added`) if `keb_*` absent
3. Map fields:
   - `keb_source` or `source` → `SummaryEntry.source`
   - `timestamp` or `date_added` → `SummaryEntry.added` / `ConceptPage.updated`
   - `keb_sources` or `sources` → `ConceptPage.sources`

No handler changes needed — they call `spawnPi` which communicates with pi-keb internally.

### Layer 3: Chrome Extension (`packages/extension/src/`)

#### 5.7 `lib/store.ts`

Add optional fields to `Summary` and `Concept` interfaces:

```typescript
export interface Summary {
  content: string;
  source: string;
  added: string;
  title?: string;
  description?: string;
  tags?: string[];
}

export interface Concept {
  content: string;
  sources: string[];
  updated: string;
  title?: string;
  description?: string;
  tags?: string[];
}
```

#### 5.8 `sidepanel/components/BrowsePanel.tsx`

- `stripFrontmatterAndFooter()`: existing footer-strip patterns are harmless no-ops on post-migration files (no footers). No code change required. Legacy files still handled correctly during transition.
- Optional: show `title` and `tags` as badges in the detail view.

### Layer 4: Migration Tooling

#### 5.9 New script: `packages/pi-keb/scripts/migrate-to-okf.ts`

A one-time TypeScript script (run with `npx tsx`) that:

1. **Discovers all workspaces** under `~/.pi/agent/keb/`
2. **For each workspace:**
   a. Reads existing `registry.json` to build metadata lookup
   b. For each summary in `wiki/summaries/`:
      - Parse existing frontmatter (`name`, `source`, `date_added`)
      - Build new frontmatter with standard OKF fields + `keb_name`, `keb_source`
      - Convert `[[concept/foo]]` → `[foo](/concepts/foo.md)` in body
      - Convert `[[summary/bar]]` → `[bar](/summaries/bar.md)` in body
      - Handle `[[link|text]]` and `[[link#fragment]]` variants
      - Strip code-generated `---\n**Concepts**` footer
      - Write back
   c. For each concept in `wiki/concepts/`:
      - Parse existing frontmatter (`name`, `sources`, `date_added`, `needs_review`)
      - Build new frontmatter with standard OKF fields + `keb_name`, `keb_sources`, `keb_needs_review`
      - Strip code-generated `---\n**Sources**` footer
      - Write back
   d. Rewrite `wiki/index.md` to OKF format (standard links with descriptions from frontmatter)
   e. Generate `wiki/log.md` with migration entry (OKF §7 format)
   f. **Optionally** archive `registry.json` (or leave as thin cache)
3. **Reports**:
   - Count of files migrated
   - Any files that failed to parse
   - Any broken links detected
   - Wiki-link patterns that didn't match expected variants

---

## 6. Backward Compatibility

### 6.1 Read-path fallback

During migration (and for a grace period after), the `FilesystemStore` **read methods** detect format:

```
Read summary/concept file:
  → Parse YAML frontmatter
  → If has "type" key: use OKF fields (keb_* for Keb-specific)
  → If no "type": fall back to legacy pi-keb parser (bare name/source/sources keys)
  → Return unified ConceptInfo
```

This means:
- Post-migration workspaces read correctly from the start
- Pre-migration workspaces still work without changes
- The migration script can be run workspace-by-workspace

### 6.2 Write-path consistency

**Write methods always write OKF format** with `keb_`-prefixed producer keys. This means:
- After the code change is deployed, `/keb-add` creates OKF files
- Existing (pre-migration) files are left untouched until migrated
- The migration script converts existing files in-place

### 6.3 Rollback

If OKF causes issues:
1. Revert the `FilesystemStore` code changes
2. Run a reverse migration script (OKF → legacy) on converted workspaces
3. Or keep a git snapshot of the workspace before migration

---

## 7. Phasing

### Phase 1 — pi-keb format layer (Layer 1)
- Rewrite `filesystem-store.ts`: frontmatter, index format, footer removal
- Update `utils.ts`: helpers, `buildIndexContent` → OKF index
- Update `types.ts`: add fields, update write method signatures
- Update `tools.ts`: wire new methods, remove footer sync
- Update `prompts.ts`: OKF conventions

**Verify:** `/keb-add` + `/keb-query` end-to-end produces OKF files. Existing KEBs still readable via fallback.

### Phase 2 — migration script (Layer 4)
- Write `migrate-to-okf.ts`
- Test on a real Keb workspace
- Handle edge cases: empty Keb, partially compiled docs, removed docs, wiki-link variants

### Phase 3 — bridge sync layer (Layer 2)
- Update `pi-keb-store.js` frontmatter parsing in `buildSyncData()` with `keb_*`/legacy fallback
- Verify extension sync works with both OKF and legacy workspaces

### Phase 4 — extension rendering (Layer 3)
- Add optional `title`/`description`/`tags` to store types
- Optionally show `tags` as badges in `BrowsePanel.tsx`

---

## 8. File Change Summary

| File | Phase | Change |
|---|---|---|
| `pi-keb/.../adapters/filesystem-store.ts` | 1 | Rewrite frontmatter read/write with `keb_` prefix + standard OKF fields; remove footer generation, `syncSummaryFooters`, helper functions |
| `pi-keb/.../ports/types.ts` | 1 | Add `title`/`description`/`tags` to `ConceptInfo`; update `writeSummary`/`writeConcept` signatures |
| `pi-keb/.../utils.ts` | 1 | Add `buildOkfFrontmatter`, `parseOkfFrontmatter`; update `buildIndexContent` for standard links |
| `pi-keb/.../tools.ts` | 1 | Accept optional OKF params; remove `syncSummaryFooters` import+call |
| `pi-keb/.../prompts.ts` | 1 | Update instructions for standard markdown links, `description`, `tags` |
| `pi-keb/scripts/migrate-to-okf.ts` | **New** (2) | One-time migration script (TypeScript, run with `npx tsx`) |
| `bridge/.../adapters/pi-keb-store.js` | 3 | Parse `keb_*` frontmatter keys with legacy fallback in `buildSyncData` |
| `extension/.../lib/store.ts` | 4 | Add optional `title`/`description`/`tags` to `Summary`/`Concept` |
| `extension/.../BrowsePanel.tsx` | 4 | Optional: show `tags` badges in detail view |

---

## 9. Out of Scope

- **`js-yaml` dependency** — Manual string parsing is sufficient for the simple key-value and list fields pi-keb uses. All string values are quoted on write, avoiding YAML edge cases.
- **Moving `source/` to `references/`** — Deferred. OKF is silent about non-reserved files.
- **Bridge-integrated `log.md` entries** — Deferred. Migration script creates initial entry; bridge append on add/remove is future work.
- **`index.md` progressive disclosure pattern** (OKF §6) — pi-keb's flat index with two sections (Documents, Concepts) is compatible. No structural change needed.
