const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { createRequire } = require("module");

const backendRequire = createRequire(path.resolve(__dirname, "../backend/package.json"));
const WebSocket = backendRequire("ws");

const { AudioController } = require("../extension/src/audioController.js");

const BACKEND_ENTRY = path.resolve(__dirname, "../backend/src/server.js");
const SAMPLE_WAV_PATH = path.resolve(__dirname, "fixtures/sample_16k_mono.wav");
const ARTIFACT_DIR = path.resolve(__dirname, "artifacts");
const TIMELINE_PATH = path.resolve(ARTIFACT_DIR, "extension_timeline.json");
const PORT = Number(process.env.EXT_HARNESS_PORT || 8093);
const EXPECTED_RESPONSE_CHUNKS = Number(process.env.MOCK_RESPONSE_CHUNKS || 12);
let timelineGlobal = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(timeoutMs = 10000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Retry until timeout.
    }

    await sleep(200);
  }

  throw new Error("Backend health check timed out");
}

function parseWavPcm16Mono(buffer) {
  const riffTag = buffer.subarray(0, 4).toString("ascii");
  const waveTag = buffer.subarray(8, 12).toString("ascii");

  if (riffTag !== "RIFF" || waveTag !== "WAVE") {
    throw new Error("Invalid WAV: missing RIFF/WAVE tags");
  }

  const channels = buffer.readUInt16LE(22);
  const sampleRateHz = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);

  if (channels !== 1 || sampleRateHz !== 16000 || bitsPerSample !== 16) {
    throw new Error(
      `Expected 16kHz mono PCM16, received channels=${channels} sampleRate=${sampleRateHz} bits=${bitsPerSample}`
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
        channels,
        pcmBuffer: buffer.subarray(chunkStart, chunkEnd)
      };
    }

    offset = chunkEnd;
  }

  throw new Error("Invalid WAV: data chunk not found");
}

function splitPcmFrames(buffer, frameBytes = 640) {
  const frames = [];

  for (let offset = 0; offset < buffer.length; offset += frameBytes) {
    frames.push(buffer.subarray(offset, Math.min(offset + frameBytes, buffer.length)));
  }

  return frames;
}

class ScriptedMic {
  constructor(logFn) {
    this.logFn = logFn;
    this.onChunk = null;
  }

  async requestPermission() {
    return { token: "scripted-mic" };
  }

  async readPermissionState() {
    return "granted";
  }

  async start(_stream, onChunk) {
    this.onChunk = onChunk;
  }

  async stop() {
    this.onChunk = null;
  }

  releaseStream() {
    // No-op for scripted mic.
  }

  async emitFrames(frames, { rms = 0.04, intervalMs = 15 } = {}) {
    if (!this.onChunk) {
      throw new Error("Mic is not started");
    }

    this.logFn(`mic_emit_frames count=${frames.length}`);

    for (const frame of frames) {
      this.onChunk({
        pcm16Base64: frame.toString("base64"),
        rms
      });
      await sleep(intervalMs);
    }
  }
}

class SilentPlayer {
  constructor(logFn) {
    this.logFn = logFn;
    this.chunkCount = 0;
  }

  async enqueue() {
    this.chunkCount += 1;
  }

  clear() {
    this.logFn("player_clear");
  }
}

class Timeline {
  constructor() {
    this.events = [];
    this.waiters = [];
  }

  push(event) {
    this.events.push(event);

    const pending = [...this.waiters];
    for (const waiter of pending) {
      if (waiter.predicate(event)) {
        waiter.resolve(event);
        this.waiters = this.waiters.filter((entry) => entry !== waiter);
      }
    }
  }

  waitFor(predicate, timeoutMs = 6000, label = "event") {
    const existing = this.events.find(predicate);
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve: (event) => {
          clearTimeout(timer);
          resolve(event);
        }
      };

      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((entry) => entry !== waiter);
        reject(new Error(`Timed out waiting for ${label}`));
      }, timeoutMs);

      this.waiters.push(waiter);
    });
  }
}

