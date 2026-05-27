# Keb

A Chrome extension that turns your browser into a personal knowledge base, powered by [pi](https://github.com/earendil-works/pi-coding-agent). Add any web page to your knowledge base with two clicks, then consult and browse structured, interlinked wiki pages compiled by your LLM — all from Chrome's side panel.

Built with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4**, and **shadcn/ui**. Managed as a **pnpm workspace** monorepo.

## Features

- **Add URLs** — Right-click any page and choose "Add to knowledge base", or paste a URL directly. pi fetches the page, extracts key concepts, and compiles structured summaries and cross-linked concept pages.
- **Consult** — Ask natural-language questions and get streaming LLM responses drawn from your knowledge base, complete with inline references.
- **Browse** — Explore all compiled documents and extracted concepts in a scrollable list, with source tracking.
- **Multi-workspace** — Switch between isolated knowledge bases for different projects or topics.
- **Live streaming** — Watch the LLM compile pages and answer queries in real time with event-level progress.
- **Standalone bridge** — The WebSocket bridge runs independently of pi's TUI, so you can consult your knowledge base from Chrome anytime.

## Architecture

1. **`@keb/bridge`** — Standalone WebSocket server that bridges the extension to pi-kb. Written in JS with full JSDoc type annotations.
2. **`@keb/extension`** — React side panel + TypeScript service worker. Built with Vite.
3. **`pi-kb`** — pi extension providing the knowledge base at `~/.pi/agent/kb/`.

## Prerequisites

- [pi](https://github.com/earendil-works/pi-coding-agent) installed and in your `$PATH`
- [pi-kb](https://github.com/dheerapat/pi-kb) extension installed in pi

## Installation

### 0. Prerequisites

Install `pi`, configure your preferred LLM provider, and install the `pi-kb` extension:

```bash
curl -fsSL https://pi.dev/install.sh | sh
# then inside pi, set up your LLM provider via /login
pi install git:github.com/dheerapat/pi-kb
```

### 1. Clone the repo, install dependencies & build

```bash
git clone https://github.com/auto-medica-labs/keb.git
cd keb
pnpm install
pnpm build
```

### 2. Start the bridge server

```bash
pnpm bridge
# or: pnpm bridge:dev  (auto-restarts on file changes)
```

The bridge runs until you press `Ctrl+C`. Keep it running while using the extension.

### 3. Load the extension in Chrome

**Option A — Local build (from source)**

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `packages/extension/dist/` directory

The extension icon will appear in your toolbar.

**Option B — Chrome Web Store**

Install [Keb from the Chrome Web Store](https://chromewebstore.google.com/detail/keb/caofpejajfnmpbfmgidgfkglmjbiakhf) like any other extension. You still need to start the bridge server yourself.

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm build` | Production build of the extension (Vite) |
| `pnpm dev` | Vite dev server for UI development |
| `pnpm bridge` | Start the WebSocket bridge server |
| `pnpm bridge:dev` | Start bridge with auto-restart on changes |
| `pnpm typecheck` | Type-check both packages (tsc + JSDoc) |
| `pnpm lint` | Lint with oxlint (no-unused-vars, no-explicit-any) |
| `pnpm format` | Auto-format all files with oxfmt |
| `pnpm format:check` | Check formatting (CI-friendly) |

## Project Structure

```
keb/
├── pnpm-workspace.yaml
├── package.json                  # Root workspace orchestrator
├── .oxlintrc.json                # Lint rules
├── packages/
│   ├── bridge/                   # @keb/bridge
│   │   ├── package.json
│   │   ├── tsconfig.json         # checkJs + allowJs for JSDoc
│   │   └── src/
│   │       └── bridge-server.js  # WebSocket bridge server (JS + JSDoc)
│   └── extension/                # @keb/extension
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── components.json       # shadcn/ui config
│       ├── index.html
│       ├── public/
│       │   ├── manifest.json     # Chrome extension manifest (Manifest V3)
│       │   └── icons/
│       └── src/
│           ├── components/ui/    # shadcn/ui components
│           ├── lib/
│           │   ├── store.ts      # chrome.storage.local cache
│           │   ├── utils.ts      # cn(), slugify, normalizeUrl, hashing
│           │   └── ws.ts         # WebSocket client class
│           ├── sidepanel/
│           │   ├── main.tsx      # React entry point
│           │   ├── App.tsx       # Main app (WS connection, state, tabs)
│           │   └── components/
│           │       ├── Header.tsx
│           │       ├── AddPanel.tsx
│           │       ├── QueryPanel.tsx
│           │       ├── BrowsePanel.tsx
│           │       └── Footer.tsx
│           ├── service-worker.ts # Background service worker
│           └── index.css         # Global styles (Tailwind + shadcn theme)
```

## WebSocket Protocol

The bridge listens on `ws://127.0.0.1:9876` and accepts JSON messages:

| Message | Fields | Description |
|---------|--------|-------------|
| `add` | `operationId`, `url`, `workspace?` | Compile a URL into the knowledge base |
| `query` | `operationId`, `text`, `workspace?` | Query the knowledge base |
| `repair` | `operationId`, `workspace?` | Re-compile interrupted documents |
| `sync` | `workspace?` | Full state dump (registry, index, summaries, concepts, workspaces) |

Every `add`/`query`/`repair` message includes a client-generated `operationId` (nanoid). The bridge echoes it back in all responses so the client can correlate streaming events with the originating request.

Responses include typed events (`text_delta`, `tool_execution_start`, `tool_execution_end`, `agent_end`) streamed in real time, plus a `done` / `error` message when the operation completes. All response frames carry the same `operationId` as the request.

### Concurrent Operations

The bridge supports multiple concurrent operations over a single WebSocket connection. Each operation (add, query, repair) spawns an independent pi RPC process and is tracked by its `operationId` in a `Map<operationId, ChildProcess>`. Starting a new operation no longer kills in-progress ones — the client routes streamed events to the correct UI card via the echoed `operationId`.

**Client-side:** each tab (Add, Consult) tracks only its latest operation of that type. Starting a new add wipes the previous add's timeline; starting a new query wipes the previous query's timeline. Cross-tab concurrency works: an add can compile while a query streams its answer, each in its own tab.

## Lint Rules

Configured in `.oxlintrc.json`:

| Rule | Description |
|------|-------------|
| `eslint/no-unused-vars` | No unused variable declarations |
| `typescript/no-explicit-any` | No explicit `any` type annotations |

TypeScript `strict` mode also enforces `noImplicitAny`, `noUnusedLocals`, and `noUnusedParameters` at compile time.

## License

This project uses a **dual license**:

| Package | License | Scope |
|---|---|---|
| `@keb/extension` | [MIT](packages/extension/LICENSE) | Free for any use, modification, and distribution |
| `@keb/bridge` | [MIT with SaaS restriction](packages/bridge/LICENSE) | Free for self-hosted use; no competing SaaS/cloud hosting permitted |

The bridge license allows you to use, modify, and self-host the bridge freely, but prohibits offering it to third parties as a hosted, managed, or SaaS product where the primary value is the bridge's functionality itself.
