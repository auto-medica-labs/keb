# Query & sync workflows

## Query

1. The client sends `{ type: "query", operationId, text }`.
1. [`packages/bridge/src/handlers/query-handler.js`](../../packages/bridge/src/handlers/query-handler.js) spawns `pi` with `/keb:query -w <workspace> <text>`.
1. `pi` receives the query prompt from [`packages/pi-keb/extensions/keb/prompts.ts`](../../packages/pi-keb/extensions/keb/prompts.ts), which tells it to:
   - Read the index.
   - Read relevant summaries and concepts.
   - Answer using only knowledge-base content, citing sources as `summary/docname` or `concept/slug`.
1. Events stream back over WebSocket; the client renders them in `QueryPanel` / `OperationTimeline`.

Query operations are tracked by `operationId` just like add/repair operations, so a query can run while an add is compiling.

## Sync

`sync` is a pure read operation with no `pi` process:

1. Client sends `{ type: "sync", workspace? }`.
1. [`packages/bridge/src/handlers/sync-handler.js`](../../packages/bridge/src/handlers/sync-handler.js) calls `kebStore.buildSyncData(workspace)`.
1. The adapter reads registry, index, summaries, and concepts from disk and returns:

```ts
{
  registry: Record<string, RegistryEntry>;
  index: string;
  summaries: Record<string, Summary>;
  concepts: Record<string, Concept>;
  workspaces: string[];
}
```

4. The bridge sends `{ type: "sync_result", data }`.

The extension stores the result in `chrome.storage.local`; the web app stores it in `localStorage`. Both update doc/concept counts and pending-compilation status.

## Clear workspace

`clear` is also a pure write with no `pi` process:

1. Client sends `{ type: "clear", workspace? }`.
1. [`packages/bridge/src/handlers/clear-handler.js`](../../packages/bridge/src/handlers/clear-handler.js) calls `kebStore.clearWorkspace(workspace)`.
1. The handler sends an empty `sync_result` so the client resets its local state.

## Operation correlation

Every `add`, `add-content`, `query`, and `repair` carries a client-generated `operationId`. The bridge echoes it in `event`, `done`, `error`, and `stderr` messages. The client's `WSClient` routes messages to the matching `OperationCallbacks`.

This allows multiple concurrent operations on one connection, although each tab tracks only the latest operation of its type.

## Operation timeline UI

[`packages/shared/src/components/OperationTimeline.tsx`](../../packages/shared/src/components/OperationTimeline.tsx) renders:

- `text_delta` events as Markdown text.
- `tool_execution_start` / `tool_execution_end` as tool status lines.
- `done` adds a green "Complete" status.
- `error` adds a red line; some errors carry a `toast` field for a toast notification.

`QueryPanel` auto-scrolls as new text arrives and disables input while an operation is in progress.

## Reconnection behavior

The `WSClient` reconnects with exponential backoff (2 s, 4 s, 8 s) up to three attempts. After a disconnect:

- In-progress operation callbacks are cleared.
- On reconnect, local mode requests a fresh sync.
- Hosted mode re-sends the auth token first, then syncs.

The bridge kills a connection's active child processes when the socket closes, so reconnections start from a clean server state.
