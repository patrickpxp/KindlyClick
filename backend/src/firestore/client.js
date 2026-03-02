const { Firestore } = require("@google-cloud/firestore");

class MockDocumentSnapshot {
  constructor(data) {
    this._data = data;
  }

  get exists() {
    return Boolean(this._data);
  }

  data() {
    return this._data;
  }
}

class MockDocumentRef {
  constructor(store, id) {
    this.store = store;
    this.id = id;
  }

  async set(value, options = {}) {
    if (options.merge && this.store.has(this.id)) {
      this.store.set(this.id, {
        ...this.store.get(this.id),
        ...value
      });
      return;
    }

    this.store.set(this.id, value);
  }

  async get() {
    return new MockDocumentSnapshot(this.store.get(this.id));
  }
}

class MockCollectionRef {
  constructor(store) {
    this.store = store;
  }

  doc(id) {
    return new MockDocumentRef(this.store, id);
  }
}

class MockFirestore {
  constructor() {
    this.collections = new Map();
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }

    return new MockCollectionRef(this.collections.get(name));
  }
}

let mockFirestoreSingleton = null;

function createFirestoreClient(env) {
  if (env.useMockFirestore) {
    if (!mockFirestoreSingleton) {
      mockFirestoreSingleton = new MockFirestore();
    }

    return mockFirestoreSingleton;
  }

  return new Firestore({
    projectId: env.gcpProjectId || undefined,
    databaseId: env.firestoreDatabaseId
  });
}

module.exports = {
  createFirestoreClient
};
