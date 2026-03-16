const http = require("http");
const { WebSocketServer } = require("ws");

const { loadEnv } = require("./config/env");
const { createFirestoreClient } = require("./firestore/client");
const { SessionManager } = require("./sessions/sessionManager");
const { initializeAdkConnection, createLiveSession } = require("./adk/agent");
const runtimeProtocol = require("../../extension/src/runtimeProtocol");

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
      serverSeq: 0,
      visionActive: false,
      lastVisionFrameAt: null
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

    const truncateText = (value, maxLength = 500) => {
      const text = String(value || "");
      if (text.length <= maxLength) {
        return text;
      }
      return `${text.slice(0, maxLength)}…`;
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
            return;
          }

          if (event.type === "vision_input_ack") {
            send({
              type: "vision_input_ack",
              sessionId: state.sessionId,
              frameIndex: event.frameIndex,
              sceneKey: event.sceneKey,
              sceneLabel: event.sceneLabel,
              elements: event.elements
            });
            return;
          }

          if (event.type === "text_output") {
            send({
              type: "text_output",
              sessionId: state.sessionId,
              responseId: event.responseId,
              text: event.text
            });
            return;
          }

          if (event.type === "debug_trace") {
            send({
              type: "trace_event",
              sessionId: state.sessionId,
              scope: event.scope || "unknown",
              event: event.event || "unknown",
              data: event.data && typeof event.data === "object" ? event.data : {},
              ts: event.ts || Date.now()
            });
            return;
          }

          if (event.type === "tool_command") {
            const command = event.command || {};

            send({
              type: "command",
              sessionId: state.sessionId,
              commandId: command.commandId || null,
              toolName: command.toolName || null,
              action: command.action || "UNKNOWN_ACTION",
              status: command.status || "success",
              args: command.args || {}
            });

            sessionManager
              .appendToolCall({
                sessionId: state.sessionId,
                toolName: command.toolName || "unknown_tool",
                action: command.action || "UNKNOWN_ACTION",
                args: command.args || {},
                status: command.status || "success"
              })
              .catch((error) => {
                logger.error(
                  `Failed to persist tool call for session ${state.sessionId}: ${error.message}`
                );
              });
          }
        }
      });
    };

    socket.on("message", async (raw) => {
      try {
        const parsedMessage = runtimeProtocol.parseBackendClientMessage(
          JSON.parse(raw.toString())
        );
        if (!parsedMessage.ok) {
          send({
            type: "error",
            error: "Invalid message",
            details: parsedMessage.error
          });
          return;
        }

        const message = parsedMessage.value;

        if (message.type === "session_start") {
          await sessionManager.startSession({
            sessionId: message.sessionId,
            userId: message.userId,
            metadata: message.metadata || {}
          });

          state.sessionId = message.sessionId;
          state.userId = message.userId;
          state.visionActive = false;
          state.lastVisionFrameAt = null;
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

        if (message.type === "realtime_input") {
          if (!state.liveSession || !state.sessionId) {
            send({ type: "error", error: "session_start is required before realtime_input" });
            return;
          }

          state.liveSession.ingestVisionFrame({
            imageBase64: message.imageBase64,
            mimeType: message.mimeType || "image/jpeg",
            width: message.width || null,
            height: message.height || null,
            frameIndex: message.frameIndex || null,
            mockScene: message.mockScene || null,
            metadata: message.metadata || {}
          });
          state.visionActive = true;
          state.lastVisionFrameAt = Date.now();
          return;
        }

        if (message.type === "vision_status") {
          if (!state.liveSession || !state.sessionId) {
            send({ type: "error", error: "session_start is required before vision_status" });
            return;
          }

          state.visionActive = message.active;
          if (message.active) {
            state.lastVisionFrameAt = Date.now();
          } else {
            state.lastVisionFrameAt = null;
          }

          if (typeof state.liveSession.updateVisionStatus === "function") {
            state.liveSession.updateVisionStatus({
              active: message.active,
              reason: message.reason || null,
              lastFrameTs: message.lastFrameTs || null
            });
          }

          send({
            type: "vision_status_ack",
            sessionId: state.sessionId,
            active: state.visionActive,
            reason: message.reason || null
          });
          return;
        }

        if (message.type === "user_text") {
          if (!state.liveSession || !state.sessionId) {
            send({ type: "error", error: "session_start is required before user_text" });
            return;
          }

          state.liveSession.handleUserText(message.text);
          return;
        }

        if (message.type === "ping") {
          send({ type: "pong" });
          return;
        }

        if (message.type === "client_log") {
          if (!env.acceptClientLogs) {
            return;
          }

          const sessionId = message.sessionId || state.sessionId || null;
          const payload = {
            source: "extension",
            component: String(message.component || "unknown"),
            level: String(message.level || "info"),
            event: String(message.event || "log"),
            sessionId,
            clientTs: Number(message.clientTs || 0) || null,
            serverTs: Date.now(),
            message: truncateText(message.message || ""),
            data:
              message.data && typeof message.data === "object"
                ? message.data
                : undefined
          };

          logger.info(`[client-log] ${JSON.stringify(payload)}`);
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
  console.log(`Gemini SDK status: ${adkState.status}`);

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
