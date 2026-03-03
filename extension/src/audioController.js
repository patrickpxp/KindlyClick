(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.KindlyClickAudioController = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const READY_STATE_OPEN = 1;

  function randomSessionId() {
    return `extension-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  function normalizeWebSocketUrl(rawValue) {
    const trimmed = String(rawValue || "").trim();

    if (!trimmed) {
      throw new Error("Backend WebSocket URL is required");
    }

    const parsed = new URL(trimmed);
    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
      throw new Error("WebSocket URL must start with ws:// or wss://");
    }

    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = "/ws";
    }

    return parsed.toString();
  }

  function describeMicStream(stream, fallbackState = "unknown") {
    const base = {
      state: fallbackState,
      label: "Unknown microphone",
      deviceId: "",
      groupId: "",
      sampleRate: null,
      channelCount: null
    };

    if (!stream || typeof stream.getAudioTracks !== "function") {
      return base;
    }

    const [track] = stream.getAudioTracks();
    if (!track) {
      return base;
    }

    const settings = typeof track.getSettings === "function" ? track.getSettings() : {};

    return {
      state: fallbackState,
      label: track.label || "Unknown microphone",
      deviceId: settings.deviceId || "",
      groupId: settings.groupId || "",
      sampleRate: settings.sampleRate || null,
      channelCount: settings.channelCount || null
    };
  }

  class AudioController {
    constructor({
      socketFactory,
      mic,
      player,
      logFn = () => {},
      stateFn = () => {},
      traceFn = () => {},
      nowFn = () => Date.now(),
      setTimeoutFn = setTimeout,
      clearTimeoutFn = clearTimeout,
      config = {}
    }) {
      if (typeof socketFactory !== "function") {
        throw new Error("socketFactory is required");
      }

      this.socketFactory = socketFactory;
      this.mic = mic;
      this.player = player;
      this.logFn = logFn;
      this.stateFn = stateFn;
      this.traceFn = traceFn;
      this.nowFn = nowFn;
      this.setTimeoutFn = setTimeoutFn;
      this.clearTimeoutFn = clearTimeoutFn;

      this.config = {
        targetSampleRate: config.targetSampleRate || 16000,
        targetChannels: config.targetChannels || 1,
        utteranceStartRmsThreshold:
          typeof config.utteranceStartRmsThreshold === "number"
            ? config.utteranceStartRmsThreshold
            : 0.018,
        postTurnSuppressMs:
          typeof config.postTurnSuppressMs === "number" ? config.postTurnSuppressMs : 1300,
        responseStartTimeoutMs:
          typeof config.responseStartTimeoutMs === "number" ? config.responseStartTimeoutMs : 3000
      };

      this.socket = null;
      this.connected = false;
      this.connecting = false;
      this.sessionId = null;
      this.sessionReady = false;
      this.activeWsUrl = "";

      this.grantedMicStream = null;
      this.micInfo = describeMicStream(null, "not_requested");
      this.micActive = false;
      this.micStarting = false;
      this.clientUtteranceChunkCount = 0;

      this.suppressCaptureUntilMs = 0;
      this.awaitingResponseStart = false;
      this.responseStartTimeoutId = null;
      this.activePlaybackStreamId = null;

      this.clientSeq = 0;
      this.status = "idle";
      this.visionFrameCounter = 0;

      this.emitState();
    }

    getSnapshot() {
      return {
        status: this.status,
        connected: this.connected,
        connecting: this.connecting,
        sessionReady: this.sessionReady,
        micActive: this.micActive,
        micStarting: this.micStarting,
        hasGrantedMicStream: Boolean(this.grantedMicStream),
        micInfo: this.micInfo,
        activeWsUrl: this.activeWsUrl,
        sessionId: this.sessionId
      };
    }

    emitState() {
      this.stateFn(this.getSnapshot());
    }

    log(text) {
      this.logFn(text);
    }

    trace(event) {
      this.traceFn({
        ts: this.nowFn(),
        ...event
      });
    }

    setStatus(status) {
      this.status = status;
      this.emitState();
    }

    isSocketOpen() {
      return Boolean(this.socket && this.socket.readyState === READY_STATE_OPEN);
    }

    send(payload) {
      if (!this.isSocketOpen()) {
        return;
      }

      this.clientSeq += 1;
      const message = {
        ...payload,
        _meta: {
          clientSeq: this.clientSeq,
          clientTs: this.nowFn()
        }
      };

      this.trace({ direction: "out", message });
      this.socket.send(JSON.stringify(message));
    }

    sendVisionFrame({
      imageBase64,
      mimeType = "image/jpeg",
      width = null,
      height = null,
      frameIndex = null,
      metadata = {}
    }) {
      if (!this.isSocketOpen() || !this.sessionReady) {
        return false;
      }

      if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
        return false;
      }

      this.visionFrameCounter += 1;

      this.send({
        type: "realtime_input",
        sessionId: this.sessionId,
        modality: "vision",
        imageBase64,
        mimeType,
        width,
        height,
        frameIndex: frameIndex || this.visionFrameCounter,
        metadata
      });

      return true;
    }

    sendUserText(text) {
      if (!this.isSocketOpen() || !this.sessionReady) {
        return false;
      }

      const normalizedText = String(text || "").trim();
      if (!normalizedText) {
        return false;
      }

      this.send({
        type: "user_text",
        sessionId: this.sessionId,
        text: normalizedText
      });

      return true;
    }

    connect(rawWsUrl) {
      if (this.connected || this.connecting) {
        return;
      }

      this.activeWsUrl = normalizeWebSocketUrl(rawWsUrl);
      this.connecting = true;
      this.sessionReady = false;
      this.sessionId = randomSessionId();
      this.setStatus("connecting");

      this.socket = this.socketFactory(this.activeWsUrl);

      this.socket.onopen = () => {
        this.connected = true;
        this.connecting = false;
        this.trace({ direction: "sys", event: "socket_open", url: this.activeWsUrl });
        this.log(`socket opened (${this.activeWsUrl})`);
        this.emitState();

        this.send({
          type: "session_start",
          sessionId: this.sessionId,
          userId: "extension-user",
          metadata: {
            source: "extension-sidepanel"
          }
        });
      };

      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.trace({ direction: "in", message });
          this.handleSocketMessage(message);
        } catch (error) {
          this.log(`invalid message: ${error.message}`);
        }
      };

      this.socket.onerror = () => {
        this.trace({ direction: "sys", event: "socket_error", url: this.activeWsUrl });
        this.log(`socket error (${this.activeWsUrl})`);
      };

      this.socket.onclose = (event) => {
        this.trace({
          direction: "sys",
          event: "socket_close",
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        });
        this.log(
          `socket closed code=${event.code} reason=${event.reason || "none"} clean=${event.wasClean}`
        );
        this.handleDisconnectCleanup();
      };
    }

    async disconnect() {
      if (this.micActive) {
        await this.stopMicrophone();
      }

      this.releaseGrantedStream();

      if (this.socket) {
        this.socket.close();
      }

      this.handleDisconnectCleanup();
    }

    handleDisconnectCleanup() {
      this.connected = false;
      this.connecting = false;
      this.sessionReady = false;
      this.socket = null;
      this.micInfo = describeMicStream(null, "not_requested");
      this.clearResponseStartTimeout();
      this.awaitingResponseStart = false;
      this.activePlaybackStreamId = null;
      this.player.clear();
      this.setStatus("disconnected");
      this.emitState();
    }

    clearResponseStartTimeout() {
      if (!this.responseStartTimeoutId) {
        return;
      }

      this.clearTimeoutFn(this.responseStartTimeoutId);
      this.responseStartTimeoutId = null;
    }

    releaseGrantedStream() {
      if (!this.grantedMicStream) {
        return;
      }

      this.mic.releaseStream(this.grantedMicStream);
      this.grantedMicStream = null;
    }

    async requestMicrophonePermission(options = {}) {
      if (this.micActive || this.micStarting) {
        return;
      }

      this.releaseGrantedStream();

      this.grantedMicStream = await this.mic.requestPermission(options);
      this.micInfo = describeMicStream(this.grantedMicStream, "ready");
      const permissionState = await this.mic.readPermissionState();
      this.log(`mic permission state: ${permissionState}`);
      this.log("microphone permission ready");
      this.emitState();
    }

    async startMicrophone() {
      if (!this.connected || !this.sessionReady || this.micActive || this.micStarting) {
        return;
      }

      if (!this.grantedMicStream) {
        this.log("mic not ready: click Request Mic first");
        return;
      }

      const stream = this.grantedMicStream;
      this.grantedMicStream = null;

      this.micStarting = true;
      this.emitState();

      try {
        this.clientUtteranceChunkCount = 0;
        this.suppressCaptureUntilMs = 0;

        await this.mic.start(stream, (chunk) => {
          this.onMicChunk(chunk);
        });

        this.micInfo = describeMicStream(stream, "active");
        this.micActive = true;
        this.setStatus("microphone streaming");
        this.log("microphone started");
      } catch (error) {
        this.mic.releaseStream(stream);
        throw error;
      } finally {
        this.micStarting = false;
        this.emitState();
      }
    }

    async stopMicrophone() {
      if (!this.micActive) {
        return;
      }

      this.endCurrentUtterance("manual stop");

      await this.mic.stop();
      this.micInfo = {
        ...this.micInfo,
        state: "ready"
      };
      this.clientUtteranceChunkCount = 0;
      this.micActive = false;
      this.setStatus("connected");
      this.log("microphone stopped");
      this.emitState();
    }

    onMicChunk({ pcm16Base64, rms = 1 }) {
      if (!this.isSocketOpen()) {
        return;
      }

      const now = this.nowFn();

      if (now < this.suppressCaptureUntilMs) {
        return;
      }

      if (this.awaitingResponseStart) {
        return;
      }

      if (
        this.clientUtteranceChunkCount === 0 &&
        typeof rms === "number" &&
        rms < this.config.utteranceStartRmsThreshold
      ) {
        return;
      }

      this.send({
        type: "audio_input",
        sessionId: this.sessionId,
        sampleRateHz: this.config.targetSampleRate,
        channels: this.config.targetChannels,
        pcm16Base64
      });

      this.clientUtteranceChunkCount += 1;
      if (this.clientUtteranceChunkCount === 1) {
        this.log("capturing utterance");
      }
    }

    endCurrentUtterance(reason = "manual end turn") {
      if (!this.isSocketOpen()) {
        return;
      }

      if (this.clientUtteranceChunkCount <= 0) {
        this.log("no active utterance to end");
        return;
      }

      this.send({
        type: "audio_input_end",
        sessionId: this.sessionId
      });

      this.clientUtteranceChunkCount = 0;
      this.suppressCaptureUntilMs = this.nowFn() + this.config.postTurnSuppressMs;
      this.awaitingResponseStart = true;
      this.clearResponseStartTimeout();
      this.responseStartTimeoutId = this.setTimeoutFn(() => {
        this.awaitingResponseStart = false;
        this.responseStartTimeoutId = null;
        this.log("response start timeout; capture unlocked");
      }, this.config.responseStartTimeoutMs);

      this.log(`utterance ended (${reason})`);
    }

    handleSocketMessage(message) {
      if (message.type === "session_started") {
        this.sessionReady = true;
        this.setStatus("connected");
        this.log(`session_started (${message.sessionId}) vadMode=${message.vadMode || "unknown"}`);
        this.emitState();
        return;
      }

      if (message.type === "audio_output") {
        if (this.awaitingResponseStart) {
          this.awaitingResponseStart = false;
          this.clearResponseStartTimeout();
        }

        // Once response playback has started, allow fresh user speech capture for barge-in.
        this.suppressCaptureUntilMs = 0;

        if (message.streamId !== this.activePlaybackStreamId) {
          this.activePlaybackStreamId = message.streamId;
          this.log(`audio_output_start (${message.streamId})`);
        }

        this.player.enqueue(message.pcm16Base64).catch((error) => {
          this.log(`playback error: ${error.message}`);
        });
        return;
      }

      if (message.type === "audio_output_end") {
        if (message.streamId === this.activePlaybackStreamId) {
          this.activePlaybackStreamId = null;
        }

        this.log(`audio_output_end (${message.streamId})`);
        return;
      }

      if (message.type === "clear_buffer") {
        this.awaitingResponseStart = false;
        this.clearResponseStartTimeout();
        this.activePlaybackStreamId = null;
        this.player.clear();
        this.log(`clear_buffer received (${message.reason})`);
        return;
      }

      if (message.type === "vision_input_ack") {
        return;
      }

      if (message.type === "text_output") {
        this.log(`assistant: ${message.text}`);
        return;
      }

      if (message.type === "vad_event") {
        this.log(`vad_event=${message.event}`);
        return;
      }

      if (message.type === "error") {
        const details = message.details ? ` (${message.details})` : "";
        this.log(`backend error: ${message.error}${details}`);
        return;
      }

      this.log(`message: ${JSON.stringify(message)}`);
    }
  }

  return {
    AudioController,
    normalizeWebSocketUrl
  };
});
