// Playroom server: serves public/ and runs online tables over one WebSocket at /ws.
//  - Table documents ("tables/ABCDE"): the host's browser saves the full game state; everyone else follows it.
//  - Rooms: who is at a table right now, plus each player's presence (their name and latest move).
// Game rules run in the host's browser, so this server never needs to know any game.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(ROOT, 'data', 'tables.json');
const KEEP_DAYS = Number(process.env.KEEP_DAYS) || 7;
const MAX_DOC = 256 * 1024, MAX_PRESENCE = 4 * 1024, MAX_TABLES = 5000;

/* ---------- table documents, saved to a JSON file ---------- */
const docs = new Map();   // path -> {data, key, at}
try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')))) docs.set(k, v); } catch {}
let saveTimer = null;
function save(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const cutoff = Date.now() - KEEP_DAYS * 864e5;
    for (const [k, v] of docs) if (v.at < cutoff) docs.delete(k);
    fs.mkdirSync(path.dirname(DATA_FILE), {recursive:true});
    fs.writeFile(DATA_FILE, JSON.stringify(Object.fromEntries(docs)), err => err && console.error('save failed', err.message));
  }, 2000);
}

/* ---------- static files ---------- */
const TYPES = {'.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json',
  '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon', '.webmanifest':'application/manifest+json'};
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (p === '/healthz'){ res.writeHead(200, {'content-type':'text/plain'}).end('ok'); return; }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(PUBLIC, path.normalize(p));
  if (!file.startsWith(PUBLIC + path.sep)){ res.writeHead(403).end(); return; }
  fs.readFile(file, (err, body) => {
    if (err){ res.writeHead(404, {'content-type':'text/plain'}).end('Not found'); return; }
    const ext = path.extname(file);
    // no-cache: after a deploy, browsers never mix a new page with old scripts.
    res.writeHead(200, {'content-type':TYPES[ext] || 'application/octet-stream', 'cache-control':'no-cache', 'x-content-type-options':'nosniff'});
    res.end(body);
  });
});

/* ---------- live connections ---------- */
const subs = new Map();    // doc path -> Set<ws>
const rooms = new Map();   // room name -> Map<peer id, {ws, presence}>
const DOC_PATH = /^tables\/[A-Z0-9]{5}$/, ROOM_NAME = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
const send = (ws, m) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));
const bytes = v => Buffer.byteLength(JSON.stringify(v) ?? '');
const keyHash = k => crypto.createHash('sha256').update(String(k)).digest('hex');

function broadcastPeers(name){
  const room = rooms.get(name); if (!room) return;
  const peers = [...room].map(([peer, m]) => ({peer, presence:m.presence}));
  for (const m of room.values()) send(m.ws, {t:'peers', room:name, peers});
}
function leaveRoom(ws, name){
  const room = rooms.get(name);
  if (!room?.delete(ws.peer)) return;
  ws.rooms.delete(name);
  if (room.size) broadcastPeers(name); else rooms.delete(name);
}

function handle(ws, m){
  const reply = (data, error) => send(ws, {id:m.id, data, error});
  switch (m.t){
    case 'get':
      if (!DOC_PATH.test(m.path)) return reply(null, 'invalid_argument');
      return reply(docs.get(m.path)?.data ?? null);
    case 'set': {
      if (!DOC_PATH.test(m.path) || !m.data || typeof m.data !== 'object' || bytes(m.data) > MAX_DOC) return reply(null, 'invalid_argument');
      const cur = docs.get(m.path), key = keyHash(m.key);
      // A table belongs to the browser that created it (its private key), so other players can't overwrite the game.
      if (cur && cur.key !== key) return reply(null, 'forbidden');
      if (!cur && docs.size >= MAX_TABLES) return reply(null, 'quota_exceeded');
      docs.set(m.path, {data:m.data, key, at:Date.now()}); save();
      for (const s of subs.get(m.path) || []) if (s !== ws) send(s, {t:'doc', path:m.path, data:m.data});
      return reply(true);
    }
    case 'sub':
      if (!DOC_PATH.test(m.path)) return reply(null, 'invalid_argument');
      if (!subs.has(m.path)) subs.set(m.path, new Set());
      subs.get(m.path).add(ws); ws.subs.add(m.path);
      return reply(docs.get(m.path)?.data ?? null);
    case 'unsub':
      subs.get(m.path)?.delete(ws); ws.subs.delete(m.path);
      return reply(true);
    case 'join': {
      if (!ROOM_NAME.test(m.room)) return reply(null, 'invalid_argument');
      if (!rooms.has(m.room)) rooms.set(m.room, new Map());
      const presence = m.presence && typeof m.presence === 'object' && bytes(m.presence) <= MAX_PRESENCE ? m.presence : {};
      rooms.get(m.room).set(ws.peer, {ws, presence}); ws.rooms.add(m.room);
      reply({peer:ws.peer}); broadcastPeers(m.room);
      return;
    }
    case 'presence': {
      const me = rooms.get(m.room)?.get(ws.peer);
      if (!me) return reply(null, 'not_joined');
      if (!m.presence || typeof m.presence !== 'object' || bytes(m.presence) > MAX_PRESENCE) return reply(null, 'invalid_argument');
      me.presence = m.presence; reply(true); broadcastPeers(m.room);
      return;
    }
    case 'leave':
      leaveRoom(ws, m.room); return reply(true);
    default:
      return reply(null, 'unknown');
  }
}

const wss = new WebSocketServer({server, path:'/ws', maxPayload:MAX_DOC + 16 * 1024});
wss.on('connection', ws => {
  ws.peer = crypto.randomBytes(8).toString('hex'); ws.rooms = new Set(); ws.subs = new Set(); ws.alive = true;
  send(ws, {t:'hello', peer:ws.peer});
  ws.on('pong', () => { ws.alive = true; });
  ws.on('error', () => ws.terminate());   // e.g. an oversized message: drop that client, never the server
  ws.on('message', raw => { let m; try { m = JSON.parse(raw); } catch { return; } if (m && typeof m === 'object') handle(ws, m); });
  ws.on('close', () => {
    for (const r of [...ws.rooms]) leaveRoom(ws, r);
    for (const p of ws.subs) subs.get(p)?.delete(ws);
  });
});
// Drop connections that stopped answering, so players who closed their laptop show as away.
setInterval(() => { for (const ws of wss.clients){ if (!ws.alive){ ws.terminate(); continue; } ws.alive = false; ws.ping(); } }, 25000);

// On your own computer another app may already use the port: try the next ones. A host that sets PORT gets exactly that port.
let port = PORT;
wss.on('error', () => {});   // the WebSocket server only repeats the http server's listen errors, handled below
server.on('error', err => {
  if (err.code === 'EADDRINUSE' && !process.env.PORT && port < PORT + 20){ console.log(`Port ${port} is busy, trying ${port + 1}`); server.listen(++port); return; }
  console.error(err.code === 'EADDRINUSE' ? `Port ${port} is already in use. Pick another, for example: set PORT=3005 and run again` : err.message);
  process.exit(1);
});
server.listen(port, () => console.log(`Playroom running on http://localhost:${port}`));
