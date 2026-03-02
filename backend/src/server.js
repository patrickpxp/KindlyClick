const http = require("http");
const { WebSocketServer } = require("ws");

const { loadEnv } = require("./config/env");
const { createFirestoreClient } = require("./firestore/client");
const { SessionManager } = require("./sessions/sessionManager");
const { initializeAdkConnection, createLiveSession } = require("./adk/agent");

function createHttpHandler(sessionManager) {
  return async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/debug/sessions/")) {
      const sessionId = url.pathname.replace("/debug/sessions/", "").trim();
      const session = await sessionManager.getSession(sessionId);

      if (!session) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Session not found" }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(session));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  };
}

function createWebSocketHandler({ sessionManager, adkState, env, logger = console }) {
  return (socket) => {
    const state = {
      sessionId: null,
      userId: null,
      liveSession: null,
      serverSeq: 0
    };

    const send = (payload) => {
      if (socket.readyState === 1) {
        state.serverSeq += 1;
        socket.send(
          JSON.stringify({
            ...payload,
            _meta: {
              serverSeq: state.serverSeq,
              serverTs: Date.now()
            }
          })
        );
      }
    };

    const createSessionBridge = () => {
      if (!state.sessionId) {
        return;
      }

      if (state.liveSession) {
        state.liveSession.close();
      }

      state.liveSession = createLiveSession({
        adkState,
        env,
        sessionId: state.sessionId,
        logger,
        onEvent: (event) => {
          if (event.type === "audio_output") {
            send({
              type: "audio_output",
              sessionId: state.sessionId,
              streamId: event.streamId,
              chunkIndex: event.chunkIndex,
              sampleRateHz: event.sampleRateHz,
              channels: event.channels,
              pcm16Base64: event.pcm16Base64
            });
            return;
          }

          if (event.type === "audio_output_end") {
            send({
              type: "audio_output_end",
              sessionId: state.sessionId,
              streamId: event.streamId,
              reason: event.reason
            });
            return;
          }

          if (event.type === "clear_buffer") {
            send({
              type: "clear_buffer",
              sessionId: state.sessionId,
              reason: event.reason,
              interruptedStreamId: event.interruptedStreamId
            });
            return;
          }

          if (event.type === "user_speech_detected") {
            send({
              type: "vad_event",
              sessionId: state.sessionId,
              event: "speech_start",
              vadMode: event.vadMode,
              interruptedStreamId: event.interruptedStreamId
            });
          }
        }
      });
    };

    socket.on("message", async (raw) => {
      try {
        const message = JSON.parse(raw.toString());

        if (message.type === "session_start") {
          if (!message.sessionId || !message.userId) {
            send({
              type: "error",
              error: "session_start requires sessionId and userId"
            });
            return;
          }

          await sessionManager.startSession({
            sessionId: message.sessionId,
            userId: message.userId,
            metadata: message.metadata || {}
          });

          state.sessionId = message.sessionId;
          state.userId = message.userId;
          createSessionBridge();

          send({
            type: "session_started",
            sessionId: message.sessionId,
            persisted: true,
            vadMode: env.vadMode
          });
          return;
        }

        if (message.type === "audio_input") {
          if (!state.liveSession || !state.sessionId) {
            send({ type: "error", error: "session_start is required before audio_input" });
            return;
          }

          if (typeof message.pcm16Base64 !== "string" || message.pcm16Base64.length === 0) {
            send({ type: "error", error: "audio_input requires pcm16Base64" });
            return;
          }

          const pcmBuffer = Buffer.from(message.pcm16Base64, "base64");

          if (pcmBuffer.length === 0) {
            send({ type: "error", error: "audio_input contains empty PCM payload" });
            return;
          }

          state.liveSession.ingestAudioChunk(pcmBuffer);
          return;
        }

        if (message.type === "audio_input_end") {
          if (!state.liveSession || !state.sessionId) {
            send({ type: "error", error: "session_start is required before audio_input_end" });
            return;
          }

          state.liveSession.signalInputEnded();
          return;
        }

        if (message.type === "ping") {
          send({ type: "pong" });
          return;
        }

        send({
          type: "error",
          error: "Unsupported message type",
          details: `Received type: ${message.type || "undefined"}`
        });
      } catch (error) {
        send({
          type: "error",
          error: "Invalid message",
          details: error.message
        });
      }
    });

    socket.on("close", () => {
      if (state.liveSession) {
        state.liveSession.close();
      }
    });

    const remote = `${socket._socket?.remoteAddress || "unknown"}:${socket._socket?.remotePort || "?"}`;
    logger.info(`WebSocket connected from ${remote}`);
  };
}

async function startServer() {
  const env = loadEnv();
  const firestore = createFirestoreClient(env);
  const sessionManager = new SessionManager(firestore);

  const adkState = await initializeAdkConnection(console);
  console.log(`ADK status: ${adkState.status}`);

  const server = http.createServer(createHttpHandler(sessionManager));
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", createWebSocketHandler({ sessionManager, adkState, env }));

  await new Promise((resolve) => {
    server.listen(env.port, env.host, resolve);
  });

  console.log(`KindlyClick backend listening on http://${env.host}:${env.port}`);

  return {
    server,
    wss
  };
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start server", error);
    process.exit(1);
  });
}

module.exports = {
  startServer
};
