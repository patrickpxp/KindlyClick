const DEFAULT_INPUT_SAMPLE_RATE_HZ = 16000;
const DEFAULT_OUTPUT_SAMPLE_RATE_HZ = 24000;
const DEFAULT_CHANNELS = 1;

function toErrorMessage(error) {
  if (!error) {
    return "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error.message) {
    return error.message;
  }

  return JSON.stringify(error);
}

function parseSampleRateFromMimeType(mimeType, fallbackRateHz = DEFAULT_OUTPUT_SAMPLE_RATE_HZ) {
  if (typeof mimeType !== "string" || mimeType.length === 0) {
    return fallbackRateHz;
  }

  const match = mimeType.match(/(?:rate|sample_rate)\s*=\s*(\d+)/i);
  if (!match) {
    return fallbackRateHz;
  }

  const parsed = Number(match[1]);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallbackRateHz;
  }

  return parsed;
}

function normalizeLiveMessage(raw) {
  let payload = raw;

  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    payload.data &&
    !payload.serverContent
  ) {
    payload = payload.data;
  }

  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch (_error) {
      return { text: payload };
    }
  }

  if (!payload || typeof payload !== "object") {
    return {};
  }

  return payload;
}

function extractInlineData(part) {
  if (!part || typeof part !== "object") {
    return null;
  }

  const inlineData = part.inlineData || part.inline_data;
  if (!inlineData || typeof inlineData !== "object") {
    return null;
  }

  const data =
    inlineData.data || inlineData.bytesBase64Encoded || inlineData.bytes_base64_encoded || null;
  const mimeType = inlineData.mimeType || inlineData.mime_type || "";

  if (typeof data !== "string" || data.length === 0) {
    return null;
  }

  return {
    data,
    mimeType
  };
}

function parseFunctionArgs(rawArgs) {
  if (!rawArgs) {
    return {};
  }

  if (typeof rawArgs === "object") {
    return rawArgs;
  }

  if (typeof rawArgs === "string") {
    try {
      const parsed = JSON.parse(rawArgs);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
      return {};
    }
  }

  return {};
}

function normalizeCoordinateType(rawType, x, y) {
  const normalizedType = String(rawType || "").trim().toLowerCase();
  if (normalizedType === "normalized" || normalizedType === "pixel") {
    return normalizedType;
  }

  if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1) {
    return "normalized";
  }

  return "pixel";
}

function normalizeCoordinateValue(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function normalizeShortText(value, maxLength = 80) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }

  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function normalizeInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(parsed);
}

function normalizeScrollValue(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(parsed / 100) * 100;
}

function formatList(values, limit = 3) {
  const normalized = Array.isArray(values)
    ? values.map((value) => normalizeShortText(value, 40)).filter(Boolean).slice(0, limit)
    : [];

  return normalized.length > 0 ? normalized.join(", ") : "";
}

function formatRecentNavigationEvents(events, limit = 3) {
  const normalizedEvents = Array.isArray(events) ? events.slice(-limit) : [];
  const formatted = normalizedEvents
    .map((event) => {
      if (!event || typeof event !== "object") {
        return "";
      }

      const phase = normalizeShortText(event.phase, 20);
      const urlSummary = normalizeShortText(event.urlSummary || event.url_summary, 80);
      const title = normalizeShortText(event.title, 50);
      if (!phase || !urlSummary) {
        return "";
      }

      return title ? `${phase} ${urlSummary} (${title})` : `${phase} ${urlSummary}`;
    })
    .filter(Boolean);

  return formatted.length > 0 ? formatted.join(" | ") : "";
}

