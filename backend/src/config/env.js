function loadEnv() {
  const port = Number(process.env.PORT || 8080);

  if (Number.isNaN(port)) {
    throw new Error("PORT must be a valid number");
  }

  return {
    nodeEnv: process.env.NODE_ENV || "development",
    port,
    host: process.env.HOST || "127.0.0.1",
    gcpProjectId: process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "",
    firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || "(default)",
    useMockFirestore: process.env.USE_MOCK_FIRESTORE === "true",
    vadMode: process.env.VAD_MODE || "NATIVE_SERVER_VAD",
    mockVadSilenceMs: Number(process.env.MOCK_VAD_SILENCE_MS || 250),
    mockResponseIntervalMs: Number(process.env.MOCK_RESPONSE_INTERVAL_MS || 90),
    mockResponseChunks: Number(process.env.MOCK_RESPONSE_CHUNKS || 12),
    enableRealAdkLive: process.env.ENABLE_REAL_ADK_LIVE === "true"
  };
}

module.exports = {
  loadEnv
};
