const TARGET_SAMPLE_RATE = 16000;
const MIC_SELECTION_STORAGE_KEY = "kindlyclick:selectedMicDeviceId";
const LOG_RELAY_STORAGE_KEY = "kindlyclick:logRelayEnabled";
const VISION_CAPTURE_WIDTH = 1280;
const VISION_CAPTURE_HEIGHT = 720;
const VISION_CAPTURE_INTERVAL_MS = 1000;
const VISION_JPEG_QUALITY = 0.6;
const MIC_WORKLET_NAME = "kindlyclick-mic-capture";
const MIC_WORKLET_PATH = "micCaptureWorklet.js";

class MicrophoneStreamer {
  constructor() {
    this.mediaStream = null;
    this.audioContext = null;
    this.sourceNode = null;
    this.processorNode = null;
    this.silentGainNode = null;
    this.onChunk = null;
  }

  async start(stream, onChunk) {
    if (this.processorNode) {
      return;
    }

    this.mediaStream = stream;
    this.onChunk = onChunk;

    const [track] = this.mediaStream.getAudioTracks();
    if (track && track.applyConstraints) {
      try {
        await track.applyConstraints({
          channelCount: { ideal: 1 },
          sampleRate: { ideal: TARGET_SAMPLE_RATE },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        });
      } catch (error) {
        // Keep streaming even if preferred constraints are unsupported.
      }
    }

    this.audioContext = new AudioContext();
    await this.audioContext.resume();

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.silentGainNode = this.audioContext.createGain();
    this.silentGainNode.gain.value = 0;
    this.processorNode = await this.createCaptureNode();

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.silentGainNode);
    this.silentGainNode.connect(this.audioContext.destination);
  }

  async createCaptureNode() {
    if (this.audioContext.audioWorklet && typeof AudioWorkletNode !== "undefined") {
      const moduleUrl = chrome.runtime.getURL(MIC_WORKLET_PATH);
      await this.audioContext.audioWorklet.addModule(moduleUrl);

      const node = new AudioWorkletNode(this.audioContext, MIC_WORKLET_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: "explicit"
      });

      node.port.onmessage = (event) => {
        const input =
          event.data instanceof Float32Array ? event.data : new Float32Array(event.data || []);
        const resampled = resampleFloat32Mono(input, this.audioContext.sampleRate, TARGET_SAMPLE_RATE);
        const pcm16 = floatToPcm16(resampled);
        const rms = computeRms(resampled);

        if (this.onChunk) {
          this.onChunk({
            pcm16Base64: toBase64FromInt16(pcm16),
            rms
          });
        }
      };

      return node;
    }

    throw new Error("AudioWorklet is required but not available in this browser context");
  }

  async stop() {
    if (this.processorNode) {
      this.processorNode.disconnect();
      if (this.processorNode.port) {
        this.processorNode.port.onmessage = null;
      }
      this.processorNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.silentGainNode) {
      this.silentGainNode.disconnect();
      this.silentGainNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    this.onChunk = null;
  }
}

class PcmPlayer {
  constructor(sampleRate = TARGET_SAMPLE_RATE) {
    this.sampleRate = sampleRate;
    this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
    this.nextStartTime = 0;
    this.activeSources = new Set();
  }

  async enqueue(base64Pcm) {
    if (!base64Pcm) {
      return;
    }

    await this.audioContext.resume();

    const pcmBytes = fromBase64(base64Pcm);
    const sampleCount = Math.floor(pcmBytes.byteLength / 2);
    const view = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength);

    const buffer = this.audioContext.createBuffer(1, sampleCount, this.sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < sampleCount; i += 1) {
      channelData[i] = view.getInt16(i * 2, true) / 32768;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    const startTime = Math.max(this.audioContext.currentTime, this.nextStartTime);
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;

    this.activeSources.add(source);
    source.onended = () => {
      source.disconnect();
      this.activeSources.delete(source);
    };
  }

  clear() {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch (error) {
        // Ignore sources already ended.
      }
      source.disconnect();
    }

    this.activeSources.clear();
    this.nextStartTime = this.audioContext.currentTime;
  }
}

class VisionCaptureLoop {
  constructor({ onFrame, onStatus }) {
    this.onFrame = onFrame;
    this.onStatus = onStatus;

    this.stream = null;
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.intervalId = null;
    this.frameIndex = 0;
    this.lastSentAt = 0;
    this.active = false;
  }

