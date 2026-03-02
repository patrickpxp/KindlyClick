function loadEnv() {
  const port = Number(process.env.PORT || 8080);

  if (Number.isNaN(port)) {
    throw new Error("PORT must be a valid number");
  }

  return {
    nodeEnv: process.env.NODE_ENV || "development",
    port,
    gcpProjectId: process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "",
    firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || "(default)",
    useMockFirestore: process.env.USE_MOCK_FIRESTORE === "true"
  };
}

module.exports = {
  loadEnv
};
