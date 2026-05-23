// service-worker.ts — Context menu, action click → side panel, message relay
//
// The service worker does NOT hold a WebSocket connection (the side panel does).
// It handles:
//   1. Context menu "Add to KB" → gets page URL, opens side panel, relays the URL
//   2. Action icon click → opens side panel
//   3. Runtime messages between contexts

// ── Install ──────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  // Enable the side panel globally
  await chrome.sidePanel.setOptions({ enabled: true });

  chrome.contextMenus.create({
    id: "kb-add-page",
    title: "Add this URL to Knowledge Bases",
    contexts: ["page"],
  });
});

// ── Action click → open side panel ───────────────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  console.log("[chrome-kb] onClicked — tab.id:", tab?.id, "windowId:", tab?.windowId);
  try {
    // Open for the current tab (not window) so it follows the tab
    await chrome.sidePanel.open({ windowId: tab.windowId });
    console.log("[chrome-kb] side panel opened");
  } catch (err) {
    console.error("[chrome-kb] sidePanel.open failed:", err);
  }
});

// ── Context menu click ───────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "kb-add-page") return;

  const url = tab?.url || info.pageUrl;
  if (!url || !url.startsWith("http")) {
    console.warn("[chrome-kb] Cannot add non-HTTP URL:", url);
    return;
  }

  // Open the side panel for the current window
  try {
    await chrome.sidePanel.open({ windowId: tab!.windowId });
  } catch (err) {
    console.error("[chrome-kb] Failed to open side panel:", err);
  }

  // Send the URL to the side panel so it can auto-populate the Add field
  // Slight delay to allow the panel to load
  setTimeout(() => {
    chrome.runtime.sendMessage({ type: "add-url-from-context", url }).catch(() => {
      // Side panel may not be ready yet — the URL will be lost, but
      // the user can still paste it manually.
    });
  }, 300);
});

// ── Runtime message relay ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "ping"
  ) {
    sendResponse({ type: "pong" });
    return false;
  }
  return false;
});
