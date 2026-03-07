const DEFAULT_SAMPLE_RATE_HZ = 16000;
const DEFAULT_CHANNELS = 1;
const MAX_VISION_FRAMES = 20;

const SCENE_MAP = {
  sign_in: {
    label: "Sign In page",
    elements: ["sign in form", "email field", "password field", "sign in button"]
  },
  dashboard: {
    label: "Dashboard page",
    elements: ["navigation sidebar", "summary cards", "recent activity section"]
  },
  settings: {
    label: "Settings page",
    elements: ["settings menu", "account preferences", "save changes button"]
  },
  unknown: {
    label: "General page",
    elements: ["web content", "navigation controls"]
  }
};

function createToneChunk(chunkIndex, sampleRateHz = DEFAULT_SAMPLE_RATE_HZ) {
  const frameDurationSeconds = 0.02;
  const sampleCount = Math.floor(sampleRateHz * frameDurationSeconds);
  const frequencyHz = 440 + (chunkIndex % 3) * 40;
  const amplitude = 0.18;
  const chunk = Buffer.alloc(sampleCount * 2);

  for (let i = 0; i < sampleCount; i += 1) {
    const time = i / sampleRateHz;
    const sample = Math.sin(2 * Math.PI * frequencyHz * time) * amplitude;
    const pcm = Math.max(-1, Math.min(1, sample)) * 0x7fff;
    chunk.writeInt16LE(Math.round(pcm), i * 2);
  }

  return chunk;
}

function normalizeSceneKey(rawKey) {
  if (!rawKey || typeof rawKey !== "string") {
    return "unknown";
  }

  const key = rawKey.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (SCENE_MAP[key]) {
    return key;
  }

  if (key.includes("sign") && key.includes("in")) {
    return "sign_in";
  }

  if (key.includes("dashboard")) {
    return "dashboard";
  }

  if (key.includes("setting")) {
    return "settings";
  }

  return "unknown";
}

function inferSceneKey({ mockScene, metadata = {}, imageBase64 = "" }) {
  const normalizedMock = normalizeSceneKey(mockScene);
  if (normalizedMock !== "unknown") {
    return normalizedMock;
  }

  const metadataText = `${metadata.pageTitle || ""} ${metadata.pageUrl || ""}`.toLowerCase();
  if (metadataText.includes("sign") && metadataText.includes("in")) {
    return "sign_in";
  }
  if (metadataText.includes("dashboard")) {
    return "dashboard";
  }
  if (metadataText.includes("settings")) {
    return "settings";
  }

  try {
    const decoded = Buffer.from(imageBase64, "base64").toString("utf8").toLowerCase();
    if (decoded.includes("sign in")) {
      return "sign_in";
    }
    if (decoded.includes("dashboard")) {
      return "dashboard";
    }
    if (decoded.includes("settings")) {
      return "settings";
    }
  } catch (error) {
    // Ignore non-text frames.
  }

  return "unknown";
}

function isVisionDependentPrompt(lowerPrompt) {
  if (!lowerPrompt) {
    return false;
  }

  return (
    lowerPrompt.includes("what do you see") ||
    lowerPrompt.includes("can you see") ||
    lowerPrompt.includes("on my screen") ||
    lowerPrompt.includes("on the screen") ||
    lowerPrompt.includes("where is") ||
    lowerPrompt.includes("find the") ||
    lowerPrompt.includes("highlight")
  );
}

class MockLiveSession {
  constructor({ sessionId, onEvent, options }) {
    this.sessionId = sessionId;
    this.onEvent = onEvent;
    this.options = options;

    this.activeStream = null;
    this.inputDebounceTimer = null;
    this.pendingAudioBytes = 0;
    this.streamCounter = 0;

    this.visionFrames = [];
    this.textResponseCounter = 0;
    this.toolCallCounter = 0;
    this.visionActive = false;
    this.lastVisionFrameAt = null;
    this.visionFrameTtlMs = Number(options.visionFrameTtlMs || 5000);
  }

  ingestAudioChunk(audioBuffer) {
    this.pendingAudioBytes += audioBuffer.length;

    if (this.activeStream) {
      const interruptedStreamId = this.activeStream.streamId;
      this.#stopActiveStream();
      this.onEvent({
        type: "user_speech_detected",
        vadMode: this.options.vadMode,
        interruptedStreamId
      });
      this.onEvent({
        type: "clear_buffer",
        reason: "barge_in",
        interruptedStreamId
      });
    }

    if (this.inputDebounceTimer) {
      clearTimeout(this.inputDebounceTimer);
    }

    this.inputDebounceTimer = setTimeout(() => {
      this.inputDebounceTimer = null;
      this.#beginResponseStream();
    }, this.options.vadSilenceMs);
  }

  signalInputEnded() {
    if (this.pendingAudioBytes === 0 || this.activeStream) {
      return;
    }

    if (this.inputDebounceTimer) {
      clearTimeout(this.inputDebounceTimer);
      this.inputDebounceTimer = null;
    }

    this.#beginResponseStream();
  }

  ingestVisionFrame({
    imageBase64,
    mimeType,
    width,
    height,
    frameIndex,
    mockScene,
    metadata = {}
  }) {
    const sceneKey = inferSceneKey({ mockScene, metadata, imageBase64 });
    const scene = SCENE_MAP[sceneKey] || SCENE_MAP.unknown;

    const receivedAt = Date.now();

    this.visionFrames.push({
      sceneKey,
      sceneLabel: scene.label,
      elements: scene.elements,
      mimeType: mimeType || "image/jpeg",
      width: width || null,
      height: height || null,
      frameIndex: frameIndex || null,
      metadata,
      receivedAt
    });

    if (this.visionFrames.length > MAX_VISION_FRAMES) {
      this.visionFrames.shift();
    }

    this.visionActive = true;
    this.lastVisionFrameAt = receivedAt;

    this.onEvent({
      type: "vision_input_ack",
      frameIndex: frameIndex || null,
      sceneKey,
      sceneLabel: scene.label,
      elements: scene.elements
    });
  }