async function writeTimeline(timeline) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  await fs.writeFile(TIMELINE_PATH, JSON.stringify(timeline.events, null, 2));
}

async function run() {
  const timeline = new Timeline();
  timelineGlobal = timeline;
  const backend = spawn(process.execPath, [BACKEND_ENTRY], {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: "127.0.0.1",
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
    const frames = splitPcmFrames(parsedWav.pcmBuffer, 640);

    const mic = new ScriptedMic((line) => {
      timeline.push({ ts: Date.now(), direction: "sys", event: line });
    });

    const player = new SilentPlayer((line) => {
      timeline.push({ ts: Date.now(), direction: "sys", event: line });
    });

    const controller = new AudioController({
      socketFactory: (url) => new WebSocket(url),
      mic: {
        requestPermission: () => mic.requestPermission(),
        readPermissionState: () => mic.readPermissionState(),
        start: (stream, onChunk) => mic.start(stream, onChunk),
        stop: () => mic.stop(),
        releaseStream: (stream) => mic.releaseStream(stream)
      },
      player,
      logFn: (text) => {
        timeline.push({ ts: Date.now(), direction: "log", message: text });
      },
      traceFn: (event) => {
        timeline.push(event);
      },
      config: {
        postTurnSuppressMs: 80,
        responseStartTimeoutMs: 2500,
        utteranceStartRmsThreshold: 0.005
      }
    });

    controller.connect(`ws://127.0.0.1:${PORT}/ws`);

    await timeline.waitFor(
      (event) => event.direction === "in" && event.message.type === "session_started",
      6000,
      "session_started"
    );

    await controller.requestMicrophonePermission();
    await controller.startMicrophone();

    const firstUtterance = frames.slice(0, 14);
    const secondUtterance = frames.slice(22, 34);

    await mic.emitFrames(firstUtterance);
    controller.endCurrentUtterance("harness first turn");

    const firstAudioChunk = await timeline.waitFor(
      (event) => event.direction === "in" && event.message.type === "audio_output",
      7000,
      "first audio_output"
    );

    const firstStreamId = firstAudioChunk.message.streamId;

    await sleep(160);
    await mic.emitFrames(secondUtterance);
    controller.endCurrentUtterance("harness second turn");

    await timeline.waitFor(
      (event) =>
        event.direction === "in" &&
        event.message.type === "clear_buffer" &&
        event.message.interruptedStreamId === firstStreamId,
      7000,
      "clear_buffer for first stream"
    );

    const secondAudioChunk = await timeline.waitFor(
      (event) =>
        event.direction === "in" &&
        event.message.type === "audio_output" &&
        event.message.streamId !== firstStreamId,
      7000,
      "second audio_output"
    );

    const secondStreamId = secondAudioChunk.message.streamId;

    const firstStreamChunks = timeline.events.filter((event) => {
      return (
        event.direction === "in" &&
        event.message.type === "audio_output" &&
        event.message.streamId === firstStreamId
      );
    }).length;

    if (firstStreamChunks >= EXPECTED_RESPONSE_CHUNKS) {
      throw new Error(
        `Expected first stream truncation. Received ${firstStreamChunks} chunks, expected < ${EXPECTED_RESPONSE_CHUNKS}.`
      );
    }

    await controller.stopMicrophone();
    await controller.disconnect();

    await writeTimeline(timeline);

    console.log(
      `Extension harness passed: firstStream=${firstStreamId} secondStream=${secondStreamId} firstStreamChunks=${firstStreamChunks}`
    );
    console.log(`Timeline written to ${TIMELINE_PATH}`);
  } finally {
    backend.kill("SIGTERM");
  }
}

run().catch(async (error) => {
  if (timelineGlobal) {
    try {
      await writeTimeline(timelineGlobal);
      console.error(`Timeline written to ${TIMELINE_PATH}`);
    } catch (writeError) {
      console.error("Failed to write timeline artifact", writeError);
    }
  }

  console.error("Extension harness failed", error);
  process.exitCode = 1;
});
