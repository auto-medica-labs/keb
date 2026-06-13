# Plan: Validate Workspace on LLM Tool Calls

**Date:** 2026-06-06  
**Status:** Draft  
**Author:** Analysis after code review

---

## Problem

When the bridge invokes `/kb-add -w alice <url>`, the source file and registry entry are written to the correct workspace before the LLM is invoked. But the LLM then uses tools like `kb_write_summary`, `kb_read_concept`, etc. — all of which accept `workspace` as an **optional** parameter.

The prompt instructs the LLM:

> IMPORTANT: Pass `workspace="alice"` to EVERY kb\_\* tool call.

However, this is a textual instruction, not enforcement. If the LLM omits the `workspace` parameter or passes the wrong value, content **silently goes to the wrong workspace**.

## Solution

Use **module-level state** to track the expected workspace (set by the command handler before sending the LLM prompt), and validate every tool call against it.

Since each `pi --mode rpc` process is a fresh Node.js process (one per add/query/repair operation), module-level state is scoped to a single operation — no cross-contamination between concurrent compilations.

## Files to Modify

| File                                                 | Change                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/pi-kb/extensions/kb/tools.ts`              | Add `_expectedWorkspace` state + setter + validation in every tool            |
| `packages/pi-kb/extensions/kb/commands/documents.ts` | Call `setExpectedWorkspace(workspace)` before every `pi.sendUserMessage(...)` |
| `packages/pi-kb/extensions/kb/commands/queries.ts`   | Call `setExpectedWorkspace(workspace)` before /kb-query prompt                |

## Detailed Changes

### 1. `tools.ts` — Add validation & setter

**Add at module level** (after imports, before `registerTools`):

```typescript
/** Expected workspace for the current compilation session.
 *  Set by command handlers before sending LLM prompts.
 *  undefined = default workspace. */
let _expectedWorkspace: string | undefined = undefined;

/** Set the expected workspace for tool call validation.
 *  Call before sending any prompt that triggers LLM tool calls.
 *  @param ws - Workspace name, or undefined for default. */
export function setExpectedWorkspace(ws: string | undefined): void {
  _expectedWorkspace = ws;
}
```

**Add a helper function** to reuse in every tool:

```typescript
/** Validate that the workspace passed by the LLM matches the expected workspace.
 *  Returns an error response if mismatch, or null if OK. */
function validateWorkspace(
  workspace: string | undefined,
): { content: { type: "text"; text: string }[]; details: {} } | null {
  if (workspace !== _expectedWorkspace) {
    return {
      content: [
        {
          type: "text" as const,
          text: `ERROR: Workspace mismatch. Expected "${_expectedWorkspace || "default"}" but got "${workspace || "default"}". Please retry with workspace="${_expectedWorkspace || ""}".`,
        },
      ],
      details: {},
    };
  }
  return null;
}
```

**In every tool's `execute` method**, add at the top:

```typescript
const wsErr = validateWorkspace(params.workspace);
if (wsErr) return wsErr;
```

Tools to validate (9 total):

- `kb_read_index`
- `kb_list_concepts`
- `kb_read_concept`
- `kb_read_summary`
- `kb_write_summary`
- `kb_write_concept`
- `kb_update_concept`
- `kb_update_index`
- `kb_set_docname`

### 2. `documents.ts` — Set expected workspace

```typescript
// At top of file, add import:
import { setExpectedWorkspace } from "../tools";
```

**`handleUrlAdd`** — before `pi.sendUserMessage(buildCompilePrompt(...))`:

```typescript
setExpectedWorkspace(workspace);
```

**`handleFileAdd`** — before `pi.sendUserMessage(buildCompilePrompt(...))`:

```typescript
setExpectedWorkspace(workspace);
```

**`/kb-add-content` handler** — before `pi.sendUserMessage(buildCompilePromptInline(...))`:

```typescript
setExpectedWorkspace(workspace);
```

**`recompileEntry`** (used by `/kb-repair`) — before `pi.sendUserMessage(buildCompilePrompt(...))`:

```typescript
setExpectedWorkspace(workspace);
```

**`/kb-remove` Phase 2** — before `pi.sendUserMessage(buildRemovePrompt(...))`:

```typescript
setExpectedWorkspace(workspace);
```

### 3. `queries.ts` — Set expected workspace

```typescript
// At top of file, add import:
import { setExpectedWorkspace } from "../tools";
```

**`/kb-query` handler** — before `pi.sendUserMessage(buildQueryPrompt(...))`:

```typescript
setExpectedWorkspace(workspace);
```

## Behavior Matrix

| LLM passes `workspace` | Expected              | Result                |
| ---------------------- | --------------------- | --------------------- |
| `"alice"`              | `"alice"`             | ✅ Pass through       |
| `undefined`            | `undefined` (default) | ✅ Pass through       |
| `"alice"`              | `undefined` (default) | ❌ Error, LLM retries |
| `undefined`            | `"alice"`             | ❌ Error, LLM retries |
| `"bob"`                | `"alice"`             | ❌ Error, LLM retries |

When validation fails, the LLM gets an error message telling it exactly which workspace to use, so it self-corrects on the next tool call attempt.

## Edge Cases

| Case                                        | Analysis                                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **`/kb-repair` with multiple pending docs** | All docs in same workspace; `_expectedWorkspace` stays constant across iterations ✅                  |
| **`/kb-remove` Phase 2**                    | Uses `kb_read_concept` / `kb_write_concept` — validated against remove command's workspace ✅         |
| **Concurrent pi RPC processes**             | Each `pi --mode rpc` is a separate OS process — module-level state is isolated ✅                     |
| **`/kb-list`, `/kb-status`**                | No LLM prompts sent, no tool calls involved — no impact ✅                                            |
| **Bridge in local mode (no workspace)**     | `workspace = undefined` → `_expectedWorkspace = undefined` → LLM omits `workspace` param → matches ✅ |

## Verification

1. Run a compile with `-w alice`, verify all tool calls pass `workspace: "alice"` → content lands in `workspaces/alice/wiki/`
2. Run a compile with no `-w` flag, verify LLM omits `workspace` param → content lands in default KB root
3. (Adversarial) Force the LLM to pass `workspace: "bob"` when `-w alice` was used → verify error returned and LLM retries with correct workspace
