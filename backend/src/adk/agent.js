const { MockLiveSession } = require("./mockLiveSession");
const {
  GeminiLiveSession,
  DEFAULT_INPUT_SAMPLE_RATE_HZ,
  DEFAULT_OUTPUT_SAMPLE_RATE_HZ
} = require("./geminiLiveSession");

function buildRunnerConfig(env) {
  return {
    modalities: ["audio", "vision"],
    vadMode: env.vadMode,
    model: env.geminiLiveModel,
    fallbackModels: env.geminiLiveFallbackModels,
    gcpProjectId: env.gcpProjectId,
    gcpLocation: env.gcpLocation,
    systemPrompt:
      "You are KindlyClick. You can hear the user and see their screen frames. Guide them step-by-step using spatial language and patience."
  };
}

async function initializeAdkConnection(logger = console) {
  try {
    const genaiModule = await import("@google/genai");
    logger.info("Gemini SDK module loaded.");

    return {
      status: "connected",
      module: genaiModule
    };
  } catch (error) {
    logger.warn(
      "Gemini SDK module is not installed yet; backend is running with a skeleton adapter.",
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

  if (env.enableRealGeminiLive) {
    if (adkState.status !== "connected") {
      logger.warn("ENABLE_REAL_GEMINI_LIVE=true but Gemini SDK is unavailable; using mock stream.");
    } else if (!env.gcpProjectId && env.geminiUseVertexAi) {
      logger.warn(
        "ENABLE_REAL_GEMINI_LIVE=true but GCP project is missing for Vertex AI; using mock stream."
      );
    } else {
      logger.info("Configured Gemini Live Runner", runnerConfig);
      return new GeminiLiveSession({
        sessionId,
        onEvent,
        logger,
        genaiModule: adkState.module,
        options: {
          model: env.geminiLiveModel,
          fallbackModels: env.geminiLiveFallbackModels,
          apiVersion: env.geminiApiVersion,
          gcpProjectId: env.gcpProjectId,
          gcpLocation: env.gcpLocation,
          useVertexAi: env.geminiUseVertexAi,
          apiKey: env.geminiApiKey,
          vadMode: env.vadMode,
          inputSampleRateHz: DEFAULT_INPUT_SAMPLE_RATE_HZ,
          outputSampleRateHz: DEFAULT_OUTPUT_SAMPLE_RATE_HZ,
          audioInputMimeType: `audio/pcm;rate=${DEFAULT_INPUT_SAMPLE_RATE_HZ}`,
          systemPrompt: runnerConfig.systemPrompt
        }
      });
    }
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
