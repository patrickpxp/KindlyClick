const http = require("http");
const { WebSocketServer } = require("ws");

const { loadEnv } = require("./config/env");
const { createFirestoreClient } = require("./firestore/client");
const { SessionManager } = require("./sessions/sessionManager");
const { initializeAdkConnection } = require("./adk/agent");

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

function createWebSocketHandler(sessionManager) {
  return (socket) => {
    socket.on("message", async (raw) => {
      try {
        const message = JSON.parse(raw.toString());

        if (message.type === "session_start") {
          if (!message.sessionId || !message.userId) {
            socket.send(
              JSON.stringify({
                type: "error",
                error: "session_start requires sessionId and userId"
              })
            );
            return;
          }

          await sessionManager.startSession({
            sessionId: message.sessionId,
            userId: message.userId,
            metadata: message.metadata || {}
          });

          socket.send(
            JSON.stringify({
              type: "session_started",
              sessionId: message.sessionId,
              persisted: true
            })
          );
          return;
        }

        if (message.type === "ping") {
          socket.send(JSON.stringify({ type: "pong" }));
          return;
        }

        socket.send(JSON.stringify({ type: "error", error: "Unsupported message type" }));
      } catch (error) {
        socket.send(
          JSON.stringify({
            type: "error",
            error: "Invalid message",
            details: error.message
          })
        );
      }
    });
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

  wss.on("connection", createWebSocketHandler(sessionManager));

  await new Promise((resolve) => {
    server.listen(env.port, resolve);
  });

  console.log(`KindlyClick backend listening on http://127.0.0.1:${env.port}`);

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
