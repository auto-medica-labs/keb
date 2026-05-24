# SaaS Deployment Plan — chrome-kb Bridge

> Per-user isolated VMs running the bridge + pi agent, managed by a control plane.

---

## Target Architecture

```
Chrome Extension ──wss──► Control Plane ──► User's VM (bridge + pi + KB)
                              │
                              ├── Auth (API keys / OAuth)
                              ├── User → VM mapping (SQLite / Postgres)
                              └── VM lifecycle manager
```

Each user gets their own lightweight VM with:
- The bridge server (`bridge-server.js`) listening internally on `127.0.0.1:9876`
- `pi` CLI + `pi-kb` extension installed
- Persistent volume at `~/.pi/agent/kb/` for KB storage
- Auto-stop when idle, fast wake on reconnect

---

## Platform Evaluation

| Platform | Boot time | Persistent storage | WebSocket support | Management overhead | Best for |
|---|---|---|---|---|---|
| **[Fly Machines](https://fly.io/docs/machines/)** | ~300ms | Yes (volumes) | Yes | Low | **Recommended** |
| [Railway](https://railway.app/) | ~5–15s | Yes (volumes) | Yes | Low | Simpler DX, slower cold starts |
| [AWS ECS Fargate + EFS](https://aws.amazon.com/fargate/) | ~30–60s | Yes (EFS) | Yes (ALB) | High | Enterprise scale |
| Bare VPS (Hetzner/DigitalOcean) | ~30s | Local disk | Yes (nginx proxy) | High | Full control, fixed per-node cost |
| Cloudflare Durable Objects + R2 | N/A | R2 buckets | Native DO WS | Medium | Serverless, but pi needs VMs |

**Recommendation: Fly Machines.** Fastest cold-start, pay-per-use, persistent volumes that survive stop/start cycles, and first-class WebSocket support.

---

## Implementation Plan

### Phase 1 — Containerize the Bridge ✅ DONE

Multi-stage Dockerfile at `packages/bridge/Dockerfile`. Build from repo root:

```bash
docker build -f packages/bridge/Dockerfile -t chrome-kb-bridge .
```

**Key design decisions:**

- **Multi-stage build** — pi CLI + pi-kb installed in a `pi-layer` stage, npm deps in `deps-layer`, minimal final image copies only what's needed.
- **`--ignore-scripts`** — pi docs recommend this for `npm install -g` to disable dependency lifecycle scripts.
- **`pi install git:github.com/dheerapat/pi-kb`** — installs the pi-kb extension (not `pi extensions install` — that command doesn't exist).
- **pi CLI symlink fix** — `npm install -g` creates `/usr/local/bin/pi` as a symlink into node_modules. Docker's `COPY` follows symlinks and copies the resolved file, which breaks relative imports (`./config.js`). Fixed by creating the symlink manually with `RUN ln -sf` in the final stage.
- **Entrypoint script** — `entrypoint.sh` runs before the bridge server and generates `~/.pi/agent/auth.json` from standard pi env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.) and `~/.pi/agent/settings.json` from `PI_DEFAULT_PROVIDER` / `PI_DEFAULT_MODEL` / `PI_DEFAULT_THINKING` env vars. Preserves existing keys (like `packages` from pi-kb install). See [pi docs/providers.md](https://github.com/earendil-works/pi-mono/blob/main/docs/providers.md) for full env var list.
- **Healthcheck** — WebSocket-based probe so Fly's `waitForHealth` works.

**LLM provider configuration** (environment variables):

| Variable | Purpose | Example |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key | `sk-ant-...` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |
| `GEMINI_API_KEY` | Google Gemini API key | `...` |
| `PI_DEFAULT_PROVIDER` | Default model provider | `anthropic` |
| `PI_DEFAULT_MODEL` | Default model ID | `claude-sonnet-4-20250514` |
| `PI_DEFAULT_THINKING` | Default thinking level | `high` |

Supports all 19 provider env vars from pi's providers.md. Mount `~/.pi/agent/auth.json` or `settings.json` as volumes for advanced config.

### Phase 2 — Build the Control Plane

A thin Node.js service that orchestrates VM lifecycle and proxies WebSocket connections.

**Directory structure:**
```
control-plane/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts             # Entry point (HTTP + WS server)
│   ├── auth.ts              # API key validation / OAuth
│   ├── db.ts                # User → VM mapping store
│   ├── vm-manager.ts        # Fly Machines API wrapper
│   └── ws-proxy.ts          # WebSocket connection router
└── fly.toml
```

**Key responsibilities:**

#### 2a. Auth (`auth.ts`)
```typescript
// Extension sends token as WebSocket query param: wss://api.chrome-kb.com/ws?token=xxx
// auth.ts validates the token against the DB, returns userId

interface AuthResult {
  userId: string;
}

async function authenticate(ws: WebSocket, token: string): Promise<AuthResult | null> {
  const user = await db.findUserByToken(token);
  if (!user) {
    ws.close(4001, "Unauthorized");
    return null;
  }
  return { userId: user.id };
}
```

Users authenticate once via the extension (API key input or OAuth popup). Token is persisted in `chrome.storage.local`.

#### 2b. VM Lifecycle (`vm-manager.ts`)
```typescript
import { Machines } from "@flydotio/machines";

interface VmRef {
  machineId: string;
  privateIp: string;
  state: "created" | "started" | "stopped" | "destroyed";
}

const APP_NAME = "chrome-kb-vms";
const IMAGE = "registry.fly.io/chrome-kb-bridge:latest";
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

async function getOrCreateMachine(userId: string): Promise<VmRef> {
  // 1. Check if machine already exists for this user
  const existing = await db.findMachine(userId);
  
  if (existing) {
    if (existing.state === "stopped") {
      await fly.machines.start(APP_NAME, existing.machineId);
      await waitForHealth(existing.machineId, 9876);
      await db.updateMachineState(userId, "started");
    }
    return existing;
  }

  // 2. Create persistent volume for KB storage
  const volume = await fly.volumes.create(APP_NAME, {
    name: `kb-data-${userId}`,
    sizeGb: 10,
    region: process.env.FLY_REGION || "iad",
  });

  // 3. Create the machine
  const machine = await fly.machines.create(APP_NAME, {
    image: IMAGE,
    services: [
      {
        internal_port: 9876,
        protocol: "tcp",
      },
    ],
    mounts: [
      {
        volume: volume.id,
        path: "/root/.pi/agent/kb",
      },
    ],
    env: {
      USER_ID: userId,
      PORT: "9876",
      // LLM credentials — required for pi add/query operations.
      // The entrypoint writes these into ~/.pi/agent/auth.json and
      // merges PI_DEFAULT_* into ~/.pi/agent/settings.json at startup.
      ANTHROPIC_API_KEY: user.anthropicKey,
      PI_DEFAULT_PROVIDER: user.defaultProvider || "anthropic",
      PI_DEFAULT_MODEL: user.defaultModel || "claude-sonnet-4-20250514",
    },
    auto_destroy: false,
  });

  // 4. Persist mapping
  const vmRef: VmRef = {
    machineId: machine.id,
    privateIp: machine.ips.private,
    state: "started",
  };
  await db.insertMachine(userId, vmRef);

  return vmRef;
}

async function stopIfIdle(userId: string): Promise<void> {
  // Called after WebSocket disconnection
  setTimeout(async () => {
    const stillConnected = wsConnectionTracker.has(userId);
    if (stillConnected) return;
    
    const m = await db.findMachine(userId);
    if (m && m.state === "started") {
      await fly.machines.stop(APP_NAME, m.machineId);
      await db.updateMachineState(userId, "stopped");
    }
  }, IDLE_TIMEOUT_MS);
}
```

#### 2c. WebSocket Proxy (`ws-proxy.ts`)
```typescript
import { WebSocketServer, WebSocket } from "ws";
import { createConnection } from "net";

function proxyConnection(clientWs: WebSocket, targetIp: string, targetPort: number): void {
  // Open TCP connection to the user's VM
  const backend = createConnection({ host: targetIp, port: targetPort });

  // Bidirectional relay
  clientWs.on("message", (data) => {
    if (backend.readyState === "open") backend.write(data);
  });

  backend.on("data", (data) => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
  });

  clientWs.on("close", () => backend.end());
  backend.on("close", () => clientWs.close());
}
```

#### 2d. Database (`db.ts`)
Minimal schema:

```sql
-- Users
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  api_key     TEXT UNIQUE NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Machines (user → VM mapping)
CREATE TABLE machines (
  user_id     TEXT PRIMARY KEY REFERENCES users(id),
  machine_id  TEXT NOT NULL,
  private_ip  TEXT NOT NULL,
  state       TEXT NOT NULL DEFAULT 'started',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Phase 3 — Modify the Chrome Extension

#### 3a. Remote WebSocket endpoint (`ws.ts`)

```typescript
// Before (local only)
const WS_URL = "ws://127.0.0.1:9876";

// After (SaaS)
const WS_URL = "wss://api.chrome-kb.com/ws";

connect() {
  const token = await getApiKey();
  this.ws = new WebSocket(`${WS_URL}?token=${token}`);
  // ... rest unchanged
}
```

#### 3b. Add login UI

A simple API-key input dialog that renders before the main app if no key is stored. Persist to `chrome.storage.local` under `kb:apiKey`.

#### 3c. Manifest permissions

Add the remote domain to `manifest.json`:
```json
{
  "host_permissions": ["https://api.chrome-kb.com/*"]
}
```

---

## Cost Model (Fly Machines)

| Resource | Unit cost | Monthly (always-on) | Monthly (2h active/day) |
|---|---|---|---|
| shared-cpu-1x 256MB VM | ~$0.0000024/s | ~$6.22 | ~$0.52 |
| 10GB persistent volume | $1.50/mo | $1.50 | $1.50 |
| Control plane (1 VM) | ~$6/mo shared | $6.00 | $6.00 |
| **Per user total** | | **~$7.72** | **~$2.02** |

At $10–20/mo per user, healthy margins even with aggressive auto-stop. The control plane is a single shared instance and its cost is amortized across all users.

**Scaling note:** With 1,000 users at 2h/day each, you'd need ~85 concurrent VMs (1000 × 2h / 24h). Fly handles this transparently.

---

## Operational Concerns

| Concern | Solution |
|---|---|
| Cold start latency | Fly Machines boot in ~300ms; pre-create VMs for premium users |
| Data backup | Fly volume snapshots (daily); optional S3 backup from the VM |
| Multi-region | Deploy VMs in the region closest to each user (Fly auto-routes) |
| pi binary updates | Rebuild Docker image, rolling update via Fly Machines API |
| Rate limiting | Per-user token bucket on the control plane (e.g., 10 adds/min) |
| Monitoring | Fly Metrics + structured logs (JSON) shipped to your observability stack |
| Billing | Stripe integration in control plane; usage tracking per user |

---

## Alternative: Single Shared Bridge (No VMs)

If per-user isolation is not immediately necessary, a simpler v0:

```
Extension ──wss──► Control Plane ──► Single bridge instance
                                        │
                                        └── per-user KB dirs (~/.pi/agent/kb/<userId>/)
```

- Single bridge with workspace-per-user (`/kb-add -w <userId> <url>`)
- Workspace names map to user IDs
- No VM orchestration needed

**Concurrency model:** Each WebSocket connection gets its own closure-scoped `activeChild`. Spawning pi for user A doesn't block user B — both run concurrently as separate `pi --mode rpc` processes. Within a single user's connection, a new `add`/`query` kills the previous one (one-at-a-time per connection).

**Real bottleneck — not file I/O, it's pi processes:** The sync path does lightweight filesystem reads (readdir + readFile, zero sustained file descriptors). Modern SSDs handle thousands of IOPS without contention. The limiting factor is concurrent pi processes — each one is ~150–300MB RAM for Node + LLM streaming. A shared VM with 30+ concurrent users would OOM before disk I/O matters. This is exactly why per-user VMs (Phase 2) are needed for scale.

**Document DB not needed:** Adding a database for .md file storage adds network round-trips to sync reads, an extra service to manage, and breaks pi-kb compatibility (it writes files natively). A lightweight embedded index (SQLite FTS5) built at startup from the filesystem is the right move if sync needs acceleration at scale.

This can serve as the MVP while per-user VMs are built.

---

## Recommended Build Order

1. **Dockerfile** — Containerize bridge + pi + pi-kb, test locally
2. **Minimal control plane** — Auth + WebSocket proxy (no VM orchestration — proxy to a single shared instance first)
3. **Extension changes** — Remote WebSocket URL + login form
4. **VM orchestration** — Fly Machines API integration for per-user isolation
5. **Billing & monitoring** — Stripe, usage tracking, dashboard
