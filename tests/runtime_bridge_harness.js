const assert = require("assert");

const { createRuntimeCoordinator } = require("../extension/src/runtimeCoordinator.js");

function createClock() {
  let now = 1_700_000_000_000;
  return {
    now: () => now,
    tick: (ms = 1) => {
      now += ms;
      return now;
    }
  };
}

function run() {
  const clock = createClock();
  const coordinator = createRuntimeCoordinator({
    nowFn: () => clock.now(),
    formatLogLine: (text, ts) => `[${ts}] ${text}`,
    maxRuntimeLogLines: 5,
    maxLifecycleEvents: 8
  });

  coordinator.pushLifecycleEvent("create_requested");
  clock.tick(10);
  coordinator.pushLifecycleEvent("create_completed");
  clock.tick(10);
  coordinator.pushLifecycleEvent("booted", {
    target: "kindlyclick-offscreen-runtime"
  });
  clock.tick(10);
  coordinator.setRuntimeState({
    status: "connected",
    connected: true,
    sessionReady: true,
    activeWsUrl: "ws://127.0.0.1:8091/ws",
    sessionId: "runtime-session-1"
  });
  coordinator.setVisionState({
    active: true,
    frameCount: 3
  });
  coordinator.appendRuntimeLog("socket opened (ws://127.0.0.1:8091/ws)");
  clock.tick(10);
  coordinator.pushLifecycleEvent("command_dispatch", {
    command: "start-vision"
  });
  clock.tick(10);
  coordinator.pushLifecycleEvent("command_retry", {
    command: "start-vision"
  });
  clock.tick(10);
  coordinator.appendRuntimeLog("offscreen:command_retry command=start-vision");

  const snapshot = coordinator.getSnapshot();

  assert.equal(snapshot.runtimeState.connected, true);
  assert.equal(snapshot.runtimeState.sessionReady, true);
  assert.equal(snapshot.runtimeState.sessionId, "runtime-session-1");
  assert.equal(snapshot.visionState.active, true);
  assert.equal(snapshot.visionState.frameCount, 3);

  assert.equal(snapshot.offscreenLifecycle.status, "ready");
  assert.equal(snapshot.offscreenLifecycle.ready, true);
  assert.equal(snapshot.offscreenLifecycle.documentCreated, true);
  assert.equal(snapshot.offscreenLifecycle.createCount, 1);
  assert.equal(snapshot.offscreenLifecycle.readyCount, 1);
  assert.equal(snapshot.offscreenLifecycle.commandDispatchCount, 1);
  assert.equal(snapshot.offscreenLifecycle.commandRetryCount, 1);
  assert.equal(snapshot.offscreenLifecycle.lastCommand, "start-vision");
  assert.equal(snapshot.offscreenLifecycle.lastEvent, "command_retry");

  assert.equal(snapshot.logs.length, 2);
  assert.equal(snapshot.logs[0], "[1700000000060] offscreen:command_retry command=start-vision");
  assert.equal(snapshot.logs[1], "[1700000000030] socket opened (ws://127.0.0.1:8091/ws)");

  assert.equal(snapshot.lifecycleEvents.length, 5);
  assert.equal(snapshot.lifecycleEvents[0].event, "command_retry");
  assert.equal(snapshot.lifecycleEvents[1].event, "command_dispatch");
  assert.equal(snapshot.lifecycleEvents[2].event, "booted");

  console.log(
    `Runtime bridge harness passed: status=${snapshot.offscreenLifecycle.status} commands=${snapshot.offscreenLifecycle.commandDispatchCount}/${snapshot.offscreenLifecycle.commandRetryCount}`
  );
}

run();
