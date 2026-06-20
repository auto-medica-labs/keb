# OKF Migration Plan

**Migrate pi-keb and the Keb stack from proprietary format to [Open Knowledge Format v0.1](OKF_SPEC.md).**

**Strategy:** Fresh start — users delete `~/.pi/agent/keb/` before using the updated code. No migration script, no backward-compatible fallback, no legacy format support.

---

## 1. Motivation

pi-keb's current on-disk format uses a custom frontmatter schema, proprietary `[[wiki-link]]` syntax, code-generated footers, and a separate `registry.json`. OKF standardizes all of this: YAML frontmatter with a required `type` field, standard markdown links, and reserved filenames (`index.md`, `log.md`). Migrating makes the knowledge base:

- **Interoperable** — any OKF-compatible tool can read/write pi-keb bundles.
- **Self-describing** — no `registry.json` needed; metadata lives in frontmatter.
- **Simpler** — removes code-generated footers, wiki-link parsing, and frontmatter custom schemas.
- **Forward-compatible** — pi-keb becomes a reference implementation of OKF.

---

## 2. Scope

This plan covers all 3 layers of the Keb stack (Layer 4 / migration tooling was dropped):

| Layer | Package | Impact |
|---|---|---|
| **1. pi-keb extension** | `packages/pi-keb/extensions/keb/` | High — file format rewrite, dead code removal |
| **2. Bridge** | `packages/bridge/src/` | Low — OKF-only sync data parsing |
| **3. Chrome Extension** | `packages/extension/src/` | Low — optional rendering polish |

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
- `wiki/log.md` — update history (new — created on `ensureKebDir`)
- `wiki/summaries/<docName>.md` — concept documents (type: Summary)
- `wiki/concepts/<slug>.md` — concept documents (type: Concept)

All bundle-relative links (`/summaries/foo.md`, `/concepts/bar.md`) resolve from `wiki/`. The `source/` directory and `registry.json` sit outside the bundle.

### 3.7 New file: `log.md`

OKF §7 defines an optional `log.md` at any level. On `ensureKebDir()`, `wiki/log.md` is created:

```markdown
# Workspace Update Log

## 2026-06-20
* **Creation**: Workspace initialized with OKF v0.1 format.
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

### ✅ Layer 1: pi-keb FilesystemStore (`packages/pi-keb/extensions/keb/`) — COMPLETE

#### 5.1 Frontmatter helpers

Added `buildOkfFrontmatter()` and `parseOkfFrontmatter()` to `utils.ts`:

- `buildOkfFrontmatter(fields)` — serializes key-value map into `---`-delimited YAML. All string values double-quoted (avoids YAML edge cases), arrays as inline `[val1, val2]`, booleans unquoted, null/undefined skipped.
- `parseOkfFrontmatter(raw)` — parses `---`-delimited frontmatter block, returns `{ frontmatter, body }`. Handles arrays, booleans, quoted strings.

#### 5.2 Changes in `filesystem-store.ts`

| Method | Change |
|---|---|
| `writeSummary()` | Emits OKF frontmatter (`type: Summary`, `timestamp`, `keb_name`, `keb_source`, plus optional `title`, `description`, `resource`, `tags`). **No footer.** |
| `readSummary()` | **Unchanged** — still returns raw file content (frontmatter included). Bridge parses frontmatter in Phase 2; LLM reads raw content via tool. |
| `writeConcept()` | Emits OKF frontmatter (`type: Concept`, `timestamp`, `keb_name`, `keb_sources`, `keb_needs_review`, plus optional `title`, `description`, `tags`). **No footer.** |
| `readConcept()` | Uses `parseOkfFrontmatter`. Returns `ConceptInfo` with `title`/`description`/`tags` populated from frontmatter. **No footer stripping.** |
| `ensureKebDir()` | Also creates `wiki/log.md` with initial entry (`# Workspace Update Log`). |
| **Removed** | `syncSummaryFooters()`, `extractConceptLinks()`, `buildSummaryFooter()`, `buildConceptFooter()`, `extractDocNameFromSource()`, `export { syncSummaryFooters }` |

#### 5.3 Changes in `tools.ts`