  isActive() {
    return this.active;
  }

  async start() {
    if (this.active) {
      return;
    }

    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: VISION_CAPTURE_WIDTH },
        height: { ideal: VISION_CAPTURE_HEIGHT },
        frameRate: { ideal: 10, max: 15 }
      },
      audio: false
    });

    this.video = document.createElement("video");
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();

    this.canvas = document.createElement("canvas");
    this.canvas.width = VISION_CAPTURE_WIDTH;
    this.canvas.height = VISION_CAPTURE_HEIGHT;
    this.ctx = this.canvas.getContext("2d", { alpha: false, desynchronized: true });

    this.frameIndex = 0;
    this.lastSentAt = 0;
    this.active = true;

    const [track] = this.stream.getVideoTracks();
    if (track) {
      track.onended = () => {
        this.stop("screen share ended").catch(() => {});
      };
    }

    this.onStatus({
      active: true,
      frameIndex: this.frameIndex,
      fps: 1,
      reason: "started"
    });

    await this.captureFrame();
    this.intervalId = setInterval(() => {
      this.captureFrame().catch(() => {});
    }, VISION_CAPTURE_INTERVAL_MS);
  }

  async captureFrame() {
    if (!this.active || !this.video || !this.ctx || !this.canvas) {
      return;
    }

    this.ctx.drawImage(this.video, 0, 0, VISION_CAPTURE_WIDTH, VISION_CAPTURE_HEIGHT);
    const dataUrl = this.canvas.toDataURL("image/jpeg", VISION_JPEG_QUALITY);
    const commaIndex = dataUrl.indexOf(",");
    const imageBase64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : "";

    if (!imageBase64) {
      return;
    }

    this.frameIndex += 1;
    this.lastSentAt = Date.now();

    await this.onFrame({
      imageBase64,
      mimeType: "image/jpeg",
      width: VISION_CAPTURE_WIDTH,
      height: VISION_CAPTURE_HEIGHT,
      frameIndex: this.frameIndex,
      jpegQuality: VISION_JPEG_QUALITY
    });

    this.onStatus({
      active: true,
      frameIndex: this.frameIndex,
      fps: 1,
      reason: "frame_sent",
      lastSentAt: this.lastSentAt
    });
  }

  async stop(reason = "stopped") {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video = null;
    }

    this.canvas = null;
    this.ctx = null;
    this.active = false;

    this.onStatus({
      active: false,
      frameIndex: this.frameIndex,
      fps: 0,
      reason
    });
  }
}

function resampleFloat32Mono(input, inputSampleRate, targetSampleRate) {
  if (!Number.isFinite(inputSampleRate) || inputSampleRate <= 0 || input.length === 0) {
    return input;
  }

  if (inputSampleRate === targetSampleRate) {
    return input;
  }

  const ratio = inputSampleRate / targetSampleRate;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const sourceIndex = i * ratio;
    const low = Math.floor(sourceIndex);
    const high = Math.min(low + 1, input.length - 1);
    const weight = sourceIndex - low;
    output[i] = input[low] * (1 - weight) + input[high] * weight;
  }

  return output;
}

function floatToPcm16(floatSamples) {
  const pcm16 = new Int16Array(floatSamples.length);

  for (let i = 0; i < floatSamples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, floatSamples[i]));
    pcm16[i] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
  }

  return pcm16;
}

function computeRms(samples) {
  if (!samples || samples.length === 0) {
    return 0;
  }

  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    sum += samples[i] * samples[i];
  }

  return Math.sqrt(sum / samples.length);
}

