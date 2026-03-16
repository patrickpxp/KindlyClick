const TARGET_SAMPLE_RATE = 16000;
const VISION_CAPTURE_WIDTH = 1280;
const VISION_CAPTURE_HEIGHT = 720;
const VISION_CAPTURE_INTERVAL_MS = 1000;
const VISION_JPEG_QUALITY = 0.6;
const MIC_WORKLET_NAME = "kindlyclick-mic-capture";
const MIC_WORKLET_PATH = "micCaptureWorklet.js";
const runtimeProtocol = window.KindlyClickRuntimeProtocol;
const OFFSCREEN_RUNTIME_TARGET = runtimeProtocol.OFFSCREEN_RUNTIME_TARGET;

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
      } catch (_error) {
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
      } catch (_error) {
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

function readMicrophonePermissionState() {
  if (!navigator.permissions || !navigator.permissions.query) {
    return Promise.resolve("unknown");
  }

  return navigator.permissions
    .query({ name: "microphone" })
    .then((permission) => permission.state)
    .catch(() => "unknown");
}

function isMicPermissionDismissedError(error) {
  if (!error || error.name !== "NotAllowedError") {
    return false;
  }

  const message = String(error.message || "").toLowerCase();
  return message.includes("dismissed");
}

async function sendRuntimeEvent(message) {
  try {
    await chrome.runtime.sendMessage(message);
  } catch (_error) {
    // Ignore when there is no active receiver besides the service worker.
  }
}

async function emitRuntimeState(snapshot) {
  await sendRuntimeEvent({
    type: "kindlyclick:runtime-state-update",
    snapshot
  });
}

async function emitVisionState(visionState) {
  await sendRuntimeEvent({
    type: "kindlyclick:runtime-vision-state-update",
    visionState
  });
}

function emitRuntimeLog(text) {
  sendRuntimeEvent({
    type: "kindlyclick:runtime-log",
    text: String(text || "")
  });
}

function emitOffscreenLifecycleEvent(event, data = {}) {
  sendRuntimeEvent({
    type: "kindlyclick:offscreen-lifecycle",
    event,
    data
  });
}

async function getActiveTabMetadata() {
  try {
    const context = await chrome.runtime.sendMessage({
      type: "kindlyclick:get-active-tab-context"
    });
    const hintsResponse = await chrome.runtime.sendMessage({
      type: "kindlyclick:get-content-hints"
    });

    return {
      browserLanguage: navigator.language || "",
      pageTitle: context?.pageTitle || hintsResponse?.hints?.pageTitle || "",
      pageUrl: context?.pageUrl || "",
      tabId: context?.tabId || null,
      recentNavigationEvents: context?.recentNavigationEvents || [],
      pageLanguage: hintsResponse?.hints?.pageLanguage || "",
      viewport: hintsResponse?.hints?.viewport || null,
      focusedElement: hintsResponse?.hints?.focusedElement || null,
      headingHints: hintsResponse?.hints?.headingHints || [],
      buttonHints: hintsResponse?.hints?.buttonHints || []
    };
  } catch (_error) {
    return {};
  }
}

async function dispatchCommandToActiveTab(commandMessage) {
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

async function openMicPermissionTab(deviceId) {
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

(function bootstrap() {
  const micStreamer = new MicrophoneStreamer();
  const pcmPlayer = new PcmPlayer();
  let controllerSnapshot = {
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
  let awaitingMicPermissionHelper = false;
  let helperRetryInFlight = false;
  let micPermissionPollIntervalId = null;
  let pendingMicDeviceId = "";
  let shutdownAfterVisionEndedInFlight = false;
  const visionState = {
    active: false,
    frameCount: 0
  };

  const updateControllerSnapshot = (snapshot) => {
    controllerSnapshot = runtimeProtocol.normalizeRuntimeStateSnapshot(snapshot);
    emitRuntimeState(controllerSnapshot);
  };

  const updateVisionState = (nextState) => {
    const normalizedVisionState = runtimeProtocol.normalizeVisionStateSnapshot(nextState);
    visionState.active = normalizedVisionState.active;
    visionState.frameCount = normalizedVisionState.frameCount;
    emitVisionState(visionState);
  };

  function stopMicPermissionPolling() {
    if (!micPermissionPollIntervalId) {
      return;
    }

    clearInterval(micPermissionPollIntervalId);
    micPermissionPollIntervalId = null;
  }

  async function shutdownAfterVisionEnded() {
    if (shutdownAfterVisionEndedInFlight) {
      return;
    }

    shutdownAfterVisionEndedInFlight = true;

    try {
      awaitingMicPermissionHelper = false;
      stopMicPermissionPolling();
      pendingMicDeviceId = "";

      if (controllerSnapshot.connected || controllerSnapshot.connecting || controllerSnapshot.sessionReady) {
        emitRuntimeLog("screen sharing ended, stopping AI help");
        await controller.disconnect();
      }
    } finally {
      shutdownAfterVisionEndedInFlight = false;
    }
  }

  async function startMicWithCurrentSelection(
    deviceId,
    trigger = "manual",
    { allowOpenHelper = true } = {}
  ) {
    if (!controllerSnapshot.connected || !controllerSnapshot.sessionReady) {
      throw new Error("Session is not ready");
    }

    pendingMicDeviceId = deviceId || pendingMicDeviceId || "";

    try {
      await controller.startMicrophone({ deviceId: pendingMicDeviceId || undefined });
      awaitingMicPermissionHelper = false;
      stopMicPermissionPolling();
      if (trigger === "helper") {
        emitRuntimeLog("microphone started automatically after helper permission grant");
      }
    } catch (error) {
      emitRuntimeLog(`mic start error: ${error.name || "Error"}: ${error.message}`);
      const isPermissionError = error && error.name === "NotAllowedError";
      if (!isPermissionError) {
        throw error;
      }

      const permissionState = await readMicrophonePermissionState();
      if (permissionState === "denied") {
        awaitingMicPermissionHelper = false;
        stopMicPermissionPolling();
        emitRuntimeLog("microphone is blocked in Chrome settings for this extension origin");
        return;
      }

      if (!isMicPermissionDismissedError(error) && permissionState === "granted") {
        throw error;
      }

      if (!allowOpenHelper) {
        return;
      }

      const openResult = await openMicPermissionTab(pendingMicDeviceId);
      if (!openResult.ok) {
        emitRuntimeLog(`mic permission helper error: ${openResult.error || "unknown error"}`);
        return;
      }

      awaitingMicPermissionHelper = true;
      if (!micPermissionPollIntervalId) {
        micPermissionPollIntervalId = setInterval(() => {
          maybeAutoRetryMicStart("poll").catch(() => {});
        }, 800);
      }
      emitRuntimeLog(
        "opened microphone permission tab; click Allow there and the runtime will retry automatically"
      );
    }
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
      emitRuntimeLog(`microphone permission detected (${source}); retrying Start Mic`);
      await startMicWithCurrentSelection(pendingMicDeviceId, "helper", {
        allowOpenHelper: false
      });
    } finally {
      helperRetryInFlight = false;
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
        updateVisionState({
          active: true,
          frameCount: frame.frameIndex
        });
      }
    },
    onStatus: ({ active, frameIndex, reason, lastSentAt }) => {
      updateVisionState({
        active,
        frameCount: typeof frameIndex === "number" ? frameIndex : visionState.frameCount
      });

      if (reason === "started") {
        const delivered = controller.sendVisionStatus({
          active: true,
          reason: "started",
          lastFrameTs: lastSentAt || null
        });
        if (!delivered) {
          emitRuntimeLog("vision status update not sent (session not ready)");
        }
      }

      if (!active) {
        const delivered = controller.sendVisionStatus({
          active: false,
          reason,
          lastFrameTs: lastSentAt || null
        });
        if (!delivered && controllerSnapshot.connected) {
          emitRuntimeLog("vision stop status not sent (session not ready)");
        }
      }

      if (reason === "screen share ended") {
        emitRuntimeLog("vision capture ended by browser");
        shutdownAfterVisionEnded().catch((error) => {
          emitRuntimeLog(`disconnect after screen share end failed: ${error.message}`);
        });
      }
    }
  });

  const controller = new window.KindlyClickAudioController.AudioController({
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
    logFn: (text) => emitRuntimeLog(text),
    commandFn: (commandMessage) => dispatchCommandToActiveTab(commandMessage),
    stateFn: (state) => {
      updateControllerSnapshot(state);

      if (!state.connected && visionLoop.isActive()) {
        visionLoop.stop("socket disconnected").catch(() => {});
      }
    },
    traceFn: () => {
      // Keep available for future diagnostics; not forwarded by default.
    },
    config: {
      clientLogForwardingEnabled: false,
      clientLogComponent: "offscreen.audioController",
      sessionSource: "extension-offscreen"
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") {
      return undefined;
    }

    if (message.type === "kindlyclick:mic-permission-granted-broadcast") {
      if (!awaitingMicPermissionHelper) {
        return undefined;
      }

      Promise.resolve()
        .then(async () => {
          if (message.usedFallbackDevice) {
            pendingMicDeviceId = "";
          }

          await maybeAutoRetryMicStart("message");
        })
        .catch(() => {});

      return undefined;
    }

    if (message.type !== "kindlyclick:offscreen-command") {
      return undefined;
    }

    const parsed = runtimeProtocol.parseOffscreenCommandMessage(message);
    if (!parsed.ok) {
      sendResponse({ ok: false, error: parsed.error });
      return true;
    }

    const runtimeCommand = parsed.value;

    Promise.resolve()
      .then(async () => {
        if (runtimeCommand.command === "connect") {
          if (typeof runtimeCommand.logRelayEnabled === "boolean") {
            controller.setClientLogForwarding(runtimeCommand.logRelayEnabled);
          }
          controller.connect(runtimeCommand.wsUrl);
          sendResponse({ ok: true });
          return;
        }

        if (runtimeCommand.command === "disconnect") {
          awaitingMicPermissionHelper = false;
          stopMicPermissionPolling();
          if (visionLoop.isActive()) {
            await visionLoop.stop("runtime disconnect");
          }
          await controller.disconnect();
          sendResponse({ ok: true });
          return;
        }

        if (runtimeCommand.command === "set-log-relay") {
          controller.setClientLogForwarding(runtimeCommand.enabled);
          sendResponse({ ok: true });
          return;
        }

        if (runtimeCommand.command === "start-mic") {
          await startMicWithCurrentSelection(runtimeCommand.deviceId, "manual");
          sendResponse({ ok: true });
          return;
        }

        if (runtimeCommand.command === "stop-mic") {
          await controller.stopMicrophone();
          sendResponse({ ok: true });
          return;
        }

        if (runtimeCommand.command === "end-turn") {
          controller.endCurrentUtterance("manual end turn");
          sendResponse({ ok: true });
          return;
        }

        if (runtimeCommand.command === "start-vision") {
          if (!controllerSnapshot.connected || !controllerSnapshot.sessionReady) {
            sendResponse({ ok: false, error: "Connect session first" });
            return;
          }

          await visionLoop.start();
          emitRuntimeLog("vision capture started (1 FPS, 720p JPEG)");
          sendResponse({ ok: true });
          return;
        }

        if (runtimeCommand.command === "stop-vision") {
          await visionLoop.stop("manual stop");
          emitRuntimeLog("vision capture stopped");
          sendResponse({ ok: true });
          return;
        }

        if (runtimeCommand.command === "ask-vision") {
          const delivered = controller.sendUserText("What do you see?");
          if (!delivered) {
            sendResponse({ ok: false, error: "vision question not sent: connect session first" });
            return;
          }

          sendResponse({ ok: true });
          return;
        }

        sendResponse({
          ok: false,
          error: `Unsupported runtime command: ${runtimeCommand.command || "undefined"}`
        });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message || "Runtime command failed" });
      });

    return true;
  });

  emitOffscreenLifecycleEvent("booted", {
    target: OFFSCREEN_RUNTIME_TARGET
  });

  globalThis.addEventListener("pagehide", () => {
    emitOffscreenLifecycleEvent("pagehide", {
      target: OFFSCREEN_RUNTIME_TARGET
    });
  });

  globalThis.addEventListener("unload", () => {
    emitOffscreenLifecycleEvent("unloaded", {
      target: OFFSCREEN_RUNTIME_TARGET
    });
  });

  updateControllerSnapshot(controllerSnapshot);
  updateVisionState(visionState);
})();
