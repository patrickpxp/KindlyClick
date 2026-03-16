const assert = require("assert");

const runtimeProtocol = require("../extension/src/runtimeProtocol.js");

function run() {
  const runtimeState = runtimeProtocol.normalizeRuntimeStateSnapshot({
    status: "connected",
    connected: true,
    sessionReady: true,
    micInfo: {
      state: "active",
      label: "USB Mic",
      sampleRate: "16000",
      channelCount: 1
    },
    sessionId: "session-1",
    clientLogForwardingEnabled: "nope"
  });

  assert.equal(runtimeState.status, "connected");
  assert.equal(runtimeState.connected, true);
  assert.equal(runtimeState.micInfo.sampleRate, 16000);
  assert.equal(runtimeState.clientLogForwardingEnabled, false);

  const runtimeCommand = runtimeProtocol.parseRuntimeCommandRequest({
    type: "kindlyclick:runtime-command",
    command: "connect",
    wsUrl: "ws://127.0.0.1:8091/ws",
    logRelayEnabled: true
  });
  assert.equal(runtimeCommand.ok, true);
  assert.equal(runtimeCommand.value.command, "connect");
  assert.equal(runtimeCommand.value.logRelayEnabled, true);

  const invalidRuntimeCommand = runtimeProtocol.parseRuntimeCommandRequest({
    type: "kindlyclick:runtime-command",
    command: "connect"
  });
  assert.equal(invalidRuntimeCommand.ok, false);
  assert.match(invalidRuntimeCommand.error, /wsUrl/);

  const offscreenCommand = runtimeProtocol.parseOffscreenCommandMessage({
    type: "kindlyclick:offscreen-command",
    target: runtimeProtocol.OFFSCREEN_RUNTIME_TARGET,
    command: "set-log-relay",
    enabled: false
  });
  assert.equal(offscreenCommand.ok, true);
  assert.equal(offscreenCommand.value.enabled, false);

  const invalidOffscreenTarget = runtimeProtocol.parseOffscreenCommandMessage({
    type: "kindlyclick:offscreen-command",
    target: "wrong-target",
    command: "disconnect"
  });
  assert.equal(invalidOffscreenTarget.ok, false);
  assert.match(invalidOffscreenTarget.error, /target/);

  const backendClientMessage = runtimeProtocol.parseBackendClientMessage({
    type: "realtime_input",
    sessionId: "session-1",
    modality: "vision",
    imageBase64: "AAAA",
    width: "1280",
    height: 720,
    frameIndex: 3,
    metadata: {
      pageTitle: "Dashboard"
    }
  });
  assert.equal(backendClientMessage.ok, true);
  assert.equal(backendClientMessage.value.width, 1280);
  assert.deepEqual(backendClientMessage.value.metadata, { pageTitle: "Dashboard" });

  const invalidBackendClientMessage = runtimeProtocol.parseBackendClientMessage({
    type: "user_text",
    text: "   "
  });
  assert.equal(invalidBackendClientMessage.ok, false);
  assert.match(invalidBackendClientMessage.error, /requires text/);

  const backendServerMessage = runtimeProtocol.parseBackendServerMessage({
    type: "command",
    commandId: "cmd-1",
    toolName: "highlight",
    action: "DRAW_HIGHLIGHT",
    status: "success",
    args: {
      x: 1,
      y: 2
    }
  });
  assert.equal(backendServerMessage.ok, true);
  assert.equal(backendServerMessage.value.action, "DRAW_HIGHLIGHT");
  assert.deepEqual(backendServerMessage.value.args, { x: 1, y: 2 });

  const invalidBackendServerMessage = runtimeProtocol.parseBackendServerMessage({
    type: "audio_output",
    streamId: "stream-1"
  });
  assert.equal(invalidBackendServerMessage.ok, false);
  assert.match(invalidBackendServerMessage.error, /pcm16Base64/);

  console.log("Runtime protocol harness passed: runtime and WebSocket schemas normalize cleanly");
}

run();
