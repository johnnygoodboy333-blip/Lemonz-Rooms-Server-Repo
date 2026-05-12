// relay-server.js  –  Lemonz Xeno WebSocket relay
const http      = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

// ── State ─────────────────────────────────────────────────────────────────────
const rooms      = new Map();   // roomId  -> Set<WebSocket>
const onlineUsers = new Map();  // userId  -> timestamp (last heartbeat)

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }

  // GET /health
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", rooms: rooms.size, online: onlineUsers.size }));
    return;
  }

  // POST /api/online  — heartbeat / register
  if (req.method === "POST" && req.url === "/api/online") {
    let body = "";
    req.on("data", d => body += d);
    req.on("end", () => {
      try {
        const { userId } = JSON.parse(body);
        if (userId) onlineUsers.set(userId, Date.now());
        res.writeHead(204).end();
      } catch { res.writeHead(400).end(); }
    });
    return;
  }

  // GET /api/online/:userId  — check if user is online
  const existsMatch = req.url.match(/^\/api\/online\/(\d{6})$/);
  if (req.method === "GET" && existsMatch) {
    const userId = existsMatch[1];
    const ts     = onlineUsers.get(userId);
    const online = !!ts && (Date.now() - ts) < 90_000;  // 90s timeout
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ online }));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Lemonz relay running.\n");
});

// ── WebSocket server ──────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
  const url    = new URL(req.url, "http://localhost");
  const roomId = url.searchParams.get("room");
  const userId = url.searchParams.get("user");

  if (!roomId || !userId) { ws.close(1008, "Missing room or user"); return; }

  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  const room = rooms.get(roomId);
  room.add(ws);

  // Keep presence alive while WS is open
  onlineUsers.set(userId, Date.now());
  console.log(`[+] #${userId} joined room ${roomId}  (size: ${room.size})`);

  ws.on("message", (data) => {
    const text = data.toString();
    try { JSON.parse(text); } catch { return; }
    for (const client of room) {
      if (client !== ws && client.readyState === WebSocket.OPEN)
        client.send(text);
    }
  });

  ws.on("close", () => {
    room.delete(ws);
    if (room.size === 0) rooms.delete(roomId);
    console.log(`[-] #${userId} left room ${roomId}  (size: ${room.size})`);
  });

  ws.on("error", () => {
    room.delete(ws);
    if (room.size === 0) rooms.delete(roomId);
  });
});

// ── Prune stale users every 2 minutes ────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [id, ts] of onlineUsers)
    if (now - ts > 90_000) onlineUsers.delete(id);
}, 120_000);

server.listen(PORT, () =>
  console.log(`Lemonz relay on port ${PORT}`)
);
