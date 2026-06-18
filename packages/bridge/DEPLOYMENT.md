# DEPLOYMENT.md — Deploying Keb Bridge to Production

## Prerequisites

- Ubuntu instance (AWS EC2, Lightsail, or any VPS)
- Docker installed and running
- A DNS A record pointing to the instance's public IP (e.g. `api.mdevd.co`)
- Ports 80 and 443 open in the firewall (security group / Lightsail networking)

## Step 1 — Clone the repo

```bash
ssh ubuntu@api.mdevd.co

git clone --recurse-submodules https://github.com/auto-medica-labs/keb.git
cd keb
```

If you forgot `--recurse-submodules`:

```bash
git submodule update --init --recursive
```

## Step 2 — Set up the environment file

```bash
cp packages/bridge/.env.example packages/bridge/.env
```

Edit `packages/bridge/.env` and fill in the required values:

```bash
nano packages/bridge/.env
```

### Required environment variables

```ini
# Bridge mode — "hosted" requires user signup/login
KEB_MODE=hosted

# JWT secret — generate a stable one and keep it across restarts
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=<64-char-hex-string>

# LLM provider — pick one. Example: Anthropic
LLM_PROVIDER=anthropic
LLM_BASE_URL=https://api.anthropic.com/v1
LLM_API=anthropic-messages
LLM_MODEL=claude-sonnet-4-20250514
LLM_API_KEY=sk-ant-...
```

### Optional environment variables

| Variable         | Default           | Purpose                                                           |
| ---------------- | ----------------- | ----------------------------------------------------------------- |
| `PORT`           | `9876`            | WebSocket/HTTP listen port                                        |
| `HOST`           | `0.0.0.0`         | Listen address (use `127.0.0.1` for host-network mode)            |
| `LLM_MODEL_NAME` | `LLM_MODEL` value | Human-readable model name                                         |
| `LLM_REASONING`  | `false`           | Set `"true"` for reasoning-capable models                         |
| `LLM_THINKING`   | `off`             | Thinking level: `"off"`, `"low"`, `"medium"`, `"high"`, `"xhigh"` |

### Generating the JWT secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

This must remain stable across restarts. If the JWT secret changes, all user sessions are invalidated and everyone must log in again.

## Step 3 — Build the Docker image

Run from the **repo root** (`keb/` directory). The Dockerfile references files across packages and needs the full monorepo context:

```bash
docker build -f packages/bridge/Dockerfile -t keb-bridge .
```

This is a multi-stage build:

1. **`pi-layer`** — Installs the `pi` CLI + pi-keb extension globally
2. **`deps-layer`** — Installs bridge npm dependencies (including TypeScript)
3. **`pi-keb-build`** — Compiles pi-keb TypeScript source to standalone JS
4. **Final** — Minimal `node:22-slim` image with production deps only

First build takes 2–5 minutes. Subsequent builds leverage Docker layer caching.

## Step 4 — Create the data directory

```bash
mkdir -p packages/bridge/data/keb
```

This directory is bind-mounted into the container at `/root/.pi/agent/keb`. It persists:

- Keb documents (summaries, concepts, index)
- `users.db` — SQLite database of registered user accounts

## Step 5 — Verify the Caddyfile

The reverse-proxy config is at `packages/bridge/Caddyfile`. The default config works for `api.mdevd.co`. If you use a different domain, update both the domain and email:

```caddy
{
    email admin@mdevd.co
}

api.mdevd.co {
    handle_path /keb/v1/* {
        reverse_proxy bridge:9876 {
            transport http {
                read_timeout 120s
            }
        }
    }
}
```

Key behaviors:

- **Auto TLS** — Caddy obtains Let's Encrypt certificates automatically
- **Path stripping** — `/keb/v1/api/signup` → `/api/signup` to the bridge
- **120s timeout** — LLM compilation can take 30–90 seconds
- **WebSocket upgrade** — Handled automatically by Caddy

## Step 6 — Start with Docker Compose

```bash
docker compose -f packages/bridge/docker-compose.yml up -d
```

This starts two containers:

| Container    | Image               | Role                                              |
| ------------ | ------------------- | ------------------------------------------------- |
| `keb-bridge` | `keb-bridge:latest` | WebSocket + HTTP server on port 9876              |
| `keb-caddy`  | `caddy:2-alpine`    | Reverse proxy, TLS termination, WebSocket upgrade |

Verify both are running:

```bash
docker compose -f packages/bridge/docker-compose.yml ps
```

Expected:

