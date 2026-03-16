const MIC_SELECTION_STORAGE_KEY = "kindlyclick:selectedMicDeviceId";
const LOG_RELAY_STORAGE_KEY = "kindlyclick:logRelayEnabled";
const WS_URL_STORAGE_KEY = "kindlyclick:wsUrl";
const VISION_CAPTURE_WIDTH = 1280;
const VISION_CAPTURE_HEIGHT = 720;
const VISION_JPEG_QUALITY = 0.6;
const HELP_START_TIMEOUT_MS = 20_000;
const HELP_CAPTURE_TIMEOUT_MS = 90_000;
const HELP_STOP_TIMEOUT_MS = 15_000;
const runtimeProtocol = window.KindlyClickRuntimeProtocol;

function createDefaultRuntimeState() {
  return runtimeProtocol.normalizeRuntimeStateSnapshot();
}

function createDefaultVisionState() {
  return runtimeProtocol.normalizeVisionStateSnapshot();
}

function createUi() {
  return {
    helpTabBtn: document.getElementById("helpTabBtn"),
    advancedTabBtn: document.getElementById("advancedTabBtn"),
    helpView: document.getElementById("helpView"),
    advancedView: document.getElementById("advancedView"),
    helpActionBtn: document.getElementById("helpActionBtn"),
    helpDescription: document.getElementById("helpDescription"),
    helpProgress: document.getElementById("helpProgress"),
    helpProgressLabel: document.getElementById("helpProgressLabel"),
    helpProgressBar: document.getElementById("helpProgressBar"),
    helpStepConnect: document.getElementById("helpStepConnect"),
    helpStepMic: document.getElementById("helpStepMic"),
    helpStepVision: document.getElementById("helpStepVision"),
    wsUrl: document.getElementById("wsUrl"),
    connectBtn: document.getElementById("connectBtn"),
    disconnectBtn: document.getElementById("disconnectBtn"),
    micSelect: document.getElementById("micSelect"),
    refreshMicBtn: document.getElementById("refreshMicBtn"),
    startMicBtn: document.getElementById("startMicBtn"),
    endTurnBtn: document.getElementById("endTurnBtn"),
    stopMicBtn: document.getElementById("stopMicBtn"),
    startVisionBtn: document.getElementById("startVisionBtn"),
    stopVisionBtn: document.getElementById("stopVisionBtn"),
    askVisionBtn: document.getElementById("askVisionBtn"),
    toggleLogRelayBtn: document.getElementById("toggleLogRelayBtn"),
    status: document.getElementById("status"),
    guidance: document.getElementById("guidance"),
    sessionMeta: document.getElementById("sessionMeta"),
    connectionPill: document.getElementById("connectionPill"),
    sessionPill: document.getElementById("sessionPill"),
    micPill: document.getElementById("micPill"),
    visionPill: document.getElementById("visionPill"),
    relayPill: document.getElementById("relayPill"),
    micInfo: document.getElementById("micInfo"),
    visionInfo: document.getElementById("visionInfo"),
    logSummary: document.getElementById("logSummary"),
    log: document.getElementById("log")
  };
}

function setToneText(element, label, tone = "idle") {
  if (!element) {
    return;
  }

  element.textContent = label;
  element.dataset.tone = tone;
}

function getRuntimeTone(state) {
  if (state.status === "disconnected") {
    return "danger";
  }

  if (state.connected && state.sessionReady) {
    return "live";
  }

  if (state.connected || state.connecting) {
    return "warming";
  }

  return "idle";
}

function formatMicInfo(micInfo) {
  if (!micInfo || micInfo.state === "not_requested") {
    return "Mic access has not been requested yet.";
  }

  const name = micInfo.label || "Unknown microphone";
  const state = micInfo.state || "unknown";
  const deviceId = micInfo.deviceId ? micInfo.deviceId : "system default";
  const sampleRate = micInfo.sampleRate ? `${micInfo.sampleRate} Hz` : "sample rate unknown";
  const channelCount = micInfo.channelCount
    ? `${micInfo.channelCount} channel`
    : "channel count unknown";
  return `${name} is ${state}. Device ${deviceId}. ${sampleRate}, ${channelCount}.`;
}

