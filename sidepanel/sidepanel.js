// sidepanel.js — WebSocket client, tab logic, streaming UI renderer
//
// The side panel connects directly to the pi-kb WebSocket bridge and handles:
//   - Live connection status
//   - Add URL flow (with progress events)
//   - Query flow (with streaming text_delta rendering)
//   - Browse (cached index/summaries/concepts from chrome.storage.local)
//   - Receives add-url-from-context messages from the service worker
//
// Dependencies: lib/store.js, lib/utils.js (inlined via import maps or direct refs)

import {
  setKBState,
  getConnectionState,
  setConnectionState,
  getConfig,
  setConfig,
  getRegistry,
  getIndex,
  getSummaries,
  getConcepts,
  getWorkspaces,
} from "../lib/store.js";

import { renderMarkdown, isoNow, escapeHtml } from "../lib/utils.js";

// ── DOM refs ──────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  // Header
  wsDot: $("#ws-status-dot"),
  wsText: $("#ws-status-text"),
  wsSelect: $("#workspace-select"),
  headerWs: $("#header-ws"),

  // Tab bar
  tabAdd: $("#tab-add"),
  tabQuery: $("#tab-query"),
  tabBrowse: $("#tab-browse"),

  // Add panel
  panelAdd: $("#panel-add"),
  addUrlInput: $("#add-url-input"),
  addBtn: $("#add-btn"),
  addProgress: $("#add-progress"),
  addProgressText: $("#add-progress-text"),
  addStream: $("#add-stream"),

  // Query panel
  panelQuery: $("#panel-query"),
  queryInput: $("#query-input"),
  queryBtn: $("#query-btn"),
  queryProgress: $("#query-progress"),
  queryProgressText: $("#query-progress-text"),
  queryResult: $("#query-result"),

  // Browse panel
  panelBrowse: $("#panel-browse"),
  browseList: $("#browse-list"),

  // Footer
  footerStats: $("#footer-stats"),
  footerAgent: $("#footer-agent-status"),
};

// ── State ─────────────────────────────────────────────────────────────

let ws = null;
let wsReconnectTimer = null;
let wsConnected = false;
let activeTab = "add";
let selectedWorkspace = "default";
let activeOperation = "idle"; // "add" | "query" | "idle"

// ── Connection management ─────────────────────────────────────────────

function connectWS() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  updateConnectionUI("connecting");

  ws = new WebSocket("ws://127.0.0.1:9876");

  ws.onopen = () => {
    console.log("[chrome-kb] WS connected");
    wsConnected = true;
    updateConnectionUI("connected");
    clearReconnectTimer();

    // Sync immediately on connect
    sendWS({ type: "sync", workspace: selectedWorkspace });
  };

  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    handleWSMessage(msg);
  };

  ws.onclose = () => {
    console.log("[chrome-kb] WS disconnected");
    wsConnected = false;
    updateConnectionUI("disconnected");
    scheduleReconnect();
  };

  ws.onerror = (err) => {
    console.error("[chrome-kb] WS error:", err);
  };
}

function scheduleReconnect() {
  if (wsReconnectTimer) return;
  updateConnectionUI("reconnecting");
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    connectWS();
  }, 2000);
}

function clearReconnectTimer() {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
}

function sendWS(data) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    updateConnectionUI("disconnected");
    return false;
  }
  ws.send(JSON.stringify(data));
  return true;
}

function updateConnectionUI(state) {
  dom.wsDot.className = `status-dot status-${state}`;
  dom.wsText.textContent = state;

  // Enable/disable action buttons
  const canAct = state === "connected";
  dom.addBtn.disabled = !canAct || !dom.addUrlInput.value.trim();
  dom.queryBtn.disabled = !canAct || !dom.queryInput.value.trim();
}

// ── WS message handler ────────────────────────────────────────────────

function handleWSMessage(msg) {
  switch (msg.type) {
    case "event":
      handleBridgeEvent(msg.data);
      break;

    case "sync_result":
      handleSyncResult(msg.data);
      break;

    case "done":
      handleDone(msg.command);
      break;

    case "error":
      console.error("[chrome-kb] Bridge error:", msg.message);
      showError(msg.message);
      break;

    case "stderr":
      console.warn("[chrome-kb] Bridge stderr:", msg.text);
      break;

    default:
      console.log("[chrome-kb] Unknown message:", msg);
  }
}

function handleBridgeEvent(event) {
  const etype = event.type;

  // ── Text deltas (streaming LLM output) ──
  if (etype === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
    const delta = event.assistantMessageEvent.delta || "";
    if (activeOperation === "add") {
      appendAddText(delta);
    } else if (activeOperation === "query") {
      appendQueryText(delta);
    }
    return;
  }

  // ── Turn boundaries (query: separate each LLM turn into its own block) ──
  if (etype === "turn_end") {
    if (activeOperation === "query" && currentQueryBlock) {
      currentQueryBlock = null; // next text delta creates a fresh block
    }
    return;
  }

  // ── Tool execution events (add progress) ──
  if (etype === "tool_execution_start") {
    const toolName = event.toolName || "unknown tool";
    addProgressEvent(`Running ${toolName}...`, "tool-start");
    return;
  }

  if (etype === "tool_execution_end") {
    const toolName = event.toolName || "unknown tool";
    addProgressEvent(`Finished ${toolName}`, "tool-end");
    return;
  }

  // ── Agent end ──
  if (etype === "agent_end") {
    return; // Handled by "done" message from bridge
  }

  // Log other events for debugging
  console.log("[chrome-kb] Event:", etype, event);
}