```
NAME                STATUS
keb-bridge    Up (healthy)
keb-caddy     Up
```

Check logs:

```bash
docker logs keb-bridge
# Should show: [entrypoint] Starting bridge server...
# Should show: Bridge server listening on 0.0.0.0:9876

docker logs keb-caddy
# Should show TLS certificate being obtained
```

## Step 7 — Test the deployment

### Health check endpoint

```bash
curl https://api.mdevd.co/keb/v1/api/healthcheck
```

Response:

```json
{ "status": "ok", "mode": "hosted" }
```

Works in both local and hosted modes with no auth required. Useful for monitoring, load balancer probes, and verifying the bridge is up after deploy.

### Status endpoint (admin only)

```bash
curl -H "X-API-Key: your-admin-key" https://api.mdevd.co/keb/v1/api/status
```

Returns live runtime metrics: connected clients, active pi operations by type, and per-workspace document counts with last activity timestamps. Requires `ADMIN_KEY` env var to be set. Returns 501 if not configured.

### HTTP — Signup endpoint

```bash
curl -X POST https://api.mdevd.co/keb/v1/api/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"test-user","password":"mypassword123"}'
```

Expected response:

```json
{ "token": "eyJhbGciOi...", "username": "test-user" }
```

### HTTP — Login endpoint

```bash
curl -X POST https://api.mdevd.co/keb/v1/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test-user","password":"mypassword123"}'
```

### WebSocket (requires `wscat`)

```bash
npm install -g wscat

wscat -c wss://api.mdevd.co/keb/v1/
# Connected (press CTRL+C to quit)

# Send auth message:
# > {"type":"auth","token":"<jwt-from-signup>"}
# Expected: < {"type":"auth_ok","username":"test-user"}
```

### Extension

The Keb Chrome extension in hosted mode connects to `wss://api.mdevd.co/keb/v1` (build-time constant in `packages/extension/lib/env.ts`). If deploying to a different domain, rebuild the extension with:

```bash
VITE_HOSTED_BRIDGE_URL=wss://your-domain.com/keb/v1 pnpm build
```

## Step 8 — Verify data persistence

```bash
ls -la packages/bridge/data/keb/
# Should show: users.db, <username>/ directories with Keb files
```

## Day-to-day operations

### Restart after config changes

```bash
docker compose -f packages/bridge/docker-compose.yml up -d --force-recreate
```

### View logs

```bash
docker compose -f packages/bridge/docker-compose.yml logs -f
```

### Stop everything

```bash
docker compose -f packages/bridge/docker-compose.yml down
```

### Automated R2 backup