function formatVisionInfo(visionState) {
  if (!visionState || !visionState.active) {
    return "Vision is idle. Start screen sharing when you want grounded page guidance.";
  }

  return `Vision is live at ${VISION_CAPTURE_WIDTH}x${VISION_CAPTURE_HEIGHT} JPEG q=${VISION_JPEG_QUALITY}, 1 FPS. Frames sent: ${visionState.frameCount}.`;
}

function summarizeSessionMeta(state, visionState) {
  if (state.connected && state.sessionReady && state.micActive && visionState.active) {
    return "AI help is on.";
  }

  if (state.connected || state.connecting || state.micActive || visionState.active) {
    return "AI help is getting ready.";
  }

  return "AI help is off.";
}

function summarizeGuidance(state, visionState) {
  if (state.connected && state.sessionReady && state.micActive && visionState.active) {
    return "AI help is ready to listen and guide you.";
  }

  if (state.connected || state.connecting || state.micActive || visionState.active) {
    return "We are getting AI help ready for you.";
  }

  return "Press once to start AI help for the page you are on.";
}

function getConnectionSummary(state) {
  if (state.connecting) {
    return { label: "Connecting", tone: "warming" };
  }

  if (state.connected) {
    return { label: "Online", tone: "live" };
  }

  if (state.status === "disconnected") {
    return { label: "Dropped", tone: "danger" };
  }

  return { label: "Offline", tone: "idle" };
}

function getSessionSummary(state) {
  if (state.sessionReady) {
    return { label: "Ready", tone: "live" };
  }

  if (state.connected || state.connecting) {
    return { label: "Negotiating", tone: "warming" };
  }

  return { label: "Waiting", tone: "idle" };
}

function getMicSummary(state) {
  if (state.micActive) {
    return { label: "Listening", tone: "live" };
  }

  if (state.micStarting) {
    return { label: "Starting", tone: "warming" };
  }

  if (state.hasGrantedMicStream || state.micInfo.state === "ready") {
    return { label: "Armed", tone: "warming" };
  }

  return { label: "Not armed", tone: "idle" };
}

function getVisionSummary(runtimeState, visionState) {
  if (visionState.active) {
    return { label: `Streaming ${visionState.frameCount}`, tone: "live" };
  }

  if (runtimeState.connected && runtimeState.sessionReady) {
    return { label: "Ready", tone: "warming" };
  }

  return { label: "Idle", tone: "idle" };
}

function getRelaySummary(enabled) {
  return enabled
    ? { label: "Forwarding", tone: "warming" }
    : { label: "Local only", tone: "idle" };
}

function isHelpOperational(runtimeState, visionState) {
  return (
    runtimeState.connected &&
    runtimeState.sessionReady &&
    runtimeState.micActive &&
    visionState.active
  );
}

function isHelpPartiallyActive(runtimeState, visionState) {
  return (
    runtimeState.connected ||
    runtimeState.connecting ||
    runtimeState.sessionReady ||
    runtimeState.micActive ||
    runtimeState.micStarting ||
    visionState.active
  );
}

function setHelpStepState(element, state) {
  if (!element) {
    return;
  }

  element.dataset.state = state;
}

function getHelpProgressSnapshot(runtimeState, visionState, helpActionInFlight, helpActionMode) {
  const operational = isHelpOperational(runtimeState, visionState);
  const partial = isHelpPartiallyActive(runtimeState, visionState);

  if (!helpActionInFlight && !partial && !operational) {
    return {
      visible: true,
      label: "Nothing is running yet.",
      progressPercent: 0,
      animateBar: false,
      stepStates: {
        connect: "pending",
        mic: "pending",
        vision: "pending"
      }
    };
  }

  if (helpActionInFlight && helpActionMode === "stop") {
    return {
      visible: true,
      label: "Closing AI help...",
      progressPercent: 100,
      animateBar: true,
      stepStates: {
        connect: "waiting",
        mic: "waiting",
        vision: "waiting"
      }
    };
  }

  const connectComplete = runtimeState.connected && runtimeState.sessionReady;
  const micComplete = runtimeState.micActive;
  const visionComplete = visionState.active;

  const connectActive =
    !connectComplete && (runtimeState.connecting || (helpActionInFlight && helpActionMode === "start"));
  const micActive =
    !micComplete &&
    connectComplete &&
    (runtimeState.micStarting || (helpActionInFlight && helpActionMode === "start"));
  const visionActive =
    !visionComplete &&
    connectComplete &&
    micComplete &&
    (helpActionInFlight || partial || operational);

  const completedCount =
    (connectComplete ? 1 : 0) + (micComplete ? 1 : 0) + (visionComplete ? 1 : 0);
  const activeCount = connectActive || micActive || visionActive ? 1 : 0;
  const progressPercent = Math.min(
    100,
    Math.round(((completedCount + activeCount * 0.55) / 3) * 100)
  );

  let label = "Getting things ready...";
  if (operational) {
    label = "AI help is ready.";
  } else if (visionActive || visionComplete) {
    label = "Starting screen view...";
  } else if (micActive || micComplete) {
    label = "Turning on listening...";
  } else if (connectActive || connectComplete) {
    label = "Getting the helper ready...";
  } else if (partial) {
    label = "Almost ready...";
  }

  return {
    visible: true,
    label,
    progressPercent,
    animateBar: helpActionInFlight && !operational,
    stepStates: {
      connect: connectComplete ? "complete" : connectActive ? "active" : partial ? "waiting" : "pending",
      mic: micComplete ? "complete" : micActive ? "active" : connectComplete ? "waiting" : "pending",
      vision: visionComplete
        ? "complete"
        : visionActive
          ? "active"
          : micComplete
            ? "waiting"
            : "pending"
    }
  };
}

