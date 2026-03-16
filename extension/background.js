if (typeof importScripts === "function") {
  importScripts("src/runtimeProtocol.js");
  importScripts("src/runtimeCoordinator.js");
}

const MAX_RECENT_NAVIGATION_EVENTS = 5;
const NAVIGATION_EVENT_RETENTION_MS = 30_000;
const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";
const ONBOARDING_PAGE_PATH = "onboarding.html";
const OFFSCREEN_READY_TIMEOUT_MS = 12_000;
const OFFSCREEN_COMMAND_RETRY_DELAY_MS = 100;
const OFFSCREEN_COMMAND_RETRY_TIMEOUT_MS = 5_000;
const runtimeProtocol = globalThis.KindlyClickRuntimeProtocol;
const OFFSCREEN_RUNTIME_TARGET = runtimeProtocol.OFFSCREEN_RUNTIME_TARGET;

const recentNavigationEventsByTab = new Map();
let offscreenDocumentPromise = null;
let offscreenReadyWaiters = [];

const runtimeCoordinator = globalThis.KindlyClickRuntimeCoordinator.createRuntimeCoordinator();

async function enableOpenPanelOnActionClick() {
  if (!chrome.sidePanel || !chrome.sidePanel.setPanelBehavior) {
    return;
  }

  await chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  });
}

async function openOnboardingPage() {
  if (!chrome.tabs || !chrome.tabs.create) {
    return;
  }

  await chrome.tabs.create({
    url: chrome.runtime.getURL(ONBOARDING_PAGE_PATH),
    active: true
  });
}

enableOpenPanelOnActionClick().catch((error) => {
  console.warn("Failed to enable action-click side panel opening", error);
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log("KindlyClick background initialized");

  enableOpenPanelOnActionClick().catch((error) => {
    console.warn("Failed to enable action-click side panel opening", error);
  });

  if (details?.reason === "install") {
    openOnboardingPage().catch((error) => {
      console.warn("Failed to open KindlyClick onboarding page", error);
    });
  }
});

chrome.runtime.onStartup.addListener(() => {
  enableOpenPanelOnActionClick().catch((error) => {
    console.warn("Failed to enable action-click side panel opening", error);
  });
});

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs && tabs.length > 0 ? tabs[0] : null;
}

function isInjectableTabUrl(url) {
  const value = String(url || "").toLowerCase();
  return value.startsWith("http://") || value.startsWith("https://") || value.startsWith("file://");
}

async function safeBroadcast(message) {
  try {
    await chrome.runtime.sendMessage(message);
  } catch (_error) {
    // Ignore when no extension page is listening.
  }
}

function getCoordinatorSnapshot() {
  return runtimeCoordinator.getSnapshot();
}

async function appendRuntimeLog(text) {
  const line = runtimeCoordinator.appendRuntimeLog(text);
  await safeBroadcast({
    type: "kindlyclick:runtime-log-entry",
    line
  });
  return line;
}

async function broadcastRuntimeState() {
  const snapshot = getCoordinatorSnapshot();
  await safeBroadcast({
    type: "kindlyclick:runtime-state-updated",
    snapshot: snapshot.runtimeState
  });
}

async function broadcastVisionState() {
  const snapshot = getCoordinatorSnapshot();
  await safeBroadcast({
    type: "kindlyclick:runtime-vision-state-updated",
    visionState: snapshot.visionState
  });
}

function resolveOffscreenReadyWaiters(error = null) {
  const waiters = offscreenReadyWaiters.slice();
  offscreenReadyWaiters = [];

  waiters.forEach(({ resolve, reject, timerId }) => {
    clearTimeout(timerId);
    if (error) {
      reject(error);
      return;
    }

    resolve();
  });
}

function waitForOffscreenReady(timeoutMs = OFFSCREEN_READY_TIMEOUT_MS) {
  const snapshot = getCoordinatorSnapshot();
  if (snapshot.offscreenLifecycle.ready) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timerId = setTimeout(() => {
      offscreenReadyWaiters = offscreenReadyWaiters.filter((entry) => entry.timerId !== timerId);
      reject(new Error("Timed out waiting for offscreen runtime readiness"));
    }, timeoutMs);

    offscreenReadyWaiters.push({
      resolve,
      reject,
      timerId
    });
  });
}

async function recordOffscreenLifecycleEvent(event, data = {}, { log = false } = {}) {
  runtimeCoordinator.pushLifecycleEvent(event, data);
  if (log) {
    let text = `offscreen:${event}`;
    if (data.command) {
      text += ` command=${data.command}`;
    }
    if (data.error) {
      text += ` error=${data.error}`;
    }
    await appendRuntimeLog(text);
  }
}