function buildVisionContextNote(metadata = {}) {
  if (!metadata || typeof metadata !== "object") {
    return "";
  }

  const segments = [];
  const pageTitle = normalizeShortText(metadata.pageTitle, 100);
  const browserLanguage = normalizeShortText(metadata.browserLanguage, 20);
  const pageLanguage = normalizeShortText(metadata.pageLanguage, 20);
  const viewport = metadata.viewport && typeof metadata.viewport === "object" ? metadata.viewport : null;
  const focusedElement =
    metadata.focusedElement && typeof metadata.focusedElement === "object"
      ? metadata.focusedElement
      : null;

  if (pageTitle) {
    segments.push(`page title: ${pageTitle}`);
  }

  if (pageLanguage) {
    segments.push(`page language: ${pageLanguage}`);
  }

  if (browserLanguage) {
    segments.push(`browser language: ${browserLanguage}`);
  }

  if (viewport) {
    const width = normalizeInteger(viewport.width);
    const height = normalizeInteger(viewport.height);
    const scrollX = normalizeScrollValue(viewport.scrollX);
    const scrollY = normalizeScrollValue(viewport.scrollY);
    const viewportParts = [];

    if (width && height) {
      viewportParts.push(`size ${width}x${height}`);
    }

    if (scrollX !== null || scrollY !== null) {
      viewportParts.push(`scroll ${scrollX || 0},${scrollY || 0}`);
    }

    if (viewportParts.length > 0) {
      segments.push(`viewport: ${viewportParts.join(" ")}`);
    }
  }

  if (focusedElement) {
    const focusParts = [];
    const tag = normalizeShortText(focusedElement.tag, 24);
    const role = normalizeShortText(focusedElement.role, 24);
    const type = normalizeShortText(focusedElement.type, 24);
    const label = normalizeShortText(focusedElement.label, 60);
    const bounds =
      focusedElement.bounds && typeof focusedElement.bounds === "object" ? focusedElement.bounds : null;

    if (tag) {
      focusParts.push(`tag=${tag}`);
    }
    if (role) {
      focusParts.push(`role=${role}`);
    }
    if (type) {
      focusParts.push(`type=${type}`);
    }
    if (focusedElement.sensitive) {
      focusParts.push("sensitive=true");
    } else if (label) {
      focusParts.push(`label="${label}"`);
    }
    if (focusedElement.disabled) {
      focusParts.push("disabled=true");
    }
    if (focusedElement.readOnly) {
      focusParts.push("readonly=true");
    }
    if (bounds) {
      const x = normalizeInteger(bounds.x);
      const y = normalizeInteger(bounds.y);
      const width = normalizeInteger(bounds.width);
      const height = normalizeInteger(bounds.height);

      if (x !== null && y !== null && width !== null && height !== null) {
        focusParts.push(`bounds=${x},${y},${width}x${height}`);
      }
    }

    if (focusParts.length > 0) {
      segments.push(`focused element: ${focusParts.join(" ")}`);
    }
  }

  const headingHints = formatList(metadata.headingHints, 3);
  if (headingHints) {
    segments.push(`visible headings: ${headingHints}`);
  }

  const buttonHints = formatList(metadata.buttonHints, 3);
  if (buttonHints) {
    segments.push(`visible buttons: ${buttonHints}`);
  }

  const recentNavigationEvents = formatRecentNavigationEvents(metadata.recentNavigationEvents, 3);
  if (recentNavigationEvents) {
    segments.push(`recent navigation: ${recentNavigationEvents}`);
  }

  if (segments.length === 0) {
    return "";
  }

  return `Extension screen context: ${segments.join("; ")}.`;
}

