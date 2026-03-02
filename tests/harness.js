const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const WebSocket = require("ws");

const BACKEND_ENTRY = path.resolve(__dirname, "../backend/src/server.js");
const FIXTURE_PATH = path.resolve(__dirname, "fixtures/sessionStart.json");
const PORT = Number(process.env.HARNESS_PORT || 8090);

async function waitForHealth(timeoutMs = 10000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Ignore until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Backend health check timed out");
}

async function readFixture(sessionId) {
  const raw = await fs.readFile(FIXTURE_PATH, "utf8");
  const payload = JSON.parse(raw);
  payload.sessionId = sessionId;
  return payload;
}

async function sendSessionStart(sessionId) {
  const payload = await readFixture(sessionId);

  await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);

    ws.on("open", () => {
      ws.send(JSON.stringify(payload));
    });

    ws.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString());

        if (message.type === "session_started" && message.sessionId === sessionId) {
          ws.close();
          resolve();
          return;
        }

        reject(new Error(`Unexpected WS response: ${raw.toString()}`));
      } catch (error) {
        reject(error);
      }
    });

    ws.on("error", reject);
  });
}

async function verifyPersistedSession(sessionId) {
  const response = await fetch(`http://127.0.0.1:${PORT}/debug/sessions/${sessionId}`);

  if (!response.ok) {
    throw new Error(`Session lookup failed with status ${response.status}`);
  }

  const session = await response.json();

  if (session.sessionId !== sessionId || session.state !== "active") {
    throw new Error(`Session payload mismatch: ${JSON.stringify(session)}`);
  }
}

async function run() {
  const sessionId = `harness-${Date.now()}`;

  const backend = spawn(process.execPath, [BACKEND_ENTRY], {
    env: {
      ...process.env,
      PORT: String(PORT),
      USE_MOCK_FIRESTORE: "true"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  backend.stdout.on("data", (chunk) => {
    process.stdout.write(`[backend] ${chunk}`);
  });

  backend.stderr.on("data", (chunk) => {
    process.stderr.write(`[backend] ${chunk}`);
  });

  try {
    await waitForHealth();
    await sendSessionStart(sessionId);
    await verifyPersistedSession(sessionId);
    console.log(`Harness passed: session ${sessionId} created and persisted.`);
  } finally {
    backend.kill("SIGTERM");
  }
}

run().catch((error) => {
  console.error("Harness failed", error);
  process.exit(1);
});
