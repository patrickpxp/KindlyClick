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
            systemInstruction: this.options.systemPrompt
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

    this.onEvent({
      type: "audio_output_end",
      streamId: this.activeOutputStreamId,
      reason
    });

    this.activeOutputStreamId = null;
    this.outputChunkIndex = 0;
    this.clearBufferSentForActiveStream = false;
  }

  #emitBargeIn(interruptedStreamId = null) {
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
    this.#emitBargeIn(interruptedStreamId);
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
        this.#emitBargeIn(this.activeOutputStreamId);
      } else {
        this.#emitBargeIn(null);
      }
    }

    const serverContent = message.serverContent || message.server_content || null;

    if (serverContent?.interrupted && this.activeOutputStreamId && !this.clearBufferSentForActiveStream) {
      this.clearBufferSentForActiveStream = true;
      this.#emitBargeIn(this.activeOutputStreamId);
    }

    const modelTurn = serverContent?.modelTurn || serverContent?.model_turn || null;
    const parts = Array.isArray(modelTurn?.parts) ? modelTurn.parts : [];

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

    if (typeof message.text === "string" && message.text.trim().length > 0) {
      this.pendingTextParts.push(message.text.trim());
    }

    const outputTranscription =
      serverContent?.outputTranscription?.text ||
      serverContent?.output_transcription?.text ||
      null;
    if (typeof outputTranscription === "string" && outputTranscription.trim().length > 0) {
      this.pendingTextParts.push(outputTranscription.trim());
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

  handleUserText(text) {
    const normalized = String(text || "").trim();
    if (!normalized) {
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
