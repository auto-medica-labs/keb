# Plan: Import hand-authored markdown as a pi-keb workspace

**Date:** 2026-06-22\
**Status:** Draft (updated for read-only clarification)

______________________________________________________________________

## Problem

pi-keb is designed for **LLM-generated** knowledge bases: you feed it URLs or markdown files, and the LLM writes summaries and extracts concepts. This works great when you have source documents, but it's useless when a domain expert wants to write a knowledge base from scratch — no source documents to feed, no LLM opinions needed.

Currently there's no way to take a directory of hand-written `.md` files and make pi-keb treat it as a native workspace. The expert would need to:

- Know the OKF frontmatter format by heart
- Manually create `wiki/index.md` with the right syntax
- Create the right directory structure
- Understand the `keb_*` fields (which are internal plumbing)
- Work around the fact that pi-keb expects summaries, not just concepts

This friction means the entire system is inaccessible to the most valuable use case: **an expert writing down what they know**.

## Read-only nature

Imported workspaces are **read-only** — they contain only concepts, hand-authored by the expert. No source documents, no registry, no summaries. The workspace is meant for browsing (extension's Browse panel), querying (`/keb:query`), and listing (`/keb:list`, `/keb:status`).

**Operations that work without issue:**

| Operation              | How                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/keb:query`           | The LLM reads the index, then reads relevant concepts. If it tries `keb_read_summary` on a non-existent summary, the tool returns "not found" — LLM adapts gracefully. |
| `/keb:list`            | Shows concepts with `sources: ?` because there's no registry. Cosmetic only.                                                                                           |
| `/keb:status`          | Shows correct concept count, `Last add: never`.                                                                                                                        |
| Extension Browse panel | Concepts render with tags and markdown content via `MarkdownRenderer`.                                                                                                 |
| Extension sync         | `buildSyncData()` reads empty registry + populated concepts independently.                                                                                             |

**Should NOT be used (no enforcement):**

| Operation                      | Why                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/keb:add` / `keb:add:content` | Would create a registry entry, source doc, summary, and LLM concepts mixed with hand-authored ones. The LLM may `keb_update_concept` and overwrite hand-authored content. |
| `/keb:remove`                  | Blocked naturally — registry is empty, no docName to look up.                                                                                                             |
| `/keb:repair`                  | Blocked naturally — scans for `compiled === false` entries in registry (none).                                                                                            |

No code enforcement is planned. The tool is for creating read-only knowledge bases; if you need an LLM-compiled workspace, use pi-keb's normal workflow instead.

## Goal

A CLI tool that compiles a directory of plain markdown files (written by a human expert) into a pi-keb compatible **read-only** workspace. The expert writes only content — no frontmatter, no registry, no directory structure — and the tool produces a workspace that `/keb:query`, `/keb:list`, `/keb:status`, and the Chrome extension's Browse panel all treat as native.

The workspace is intended for **reading only**. No `/keb:add`, `/keb:add:content`, or other mutation operations should be used against it. The tool creates only concepts and an index — no registry, no source directory, no summaries.

## Non-goals

- **LLM involvement.** The tool is purely deterministic — no AI, no API calls, no pi child processes.
- **Summary generation.** The tool outputs concepts only. Summaries are pi-keb's bookkeeping for source documents; hand-authored KBs have no source documents.
- **Registry generation.** The tool skips `registry.json`. `/keb:list` shows `?` for source info (cosmetic only).
- **Incremental updates.** The tool is write-once. To update a concept, edit the source file and re-run. No merge/diff logic.
- **Mutation support.** The tool does NOT create workspaces compatible with `/keb:add`. Imported workspaces are read-only. If the user later wants an LLM-compiled workspace, they create a separate one via the normal pi-keb workflow.

## Input format

A directory of `.md` files, one per concept. The filename **is** the concept slug.

```
my-knowledge/
├── caching.md
├── error-handling.md
├── deployment.md
└── load-balancing.md
```

Each file is pure markdown with **no frontmatter required**. Every input file **must** follow two rules:

1. Must contain a `# ` heading (level-1 heading)
1. Must contain a `>` blockquote immediately or shortly after the heading

Files that fail either rule are skipped with an error message explaining why.

The tool extracts metadata from structure:

```markdown
---
tags: [redis, performance]
---

# Caching Strategy

> Caching uses a write-through strategy with Redis. Every write goes to
> both cache and DB simultaneously to ensure consistency.

## Key Decisions

- **TTL:** 5 minutes for most data, 30 seconds for session data
- **Invalidation:** On write, the cache key is invalidated immediately

See [deployment](/concepts/deployment.md) for Redis cluster setup.
```

**Extraction rules:**

| Attribute     | Source                                                                      | Required                           |
| ------------- | --------------------------------------------------------------------------- | ---------------------------------- |
| `title`       | First `# ` heading                                                          | ✅ **Yes** — fail if missing       |
| `description` | First `>` blockquote after heading (strip `> ` prefix, join multiline)      | ✅ **Yes** — fail if missing       |
| `body`        | Everything after the heading                                                | —                                  |
| `tags`        | Optional YAML frontmatter `tags: [...]` at file start, or `--tags` CLI flag | No — defaults to `[]`              |
| `slug`        | Filename without `.md`, slugified                                           | ✅ **Yes** — derived automatically |

Multiline blockquotes are joined into a single description string:

```markdown
> This is a multi-line
> blockquote description.
```

→ `"This is a multi-line blockquote description."`

**Optional frontmatter** is allowed for per-concept tags or override:

```markdown
---
tags: [redis, performance]
---

# Caching Strategy

> Caching uses a write-through strategy with Redis.
...
```

### Invalid inputs

- Files without `.md` extension → silently skipped
- Empty files → skipped with a warning
- Files missing `# ` heading → skipped with error: `Missing # heading in <filename>`
- Files missing `>` blockquote after heading → skipped with error: `Missing > blockquote after heading in <filename>`
- Files where the slug contains special characters → rejected with an error message showing valid slug pattern
- Slug collisions (two files producing the same slug) → error listing the conflicting filenames

## Output format

```
~/.pi/agent/keb/workspaces/<name>/
├── .keb-readonly                 ← marker: this workspace is read-only
└── wiki/
    ├── index.md
    └── concepts/
        ├── caching.md
        ├── error-handling.md
        ├── deployment.md
        └── load-balancing.md
```

### Concept page (`wiki/concepts/<slug>.md`)

```markdown
---
type: Concept
title: "Caching Strategy"
description: "Caching uses a write-through strategy with Redis. Every write goes to both cache and DB simultaneously to ensure consistency."
tags: ["redis", "performance"]
timestamp: "2026-06-21T10:00:00.000Z"
keb_name: "caching"
keb_sources: []
keb_needs_review: false
---

# Caching Strategy

> Caching uses a write-through strategy with Redis. Every write goes to
> both cache and DB simultaneously to ensure consistency.

## Key Decisions

- **TTL:** 5 minutes for most data, 30 seconds for session data
- **Invalidation:** On write, the cache key is invalidated immediately
```

Field rationale:

| Field              | Value                                         | Why                                            |
| ------------------ | --------------------------------------------- | ---------------------------------------------- |
| `type`             | `Concept`                                     | Required by OKF v0.1                           |
| `title`            | From `# ` heading (required)                  | Display in extension UI                        |
| `description`      | First `>` blockquote after heading (required) | Index briefs, search snippets                  |
| `tags`             | From frontmatter or `--tags` CLI              | Cross-cutting categorization                   |
| `timestamp`        | Current ISO time                              | Last-modified (set to file mtime if available) |
| `keb_name`         | Slug matching filename                        | pi-keb's concept identity field                |
| `keb_sources`      | `[]`                                          | No source documents — empty array              |
| `keb_needs_review` | `false`                                       | No pending cleanup needed                      |

### Index page (`wiki/index.md`)

```markdown
# Knowledge Base Index

## Concepts
- [caching](/concepts/caching.md) — Caching uses a write-through strategy with Redis.
- [deployment](/concepts/deployment.md) — How the system is deployed to production.
- [error-handling](/concepts/error-handling.md) — Patterns for handling errors.
- [load-balancing](/concepts/load-balancing.md) — Load balancing strategy.
```

Generated deterministically from the concept list. Each entry uses the description extracted from the file.

### Marker file: `.keb-readonly`

An empty file at the workspace root signals the workspace's intended read-only nature. No enforcement is implemented yet, but the marker exists for future tooling (bridge, pi extension) to optionally check and block mutations.

### Files NOT created

| File              | Reason                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `registry.json`   | Not needed — no `/keb:add` will be used against this workspace. `/keb:list` shows `?` sources, cosmetic only. |
| `source/`         | No source documents to store (read-only workspace)                                                            |
| `wiki/summaries/` | No source documents to summarize (read-only workspace)                                                        |
| `wiki/log.md`     | pi-keb creates it on `ensureKebDir()`, tool doesn't need to                                                   |

## CLI interface

```
Usage:
  node import.mjs <input-dir> --workspace <name> [options]

Arguments:
  <input-dir>               Directory of .md files (one per concept)
  --workspace <name>        Target workspace name (required)

Options:
  --tags <tag1,tag2,...>    Default tags applied to all concepts
                            (can be overridden per-file in frontmatter)
  --outdir <path>           Output root (default: ~/.pi/agent/keb/
                            or $KEB_HOME if set)
  --dry-run                 Preview what would be written without writing
  --verbose                 Show per-file extraction details
  -h, --help                Show this help text

Examples:
  node import.mjs ./cardiology --workspace cardio
  node import.mjs ./ops --workspace runbooks --tags "ops,runbook"
  node import.mjs ./mydir --workspace foo --dry-run
```

### Exit codes

| Code | Meaning                                                   |
| ---- | --------------------------------------------------------- |
| 0    | Success (all files imported)                              |
| 1    | Validation error (bad slug, collision, missing workspace) |
| 2    | Input directory not found or empty                        |

## Implementation

### File

`packages/import-workspace/import.mjs` — single-file executable, zero npm dependencies.

### Dependencies

None beyond Node.js built-ins:

- `node:fs`, `node:path`, `node:process`, `node:os`

The frontmatter builder (`buildOkfFrontmatter`) is inlined (~20 lines) rather than imported from pi-keb's compiled dist. This keeps the tool standalone and avoids the pi-keb build step.

### Algorithm

```
1. Parse CLI args (workspace name, tags, input dir, flags)
2. Validate workspace name (lowercase, hyphens, 3-30 chars)
3. Resolve output path:
   a. --outdir if provided
   b. $KEB_HOME env var if set
   c. ~/.pi/agent/keb/workspaces/<name>/
4. Scan input dir for *.md files (non-recursive)
5. Validate: detect duplicate slugs before any writes (error with conflict list)
6. For each file:
   a. Read content
   b. Parse optional frontmatter (tags override)
   c. Derive slug from filename (slugify)
   d. Validate: file must contain `# ` heading → fail with error if missing
   e. Validate: file must contain `>` blockquote after heading → fail with error if missing
   f. Extract title from first `# ` heading
   g. Extract description from first `>` blockquote (strip `> `, join multiline)
   h. Build OKF frontmatter
   i. If --dry-run, log intent; else write file
   j. Accumulate index entry
7. Write .keb-readonly marker file at workspace root
8. Generate index.md
9. Print summary (processed, written, skipped, errors)
```

### Edge cases

| Case                                    | Handling                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------- |
| Input dir doesn't exist                 | Exit with error, print path                                                |
| No `.md` files found                    | Exit with error, show scanned path                                         |
| Duplicate slugs                         | Detect collision before writing, error with conflict list                  |
| Filename with spaces                    | Slugify: lowercase, replace spaces/special chars with hyphens              |
| Very long filename                      | Truncate slug at 80 chars (matching pi-keb's `slugify`)                    |
| Missing `# ` heading                    | Skip file, print error: `Missing # heading in <filename>`                  |
| Missing `>` blockquote after heading    | Skip file, print error: `Missing > blockquote after heading in <filename>` |
| File with only frontmatter (no heading) | Caught by missing heading check — error                                    |
| File with `---` not followed by tags    | Parsed as empty frontmatter, validation continues normally                 |
| Existing workspace with same name       | Overwrites wiki/ directory (idempotent — re-run to update)                 |
| Permission denied on write              | Catch error, print message, continue with other files                      |

### No concurrency concerns

Single-threaded, sequential writes. One workspace at a time.

## Testing

Manual for v1:

```bash
mkdir -p /tmp/test-import
cat > /tmp/test-import/caching.md << 'EOF'
# Caching Strategy

> Caching uses a write-through strategy with Redis.

## Key Decisions

- **TTL:** 5 minutes for most data
EOF

cat > /tmp/test-import/bad.md << 'EOF'
This file has no heading and no blockquote.
EOF

node packages/import-workspace/import.mjs /tmp/test-import \
  --workspace test-import --tags "test" --dry-run --verbose

# Then without --dry-run to verify output:
node packages/import-workspace/import.mjs /tmp/test-import \
  --workspace test-import --tags "test"
cat ~/.pi/agent/keb/workspaces/test-import/.keb-readonly
cat ~/.pi/agent/keb/workspaces/test-import/wiki/index.md
cat ~/.pi/agent/keb/workspaces/test-import/wiki/concepts/caching.md
```

Automated tests can be added later as a `test.mjs` script or integrated into `pnpm test` if the package is added to the workspace.

## Open questions

1. **`.keb-readonly` marker** — ✅ **Added.** An empty file at `<workspace_root>/.keb-readonly` documents the workspace's intended use. No enforcement yet; the bridge or pi extension can optionally check for it later.

1. **Per-file timestamp from mtime?** The tool currently uses the current time. Could use the file's mtime for a more accurate "last modified" timestamp. Minor effort, useful for git-tracked source files.

1. **Recursive input directories?** Currently single-level (flat). Could add `--recursive` to scan subdirectories and map them to a flat concept list, or map directory structure to concept slugs. Overkill for v1.

1. **Add to pnpm workspace?** The tool has zero npm dependencies, so adding it to the workspace is unnecessary. A standalone `packages/import-workspace/` directory with `import.mjs` and a `README.md` is sufficient. If we later add tests with Jest/Vitest, we can make it a proper package.
