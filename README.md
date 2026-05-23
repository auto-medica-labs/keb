# chrome-kb 🧠

A Chrome extension that turns your browser into a personal knowledge base, powered by [pi](https://github.com/earendil-works/pi-coding-agent). Add any web page to your KB with two clicks, then query and browse structured, interlinked wiki pages compiled by your LLM — all from Chrome's side panel.

Built with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4**, and **shadcn/ui**.

## Features

- **📥 Add URLs** — Right-click any page and choose "Add to KB", or paste a URL directly. pi fetches the page, extracts key concepts, and compiles structured summaries and cross-linked concept pages.
- **🔍 Query** — Ask natural-language questions and get streaming LLM responses drawn from your knowledge base, complete with inline references.
- **📚 Browse** — Explore all compiled documents and extracted concepts in a scrollable list, with source tracking.
- **🗂️ Multi-workspace** — Switch between isolated knowledge bases for different projects or topics.
- **⚡ Live streaming** — Watch the LLM compile pages and answer queries in real time with event-level progress.
- **🔌 Standalone bridge** — The WebSocket bridge runs independently of pi's TUI, so you can query your KB from Chrome anytime.

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
                                                              │  └────────────┘  │
                                                              └─────────────────┘
```

1. **Chrome Extension** — React side panel + TypeScript service worker. Built with Vite.
2. **bridge-server.js** — A standalone WebSocket server that bridges the extension to pi-kb.
3. **pi-kb** — pi extension providing the knowledge base at `~/.pi/agent/kb/`.

## Prerequisites

- [pi](https://github.com/earendil-works/pi-coding-agent) installed and in your `$PATH`
- [pi-kb](https://github.com/dheerapat/pi-kb) extension installed in pi
- Node.js ≥ 18

## Installation

### 1. Install dependencies & build

```bash
cd chrome-kb
npm install
npm run build
```

### 2. Start the bridge server

```bash
npm run bridge
# or: node bridge-server.js
# or with a custom port: node bridge-server.js --port 9876
```

The bridge runs until you press `Ctrl+C`. Keep it running while using the extension.

### 3. Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` directory inside `chrome-kb`

The extension icon will appear in your toolbar.

## Development

```bash
npm run dev      # Start Vite dev server (for UI development)
npm run build    # Type-check + production build to dist/
npm run bridge   # Start the WebSocket bridge server
```

After making changes, run `npm run build` and reload the extension from `chrome://extensions`.

## Project Structure

```
chrome-kb/
├── public/
│   ├── manifest.json          # Chrome extension manifest (Manifest V3)
│   └── icons/                 # Extension icons
├── src/
│   ├── components/ui/         # shadcn/ui components
│   ├── lib/
│   │   ├── store.ts           # chrome.storage.local cache
│   │   ├── utils.ts           # cn(), slugify, normalizeUrl, hashing
│   │   └── ws.ts              # WebSocket client class
│   ├── sidepanel/
│   │   ├── main.tsx           # React entry point
│   │   ├── App.tsx            # Main app (WS connection, state, tabs)
│   │   └── components/        # UI components
│   │       ├── Header.tsx
│   │       ├── AddPanel.tsx
│   │       ├── QueryPanel.tsx
│   │       ├── BrowsePanel.tsx
│   │       └── Footer.tsx
│   ├── service-worker.ts      # Background service worker
│   └── index.css              # Global styles (Tailwind + shadcn theme)
├── index.html                 # Side panel HTML entry point
├── vite.config.ts             # Vite build config
├── tsconfig.json              # TypeScript config
├── components.json            # shadcn/ui config
├── bridge-server.js           # Standalone WebSocket bridge
└── package.json
```

## WebSocket Protocol

The bridge listens on `ws://127.0.0.1:9876` and accepts JSON messages:

| Message | Fields | Description |
|---------|--------|-------------|
| `add` | `url`, `workspace?` | Compile a URL into the knowledge base |
| `query` | `text`, `workspace?` | Query the knowledge base |
| `sync` | `workspace?` | Full state dump (registry, index, summaries, concepts, workspaces) |

Responses include typed events (`text_delta`, `tool_execution_start`, `tool_execution_end`, `agent_end`) streamed in real time, plus a `done` message when the operation completes.

## License

MIT
