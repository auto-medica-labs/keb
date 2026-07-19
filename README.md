# Keb

A Chrome extension that turns your browser into a personal knowledge base, powered by [pi](https://github.com/earendil-works/pi-coding-agent). Add any web page with two clicks, then consult and browse structured, interlinked wiki pages compiled by your LLM — all from Chrome's side panel.

The bridge server supports both **single-user mode** (local, self-hosted) and **hosted multi-user mode** (SaaS-style with signup/login and per-user workspaces).

Built with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4**, and **shadcn/ui**. Managed as a **pnpm workspace** monorepo.

## Documentation

- **[OpenWiki quickstart](openwiki/quickstart.md)** — overview, local dev, and navigation
- **[Architecture](openwiki/architecture/bridge.md)** — bridge, clients, ports & adapters
- **[Knowledge format](openwiki/domain/okf.md)** — OKF on-disk layout
- **[Workflows](openwiki/workflows/adding-knowledge.md)** — adding, querying, syncing
- **[Deployment](openwiki/operations/deployment.md)** — Docker, Caddy, R2 backups

## Features

- **Add URLs** — right-click a page or paste a URL; `pi` fetches and compiles it.
- **Add current page content** — capture the rendered HTML directly (no fetch needed).
- **Consult** — ask natural-language questions with streaming, cited answers.
- **Browse** — explore summaries and concepts with source tracking.
- **Clear workspace** — wipe all documents from a workspace instantly.
- **Multi-workspace** — isolated knowledge bases per project/topic.
- **User authentication** — JWT-based signup/login with isolated workspaces.
- **Live streaming** — watch compilation and answers in real time.

## Quick start

Prerequisites:

- [pi](https://github.com/earendil-works/pi-coding-agent) installed and in `$PATH`
- [pi-keb](https://github.com/auto-medica-labs/pi-keb) extension installed in pi
- `pnpm` 11+

Clone with submodules and install:

```bash
git clone --recurse-submodules https://github.com/auto-medica-labs/keb.git
cd keb
pnpm install
pnpm build:pi-keb
```

Start the bridge (local mode by default):

```bash
pnpm bridge        # or pnpm bridge:dev for auto-restart
```

Load the extension:

1. `pnpm build`
1. Open `chrome://extensions`, enable **Developer mode**
1. Click **Load unpacked** and select `packages/extension/dist/`

See [`openwiki/quickstart.md`](openwiki/quickstart.md) for detailed setup, web-app dev, and next steps.

## Project structure

```
keb/
├── openwiki/               # documentation
├── packages/
│   ├── bridge/             # HTTP + WebSocket bridge server
│   ├── extension/          # Chrome side panel extension
│   ├── web-app/            # browser-based consult client
│   ├── shared/             # shared React components and WS client
│   ├── landing/            # static landing page
│   └── pi-keb/             # git submodule → knowledge-base engine
├── package.json
└── pnpm-workspace.yaml
```

## Common commands

| Command                           | Description                              |
| --------------------------------- | ---------------------------------------- |
| `pnpm build`                      | Build extension + landing + web-app      |
| `pnpm bridge` / `pnpm bridge:dev` | Start the bridge (compiles pi-keb first) |
| `pnpm chat:dev`                   | Dev server for the web app               |
| `pnpm build:pi-keb`               | Compile pi-keb standalone adapter        |
| `pnpm typecheck`                  | Type-check all packages                  |
| `pnpm lint` / `pnpm format`       | oxlint / oxfmt                           |

## Configuration

Copy `packages/bridge/.env.example` to `.env` and set at least `KEB_MODE` and, for hosted mode, `JWT_SECRET` and your LLM provider vars. See [`openwiki/operations/deployment.md`](openwiki/operations/deployment.md) and the env example for all options.

## Docker

```bash
docker build -f packages/bridge/Dockerfile -t keb-bridge .
docker run -d --name keb-bridge -p 9876:9876 --env-file packages/bridge/.env -v keb-data:/root/.pi/agent/keb keb-bridge
```

Production deployment with Caddy, TLS, and R2 backups is documented in [`openwiki/operations/deployment.md`](openwiki/operations/deployment.md).

## License

| Package          | License                                              | Scope                                                            |
| ---------------- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| `@keb/extension` | [MIT](packages/extension/LICENSE)                    | Free for any use                                                 |
| `@keb/bridge`    | [MIT with SaaS restriction](packages/bridge/LICENSE) | Free for self-hosting; no competing SaaS/cloud hosting permitted |
