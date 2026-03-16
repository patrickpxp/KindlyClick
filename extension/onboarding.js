function setStatus(text) {
  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = text;
  }
}

async function getCurrentWindowId() {
  if (!globalThis.chrome || !chrome.windows || !chrome.windows.getCurrent) {
    throw new Error("Chrome window API unavailable");
  }

  const currentWindow = await chrome.windows.getCurrent();
  if (!currentWindow || typeof currentWindow.id !== "number") {
    throw new Error("Could not find the current Chrome window");
  }

  return currentWindow.id;
}

async function closeCurrentTab() {
  if (!globalThis.chrome || !chrome.tabs || !chrome.tabs.getCurrent || !chrome.tabs.remove) {
    window.close();
    return;
  }

  chrome.tabs.getCurrent((tab) => {
    if (chrome.runtime.lastError || !tab || typeof tab.id !== "number") {
      window.close();
      return;
    }

    chrome.tabs.remove(tab.id);
  });
}

async function openSidePanel() {
  if (!globalThis.chrome || !chrome.sidePanel || !chrome.sidePanel.open) {
    throw new Error("Chrome side panel API unavailable");
  }

  const windowId = await getCurrentWindowId();
  await chrome.sidePanel.open({ windowId });
}

async function bootstrap() {
  const openBtn = document.getElementById("openBtn");
  const closeBtn = document.getElementById("closeBtn");

  if (!openBtn || !closeBtn) {
    return;
  }

  openBtn.addEventListener("click", async () => {
    openBtn.disabled = true;
    setStatus("Opening KindlyClick...");

    try {
      await openSidePanel();
      setStatus("KindlyClick is open in the side panel.");
    } catch (error) {
      setStatus(error.message || "Could not open KindlyClick.");
    } finally {
      openBtn.disabled = false;
    }
  });

  closeBtn.addEventListener("click", () => {
    closeCurrentTab().catch(() => {});
  });
}

bootstrap();
