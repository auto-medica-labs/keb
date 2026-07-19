# AGENTS.md — AI agent instructions for Keb

## OpenWiki

This repository has documentation located in the /openwiki directory.

Start here:

- [OpenWiki quickstart](openwiki/quickstart.md)

OpenWiki includes repository overview, architecture notes, workflows, domain concepts, operations, integrations, testing guidance, and source maps.

When working in this repository, read the OpenWiki quickstart first, then follow its links to the relevant architecture, workflow, domain, operation, and testing notes.

## Project overview

Keb is a Chrome extension + bridge server that turns web pages into a personal knowledge base powered by LLMs. It's a **pnpm workspace monorepo**:

| Package              | Language           | Description                                                                                   |
| -------------------- | ------------------ | --------------------------------------------------------------------------------------------- |
| `packages/bridge`    | JS + JSDoc         | HTTP + WebSocket server. Local (no auth) and hosted (JWT) modes. Spawns `pi` child processes. |
| `packages/extension` | TypeScript + React | Chrome side panel (Manifest V3). Local/hosted modes.                                          |
| `packages/web-app`   | TypeScript + React | Browser-based consult client.                                                                 |
| `packages/shared`    | TypeScript + React | Shared UI components, WS client, auth client, env constants.                                  |
| `packages/pi-keb`    | TypeScript         | **Git submodule** → `github.com/auto-medica-labs/pi-keb`. Knowledge-base engine.              |

## Architecture pattern: Ports & Adapters

The bridge follows the same pattern as pi-keb. **Always follow this when adding features.**

```
ports/          ← interfaces (contracts)
  keb-store.js
  user-store.js

adapters/       ← concrete implementations
  pi-keb-store.js      → wraps pi-keb FilesystemStore
  user-store-sqlite.js → SQLite user store
  pi-rpc-spawner.js    → spawns pi --mode rpc

handlers/       ← orchestration (depends on ports only)
  auth-handler.js
  add-url-handler.js
  add-content-handler.js
  query-handler.js
  repair-handler.js
  sync-handler.js
  clear-handler.js

bridge-server.js ← composition root (wires adapters to handlers)
```

**Rule:** Handlers import from `ports/`. `bridge-server.js` is the only file that imports `adapters/` directly. Swapping an adapter (e.g., SQLite → Postgres) is a one-line change in `bridge-server.js`.

### Adding a feature

1. If it needs a new data source, define a **port** in `src/ports/`.
1. Write an **adapter** in `src/adapters/` implementing the port.
1. Write a **handler** in `src/handlers/` that uses the port.
1. Wire it in `bridge-server.js`.

## pi-keb submodule

`packages/pi-keb/` is a git submodule. The bridge imports its compiled `FilesystemStore` for filesystem reads.

Compile after clone or update:

```bash
pnpm build:pi-keb
```

If you add a file to the compiled standalone set, update `packages/bridge/tsconfig.build-pi-keb.json`'s `include`. Only add files with zero pi-specific dependencies.

## Key files

- `packages/bridge/src/bridge-server.js` — composition root; starts HTTP + WS server.
- `packages/bridge/src/lib/connection.js` — per-WebSocket connection lifecycle.
- `packages/bridge/src/lib/auth.js` — JWT, bcrypt, username/password validation.
- `packages/bridge/src/lib/http-routes.js` — HTTP routing.
- `packages/bridge/src/lib/status-tracker.js` — runtime metrics for `/api/status`.
- `packages/bridge/src/handlers/*.js` — operation handlers.
- `packages/bridge/src/adapters/*.js` — concrete implementations.
- `packages/extension/src/sidepanel/App.tsx` — extension main shell.
- `packages/extension/src/service-worker.ts` — context menus + side-panel open.
- `packages/web-app/src/App.tsx` — web app shell.
- `packages/shared/src/lib/env.ts` — `HOSTED_BRIDGE_URL` build-time constant.

## Code style

### Bridge

- JavaScript with JSDoc (`// @ts-check` at the top).
- No `.ts` files.
- Ports are pure JSDoc typedefs; end with `export {};`.
- Handlers export named functions; adapters export factory functions (`createXxxStore`).
- Log via `log()` in `lib/utils.js`, never `console.log`.

### Extension / web-app / shared

- TypeScript strict mode.
- React components under `src/sidepanel/components/` or `src/components/`.
- shadcn/ui components under `src/components/ui/` (generated — don't edit manually).
- State: `chrome.storage.local` for extension, `localStorage` for web-app.

## Development workflow

```bash
# First time
pnpm install
pnpm build:pi-keb

# Bridge dev
pnpm bridge:dev

# Extension / web-app dev
pnpm dev        # extension
pnpm chat:dev   # web app

# Before committing
pnpm typecheck
pnpm lint
pnpm format:check
```

## Testing auth manually

```bash
# Start bridge in hosted mode with JWT_SECRET set
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

## Environment notes

- `KEB_MODE` = `local` (default) or `hosted`.
- `JWT_SECRET` required in hosted mode; keep stable across restarts.
- `ADMIN_KEY` enables `GET /api/status`.
- LLM config: prefer `LLM_PROVIDER`/`LLM_BASE_URL`/`LLM_MODEL`/`LLM_API_KEY`; legacy `ANTHROPIC_API_KEY` + `PI_DEFAULT_*` also supported.
- See `packages/bridge/.env.example` for all supported providers.

## Troubleshooting

- `Cannot find module '.../filesystem-store.js'` → run `pnpm build:pi-keb`.
- Port 9876 in use → `lsof -ti:9876 | xargs kill`.
- Submodule not initialized → `git submodule update --init --recursive`.

For full architecture, workflows, deployment, and source maps, see [OpenWiki](openwiki/quickstart.md).