function toBase64FromInt16(int16Array) {
  const bytes = new Uint8Array(int16Array.buffer);
  let binary = "";

  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

function fromBase64(base64Value) {
  const binary = atob(base64Value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
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

function appendLog(ui, text) {
  const ts = new Date().toLocaleTimeString();
  ui.log.textContent = `[${ts}] ${text}\n${ui.log.textContent}`.split("\n").slice(0, 60).join("\n");
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
  ui.disconnectBtn.disabled = !state.connected;
  ui.startMicBtn.disabled =
    !state.connected || !state.sessionReady || state.micActive || state.micStarting;
  ui.endTurnBtn.disabled = !state.micActive;
  ui.stopMicBtn.disabled = !state.micActive;
  ui.askVisionBtn.disabled = !state.connected || !state.sessionReady;
}

function loadSelectedMicDeviceId() {
  try {
    return localStorage.getItem(MIC_SELECTION_STORAGE_KEY) || "";
  } catch (error) {
    return "";
  }
}

function loadLogRelayEnabled() {
  try {
    return localStorage.getItem(LOG_RELAY_STORAGE_KEY) === "true";
  } catch (error) {
    return false;
  }
}

function saveLogRelayEnabled(enabled) {
  try {
    localStorage.setItem(LOG_RELAY_STORAGE_KEY, enabled ? "true" : "false");
  } catch (error) {
    // Ignore persistence failures.
  }
}

function saveSelectedMicDeviceId(deviceId) {
  try {
    if (!deviceId) {
      localStorage.removeItem(MIC_SELECTION_STORAGE_KEY);
      return;
    }

    localStorage.setItem(MIC_SELECTION_STORAGE_KEY, deviceId);
  } catch (error) {
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

async function readMicrophonePermissionState() {
  if (!navigator.permissions || !navigator.permissions.query) {
    return "unknown";
  }

  try {
    const permission = await navigator.permissions.query({ name: "microphone" });
    return permission.state;
  } catch (error) {
    return "unknown";
  }
}

function isMicPermissionDismissedError(error) {
  if (!error || error.name !== "NotAllowedError") {
    return false;
  }

  const message = String(error.message || "").toLowerCase();
  return message.includes("dismissed");
}

async function openMicPermissionTab(deviceId) {
  if (!globalThis.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
    return {
      ok: false,
      error: "chrome.runtime.sendMessage unavailable"
    };
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "kindlyclick:open-mic-permission-tab",
      deviceId: deviceId || ""
    });
    return response || { ok: false, error: "No response from background" };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Failed to open permission tab"
    };
  }
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

async function getActiveTabMetadata() {
  if (!globalThis.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
    return {};
  }

  try {
    const context = await chrome.runtime.sendMessage({
      type: "kindlyclick:get-active-tab-context"
    });
    const hintsResponse = await chrome.runtime.sendMessage({
      type: "kindlyclick:get-content-hints"
    });

    return {
      pageTitle: context?.pageTitle || hintsResponse?.hints?.pageTitle || "",
      pageUrl: context?.pageUrl || "",
      tabId: context?.tabId || null,
      headingHints: hintsResponse?.hints?.headingHints || [],
      buttonHints: hintsResponse?.hints?.buttonHints || []
    };
  } catch (error) {
    return {};
  }
}

async function dispatchCommandToActiveTab(commandMessage) {
  if (!globalThis.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
    return {
      ok: false,
      error: "chrome.runtime.sendMessage unavailable"
    };
  }

  if (!commandMessage || commandMessage.action !== "DRAW_HIGHLIGHT") {
    return {
      ok: false,
      error: `Unsupported command action: ${commandMessage?.action || "undefined"}`
    };
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "kindlyclick:draw-highlight",
      command: {
        commandId: commandMessage.commandId || null,
        action: commandMessage.action,
        args: commandMessage.args || {}
      }
    });

    return response || { ok: false, error: "No response from background" };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Failed to dispatch command"
    };
  }
}

