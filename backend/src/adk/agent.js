const { MockLiveSession } = require("./mockLiveSession");
const {
  GeminiLiveSession,
  DEFAULT_INPUT_SAMPLE_RATE_HZ,
  DEFAULT_OUTPUT_SAMPLE_RATE_HZ
} = require("./geminiLiveSession");

function buildToolDeclarations() {
  return [
    {
      name: "draw_highlight",
      description:
        "Highlight a UI element on the user's page. Use normalized coordinates for stable scaling.",
      parameters: {
        type: "OBJECT",
        properties: {
          x: {
            type: "NUMBER",
            description: "Horizontal position. Prefer normalized values between 0.0 and 1.0."
          },
          y: {
            type: "NUMBER",
            description: "Vertical position. Prefer normalized values between 0.0 and 1.0."
          },
          coordinate_type: {
            type: "STRING",
            enum: ["normalized", "pixel"],
            description: "Coordinate space of x/y values."
          },
          label: {
            type: "STRING",
            description:
              "Short visible label or purpose of the element, used to anchor the highlight to the correct DOM element when possible."
          }
        },
        required: ["x", "y"]
      }
    }
  ];
}

function buildRunnerConfig(env) {
  return {
    modalities: ["audio", "vision"],
    vadMode: env.vadMode,
    model: env.geminiLiveModel,
    fallbackModels: env.geminiLiveFallbackModels,
    gcpProjectId: env.gcpProjectId,
    gcpLocation: env.gcpLocation,
    toolDeclarations: buildToolDeclarations(),
    systemPrompt:
      "You are KindlyClick. You can hear the user and see their screen frames. Guide them step-by-step using spatial language and patience. When pointing to something, call draw_highlight with normalized coordinates and include a short label that matches the visible text or purpose of the target element."
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
          visionFrameTtlMs: env.visionFrameTtlMs,
          inputSampleRateHz: DEFAULT_INPUT_SAMPLE_RATE_HZ,
          outputSampleRateHz: DEFAULT_OUTPUT_SAMPLE_RATE_HZ,
          audioInputMimeType: `audio/pcm;rate=${DEFAULT_INPUT_SAMPLE_RATE_HZ}`,
          systemPrompt: runnerConfig.systemPrompt,
          toolDeclarations: runnerConfig.toolDeclarations
        }
      });
    }
  }

  return new MockLiveSession({
    sessionId,
    onEvent,
    options: {
      vadMode: env.vadMode,
      visionFrameTtlMs: env.visionFrameTtlMs,
      vadSilenceMs: env.mockVadSilenceMs,
      responseIntervalMs: env.mockResponseIntervalMs,
      responseChunks: env.mockResponseChunks
    }
  });
}

module.exports = {
  initializeAdkConnection,
  createLiveSession,
  buildRunnerConfig,
  buildToolDeclarations
};
