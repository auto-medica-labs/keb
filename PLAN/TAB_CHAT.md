# Plan: Talk with Tab — Chat Mode for Keb

## Goal

Add a "Chat" tab to the Keb Chrome extension that lets users have a conversation with pi about the current browser tab. One pi RPC process per side-panel lifetime. No session persistence on disk. No resume across restarts.

---

## Architecture

```
Side panel opens ──► WebSocket connects ──► Bridge spawns pi --mode rpc
                                                    │
User chats ──► sendPrompt() on same child process   │
                                                    │
Side panel closes ──► ws.on("close") ──► child.kill()
```

| Layer | Role |
|---|---|
| **Extension (ChatPanel.tsx)** | Chat UI; captures tab content via `chrome.scripting.executeScript` before first message |
| **Extension (ws.ts)** | Sends `chat` messages; no new response types |
| **Bridge (chat-handler.js)** | Per-connection state: one long-lived pi child, tracks whether it's first message or follow-up |
| **Bridge (pi-rpc-spawner.js)** | New `spawnPiChat()` — keeps child alive across prompts, exposes `sendPrompt()` / `kill()` |

---

## 1. Bridge — `pi-rpc-spawner.js`

Add a long-lived spawn variant. Reuses the same child process for the entire conversation.

```js
export function spawnPiChat({ callbacks }) {
  const child = spawn("pi", ["--mode", "rpc", "--no-session"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Parse stdout JSONL, forward events to callbacks
  // Do NOT kill child on agent_end

  return {
    child,
    sendPrompt(text) {
      child.stdin.write(JSON.stringify({ type: "prompt", message: text }) + "\n");
    },
    kill() {
      child.kill("SIGTERM");
    },
  };
}
```

Key differences from existing `spawnPi`:
- No `--no-builtin-tools` (agent can use `read`, `bash`, etc.)
- `--no-session` (no disk persistence)
- Returns a handle with `sendPrompt()` and `kill()` instead of auto-exiting
- Stays alive until explicitly killed

## 2. Bridge — New `handlers/chat-handler.js`

Per-connection state map:

```js
const chatSessions = new Map(); // connectionId → { handle, isFirstMessage }
```

**`handleChatInit({ ws, connectionId, operationId, text, url, title, content })`**
- Spawn piChat via `spawnPiChat()`
- Send initial prompt with tab context: text + url/title/content
- Wire stdout JSONL events → `ws.send()`
- Set `isFirstMessage = false`

**`handleChatMessage({ ws, connectionId, operationId, text })`**
- Look up handle for this connectionId
- Send prompt to the existing child (or steer if currently streaming)
- Wire events → ws

**`handleChatClose({ connectionId })`**
- Kill child process
- Clean up map entry

## 3. Bridge — `bridge-server.js`

Add message routing for `chat` type:

```js
case "chat": {
  if (!chatSessions.has(connectionId)) {
    handleChatInit({ ws, connectionId, operationId, text: msg.text,
      url: msg.url, title: msg.title, content: msg.content });
  } else {
    handleChatMessage({ ws, connectionId, operationId, text: msg.text });
  }
  break;
}
```

Hook into existing `ws.on("close")`:

```js
handleChatClose({ connectionId });
```

## 4. Extension — `ws.ts`

Add `chat` to `WSMessage` type:

```typescript
| { type: "chat"; text: string; operationId: string; url?: string; title?: string; content?: string }
```

No new response types — reuses existing `event`, `done`, `error`.

Add method:

```typescript
chat(text: string, callbacks: OperationCallbacks, tabContext?: { url: string; title: string; content: string }): string {
  const id = nanoid();
  this.operations.set(id, callbacks);
  this._send({ type: "chat", operationId: id, text, ...tabContext });
  return id;
}
```

Tab content is captured in the extension before calling `chat()`, not in the bridge.

## 5. Extension — New `ChatPanel.tsx`

Chat UI component:

```
┌──────────────────────────────────┐
│  📄 Talking with: example.com    │  ← current tab info (read-only)
│  [Ask about this page...] [Send] │
├──────────────────────────────────┤
│  You                             │
│  What does this page say about   │
│  caching?                        │
│                                  │
│  ─── pi ───                      │
│  This page discusses...          │  ← streaming text_delta
│                                  │
│  You                             │
│  Can you summarize the auth?     │
│                                  │
│  ─── pi ───                      │
│  The auth section covers...      │
│                                  │
│  [New Conversation]              │  ← kills & re-spawns pi
└──────────────────────────────────┘
```

State lives in React only. No storage. Side panel close → component unmounts → gone.

**Tab content capture** (on first message or refresh):
```typescript
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const [{ result }] = await chrome.scripting.executeScript({
  target: { tabId: tab.id },
  func: () => ({ url: location.href, title: document.title, content: document.body.innerText.slice(0, 50000) }),
});
```

## 6. Extension — `App.tsx`

- Add `"chat"` to `ActiveTab` union
- Add `ChatPanel` import and tab trigger
- Wire `handleChat()` that creates operation callbacks and calls `wsRef.current?.chat()`
- Track chat operations separately (or reuse existing operations array with type `"chat"`)

**Existing tabs (Add / Consult / Browse) remain unchanged.**

## 7. Extension — `service-worker.ts`

Add context menu:

```typescript
chrome.contextMenus.create({
  id: "keb-talk-page",
  title: "Talk with this page",
  contexts: ["page"],
});
```

On click: capture page content, store in `chrome.storage.local` for the side panel, open side panel, set active tab to `"chat"`.

## 8. Protocol

**Extension → Bridge (first message):**
```json
{
  "type": "chat",
  "operationId": "abc",
  "text": "Summarize this page",
  "url": "https://example.com",
  "title": "Example",
  "content": "Page text content..."
}
```

**Extension → Bridge (follow-up):**
```json
{
  "type": "chat",
  "operationId": "def",
  "text": "Tell me more about section 3"
}
```

**Bridge → Extension:** Reuses existing `event` / `done` / `error` types.

## Lifecycle

```
Side panel opens      ──► WebSocket connects
User types 1st msg   ──► bridge spawns pi --mode rpc --no-session
                         prompt: tab context + user message
User types more msgs ──► sendPrompt() on same child
                         (steer if streaming, prompt if idle)
[New Conversation]   ──► bridge kills child, spawns fresh one
Side panel closes    ──► ws.on("close") → bridge kills child
```

## File Change Summary

| File | Change |
|---|---|
| `packages/bridge/src/adapters/pi-rpc-spawner.js` | Add `spawnPiChat()` — long-lived child, `sendPrompt()`/`kill()` |
| `packages/bridge/src/handlers/chat-handler.js` | **NEW** — init, message, close handlers + per-connection state map |
| `packages/bridge/src/bridge-server.js` | Route `chat` msg type; hook `ws.on("close")` → kill chat child |
| `packages/extension/src/lib/ws.ts` | Add `chat()` method; add `chat` to WSMessage union |
| `packages/extension/src/sidepanel/components/ChatPanel.tsx` | **NEW** — chat UI, tab capture, streaming bubbles |
| `packages/extension/src/sidepanel/App.tsx` | Add Chat tab, wire handler |
| `packages/extension/src/service-worker.ts` | Add "Talk with this page" context menu |
| `packages/extension/public/manifest.json` | No changes needed |

**Not changed:** `store.ts`, `AddPanel.tsx`, `QueryPanel.tsx`, `BrowsePanel.tsx`, `filesystem-keb-store.js`, `sync-handler.js`, `command-handler.js`, `add-content-handler.js`, `query-handler.js` — existing features untouched.
