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
  user-store-json.js  UserStore backed by a JSON file
  pi-rpc-spawner.js   spawns pi child processes

handlers/       ← orchestration (depends on ports, never on adapters)
  auth-handler.js    HTTP auth endpoints → uses UserStore port
  command-handler.js add/repair → uses KbStore port + spawnPi
  query-handler.js   query → uses spawnPi
  sync-handler.js    sync → uses KbStore port
  add-content-handler.js

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
2. In `bridge-server.js`, change `createJsonUserStore()` → `createPostgresUserStore({ connectionString })`
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

### `handlers/command-handler.js`
Handles `add` and `repair` WebSocket messages. Dedups URLs via `KbStore` registry before spawning pi. The actual pi prompt is `/kb-add -w <workspace> <url>`.

### `adapters/pi-kb-store.js`
Bridge-specific wrapper around pi-kb's `FilesystemStore`. Implements the bridge's `KbStore` port. Adds `buildSyncData()` (reads all summaries/concepts and builds the sync payload). Also exports `ensureWorkspace()` and `workspaceExists()` for the auth flow.

### `adapters/user-store-json.js`
Stores users at `~/.pi/agent/kb/users.json`. Format: `{"username": {"passwordHash":"...", "createdAt":"..."}}`. Implements `UserStore` port.

### `adapters/pi-rpc-spawner.js`
Spawns `pi --mode rpc --no-session --no-builtin-tools` child processes. Parses JSONL stdout, forwards events via callbacks. The caller sends a prompt over stdin.

### Extension key files

#### `lib/ws.ts`
WebSocket client (WSClient class). Supports local mode (direct connect) and hosted mode (JWT auth handshake first). Configurable bridge URL. Sends workspace with every message in local mode.

#### `lib/api.ts`
HTTP client for bridge auth endpoints. `signup()`, `login()`, `getMe()`. Used by AuthPanel in hosted mode.

#### `sidepanel/components/AuthPanel.tsx`
Login/signup form. Validates username (3-30 chars, `[a-z0-9-]`) and password (8+ chars). Toggles between login and signup. Calls bridge HTTP API. Stores JWT on success.

#### `sidepanel/components/SettingsPanel.tsx`
Settings overlay. Mode toggle (local/hosted), bridge URL input, save & reconnect, sign out button.

#### `sidepanel/App.tsx`
Main application shell. On startup, loads bridge config from storage. If hosted mode without token, shows AuthPanel. If local mode or hosted with token, connects WS and shows tabs. Manages settings overlay visibility.

## Development workflow

### First time

```bash
git clone --recurse-submodules https://github.com/auto-medica-labs/keb.git
cd keb
pnpm install
pnpm build          # builds extension
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
- Auth: `lib/api.ts` calls bridge HTTP endpoints (login/signup/me). `components/AuthPanel.tsx` provides the login/signup form. `components/SettingsPanel.tsx` lets users switch between local and hosted modes.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `KEB_MODE` | No | `local` | Bridge mode: `local` (no auth) or `hosted` (auth required) |
| `JWT_SECRET` | For hosted mode | Random per-process | JWT signing secret |
| `ANTHROPIC_API_KEY` | Yes | — | LLM provider API key |
| `PI_DEFAULT_PROVIDER` | Recommended | — | e.g. `anthropic` |
| `PI_DEFAULT_MODEL` | Recommended | — | e.g. `claude-sonnet-4-20250514` |
| `PORT` | No | `9876` | HTTP + WebSocket listen port |
| `HOST` | No | `127.0.0.1` | Listen address (`0.0.0.0` for Docker) |

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
