# Client architecture

Keb has two end-user clients: a Chrome extension side panel and a standalone web app. They share UI components and the WebSocket client logic through the `@keb/shared` workspace package.

## Shared package

[`packages/shared`](../../packages/shared) exports:

- Components: `QueryPanel`, `OperationTimeline`, `MarkdownRenderer`, `Footer`.
- Libraries: `api` (HTTP auth client), `env` (`HOSTED_BRIDGE_URL` build-time constant), and styles.

It was extracted from the web app in commit `605d861` so both clients could reuse the same consult/browse UI. The extension depends on it via `workspace:*`.

## Chrome extension

Manifest: [`packages/extension/public/manifest.json`](../../packages/extension/public/manifest.json) (v3, side panel, context menus, activeTab scripting).

Build: [`packages/extension/vite.config.ts`](../../packages/extension/vite.config.ts) emits:

- `index.html` + assets under `dist/sidepanel/`
- `service-worker.js` at the root

### Side panel

[`packages/extension/src/sidepanel/App.tsx`](../../packages/extension/src/sidepanel/App.tsx) is the main shell:

- Loads bridge config and workspace from `chrome.storage.local` via [`lib/store.ts`](../../packages/extension/src/lib/store.ts).
- Defaults to local mode; supports hosted mode with login.
- Maintains a `WSClient` ref, reconnects when mode/URL/token change.
- Tabs: **Consult** (query), **Add Knowledge** (URL add), **Browse** (summaries/concepts + clear).
- Shows an auth screen in hosted mode when no token is stored.

### Service worker

[`packages/extension/src/service-worker.ts`](../../packages/extension/src/service-worker.ts):

- Registers two context-menu items on install:
  - *Add this URL to Knowledge Bases* — sends the page URL to the side panel.
  - *Add this content into Knowledge base* — injects a content script to capture `document.documentElement.outerHTML`, stores it in `chrome.storage.local`, then sends a lightweight message to the side panel.
- Opens the side panel when the action icon is clicked.

### Storage

[`packages/extension/src/lib/store.ts`](../../packages/extension/src/lib/store.ts) wraps `chrome.storage.local`. It stores:

- bridge config (`mode`, `bridgeUrl`, `token`, `username`)
- Keb state (`registry`, `index`, `summaries`, `concepts`, `workspaces`)
- connection state and first-use flag

The default bridge config defaults to hosted mode with `wss://api.mdevd.co/keb/v1`, matching [`packages/shared/src/lib/env.ts`](../../packages/shared/src/lib/env.ts).

## Web app

[`packages/web-app/src/App.tsx`](../../packages/web-app/src/App.tsx) is a Vite React app with the same WS client and storage shape as the extension, but using `localStorage` instead of `chrome.storage.local`.

Differences from the extension:

- Tabs are **Consult** and **Browse** only — it cannot capture page content.
- Defaults to `hosted` mode.
- Has no service worker or context menus.
- Used as a browser-based chat client against the hosted bridge.

Build: [`packages/web-app/vite.config.ts`](../../packages/web-app/vite.config.ts) runs on port 4000 in dev.

## WebSocket client

Both clients use `WSClient` classes that are nearly identical:

- Extension: [`packages/extension/src/lib/ws.ts`](../../packages/extension/src/lib/ws.ts)
- Web app: [`packages/web-app/src/lib/ws.ts`](../../packages/web-app/src/lib/ws.ts)

Responsibilities:

- Normalize the bridge URL by appending `/ws`.
- In hosted mode, send `{ type: "auth", token }` first and wait for `auth_ok`.
- In local mode, send `{ type: "sync", workspace: "default" }` immediately.
- Track per-operation callbacks in a `Map<operationId, OperationCallbacks>`.
- Route `event`, `done`, `error`, and `stderr` messages to the matching operation.
- Exponential backoff reconnection: 2 s, 4 s, 8 s, then `max_retries`.

Operation IDs are generated with `nanoid`. The server echoes them, so multiple `add`/`query` operations can run concurrently over one connection.

## Operation timeline UI

[`packages/shared/src/components/OperationTimeline.tsx`](../../packages/shared/src/components/OperationTimeline.tsx) renders the streamed output of an active operation:

- `text` entries → rendered as Markdown.
- `tool` entries → monospace lines for tool start/end and status.

`QueryPanel` shows the current query operation and input box. `AddPanel` (extension only) shows URL add/repair operations.

## Hosted bridge URL

`HOSTED_BRIDGE_URL` is a Vite build-time constant. To point clients at a different hosted bridge:

```bash
VITE_HOSTED_BRIDGE_URL=wss://your-domain.com/keb/v1 pnpm build
```

There is no runtime URL override in hosted mode; the Settings panel hides the URL input when hosted.
