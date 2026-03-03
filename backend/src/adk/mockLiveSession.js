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

    this.visionFrames.push({
      sceneKey,
      sceneLabel: scene.label,
      elements: scene.elements,
      mimeType: mimeType || "image/jpeg",
      width: width || null,
      height: height || null,
      frameIndex: frameIndex || null,
      metadata,
      receivedAt: Date.now()
    });

    if (this.visionFrames.length > MAX_VISION_FRAMES) {
      this.visionFrames.shift();
    }

    this.onEvent({
      type: "vision_input_ack",
      frameIndex: frameIndex || null,
      sceneKey,
      sceneLabel: scene.label,
      elements: scene.elements
    });
  }

  handleUserText(text) {
    const prompt = String(text || "").trim();
    if (!prompt) {
      return;
    }

    const lowerPrompt = prompt.toLowerCase();

    if (lowerPrompt.includes("what do you see")) {
      this.onEvent({
        type: "text_output",
        responseId: this.#nextResponseId(),
        text: this.#summarizeVisionFrames()
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
      return "I do not see any screen frames yet. Please share your screen and send a frame.";
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

  #nextResponseId() {
    this.textResponseCounter += 1;
    return `${this.sessionId}-text-${this.textResponseCounter}`;
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
  }
}

module.exports = {
  MockLiveSession
};
