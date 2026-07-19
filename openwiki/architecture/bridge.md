# Bridge architecture

The bridge is a single Node process that combines an HTTP server and a WebSocket server on the same port. It is intentionally thin: persistence and LLM work are delegated to adapters and spawned `pi` child processes.

## Entry point

[`packages/bridge/src/bridge-server.js`](../../packages/bridge/src/bridge-server.js) reads `KEB_MODE`, instantiates adapters, creates a `StatusTracker`, and starts the HTTP server. WebSocket upgrades are accepted only on `/ws`.

Two modes:

- **`local`** (default) — no auth; workspace comes from the client or defaults to `"default"`.
- **`hosted`** — HTTP signup/login endpoints are active; the WebSocket requires a JWT `auth` message first; workspace is forced to the authenticated username.

## Ports & adapters

The bridge follows the ports-and-adapters pattern documented in [`AGENTS.md`](../../AGENTS.md).

| Port        | File                                                                       | Adapter                                                                                                                  | Responsibility                                                                 |
| ----------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `KebStore`  | [`src/ports/keb-store.js`](../../packages/bridge/src/ports/keb-store.js)   | [`src/adapters/pi-keb-store.js`](../../packages/bridge/src/adapters/pi-keb-store.js) wrapping `pi-keb` `FilesystemStore` | Read registry, summaries, concepts, build sync payload, clear workspace        |
| `UserStore` | [`src/ports/user-store.js`](../../packages/bridge/src/ports/user-store.js) | [`src/adapters/user-store-sqlite.js`](../../packages/bridge/src/adapters/user-store-sqlite.js)                           | bcrypt-hashed users in `~/.pi/agent/keb/users.db`                              |
| spawn Pi    | —                                                                          | [`src/adapters/pi-rpc-spawner.js`](../../packages/bridge/src/adapters/pi-rpc-spawner.js)                                 | Spawns `pi --mode rpc --no-session --no-builtin-tools` and parses JSONL stdout |

Handlers live in [`src/handlers/`](../../packages/bridge/src/handlers/) and depend only on the ports, never on adapter implementations. To swap an adapter, change the factory call in `bridge-server.js`.

## HTTP routes

[`src/lib/http-routes.js`](../../packages/bridge/src/lib/http-routes.js) mounts:

- `GET /api/healthcheck` — always public, returns `{ status, mode }`.
- `GET /api/config` — public server config.
- `GET /api/status` — requires `X-API-Key` matching `ADMIN_KEY`; returns connections, active operations by type, and per-workspace doc counts via `StatusTracker`.
- `POST /api/signup`, `POST /api/login`, `GET /api/me` — hosted only; implemented in [`src/handlers/auth-handler.js`](../../packages/bridge/src/handlers/auth-handler.js).

CORS headers are applied to every response so browser-based clients can call the bridge cross-origin.

## WebSocket connection lifecycle

[`src/lib/connection.js`](../../packages/bridge/src/lib/connection.js) manages one client connection:

1. Parses each incoming JSON message.
1. In hosted mode, requires `{ type: "auth", token }` before any operation.
1. Determines the workspace (`username` in hosted mode, client value in local mode).
1. Dispatches to a handler based on `msg.type`.
1. Tracks active `pi` child processes in a per-connection `Map<operationId, ChildProcess>` and a global `Set` for graceful shutdown.
1. Kills all children when the client disconnects.

Heartbeat ping/pong runs every 30 s in `bridge-server.js`; unresponsive clients are terminated after two missed pings.

## Handlers

| Message type  | Handler                                                                               | What it does                                                                      |
| ------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `add`         | [`add-url-handler.js`](../../packages/bridge/src/handlers/add-url-handler.js)         | URL dedup check → document limit check → spawn `/keb:add`                         |
| `add-content` | [`add-content-handler.js`](../../packages/bridge/src/handlers/add-content-handler.js) | HTML → Markdown via `@kreuzberg/html-to-markdown-node` → spawn `/keb:add:content` |
| `query`       | [`query-handler.js`](../../packages/bridge/src/handlers/query-handler.js)             | Spawn `/keb:query`                                                                |
| `repair`      | [`repair-handler.js`](../../packages/bridge/src/handlers/repair-handler.js)           | Count pending registry entries; spawn `/keb:repair` if any                        |
| `sync`        | [`sync-handler.js`](../../packages/bridge/src/handlers/sync-handler.js)               | Read full workspace state and send `sync_result` (no `pi` process)                |
| `clear`       | [`clear-handler.js`](../../packages/bridge/src/handlers/clear-handler.js)             | Wipe workspace contents and send empty `sync_result` (no `pi` process)            |

`add`, `add-content`, and `repair` can short-circuit and return `null` instead of a child process. `query` always spawns.

## pi RPC spawner

[`src/adapters/pi-rpc-spawner.js`](../../packages/bridge/src/adapters/pi-rpc-spawner.js) runs `pi` with these flags:

```
pi --mode rpc --no-session --no-builtin-tools --system-prompt "" --no-context-files --no-skills
```

It sends the prompt as a JSONL line on stdin, then forwards parsed stdout events through callbacks. Key behaviors:

- 5-minute hard timeout; kills hung children.
- Detects pre-agent errors (e.g. URL fetch failures) via `extension_ui_request`/`notify`/`error`.
- Surfaces `stderr` raw to the client as `{ type: "stderr" }`.
- Emits `done` on `agent_end`, `error` on non-zero exit or missing `agent_end`.

## Auth utilities

[`src/lib/auth.js`](../../packages/bridge/src/lib/auth.js):

- JWT sign/verify with `jsonwebtoken`, 30-day expiry.
- `JWT_SECRET` is required in hosted mode; exits if missing.
- bcryptjs password hashing (12 rounds).
- Username validation: slugified, 3–30 chars, `[a-z0-9-]` only.
- Password validation: 8–128 chars.

## Operational limits

In hosted mode `bridge-server.js` sets `MAX_DOCUMENTS = 50`. `add-url-handler.js` and `add-content-handler.js` enforce the limit before spawning `pi`. Local mode has no limit.

## Graceful shutdown

On `SIGINT`/`SIGTERM`, `bridge-server.js` kills tracked child processes, terminates WebSocket clients, closes the HTTP server, and exits after 5 s if necessary.
