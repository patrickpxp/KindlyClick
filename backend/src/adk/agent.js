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

module.exports = {
  initializeAdkConnection
};
