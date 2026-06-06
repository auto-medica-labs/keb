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
│  │ (SQLite) │  │  → FilesystemStore        │        │
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

1. **`@keb/bridge`** — Combined HTTP + WebSocket server. HTTP handles user auth (signup, login, token verification). WebSocket handles KB operations (add, add-content, query, sync, repair). Written in JS with full JSDoc type annotations.
2. **`@keb/extension`** — React side panel + TypeScript service worker. Built with Vite.
3. **`pi-kb`** — pi extension providing the knowledge base. Included as a git submodule at `packages/pi-kb/`. The bridge imports its `FilesystemStore` directly for filesystem reads and workspace creation.

### Port & adapter pattern

The bridge follows the same port/adapter architecture as pi-kb:

| Port | Adapter (today) | Swappable to |
|---|---|---|
| `KbStore` (kb read/workspace ops) | `PiKbStore` → pi-kb's `FilesystemStore` | — |
| `UserStore` (user credentials) | `SqliteUserStore` (SQLite) | PostgreSQL |
| (spawnPi) | `PiRpcSpawner` → spawns `pi --mode rpc` | — |

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

The bridge has two modes. Default is **local mode** (no auth needed).

#### Quick start (local mode)

```bash
pnpm bridge
# or: pnpm bridge:dev  (auto-restarts on file changes)
```

The first run compiles pi-kb's standalone adapter automatically. Keep it running while using the extension.

#### Configuration

To customize the bridge (change mode, set LLM keys, etc.), create a `.env` file from the example:

```bash
cp packages/bridge/.env.example packages/bridge/.env
# edit packages/bridge/.env with your keys and settings
```

The bridge auto-loads `packages/bridge/.env` if it exists. Key settings:

| Variable | Default | Description |
|---|---|---|
| `KEB_MODE` | `local` | `local` (no auth) or `hosted` (auth required) |
| `JWT_SECRET` | random | JWT signing secret (required for hosted mode) |
| `PORT` | `9876` | HTTP + WebSocket listen port |
| `HOST` | `127.0.0.1` | Listen address (`0.0.0.0` for Docker) |
| `LLM_PROVIDER` | — | Custom provider name (e.g., `ollama`, `anthropic`) |
| `LLM_BASE_URL` | — | API base URL for custom provider |
| `LLM_MODEL` | — | Model ID (e.g., `llama3.1:8b`, `claude-sonnet-4-20250514`) |
| `LLM_API` | `openai-completions` | API type: `openai-completions`, `anthropic-messages`, `google-generative-ai`, `openai-responses` |
| `LLM_API_KEY` | — | API key (required by pi, can be dummy for local models) |
| `LLM_MODEL_NAME` | — | Optional human-readable model name |
| `LLM_REASONING` | — | Set `true` for reasoning-capable models |
| `LLM_THINKING` | `off` | Thinking level: `off`, `low`, `medium`, `high`, `xhigh` |
| `ADMIN_KEY` | — | Secret for `GET /api/status` (sent via `X-API-Key` header) |
| `ANTHROPIC_API_KEY` | — | Legacy: native pi Anthropic key (alternative to LLM_*) |
| `PI_DEFAULT_PROVIDER` | — | Legacy: default provider (e.g., `anthropic`) |
| `PI_DEFAULT_MODEL` | — | Legacy: default model (e.g., `claude-sonnet-4-20250514`) |

See `.env.example` for all supported LLM providers.

#### Hosted mode (multi-user with auth)

In your `.env`, set:

