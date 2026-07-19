# Knowledge format (OKF)

Keb stores compiled knowledge on disk using the **Open Knowledge Format (OKF) v0.1** defined in [`PLAN/OKF_SPEC.md`](../../PLAN/OKF_SPEC.md). The bridge reads this format through the `pi-keb` `FilesystemStore` and ships it to clients as a sync payload.

## Workspace layout

All data lives under `~/.pi/agent/keb/`:

```
~/.pi/agent/keb/
├── users.db                          # hosted mode SQLite user store
├── registry.json                     # default workspace document registry
├── source/                           # default workspace raw sources
└── wiki/                             # default workspace OKF bundle
    ├── index.md
    ├── log.md
    ├── summaries/
    └── concepts/

workspaces/
└── <name>/                           # named workspaces (local mode or hosted username)
    ├── registry.json
    ├── source/
    └── wiki/
```

`FilesystemStore.getWorkspaceRoot()` in [`packages/pi-keb/extensions/keb/adapters/filesystem-store.ts`](../../packages/pi-keb/extensions/keb/adapters/filesystem-store.ts) generates these paths.

## Registry

[`packages/pi-keb/extensions/keb/ports/types.ts`](../../packages/pi-keb/extensions/keb/ports/types.ts) defines `RegistryEntry`:

| Field            | Meaning                                                           |
| ---------------- | ----------------------------------------------------------------- |
| `name`           | Original filename or title-derived filename                       |
| `sourcePath`     | Relative path under workspace root, e.g. `source/architecture.md` |
| `originalPath`   | Absolute file path, normalized URL, or `inline:<docName>`         |
| `docName`        | Slug used for `summaries/<docName>.md` and concept sources        |
| `addedAt`        | ISO timestamp of first add                                        |
| `lastCompiledAt` | ISO timestamp when compilation finished                           |
| `compiled`       | `false` until `keb_update_index` marks the doc complete           |

The registry key is a SHA-256 hash of the source content. `compiled: false` is how the bridge detects interrupted compilations for `repair`.

## Summaries

Each source document gets one summary at `wiki/summaries/<docName>.md`. Frontmatter is OKF plus Keb producer keys:

```yaml
---
type: Summary
title: Architecture
description: Key architectural decisions.
resource: https://github.com/org/repo/blob/main/docs/architecture.md
tags: [architecture, design]
timestamp: 2026-05-26T14:30:00Z
keb_name: architecture
keb_source: architecture.md
---
```

`keb_write_summary` in [`packages/pi-keb/extensions/keb/tools.ts`](../../packages/pi-keb/extensions/keb/tools.ts) writes these files. The `resource` field is populated from `originalPath` when it is an HTTP URL.

## Concepts

Concepts are cross-document topic pages at `wiki/concepts/<slug>.md`:

```yaml
---
type: Concept
title: Caching Strategy
description: How caching is implemented across the architecture.
tags: [caching, performance]
timestamp: 2026-05-26T14:30:00Z
keb_name: caching-strategy
keb_sources: [summary/architecture, summary/design]
keb_needs_review: false
---
```

`keb_write_concept` creates a new concept; `keb_update_concept` merges a new source into an existing one and rewrites the body.

## Index

`wiki/index.md` is auto-rebuilt by `keb_update_index` in `tools.ts`. It lists documents and concepts with one-line briefs:

```markdown
# Knowledge Base Index

## Documents
- [architecture](/summaries/architecture.md) — Key architectural decisions.

## Concepts
- [caching-strategy](/concepts/caching-strategy.md) — How caching is implemented.
```

The index is rebuilt from disk, so omitted entries keep their existing briefs.

## Cross-linking

Use standard Markdown links, not `[[wiki-links]]`:

- `[text](/summaries/docname.md)`
- `[text](/concepts/slug.md)`

## Compilation lifecycle

1. `add` or `add-content` handler writes the source file and registry entry with `compiled: false`.
1. `pi` runs the compile prompt and calls `keb_write_summary`, `keb_write_concept` / `keb_update_concept`, and finally `keb_update_index`.
1. `keb_update_index` flips matching registry entries to `compiled: true` and sets `lastCompiledAt`.
1. The bridge sends a `sync_result` back to the client after `add`/`repair` completes.

If the process is interrupted before step 3, `repair` re-reads the source and re-runs the compile prompt.