| Tool | Change |
|---|---|
| `keb_write_summary` | Accepts optional `title`, `description`, `tags` params. Passed to `store.writeSummary()` as `okfFields`. |
| `keb_write_concept` | Accepts optional `title`, `description`, `tags` params. Passed to `store.writeConcept()` as `okfFields`. |
| `keb_update_concept` | Accepts optional OKF fields. Merges with existing concept's fields (new overrides old). Passes preserved fields on write. |
| `keb_update_index` | Generates OKF-style index: `[slug](/summaries/slug.md) — brief`. **Removed** `syncSummaryFooters()` import and call. Updated `parseIndexBriefs()` regex for standard markdown links. |
| `keb_read_concept` | Shows `title`, `tags` in output header alongside sources. |
| `keb_set_docname` | No change. |

#### 5.4 Changes in `prompts.ts`

- All `[[wiki-link]]` references replaced with standard markdown: `/concepts/foo.md`, `/summaries/bar.md`
- Added: "Use standard markdown links"
- Added: "Include a brief `description` in the frontmatter"
- Added: "Use `tags` for cross-cutting categorization"
- Removed: "Do NOT write footer sections — they are generated automatically"
- `buildQueryPrompt`: "NEVER use [[wiki-links]]" → "Use standard markdown links"
- `buildRemovePrompt`: "never [[wiki-links]]" → "Use standard markdown links"

#### 5.5 Changes in `commands/queries.ts`

- `/keb:list` output: `[[summary/${name}]]` → `` `summary/${name}` ``, `[[concept/${slug}]]` → `` `concept/${slug}` ``

#### 5.6 Type changes in `ports/types.ts`

- `ConceptInfo` gained `title?`, `description?`, `tags?`
- `writeSummary()` gained optional `okfFields` param
- `writeConcept()` gained optional `okfFields` param

#### 5.7 Test changes in `tools.test.ts`

- Removed `import { syncSummaryFooters }`
- Removed `describe("syncSummaryFooters")` block
- `writeSummary` tests: assert OKF frontmatter (`type: Summary`, `keb_name`, `keb_source`, `timestamp`), assert absence of `**Concepts**` footer
- `writeConcept` tests: assert OKF frontmatter (`type: Concept`, `keb_name`, `keb_sources`, `keb_needs_review`), assert absence of `**Sources**` footer
- Added tests for optional OKF fields (`title`, `description`, `tags`)
- All **9 tests pass**, TypeScript compiles cleanly

### ✅ Layer 2: Bridge (`packages/bridge/src/`) — COMPLETE

#### 5.8 `adapters/pi-keb-store.js` — DONE

`buildSyncData()` summary-parsing loop updated to use `parseOkfFrontmatter()` from pi-keb's utils. Reads OKF keys `keb_source` → `SummaryEntry.source`, `timestamp` → `SummaryEntry.added`. No legacy fallback.

| OKF key | → bridge type field |
|---|---|
| `keb_source` | `SummaryEntry.source` |
| `keb_sources` | `ConceptPage.sources` (unchanged — already read via `store.readConcept()` which returns OKF-parsed data) |
| `timestamp` | `SummaryEntry.added` / `ConceptPage.updated` |

**Changes:**
- Added `import { parseOkfFrontmatter }` from pi-keb dist utils
- Replaced 14-line manual frontmatter string-slicing with a 6-line `parseOkfFrontmatter` call
- `node --check` passes cleanly

**No handler changes needed** — they call `spawnPi` (which communicates with pi-keb internally) or `buildSyncData` (the only method touched).

### 🔜 Layer 3: Chrome Extension (`packages/extension/src/`)

#### 5.9 `lib/store.ts` — NOT STARTED

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

#### 5.10 `sidepanel/components/BrowsePanel.tsx` — NOT STARTED

- Simplify `stripFrontmatterAndFooter()` → `stripFrontmatter()`: remove the footer-strip patterns (`**Concepts**`, `**Sources**`, etc.) — OKF files have no footers.
- Optional: show `title` and `tags` as badges in the detail view.

---

## 6. Phasing

### ✅ Phase 1 — pi-keb format layer (Layer 1) — COMPLETE

The core change. Everything is downstream of this.

| File | Change | Status |
|---|---|---|
| `ports/types.ts` | Add `title`/`description`/`tags` to `ConceptInfo`; update `writeSummary`/`writeConcept` signatures | ✅ Done |
| `utils.ts` | Add `buildOkfFrontmatter`, `parseOkfFrontmatter`; update `buildIndexContent` for standard links | ✅ Done |
| `adapters/filesystem-store.ts` | Rewrite frontmatter read/write with OKF fields + `keb_*` prefix; remove footer generation, `syncSummaryFooters`, helper functions; add `log.md` creation | ✅ Done |
| `tools.ts` | Accept optional OKF params; remove `syncSummaryFooters` import+call; update `parseIndexBriefs` | ✅ Done |
| `prompts.ts` | Update instructions for standard markdown links, `description`, `tags` | ✅ Done |
| `commands/queries.ts` | Update `/keb:list` wiki-link output to backtick format | ✅ Done |
| `tools.test.ts` | Remove footer assertions; assert OKF frontmatter; remove `syncSummaryFooters` test block | ✅ Done |

