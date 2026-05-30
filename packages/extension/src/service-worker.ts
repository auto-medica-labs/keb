// service-worker.ts — Context menu, action click → side panel, message relay
//
// The service worker does NOT hold a WebSocket connection (the side panel does).
// It handles:
//   1. Context menu "Add to KB" → gets page URL, opens side panel, relays the URL
//   2. Context menu "Add content to KB" → captures page HTML, relays to side panel
//   3. Action icon click → opens side panel
//   4. Runtime messages between contexts

// ── Install ──────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  // Enable the side panel globally
  await chrome.sidePanel.setOptions({ enabled: true });

  chrome.contextMenus.create({
    id: "kb-add-page",
    title: "Add this URL to Knowledge Bases",
    contexts: ["page"],
  });

  chrome.contextMenus.create({
    id: "kb-add-content",
    title: "Add this content into Knowledge base",
    contexts: ["page"],
  });
});

// ── Action click → open side panel ───────────────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  console.log("[keb] onClicked — tab.id:", tab?.id, "windowId:", tab?.windowId);
  try {
    // Open for the current tab (not window) so it follows the tab
    await chrome.sidePanel.open({ windowId: tab.windowId });
    console.log("[keb] side panel opened");
  } catch (err) {
    console.error("[keb] sidePanel.open failed:", err);
  }
});

// ── Context menu click ───────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuId = info.menuItemId;
  if (menuId !== "kb-add-page" && menuId !== "kb-add-content") return;

  const url = tab?.url || info.pageUrl;
  if (!url || !url.startsWith("http")) {
    console.warn("[keb] Cannot add non-HTTP URL:", url);
    return;
  }

  // Open the side panel for the current window
  try {
    await chrome.sidePanel.open({ windowId: tab!.windowId });
  } catch (err) {
    console.error("[keb] Failed to open side panel:", err);
  }

  // ── "Add this URL" — just send the URL ──────────────────────
  if (menuId === "kb-add-page") {
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: "add-url-from-context", url }).catch(() => {});
    }, 300);
    return;
  }

  // ── "Add this content" — capture page HTML and relay ─────────
  if (menuId === "kb-add-content") {
    if (!tab?.id) {
      console.warn("[keb] No tab id for content capture");
      return;
    }

    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return {
            html: document.documentElement.outerHTML,
            title: document.title,
            url: window.location.href,
          };
        },
      });

      if (!result || !result.result) {
        console.warn("[keb] Content script returned no result");
        return;
      }

      const { html, title, url: pageUrl } = result.result;
      const storageKey = `kb:captured-content:${Date.now()}`;

      // Store captured content for the side panel to read
      await chrome.storage.local.set({
        [storageKey]: { html, title, url: pageUrl || url },
      });

      // Send lightweight message to side panel with the storage key
      setTimeout(() => {
        chrome.runtime
          .sendMessage({ type: "add-content-from-context", storageKey })
          .catch(() => {});
      }, 300);
    } catch (err) {
      console.error("[keb] Failed to capture page content:", err);
    }
  }
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
