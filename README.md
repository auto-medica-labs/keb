# Keb

A Chrome extension that turns your browser into a personal knowledge base, powered by [pi](https://github.com/earendil-works/pi-coding-agent). Add any web page to your knowledge base with two clicks, then consult and browse structured, interlinked wiki pages compiled by your LLM — all from Chrome's side panel.

The bridge server supports both **single-user mode** (local development, self-hosted) and **hosted multi-user mode** (deploy as a SaaS, with user signup/login and per-user workspace isolation).

Built with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4**, and **shadcn/ui**. Managed as a **pnpm workspace** monorepo.

## Features

- **Add URLs** — Right-click any page and choose "Add to knowledge base", or paste a URL directly. pi fetches the page, extracts key concepts, and compiles structured summaries and cross-linked concept pages.
- **Add current page content** — Capture the full text of the current tab and compile it directly (no URL fetch needed).
- **Consult** — Ask natural-language questions and get streaming LLM responses drawn from your knowledge base, complete with inline references.
- **Browse** — Explore all compiled documents and extracted concepts in a scrollable list, with source tracking.
- **Multi-workspace** — Switch between isolated knowledge bases for different projects or topics.
- **User authentication** — Signup, login, JWT-based sessions. Each user gets an isolated workspace automatically created on signup.
- **Live streaming** — Watch the LLM compile pages and answer queries in real time with event-level progress.
- **Standalone bridge** — The WebSocket bridge runs independently of pi's TUI, so you can consult your knowledge base from Chrome anytime.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Chrome Extension                   │
│  (React side panel + service worker)                │
│  packages/extension/                                │
└──────────┬──────────────────────────────────────────┘
           │ WebSocket (ws://) + HTTP
           ▼
┌─────────────────────────────────────────────────────┐
│                   Bridge Server                      │
│  packages/bridge/                                   │
│                                                     │
│  ┌──────────┐  ┌──────────────────────────────┐     │
│  │ HTTP Auth │  │  WebSocket KB Operations     │     │
│  │ /api/*    │  │  add / query / sync / repair │     │
│  └─────┬─────┘  └──────────┬───────────────────┘     │
│        │                   │                         │
│        ▼                   ▼                         │
│  ┌──────────┐  ┌───────────────────────────┐        │
│  │ UserStore│  │  KbStore (pi-kb adapter)  │        │
│  │ (JSON)   │  │  → FilesystemStore        │        │
│  └──────────┘  └──────────┬────────────────┘        │
│                           │                          │
│                           ▼                          │
│                    pi --mode rpc                     │
│                    (spawned child processes)         │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
              ~/.pi/agent/kb/workspaces/
                ├── alice/    (registry, source/, wiki/)
                ├── bob/
                └── ...
```

1. **`@keb/bridge`** — Combined HTTP + WebSocket server. HTTP handles user auth (signup, login, token verification). WebSocket handles KB operations (add, query, sync, repair). Written in JS with full JSDoc type annotations.
2. **`@keb/extension`** — React side panel + TypeScript service worker. Built with Vite.
3. **`pi-kb`** — pi extension providing the knowledge base. Included as a git submodule at `packages/pi-kb/`. The bridge imports its `FilesystemStore` directly for filesystem reads and workspace creation.

### Port & adapter pattern

The bridge follows the same port/adapter architecture as pi-kb:

| Port | Adapter (today) | Swappable to |
|---|---|---|
| `KbStore` (kb read/workspace ops) | `PiKbStore` → pi-kb's `FilesystemStore` | — |
| `UserStore` (user credentials) | `JsonUserStore` (JSON file) | PostgreSQL, SQLite |

Swap adapters by changing one factory call in `bridge-server.js`. Handlers never know which adapter is in use.

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

### 1. Clone the repo (with submodules)

```bash
git clone --recurse-submodules https://github.com/auto-medica-labs/keb.git
cd keb
pnpm install
pnpm build
```

If you already cloned without `--recurse-submodules`:

```bash
git submodule update --init --recursive
```

### 2. Start the bridge server

```bash
pnpm bridge
# or: pnpm bridge:dev  (auto-restarts on file changes)
```

The first run compiles pi-kb's standalone adapter automatically. The bridge runs until you press `Ctrl+C`. Keep it running while using the extension.

#### Hosted mode (multi-user)

Set a `JWT_SECRET` and the bridge enables HTTP auth endpoints:

```bash
cp packages/bridge/.env.example packages/bridge/.env
# Edit .env: set JWT_SECRET, ANTHROPIC_API_KEY, PI_DEFAULT_PROVIDER, etc.
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
HOST=0.0.0.0 JWT_SECRET=$JWT_SECRET node packages/bridge/src/bridge-server.js
```

Users can then sign up at `POST /api/signup` and login at `POST /api/login`. Each user gets an isolated workspace created automatically.

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
|---|---|
| `pnpm build` | Production build of the extension (Vite) |
| `pnpm dev` | Vite dev server for UI development |
| `pnpm bridge` | Start the WebSocket bridge server |
| `pnpm bridge:dev` | Start bridge with auto-restart on changes |
| `pnpm build:pi-kb` | Compile pi-kb standalone adapter (runs automatically before bridge start) |
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
├── .gitmodules                   # pi-kb submodule declaration
├── AGENTS.md                     # AI agent instructions for this project
├── packages/
│   ├── pi-kb/                    # git submodule → github.com/dheerapat/pi-kb
│   │   ├── extensions/kb/        #   pi extension source (TS)
│   │   │   ├── adapters/         #   FilesystemStore, HttpFetcher
│   │   │   ├── ports/types.ts    #   KnowledgeBaseStore interface
│   │   │   └── utils.ts          #   slugify, docNameFromFile, etc.
│   │   └── dist/standalone/      #   compiled JS + declarations (auto-generated)
│   ├── bridge/                   # @keb/bridge
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.build-pi-kb.json  # compiles pi-kb standalone adapter
│   │   ├── Dockerfile
│   │   ├── entrypoint.sh
│   │   ├── .env.example
│   │   └── src/
│   │       ├── bridge-server.js   # HTTP + WebSocket server entry point
│   │       ├── adapters/
│   │       │   ├── pi-kb-store.js      # KbStore → wraps pi-kb's FilesystemStore
│   │       │   ├── pi-rpc-spawner.js   # spawns pi --mode rpc child processes
│   │       │   └── user-store-json.js  # UserStore → JSON file adapter
│   │       ├── ports/
│   │       │   ├── kb-store.js         # KbStore interface
│   │       │   └── user-store.js       # UserStore interface
│   │       ├── handlers/
│   │       │   ├── auth-handler.js     # HTTP /api/signup, /api/login, /api/me
│   │       │   ├── add-content-handler.js
│   │       │   ├── command-handler.js  # add / repair
│   │       │   ├── query-handler.js
│   │       │   └── sync-handler.js
│   │       └── lib/
│   │           ├── auth.js             # JWT, bcrypt, username validation
│   │           └── utils.js            # logging, JSON, URL helpers
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

## HTTP API (hosted mode)

When `JWT_SECRET` is configured, the bridge exposes these endpoints on the same port as the WebSocket:

| Endpoint | Method | Body | Response |
|---|---|---|---|
| `/api/signup` | POST | `{"username":"...", "password":"..."}` | `{"token":"...", "username":"..."}` |
| `/api/login` | POST | `{"username":"...", "password":"..."}` | `{"token":"...", "username":"..."}` |
| `/api/me` | GET | (Bearer token header) | `{"username":"...", "createdAt":"..."}` |

**Signup flow:**
1. Validates username (slugified, 3-30 chars, `[a-z0-9-]`) and password (min 8 chars)
2. Hashes password with bcrypt (12 rounds)
3. Stores user in `~/.pi/agent/kb/users.json`
4. Creates workspace at `~/.pi/agent/kb/workspaces/<username>/`
5. Returns JWT (30-day expiry)

**Error responses:** `{"error":"..."}` with HTTP 400 (validation), 401 (auth), 409 (duplicate), 500 (internal).

## WebSocket Protocol

The bridge listens on `ws://127.0.0.1:9876` and accepts JSON messages:

### Auth (required first message in hosted mode)

```json
{ "type": "auth", "token": "<jwt>" }
```

Response: `{"type":"auth_ok", "username":"alice"}` or error + close.

### KB Operations (after auth)

| Message | Fields | Description |
|---|---|---|
| `add` | `operationId`, `url` | Compile a URL into the knowledge base |
| `add-content` | `operationId`, `html`, `url?`, `title?` | Compile captured page HTML |
| `query` | `operationId`, `text` | Query the knowledge base |
| `repair` | `operationId` | Re-compile interrupted documents |
| `sync` | _(none)_ | Full state dump (registry, index, summaries, concepts, workspaces) |

> **Note:** In hosted mode, the `workspace` field is **ignored** — the server enforces the authenticated username as the workspace for all operations. In single-user mode (no auth), `workspace` is optional and defaults to the default workspace.

Every `add`/`query`/`repair` message includes a client-generated `operationId` (nanoid). The bridge echoes it back in all responses so the client can correlate streaming events with the originating request.

Responses include typed events (`text_delta`, `tool_execution_start`, `tool_execution_end`, `agent_end`) streamed in real time, plus a `done` / `error` message when the operation completes. All response frames carry the same `operationId` as the request.

### Concurrent Operations

The bridge supports multiple concurrent operations over a single WebSocket connection. Each operation (add, query, repair) spawns an independent pi RPC process and is tracked by its `operationId` in a `Map<operationId, ChildProcess>`. Starting a new operation no longer kills in-progress ones — the client routes streamed events to the correct UI card via the echoed `operationId`.

**Client-side:** each tab (Add, Consult) tracks only its latest operation of that type. Starting a new add wipes the previous add's timeline; starting a new query wipes the previous query's timeline. Cross-tab concurrency works: an add can compile while a query streams its answer, each in its own tab.

## Lint Rules

Configured in `.oxlintrc.json`:

| Rule | Description |
|---|---|
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