**Verify:** All 9 tests pass. TypeScript compiles cleanly (`pnpm build:pi-keb`).

### ✅ Phase 2 — bridge sync layer (Layer 2) — COMPLETE

`buildSyncData()` updated to parse OKF keys via `parseOkfFrontmatter()`. No legacy fallback.

| File | Change | Status |
|---|---|---|
| `adapters/pi-keb-store.js` | Parse `keb_source`, `keb_sources`, `timestamp` via shared `parseOkfFrontmatter` — no fallback | ✅ Done |

**Verify:** `node --check packages/bridge/src/adapters/pi-keb-store.js` passes. Extension sync works with OKF-format workspace.

### 🔜 Phase 3 — extension rendering (Layer 3) — NOT STARTED

Add optional fields to store types, simplify footer stripping, optionally show tags.

| File | Change |
|---|---|
| `lib/store.ts` | Add optional `title`/`description`/`tags` to `Summary`/`Concept` |
| `BrowsePanel.tsx` | Simplify `stripFrontmatterAndFooter` → `stripFrontmatter`; optionally show `tags` badges |

**Verify:** Browse panel loads and renders OKF files correctly.

---

## 7. File Change Summary

| File | Phase | Change | Status |
|---|---|---|---|
| `pi-keb/.../ports/types.ts` | 1 | Add `title`/`description`/`tags` to `ConceptInfo`; update `writeSummary`/`writeConcept` signatures with `okfFields` param | ✅ |
| `pi-keb/.../utils.ts` | 1 | Add `buildOkfFrontmatter`, `parseOkfFrontmatter`; update `buildIndexContent` for standard markdown links | ✅ |
| `pi-keb/.../adapters/filesystem-store.ts` | 1 | Rewrite frontmatter read/write with OKF `type` + `keb_*` keys; remove footer generation; remove `syncSummaryFooters`, `extractConceptLinks`, `buildSummaryFooter`, `buildConceptFooter`; add `log.md` creation | ✅ |
| `pi-keb/.../tools.ts` | 1 | Accept optional `title`/`description`/`tags` params; remove `syncSummaryFooters` import+calls; update `parseIndexBriefs` for standard links | ✅ |
| `pi-keb/.../prompts.ts` | 1 | Replace `[[wiki-link]]` refs with standard markdown; add description/tags guidance; remove "don't write footers" | ✅ |
| `pi-keb/.../commands/queries.ts` | 1 | Update `/keb:list` wiki-link output to backtick format | ✅ |
| `pi-keb/.../tools.test.ts` | 1 | Remove footer assertions; assert OKF frontmatter; remove `syncSummaryFooters` test block | ✅ |
| `bridge/.../adapters/pi-keb-store.js` | 2 | Parse `keb_source`, `keb_sources`, `timestamp` via `parseOkfFrontmatter` — no legacy fallback | ✅ |
| `extension/.../lib/store.ts` | 3 | Add optional `title`/`description`/`tags` to `Summary`/`Concept` | 🔜 |
| `extension/.../BrowsePanel.tsx` | 3 | Simplify footer stripping; optionally show `tags` badges | 🔜 |
| `pi-keb/scripts/migrate-to-okf.ts` | **DROPPED** | Starting fresh — no migration needed | — |

---

## 8. Out of Scope

- **`js-yaml` dependency** — Manual string parsing is sufficient for the simple key-value and list fields pi-keb uses. All string values are quoted on write, avoiding YAML edge cases.
- **Moving `source/` to `references/`** — Deferred. OKF is silent about non-reserved files.
- **Bridge-integrated `log.md` entries** — Deferred. `ensureKebDir` creates initial entry; bridge append on add/remove is future work.
- **`index.md` progressive disclosure pattern** (OKF §6) — pi-keb's flat index with two sections (Documents, Concepts) is compatible. No structural change needed.
- **Extension rendering polish** — Showing tags badges is a nice-to-have, not required for correctness.