function handleSyncResult(data) {
  setKBState(data).then(() => {
    updateStats(data);
    updateWorkspaceDropdown(data.workspaces || []);
    renderBrowse(data);
    console.log("[chrome-kb] KB state synced");
  });
}

function handleDone(command) {
  if (command === "add") {
    dom.addProgress.classList.add("done");
    dom.addProgressText.textContent = "Complete!";
    addProgressEvent("Compilation complete. Re-syncing...", "done");

    // Re-sync after add
    setTimeout(() => {
      sendWS({ type: "sync", workspace: selectedWorkspace });
    }, 500);
  }

  if (command === "query") {
    dom.queryProgress.classList.add("hidden");
    dom.queryProgressText.textContent = "Searching...";
    dom.queryInput.disabled = false;
    dom.queryInput.focus();
    currentQueryBlock = null;
  }

  updateAgentStatus("idle");
}

function showError(message) {
  // Show in whichever panel is active
  if (activeTab === "add") {
    addProgressEvent(`Error: ${message}`, "error");
  } else if (activeTab === "query") {
    appendQueryText(`\n\n⚠️ Error: ${message}`);
  }
}

// ── Add URL flow ─────────────────────────────────────────────────────

function addProgressEvent(text, cls) {
  const el = document.createElement("div");
  el.textContent = text;
  el.className = `stream-event stream-${cls}`;
  dom.addStream.appendChild(el);
  dom.addStream.scrollTop = dom.addStream.scrollHeight;
}

async function handleAdd() {
  const url = dom.addUrlInput.value.trim();
  if (!url) return;

  if (!sendWS({ type: "add", url, workspace: selectedWorkspace })) {
    return;
  }

  // Reset and show progress
  dom.addStream.innerHTML = "";
  dom.addProgress.classList.remove("hidden", "done");
  dom.addProgressText.textContent = "Compiling...";
  activeOperation = "add";

  addProgressEvent(`Adding: ${url}`, "info");
  addProgressEvent(`Workspace: ${selectedWorkspace}`, "info");

  dom.addBtn.disabled = true;
  dom.addUrlInput.value = "";
  updateAgentStatus("busy-add");
}

// ── Query flow ────────────────────────────────────────────────────────

let currentQueryBlock = null;

function appendQueryText(delta) {
  if (!currentQueryBlock) {
    currentQueryBlock = document.createElement("div");
    currentQueryBlock.className = "query-answer";
    dom.queryResult.appendChild(currentQueryBlock);
  }
  currentQueryBlock.textContent += delta;
  dom.queryResult.scrollTop = dom.queryResult.scrollHeight;
}

function appendAddText(delta) {
  // Append to a text block, reusing the last one if it exists
  let block = dom.addStream.lastElementChild;
  if (!block || !block.classList.contains("stream-text")) {
    block = document.createElement("div");
    block.className = "stream-text";
    dom.addStream.appendChild(block);
  }
  block.textContent += delta;
  dom.addStream.scrollTop = dom.addStream.scrollHeight;
}

async function handleQuery() {
  const text = dom.queryInput.value.trim();
  if (!text) return;

  if (!sendWS({ type: "query", text, workspace: selectedWorkspace })) {
    return;
  }

  // Clear and disable input, print question above results
  dom.queryInput.value = "";
  dom.queryInput.disabled = true;
  dom.queryBtn.disabled = true;

  dom.queryResult.innerHTML = "";
  const qBlock = document.createElement("div");
  qBlock.className = "query-question";
  qBlock.textContent = text;
  dom.queryResult.appendChild(qBlock);

  currentQueryBlock = null;

  dom.queryProgress.classList.remove("hidden");
  dom.queryProgressText.textContent = "Searching...";
  activeOperation = "query";
  updateAgentStatus("busy-query");
}

// ── Browse ────────────────────────────────────────────────────────────