async function hasOffscreenDocument() {
  if (!chrome.runtime.getContexts) {
    return false;
  }

  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
  });

  return contexts.length > 0;
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen || !chrome.offscreen.createDocument) {
    const error = new Error("chrome.offscreen is unavailable in this browser");
    await recordOffscreenLifecycleEvent("create_error", { error: error.message }, { log: true });
    throw error;
  }

  if (await hasOffscreenDocument()) {
    await recordOffscreenLifecycleEvent("create_skipped_existing");
    await waitForOffscreenReady().catch(async (error) => {
      await recordOffscreenLifecycleEvent(
        "ready_wait_timeout",
        { error: error.message || "offscreen runtime not yet ready" },
        { log: true }
      );
    });
    return;
  }

  if (!offscreenDocumentPromise) {
    await recordOffscreenLifecycleEvent("create_requested", {}, { log: true });
    offscreenDocumentPromise = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: ["USER_MEDIA", "DISPLAY_MEDIA", "AUDIO_PLAYBACK"],
        justification:
          "Keep the KindlyClick live runtime active when the side panel is closed."
      })
      .then(async () => {
        await recordOffscreenLifecycleEvent("create_completed", {}, { log: true });
      })
      .catch(async (error) => {
        await recordOffscreenLifecycleEvent(
          "create_error",
          { error: error.message || "offscreen document create failed" },
          { log: true }
        );
        resolveOffscreenReadyWaiters(error);
        throw error;
      })
      .finally(() => {
        offscreenDocumentPromise = null;
      });
  }

  await offscreenDocumentPromise;
  await waitForOffscreenReady().catch(async (error) => {
    await recordOffscreenLifecycleEvent(
      "ready_wait_timeout",
      { error: error.message || "offscreen runtime not yet ready" },
      { log: true }
    );
  });
}

async function sendOffscreenCommandWithRetry(payload, command) {
  const startedAt = Date.now();
  let retryCount = 0;

  while (Date.now() - startedAt < OFFSCREEN_COMMAND_RETRY_TIMEOUT_MS) {
    try {
      const response = await chrome.runtime.sendMessage(payload);
      return response || { ok: false, error: "No response from offscreen runtime" };
    } catch (error) {
      const errorText = String(error?.message || "");
      if (!errorText.includes("Receiving end does not exist")) {
        await recordOffscreenLifecycleEvent(
          "command_error",
          { command, error: errorText || "offscreen command failed" },
          { log: true }
        );
        throw error;
      }

      retryCount += 1;
      await recordOffscreenLifecycleEvent(
        "command_retry",
        { command, retryCount },
        { log: true }
      );
      await new Promise((resolve) => setTimeout(resolve, OFFSCREEN_COMMAND_RETRY_DELAY_MS));
    }
  }

  const timeoutError = new Error("Offscreen runtime did not become reachable in time");
  await recordOffscreenLifecycleEvent(
    "command_error",
    { command, error: timeoutError.message },
    { log: true }
  );
  throw timeoutError;
}

async function forwardRuntimeCommand(message) {
  await ensureOffscreenDocument();
  await recordOffscreenLifecycleEvent(
    "command_dispatch",
    { command: message.command || "" },
    { log: false }
  );

  const payload = {
    type: "kindlyclick:offscreen-command",
    target: OFFSCREEN_RUNTIME_TARGET,
    command: message.command || "",
    wsUrl: message.wsUrl || "",
    deviceId: message.deviceId || "",
    enabled: message.enabled,
    logRelayEnabled: message.logRelayEnabled
  };

  return sendOffscreenCommandWithRetry(payload, message.command || "");
}

function normalizeText(value, maxLength = 80) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }

  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function sanitizeUrlSummary(rawUrl) {
  if (!rawUrl) {
    return "";
  }

  try {
    const parsed = new URL(String(rawUrl));
    if (!isInjectableTabUrl(parsed.href)) {
      return "";
    }

    const segments = parsed.pathname
      .split("/")
      .filter(Boolean)
      .slice(0, 3)
      .map((segment) => {
        const normalized = decodeURIComponent(segment);
        if (/^\d{4,}$/.test(normalized) || /^[a-f0-9-]{8,}$/i.test(normalized)) {
          return ":id";
        }
        return normalizeText(normalized, 24);
      })
      .filter(Boolean);

    const pathSummary = segments.length > 0 ? `/${segments.join("/")}` : "/";
    return `${parsed.origin}${pathSummary}`;
  } catch (_error) {
    return "";
  }
}

function getRecentNavigationEvents(tabId) {
  const events = recentNavigationEventsByTab.get(tabId) || [];
  const cutoffTs = Date.now() - NAVIGATION_EVENT_RETENTION_MS;
  const freshEvents = events.filter((event) => Number(event.ts) >= cutoffTs);

  if (freshEvents.length !== events.length) {
    if (freshEvents.length > 0) {
      recentNavigationEventsByTab.set(tabId, freshEvents);
    } else {
      recentNavigationEventsByTab.delete(tabId);
    }
  }

  return freshEvents;
}

