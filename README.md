# chrome-kb 🧠

A Chrome extension that turns your browser into a personal knowledge base, powered by [pi](https://github.com/earendil-works/pi-coding-agent). Add any web page to your KB with two clicks, then consult and browse structured, interlinked wiki pages compiled by your LLM — all from Chrome's side panel.

Built with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4**, and **shadcn/ui**. Managed as a **pnpm workspace** monorepo.

## Features

- **📥 Add URLs** — Right-click any page and choose "Add to KB", or paste a URL directly. pi fetches the page, extracts key concepts, and compiles structured summaries and cross-linked concept pages.
- **🔍 Consult** — Ask natural-language questions and get streaming LLM responses drawn from your knowledge base, complete with inline references.
- **📚 Browse** — Explore all compiled documents and extracted concepts in a scrollable list, with source tracking.
- **🗂️ Multi-workspace** — Switch between isolated knowledge bases for different projects or topics.
- **⚡ Live streaming** — Watch the LLM compile pages and answer queries in real time with event-level progress.
- **🔌 Standalone bridge** — The WebSocket bridge runs independently of pi's TUI, so you can consult your KB from Chrome anytime.

## Architecture

```
┌──────────────────┐     WebSocket (ws://127.0.0.1:9876)     ┌─────────────────┐
│  Chrome          │◄──────────────────────────────────────►│  bridge-server   │
│  Extension       │     JSON messages: add / query / sync   │  (Node.js)       │
│                  │                                         │                  │
│  ┌────────────┐  │                                         │  ┌────────────┐  │
│  │ sidepanel  │  │  ◄── WebSocket client                   │  │ spawn pi   │  │
│  │ (React SPA)│  │  ◄── chrome.storage.local cache         │  │ --mode rpc │  │
│  └────────────┘  │                                         │  └─────┬──────┘  │
│  ┌────────────┐  │                                         │        │         │
│  │ service    │  │  ◄── context menu "Add to KB"           │  ┌─────▼──────┐  │
│  │ worker     │  │  ◄── toolbar click → open sidepanel     │  │ pi-kb      │  │
│  └────────────┘  │                                         │  │ .pi/agent/ │  │
└──────────────────┘                                         │  │  kb/       │  │
  @chrome-kb/extension                                        │  └────────────┘  │
                                                              └─────────────────┘
                                                               @chrome-kb/bridge
```

1. **@chrome-kb/bridge** — Standalone WebSocket server that bridges the extension to pi-kb. Written in JS with full JSDoc type annotations.
2. **@chrome-kb/extension** — React side panel + TypeScript service worker. Built with Vite.
3. **pi-kb** — pi extension providing the knowledge base at `~/.pi/agent/kb/`.

## Prerequisites

- [pi](https://github.com/earendil-works/pi-coding-agent) installed and in your `$PATH`
- [pi-kb](https://github.com/dheerapat/pi-kb) extension installed in pi
- [pnpm](https://pnpm.io) ≥ 10
- Node.js ≥ 18

## Installation

### 1. Install dependencies & build

```bash
cd chrome-kb
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

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `packages/extension/dist/` directory

The extension icon will appear in your toolbar.

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
chrome-kb/
├── pnpm-workspace.yaml
├── package.json                  # Root workspace orchestrator
├── .oxlintrc.json                # Lint rules
├── packages/
│   ├── bridge/                   # @chrome-kb/bridge
│   │   ├── package.json
│   │   ├── tsconfig.json         # checkJs + allowJs for JSDoc
│   │   └── src/
│   │       └── bridge-server.js  # WebSocket bridge server (JS + JSDoc)
│   └── extension/                # @chrome-kb/extension
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
| `add` | `url`, `workspace?` | Compile a URL into the knowledge base |
| `query` | `text`, `workspace?` | Query the knowledge base |
| `sync` | `workspace?` | Full state dump (registry, index, summaries, concepts, workspaces) |

Responses include typed events (`text_delta`, `tool_execution_start`, `tool_execution_end`, `agent_end`) streamed in real time, plus a `done` message when the operation completes.

## Lint Rules

Configured in `.oxlintrc.json`:

| Rule | Description |
|------|-------------|
| `eslint/no-unused-vars` | No unused variable declarations |
| `typescript/no-explicit-any` | No explicit `any` type annotations |

TypeScript `strict` mode also enforces `noImplicitAny`, `noUnusedLocals`, and `noUnusedParameters` at compile time.

## License

MIT
