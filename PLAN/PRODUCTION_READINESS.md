# Production Readiness Plan — Keb

**Status:** Draft  
**Goal:** Get the Keb Chrome extension + hosted bridge from working MVP to production launch.  
**Approach:** Three phases. Phase 1 = launch blockers. Phase 2 = production hardening. Phase 3 = scale & monetization.

---

## Context

The repo currently has a functional bridge (`packages/bridge`) and extension (`packages/extension`). Builds, lint, typecheck, and formatting all pass. The deployment story (Docker, Caddy, R2 backup) is documented and mostly implemented. However, before a public launch we need to close gaps in security, reliability, operational robustness, and Chrome Web Store compliance.

This plan assumes we keep the existing ports-and-adapters architecture and do not rewrite core flows.

---

## Phase 1 — Launch Blockers

*Target: complete before public beta / Chrome Web Store submission.*

| # | Task | Why it blocks launch | Suggested implementation | Acceptance criteria |
|---|------|---------------------|--------------------------|---------------------|
| 1.1 | **Bundle extension logo** | Chrome Web Store requires extension resources to be bundled, not loaded remotely. Currently `AuthPanel.tsx` and `Header.tsx` load `https://r2.mdevd.co/asset/logo_transparent.png`. | Add `logo.png` to `packages/extension/public/`, reference it with a relative path, and remove the remote URL. | No remote image requests in extension UI; logo works offline. |
| 1.2 | **Rate-limit auth endpoints** | `/api/signup` and `/api/login` have no rate limiting and are brute-forceable. | Add per-IP rate limiting in `lib/http-routes.js` or a small middleware (e.g. 5 attempts per 15 min window). Use an in-memory store or SQLite. | 10 failed logins from one IP within 1 min returns HTTP 429. |
| 1.3 | **Add request/message size limits** | A huge `add-content` HTML payload or JSON body can OOM the bridge. | Limit HTTP request body to ~1 MB and WebSocket message size to ~5 MB in `bridge-server.js`. Reject oversized `add-content` before HTML→Markdown conversion. | 2 MB JSON body returns 413; 10 MB WS message closes connection cleanly. |
| 1.4 | **Add pi child process timeout** | A hung LLM call can run forever. | In `pi-rpc-spawner.js`, set a hard timeout (e.g. 5 min) and kill the child if `agent_end` is not received. Surface error to client. | A stalled operation is killed and client receives `{type:"error"}` within timeout + 10 s. |
| 1.5 | **Fix pi crash / non-zero exit handling** | If pi exits without `agent_end`, the client operation hangs. | In `pi-rpc-spawner.js`, on `exit` with non-zero code and not already settled, call `callbacks.onError()` with the exit code. | A crashing pi process sends an error frame to the extension and cleans up. |
| 1.6 | **Add WebSocket ping/pong** | Proxies/firewalls may silently drop idle connections. | Enable `ws` ping/pong in `bridge-server.js` (e.g. 30 s interval). | Server pings clients every 30 s; unresponsive clients are terminated. |
| 1.7 | **Align pi-keb versions in Docker** | The runtime pi extension is installed from `main`, but the bridge compiles the git submodule. They can drift and break file-format compatibility. | Install pi-keb in Docker from the committed submodule (`COPY packages/pi-keb …`) instead of `pi install git:github.com/auto-medica-labs/pi-keb`. | Runtime pi-keb and compiled `FilesystemStore` come from the same commit. |
| 1.8 | **Make Docker builds reproducible** | Dockerfile uses `npm install` and installs `pi@latest`, ignoring pnpm lockfiles. | Pin `PI_VERSION`, copy `pnpm-lock.yaml`, use `pnpm install --frozen-lockfile`, and build in a single package-manager context. | Two builds one week apart produce the same installed dependency tree. |
| 1.9 | **Add Terms of Service page** | CWS and hosted SaaS require clear terms. | Add `packages/landing/tos.html`, build it, host it at `https://keb.mdevd.co/tos`, and link from the landing page. | `/tos` is live and linked from landing + extension if applicable. |
| 1.10 | **Audit privacy policy accuracy** | The policy names Poolside.ai as the hosted LLM provider. If that has changed, the policy is false. | Verify current hosted provider/model and update `packages/landing/privacy.html`. Rebuild and deploy. | Privacy policy accurately describes the LLM provider and data flow. |

