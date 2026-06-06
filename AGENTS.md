# AGENTS.md — AI agent instructions for Keb

## Project overview

Keb is a Chrome extension + bridge server that turns web pages into a personal knowledge base powered by LLMs. It's a **pnpm workspace monorepo** with two main packages and a git submodule:

| Package | Language | Description |
|---|---|---|
| `packages/bridge` | JS + JSDoc | HTTP + WebSocket server. Supports local mode (no auth) and hosted mode (JWT auth). Spawns `pi` child processes for LLM work. |
| `packages/extension` | TypeScript + React | Chrome side panel (Manifest V3). Supports local and hosted bridge modes with built-in login/signup. Built with Vite + Tailwind + shadcn/ui. |
| `packages/pi-kb` | TypeScript | **Git submodule** → `github.com/dheerapat/pi-kb`. The knowledge base pi extension. Bridge imports its `FilesystemStore` for filesystem reads. |

The root `package.json` orchestrates both packages via `pnpm`.

## Architecture pattern: Ports & Adapters

The bridge follows the same pattern as pi-kb. **Always follow this when adding features.**

```
ports/          ← interfaces (contracts)
  kb-store.js       what a KB storage backend must do
  user-store.js     what a user credential store must do

adapters/       ← concrete implementations
  pi-kb-store.js    KbStore backed by pi-kb's FilesystemStore
  user-store-sqlite.js  UserStore backed by SQLite
  pi-rpc-spawner.js   spawns pi child processes

handlers/       ← orchestration (depends on ports, never on adapters)
  auth-handler.js       HTTP auth endpoints → uses UserStore port
  add-url-handler.js    add (URL) → uses KbStore port + spawnPi
  add-content-handler.js add-content → HTML→Markdown + spawnPi
  query-handler.js      query → uses spawnPi
  repair-handler.js     repair → uses KbStore port + spawnPi
  sync-handler.js       sync → uses KbStore port

bridge-server.js  ← composition root (wires adapters to handlers)
```

**Rule:** Handlers import from `ports/` types. `bridge-server.js` is the only file that imports from `adapters/` directly and passes them to handlers. This makes adapters swappable without touching handler logic.

### How to add a feature

1. If it needs a new data source, define a **port** in `src/ports/`
2. Write an **adapter** in `src/adapters/` implementing the port
3. Write a **handler** in `src/handlers/` that uses the port
4. Wire it in `bridge-server.js` — instantiate the adapter, pass it to the handler

### How to swap an adapter (e.g., JSON → PostgreSQL)

1. Create `src/adapters/user-store-postgres.js` implementing `UserStore`
2. In `bridge-server.js`, change `createSqliteUserStore()` → `createPostgresUserStore({ connectionString })`
3. Done. No handler changes needed.

## pi-kb submodule

`packages/pi-kb/` is a **git submodule** pointing to `https://github.com/dheerapat/pi-kb.git`. The bridge does NOT use pi-kb as a pi extension at runtime — it directly imports the `FilesystemStore` class for filesystem reads.

### Build step

The bridge imports TypeScript source from the submodule. These files must be compiled before the bridge can run:

```
packages/pi-kb/extensions/kb/adapters/filesystem-store.ts  ──┐
packages/pi-kb/extensions/kb/ports/types.ts                 ──┤ compiled by
packages/pi-kb/extensions/kb/utils.ts                       ──┘ tsconfig.build-pi-kb.json
                                                                  │
                                                                  ▼
                                          packages/pi-kb/dist/standalone/
                                            extensions/kb/adapters/filesystem-store.js
                                            extensions/kb/ports/types.js (+ .d.ts)
                                            extensions/kb/utils.js (+ .d.ts)
                                            package.json ← {"type":"module"}
```

The bridge imports from this compiled output:

```js
// src/adapters/pi-kb-store.js
import { FilesystemStore } from "../../../pi-kb/dist/standalone/extensions/kb/adapters/filesystem-store.js";
```

### When pi-kb updates

```bash
cd packages/pi-kb
git pull origin main          # get latest
cd ../bridge
pnpm build:pi-kb            # recompile standalone adapter
# commit the updated submodule pointer in the keb repo
```

### When you add a file to the compiled set

Update `tsconfig.build-pi-kb.json`'s `include` array. Only add files that have **zero pi-specific dependencies** (no `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `typebox`). The three files above only use `node:fs`, `node:path`, `node:crypto`, `node:os`.

