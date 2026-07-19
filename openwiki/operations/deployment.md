# Deployment & operations

The bridge is designed to run in Docker behind Caddy. A dedicated backup sidecar uploads daily archives to Cloudflare R2.

## Docker image

[`packages/bridge/Dockerfile`](../../packages/bridge/Dockerfile) is a multi-stage build:

1. **`pi-layer`** — installs `pi` CLI and `pi-keb` extension globally.
1. **`deps-layer`** — installs bridge npm dependencies.
1. **`pi-keb-build`** — copies `packages/pi-keb/extensions` and compiles the standalone adapter with `scripts/build-pi-keb.js`.
1. **Final** — minimal `node:22-slim` with production deps, compiled pi-keb output, and bridge source.

Build from the repo root so the Dockerfile can copy files across packages:

```bash
docker build -f packages/bridge/Dockerfile -t keb-bridge .
```

The image defaults to `KEB_MODE=hosted` and `HOST=0.0.0.0`.

## Environment variables

Copy [`packages/bridge/.env.example`](../../packages/bridge/.env.example) to `.env` and fill in:

| Variable                                                   | Purpose                                                                                |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `KEB_MODE`                                                 | `local` or `hosted`                                                                    |
| `JWT_SECRET`                                               | Required for hosted mode; keep stable across restarts                                  |
| `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | Primary custom-provider config (written to `models.json`)                              |
| `LLM_API`                                                  | `openai-completions`, `anthropic-messages`, `google-generative-ai`, `openai-responses` |
| `LLM_MODEL_NAME`, `LLM_REASONING`, `LLM_THINKING`          | Optional model tuning                                                                  |
| `ADMIN_KEY`                                                | Enables `GET /api/status`                                                              |
| `R2_*`                                                     | Backup sidecar credentials                                                             |
| `PORT`, `HOST`                                             | Listen address/port                                                                    |

Legacy native-provider env vars (`ANTHROPIC_API_KEY`, `PI_DEFAULT_*`, etc.) are also supported via the entrypoint.

## Entrypoint

[`packages/bridge/entrypoint.sh`](../../packages/bridge/entrypoint.sh) runs before the bridge and writes pi config files from env vars:

- `models.json` from `LLM_*`
- `auth.json` from legacy provider API keys
- `settings.json` with default provider/model

Mounting `models.json` or `auth.json` directly skips the generated writes.

## Docker Compose

[`packages/bridge/docker-compose.yml`](../../packages/bridge/docker-compose.yml) runs three services:

- `bridge` — the keb-bridge image, bind-mounts `./data/keb` to `/root/.pi/agent/keb`.
- `caddy` — reverse proxy with auto TLS.
- `backup` — Alpine + rclone sidecar for daily R2 backups.

Start everything:

```bash
cp packages/bridge/.env.example packages/bridge/.env
# edit .env
docker compose -f packages/bridge/docker-compose.yml up -d
```

## Caddy reverse proxy

[`packages/bridge/Caddyfile`](../../packages/bridge/Caddyfile) exposes `api.mdevd.co` and strips `/keb/v1/*` before proxying to the bridge. WebSocket upgrades and TLS are handled automatically. A 240 s read timeout accommodates long compilations.

Clients connect to:

- WebSocket: `wss://api.mdevd.co/keb/v1/ws`
- HTTP auth: `https://api.mdevd.co/keb/v1/api/signup`

The path pattern is `/keb/v1/*` (note no trailing slash requirement) so `/keb/v1/ws` matches.

## Backup sidecar

[`packages/bridge/backup.Dockerfile`](../../packages/bridge/backup.Dockerfile) builds an Alpine image with `rclone` and `dcron`.

[`packages/bridge/scripts/backup-to-r2.sh`](../../packages/bridge/scripts/backup-to-r2.sh):

1. Creates a `tar.gz` of `/data`.
1. Uploads it to `s3://<bucket>/keb-backups/<timestamp>.tar.gz` using inline rclone S3 config.
1. Prunes backups older than `R2_BACKUP_RETENTION_DAYS`.

Scheduled daily at midnight `Asia/Bangkok` (UTC+7). Run manually with:

```bash
docker exec keb-backup /usr/local/bin/backup-to-r2.sh
```

## Health & status

- `GET /api/healthcheck` — public, used by Docker healthcheck.
- `GET /api/status` — requires `X-API-Key: <ADMIN_KEY>`; returns uptime, connections, active operations by type, and per-workspace document counts.

## Local development without Docker

```bash
pnpm install
pnpm build:pi-keb
pnpm bridge:dev       # auto-restart on file changes
```

The bridge auto-loads `packages/bridge/.env` if present. In local mode no auth endpoints are active.

## Horizontal scaling notes

Multiple bridge instances behind a load balancer are **not safe** with default adapters:

- SQLite `users.db` uses file-level locking.
- `FilesystemStore` races on registry entries when concurrent `pi` processes write the same workspace.

To scale horizontally, swap adapters:

- `UserStore` → PostgreSQL adapter.
- `KebStore` → S3/Postgres/NFS adapter with proper locking.

The bridge server itself is stateless (JWT verification uses only `JWT_SECRET`).

## Upgrade procedure

1. `git pull origin main && git submodule update --init --recursive`
1. `docker build -f packages/bridge/Dockerfile -t keb-bridge .`
1. `docker compose -f packages/bridge/docker-compose.yml up -d --force-recreate`

User data in `packages/bridge/data/keb` is bind-mounted and survives container recreation.
