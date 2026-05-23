# chrome-kb 🧠

A Chrome extension that turns your browser into a personal knowledge base, powered by [pi](https://github.com/earendil-works/pi-coding-agent). Add any web page to your KB with two clicks, then query and browse structured, interlinked wiki pages compiled by your LLM — all from Chrome's side panel.

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
│  │ sidepanel  │  │  ◄── WebSocket client                  │  │ spawn pi   │  │
│  │ (Add/Query │  │  ◄── chrome.storage.local cache        │  │ --mode rpc │  │
│  │  /Browse)  │  │                                         │  └─────┬──────┘  │
│  └────────────┘  │                                         │        │         │
│  ┌────────────┐  │                                         │  ┌─────▼──────┐  │
│  │ service    │  │  ◄── context menu "Add to KB"          │  │ pi-kb      │  │
│  │ worker     │  │  ◄── toolbar click → open sidepanel     │  │ .pi/agent/ │  │
│  └────────────┘  │                                         │  │  kb/       │  │
└──────────────────┘                                         │  └────────────┘  │
                                                              └─────────────────┘
```

1. **Chrome Extension** — Provides the UI (side panel) and triggers (context menu, toolbar icon).
2. **bridge-server.js** — A standalone WebSocket server that bridges the extension to pi-kb. It spawns `pi --mode rpc --no-session` for add/query operations and reads the filesystem directly for sync. No TUI session needed.
3. **pi-kb** — a pi extension that provides the knowledge base stored at `~/.pi/agent/kb/`. Contains summaries, concepts, an index, and a registry.

## Prerequisites

- [pi](https://github.com/earendil-works/pi-coding-agent) installed and in your `$PATH`
- [pi-kb](https://github.com/dheerapat/pi-kb) extension installed in pi
- Node.js ≥ 18 (for the bridge server)
- A Chromium-based browser (Chrome, Edge, Brave, Arc, etc.)

## Installation

### 1. Install npm dependencies

```bash
cd chrome-kb
npm install
```

### 2. Start the bridge server

```bash
node bridge-server.js
# or with a custom port:
node bridge-server.js --port 9876
```

The bridge runs until you press `Ctrl+C`. Keep it running while using the extension.

### 3. Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right)
3. Click **Load unpacked**
4. Select the `chrome-kb` directory

The extension icon will appear in your toolbar.

## Usage

### Adding a page

- **Right-click** any page → **Add to KB** — the side panel opens with the URL pre-filled. Click **Fetch & Add**.
- Or click the extension icon, paste a URL in the **Add URL** tab, and click **Fetch & Add**.

You'll see real-time progress as pi fetches the page, extracts key topics, and writes cross-linked wiki pages.

### Querying your KB

Switch to the **Query** tab, type a question in natural language, and press Enter. pi searches your knowledge base and streams a response with context from your compiled documents.

### Browsing documents

The **Browse** tab shows all compiled documents and extracted concepts. Each entry shows its source URL for traceability.

### Switching workspaces

Use the dropdown in the header to switch between knowledge bases. Workspaces are completely isolated — perfect for keeping work, side projects, and personal knowledge separate.

## Project Structure

```
chrome-kb/
├── bridge-server.js       # WebSocket bridge (standalone, spawns pi)
├── service-worker.js      # Chrome extension background worker
├── manifest.json          # Chrome extension manifest (Manifest V3)
├── package.json
├── lib/
│   ├── store.js           # chrome.storage.local cache for KB state
│   └── utils.js           # Slugify, normalize URL, hashing, markdown
├── sidepanel/
│   ├── sidepanel.html     # Side panel UI (Add / Query / Browse tabs)
│   ├── sidepanel.js       # WebSocket client, tab logic, streaming renderer
│   └── sidepanel.css      # Dark theme styles
└── icons/
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
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