---

## Phase 2 — Production Hardening

*Target: complete within 2–4 weeks of launch.*

| # | Task | Rationale | Suggested approach |
|---|------|-----------|-------------------|
| 2.1 | Switch `bcryptjs` to native `bcrypt` | Better performance at scale. Single-line dependency swap; API is compatible. | Replace `bcryptjs` with `bcrypt` in `packages/bridge/package.json` and `src/lib/auth.js`. Update types. |
| 2.2 | Improve JWT strategy | 30-day tokens with no revocation are risky. | Issue short access tokens (e.g. 15 min) + refresh tokens, or maintain a token blocklist on password change. |
| 2.3 | Structured logging & rotation | Current logs are stdout-only with no request correlation. | Add request ID, user, operation, and severity; route to stderr/stdout with JSON optionally; configure Docker log rotation. |
| 2.4 | Operation state on reconnect | If the extension reconnects, in-flight operations are lost visually. | Track active operation IDs server-side per connection and replay `done`/`error` on reconnect, or at least clear stale client state. |
| 2.5 | Storage quota handling | Captured HTML can exceed `chrome.storage.local` quota. | Check size before `chrome.storage.local.set`; compress or show an error if > 4 MB. |
| 2.6 | Automated tests | No bridge/extension tests exist. | Add happy-path and error-path tests for `auth-handler`, `add-url-handler`, `add-content-handler`, and `WSClient` reconnection. |
| 2.7 | Backup failure alerting | R2 sidecar can fail silently. | Add a webhook/HTTP call in `backup-to-r2.sh` on failure, or expose backup status via `/api/status`. |

---

## Phase 3 — Scale & Monetization

*Target: after product-market fit / when usage grows.*

| # | Task | Rationale |
|---|------|-----------|
| 3.1 | Payment integration + plan limits | The 50-doc free tier is hardcoded with no billing. | Add Stripe (or equivalent) and per-user plan rows in `users` table. Enforce limits via `UserStore`. |
| 3.2 | PostgreSQL `UserStore` adapter | SQLite does not scale horizontally. | Implement `adapters/user-store-postgres.js` and swap in `bridge-server.js`. |
| 3.3 | Distributed `KebStore` adapter | Filesystem store races across instances. | Implement S3 or Postgres-backed `KebStore` with proper locking. |
| 3.4 | Admin dashboard | `/api/status` JSON is not enough for ops. | Build a simple web dashboard listing users, workspaces, doc counts, and active operations. |
| 3.5 | Password recovery | No email means no reset; forgotten passwords = data loss. | Generate recovery codes at signup, or add optional email field for resets. |
| 3.6 | GDPR export / account deletion | Required for EU users. | Add `DELETE /api/me` and `GET /api/me/export` endpoints; wipe workspace + DB row. |

---

## Open questions

1. **Hosted LLM provider:** Is the production hosted bridge still using Poolside.ai? This affects the privacy policy and Docker default env vars.
2. **Launch scope:** Do we ship local-only first, or is hosted multi-user required at launch?
3. **Billing:** Is Stripe the preferred payment provider?
4. **Domain:** Is `keb.mdevd.co` the final public domain for landing + help pages?

---

## Notes

- Keep all changes minimal and aligned with the existing ports-and-adapters pattern.
- Do not add new dependencies unless stdlib or already-installed packages cannot do the job.
- Every Phase 1 change should include a manual test step before CWS submission.
