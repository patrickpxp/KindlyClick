chrome.runtime.onInstalled.addListener(() => {
  console.log("KindlyClick background initialized");
});

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs && tabs.length > 0 ? tabs[0] : null;
}

function isInjectableTabUrl(url) {
  const value = String(url || "").toLowerCase();
  return value.startsWith("http://") || value.startsWith("https://") || value.startsWith("file://");
}

async function sendMessageWithInjectionFallback(tabId, payload) {
  try {
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch (error) {
    const errorText = String(error?.message || "");
    if (!errorText.includes("Receiving end does not exist")) {
      throw error;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });

    return chrome.tabs.sendMessage(tabId, payload);
  }
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
      return;
    }

    if (message.type === "kindlyclick:open-mic-permission-tab") {
      const selectedDeviceId =
        typeof message.deviceId === "string" ? message.deviceId.trim() : "";
      const url = new URL(chrome.runtime.getURL("request-mic.html"));

      if (selectedDeviceId) {
        url.searchParams.set("deviceId", selectedDeviceId);
      }

      const tab = await chrome.tabs.create({
        url: url.toString(),
        active: true
      });

      sendResponse({
        ok: true,
        tabId: tab?.id || null
      });
      return;
    }

    if (message.type === "kindlyclick:draw-highlight") {
      const activeTab = await getActiveTab();
      if (!activeTab || !activeTab.id) {
        sendResponse({ ok: false, error: "No active tab" });
        return;
      }

      if (!isInjectableTabUrl(activeTab.url)) {
        sendResponse({
          ok: false,
          error: "Highlight works only on regular web pages (http/https/file), not browser internal pages."
        });
        return;
      }

      try {
        const response = await sendMessageWithInjectionFallback(activeTab.id, {
          type: "kindlyclick:draw-highlight",
          command: message.command || {}
        });

        sendResponse({
          ok: true,
          tabId: activeTab.id,
          result: response || { ok: true }
        });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error.message || "Failed to draw highlight"
        });
      }
      return;
    }

    if (message.type === "kindlyclick:mic-permission-granted") {
      sendResponse({ ok: true });
      return;
    }
  })().catch((error) => {
    sendResponse({ ok: false, error: error.message || "Unhandled background error" });
  });

  return true;
});
