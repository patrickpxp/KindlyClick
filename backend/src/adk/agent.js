const { MockLiveSession } = require("./mockLiveSession");

function buildRunnerConfig(env) {
  return {
    modalities: ["audio", "vision"],
    vadMode: env.vadMode,
    systemPrompt:
      "You are KindlyClick. You can hear the user and see their screen frames. Guide them step-by-step using spatial language and patience."
  };
}

async function initializeAdkConnection(logger = console) {
  try {
    const adkModule = await import("@google/adk");
    logger.info("ADK module loaded.");

    return {
      status: "connected",
      module: adkModule
    };
  } catch (error) {
    logger.warn(
      "ADK module is not installed yet; backend is running with a skeleton adapter.",
      error.message
    );

    return {
      status: "skeleton",
      module: null
    };
  }
}

function createLiveSession({ adkState, env, sessionId, onEvent, logger = console }) {
  const runnerConfig = buildRunnerConfig(env);

  if (adkState.status === "connected" && env.enableRealAdkLive) {
    logger.warn(
      "Real ADK Live stream wiring is not enabled in this repository yet; using deterministic mock stream."
    );
    logger.info("Configured ADK Runner", runnerConfig);
  }

  return new MockLiveSession({
    sessionId,
    onEvent,
    options: {
      vadMode: env.vadMode,
      vadSilenceMs: env.mockVadSilenceMs,
      responseIntervalMs: env.mockResponseIntervalMs,
      responseChunks: env.mockResponseChunks
    }
  });
}

module.exports = {
  initializeAdkConnection,
  createLiveSession,
  buildRunnerConfig
};
