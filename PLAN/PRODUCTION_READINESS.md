# Production Readiness Plan — Keb

**Status:** Phase 1 in progress — 3 / 10 tasks done  
**Goal:** Get the Keb Chrome extension + hosted bridge from working MVP to production launch.  
**Approach:** Three phases. Phase 1 = launch blockers. Phase 2 = production hardening. Phase 3 = scale & monetization.

---

## Context

The repo currently has a functional bridge (`packages/bridge`) and extension (`packages/extension`). Builds, lint, typecheck, and formatting all pass. The deployment story (Docker, Caddy, R2 backup) is documented and mostly implemented. However, before a public launch we need to close gaps in security, reliability, operational robustness, and Chrome Web Store compliance.

This plan assumes we keep the existing ports-and-adapters architecture and do not rewrite core flows.

---

## Phase 1 — Launch Blockers

*Target: complete before public beta / Chrome Web Store submission.*

### Priority tiers

| Tier | Label | Count |
|------|-------|-------|
| 🔴 | Critical — functional bugs / security holes that break the product today | 0 🎉 |
| 🟠 | High — security / DoS / CWS submission blockers | 3 |
| 🟡 | Medium — deployment reliability | 2 |
| 🟢 | Low — legal / compliance / nice-to-have | 2 |

### 🔴 Critical (do first)

| # | Task | Why it blocks launch | Suggested implementation | Acceptance criteria |
|---|------|---------------------|--------------------------|---------------------|
| ~~1.5~~ | ~~**Fix pi crash / non-zero exit handling**~~ | ✅ Completed — `pi-rpc-spawner.js` exit handler now fires `onError` for non-zero exit codes. Catches the edge case of code 0 with no `agent_end`. | | |
| ~~1.4~~ | ~~**Add pi child process timeout**~~ | ✅ Completed — 5-minute hard timeout in `pi-rpc-spawner.js`. Kills hung child and surfaces `{type:"error"}`. Timeout cleared on any `settle()`. | | |
| ~~1.6~~ | ~~**Add WebSocket ping/pong**~~ | ✅ Completed — Heartbeat interval (30 s) in `bridge-server.js` with `_isAlive` tracking. Unresponsive clients terminated after 2 missed pings. | | |

### 🟠 High (do second)

| # | Task | Why it blocks launch | Suggested implementation | Acceptance criteria |
|---|------|---------------------|--------------------------|---------------------|
| 1.2 | **Rate-limit auth endpoints** | `/api/signup` and `/api/login` have zero rate limiting in `auth-handler.js`. Attackers can brute-force passwords, enumerate accounts (signup returns 409 vs 400), and spam account creation trivially. Needed before opening to the public. | Add per-IP rate limiting in `lib/http-routes.js` or a small middleware. Use an in-memory Map with sliding window or SQLite. Conservative: 5 attempts per 15 min window. Return HTTP 429 with `Retry-After` header on throttle. | 10 failed logins from one IP within 1 min returns HTTP 429; valid logins unaffected. |
| 1.3 | **Add request/message size limits** | No body size checks anywhere. A 50 MB `add-content` HTML payload or giant JSON body hits `readBody()` which buffers the entire thing in memory → OOM crash. Also no WebSocket message size limit. | Limit HTTP request body to ~1 MB (return 413) and WebSocket `maxPayload` to ~5 MB in `bridge-server.js`. Add an early size check in `add-content-handler.js` before the expensive HTML→Markdown conversion. | 2 MB JSON body returns 413; 10 MB WS message closes connection cleanly with error. |
| 1.1 | **Bundle extension logo** | Chrome Web Store requires all extension resources to be bundled, not loaded remotely. Currently `AuthPanel.tsx` and `Header.tsx` load `https://r2.mdevd.co/asset/logo_transparent.png`. Also breaks offline: no logo appears in local mode without internet. | Add `logo.png` to `packages/extension/public/` alongside existing icons, reference it with a relative path (`src="logo.png"`), and remove the remote URL from both components. | No remote image requests in extension UI; logo renders offline. |

### 🟡 Medium (do when deploying)

| # | Task | Why it blocks launch | Suggested implementation | Acceptance criteria |
|---|------|---------------------|--------------------------|---------------------|
| 1.7 | **Align pi-keb versions in Docker** | The Dockerfile runs `pi install git:github.com/auto-medica-labs/pi-keb` which installs from the `main` branch at build time. The bridge compiles the git submodule (a pinned commit). These can drift — new frontmatter fields or file-format changes in one but not the other → silent corruption. | Install pi-keb in Docker from the committed submodule via `COPY packages/pi-keb …` instead of fetching from GitHub at build time. | Runtime pi-keb and compiled `FilesystemStore` come from the same submodule commit. |
| 1.8 | **Make Docker builds reproducible** | `PI_VERSION=latest` (unpinned), `npm install` instead of `pnpm install --frozen-lockfile`, no lockfile copied into the Docker build context. Two builds a week apart can produce different dependency trees, making bugs hard to reproduce. | Pin `PI_VERSION` to a specific semver, copy `pnpm-lock.yaml` from the repo root, use `pnpm install --frozen-lockfile`, and build in a single package-manager context (pnpm, not npm). | Two builds one week apart produce identical dependency trees (modulo OS patches). |

### 🟢 Low (do before CWS submission)

| # | Task | Why it blocks launch | Suggested implementation | Acceptance criteria |
|---|------|---------------------|--------------------------|---------------------|
| 1.10 | **Audit privacy policy accuracy** | The published policy (`packages/landing/privacy.html`) names **Poolside.ai** as the hosted LLM provider. If the provider has changed (the plan itself asks this question in Open questions), the published policy is legally false and must be corrected before launch. | Verify the actual hosted provider and model. Update `privacy.html` if needed. Add `privacy.html` to the landing build pipeline (it already is — confirmed in `build.mjs`). Rebuild and deploy. | Privacy policy accurately describes the LLM provider, data flow, and any third-party processing. |
| 1.9 | **Add Terms of Service page** | Chrome Web Store requires a link to Terms of Service. No `tos.html` exists. The landing's `_nav.html` has no ToS link, and `_footer.html` only links to the Privacy Policy. | Create `packages/landing/tos.html` (standard terms template adapted for Keb). Add it to `build.mjs` page list. Link from `_nav.html` and `_footer.html`. Host at `https://keb.mdevd.co/tos`. | `/tos` is live, linked from the landing page footer and nav, and covers the hosted service. | 

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