```bash
KEB_MODE=hosted
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

Then run `pnpm bridge` as usual. Users can sign up at `POST /api/signup` and login at `POST /api/login`. Each user gets an isolated workspace.

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
| `pnpm build` | Production build of extension + landing page (Vite) |
| `pnpm dev` | Vite dev server for UI development |
| `pnpm bridge` | Start the WebSocket bridge server (runs `build:pi-kb` first) |
| `pnpm bridge:dev` | Start bridge with auto-restart on changes (runs `build:pi-kb` first) |
| `pnpm build:pi-kb` | Compile pi-kb standalone adapter |
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
│   │   ├── docker-compose.yml
│   │   ├── Caddyfile           # Reverse proxy config for production
│   │   ├── DEPLOYMENT.md       # Step-by-step production deployment guide
│   │   ├── entrypoint.sh
│   │   ├── .env.example
│   │   └── src/
│   │       ├── bridge-server.js   # HTTP + WebSocket server entry point
│   │       ├── adapters/
│   │       │   ├── pi-kb-store.js      # KbStore → wraps pi-kb's FilesystemStore
│   │       │   ├── pi-rpc-spawner.js   # spawns pi --mode rpc child processes
│   │       │   └── user-store-sqlite.js  # UserStore → SQLite adapter
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
│           │   ├── store.ts      # chrome.storage.local cache + bridge config
│           │   ├── utils.ts      # cn(), slugify, normalizeUrl, hashing
│           │   ├── ws.ts         # WebSocket client (local + hosted modes)
│           │   └── api.ts        # HTTP client for login/signup/me
│           ├── sidepanel/
│           │   ├── main.tsx      # React entry point
│           │   ├── App.tsx       # Main app (auth flow, WS connection, state, tabs)
│           │   └── components/
│           │       ├── Header.tsx
│           │       ├── AuthPanel.tsx     # Login / signup form
│           │       ├── SettingsPanel.tsx  # Mode toggle, bridge URL, logout
│           │       ├── AddPanel.tsx
│           │       ├── QueryPanel.tsx
│           │       ├── BrowsePanel.tsx
│           │       └── Footer.tsx
│           ├── service-worker.ts # Background service worker
│           └── index.css         # Global styles (Tailwind + shadcn theme)
```

## Docker

```bash
# Build
docker build -f packages/bridge/Dockerfile -t chrome-kb-bridge .

# Run
docker run -d \
  --name chrome-kb-bridge \
  -p 9876:9876 \
  --env-file packages/bridge/.env \
  -v kb-data:/root/.pi/agent/kb \
  chrome-kb-bridge
```

The Dockerfile has four stages:
1. `pi-layer` — installs pi + pi-kb globally
2. `deps-layer` — installs bridge npm deps (including TypeScript)
3. `pi-kb-build` — compiles pi-kb standalone adapter to JS
4. `final` — minimal `node:22-slim` with production deps only

### Reverse proxy with Caddy

A `Caddyfile` is included in `packages/bridge/`. It proxies `api.mdevd.co/keb/v1` → the bridge container, stripping the `/keb/v1` path prefix so the bridge receives clean `/api/*` paths. Caddy auto-provisions TLS via Let's Encrypt and handles WebSocket upgrades transparently.

**Important:** the path pattern is `handle_path /keb/v1*` (not `/keb/v1/*`) — this ensures the WebSocket root path `/keb/v1` (no trailing slash) matches. The extension connects to `wss://api.mdevd.co/keb/v1` with no additional path segment.

Example Docker Compose snippet:

```yaml
services:
  bridge:
    build:
      context: ./packages/bridge
      dockerfile: Dockerfile
    env_file: packages/bridge/.env
    volumes:
      - kb-data:/root/.pi/agent/kb
    restart: unless-stopped

  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./packages/bridge/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
    restart: unless-stopped

volumes:
  kb-data:
  caddy-data:
```

### Horizontal scaling

Running multiple bridge instances behind a load balancer is **not safe** with the default adapters:

| Component | Default adapter | Multi-instance issue |
|---|---|---|
| `UserStore` | SQLite (`users.db`) | File-level locking — concurrent writes from two instances will corrupt or block. |
| `KbStore` | FilesystemStore (markdown + JSON) | pi child processes writing to the same workspace will race on registry entries and files. |

Even with sticky sessions, cross-user writes collide on the shared `users.db`. The architecture is designed for vertical scaling (single instance, more resources) out of the box.

To scale horizontally, swap the adapters to distributed backends — the port/adapter pattern makes this a one-line change in `bridge-server.js`:

```
UserStore port  →  swap SQLite for a Postgres adapter     (shared users.db)
KbStore port    →  swap FilesystemStore for S3/Postgres    (shared KB data)
```

With both stores backed by distributed databases, multiple bridge instances can share state safely. The bridge server itself is stateless (JWT verification uses only the shared secret, no session store).

## HTTP API

### Health check (all modes)

`GET /api/healthcheck` — no auth required, works in both local and hosted modes.

```bash
curl http://127.0.0.1:9876/api/healthcheck
# → {"status":"ok","mode":"hosted"}
```

Used by Docker healthcheck, monitoring, and load balancer probes.

### Status (admin only)