## Key files and responsibilities

### `bridge-server.js`
Composition root. Creates adapters, starts HTTP + WebSocket server. Routes WebSocket messages to handlers. Supports two modes via `KEB_MODE` env var: `local` (no auth, workspace from client) and `hosted` (JWT auth, workspace enforced from username).

### `lib/auth.js`
JWT sign/verify (`generateToken`, `verifyToken`), bcrypt password hashing (`hashPassword`, `comparePassword`), username validation (`validateUsername` — slugifies, enforces 3-30 chars `[a-z0-9-]`), password validation (`validatePassword` — min 8 chars).

### `handlers/auth-handler.js`
HTTP request handler. Routes `POST /api/signup`, `POST /api/login`, `GET /api/me`. On signup, creates workspace via `ensureWorkspace()`. Returns JSON. Returns `false` for non-auth routes (so the HTTP server can 404).

### `handlers/add-url-handler.js`
Handles `add` WebSocket messages. Dedup-checks URL against `KbStore` registry before spawning pi. Enforces document limit (hosted free tier). Prompt: `/kb-add -f -w <workspace> <url>`.

### `handlers/add-content-handler.js`
Handles `add-content` WebSocket messages. Converts captured page HTML to Markdown via `@kreuzberg/html-to-markdown-node`, prepends metadata, enforces document limit, then spawns pi with `/kb-add-content -f -w <workspace> <content>`.

### `handlers/repair-handler.js`
Handles `repair` WebSocket messages. Counts pending (compiled === false) registry entries. Short-circuits if none; otherwise spawns pi with `/kb-repair -w <workspace>`.

### `handlers/query-handler.js`
Handles `query` WebSocket messages. Spawns pi with `/kb-query -w <workspace> <text>` and wires stdout/stderr back to WebSocket.

### `handlers/sync-handler.js`
Handles `sync` WebSocket messages. Pure read — calls `kbStore.buildSyncData(workspace)` and sends `sync_result` back. No pi process needed.

### `adapters/pi-kb-store.js`
Bridge-specific wrapper around pi-kb's `FilesystemStore`. Implements the bridge's `KbStore` port. Adds `buildSyncData()` (reads all summaries/concepts and builds the sync payload). Also exports `ensureWorkspace()` and `workspaceExists()` for the auth flow.

### `adapters/user-store-sqlite.js`
Stores users in `~/.pi/agent/kb/users.db` using better-sqlite3. Uses a `users` table with columns `username`, `passwordHash`, `createdAt`. Eliminates race conditions present in the JSON file adapter. Implements `UserStore` port.

### `adapters/pi-rpc-spawner.js`
Spawns `pi --mode rpc --no-session --no-builtin-tools` child processes. Parses JSONL stdout, forwards events via callbacks (`onEvent`, `onDone`, `onStderr`, `onError`). Detects pre-agent errors (fetch failures) and fails fast. The caller sends a prompt over stdin.

### Extension key files

#### `lib/ws.ts`
WebSocket client (WSClient class). Supports local mode (direct connect) and hosted mode (JWT auth handshake first). Configurable bridge URL. Sends workspace with every message in local mode.

#### `lib/api.ts`
HTTP client for bridge auth endpoints. `signup()`, `login()`, `getMe()`. Used by AuthPanel in hosted mode.

#### `sidepanel/components/AuthPanel.tsx`
Login/signup form. Validates username (3-30 chars, `[a-z0-9-]`) and password (8+ chars). Toggles between login and signup. Calls bridge HTTP API. Stores JWT on success.

#### `sidepanel/components/SettingsPanel.tsx`
Settings overlay. Mode toggle (local/hosted), bridge URL input (local mode only — hidden in hosted mode), sign out button (hosted mode only). The hosted bridge URL is a build-time constant and not runtime-configurable.

#### `sidepanel/App.tsx`
Main application shell. On startup, loads bridge config from storage. If hosted mode without token, shows AuthPanel. If local mode or hosted with token, connects WS and shows tabs. Manages settings overlay visibility.

## Development workflow

### First time

```bash
git clone --recurse-submodules https://github.com/auto-medica-labs/keb.git
cd keb
pnpm install
pnpm build          # builds extension + landing page
pnpm build:pi-kb    # compiles pi-kb standalone adapter

# Create .env from example (optional — defaults to local mode)
cp packages/bridge/.env.example packages/bridge/.env
```

### Day-to-day