  updateVisionStatus({ active } = {}) {
    this.visionActive = Boolean(active);

    if (!this.visionActive) {
      // Do not retain stale frames once sharing stops.
      this.visionFrames = [];
      this.lastVisionFrameAt = null;
    }
  }

  handleUserText(text) {
    const prompt = String(text || "").trim();
    if (!prompt) {
      return;
    }

    const lowerPrompt = prompt.toLowerCase();

    if (isVisionDependentPrompt(lowerPrompt) && !this.#isVisionAvailable()) {
      this.onEvent({
        type: "text_output",
        responseId: this.#nextResponseId(),
        text: "I cannot currently see your screen. Please start vision sharing so I can help with on-screen guidance."
      });
      return;
    }

    if (lowerPrompt.includes("what do you see")) {
      this.onEvent({
        type: "text_output",
        responseId: this.#nextResponseId(),
        text: this.#summarizeVisionFrames()
      });
      return;
    }

    if (
      (lowerPrompt.includes("where") || lowerPrompt.includes("show")) &&
      (lowerPrompt.includes("search") || lowerPrompt.includes("bar"))
    ) {
      const command = this.#buildDrawHighlightCommand({
        label: "Search bar"
      });

      this.onEvent({
        type: "text_output",
        responseId: this.#nextResponseId(),
        text: "Let me show you. I highlighted the search bar area on your screen."
      });
      this.onEvent({
        type: "tool_command",
        command
      });
      return;
    }

    this.onEvent({
      type: "text_output",
      responseId: this.#nextResponseId(),
      text: `I heard: "${prompt}". I can also inspect screen frames if you ask "What do you see?"`
    });
  }

  #summarizeVisionFrames() {
    if (this.visionFrames.length === 0) {
      return "I cannot currently see your screen. Please start vision sharing so I can help with on-screen guidance.";
    }

    const recentFrames = this.visionFrames.slice(-3);
    const lines = recentFrames.map((frame, index) => {
      const elementSummary = frame.elements.slice(0, 3).join(", ");
      return `Frame ${index + 1}: ${frame.sceneLabel} with ${elementSummary}.`;
    });

    const aggregateElements = Array.from(
      new Set(recentFrames.flatMap((frame) => frame.elements))
    ).join(", ");

    return `${lines.join(" ")} Key elements I can identify: ${aggregateElements}.`;
  }

  #isVisionAvailable() {
    if (!this.visionActive || !this.lastVisionFrameAt) {
      return false;
    }

    if (this.visionFrames.length === 0) {
      return false;
    }

    const ageMs = Date.now() - this.lastVisionFrameAt;
    return ageMs <= this.visionFrameTtlMs;
  }

  #nextResponseId() {
    this.textResponseCounter += 1;
    return `${this.sessionId}-text-${this.textResponseCounter}`;
  }

  #nextToolCallId() {
    this.toolCallCounter += 1;
    return `${this.sessionId}-tool-${this.toolCallCounter}`;
  }

  #buildDrawHighlightCommand({ label = "Target" } = {}) {
    const latestFrame = this.visionFrames.length > 0 ? this.visionFrames[this.visionFrames.length - 1] : null;
    const sourceWidth = Number(latestFrame?.width) > 0 ? Number(latestFrame.width) : 1280;
    const sourceHeight = Number(latestFrame?.height) > 0 ? Number(latestFrame.height) : 720;
    const x = 0.5;
    const y = 0.12;

    return {
      commandId: this.#nextToolCallId(),
      toolName: "draw_highlight",
      action: "DRAW_HIGHLIGHT",
      status: "success",
      args: {
        x,
        y,
        coordinateType: "normalized",
        sourceWidth,
        sourceHeight,
        label
      }
    };
  }

  #beginResponseStream() {
    if (this.pendingAudioBytes === 0 || this.activeStream) {
      return;
    }

    this.pendingAudioBytes = 0;
    this.streamCounter += 1;

    const streamId = `${this.sessionId}-stream-${this.streamCounter}`;
    let chunkIndex = 0;

    const timer = setInterval(() => {
      chunkIndex += 1;

      this.onEvent({
        type: "audio_output",
        streamId,
        chunkIndex,
        sampleRateHz: DEFAULT_SAMPLE_RATE_HZ,
        channels: DEFAULT_CHANNELS,
        pcm16Base64: createToneChunk(chunkIndex).toString("base64")
      });

      if (chunkIndex >= this.options.responseChunks) {
        this.#stopActiveStream();
        this.onEvent({ type: "audio_output_end", streamId, reason: "completed" });
      }
    }, this.options.responseIntervalMs);

    this.activeStream = {
      streamId,
      timer
    };
  }

  #stopActiveStream() {
    if (!this.activeStream) {
      return;
    }

    clearInterval(this.activeStream.timer);
    this.activeStream = null;
  }

  close() {
    if (this.inputDebounceTimer) {
      clearTimeout(this.inputDebounceTimer);
      this.inputDebounceTimer = null;
    }

    this.#stopActiveStream();
    this.pendingAudioBytes = 0;
    this.visionFrames = [];
    this.visionActive = false;
    this.lastVisionFrameAt = null;
  }
}

module.exports = {
  MockLiveSession
};
