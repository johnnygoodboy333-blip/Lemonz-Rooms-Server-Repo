// relay-server.js  –  Lemonz Xeno relay
const http      = require("http");
const WebSocket = require("ws");
const PORT      = process.env.PORT || 3000;

// ── State ─────────────────────────────────────────────────────────────────────
const rooms    = new Map();   // roomId  -> Set<WebSocket>
const online   = new Map();   // userId  -> timestamp
const requests = new Map();   // toId    -> [{from, ts}]
const accepted = new Map();   // userId  -> [{from, ts}]  (one-shot pickup)

// ── Helpers ───────────────────────────────────────────────────────────────────
function jsonBody(req) {
  return new Promise((res, rej) => {
    let b = "";
    req.on("data", d => b += d);
    req.on("end", () => { try { res(JSON.parse(b)); } catch { rej(); } });
  });
}

function send(res, code, body) {
  const data = body !== undefined ? JSON.stringify(body) : "";
  res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(data);
}

// ── HTTP ──────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }

  const url = req.url.split("?")[0];

  // GET /health
  if (req.method === "GET" && url === "/health")
    return send(res, 200, { status: "ok", rooms: rooms.size, online: online.size });

  // POST /api/online  – heartbeat
  if (req.method === "POST" && url === "/api/online") {
    try {
      const { userId } = await jsonBody(req);
      if (userId) online.set(userId, Date.now());
      return send(res, 204);
    } catch { return send(res, 400); }
  }

  // GET /api/online/:id  – is this user online?
  const onlineM = url.match(/^\/api\/online\/(\w+)$/);
  if (req.method === "GET" && onlineM) {
    const ts = online.get(onlineM[1]);
    return send(res, 200, { online: !!ts && Date.now() - ts < 90_000 });
  }

  // POST /api/request  – send a chat request
  if (req.method === "POST" && url === "/api/request") {
    try {
      const { from, to } = await jsonBody(req);
      if (!from || !to) return send(res, 400);
      if (!requests.has(to)) requests.set(to, []);
      const list = requests.get(to);
      if (!list.find(r => r.from === from))
        list.push({ from, ts: Date.now() });
      return send(res, 204);
    } catch { return send(res, 400); }
  }

  // GET /api/requests/:userId  – incoming requests for this user
  const reqM = url.match(/^\/api\/requests\/(\w+)$/);
  if (req.method === "GET" && reqM) {
    const userId = reqM[1];
    const list   = (requests.get(userId) || []).filter(r => Date.now() - r.ts < 300_000);
    requests.set(userId, list);
    return send(res, 200, list);
  }

  // POST /api/request/respond  – accept or deny
  if (req.method === "POST" && url === "/api/request/respond") {
    try {
      const { from, to, accepted: acc } = await jsonBody(req);
      if (!from || !to) return send(res, 400);

      // Remove from pending
      if (requests.has(to))
        requests.set(to, requests.get(to).filter(r => r.from !== from));

      // Notify requester if accepted
      if (acc) {
        if (!accepted.has(from)) accepted.set(from, []);
        accepted.get(from).push({ from: to, ts: Date.now() });
      }
      return send(res, 204);
    } catch { return send(res, 400); }
  }

  // GET /api/accepted/:userId  – pick up acceptance notifications (one-shot)
  const accM = url.match(/^\/api\/accepted\/(\w+)$/);
  if (req.method === "GET" && accM) {
    const userId = accM[1];
    const list   = accepted.get(userId) || [];
    accepted.delete(userId);   // clear after pickup
    return send(res, 200, list);
  }

  send(res, 200, { msg: "Lemonz relay" });
});

// ── WebSocket ─────────────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
  const params = new URL(req.url, "http://localhost").searchParams;
  const roomId = params.get("room");
  const userId = params.get("user");

  if (!roomId || !userId) { ws.close(1008, "Missing params"); return; }

  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  const room = rooms.get(roomId);
  room.add(ws);
  online.set(userId, Date.now());

  console.log(`[+] #${userId} → room ${roomId} (size ${room.size})`);

  ws.on("message", data => {
    const text = data.toString();
    try { JSON.parse(text); } catch { return; }
    for (const client of room)
      if (client !== ws && client.readyState === WebSocket.OPEN)
        client.send(text);
  });

  ws.on("close", () => {
    room.delete(ws);
    if (room.size === 0) rooms.delete(roomId);
    console.log(`[-] #${userId} left room ${roomId} (size ${room.size})`);
  });

  ws.on("error", () => {
    room.delete(ws);
    if (room.size === 0) rooms.delete(roomId);
  });
});

// ── Cleanup stale state every 2 min ──────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [id, ts] of online)   if (now - ts > 90_000)  online.delete(id);
  for (const [id, list] of requests)
    requests.set(id, list.filter(r => now - r.ts < 300_000));
}, 120_000);

server.listen(PORT, () => console.log(`Lemonz relay on port ${PORT}`));
