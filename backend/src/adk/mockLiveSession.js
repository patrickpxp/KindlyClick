const DEFAULT_SAMPLE_RATE_HZ = 16000;
const DEFAULT_CHANNELS = 1;

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

class MockLiveSession {
  constructor({ sessionId, onEvent, options }) {
    this.sessionId = sessionId;
    this.onEvent = onEvent;
    this.options = options;

    this.activeStream = null;
    this.inputDebounceTimer = null;
    this.pendingAudioBytes = 0;
    this.streamCounter = 0;
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
  }
}

module.exports = {
  MockLiveSession
};
