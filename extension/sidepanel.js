const MIC_SELECTION_STORAGE_KEY = "kindlyclick:selectedMicDeviceId";
const LOG_RELAY_STORAGE_KEY = "kindlyclick:logRelayEnabled";
const VISION_CAPTURE_WIDTH = 1280;
const VISION_CAPTURE_HEIGHT = 720;
const VISION_JPEG_QUALITY = 0.6;

function createDefaultRuntimeState() {
  return {
    status: "idle",
    connected: false,
    connecting: false,
    sessionReady: false,
    micActive: false,
    micStarting: false,
    hasGrantedMicStream: false,
    micInfo: {
      state: "not_requested",
      label: "Unknown microphone",
      deviceId: "",
      groupId: "",
      sampleRate: null,
      channelCount: null
    },
    activeWsUrl: "",
    sessionId: null,
    clientLogForwardingEnabled: false
  };
}

function createDefaultVisionState() {
  return {
    active: false,
    frameCount: 0
  };
}

function createUi() {
  return {
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
    micInfo: document.getElementById("micInfo"),
    visionInfo: document.getElementById("visionInfo"),
    log: document.getElementById("log")
  };
}

function formatMicInfo(micInfo) {
  if (!micInfo || micInfo.state === "not_requested") {
    return "Mic: not requested";
  }

  const name = micInfo.label || "Unknown microphone";
  const state = micInfo.state || "unknown";
  const deviceId = micInfo.deviceId ? micInfo.deviceId : "n/a";
  const sampleRate = micInfo.sampleRate ? `${micInfo.sampleRate}Hz` : "n/a";
  const channelCount = micInfo.channelCount ? `${micInfo.channelCount}ch` : "n/a";
  return `Mic (${state}): ${name} | deviceId=${deviceId} | ${sampleRate} ${channelCount}`;
}

function formatVisionInfo(visionState) {
  if (!visionState || !visionState.active) {
    return "Vision: idle";
  }

  return `Vision: active | ${VISION_CAPTURE_WIDTH}x${VISION_CAPTURE_HEIGHT} JPEG q=${VISION_JPEG_QUALITY} | 1 FPS | frames=${visionState.frameCount}`;
}

function renderState(ui, state) {
  ui.status.textContent = `Status: ${state.status}`;
  ui.micInfo.textContent = formatMicInfo(state.micInfo);
  ui.connectBtn.disabled = state.connected || state.connecting;
  ui.disconnectBtn.disabled = !state.connected && !state.connecting;
  ui.startMicBtn.disabled =
    !state.connected || !state.sessionReady || state.micActive || state.micStarting;
  ui.endTurnBtn.disabled = !state.micActive;
  ui.stopMicBtn.disabled = !state.micActive;
  ui.askVisionBtn.disabled = !state.connected || !state.sessionReady;
}

function renderVisionState(ui, runtimeState, visionState) {
  ui.visionInfo.textContent = formatVisionInfo(visionState);
  ui.startVisionBtn.disabled =
    visionState.active || !runtimeState.connected || !runtimeState.sessionReady;
  ui.stopVisionBtn.disabled = !visionState.active;
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

function replaceLogHistory(ui, lines) {
  ui.log.textContent = Array.isArray(lines) ? lines.join("\n") : "";
}

function prependLogLine(ui, line) {
  const existingLines = String(ui.log.textContent || "")
    .split("\n")
    .filter(Boolean);
  ui.log.textContent = [line].concat(existingLines).slice(0, 60).join("\n");
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
  let selectedMicDeviceId = loadSelectedMicDeviceId();
  let logRelayEnabled = loadLogRelayEnabled();
  let runtimeState = createDefaultRuntimeState();
  let visionState = createDefaultVisionState();

  const updateLogRelayUi = () => {
    if (!ui.toggleLogRelayBtn) {
      return;
    }

    ui.toggleLogRelayBtn.textContent = `Log Relay: ${logRelayEnabled ? "On" : "Off"}`;
  };

  const updateUi = () => {
    renderState(ui, runtimeState);
    renderVisionState(ui, runtimeState, visionState);
  };

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
    runtimeState = {
      ...createDefaultRuntimeState(),
      ...(nextRuntimeState || {})
    };
    visionState = {
      ...createDefaultVisionState(),
      ...(nextVisionState || {})
    };

    if (runtimeState.activeWsUrl && ui.wsUrl) {
      ui.wsUrl.value = runtimeState.activeWsUrl;
    }

    if (typeof runtimeState.clientLogForwardingEnabled === "boolean") {
      logRelayEnabled = runtimeState.clientLogForwardingEnabled;
      saveLogRelayEnabled(logRelayEnabled);
    }

    if (Array.isArray(logs)) {
      replaceLogHistory(ui, logs);
    }

    updateLogRelayUi();
    updateUi();
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

  ui.connectBtn.addEventListener("click", () => {
    runRuntimeCommand("connect", {
      wsUrl: ui.wsUrl.value,
      logRelayEnabled
    });
  });

  ui.disconnectBtn.addEventListener("click", () => {
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
    runRuntimeCommand("start-vision");
  });

  ui.stopVisionBtn.addEventListener("click", () => {
    runRuntimeCommand("stop-vision");
  });

  ui.askVisionBtn.addEventListener("click", () => {
    runRuntimeCommand("ask-vision");
  });

  if (ui.toggleLogRelayBtn) {
    ui.toggleLogRelayBtn.addEventListener("click", () => {
      logRelayEnabled = !logRelayEnabled;
      saveLogRelayEnabled(logRelayEnabled);
      updateLogRelayUi();
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
  }

  if (globalThis.chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || typeof message.type !== "string") {
        return;
      }

      if (message.type === "kindlyclick:runtime-state-updated") {
        runtimeState = {
          ...createDefaultRuntimeState(),
          ...(message.snapshot || {})
        };
        updateUi();
        return;
      }

      if (message.type === "kindlyclick:runtime-vision-state-updated") {
        visionState = {
          ...createDefaultVisionState(),
          ...(message.visionState || {})
        };
        updateUi();
        return;
      }

      if (message.type === "kindlyclick:runtime-log-entry") {
        prependLogLine(ui, message.line || "");
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

  updateLogRelayUi();
  updateUi();
})();
