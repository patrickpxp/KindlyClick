(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.KindlyClickRuntimeCoordinator = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createDefaultRuntimeStateSnapshot() {
    return {
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
  }

  function createDefaultRuntimeVisionStateSnapshot() {
    return {
      active: false,
      frameCount: 0
    };
  }

  function createDefaultOffscreenLifecycleSnapshot() {
    return {
      status: "idle",
      ready: false,
      documentCreated: false,
      createCount: 0,
      readyCount: 0,
      commandDispatchCount: 0,
      commandRetryCount: 0,
      lastCommand: "",
      lastCommandAt: null,
      createdAt: null,
      lastReadyAt: null,
      lastEventAt: null,
      lastError: "",
      lastEvent: ""
    };
  }

  function defaultFormatLogLine(text, ts) {
    return `[${new Date(ts).toLocaleTimeString()}] ${String(text || "")}`;
  }

  function createRuntimeCoordinator({
    nowFn = () => Date.now(),
    formatLogLine = defaultFormatLogLine,
    maxRuntimeLogLines = 60,
    maxLifecycleEvents = 25
  } = {}) {
    let runtimeStateSnapshot = createDefaultRuntimeStateSnapshot();
    let runtimeVisionStateSnapshot = createDefaultRuntimeVisionStateSnapshot();
    let offscreenLifecycleSnapshot = createDefaultOffscreenLifecycleSnapshot();
    let runtimeLogLines = [];
    let lifecycleEvents = [];

    function getSnapshot() {
      return {
        runtimeState: cloneJson(runtimeStateSnapshot),
        visionState: cloneJson(runtimeVisionStateSnapshot),
        logs: runtimeLogLines.slice(),
        offscreenLifecycle: cloneJson(offscreenLifecycleSnapshot),
        lifecycleEvents: cloneJson(lifecycleEvents)
      };
    }

    function setRuntimeState(snapshot) {
      runtimeStateSnapshot = {
        ...createDefaultRuntimeStateSnapshot(),
        ...(snapshot || {})
      };

      return cloneJson(runtimeStateSnapshot);
    }

    function setVisionState(visionState) {
      runtimeVisionStateSnapshot = {
        ...createDefaultRuntimeVisionStateSnapshot(),
        ...(visionState || {})
      };

      return cloneJson(runtimeVisionStateSnapshot);
    }

    function appendRuntimeLog(text) {
      const ts = nowFn();
      const line = formatLogLine(text, ts);
      runtimeLogLines = [line].concat(runtimeLogLines).slice(0, maxRuntimeLogLines);
      return line;
    }

    function pushLifecycleEvent(event, data = {}) {
      const ts = nowFn();
      const entry = {
        ts,
        event: String(event || "").trim(),
        data: cloneJson(data || {})
      };

      lifecycleEvents = [entry].concat(lifecycleEvents).slice(0, maxLifecycleEvents);
      offscreenLifecycleSnapshot.lastEvent = entry.event;
      offscreenLifecycleSnapshot.lastEventAt = ts;

      switch (entry.event) {
        case "create_requested":
          offscreenLifecycleSnapshot.status = "creating";
          offscreenLifecycleSnapshot.ready = false;
          offscreenLifecycleSnapshot.documentCreated = false;
          offscreenLifecycleSnapshot.lastError = "";
          break;
        case "create_completed":
          offscreenLifecycleSnapshot.status = "created";
          offscreenLifecycleSnapshot.ready = false;
          offscreenLifecycleSnapshot.documentCreated = true;
          offscreenLifecycleSnapshot.createCount += 1;
          offscreenLifecycleSnapshot.createdAt = offscreenLifecycleSnapshot.createdAt || ts;
          offscreenLifecycleSnapshot.lastError = "";
          break;
        case "create_skipped_existing":
          offscreenLifecycleSnapshot.status = offscreenLifecycleSnapshot.ready ? "ready" : "existing";
          offscreenLifecycleSnapshot.documentCreated = true;
          offscreenLifecycleSnapshot.lastError = "";
          break;
        case "booted":
          offscreenLifecycleSnapshot.status = "ready";
          offscreenLifecycleSnapshot.ready = true;
          offscreenLifecycleSnapshot.documentCreated = true;
          offscreenLifecycleSnapshot.readyCount += 1;
          offscreenLifecycleSnapshot.lastReadyAt = ts;
          offscreenLifecycleSnapshot.lastError = "";
          break;
        case "pagehide":
        case "unloaded":
          offscreenLifecycleSnapshot.status = "stopped";
          offscreenLifecycleSnapshot.ready = false;
          break;
        case "command_dispatch":
          offscreenLifecycleSnapshot.commandDispatchCount += 1;
          offscreenLifecycleSnapshot.lastCommand = String(data.command || "");
          offscreenLifecycleSnapshot.lastCommandAt = ts;
          break;
        case "command_retry":
          offscreenLifecycleSnapshot.commandRetryCount += 1;
          offscreenLifecycleSnapshot.lastCommand = String(data.command || "");
          offscreenLifecycleSnapshot.lastCommandAt = ts;
          break;
        case "create_error":
        case "command_error":
          offscreenLifecycleSnapshot.status = "error";
          offscreenLifecycleSnapshot.ready = false;
          offscreenLifecycleSnapshot.lastError = String(data.error || "Unknown offscreen error");
          break;
        default:
          break;
      }

      return entry;
    }

    return {
      getSnapshot,
      setRuntimeState,
      setVisionState,
      appendRuntimeLog,
      pushLifecycleEvent
    };
  }

  return {
    createDefaultRuntimeStateSnapshot,
    createDefaultRuntimeVisionStateSnapshot,
    createDefaultOffscreenLifecycleSnapshot,
    createRuntimeCoordinator
  };
});
