# Adding knowledge

Keb supports two ways to add content:

1. **Add by URL** — the bridge fetches the page, converts HTML to Markdown, and compiles it.
1. **Add captured content** — the extension captures the page HTML via a content script and sends it to the bridge.

Both paths ultimately call into the `pi-keb` extension's `/keb:add` or `/keb:add:content` commands.

## Add by URL

Flow:

1. User sends `{ type: "add", operationId, url }` over WebSocket.
1. [`packages/bridge/src/handlers/add-url-handler.js`](../../packages/bridge/src/handlers/add-url-handler.js) checks whether the normalized URL is already in the registry.
   - If present and `compiled !== false`, short-circuit with "Already in Keb".
   - If present and `compiled === false`, recompile the existing source.
1. Enforce hosted-mode document limit (50 docs).
1. Spawn `pi` with `/keb:add -f -w <workspace> <url>`.

Inside `pi`, the `keb:add` command in [`packages/pi-keb/extensions/keb/commands/documents.ts`](../../packages/pi-keb/extensions/keb/commands/documents.ts) fetches the URL with `HttpFetcher`, derives a `docName` from the URL or page title, writes the source, registers the entry as `compiled: false`, and injects the compile prompt.

### Blocked / empty pages

If a remote server returns HTTP 401/403, or `pi` detects an empty/captcha/login-wall page, the handler sends a special error telling the user to use *Add this content into Knowledge base* instead. This captures the page as the browser sees it, bypassing server-side blocks.

## Add captured content

Flow:

1. The extension service worker ([`packages/extension/src/service-worker.ts`](../../packages/extension/src/service-worker.ts)) injects a script that returns `document.documentElement.outerHTML` plus title and URL.
1. The HTML is stored briefly in `chrome.storage.local` and a message is sent to the side panel.
1. The side panel calls `WSClient.addContent(...)`.
1. [`packages/bridge/src/handlers/add-content-handler.js`](../../packages/bridge/src/handlers/add-content-handler.js) converts HTML → Markdown with `@kreuzberg/html-to-markdown-node`, prepends a metadata header, checks the document limit, and spawns `pi` with `/keb:add:content -f -w <workspace> <markdown>`.

Use this for JS-heavy sites, paywalls, or any page that blocks direct fetching.

## Compilation prompts

[`packages/pi-keb/extensions/keb/prompts.ts`](../../packages/pi-keb/extensions/keb/prompts.ts) defines the prompts `pi` receives.

The compile prompt instructs the LLM to:

1. Reject empty/captcha/login pages.
1. Read the current index and concept list.
1. Write a 200–400 word summary via `keb_write_summary`.
1. Extract or update cross-cutting concepts via `keb_write_concept` / `keb_update_concept`.
1. Rebuild the index via `keb_update_index`.

The inline-content prompt adds an extra first step: call `keb_set_docname` to rename the auto-generated `inline-*` slug to a meaningful one.

## Document limit

Hosted mode enforces a hardcoded 50-document free tier in [`packages/bridge/src/bridge-server.js`](../../packages/bridge/src/bridge-server.js). Both add handlers return an error if `countDocuments(workspace) >= MAX_DOCUMENTS`.

## Repair

If compilation is interrupted, the registry entry stays `compiled: false`. The user can trigger repair from the footer or by sending `{ type: "repair" }`.

[`packages/bridge/src/handlers/repair-handler.js`](../../packages/bridge/src/handlers/repair-handler.js):

1. Counts pending entries.
1. Short-circuits with "All compiled" if none.
1. Otherwise spawns `pi` with `/keb:repair -w <workspace>`.

Inside `pi-keb`, `/keb:repair` re-reads each pending source and re-injects the compile prompt.

## Removing documents

`/keb:remove <docName>` (available in `pi` but not directly exposed by the bridge) performs a two-phase removal:

- **Phase 1** (deterministic): delete summary, update concept source lists, delete orphaned concepts, rebuild index, delete source, delete registry entry.
- **Phase 2** (LLM): surgically remove content traceable to the deleted document from affected concept bodies.
