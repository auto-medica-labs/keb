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

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `9876` | WebSocket/HTTP listen port |
| `HOST` | `0.0.0.0` | Listen address (use `127.0.0.1` for host-network mode) |
| `LLM_MODEL_NAME` | `LLM_MODEL` value | Human-readable model name |
| `LLM_REASONING` | `false` | Set `"true"` for reasoning-capable models |
| `LLM_THINKING` | `off` | Thinking level: `"off"`, `"low"`, `"medium"`, `"high"`, `"xhigh"` |

### Generating the JWT secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

This must remain stable across restarts. If the JWT secret changes, all user sessions are invalidated and everyone must log in again.

## Step 3 — Build the Docker image

Run from the **repo root** (`keb/` directory). The Dockerfile references files across packages and needs the full monorepo context:

```bash
docker build -f packages/bridge/Dockerfile -t chrome-kb-bridge .
```

This is a multi-stage build:
1. **`pi-layer`** — Installs the `pi` CLI + pi-kb extension globally
2. **`deps-layer`** — Installs bridge npm dependencies (including TypeScript)
3. **`pi-kb-build`** — Compiles pi-kb TypeScript source to standalone JS
4. **Final** — Minimal `node:22-slim` image with production deps only

First build takes 2–5 minutes. Subsequent builds leverage Docker layer caching.

## Step 4 — Create the data directory

```bash
mkdir -p packages/bridge/data/kb
```

This directory is bind-mounted into the container at `/root/.pi/agent/kb`. It persists:
- KB documents (summaries, concepts, index)
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

| Container | Image | Role |
|---|---|---|
| `chrome-kb-bridge` | `chrome-kb-bridge:latest` | WebSocket + HTTP server on port 9876 |
| `chrome-kb-caddy` | `caddy:2-alpine` | Reverse proxy, TLS termination, WebSocket upgrade |

Verify both are running:

```bash
docker compose -f packages/bridge/docker-compose.yml ps
```

Expected:

```
NAME                STATUS
chrome-kb-bridge    Up (healthy)
chrome-kb-caddy     Up
```

Check logs:

```bash
docker logs chrome-kb-bridge
# Should show: [entrypoint] Starting bridge server...
# Should show: Bridge server listening on 0.0.0.0:9876

docker logs chrome-kb-caddy
# Should show TLS certificate being obtained
```

## Step 7 — Test the deployment

### Health check endpoint

```bash
curl https://api.mdevd.co/keb/v1/api/healthcheck
```

Response:

```json
{"status":"ok","mode":"hosted"}
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
{"token":"eyJhbGciOi...","username":"test-user"}
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
ls -la packages/bridge/data/kb/
# Should show: users.db, <username>/ directories with KB files
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

### Update to new code

```bash
cd keb
git pull origin main
git submodule update --init --recursive
docker build -f packages/bridge/Dockerfile -t chrome-kb-bridge .
docker compose -f packages/bridge/docker-compose.yml up -d --force-recreate
```

### Backup the data

```bash
tar -czf kb-backup-$(date +%Y%m%d).tar.gz packages/bridge/data/kb/
```

### Restore from backup

```bash
docker compose -f packages/bridge/docker-compose.yml down
rm -rf packages/bridge/data/kb
tar -xzf kb-backup-YYYYMMDD.tar.gz
docker compose -f packages/bridge/docker-compose.yml up -d
```

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
              └── Reads/writes KB files in /root/.pi/agent/kb
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
docker logs chrome-kb-caddy
```

### Bridge healthcheck failing

```bash
docker logs chrome-kb-bridge
```

Common causes:
- Missing or invalid `LLM_API_KEY` — the bridge starts but pi child processes may fail
- `users.db` permission issues — ensure `packages/bridge/data/kb/` is writable
- pi-kb standalone adapter not compiled — did you build the Docker image with the full context (repo root)?

### Build fails with "Cannot find module '.../filesystem-store.js'"

The pi-kb standalone adapter isn't being compiled. Make sure:
1. The git submodule is initialized: `git submodule update --init --recursive`
2. You're building from the repo root: `docker build -f packages/bridge/Dockerfile -t chrome-kb-bridge .`
3. The `pi-kb-build` stage completed without errors

## Horizontal scaling

Multiple bridge instances behind a load balancer are **not safe** with the default adapters:
- SQLite (`UserStore`) uses file-level locking
- `FilesystemStore` (`KbStore`) races on registry entries from concurrent pi child processes

To scale horizontally, swap adapters to distributed backends:
- `UserStore` → PostgreSQL (shared user database)
- `KbStore` → S3, PostgreSQL, or NFS with proper locking

See `AGENTS.md` for the Ports & Adapters pattern documentation.
