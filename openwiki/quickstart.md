# Keb — Quickstart

Keb turns web pages into a personal knowledge base. It has three runtime pieces:

- **Bridge** (`packages/bridge`) — a combined HTTP + WebSocket server that talks to the clients and spawns `pi` child processes to compile and query knowledge.
- **Chrome extension** (`packages/extension`) — a Manifest V3 side panel with Add / Consult / Browse tabs and right-click capture.
- **Web app** (`packages/web-app`) — a browser-based companion for Consult / Browse against a hosted bridge.

A shared UI package (`packages/shared`) and the `pi-keb` extension submodule (`packages/pi-keb`) provide the knowledge-base engine.

## Repo layout

```
keb/
├── package.json                    # root scripts: build, bridge, typecheck, lint
├── pnpm-workspace.yaml             # packages/*
├── AGENTS.md                       # AI agent instructions
├── PLAN/
│   ├── OKF_SPEC.md                 # on-disk knowledge format spec
│   ├── PRODUCTION_READINESS.md     # launch/hardening roadmap
│   └── ...
├── packages/
│   ├── bridge/                     # @keb/bridge — HTTP + WS server
│   ├── extension/                  # @keb/extension — Chrome side panel
│   ├── web-app/                    # @keb/web-app — browser chat client
│   ├── shared/                     # @keb/shared — QueryPanel, MarkdownRenderer, env, api
│   ├── landing/                    # static landing page builder
│   └── pi-keb/                     # git submodule → github.com/auto-medica-labs/pi-keb
```

## Local development

Prerequisites: `pi` CLI installed, `pnpm` 11+, git submodule initialized.

```bash
git clone --recurse-submodules https://github.com/auto-medica-labs/keb.git
cd keb
pnpm install
pnpm build:pi-keb     # compile submodule standalone adapter
```

Start the bridge in local mode (no auth):

```bash
pnpm bridge           # or pnpm bridge:dev for auto-restart
```

The bridge listens on `ws://127.0.0.1:9876/ws` and exposes `GET /api/healthcheck`.

Load the extension:

1. `pnpm build` builds extension + landing + web-app.
1. Open `chrome://extensions`, enable Developer mode, click **Load unpacked**.
1. Select `packages/extension/dist/`.
1. Click the Keb icon or right-click a page to add content.

Run the web app dev server:

```bash
pnpm chat:dev         # Vite on http://localhost:4000
```

## Important commands

| Command                           | Purpose                                             |
| --------------------------------- | --------------------------------------------------- |
| `pnpm build`                      | Production build of extension, landing, and web-app |
| `pnpm bridge` / `pnpm bridge:dev` | Start bridge (compiles pi-keb first)                |
| `pnpm build:pi-keb`               | Compile pi-keb standalone adapter manually          |
| `pnpm typecheck`                  | Type-check bridge JSDoc + TS packages               |
| `pnpm lint` / `pnpm format`       | oxlint / oxfmt                                      |

## Where to read next

- [Bridge architecture](architecture/bridge.md)
- [Client architecture](architecture/clients.md)
- [Knowledge format](domain/okf.md)
- [Adding knowledge](workflows/adding-knowledge.md)
- [Query & sync](workflows/query-and-sync.md)
- [Deployment & operations](operations/deployment.md)

## First-use note

The extension opens `https://keb.mdevd.co/how-to-use` on first run ([`packages/extension/src/sidepanel/App.tsx`](../packages/extension/src/sidepanel/App.tsx)). The hosted bridge URL (`wss://api.mdevd.co/keb/v1`) is a build-time constant in [`packages/shared/src/lib/env.ts`](../packages/shared/src/lib/env.ts); override it with `VITE_HOSTED_BRIDGE_URL` at build time.
