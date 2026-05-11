// relay-server.js  –  Lemonz Xeno WebSocket relay
// ─────────────────────────────────────────────────────────────────────────────
//  Requirements : Node.js 18+  and  the "ws" package
//  Install      : npm install ws
//  Run locally  : node relay-server.js
//  Deploy free  : Render · Railway · Glitch (see SETUP.md)
// ─────────────────────────────────────────────────────────────────────────────

const http      = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

// ── In-memory room registry ───────────────────────────────────────────────────
// rooms: Map<roomId, Set<WebSocket>>
const rooms = new Map();

// ── HTTP server (needed by Render/Railway for health checks) ──────────────────
const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", rooms: rooms.size }));
  } else {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Lemonz relay is running.\n");
  }
});

// ── WebSocket server ──────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
  // Parse query params:  /ws?room=123456789012&user=123456
  const url    = new URL(req.url, "http://localhost");
  const roomId = url.searchParams.get("room");
  const userId = url.searchParams.get("user");

  if (!roomId || !userId) {
    ws.close(1008, "Missing room or user");
    return;
  }

  // Join the room
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  const room = rooms.get(roomId);
  room.add(ws);

  console.log(`[+] #${userId} joined room ${roomId}  (room size: ${room.size})`);

  // ── Incoming message → broadcast to every OTHER client in the room ─────────
  ws.on("message", (data) => {
    const text = data.toString();

    // Validate JSON before forwarding
    try { JSON.parse(text); } catch { return; }

    for (const client of room) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(text);
      }
    }
  });

  // ── Client disconnect ──────────────────────────────────────────────────────
  ws.on("close", () => {
    room.delete(ws);
    console.log(`[-] #${userId} left room ${roomId}  (room size: ${room.size})`);
    if (room.size === 0) rooms.delete(roomId);   // clean up empty rooms
  });

  ws.on("error", () => {
    room.delete(ws);
    if (room.size === 0) rooms.delete(roomId);
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`Lemonz relay listening on port ${PORT}`);
});