(function bootstrap() {
  const ui = createUi();
  const micStreamer = new MicrophoneStreamer();
  const pcmPlayer = new PcmPlayer();
  let selectedMicDeviceId = loadSelectedMicDeviceId();
  let logRelayEnabled = loadLogRelayEnabled();
  let controllerSnapshot = {
    connected: false,
    sessionReady: false
  };
  let awaitingMicPermissionHelper = false;
  let helperRetryInFlight = false;
  let micPermissionPollIntervalId = null;
  const visionState = {
    active: false,
    frameCount: 0
  };

  const updateLogRelayUi = () => {
    if (!ui.toggleLogRelayBtn) {
      return;
    }
    ui.toggleLogRelayBtn.textContent = `Log Relay: ${logRelayEnabled ? "On" : "Off"}`;
  };

  const updateVisionUi = () => {
    ui.visionInfo.textContent = formatVisionInfo(visionState);
    ui.startVisionBtn.disabled =
      visionState.active || !controllerSnapshot.connected || !controllerSnapshot.sessionReady;
    ui.stopVisionBtn.disabled = !visionState.active;
  };

  async function refreshMicDevices(logLabel = null) {
    const devices = await listAudioInputDevices();
    renderMicOptions(ui, devices, selectedMicDeviceId);
    selectedMicDeviceId = ui.micSelect.value || "";
    saveSelectedMicDeviceId(selectedMicDeviceId);

    if (logLabel) {
      appendLog(
        ui,
        `${logLabel}: ${devices.length} microphone${devices.length === 1 ? "" : "s"} found`
      );
    }
  }

  let controller = null;

  function stopMicPermissionPolling() {
    if (!micPermissionPollIntervalId) {
      return;
    }

    clearInterval(micPermissionPollIntervalId);
    micPermissionPollIntervalId = null;
  }

  async function maybeAutoRetryMicStart(source) {
    if (!awaitingMicPermissionHelper || helperRetryInFlight) {
      return;
    }

    if (!controllerSnapshot.connected || !controllerSnapshot.sessionReady) {
      return;
    }

    const permissionState = await readMicrophonePermissionState();
    if (permissionState !== "granted") {
      return;
    }

    helperRetryInFlight = true;

    try {
      appendLog(ui, `microphone permission detected (${source}); retrying Start Mic`);
      await startMicWithCurrentSelection("helper", { allowOpenHelper: false });
    } finally {
      helperRetryInFlight = false;
    }
  }

  function startMicPermissionPolling() {
    if (micPermissionPollIntervalId) {
      return;
    }

    micPermissionPollIntervalId = setInterval(() => {
      maybeAutoRetryMicStart("poll").catch(() => {});
    }, 800);
  }

  async function startMicWithCurrentSelection(
    trigger = "manual",
    { allowOpenHelper = true } = {}
  ) {
    try {
      await controller.startMicrophone({ deviceId: selectedMicDeviceId || undefined });
      awaitingMicPermissionHelper = false;
      stopMicPermissionPolling();
      await refreshMicDevices();
      if (trigger === "helper") {
        appendLog(ui, "microphone started automatically after helper permission grant");
      }
    } catch (error) {
      appendLog(ui, `mic start error: ${error.name || "Error"}: ${error.message}`);
      const isPermissionError = error && error.name === "NotAllowedError";
      if (!isPermissionError) {
        return;
      }

      const permissionState = await readMicrophonePermissionState();
      if (permissionState === "denied") {
        awaitingMicPermissionHelper = false;
        stopMicPermissionPolling();
        appendLog(
          ui,
          "microphone is blocked in Chrome settings for this extension origin"
        );
        return;
      }

      if (!isMicPermissionDismissedError(error) && permissionState === "granted") {
        return;
      }

      if (!allowOpenHelper) {
        return;
      }

      const openResult = await openMicPermissionTab(selectedMicDeviceId);
      if (!openResult.ok) {
        appendLog(ui, `mic permission helper error: ${openResult.error || "unknown error"}`);
        return;
      }

      awaitingMicPermissionHelper = true;
      startMicPermissionPolling();
      appendLog(
        ui,
        "opened microphone permission tab; click Allow there and this side panel will retry automatically"
      );
    }
  }

  const visionLoop = new VisionCaptureLoop({
    onFrame: async (frame) => {
      const metadata = await getActiveTabMetadata();
      const delivered = controller.sendVisionFrame({
        ...frame,
        metadata
      });

      if (delivered) {
        visionState.frameCount = frame.frameIndex;
      }
    },
    onStatus: ({ active, frameIndex, reason, lastSentAt }) => {
      visionState.active = active;
      if (typeof frameIndex === "number") {
        visionState.frameCount = frameIndex;
      }
      updateVisionUi();

      if (reason === "started") {
        const delivered = controller.sendVisionStatus({
          active: true,
          reason: "started",
          lastFrameTs: lastSentAt || null
        });
        if (!delivered) {
          appendLog(ui, "vision status update not sent (session not ready)");
        }
      }

      if (!active) {
        const delivered = controller.sendVisionStatus({
          active: false,
          reason,
          lastFrameTs: lastSentAt || null
        });
        if (!delivered && controllerSnapshot.connected) {
          appendLog(ui, "vision stop status not sent (session not ready)");
        }
      }

      if (reason === "screen share ended") {
        appendLog(ui, "vision capture ended by browser");
      }
    }
  });

  controller = new window.KindlyClickAudioController.AudioController({
    socketFactory: (url) => new WebSocket(url),
    mic: {
      requestPermission: ({ deviceId } = {}) => {
        if (deviceId) {
          return navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: deviceId }
            }
          });
        }

        return navigator.mediaDevices.getUserMedia({ audio: true });
      },
      readPermissionState: () => readMicrophonePermissionState(),
      start: (stream, onChunk) => micStreamer.start(stream, onChunk),
      stop: () => micStreamer.stop(),
      releaseStream: (stream) => {
        if (!stream) {
          return;
        }

        stream.getTracks().forEach((track) => track.stop());
      }
    },
    player: {
      enqueue: (base64Pcm) => pcmPlayer.enqueue(base64Pcm),
      clear: () => pcmPlayer.clear()
    },
    logFn: (text) => appendLog(ui, text),
    commandFn: (commandMessage) => dispatchCommandToActiveTab(commandMessage),
    stateFn: (state) => {
      controllerSnapshot = state;
      renderState(ui, state);
      updateVisionUi();

      if (!state.connected && visionLoop.isActive()) {
        visionLoop.stop("socket disconnected").catch(() => {});
      }
    },
    traceFn: () => {
      // Keep available for future diagnostics; not rendered by default.
    },
    config: {
      clientLogForwardingEnabled: logRelayEnabled
    }
  });

  ui.connectBtn.addEventListener("click", () => {
    try {
      controller.connect(ui.wsUrl.value);
    } catch (error) {
      appendLog(ui, `connect error: ${error.message}`);
    }
  });

  ui.disconnectBtn.addEventListener("click", () => {
    awaitingMicPermissionHelper = false;
    stopMicPermissionPolling();
    controller.disconnect().catch((error) => {
      appendLog(ui, `disconnect error: ${error.message}`);
    });
  });

  ui.micSelect.addEventListener("change", () => {
    selectedMicDeviceId = ui.micSelect.value || "";
    saveSelectedMicDeviceId(selectedMicDeviceId);
    appendLog(ui, selectedMicDeviceId ? `mic selected: ${selectedMicDeviceId}` : "mic selected: System Default");
  });

  ui.refreshMicBtn.addEventListener("click", () => {
    refreshMicDevices("mic refresh").catch((error) => {
      appendLog(ui, `mic refresh error: ${error.message}`);
    });
  });

  if (globalThis.chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || message.type !== "kindlyclick:mic-permission-granted") {
        return;
      }

      if (!awaitingMicPermissionHelper) {
        return;
      }

      Promise.resolve()
        .then(async () => {
          if (message.usedFallbackDevice) {
            selectedMicDeviceId = "";
            saveSelectedMicDeviceId(selectedMicDeviceId);
          }

          await maybeAutoRetryMicStart("message");
        });
    });
  }

  ui.startMicBtn.addEventListener("click", () => {
    startMicWithCurrentSelection("manual");
  });

  ui.endTurnBtn.addEventListener("click", () => {
    controller.endCurrentUtterance("manual end turn");
  });

  ui.stopMicBtn.addEventListener("click", () => {
    controller.stopMicrophone().catch((error) => {
      appendLog(ui, `mic stop error: ${error.message}`);
    });
  });

  ui.startVisionBtn.addEventListener("click", () => {
    visionLoop
      .start()
      .then(() => {
        appendLog(ui, "vision capture started (1 FPS, 720p JPEG)");
      })
      .catch((error) => {
        appendLog(ui, `vision start error: ${error.name || "Error"}: ${error.message}`);
      });
  });

  ui.stopVisionBtn.addEventListener("click", () => {
    visionLoop
      .stop("manual stop")
      .then(() => {
        appendLog(ui, "vision capture stopped");
      })
      .catch((error) => {
        appendLog(ui, `vision stop error: ${error.message}`);
      });
  });

  ui.askVisionBtn.addEventListener("click", () => {
    const delivered = controller.sendUserText("What do you see?");
    if (!delivered) {
      appendLog(ui, "vision question not sent: connect session first");
    }
  });

  if (ui.toggleLogRelayBtn) {
    ui.toggleLogRelayBtn.addEventListener("click", () => {
      logRelayEnabled = !logRelayEnabled;
      saveLogRelayEnabled(logRelayEnabled);
      controller.setClientLogForwarding(logRelayEnabled);
      updateLogRelayUi();
      appendLog(ui, `log relay ${logRelayEnabled ? "enabled" : "disabled"}`);
    });
  }

  refreshMicDevices().catch((error) => {
    appendLog(ui, `initial mic list error: ${error.message}`);
  });

  updateVisionUi();
  updateLogRelayUi();
})();
