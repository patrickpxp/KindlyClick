class SessionManager {
  constructor(firestore) {
    this.collection = firestore.collection("sessions");
  }

  async startSession({ sessionId, userId, metadata = {} }) {
    const now = new Date().toISOString();
    const record = {
      sessionId,
      userId,
      metadata,
      state: "active",
      createdAt: now,
      updatedAt: now
    };

    await this.collection.doc(sessionId).set(record, { merge: true });

    return record;
  }

  async getSession(sessionId) {
    const snapshot = await this.collection.doc(sessionId).get();

    if (!snapshot.exists) {
      return null;
    }

    return snapshot.data();
  }

  async appendToolCall({ sessionId, toolName, action, args = {}, status = "success" }) {
    const docRef = this.collection.doc(sessionId);
    const snapshot = await docRef.get();
    const existing = snapshot.exists ? snapshot.data() : {};
    const toolCalls = Array.isArray(existing.toolCalls) ? existing.toolCalls : [];
    const now = new Date().toISOString();

    const nextToolCalls = toolCalls.concat([
      {
        toolName: String(toolName || "unknown_tool"),
        action: String(action || "UNKNOWN_ACTION"),
        args,
        status,
        ts: now
      }
    ]);

    await docRef.set(
      {
        updatedAt: now,
        toolCalls: nextToolCalls
      },
      { merge: true }
    );

    return nextToolCalls[nextToolCalls.length - 1];
  }
}

module.exports = {
  SessionManager
};
