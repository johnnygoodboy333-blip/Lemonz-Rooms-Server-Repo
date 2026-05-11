# Lemonz Xeno — Rooms Relay Server Setup

The relay is a tiny Node.js WebSocket server.  
Every message sent by one client is instantly pushed to the other client in the same room.  
No polling. No database. Latency is typically under 100 ms.

---

## Option A — Render (recommended, free tier)

1. Create a free account at https://render.com
2. Click **New → Web Service**
3. Connect your GitHub account and push `relay-server.js` and `package.json` to a new repo  
   (or use "Deploy from public Git URL" with your repo)
4. Set these fields:
   - **Build Command**: `npm install`
   - **Start Command**: `node relay-server.js`
   - **Environment**: Node
5. Click **Create Web Service** — Render assigns you a URL like:
   `https://lemonz-relay.onrender.com`
6. Open Lemonz Xeno → Rooms → click **"Set relay server URL"** in the left sidebar  
   and paste that URL. Done.

> ⚠️  Render free tier spins down after 15 minutes of inactivity.  
> The first connection after idle takes ~10 seconds to wake up.  
> Upgrade to the $7/month plan to keep it always-on.

---

## Option B — Railway (free trial, then $5/month)

1. Create an account at https://railway.app
2. Click **New Project → Deploy from GitHub Repo**
3. Select your repo containing `relay-server.js` + `package.json`
4. Railway auto-detects Node and deploys. You get a URL like:
   `https://lemonz-relay.up.railway.app`
5. Paste that URL in the Rooms sidebar inside Lemonz Xeno.

---

## Option C — Localhost (testing only)

Run the server on your own machine and have both users be on the same LAN,  
or forward the port with ngrok:

```
# Terminal 1 — start the relay
npm install
node relay-server.js

# Terminal 2 — expose it with ngrok (https://ngrok.com, free account)
ngrok http 3000
```

ngrok prints a URL like `https://abc123.ngrok-free.app`.  
Paste that in the Rooms sidebar. Works anywhere, not just LAN.

---

## package.json (put this next to relay-server.js)

```json
{
  "name": "lemonz-relay",
  "version": "1.0.0",
  "main": "relay-server.js",
  "scripts": { "start": "node relay-server.js" },
  "dependencies": { "ws": "^8.18.0" }
}
```

---

## Setting the URL inside Lemonz Xeno

1. Open Lemonz → click **Rooms** in the left nav bar (key icon)
2. In the sidebar below the Connect bar, you'll see  
   **"Set relay server URL (click to set)"**  
   Click it and type or paste your relay URL (e.g. `https://lemonz-relay.onrender.com`)  
   then press **Enter**
3. Open a room — the status dot in the chat header turns **green** when connected
4. If it stays red, double-check the URL has no trailing slash and starts with `https://`

The URL is saved to `%APPDATA%\Lemonz\rooms_relay.txt` so you only set it once.

---

## How it works (under the hood)

```
User A (Lemonz)  ─── wss://relay/ws?room=XXXX&user=111111 ──►  Relay Server
User B (Lemonz)  ─── wss://relay/ws?room=XXXX&user=222222 ──►  Relay Server

A sends a message → relay broadcasts to B instantly
B sends a message → relay broadcasts to A instantly
```

- Room ID is the two 6-digit IDs sorted and joined: `111111222222`
- Messages are JSON blobs (`senderId`, `content`, `type`, `ts`)
- The relay never stores anything — it's purely a live broadcast switch
- If a user disconnects, the relay cleans up the room automatically

---

## Checking the relay is alive

Visit `https://your-relay-url.com/health` in a browser.  
You should see: `{"status":"ok","rooms":0}`