function pushRecentNavigationEvent(tabId, event) {
  if (!Number.isInteger(tabId) || tabId < 0 || !event) {
    return;
  }

  const nextEvent = {
    kind: "navigation",
    phase: String(event.phase || "").trim().toLowerCase(),
    urlSummary: normalizeText(event.urlSummary || "", 120),
    title: normalizeText(event.title || "", 80),
    ts: Number(event.ts) || Date.now()
  };

  if (!nextEvent.phase || !nextEvent.urlSummary) {
    return;
  }

  const recentEvents = getRecentNavigationEvents(tabId);
  const lastEvent = recentEvents.length > 0 ? recentEvents[recentEvents.length - 1] : null;
  const isDuplicate =
    lastEvent &&
    lastEvent.phase === nextEvent.phase &&
    lastEvent.urlSummary === nextEvent.urlSummary &&
    lastEvent.title === nextEvent.title &&
    nextEvent.ts - Number(lastEvent.ts || 0) < 1500;

  if (isDuplicate) {
    return;
  }

  const nextEvents = recentEvents.concat([nextEvent]).slice(-MAX_RECENT_NAVIGATION_EVENTS);
  recentNavigationEventsByTab.set(tabId, nextEvents);
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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const urlSummary = sanitizeUrlSummary(changeInfo.url || changeInfo.pendingUrl || tab?.url || "");
  const title = tab?.title || "";

  if (changeInfo.url || changeInfo.pendingUrl) {
    pushRecentNavigationEvent(tabId, {
      phase: "committed",
      urlSummary,
      title,
      ts: Date.now()
    });
  }

  if (changeInfo.status === "complete") {
    pushRecentNavigationEvent(tabId, {
      phase: "completed",
      urlSummary: sanitizeUrlSummary(tab?.url || ""),
      title,
      ts: Date.now()
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  recentNavigationEventsByTab.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (!message || typeof message.type !== "string") {
      return;
    }

    if (message.type === "kindlyclick:get-runtime-state") {
      const snapshot = getCoordinatorSnapshot();
      sendResponse({
        ok: true,
        runtimeState: snapshot.runtimeState,
        visionState: snapshot.visionState,
        logs: snapshot.logs,
        offscreenLifecycle: snapshot.offscreenLifecycle,
        lifecycleEvents: snapshot.lifecycleEvents
      });
      return;
    }

    if (message.type === "kindlyclick:runtime-command") {
      const parsed = runtimeProtocol.parseRuntimeCommandRequest(message);
      if (!parsed.ok) {
        sendResponse({ ok: false, error: parsed.error });
        return;
      }

      const response = await forwardRuntimeCommand(parsed.value);
      sendResponse(response);
      return;
    }

    if (message.type === "kindlyclick:runtime-state-update") {
      const parsed = runtimeProtocol.parseRuntimeStateUpdateMessage(message);
      if (!parsed.ok) {
        sendResponse({ ok: false, error: parsed.error });
        return;
      }

      runtimeCoordinator.setRuntimeState(parsed.value);
      await broadcastRuntimeState();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "kindlyclick:runtime-vision-state-update") {
      const parsed = runtimeProtocol.parseRuntimeVisionStateUpdateMessage(message);
      if (!parsed.ok) {
        sendResponse({ ok: false, error: parsed.error });
        return;
      }

      runtimeCoordinator.setVisionState(parsed.value);
      await broadcastVisionState();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "kindlyclick:runtime-log") {
      const parsed = runtimeProtocol.parseRuntimeLogMessage(message);
      if (!parsed.ok) {
        sendResponse({ ok: false, error: parsed.error });
        return;
      }

      await appendRuntimeLog(parsed.value.text);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "kindlyclick:offscreen-lifecycle") {
      const parsed = runtimeProtocol.parseOffscreenLifecycleMessage(message);
      if (!parsed.ok) {
        sendResponse({ ok: false, error: parsed.error });
        return;
      }

      const eventName = parsed.value.event;
      await recordOffscreenLifecycleEvent(eventName, parsed.value.data, { log: true });
      if (eventName === "booted") {
        resolveOffscreenReadyWaiters();
      }
      if (eventName === "pagehide" || eventName === "unloaded") {
        resolveOffscreenReadyWaiters(new Error("Offscreen runtime became unavailable"));
      }
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "kindlyclick:get-active-tab-context") {
      const activeTab = await getActiveTab();
      sendResponse({
        ok: true,
        pageTitle: activeTab?.title || "",
        pageUrl: activeTab?.url || "",
        tabId: activeTab?.id || null,
        recentNavigationEvents:
          activeTab?.id || activeTab?.id === 0 ? getRecentNavigationEvents(activeTab.id) : []
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
      await safeBroadcast({
        type: "kindlyclick:mic-permission-granted-broadcast",
        usedFallbackDevice: Boolean(message.usedFallbackDevice)
      });
      sendResponse({ ok: true });
      return;
    }
  })().catch((error) => {
    sendResponse({ ok: false, error: error.message || "Unhandled background error" });
  });

  return true;
});