The backup sidecar container (`keb-backup`) archives the Keb data directory daily at midnight Bangkok time (00:00 UTC+7) and uploads it to Cloudflare R2. See [Daily R2 Backups](#daily-r2-backups) for setup.

### Manual restore from backup

```bash
docker compose -f packages/bridge/docker-compose.yml down
rm -rf packages/bridge/data/keb
# Download the latest backup from R2 (see rclone instructions below)
docker compose -f packages/bridge/docker-compose.yml up -d
```

---

## Daily R2 Backups

The project includes a dedicated backup sidecar container that runs daily. It uses `rclone` to upload tar.gz archives to Cloudflare R2 and prunes backups older than a configurable retention period.

### Architecture

```
                    ┌──────────────────┐
                    │  keb-backup │
                    │  (Alpine + rclone │
                    │   + dcron)        │
                    │                   │
                    │  00:00 UTC+7      │
                    │  crond runs backup│
                    │  script           │
                    └──────┬────────────┘
                           │
                    reads  │  tar.gz
                    ┌──────▼────────────┐     ┌────────────────┐
                    │ ./data/keb/        │────▶│ Cloudflare R2  │
                    │ (bind mount, ro)  │     │ keb-backups/   │
                    └───────────────────┘     └────────────────┘
```

### Step 1 — Set up an R2 bucket

1. Go to https://dash.cloudflare.com — select your account
2. Navigate to **R2** > **Create bucket**
3. Name it (e.g., `keb-backups`) and choose a location
4. Go to **R2** > **Manage R2 API Tokens** > **Create API Token**
5. Select **Object Read & Write** permission, apply it to the bucket you created
6. Copy the **Access Key ID** and **Secret Access Key** — shown only once
7. Note your **Account ID** from the R2 dashboard URL

### Step 2 — Configure environment variables

Add to `packages/bridge/.env`:

```ini
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET=keb-backups
R2_BACKUP_RETENTION_DAYS=30
```

All fields are required except `R2_BACKUP_RETENTION_DAYS` (defaults to 30).

### Step 3 — Build the backup image

```bash
# Build all images (bridge + backup)
docker compose -f packages/bridge/docker-compose.yml build

# Or build just the backup image
docker compose -f packages/bridge/docker-compose.yml build backup
```

### Step 4 — Start the backup sidecar

```bash
docker compose -f packages/bridge/docker-compose.yml up -d
```

Three containers now run:

| Container    | Image            | Role                                  |
| ------------ | ---------------- | ------------------------------------- |
| `keb-bridge` | `keb-bridge`     | WebSocket + HTTP server               |
| `keb-caddy`  | `caddy:2-alpine` | Reverse proxy, TLS, WebSocket upgrade |
| `keb-backup` | `keb-backup`     | Daily R2 backup at 00:00 UTC+7        |

### Verify the backup container

```bash
# Check status
docker compose -f packages/bridge/docker-compose.yml ps

# Run a manual backup to verify everything works:
 docker exec keb-backup /usr/local/bin/backup-to-r2.sh

# Check backup logs
docker compose -f packages/bridge/docker-compose.yml logs backup
```

Expected output from a manual run:

```
[backup] Creating archive: /tmp/keb-backup-20250613T170000Z.tar.gz
[backup] Uploading to R2: s3://keb-backups/keb-backups/20250613T170000Z.tar.gz
[backup] Pruning backups older than 30 days
[backup] Done — keb-backups/20250613T170000Z.tar.gz
```

### Restore from an R2 backup

```bash
# 1. Stop the bridge
docker compose -f packages/bridge/docker-compose.yml down

# 2. Download the latest backup (run from repo root)
#    Uses rclone with the same inline config pattern as the backup script
#
#    Replace placeholders with your R2 credentials:
#
RCLONE_REMOTE=":s3,provider=Cloudflare,access_key_id=ACCESS_KEY,secret_access_key=SECRET_KEY,region=auto,endpoint=https://ACCOUNT_ID.r2.cloudflarestorage.com:BUCKET"
#    List available backups:
 rclone ls "${RCLONE_REMOTE}/keb-backups/"
#    Download a specific backup:
 rclone copy "${RCLONE_REMOTE}/keb-backups/20250613T170000Z.tar.gz" /tmp/

# 3. Extract into data directory
rm -rf packages/bridge/data/keb
mkdir -p packages/bridge/data/keb
tar -xzf /tmp/20250613T170000Z.tar.gz -C packages/bridge/data/keb/

# 4. Restart
docker compose -f packages/bridge/docker-compose.yml up -d
```

### How it works

- **Script**: `packages/bridge/scripts/backup-to-r2.sh` — creates a tar.gz archive, uploads via `rclone`, prunes old backups, cleans up
- **Image**: `packages/bridge/backup.Dockerfile` — Alpine 3.21 with `rclone` and `dcron` (the cron daemon for Alpine)
- **Scheduling**: dcron runs the script daily at `0 0 * * *` (midnight) with `TZ=Asia/Bangkok` for UTC+7
- **Data access**: the sidecar mounts `./data/keb:/data:ro` — read-only access
- **rclone config**: passed inline via `:s3,key=value...` syntax — no config file needed
- **Credentials**: sourced from the `.env` file via `docker-compose.yml` environment variables

---

## Upgrading the Bridge

Upgrading replaces the bridge container with a freshly built image while keeping user data intact (`data/keb/` is bind-mounted, not stored in the container).

### When to upgrade

| Trigger                          | What changed                                              |
| -------------------------------- | --------------------------------------------------------- |
| Bridge code updated (`git pull`) | New bridge features, bug fixes, handlers, adapters        |
| pi-keb submodule updated         | Keb extension improvements, new compile prompts, bug fixes |
| `.env` config changed            | New env vars, LLM provider/model switch, mode change      |
| Base image security patches      | OS-level or Node.js runtime updates                       |

For **config-only changes** (`.env` edits, no code changes), skip the build step — just recreate the container:

```bash
docker compose -f packages/bridge/docker-compose.yml up -d --force-recreate
```

### Full upgrade (code + pi-keb changes)

```bash
# 1. Pull latest code
cd /path/to/keb
git pull origin main
git submodule update --init --recursive

# 2. Rebuild the Docker image
docker build -f packages/bridge/Dockerfile -t keb-bridge .

# 3. Recreate the container with the new image
docker compose -f packages/bridge/docker-compose.yml up -d --force-recreate

# 4. Remove old dangling images to free disk space
docker image prune -f
```

### What happens during upgrade

1. Docker Compose stops and removes the old bridge container
2. Active WebSocket connections are dropped — clients will reconnect automatically
3. In-flight pi child processes are terminated
4. A new container starts with the rebuilt image
5. The health check (`/api/healthcheck`) must pass before Docker marks it healthy
6. Extension clients detect the disconnect and reconnect with exponential backoff (2s, 4s, 8s)

The Caddy container is unaffected — it keeps serving and will proxy to the new bridge as soon as it's up.

### Verify the upgrade

```bash
# Check container status
$ docker compose -f packages/bridge/docker-compose.yml ps
NAME                STATUS
keb-bridge    Up (healthy)
keb-caddy     Up

# Confirm the health check responds
$ curl -s https://api.mdevd.co/keb/v1/api/healthcheck | jq
{
  "status": "ok",
  "mode": "hosted"
}

# Check logs for startup confirmation
$ docker logs keb-bridge --tail 20
```

### Upgrade checklist

- [ ] `git pull` succeeded (no merge conflicts)
- [ ] Submodule updated: `git submodule status` shows the expected commit
- [ ] Docker build completed without errors
- [ ] `docker compose ps` shows `Up (healthy)` for the bridge
- [ ] `curl .../api/healthcheck` returns `{"status":"ok"}`
- [ ] `docker logs keb-bridge` shows `Bridge listening on 0.0.0.0:9876`
- [ ] Test a signup/login flow (hosted mode) or a WebSocket connection (local mode)

### Rollback

If the upgrade breaks something, revert to the previous commit and rebuild:

```bash
# Revert to the last known-good commit
git checkout <previous-commit-hash>
git submodule update --init --recursive

# Rebuild and deploy
docker build -f packages/bridge/Dockerfile -t keb-bridge .
docker compose -f packages/bridge/docker-compose.yml up -d --force-recreate

# Verify
curl https://api.mdevd.co/keb/v1/api/healthcheck
```

User data in `data/keb/` is unaffected by rollbacks — it lives outside the container.

## Architecture

```
Internet
   │
   ▼
Ubuntu Instance
   │
   ├── Caddy (port 80/443)
   │     ├── TLS termination (Let's Encrypt)
   │     ├── Path stripping: /keb/v1/* → /*
   │     └── WebSocket upgrade (automatic)
   │
   └── Bridge (port 9876, internal Docker network only)
         ├── HTTP: POST /api/signup, /api/login, GET /api/me
         ├── WebSocket: add, query, repair, sync
         └── Spawns `pi` child processes for LLM work
              └── Reads/writes Keb files in /root/.pi/agent/keb
```

The bridge is never exposed to the internet directly — Caddy is the only public-facing service. The bridge only listens on the internal Docker network (`bridge:9876`).

## Troubleshooting

### Port already in use on the host

```bash
sudo lsof -i :80 -i :443
```

Something else (nginx, Apache, another Caddy) is bound to ports 80/443. Stop it first.

### Caddy can't obtain TLS certificate

Check that:

1. Ports 80 and 443 are open in the firewall (AWS security group / Lightsail networking)
2. DNS A record `api.mdevd.co` points to the instance's public IP
3. No other service is bound to port 80

```bash
# Check DNS resolution
dig api.mdevd.co

# Check Caddy logs for certificate errors
docker logs keb-caddy
```

### Bridge healthcheck failing

```bash
docker logs keb-bridge
```

Common causes:

- Missing or invalid `LLM_API_KEY` — the bridge starts but pi child processes may fail
- `users.db` permission issues — ensure `packages/bridge/data/keb/` is writable
- pi-keb standalone adapter not compiled — did you build the Docker image with the full context (repo root)?

### Build fails with "Cannot find module '.../filesystem-store.js'"

The pi-keb standalone adapter isn't being compiled. Make sure:

1. The git submodule is initialized: `git submodule update --init --recursive`
2. You're building from the repo root: `docker build -f packages/bridge/Dockerfile -t keb-bridge .`
3. The `pi-keb-build` stage completed without errors

## Horizontal scaling

Multiple bridge instances behind a load balancer are **not safe** with the default adapters:

- SQLite (`UserStore`) uses file-level locking
- `FilesystemStore` (`KebStore`) races on registry entries from concurrent pi child processes

To scale horizontally, swap adapters to distributed backends:

- `UserStore` → PostgreSQL (shared user database)
- `KebStore` → S3, PostgreSQL, or NFS with proper locking

See `AGENTS.md` for the Ports & Adapters pattern documentation.