```bash
# Bridge dev (auto-restarts on file changes, builds pi-kb automatically)
pnpm bridge:dev

# Extension dev (Vite HMR)
pnpm dev

# Typecheck everything before committing
pnpm typecheck

# Lint + format
pnpm lint
pnpm format
```

`pnpm bridge` and `pnpm bridge:dev` are defined in the root `package.json` and run `build:pi-kb` before starting the bridge. The bridge package itself has no `prestart`/`predev` hooks — the root orchestrates both steps.

### Before committing

```bash
pnpm typecheck      # must pass with zero errors
pnpm lint           # must pass
pnpm format:check   # must pass (CI checks this)
```

### After touching pi-kb submodule or its build config

```bash
pnpm build:pi-kb    # recompile standalone adapter
```

### Testing auth endpoints manually

```bash
# Create .env if you haven't already
cp packages/bridge/.env.example packages/bridge/.env
# edit packages/bridge/.env: set KEB_MODE=hosted and JWT_SECRET

# Start bridge (auto-loads .env)
pnpm bridge &

# Signup
curl -X POST http://127.0.0.1:9876/api/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"password123"}'

# Login
curl -X POST http://127.0.0.1:9876/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"password123"}'
```

## Code style

### Bridge (`packages/bridge/`)
- **JavaScript with JSDoc** for type annotations. No `.ts` files.
- All JSDoc types are in `@typedef` blocks at the top of each file.
- Use `@ts-check` at the top of every file.
- Ports are pure JSDoc typedefs — no runtime code. Just `export {};` at the bottom so TypeScript treats it as a module.
- Handlers export named functions, not classes.
- Adapters export factory functions (`createXxxStore()`), not classes.
- Log via `log()` from `lib/utils.js`, never `console.log`.

