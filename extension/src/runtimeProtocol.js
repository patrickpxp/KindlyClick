(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.KindlyClickRuntimeProtocol = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const OFFSCREEN_RUNTIME_TARGET = "kindlyclick-offscreen-runtime";
  const RUNTIME_COMMANDS = new Set([
    "connect",
    "disconnect",
    "set-log-relay",
    "start-mic",
    "stop-mic",
    "end-turn",
    "start-vision",
    "stop-vision",
    "ask-vision"
  ]);

  function isPlainObject(value) {
    if (!value || typeof value !== "object") {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function toObject(value) {
    return isPlainObject(value) ? { ...value } : {};
  }

  function toStringValue(value, fallback = "") {
    if (typeof value !== "string") {
      return fallback;
    }

    return value;
  }

  function toTrimmedString(value, fallback = "") {
    const text = toStringValue(value, fallback);
    return text.trim();
  }

  function toOptionalString(value) {
    const text = toTrimmedString(value);
    return text ? text : null;
  }

  function toBoolean(value, fallback = false) {
    return typeof value === "boolean" ? value : fallback;
  }

  function toFiniteNumber(value, fallback = null) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function toPositiveIntegerOrNull(value) {
    const numeric = toFiniteNumber(value, null);
    if (numeric === null) {
      return null;
    }

    const integer = Math.round(numeric);
    return integer > 0 ? integer : null;
  }

  function toNonNegativeInteger(value, fallback = 0) {
    const numeric = toFiniteNumber(value, fallback);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }

    return Math.max(0, Math.round(numeric));
  }

  function success(value) {
    return {
      ok: true,
      value
    };
  }

  function failure(error) {
    return {
      ok: false,
      error
    };
  }

  function normalizeMicInfo(micInfo) {
    const value = toObject(micInfo);

    return {
      state: toTrimmedString(value.state, "not_requested") || "not_requested",
      label: toStringValue(value.label, "Unknown microphone"),
      deviceId: toStringValue(value.deviceId, ""),
      groupId: toStringValue(value.groupId, ""),
      sampleRate: toPositiveIntegerOrNull(value.sampleRate),
      channelCount: toPositiveIntegerOrNull(value.channelCount)
    };
  }

  function normalizeRuntimeStateSnapshot(snapshot) {
    const value = toObject(snapshot);

    return {
      status: toTrimmedString(value.status, "idle") || "idle",
      connected: toBoolean(value.connected),
      connecting: toBoolean(value.connecting),
      sessionReady: toBoolean(value.sessionReady),
      micActive: toBoolean(value.micActive),
      micStarting: toBoolean(value.micStarting),
      hasGrantedMicStream: toBoolean(value.hasGrantedMicStream),
      micInfo: normalizeMicInfo(value.micInfo),
      activeWsUrl: toStringValue(value.activeWsUrl, ""),
      sessionId: toOptionalString(value.sessionId),
      clientLogForwardingEnabled: toBoolean(value.clientLogForwardingEnabled)
    };
  }

  function normalizeVisionStateSnapshot(visionState) {
    const value = toObject(visionState);

    return {
      active: toBoolean(value.active),
      frameCount: toNonNegativeInteger(value.frameCount, 0)
    };
  }

  function normalizeRuntimeCommandPayload(message) {
    const command = toTrimmedString(message.command);
    if (!RUNTIME_COMMANDS.has(command)) {
      return failure(`Unsupported runtime command: ${command || "undefined"}`);
    }

    const payload = {
      command,
      wsUrl: toTrimmedString(message.wsUrl),
      deviceId: toTrimmedString(message.deviceId),
      enabled: message.enabled,
      logRelayEnabled: message.logRelayEnabled
    };

    if (command === "connect" && !payload.wsUrl) {
      return failure("connect requires wsUrl");
    }

    if (command === "set-log-relay" && typeof payload.enabled !== "boolean") {
      return failure("set-log-relay requires boolean enabled");
    }

    if (typeof payload.enabled !== "boolean") {
      delete payload.enabled;
    }

    if (typeof payload.logRelayEnabled !== "boolean") {
      delete payload.logRelayEnabled;
    }

    return success(payload);
  }

  function parseRuntimeCommandRequest(message) {
    if (!isPlainObject(message) || message.type !== "kindlyclick:runtime-command") {
      return failure("Expected kindlyclick:runtime-command message");
    }

    return normalizeRuntimeCommandPayload(message);
  }

  function parseOffscreenCommandMessage(message) {
    if (!isPlainObject(message) || message.type !== "kindlyclick:offscreen-command") {
      return failure("Expected kindlyclick:offscreen-command message");
    }

    if (message.target !== OFFSCREEN_RUNTIME_TARGET) {
      return failure("Unexpected offscreen runtime target");
    }

    const parsedPayload = normalizeRuntimeCommandPayload(message);
    if (!parsedPayload.ok) {
      return parsedPayload;
    }

    return success({
      target: OFFSCREEN_RUNTIME_TARGET,
      ...parsedPayload.value
    });
  }

  function parseRuntimeStateUpdateMessage(message) {
    if (!isPlainObject(message) || message.type !== "kindlyclick:runtime-state-update") {
      return failure("Expected kindlyclick:runtime-state-update message");
    }

    return success(normalizeRuntimeStateSnapshot(message.snapshot));
  }

  function parseRuntimeVisionStateUpdateMessage(message) {
    if (
      !isPlainObject(message) ||
      message.type !== "kindlyclick:runtime-vision-state-update"
    ) {
      return failure("Expected kindlyclick:runtime-vision-state-update message");
    }

    return success(normalizeVisionStateSnapshot(message.visionState));
  }

  function parseRuntimeLogMessage(message) {
    if (!isPlainObject(message) || message.type !== "kindlyclick:runtime-log") {
      return failure("Expected kindlyclick:runtime-log message");
    }

    return success({
      text: String(message.text || "")
    });
  }

  function parseOffscreenLifecycleMessage(message) {
    if (!isPlainObject(message) || message.type !== "kindlyclick:offscreen-lifecycle") {
      return failure("Expected kindlyclick:offscreen-lifecycle message");
    }

    const event = toTrimmedString(message.event);
    if (!event) {
      return failure("offscreen lifecycle event is required");
    }

    return success({
      event,
      data: toObject(message.data)
    });
  }

  function parseRuntimeStateBroadcastMessage(message) {
    if (!isPlainObject(message) || message.type !== "kindlyclick:runtime-state-updated") {
      return failure("Expected kindlyclick:runtime-state-updated message");
    }

    return success(normalizeRuntimeStateSnapshot(message.snapshot));
  }

  function parseRuntimeVisionStateBroadcastMessage(message) {
    if (
      !isPlainObject(message) ||
      message.type !== "kindlyclick:runtime-vision-state-updated"
    ) {
      return failure("Expected kindlyclick:runtime-vision-state-updated message");
    }

    return success(normalizeVisionStateSnapshot(message.visionState));
  }

  function parseRuntimeLogEntryBroadcastMessage(message) {
    if (!isPlainObject(message) || message.type !== "kindlyclick:runtime-log-entry") {
      return failure("Expected kindlyclick:runtime-log-entry message");
    }

    return success({
      line: String(message.line || "")
    });
  }

  function parseBackendClientMessage(message) {
    if (!isPlainObject(message)) {
      return failure("WebSocket message must be an object");
    }

    const type = toTrimmedString(message.type);
    if (!type) {
      return failure("WebSocket message requires type");
    }

    if (type === "session_start") {
      const sessionId = toOptionalString(message.sessionId);
      const userId = toOptionalString(message.userId);

      if (!sessionId || !userId) {
        return failure("session_start requires sessionId and userId");
      }

      return success({
        type,
        sessionId,
        userId,
        metadata: toObject(message.metadata)
      });
    }

    if (type === "audio_input") {
      const pcm16Base64 = toTrimmedString(message.pcm16Base64);
      if (!pcm16Base64) {
        return failure("audio_input requires pcm16Base64");
      }

      return success({
        type,
        sessionId: toOptionalString(message.sessionId),
        sampleRateHz: toPositiveIntegerOrNull(message.sampleRateHz),
        channels: toPositiveIntegerOrNull(message.channels),
        pcm16Base64
      });
    }

    if (type === "audio_input_end") {
      return success({
        type,
        sessionId: toOptionalString(message.sessionId)
      });
    }

    if (type === "realtime_input") {
      if (message.modality !== "vision") {
        return failure("realtime_input currently supports only modality=vision");
      }

      const imageBase64 = toTrimmedString(message.imageBase64);
      if (!imageBase64) {
        return failure("realtime_input requires imageBase64");
      }

      return success({
        type,
        sessionId: toOptionalString(message.sessionId),
        modality: "vision",
        imageBase64,
        mimeType: toTrimmedString(message.mimeType, "image/jpeg") || "image/jpeg",
        width: toPositiveIntegerOrNull(message.width),
        height: toPositiveIntegerOrNull(message.height),
        frameIndex: toPositiveIntegerOrNull(message.frameIndex),
        mockScene: message.mockScene === undefined ? null : message.mockScene,
        metadata: toObject(message.metadata)
      });
    }

    if (type === "vision_status") {
      if (typeof message.active !== "boolean") {
        return failure("vision_status requires boolean active");
      }

      return success({
        type,
        sessionId: toOptionalString(message.sessionId),
        active: message.active,
        reason: toOptionalString(message.reason),
        lastFrameTs: toFiniteNumber(message.lastFrameTs, null)
      });
    }

    if (type === "user_text") {
      const text = toTrimmedString(message.text);
      if (!text) {
        return failure("user_text requires text");
      }

      return success({
        type,
        sessionId: toOptionalString(message.sessionId),
        text
      });
    }

    if (type === "ping") {
      return success({ type });
    }

    if (type === "client_log") {
      return success({
        type,
        sessionId: toOptionalString(message.sessionId),
        component: toTrimmedString(message.component, "unknown") || "unknown",
        level: toTrimmedString(message.level, "info") || "info",
        event: toTrimmedString(message.event, "log") || "log",
        clientTs: toFiniteNumber(message.clientTs, null),
        message: String(message.message || ""),
        data: isPlainObject(message.data) ? { ...message.data } : undefined
      });
    }

    return failure(`Unsupported message type: ${type}`);
  }

  function parseBackendServerMessage(message) {
    if (!isPlainObject(message)) {
      return failure("Backend message must be an object");
    }

    const type = toTrimmedString(message.type);
    if (!type) {
      return failure("Backend message requires type");
    }

    if (type === "session_started") {
      const sessionId = toOptionalString(message.sessionId);
      if (!sessionId) {
        return failure("session_started requires sessionId");
      }

      return success({
        type,
        sessionId,
        persisted: toBoolean(message.persisted),
        vadMode: toOptionalString(message.vadMode)
      });
    }

    if (type === "audio_output") {
      const pcm16Base64 = toTrimmedString(message.pcm16Base64);
      if (!pcm16Base64) {
        return failure("audio_output requires pcm16Base64");
      }

      return success({
        type,
        sessionId: toOptionalString(message.sessionId),
        streamId: toOptionalString(message.streamId),
        chunkIndex: toPositiveIntegerOrNull(message.chunkIndex),
        sampleRateHz: toPositiveIntegerOrNull(message.sampleRateHz),
        channels: toPositiveIntegerOrNull(message.channels),
        pcm16Base64
      });
    }

    if (type === "audio_output_end") {
      return success({
        type,
        sessionId: toOptionalString(message.sessionId),
        streamId: toOptionalString(message.streamId),
        reason: toOptionalString(message.reason)
      });
    }

    if (type === "clear_buffer") {
      return success({
        type,
        sessionId: toOptionalString(message.sessionId),
        reason: toOptionalString(message.reason),
        interruptedStreamId: toOptionalString(message.interruptedStreamId)
      });
    }

    if (type === "vision_input_ack") {
      return success({
        type,
        sessionId: toOptionalString(message.sessionId),
        frameIndex: toPositiveIntegerOrNull(message.frameIndex),
        sceneKey: toOptionalString(message.sceneKey),
        sceneLabel: toOptionalString(message.sceneLabel),
        elements: Array.isArray(message.elements) ? message.elements.slice() : []
      });
    }

    if (type === "vision_status_ack") {
      if (typeof message.active !== "boolean") {
        return failure("vision_status_ack requires boolean active");
      }

      return success({
        type,
        sessionId: toOptionalString(message.sessionId),
        active: message.active,
        reason: toOptionalString(message.reason)
      });
    }

    if (type === "text_output") {
      return success({
        type,
        sessionId: toOptionalString(message.sessionId),
        responseId: toOptionalString(message.responseId),
        text: String(message.text || "")
      });
    }

    if (type === "vad_event") {
      return success({
        type,
        sessionId: toOptionalString(message.sessionId),
        event: toTrimmedString(message.event, "unknown") || "unknown",
        vadMode: toOptionalString(message.vadMode),
        interruptedStreamId: toOptionalString(message.interruptedStreamId)
      });
    }

    if (type === "trace_event") {
      return success({
        type,
        sessionId: toOptionalString(message.sessionId),
        scope: toTrimmedString(message.scope, "unknown") || "unknown",
        event: toTrimmedString(message.event, "unknown") || "unknown",
        data: toObject(message.data),
        ts: toFiniteNumber(message.ts, null)
      });
    }

    if (type === "command") {
      return success({
        type,
        sessionId: toOptionalString(message.sessionId),
        commandId: toOptionalString(message.commandId),
        toolName: toOptionalString(message.toolName),
        action: toTrimmedString(message.action, "UNKNOWN_ACTION") || "UNKNOWN_ACTION",
        status: toTrimmedString(message.status, "success") || "success",
        args: toObject(message.args)
      });
    }

    if (type === "error") {
      return success({
        type,
        error: toTrimmedString(message.error, "Unknown backend error") || "Unknown backend error",
        details: toOptionalString(message.details)
      });
    }

    if (type === "pong") {
      return success({ type });
    }

    return failure(`Unsupported backend message type: ${type}`);
  }

  return {
    OFFSCREEN_RUNTIME_TARGET,
    normalizeRuntimeStateSnapshot,
    normalizeVisionStateSnapshot,
    parseRuntimeCommandRequest,
    parseOffscreenCommandMessage,
    parseRuntimeStateUpdateMessage,
    parseRuntimeVisionStateUpdateMessage,
    parseRuntimeLogMessage,
    parseOffscreenLifecycleMessage,
    parseRuntimeStateBroadcastMessage,
    parseRuntimeVisionStateBroadcastMessage,
    parseRuntimeLogEntryBroadcastMessage,
    parseBackendClientMessage,
    parseBackendServerMessage
  };
});
