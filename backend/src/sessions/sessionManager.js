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
}

module.exports = {
  SessionManager
};