### Extension (`packages/extension/`)
- **TypeScript** with strict mode.
- React components in `src/sidepanel/components/`.
- shadcn/ui components in `src/components/ui/` (generated, don't edit manually).
- State management: `chrome.storage.local` for persistence (see `lib/store.ts`), React state for UI.
- Auth: `lib/api.ts` calls bridge HTTP endpoints (login/signup/me). `components/AuthPanel.tsx` provides the login/signup form. `components/SettingsPanel.tsx` lets users switch between local and hosted modes and configure the bridge URL.

#### `lib/env.ts`
Build-time constants inlined by Vite. Exports `HOSTED_BRIDGE_URL` — the immutable WebSocket URL used in hosted mode. Defaults to `wss://api.mdevd.co/keb/v1`, overridable at build time via `VITE_HOSTED_BRIDGE_URL` env var. This value is NOT configurable at runtime; the Settings panel hides the URL input in hosted mode.

#### `lib/store.ts`
chrome.storage.local cache wrapper. Stores bridge config (mode, bridgeUrl, token, username) and KB state (registry, index, summaries, concepts). `DEFAULT_BRIDGE_CONFIG` defaults to hosted mode with `wss://api.mdevd.co/keb/v1`. `persistBridgeConfig` / `setBridgeConfig` handle partial updates, so mode-specific defaults (e.g. `ws://127.0.0.1:9876` for local) are applied by the caller. Note: in hosted mode, `App.tsx` ignores any stored `bridgeUrl` and always uses `HOSTED_BRIDGE_URL` from `env.ts`.

## Health check endpoint

The bridge exposes `GET /api/healthcheck` — returns `{"status":"ok","mode":"hosted"|"local"}`. **No auth required.** Works in both local and hosted modes. Used by Docker healthcheck, monitoring, and load balancer probes.

```bash
curl http://127.0.0.1:9876/api/healthcheck
```

## Status endpoint

`GET /api/status` returns live runtime metrics. **Requires `X-API-Key` header** matching `ADMIN_KEY` env var. If `ADMIN_KEY` is not set, returns 501.

```bash
curl -H "X-API-Key: your-key" http://127.0.0.1:9876/api/status
```

Response includes:
- `uptime` — seconds since server start
- `connections` — active WebSocket clients with usernames and connect time
- `operations` — active pi child processes by type (add, add-content, query, repair)
- `workspaces` — all workspaces with document counts and last activity timestamps

The Dockerfile and docker-compose.yml healthcheck use this endpoint (not a raw WebSocket open as before).

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `KEB_MODE` | No | `local` | Bridge mode: `local` (no auth) or `hosted` (auth required) |
| `JWT_SECRET` | For hosted mode | Random per-process | JWT signing secret |
| `PORT` | No | `9876` | HTTP + WebSocket listen port |
| `HOST` | No | `127.0.0.1` | Listen address (`0.0.0.0` for Docker) |
| `LLM_PROVIDER` | Recommended* | — | Custom provider name (e.g., `ollama`, `anthropic`) |
| `LLM_BASE_URL` | Recommended* | — | API base URL for custom provider |
| `LLM_MODEL` | Recommended* | — | Model ID (e.g., `llama3.1:8b`, `claude-sonnet-4-20250514`) |
| `LLM_API` | No | `openai-completions` | API type: `openai-completions`, `anthropic-messages`, `google-generative-ai`, `openai-responses` |
| `LLM_API_KEY` | Recommended* | — | API key (can be dummy for local models) |
| `LLM_MODEL_NAME` | No | — | Optional human-readable model name |
| `LLM_REASONING` | No | — | Set `true` for reasoning-capable models |
| `LLM_THINKING` | No | `off` | Thinking level: `off`, `low`, `medium`, `high`, `xhigh` |
| `ADMIN_KEY` | No | — | Secret for `GET /api/status` (sent via `X-API-Key` header) |
| `ANTHROPIC_API_KEY` | Legacy* | — | Native pi Anthropic key (alternative to LLM_*) |
| `PI_DEFAULT_PROVIDER` | Legacy* | — | Default provider (e.g., `anthropic`) |
| `PI_DEFAULT_MODEL` | Legacy* | — | Default model (e.g., `claude-sonnet-4-20250514`) |

* Use either the `LLM_*` group **or** the legacy `ANTHROPIC_API_KEY` + `PI_DEFAULT_*` group. The `LLM_*` approach is recommended for custom providers.

See `.env.example` for all supported LLM providers.

## WebSocket message types

```
Client → Bridge:
  { type: "auth", token: "<jwt>" }           ← first message (hosted mode only)
  { type: "add", operationId, url, workspace? }
  { type: "add-content", operationId, html, url?, title?, workspace? }
  { type: "query", operationId, text, workspace? }
  { type: "repair", operationId, workspace? }
  { type: "sync", workspace? }

Bridge → Client:
  { type: "auth_ok", username }              ← auth success (hosted mode)
  { type: "event", operationId, data }       ← streaming event
  { type: "done", operationId, command }     ← operation complete
  { type: "error", operationId, message }    ← error
  { type: "stderr", operationId, text }      ← raw stderr from pi
  { type: "sync_result", data }              ← sync response
```

In hosted mode, `workspace` is **ignored** from the client — the server enforces the authenticated username. All operations use the authenticated user's workspace. In local mode, `workspace` can be sent by the client and defaults to `"default"` if omitted.

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

`Caddyfile` provides a production reverse-proxy config for `api.mdevd.co/keb/v1`. It uses `handle_path /keb/v1*` to strip the path prefix before proxying to the bridge — this is critical so the bridge receives clean `/api/*` paths. **Note:** the pattern uses `/keb/v1*` (not `/keb/v1/*`) so the WebSocket root path `/keb/v1` (no trailing slash) matches. Caddy handles TLS and WebSocket upgrades automatically.

See `packages/bridge/DEPLOYMENT.md` for full step-by-step production deployment guide.

### Horizontal scaling

Multiple bridge instances behind a load balancer are **not safe** with the default adapters: SQLite (`UserStore`) uses file-level locking, and `FilesystemStore` (`KbStore`) races on registry entries when pi child processes write concurrently. Even sticky sessions don't fully protect against cross-user `users.db` corruption.

To scale horizontally, swap adapters to distributed backends:
- `UserStore` → Postgres (shared user DB across instances)
- `KbStore` → S3, Postgres, or NFS with proper locking

The bridge server itself is stateless — JWT verification uses only `JWT_SECRET`, no session store needed.

## Troubleshooting

### `Cannot find module '.../filesystem-store.js'`
Run `pnpm build:pi-kb` to compile the submodule. This runs automatically via `pnpm bridge` but you may need to run it manually after a fresh clone.

### `MODULE_TYPELESS_PACKAGE_JSON` warning
The compiled standalone output needs a `package.json` with `{"type":"module"}`. The `build:pi-kb` script creates this automatically.

### Port already in use
```bash
lsof -ti:9876 | xargs kill
```

### Submodule not initialized
```bash
git submodule update --init --recursive
```