function extractFunctionCalls({ message, serverContent, parts }) {
  const calls = [];

  const ingestCall = (call) => {
    if (!call || typeof call !== "object") {
      return;
    }

    const name = call.name || call.functionName || call.function_name;
    if (typeof name !== "string" || name.trim().length === 0) {
      return;
    }

    calls.push({
      id: call.id || call.callId || call.call_id || null,
      name: name.trim(),
      args: parseFunctionArgs(call.args || call.arguments || call.parameters || call.params)
    });
  };

  const ingestCallContainer = (container) => {
    if (!container || typeof container !== "object") {
      return;
    }

    const functionCalls = container.functionCalls || container.function_calls;
    if (Array.isArray(functionCalls)) {
      functionCalls.forEach(ingestCall);
      return;
    }

    ingestCall(container);
  };

  for (const part of parts) {
    ingestCall(part?.functionCall || part?.function_call || null);
  }

  ingestCallContainer(message.toolCall || message.tool_call || null);
  ingestCallContainer(serverContent?.toolCall || serverContent?.tool_call || null);

  const seen = new Set();
  return calls.filter((call) => {
    const key = `${call.id || "none"}::${call.name}::${JSON.stringify(call.args || {})}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
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

class GeminiLiveSession {
  constructor({ sessionId, onEvent, options, logger = console, genaiModule }) {
    this.sessionId = sessionId;
    this.onEvent = onEvent;
    this.options = options;
    this.logger = logger;
    this.genaiModule = genaiModule;

    this.closed = false;
    this.liveSession = null;
    this.connectPromise = this.#connect();

    this.streamCounter = 0;
    this.responseCounter = 0;
    this.activeOutputStreamId = null;
    this.outputChunkIndex = 0;
    this.pendingTextParts = [];
    this.clearBufferSentForActiveStream = false;
    this.reportedConnectionError = false;
    this.toolCallCounter = 0;
    this.lastVisionFrame = {
      width: 1280,
      height: 720
    };
    this.visionActive = false;
    this.hasVisionFrame = false;
    this.lastVisionFrameAt = null;
    this.visionFrameTtlMs = Number(this.options.visionFrameTtlMs || 5000);
    this.lastVisionStatusNote = null;
    this.lastVisionContextNote = "";
    this.activeBargeIn = null;
  }

  async #connect() {
    const { GoogleGenAI, Modality } = this.genaiModule;

    const clientConfig = this.options.useVertexAi
      ? {
          vertexai: true,
          project: this.options.gcpProjectId,
          location: this.options.gcpLocation,
          apiVersion: this.options.apiVersion
        }
      : {
          apiKey: this.options.apiKey,
          apiVersion: this.options.apiVersion
        };

    this.ai = new GoogleGenAI(clientConfig);

    const modelCandidates = Array.from(
      new Set([this.options.model, ...(this.options.fallbackModels || [])].filter(Boolean))
    );

    let lastError = null;

    for (const model of modelCandidates) {
      const responseModalities = [Modality?.AUDIO || "AUDIO"];
      if (!/native-audio/i.test(model)) {
        responseModalities.push(Modality?.TEXT || "TEXT");
      }

      try {
        this.liveSession = await this.ai.live.connect({
          model,
          config: {
            responseModalities,
            systemInstruction: this.options.systemPrompt,
            tools:
              Array.isArray(this.options.toolDeclarations) && this.options.toolDeclarations.length > 0
                ? [
                    {
                      functionDeclarations: this.options.toolDeclarations
                    }
                  ]
                : undefined
          },
          callbacks: {
            onopen: () => {
              this.reportedConnectionError = false;
              this.logger.info(
                `Gemini Live connected for session ${this.sessionId} (model=${model})`
              );
            },
            onmessage: (message) => {
              this.#handleServerMessage(message);
            },
            onerror: (error) => {
              this.#reportConnectionError(`Gemini Live socket error: ${toErrorMessage(error)}`);
              this.logger.error(
                `Gemini Live error for session ${this.sessionId}: ${toErrorMessage(error)}`
              );
            },
            onclose: (event) => {
              if (!this.closed) {
                this.#reportConnectionError(
                  `Gemini Live closed unexpectedly: ${event?.reason || "no reason"}`
                );
              }
              const reason = event?.reason || "none";
              this.logger.info(`Gemini Live closed for session ${this.sessionId}; reason=${reason}`);
            }
          }
        });

        return;
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Gemini Live connect failed for model=${model} session=${this.sessionId}: ${toErrorMessage(error)}`
        );
      }
    }

    const reason = toErrorMessage(lastError);
    const triedModels = modelCandidates.join(", ");
    this.#reportConnectionError(
      `Gemini Live connection failed after trying models [${triedModels}]: ${reason}`
    );
    throw lastError || new Error("Gemini Live connect failed");
  }

  #reportConnectionError(message) {
    if (this.reportedConnectionError) {
      return;
    }

    this.reportedConnectionError = true;
    this.#emitText(message);
  }

  async #withSession(actionLabel, fn) {
    try {
      await this.connectPromise;
      if (this.closed || !this.liveSession) {
        return;
      }

      fn(this.liveSession);
    } catch (error) {
      this.#reportConnectionError(`Gemini Live unavailable: ${toErrorMessage(error)}`);
      this.logger.error(
        `Gemini Live ${actionLabel} failed for session ${this.sessionId}: ${toErrorMessage(error)}`
      );
    }
  }

  #nextStreamId() {
    this.streamCounter += 1;
    return `${this.sessionId}-stream-${this.streamCounter}`;
  }

  #nextResponseId() {
    this.responseCounter += 1;
    return `${this.sessionId}-text-${this.responseCounter}`;
  }

  #nextToolCallId() {
    this.toolCallCounter += 1;
    return `${this.sessionId}-tool-${this.toolCallCounter}`;
  }

  #ensureActiveOutputStreamId() {
    if (!this.activeOutputStreamId) {
      this.activeOutputStreamId = this.#nextStreamId();
      this.outputChunkIndex = 0;
      this.clearBufferSentForActiveStream = false;
    }

    return this.activeOutputStreamId;
  }

  #emitOutputStreamEnd(reason = "completed") {
    if (!this.activeOutputStreamId) {
      return;
    }

    this.#finalizeBargeInTelemetry({
      streamId: this.activeOutputStreamId,
      endReason: reason
    });

    this.onEvent({
      type: "audio_output_end",
      streamId: this.activeOutputStreamId,
      reason
    });

    this.activeOutputStreamId = null;
    this.outputChunkIndex = 0;
    this.clearBufferSentForActiveStream = false;
  }

  #emitTrace(event, data = {}) {
    this.onEvent({
      type: "debug_trace",
      scope: "gemini_live_session",
      event,
      data,
      ts: Date.now()
    });
  }

  #startBargeInTelemetry({ source, interruptedStreamId = null } = {}) {
    const nextTelemetry = {
      source: String(source || "unknown"),
      interruptedStreamId: interruptedStreamId || null,
      detectedAt: Date.now(),
      clearSent: Boolean(interruptedStreamId),
      continuedChunkCount: 0,
      firstContinuedChunkAt: null
    };

    this.activeBargeIn = nextTelemetry;

    this.#emitTrace("barge_in_detected", {
      source: nextTelemetry.source,
      interruptedStreamId: nextTelemetry.interruptedStreamId,
      clearSent: nextTelemetry.clearSent
    });
  }

  #recordContinuedOutputAfterBargeIn(streamId) {
    if (!this.activeBargeIn || !streamId || this.activeBargeIn.interruptedStreamId !== streamId) {
      return;
    }

    this.activeBargeIn.continuedChunkCount += 1;

    if (!this.activeBargeIn.firstContinuedChunkAt) {
      this.activeBargeIn.firstContinuedChunkAt = Date.now();
      this.#emitTrace("barge_in_output_continued", {
        interruptedStreamId: streamId,
        source: this.activeBargeIn.source,
        elapsedMs: this.activeBargeIn.firstContinuedChunkAt - this.activeBargeIn.detectedAt
      });
    }
  }

  #finalizeBargeInTelemetry({ streamId = null, endReason = "completed" } = {}) {
    if (!this.activeBargeIn) {
      return;
    }

    const telemetry = this.activeBargeIn;
    if (telemetry.interruptedStreamId && streamId && telemetry.interruptedStreamId !== streamId) {
      return;
    }

    this.#emitTrace("barge_in_resolved", {
      source: telemetry.source,
      interruptedStreamId: telemetry.interruptedStreamId,
      clearSent: telemetry.clearSent,
      continuedChunkCount: telemetry.continuedChunkCount,
      firstContinuedChunkDelayMs: telemetry.firstContinuedChunkAt
        ? telemetry.firstContinuedChunkAt - telemetry.detectedAt
        : null,
      totalDurationMs: Date.now() - telemetry.detectedAt,
      endReason
    });

    this.activeBargeIn = null;
  }

  #emitBargeIn({ source = "unknown", interruptedStreamId = null } = {}) {
    this.#startBargeInTelemetry({ source, interruptedStreamId });

    this.onEvent({
      type: "user_speech_detected",
      vadMode: this.options.vadMode,
      interruptedStreamId
    });

    if (interruptedStreamId) {
      this.onEvent({
        type: "clear_buffer",
        reason: "barge_in",
        interruptedStreamId
      });
    }
  }

  #handlePotentialBargeInFromInput() {
    if (!this.activeOutputStreamId || this.clearBufferSentForActiveStream) {
      return;
    }

    const interruptedStreamId = this.activeOutputStreamId;
    this.clearBufferSentForActiveStream = true;
    this.#emitBargeIn({
      source: "audio_input",
      interruptedStreamId
    });
  }

  #emitText(text) {
    const normalized = String(text || "").trim();
    if (!normalized) {
      return;
    }

    this.onEvent({
      type: "text_output",
      responseId: this.#nextResponseId(),
      text: normalized
    });
  }

  #flushPendingText() {
    if (this.pendingTextParts.length === 0) {
      return;
    }

    this.#emitText(this.pendingTextParts.join(" ").trim());
    this.pendingTextParts = [];
  }

  #emitToolCommand(functionCall) {
    if (!functionCall || functionCall.name !== "draw_highlight") {
      return;
    }

    const args = functionCall.args || {};
    const x = normalizeCoordinateValue(args.x);
    const y = normalizeCoordinateValue(args.y);

    if (x === null || y === null) {
      return;
    }

    const sourceWidth = normalizeCoordinateValue(args.sourceWidth || args.source_width);
    const sourceHeight = normalizeCoordinateValue(args.sourceHeight || args.source_height);
    const coordinateType = normalizeCoordinateType(
      args.coordinateType || args.coordinate_type,
      x,
      y
    );

    this.onEvent({
      type: "tool_command",
      command: {
        commandId: functionCall.id || this.#nextToolCallId(),
        toolName: "draw_highlight",
        action: "DRAW_HIGHLIGHT",
        status: "success",
        args: {
          x,
          y,
          coordinateType,
          sourceWidth: sourceWidth || this.lastVisionFrame.width,
          sourceHeight: sourceHeight || this.lastVisionFrame.height,
          label: String(args.label || "Target")
        }
      }
    });
  }

  #emitVisionUnavailable() {
    this.#emitText(
      "I cannot currently see your screen. Please start vision sharing so I can help with on-screen guidance."
    );
  }

  #sendVisionStatusContextNote(active) {
    if (this.lastVisionStatusNote === active) {
      return;
    }
    this.lastVisionStatusNote = active;

    const note = active
      ? "System status update: Vision feed is available again. Use only current incoming frames for screen guidance."
      : "System status update: Vision feed is unavailable. Do not describe current screen contents or claim visual certainty until new frames arrive.";

    this.#withSession("sendClientContent(visionStatus)", (session) => {
      session.sendClientContent({
        turns: [
          {
            role: "user",
            parts: [{ text: note }]
          }
        ],
        // Context update only; do not force immediate model response.
        turnComplete: false
      });
    });
  }

  #sendVisionMetadataContextNote(metadata = {}) {
    const note = buildVisionContextNote(metadata);
    if (!note || note === this.lastVisionContextNote) {
      return;
    }

    this.lastVisionContextNote = note;

    this.#withSession("sendClientContent(visionMetadata)", (session) => {
      session.sendClientContent({
        turns: [
          {
            role: "user",
            parts: [{ text: note }]
          }
        ],
        // Context update only; do not force immediate model response.
        turnComplete: false
      });
    });
  }

  #isVisionAvailable() {
    if (!this.visionActive || !this.hasVisionFrame || !this.lastVisionFrameAt) {
      return false;
    }

    const ageMs = Date.now() - this.lastVisionFrameAt;
    return ageMs <= this.visionFrameTtlMs;
  }

  #refreshVisionAvailability() {
    if (!this.visionActive || !this.lastVisionFrameAt) {
      return;
    }

    const ageMs = Date.now() - this.lastVisionFrameAt;
    if (ageMs <= this.visionFrameTtlMs) {
      return;
    }

    this.visionActive = false;
    this.lastVisionFrameAt = null;
    this.#sendVisionStatusContextNote(false);
    this.lastVisionContextNote = "";
  }

  #handleServerMessage(rawMessage) {
    const message = normalizeLiveMessage(rawMessage);

    const voiceActivityType =
      message.voiceActivity?.voiceActivityType ||
      message.voiceActivity?.voice_activity_type ||
      message.voice_activity?.voice_activity_type ||
      null;
    const vadSignalType =
      message.voiceActivityDetectionSignal?.vadSignalType ||
      message.voiceActivityDetectionSignal?.vad_signal_type ||
      message.voice_activity_detection_signal?.vad_signal_type ||
      null;

    const detectedSpeechStart =
      voiceActivityType === "ACTIVITY_START" || vadSignalType === "VAD_SIGNAL_TYPE_SOS";
    if (detectedSpeechStart) {
      if (this.activeOutputStreamId && !this.clearBufferSentForActiveStream) {
        this.clearBufferSentForActiveStream = true;
        this.#emitBargeIn({
          source: "server_vad",
          interruptedStreamId: this.activeOutputStreamId
        });
      } else {
        this.#emitBargeIn({
          source: "server_vad",
          interruptedStreamId: null
        });
      }
    }

    const serverContent = message.serverContent || message.server_content || null;

    if (serverContent?.interrupted && this.activeOutputStreamId && !this.clearBufferSentForActiveStream) {
      this.clearBufferSentForActiveStream = true;
      this.#emitBargeIn({
        source: "server_interrupted",
        interruptedStreamId: this.activeOutputStreamId
      });
    }

    const modelTurn = serverContent?.modelTurn || serverContent?.model_turn || null;
    const parts = Array.isArray(modelTurn?.parts) ? modelTurn.parts : [];
    const functionCalls = extractFunctionCalls({ message, serverContent, parts });

    for (const part of parts) {
      if (typeof part?.text === "string" && part.text.trim().length > 0) {
        this.pendingTextParts.push(part.text.trim());
      }

      const inlineData = extractInlineData(part);
      if (!inlineData) {
        continue;
      }

      const mimeType = String(inlineData.mimeType || "").toLowerCase();
      if (!mimeType.startsWith("audio/pcm")) {
        continue;
      }

      const streamId = this.#ensureActiveOutputStreamId();
      this.outputChunkIndex += 1;

      if (this.clearBufferSentForActiveStream) {
        this.#recordContinuedOutputAfterBargeIn(streamId);
      }

      this.onEvent({
        type: "audio_output",
        streamId,
        chunkIndex: this.outputChunkIndex,
        sampleRateHz: parseSampleRateFromMimeType(
          inlineData.mimeType,
          this.options.outputSampleRateHz
        ),
        channels: DEFAULT_CHANNELS,
        pcm16Base64: inlineData.data
      });
    }

    // Avoid `message.text` accessor because SDK can emit warnings for non-text parts
    // (audio inlineData). We rely on modelTurn parts + outputTranscription instead.

    const outputTranscription =
      serverContent?.outputTranscription?.text ||
      serverContent?.output_transcription?.text ||
      null;
    if (typeof outputTranscription === "string" && outputTranscription.trim().length > 0) {
      this.pendingTextParts.push(outputTranscription.trim());
    }

    for (const functionCall of functionCalls) {
      this.#emitToolCommand(functionCall);
    }

    if (serverContent?.turnComplete || serverContent?.turn_complete) {
      this.#flushPendingText();
      this.#emitOutputStreamEnd(serverContent?.interrupted ? "interrupted" : "completed");
    }
  }

  ingestAudioChunk(audioBuffer) {
    if (!audioBuffer || audioBuffer.length === 0) {
      return;
    }

    this.#refreshVisionAvailability();
    this.#handlePotentialBargeInFromInput();

    const audioMimeType =
      this.options.audioInputMimeType || `audio/pcm;rate=${this.options.inputSampleRateHz}`;
    const audioBlob = {
      data: audioBuffer.toString("base64"),
      mimeType: audioMimeType
    };

    this.#withSession("sendRealtimeInput(audio)", (session) => {
      session.sendRealtimeInput({
        audio: audioBlob
      });
    });
  }

  signalInputEnded() {
    this.#withSession("sendRealtimeInput(audioStreamEnd)", (session) => {
      session.sendRealtimeInput({
        audioStreamEnd: true
      });
    });
  }

  ingestVisionFrame({ imageBase64, mimeType, frameIndex, width, height, metadata = {} }) {
    if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
      return;
    }

    let imageBytes = null;
    try {
      imageBytes = Buffer.from(imageBase64, "base64");
    } catch (error) {
      this.logger.error(
        `Gemini Live vision frame decode failed for session ${this.sessionId}: ${toErrorMessage(error)}`
      );
      return;
    }

    if (!imageBytes || imageBytes.length === 0) {
      return;
    }

    const frameMimeType = mimeType || "image/jpeg";
    const parsedWidth = normalizeCoordinateValue(width);
    const parsedHeight = normalizeCoordinateValue(height);
    if (parsedWidth && parsedHeight) {
      this.lastVisionFrame = {
        width: parsedWidth,
        height: parsedHeight
      };
    }
    this.visionActive = true;
    this.hasVisionFrame = true;
    this.lastVisionFrameAt = Date.now();
    this.#sendVisionStatusContextNote(true);
    this.#sendVisionMetadataContextNote(metadata);

    const imageBlob = {
      data: imageBytes.toString("base64"),
      mimeType: frameMimeType
    };

    this.#withSession("sendRealtimeInput(media)", (session) => {
      session.sendRealtimeInput({
        media: imageBlob
      });
    });

    this.onEvent({
      type: "vision_input_ack",
      frameIndex: frameIndex || null,
      sceneKey: "live_frame",
      sceneLabel: "Live frame accepted",
      elements: [],
      width: width || null,
      height: height || null,
      metadata
    });
  }

  updateVisionStatus({ active, lastFrameTs = null } = {}) {
    this.visionActive = Boolean(active);
    if (this.visionActive) {
      const parsedLastFrameTs = Number(lastFrameTs);
      if (Number.isFinite(parsedLastFrameTs)) {
        this.lastVisionFrameAt = parsedLastFrameTs;
        this.hasVisionFrame = true;
      }
      if (this.hasVisionFrame && this.lastVisionFrameAt) {
        this.#sendVisionStatusContextNote(true);
      }
      return;
    }

    if (!this.visionActive) {
      this.lastVisionFrameAt = null;
      this.hasVisionFrame = false;
      this.#sendVisionStatusContextNote(false);
      this.lastVisionContextNote = "";
    }
  }

  handleUserText(text) {
    const normalized = String(text || "").trim();
    if (!normalized) {
      return;
    }

    const lowerPrompt = normalized.toLowerCase();
    if (isVisionDependentPrompt(lowerPrompt) && !this.#isVisionAvailable()) {
      this.#emitVisionUnavailable();
      return;
    }

    this.#withSession("sendClientContent(text)", (session) => {
      session.sendClientContent({
        turns: [
          {
            role: "user",
            parts: [{ text: normalized }]
          }
        ],
        turnComplete: true
      });
    });
  }

  close() {
    this.closed = true;
    this.pendingTextParts = [];
    this.#finalizeBargeInTelemetry({
      streamId: this.activeOutputStreamId,
      endReason: "session_closed"
    });
    this.activeOutputStreamId = null;
    this.outputChunkIndex = 0;
    this.clearBufferSentForActiveStream = false;

    if (!this.liveSession) {
      return;
    }

    try {
      this.liveSession.close();
    } catch (error) {
      this.logger.warn(
        `Gemini Live close failed for session ${this.sessionId}: ${toErrorMessage(error)}`
      );
    }
  }
}

module.exports = {
  GeminiLiveSession,
  DEFAULT_INPUT_SAMPLE_RATE_HZ,
  DEFAULT_OUTPUT_SAMPLE_RATE_HZ
};