function replaceLogHistory(ui, lines) {
  ui.log.textContent = Array.isArray(lines) ? lines.join("\n") : "";
  syncLogSummary(ui);
}

function syncLogSummary(ui) {
  const lines = String(ui.log.textContent || "")
    .split("\n")
    .filter(Boolean);

  ui.log.dataset.empty = lines.length === 0 ? "true" : "false";
  if (lines.length === 0) {
    ui.logSummary.textContent = "Waiting for runtime activity.";
    return;
  }

  ui.logSummary.textContent = `${lines.length} recent event${lines.length === 1 ? "" : "s"} captured.`;
}

function prependLogLine(ui, line) {
  const existingLines = String(ui.log.textContent || "")
    .split("\n")
    .filter(Boolean);
  ui.log.textContent = [line].concat(existingLines).slice(0, 60).join("\n");
  syncLogSummary(ui);
}

function loadSelectedMicDeviceId() {
  try {
    return localStorage.getItem(MIC_SELECTION_STORAGE_KEY) || "";
  } catch (_error) {
    return "";
  }
}

function saveSelectedMicDeviceId(deviceId) {
  try {
    if (!deviceId) {
      localStorage.removeItem(MIC_SELECTION_STORAGE_KEY);
      return;
    }

    localStorage.setItem(MIC_SELECTION_STORAGE_KEY, deviceId);
  } catch (_error) {
    // Ignore persistence failures.
  }
}

function loadLogRelayEnabled() {
  try {
    return localStorage.getItem(LOG_RELAY_STORAGE_KEY) === "true";
  } catch (_error) {
    return false;
  }
}

function saveLogRelayEnabled(enabled) {
  try {
    localStorage.setItem(LOG_RELAY_STORAGE_KEY, enabled ? "true" : "false");
  } catch (_error) {
    // Ignore persistence failures.
  }
}

function loadWsUrl(defaultValue = "") {
  try {
    return localStorage.getItem(WS_URL_STORAGE_KEY) || defaultValue;
  } catch (_error) {
    return defaultValue;
  }
}

function saveWsUrl(wsUrl) {
  try {
    const normalizedValue = String(wsUrl || "").trim();
    if (!normalizedValue) {
      localStorage.removeItem(WS_URL_STORAGE_KEY);
      return;
    }

    localStorage.setItem(WS_URL_STORAGE_KEY, normalizedValue);
  } catch (_error) {
    // Ignore persistence failures.
  }
}

async function listAudioInputDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === "audioinput");
}

function renderMicOptions(ui, devices, selectedDeviceId) {
  ui.micSelect.textContent = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "System Default";
  ui.micSelect.appendChild(defaultOption);

  devices.forEach((device, index) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label || `Microphone ${index + 1}`;
    ui.micSelect.appendChild(option);
  });

  const selectedExists =
    !selectedDeviceId || devices.some((device) => device.deviceId === selectedDeviceId);
  ui.micSelect.value = selectedExists ? selectedDeviceId : "";
}

