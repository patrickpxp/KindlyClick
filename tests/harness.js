const fs = require("fs/promises");
const path = require("path");
const { createRequire } = require("module");
const { spawn } = require("child_process");

const BACKEND_ENTRY = path.resolve(__dirname, "../backend/src/server.js");
const FIXTURE_PATH = path.resolve(__dirname, "fixtures/sessionStart.json");
const SAMPLE_WAV_PATH = path.resolve(__dirname, "fixtures/sample_16k_mono.wav");
const PORT = Number(process.env.HARNESS_PORT || 8090);
const EXPECTED_RESPONSE_CHUNKS = Number(process.env.MOCK_RESPONSE_CHUNKS || 12);

const backendRequire = createRequire(path.resolve(__dirname, "../backend/package.json"));
const WebSocket = backendRequire("ws");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

    await sleep(250);
  }

  throw new Error("Backend health check timed out");
}

async function readFixture(sessionId) {
  const raw = await fs.readFile(FIXTURE_PATH, "utf8");
  const payload = JSON.parse(raw);
  payload.sessionId = sessionId;
  return payload;
}

function parseWavPcm16Mono(buffer) {
  const riffTag = buffer.subarray(0, 4).toString("ascii");
  const waveTag = buffer.subarray(8, 12).toString("ascii");

  if (riffTag !== "RIFF" || waveTag !== "WAVE") {
    throw new Error("Invalid WAV file: RIFF/WAVE tags missing");
  }

  const channelCount = buffer.readUInt16LE(22);
  const sampleRateHz = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);

  if (channelCount !== 1 || sampleRateHz !== 16000 || bitsPerSample !== 16) {
    throw new Error(
      `Expected 16kHz mono PCM16 WAV, received channels=${channelCount} sampleRate=${sampleRateHz} bits=${bitsPerSample}`
    );
  }

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;

    if (chunkId === "data") {
      return {
        sampleRateHz,
        channels: channelCount,
        pcmBuffer: buffer.subarray(chunkStart, chunkEnd)
      };
    }

    offset = chunkEnd;
  }

  throw new Error("Invalid WAV file: data chunk not found");
}

function splitPcmFrames(buffer, frameBytes = 640) {
  const frames = [];

  for (let offset = 0; offset < buffer.length; offset += frameBytes) {
    frames.push(buffer.subarray(offset, Math.min(offset + frameBytes, buffer.length)));
  }

  return frames;
}

function waitForMessage(ws, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error("Timed out waiting for WebSocket message"));
    }, timeoutMs);

    const onMessage = (raw) => {
      try {
        const message = JSON.parse(raw.toString());

        if (predicate(message)) {
          clearTimeout(timer);
          ws.off("message", onMessage);
          resolve(message);
        }
      } catch (error) {
        clearTimeout(timer);
        ws.off("message", onMessage);
        reject(error);
      }
    };

    ws.on("message", onMessage);
  });
}

function waitForOpen(ws, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WebSocket open timed out")), timeoutMs);

    ws.on("open", () => {
      clearTimeout(timer);
      resolve();
    });

    ws.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function sendAudioFrames(ws, sessionId, frames, sampleRateHz, channels, delayMs = 20) {
  for (const frame of frames) {
    ws.send(
      JSON.stringify({
        type: "audio_input",
        sessionId,
        sampleRateHz,
        channels,
        pcm16Base64: frame.toString("base64")
      })
    );

    await sleep(delayMs);
  }
}

async function runInterruptionScenario(ws, sessionId, parsedWav) {
  const frames = splitPcmFrames(parsedWav.pcmBuffer, 640);

  if (frames.length < 30) {
    throw new Error("Sample WAV must contain at least 30 frames for interruption scenario");
  }

  const firstUtterance = frames.slice(0, 12);
  const secondUtterance = frames.slice(16, 26);

  return new Promise((resolve, reject) => {
    const state = {
      firstStreamId: null,
      secondStreamId: null,
      firstStreamChunks: 0,
      secondStreamChunks: 0,
      firstStreamEnded: false,
      clearBufferReceived: false,
      secondInjected: false
    };

    const timeout = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error(`Interruption scenario timed out: ${JSON.stringify(state)}`));
    }, 12000);

    const finalize = () => {
      clearTimeout(timeout);
      ws.off("message", onMessage);

      if (!state.firstStreamId) {
        reject(new Error("No response audio was produced for first utterance"));
        return;
      }

      if (!state.clearBufferReceived) {
        reject(new Error("Expected clear_buffer signal when second utterance started"));
        return;
      }

      if (!state.secondStreamId) {
        reject(new Error("No second response stream was produced after interruption"));
        return;
      }

      if (state.firstStreamChunks >= EXPECTED_RESPONSE_CHUNKS) {
        reject(
          new Error(
            `First stream was not truncated: chunks=${state.firstStreamChunks} expected<${EXPECTED_RESPONSE_CHUNKS}`
          )
        );
        return;
      }

      if (state.firstStreamEnded) {
        reject(new Error("First stream unexpectedly completed instead of being interrupted"));
        return;
      }

      resolve(state);
    };

    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString());

      if (message.type === "audio_output") {
        if (!state.firstStreamId) {
          state.firstStreamId = message.streamId;
        }

        if (message.streamId === state.firstStreamId) {
          state.firstStreamChunks += 1;

          if (state.firstStreamChunks === 1 && !state.secondInjected) {
            state.secondInjected = true;
            sendAudioFrames(
              ws,
              sessionId,
              secondUtterance,
              parsedWav.sampleRateHz,
              parsedWav.channels
            ).catch((error) => {
              clearTimeout(timeout);
              ws.off("message", onMessage);
              reject(error);
            });
          }
          return;
        }

        if (!state.secondStreamId) {
          state.secondStreamId = message.streamId;
        }

        if (message.streamId === state.secondStreamId) {
          state.secondStreamChunks += 1;

          if (state.clearBufferReceived && state.secondStreamChunks >= 3) {
            setTimeout(finalize, 250);
          }
        }
        return;
      }

      if (message.type === "audio_output_end" && message.streamId === state.firstStreamId) {
        state.firstStreamEnded = true;
        return;
      }

      if (message.type === "clear_buffer" && message.interruptedStreamId === state.firstStreamId) {
        state.clearBufferReceived = true;
      }
    };

    ws.on("message", onMessage);

    sendAudioFrames(ws, sessionId, firstUtterance, parsedWav.sampleRateHz, parsedWav.channels).catch(
      (error) => {
        clearTimeout(timeout);
        ws.off("message", onMessage);
        reject(error);
      }
    );
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

    const wavBuffer = await fs.readFile(SAMPLE_WAV_PATH);
    const parsedWav = parseWavPcm16Mono(wavBuffer);

    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    await waitForOpen(ws);

    const sessionStartPayload = await readFixture(sessionId);
    ws.send(JSON.stringify(sessionStartPayload));

    await waitForMessage(ws, (message) => {
      return message.type === "session_started" && message.sessionId === sessionId;
    });

    await verifyPersistedSession(sessionId);
    const scenario = await runInterruptionScenario(ws, sessionId, parsedWav);

    ws.close();

    console.log(
      `Harness passed: barge-in verified (firstStreamChunks=${scenario.firstStreamChunks}, secondStreamChunks=${scenario.secondStreamChunks}).`
    );
  } finally {
    backend.kill("SIGTERM");
  }
}

run().catch((error) => {
  console.error("Harness failed", error);
  process.exit(1);
});