`GET /api/status` — live runtime metrics. Requires `X-API-Key` header matching `ADMIN_KEY` env var. Returns 501 if `ADMIN_KEY` is not configured.

```bash
curl -H "X-API-Key: your-admin-key" http://127.0.0.1:9876/api/status
```

Response includes connected clients, active pi operations by type, and per-workspace document counts with last activity timestamps.

### Auth endpoints (hosted mode only)

When `KEB_MODE=hosted`, the bridge exposes these endpoints on the same port as the WebSocket.
In local mode all HTTP routes (except `/api/healthcheck`) return 404.

| Endpoint | Method | Body | Response |
|---|---|---|---|
| `/api/signup` | POST | `{"username":"...", "password":"..."}` | `{"token":"...", "username":"..."}` |
| `/api/login` | POST | `{"username":"...", "password":"..."}` | `{"token":"...", "username":"..."}` |
| `/api/me` | GET | (Bearer token header) | `{"username":"...", "createdAt":"..."}` |

**Signup flow:**
1. Validates username (slugified, 3-30 chars, `[a-z0-9-]`) and password (min 8 chars)
2. Hashes password with bcrypt (12 rounds)
3. Stores user in `~/.pi/agent/kb/users.db`
4. Creates workspace at `~/.pi/agent/kb/workspaces/<username>/`
5. Returns JWT (30-day expiry)

**Error responses:** `{"error":"..."}` with HTTP 400 (validation), 401 (auth), 409 (duplicate), 500 (internal).

## WebSocket Protocol

The bridge listens on `ws://127.0.0.1:9876` by default (local mode). The extension's Settings panel lets you configure the bridge URL for either mode — hosted mode defaults to `wss://api.mdevd.co/keb/v1`. All messages are JSON.

### Auth (hosted mode only)

In hosted mode, the first message must be:

```json
{ "type": "auth", "token": "<jwt>" }
```

Response: `{"type":"auth_ok", "username":"alice"}` or error + close.

In local mode, no auth message is needed — clients can send any operation immediately.

### KB Operations

| Message | Fields | Description |
|---|---|---|
| `add` | `operationId`, `url`, `workspace?` | Compile a URL into the knowledge base |
| `add-content` | `operationId`, `html`, `url?`, `title?`, `workspace?` | Compile captured page HTML |
| `query` | `operationId`, `text`, `workspace?` | Query the knowledge base |
| `repair` | `operationId`, `workspace?` | Re-compile interrupted documents |
| `sync` | `workspace?` | Full state dump (registry, index, summaries, concepts, workspaces) |

### Bridge → Client: Error/StdErr

| Message | Fields | Description |
|---|---|---|
| `stderr` | `operationId`, `text` | Raw stderr from pi child process |
| `error` | `operationId`, `message` | Operation-level error |

### Bridge URL Configuration

The Settings panel (gear icon) includes a **Bridge URL** input field, but it behaves differently per mode:

| Mode | Default Bridge URL | Configurable? |
|---|---|---|
| Local | `ws://127.0.0.1:9876` | Yes — editable in Settings |
| Hosted | `wss://api.mdevd.co/keb/v1` | No — hardcoded at build time |

In **hosted mode**, the bridge URL is a build-time constant (`HOSTED_BRIDGE_URL` in `lib/env.ts`, overridable via `VITE_HOSTED_BRIDGE_URL` env var). The Settings panel hides the URL input entirely when in hosted mode — there is no runtime override. In **local mode**, the URL is freely editable and persisted to `chrome.storage.local`.

> **Note:** In hosted mode, the `workspace` field is **ignored** — the server enforces the authenticated username as the workspace for all operations. In local mode, `workspace` is optional; the bridge treats `undefined` as the default workspace (the extension sends `"default"` explicitly).

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

### Hosted Bridge URL

The extension's hosted mode bridge URL (`wss://api.mdevd.co/keb/v1`) is a **build-time constant** set in `packages/extension/src/lib/env.ts`. It is NOT configurable at runtime — the Settings panel hides the URL input in hosted mode. To target a different hosted bridge (e.g., a staging instance), set the `VITE_HOSTED_BRIDGE_URL` environment variable at build time:

```bash
VITE_HOSTED_BRIDGE_URL=wss://staging.example.com/keb/v1 pnpm build
```

Vite inlines this value into the bundle, so it cannot be changed after the extension is built.