async function sendRuntimeCommand(command, payload = {}) {
  if (!globalThis.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
    return {
      ok: false,
      error: "chrome.runtime.sendMessage unavailable"
    };
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "kindlyclick:runtime-command",
      command,
      ...payload
    });
    return response || { ok: false, error: "No response from background" };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Failed to send runtime command"
    };
  }
}

async function getRuntimeState() {
  if (!globalThis.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
    return {
      ok: false,
      runtimeState: createDefaultRuntimeState(),
      visionState: createDefaultVisionState(),
      logs: []
    };
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "kindlyclick:get-runtime-state"
    });
    return (
      response || {
        ok: false,
        runtimeState: createDefaultRuntimeState(),
        visionState: createDefaultVisionState(),
        logs: []
      }
    );
  } catch (_error) {
    return {
      ok: false,
      runtimeState: createDefaultRuntimeState(),
      visionState: createDefaultVisionState(),
      logs: []
    };
  }
}

(function bootstrap() {
  const ui = createUi();
  ui.wsUrl.value = loadWsUrl(ui.wsUrl.value);
  let selectedMicDeviceId = loadSelectedMicDeviceId();
  let logRelayEnabled = loadLogRelayEnabled();
  let runtimeState = createDefaultRuntimeState();
  let visionState = createDefaultVisionState();
  let activeView = "help";
  let helpActionInFlight = false;
  let helpActionMode = "start";
  let helpMessageOverride = "";
  let runtimeWaiters = [];

  function resolveRuntimeWaiters() {
    const nextWaiters = [];

    runtimeWaiters.forEach((waiter) => {
      if (waiter.predicate(runtimeState, visionState)) {
        clearTimeout(waiter.timerId);
        waiter.resolve();
        return;
      }

      nextWaiters.push(waiter);
    });

    runtimeWaiters = nextWaiters;
  }

  function waitForRuntimeCondition(predicate, timeoutMs, errorMessage) {
    if (predicate(runtimeState, visionState)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const timerId = setTimeout(() => {
        runtimeWaiters = runtimeWaiters.filter((entry) => entry.timerId !== timerId);
        reject(new Error(errorMessage));
      }, timeoutMs);

      runtimeWaiters.push({
        predicate,
        resolve,
        timerId
      });
    });
  }

  function setActiveView(view) {
    activeView = view === "advanced" ? "advanced" : "help";
    ui.helpView.hidden = activeView !== "help";
    ui.advancedView.hidden = activeView !== "advanced";
    ui.helpTabBtn.setAttribute("aria-pressed", activeView === "help" ? "true" : "false");
    ui.advancedTabBtn.setAttribute("aria-pressed", activeView === "advanced" ? "true" : "false");
  }

  function updateLogRelayUi() {
    if (!ui.toggleLogRelayBtn) {
      return;
    }

    ui.toggleLogRelayBtn.textContent = logRelayEnabled
      ? "Relay logs to backend: on"
      : "Relay logs to backend: off";
  }

  function renderAdvancedState() {
    setToneText(
      ui.connectionPill,
      getConnectionSummary(runtimeState).label,
      getConnectionSummary(runtimeState).tone
    );
    setToneText(
      ui.sessionPill,
      getSessionSummary(runtimeState).label,
      getSessionSummary(runtimeState).tone
    );
    setToneText(ui.micPill, getMicSummary(runtimeState).label, getMicSummary(runtimeState).tone);
    setToneText(
      ui.visionPill,
      getVisionSummary(runtimeState, visionState).label,
      getVisionSummary(runtimeState, visionState).tone
    );
    setToneText(ui.relayPill, getRelaySummary(logRelayEnabled).label, getRelaySummary(logRelayEnabled).tone);

    ui.micInfo.textContent = formatMicInfo(runtimeState.micInfo);
    ui.visionInfo.textContent = formatVisionInfo(visionState);

    ui.connectBtn.disabled = runtimeState.connected || runtimeState.connecting;
    ui.connectBtn.textContent = runtimeState.connecting
      ? "Connecting runtime..."
      : "Connect runtime";
    ui.disconnectBtn.disabled = !runtimeState.connected && !runtimeState.connecting;
    ui.disconnectBtn.textContent = runtimeState.connecting
      ? "Stop connect attempt"
      : "Disconnect";

    ui.startMicBtn.disabled =
      !runtimeState.connected ||
      !runtimeState.sessionReady ||
      runtimeState.micActive ||
      runtimeState.micStarting;
    ui.startMicBtn.textContent = runtimeState.micStarting ? "Starting mic..." : "Start mic";
    ui.endTurnBtn.disabled = !runtimeState.micActive;
    ui.stopMicBtn.disabled = !runtimeState.micActive;

    ui.startVisionBtn.disabled =
      visionState.active || !runtimeState.connected || !runtimeState.sessionReady;
    ui.stopVisionBtn.disabled = !visionState.active;
    ui.askVisionBtn.disabled = !runtimeState.connected || !runtimeState.sessionReady;
    ui.askVisionBtn.textContent = visionState.active ? "Ask what it sees now" : "Ask what it sees";
  }

  function renderHelpState() {
    const operational = isHelpOperational(runtimeState, visionState);
    const partial = isHelpPartiallyActive(runtimeState, visionState);
    const idleState = !operational && !partial && !helpActionInFlight;
    const statusLabel = operational
      ? "Helping"
      : runtimeState.connecting || helpActionInFlight
        ? "Starting"
        : "Idle";

    setToneText(ui.status, statusLabel, idleState ? "idle" : getRuntimeTone(runtimeState));
    ui.guidance.textContent = summarizeGuidance(runtimeState, visionState);
    ui.sessionMeta.textContent = summarizeSessionMeta(runtimeState, visionState);

    let buttonLabel = operational ? "Stop AI help" : "Call for help";
    let buttonMode = operational ? "stop" : "start";
    let description = helpMessageOverride;

    if (!description) {
      if (helpActionInFlight && helpActionMode === "start") {
        buttonLabel = "Starting AI help";
        description =
          "You may be asked to allow the microphone and choose the screen you want help with.";
      } else if (helpActionInFlight && helpActionMode === "stop") {
        buttonLabel = "Stopping AI help";
        description = "KindlyClick is closing the help session now.";
      } else if (operational) {
        description =
          "KindlyClick is listening, watching the page you shared, and talking you through the next step. Press again to stop.";
      } else if (partial) {
        description =
          "AI help has started but still needs a few things to finish. If you were asked to allow the microphone or choose a screen, finish that first.";
      } else {
        description =
          "KindlyClick will listen to you, look at the page you choose, and talk you through what to do next.";
      }
    }

    ui.helpActionBtn.textContent = buttonLabel;
    ui.helpActionBtn.dataset.mode = buttonMode;
    ui.helpActionBtn.disabled = helpActionInFlight;
    ui.helpActionBtn.classList.toggle("is-pulsing", !helpActionInFlight && buttonMode === "start");
    ui.helpDescription.textContent = description;

    const progress = getHelpProgressSnapshot(
      runtimeState,
      visionState,
      helpActionInFlight,
      helpActionMode
    );
    ui.helpProgress.hidden = !progress.visible;
    if (progress.visible) {
      ui.helpProgressLabel.textContent = progress.label;
      ui.helpProgressBar.style.width = `${progress.progressPercent}%`;
      ui.helpProgressBar.classList.toggle("is-animating", progress.animateBar);
      setHelpStepState(ui.helpStepConnect, progress.stepStates.connect);
      setHelpStepState(ui.helpStepMic, progress.stepStates.mic);
      setHelpStepState(ui.helpStepVision, progress.stepStates.vision);
    }
  }

  function updateUi() {
    renderHelpState();
    renderAdvancedState();
    updateLogRelayUi();
    resolveRuntimeWaiters();
  }

  async function runRuntimeCommand(command, payload = {}) {
    const response = await sendRuntimeCommand(command, payload);
    if (!response.ok) {
      prependLogLine(
        ui,
        `${command} error: ${response.error || "unknown runtime command error"}`
      );
    }
    return response;
  }

  async function ensureConnected() {
    if (runtimeState.connected && runtimeState.sessionReady) {
      return;
    }

    const response = await runRuntimeCommand("connect", {
      wsUrl: ui.wsUrl.value,
      logRelayEnabled
    });

    if (!response.ok) {
      throw new Error(response.error || "Could not start AI help.");
    }

    await waitForRuntimeCondition(
      (nextRuntimeState) => nextRuntimeState.connected && nextRuntimeState.sessionReady,
      HELP_START_TIMEOUT_MS,
      "AI help took too long to connect. Please try again."
    );
  }

  async function ensureMicrophoneStarted() {
    if (runtimeState.micActive) {
      return;
    }

    const response = await runRuntimeCommand("start-mic", {
      deviceId: selectedMicDeviceId || ""
    });

    if (!response.ok) {
      throw new Error(response.error || "Could not start the microphone.");
    }

    await waitForRuntimeCondition(
      (nextRuntimeState) => nextRuntimeState.micActive,
      HELP_CAPTURE_TIMEOUT_MS,
      "The microphone did not start in time. Please allow microphone access and try again."
    );
  }

  async function ensureVisionStarted() {
    if (visionState.active) {
      return;
    }

    const response = await runRuntimeCommand("start-vision");
    if (!response.ok) {
      throw new Error(response.error || "Could not start screen sharing.");
    }

    await waitForRuntimeCondition(
      (_nextRuntimeState, nextVisionState) => nextVisionState.active,
      HELP_CAPTURE_TIMEOUT_MS,
      "Screen sharing did not start in time. Please choose a screen and try again."
    );
  }

  async function stopAiHelp() {
    if (visionState.active) {
      await runRuntimeCommand("stop-vision");
      await waitForRuntimeCondition(
        (_nextRuntimeState, nextVisionState) => !nextVisionState.active,
        HELP_STOP_TIMEOUT_MS,
        "Screen sharing took too long to stop."
      );
    }

    if (runtimeState.micActive) {
      await runRuntimeCommand("stop-mic");
      await waitForRuntimeCondition(
        (nextRuntimeState) => !nextRuntimeState.micActive,
        HELP_STOP_TIMEOUT_MS,
        "The microphone took too long to stop."
      );
    }

    if (runtimeState.connected || runtimeState.connecting || runtimeState.sessionReady) {
      await runRuntimeCommand("disconnect");
      await waitForRuntimeCondition(
        (nextRuntimeState) =>
          !nextRuntimeState.connected &&
          !nextRuntimeState.connecting &&
          !nextRuntimeState.sessionReady,
        HELP_STOP_TIMEOUT_MS,
        "AI help took too long to disconnect."
      );
    }
  }

  async function handleHelpAction() {
    if (helpActionInFlight) {
      return;
    }

    helpActionInFlight = true;
    helpActionMode = isHelpOperational(runtimeState, visionState) ? "stop" : "start";
    helpMessageOverride = "";
    updateUi();

    try {
      if (helpActionMode === "stop") {
        await stopAiHelp();
      } else {
        await ensureConnected();
        await ensureMicrophoneStarted();
        await ensureVisionStarted();
      }
    } catch (error) {
      helpMessageOverride = error.message || "Something got in the way. Please try again.";
      prependLogLine(ui, `help action error: ${helpMessageOverride}`);
    } finally {
      helpActionInFlight = false;
      helpActionMode = "start";
      updateUi();
    }
  }

  async function refreshMicDevices(logLabel = null) {
    const devices = await listAudioInputDevices();
    renderMicOptions(ui, devices, selectedMicDeviceId);
    selectedMicDeviceId = ui.micSelect.value || "";
    saveSelectedMicDeviceId(selectedMicDeviceId);

    if (logLabel) {
      prependLogLine(
        ui,
        `${logLabel}: ${devices.length} microphone${devices.length === 1 ? "" : "s"} found`
      );
    }
  }

  function applyRuntimeSnapshot(nextRuntimeState, nextVisionState, logs) {
    runtimeState = runtimeProtocol.normalizeRuntimeStateSnapshot(nextRuntimeState);
    visionState = runtimeProtocol.normalizeVisionStateSnapshot(nextVisionState);

    if (runtimeState.activeWsUrl && ui.wsUrl) {
      ui.wsUrl.value = runtimeState.activeWsUrl;
      saveWsUrl(ui.wsUrl.value);
    }

    if (typeof runtimeState.clientLogForwardingEnabled === "boolean") {
      logRelayEnabled = runtimeState.clientLogForwardingEnabled;
      saveLogRelayEnabled(logRelayEnabled);
    }

    if (Array.isArray(logs)) {
      replaceLogHistory(ui, logs);
    }

    if (isHelpOperational(runtimeState, visionState)) {
      helpMessageOverride = "";
    }

    updateUi();
  }

  ui.helpTabBtn.addEventListener("click", () => {
    setActiveView("help");
  });

  ui.advancedTabBtn.addEventListener("click", () => {
    setActiveView("advanced");
  });

  ui.helpActionBtn.addEventListener("click", () => {
    saveWsUrl(ui.wsUrl.value);
    handleHelpAction().catch((error) => {
      prependLogLine(ui, `help action crash: ${error.message}`);
    });
  });

  ui.connectBtn.addEventListener("click", () => {
    helpMessageOverride = "";
    saveWsUrl(ui.wsUrl.value);
    runRuntimeCommand("connect", {
      wsUrl: ui.wsUrl.value,
      logRelayEnabled
    });
  });

  ui.wsUrl.addEventListener("change", () => {
    saveWsUrl(ui.wsUrl.value);
  });

  ui.disconnectBtn.addEventListener("click", () => {
    helpMessageOverride = "";
    runRuntimeCommand("disconnect");
  });

  ui.micSelect.addEventListener("change", () => {
    selectedMicDeviceId = ui.micSelect.value || "";
    saveSelectedMicDeviceId(selectedMicDeviceId);
    prependLogLine(
      ui,
      selectedMicDeviceId ? `mic selected: ${selectedMicDeviceId}` : "mic selected: System Default"
    );
  });

  ui.refreshMicBtn.addEventListener("click", () => {
    refreshMicDevices("mic refresh").catch((error) => {
      prependLogLine(ui, `mic refresh error: ${error.message}`);
    });
  });

  ui.startMicBtn.addEventListener("click", () => {
    helpMessageOverride = "";
    runRuntimeCommand("start-mic", {
      deviceId: selectedMicDeviceId || ""
    });
  });

  ui.endTurnBtn.addEventListener("click", () => {
    runRuntimeCommand("end-turn");
  });

  ui.stopMicBtn.addEventListener("click", () => {
    runRuntimeCommand("stop-mic");
  });

  ui.startVisionBtn.addEventListener("click", () => {
    helpMessageOverride = "";
    runRuntimeCommand("start-vision");
  });

  ui.stopVisionBtn.addEventListener("click", () => {
    runRuntimeCommand("stop-vision");
  });

  ui.askVisionBtn.addEventListener("click", () => {
    runRuntimeCommand("ask-vision");
  });

  ui.toggleLogRelayBtn.addEventListener("click", () => {
    logRelayEnabled = !logRelayEnabled;
    saveLogRelayEnabled(logRelayEnabled);
    updateUi();
    if (
      runtimeState.connected ||
      runtimeState.connecting ||
      runtimeState.sessionReady ||
      runtimeState.activeWsUrl ||
      runtimeState.sessionId
    ) {
      runRuntimeCommand("set-log-relay", {
        enabled: logRelayEnabled
      });
    }
  });

  if (globalThis.chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || typeof message.type !== "string") {
        return;
      }

      if (message.type === "kindlyclick:runtime-state-updated") {
        const parsed = runtimeProtocol.parseRuntimeStateBroadcastMessage(message);
        if (!parsed.ok) {
          prependLogLine(ui, `runtime state message ignored: ${parsed.error}`);
          return;
        }

        runtimeState = parsed.value;
        updateUi();
        return;
      }

      if (message.type === "kindlyclick:runtime-vision-state-updated") {
        const parsed = runtimeProtocol.parseRuntimeVisionStateBroadcastMessage(message);
        if (!parsed.ok) {
          prependLogLine(ui, `vision state message ignored: ${parsed.error}`);
          return;
        }

        visionState = parsed.value;
        updateUi();
        return;
      }

      if (message.type === "kindlyclick:runtime-log-entry") {
        const parsed = runtimeProtocol.parseRuntimeLogEntryBroadcastMessage(message);
        if (!parsed.ok) {
          prependLogLine(ui, `runtime log message ignored: ${parsed.error}`);
          return;
        }

        prependLogLine(ui, parsed.value.line);
      }
    });
  }

  getRuntimeState()
    .then((response) => {
      applyRuntimeSnapshot(response.runtimeState, response.visionState, response.logs);
    })
    .catch(() => {
      applyRuntimeSnapshot(createDefaultRuntimeState(), createDefaultVisionState(), []);
    });

  refreshMicDevices().catch((error) => {
    prependLogLine(ui, `initial mic list error: ${error.message}`);
  });

  replaceLogHistory(ui, []);
  setActiveView(activeView);
  updateUi();
})();
