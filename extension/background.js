chrome.runtime.onInstalled.addListener(() => {
  console.log("KindlyClick background initialized");
});

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs && tabs.length > 0 ? tabs[0] : null;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (!message || typeof message.type !== "string") {
      return;
    }

    if (message.type === "kindlyclick:get-active-tab-context") {
      const activeTab = await getActiveTab();
      sendResponse({
        ok: true,
        pageTitle: activeTab?.title || "",
        pageUrl: activeTab?.url || "",
        tabId: activeTab?.id || null
      });
      return;
    }

    if (message.type === "kindlyclick:get-content-hints") {
      const activeTab = await getActiveTab();
      if (!activeTab || !activeTab.id) {
        sendResponse({ ok: false, error: "No active tab" });
        return;
      }

      try {
        const response = await chrome.tabs.sendMessage(activeTab.id, {
          type: "kindlyclick:get-content-hints"
        });

        sendResponse({
          ok: true,
          tabId: activeTab.id,
          hints: response || {}
        });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error.message || "Failed to fetch content hints"
        });
      }
    }
  })().catch((error) => {
    sendResponse({ ok: false, error: error.message || "Unhandled background error" });
  });

  return true;
});
