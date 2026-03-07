function loadEnv() {
  const port = Number(process.env.PORT || 8080);
  const geminiUseVertexAi = process.env.GEMINI_USE_VERTEXAI !== "false";
  const defaultLiveModel = geminiUseVertexAi
    ? "gemini-live-2.5-flash-native-audio"
    : "gemini-2.5-flash-native-audio-preview-12-2025";
  const defaultFallbackModels = geminiUseVertexAi
    ? [
        "gemini-live-2.5-flash-preview-native-audio-09-2025",
        "gemini-2.0-flash-live-preview-04-09"
      ]
    : ["gemini-live-2.5-flash-preview"];
  const fallbackModelsRaw = process.env.GEMINI_LIVE_FALLBACK_MODELS || "";
  const fallbackModels = fallbackModelsRaw
    ? fallbackModelsRaw
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : defaultFallbackModels;

  if (Number.isNaN(port)) {
    throw new Error("PORT must be a valid number");
  }

  return {
    nodeEnv: process.env.NODE_ENV || "development",
    port,
    host: process.env.HOST || "127.0.0.1",
    gcpProjectId: process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "",
    gcpLocation:
      process.env.GCP_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
    firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || "(default)",
    useMockFirestore: process.env.USE_MOCK_FIRESTORE === "true",
    acceptClientLogs: process.env.ACCEPT_CLIENT_LOGS !== "false",
    vadMode: process.env.VAD_MODE || "NATIVE_SERVER_VAD",
    visionFrameTtlMs: Number(process.env.VISION_FRAME_TTL_MS || 5000),
    mockVadSilenceMs: Number(process.env.MOCK_VAD_SILENCE_MS || 250),
    mockResponseIntervalMs: Number(process.env.MOCK_RESPONSE_INTERVAL_MS || 90),
    mockResponseChunks: Number(process.env.MOCK_RESPONSE_CHUNKS || 12),
    enableRealGeminiLive:
      process.env.ENABLE_REAL_GEMINI_LIVE === "true" ||
      process.env.ENABLE_REAL_ADK_LIVE === "true",
    geminiUseVertexAi,
    geminiLiveModel: process.env.GEMINI_LIVE_MODEL || defaultLiveModel,
    geminiLiveFallbackModels: fallbackModels,
    geminiApiVersion:
      process.env.GEMINI_API_VERSION ||
      process.env.GOOGLE_GENAI_API_VERSION ||
      (geminiUseVertexAi ? "v1" : "v1beta"),
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ""
  };
}

module.exports = {
  loadEnv
};