async function renderBrowse(data) {
  if (!data) {
    // Pull from storage
    const [index, summaries, concepts] = await Promise.all([
      getIndex(),
      getSummaries(),
      getConcepts(),
    ]);
    data = { index, summaries, concepts };
  }

  const { summaries = {}, concepts = {} } = data;
  const summNames = Object.keys(summaries);
  const concSlugs = Object.keys(concepts);

  if (summNames.length === 0 && concSlugs.length === 0) {
    dom.browseList.innerHTML =
      '<p class="empty-state">No documents yet. Add a URL to get started.</p>';
    return;
  }

  let html = "";

  if (summNames.length > 0) {
    html += '<h3 class="browse-section-title">Documents</h3>';
    for (const name of summNames) {
      const s = summaries[name];
      html += `<div class="browse-item browse-item-doc" data-slug="${escapeHtml(name)}">`;
      html += `  <span class="browse-item-icon">📄</span>`;
      html += `  <span class="browse-item-name">${escapeHtml(name)}</span>`;
      if (s.source) {
        html += `  <span class="browse-item-meta">${escapeHtml(s.source)}</span>`;
      }
      html += `</div>`;
    }
  }

  if (concSlugs.length > 0) {
    html += '<h3 class="browse-section-title">Concepts</h3>';
    for (const slug of concSlugs) {
      const c = concepts[slug];
      html += `<div class="browse-item browse-item-concept" data-slug="${escapeHtml(slug)}">`;
      html += `  <span class="browse-item-icon">🏷️</span>`;
      html += `  <span class="browse-item-name">${escapeHtml(slug)}</span>`;
      if (c.sources?.length) {
        html += `  <span class="browse-item-meta">${escapeHtml(c.sources.join(", "))}</span>`;
      }
      html += `</div>`;
    }
  }

  dom.browseList.innerHTML = html;
}

// ── Stats ─────────────────────────────────────────────────────────────

function updateStats(data) {
  const summCount = Object.keys(data.summaries || {}).length;
  const concCount = Object.keys(data.concepts || {}).length;
  dom.footerStats.textContent = `📊 ${summCount} docs · ${concCount} concepts`;
}

function updateAgentStatus(state) {
  const labels = {
    idle: "",
    "busy-add": "⚙️ Compiling...",
    "busy-query": "🔍 Thinking...",
  };
  dom.footerAgent.textContent = labels[state] || "";

  if (state === "idle") {
    activeOperation = "idle";
    dom.addBtn.disabled = !wsConnected || !dom.addUrlInput.value.trim();
    dom.queryBtn.disabled = !wsConnected || !dom.queryInput.value.trim();
  }
}

// ── Workspace ─────────────────────────────────────────────────────────

function updateWorkspaceDropdown(workspaces) {
  const current = dom.wsSelect.value;
  dom.wsSelect.innerHTML = '<option value="default">default</option>';

  for (const ws of workspaces) {
    if (ws === "default") continue;
    const opt = document.createElement("option");
    opt.value = ws;
    opt.textContent = ws;
    dom.wsSelect.appendChild(opt);
  }

  dom.wsSelect.value = current;
}

async function switchWorkspace(name) {
  selectedWorkspace = name;
  dom.headerWs.textContent = `· ${name}`;

  await setConfig({ workspace: name });

  // Re-sync for the new workspace
  sendWS({ type: "sync", workspace: name });
}

// ── Tab switching ─────────────────────────────────────────────────────

function switchTab(tab) {
  activeTab = tab;

  $$(".tab-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  $$(".panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${tab}`));

  if (tab === "add") dom.addUrlInput.focus();
  if (tab === "query") dom.queryInput.focus();
}

// ── Listen for context menu URL from service worker ───────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "add-url-from-context" && msg.url) {
    switchTab("add");
    dom.addUrlInput.value = msg.url;
    dom.addBtn.disabled = !wsConnected;
  }
});

// ── Event listeners ───────────────────────────────────────────────────

// Action buttons
dom.addBtn.addEventListener("click", handleAdd);
dom.queryBtn.addEventListener("click", handleQuery);

// Enable/disable buttons based on input
dom.addUrlInput.addEventListener("input", () => {
  dom.addBtn.disabled = !wsConnected || !dom.addUrlInput.value.trim();
});
dom.queryInput.addEventListener("input", () => {
  dom.queryBtn.disabled = !wsConnected || !dom.queryInput.value.trim();
});

// Enter key submits
dom.addUrlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleAdd();
});
dom.queryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleQuery();
});

// Tab switching
dom.tabAdd.addEventListener("click", () => switchTab("add"));
dom.tabQuery.addEventListener("click", () => switchTab("query"));
dom.tabBrowse.addEventListener("click", () => switchTab("browse"));

// Workspace switching
dom.wsSelect.addEventListener("change", () => {
  switchWorkspace(dom.wsSelect.value);
});

// ── Init ──────────────────────────────────────────────────────────────

async function init() {
  // Load saved workspace preference
  const config = await getConfig();
  if (config.workspace && config.workspace !== "default") {
    selectedWorkspace = config.workspace;
    dom.wsSelect.value = config.workspace;
    dom.headerWs.textContent = `· ${config.workspace}`;
  }

  // Load cached KB state for instant browse
  try {
    const [summaries, concepts, index] = await Promise.all([
      getSummaries(),
      getConcepts(),
      getIndex(),
    ]);
    if (Object.keys(summaries).length > 0 || Object.keys(concepts).length > 0) {
      renderBrowse({ summaries, concepts, index });
      updateStats({ summaries, concepts });
    }
  } catch (err) {
    console.error("[chrome-kb] Failed to load cached state:", err);
  }

  // Connect WebSocket
  connectWS();
}

init();
