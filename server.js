// Playroom server: serves public/ and runs online tables over one WebSocket at /ws.
//  - Table documents ("tables/ABCDE"): the host's browser saves the full game state; everyone else follows it.
//    "tables/ABCDE-qr" holds the host's payment QR for paid tables, so it isn't re-sent with every move.
//    "tables/ABCDE-ink-PID" is a Scribble artist's saved drawing, written by that player's own browser.
//  - Rooms: who is at a table right now, plus each player's presence (their name and latest move).
//  - Game requests and bug reports from players, and a password-protected page where the developer reads them.
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
const MAX_DOC = 256 * 1024, MAX_PRESENCE = 8 * 1024, MAX_TABLES = 5000;
// A fingerprint of the site's files: when a deploy changes them, reconnecting browsers are offered a reload.
const BUILD = (() => {
  const h = crypto.createHash('sha1');
  const walk = d => { for (const f of fs.readdirSync(d, {withFileTypes:true}).sort((a, b) => a.name < b.name ? -1 : 1)){ const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else h.update(f.name).update(fs.readFileSync(p)); } };
  try { walk(path.join(path.dirname(fileURLToPath(import.meta.url)), 'public')); } catch {}
  return h.digest('hex').slice(0, 10);
})();

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

/* ---------- game requests and bug reports ----------
   Players suggest games from the home screen (POST /api/requests) and report bugs from any game or the home screen
   (POST /api/bugs, with a snapshot of their device and game if they allow it). Both are saved to files and, when
   GITHUB_TOKEN and GITHUB_REPO are set, also opened as GitHub issues ("game request" / "bug"), which survive hosts
   like Render's free tier that wipe files on restart. The developer reads them at /admin/requests: the browser
   asks for a password, which is ADMIN_KEY. */
const REQ_FILE = process.env.REQUESTS_FILE || path.join(ROOT, 'data', 'requests.json');
let requests = [];
try { requests = JSON.parse(fs.readFileSync(REQ_FILE, 'utf8')); } catch {}
const BUG_FILE = process.env.BUGS_FILE || path.join(ROOT, 'data', 'bugs.json');
let bugs = [];
try { bugs = JSON.parse(fs.readFileSync(BUG_FILE, 'utf8')); } catch {}
// Per sender and hour, so one person can't flood a list. Returns false once they're over.
const hitMaps = {};
function allow(kind, req, n){
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(), now = Date.now(), m = hitMaps[kind] ||= new Map();
  if (m.size > 5000) m.clear();
  const hits = (m.get(ip) || []).filter(t => now - t < 36e5);
  if (hits.length >= n) return false;
  hits.push(now); m.set(ip, hits); return true;
}
const keep = (file, list) => { fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFile(file, JSON.stringify(list), err => err && console.error('saving failed', file, err.message)); };
const json = (res, code, data) => res.writeHead(code, {'content-type':'application/json', 'cache-control':'no-store'}).end(JSON.stringify(data));
const readBody = (req, max) => new Promise((ok, fail) => {
  let b = '', over = false;   // past the limit: ignore the rest and answer, rather than cut the connection
  req.on('data', c => { if (over) return; b += c; if (b.length > max){ over = true; fail(new Error('too large')); } }); req.on('end', () => ok(b)); req.on('error', fail);
});
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').trim().slice(0, n);
async function postRequest(req, res){
  let b; try { b = JSON.parse(await readBody(req, 4096)); } catch { return json(res, 400, {error:'That request was not understood'}); }
  const r = {id:crypto.randomBytes(4).toString('hex'), at:new Date().toISOString(), game:clean(b?.game, 60), players:clean(b?.players, 30), name:clean(b?.name, 30), details:clean(b?.details, 600)};
  if (r.game.length < 2) return json(res, 400, {error:'Tell us the game’s name'});
  if (!allow('request', req, 5)) return json(res, 429, {error:'That’s plenty of requests for one hour. Thanks! Try again later.'});
  requests = [...requests, r].slice(-2000); keep(REQ_FILE, requests);
  const quiet = t => t.replace(/@/g, '@\u200b');
  toGitHub(`Game request: ${quiet(r.game)}`, 'game request',
    `**Game:** ${quiet(r.game)}\n**Players:** ${quiet(r.players) || '–'}\n**From:** ${quiet(r.name) || 'anonymous'}\n\n${quiet(r.details).split('\n').map(l => '> ' + l).join('\n') || '> (no details)'}`);
  json(res, 200, {ok:true});
}
async function postBug(req, res){
  let b; try { b = JSON.parse(await readBody(req, 16384)); } catch { return json(res, 400, {error:'That report was not understood'}); }
  const diag = b?.diag && typeof b.diag === 'object' ? JSON.stringify(b.diag).slice(0, 8000) : '';
  const r = {id:crypto.randomBytes(4).toString('hex'), at:new Date().toISOString(), game:clean(b?.game, 40), name:clean(b?.name, 30), what:clean(b?.what, 1000), diag};
  if (r.what.length < 5) return json(res, 400, {error:'Tell us a little about what happened'});
  if (!allow('bug', req, 10)) return json(res, 429, {error:'That’s plenty of reports for one hour. Thanks! Try again later.'});
  bugs = [...bugs, r].slice(-1000); keep(BUG_FILE, bugs);
  const quiet = t => t.replace(/@/g, '@\u200b');
  toGitHub(`Bug${r.game ? ` in ${quiet(r.game)}` : ''}: ${quiet(r.what).split('\n')[0].slice(0, 70)}`, 'bug',
    `**Game:** ${quiet(r.game) || '–'}\n**From:** ${quiet(r.name) || 'anonymous'}\n\n${quiet(r.what).split('\n').map(l => '> ' + l).join('\n')}${diag ? `\n\n<details><summary>Technical details</summary>\n\n\`\`\`json\n${quiet(diag)}\n\`\`\`\n</details>` : ''}`);
  json(res, 200, {ok:true});
}
function toGitHub(title, label, body){
  const {GITHUB_TOKEN:token, GITHUB_REPO:repo} = process.env;
  if (!token || !repo) return;
  fetch(`https://api.github.com/repos/${repo}/issues`, {method:'POST',
    headers:{authorization:`Bearer ${token}`, accept:'application/vnd.github+json', 'user-agent':'playroom', 'content-type':'application/json'},
    body:JSON.stringify({title, labels:[label], body})})
    .then(x => { if (!x.ok) console.error(`GitHub issue (${label}) failed:`, x.status); })
    .catch(e => console.error(`GitHub issue (${label}) failed:`, e.message));
}
const html = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[c]);
function adminRequests(req, res, asJson){
  const key = process.env.ADMIN_KEY;
  if (!key){ res.writeHead(404, {'content-type':'text/plain; charset=utf-8'}).end('Game requests and bug reports are off here. Set the ADMIN_KEY setting on the server to read them.'); return; }
  const pass = Buffer.from(String(req.headers.authorization || '').replace(/^Basic\s+/i, ''), 'base64').toString().split(':').slice(1).join(':');
  const a = Buffer.from(pass), b = Buffer.from(key);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)){
    res.writeHead(401, {'www-authenticate':'Basic realm="Playroom game requests", charset="UTF-8"', 'content-type':'text/plain; charset=utf-8'}).end('Password needed (the ADMIN_KEY setting).');
    return;
  }
  if (asJson) return json(res, 200, asJson === 'bugs' ? bugs : requests);
  // Most wanted first: requests for the same game (ignoring case and spacing) are counted together.
  const groups = new Map();
  for (const r of requests){ const k = r.game.toLowerCase().replace(/[^a-z0-9]+/g, ''); const g = groups.get(k) || {name:r.game, n:0, last:r.at}; g.n++; g.last = r.at; groups.set(k, g); }
  const top = [...groups.values()].sort((x, y) => y.n - x.n || (y.last > x.last ? 1 : -1));
  const when = iso => new Date(iso).toLocaleString('en-IN', {dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Kolkata'});
  res.writeHead(200, {'content-type':'text/html; charset=utf-8', 'cache-control':'no-store', 'x-robots-tag':'noindex'});
  const pretty = d => { try { return JSON.stringify(JSON.parse(d), null, 2); } catch { return d; } };
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Requests & bugs · Playroom</title>
<style>body{margin:0;font:15px/1.45 system-ui,sans-serif;background:#0f1416;color:#eef2f2}main{max-width:900px;margin:0 auto;padding:24px 16px}h1{margin:0 0 4px}
.muted{color:#9fb0b2}table{width:100%;border-collapse:collapse;margin:12px 0 28px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #263235;vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#9fb0b2}td.n{font-weight:700;color:#f4c95d;width:60px}.d{white-space:pre-wrap;color:#cfd8d9}a{color:#7cc6ff}
pre{white-space:pre-wrap;word-break:break-word;font-size:12px;background:#172023;padding:8px;border-radius:6px;max-height:320px;overflow:auto}summary{cursor:pointer;color:#7cc6ff}</style>
<main><h1>Bug reports</h1><p class="muted">${bugs.length} report${bugs.length === 1 ? '' : 's'} · newest first · <a href="/admin/bugs.json">download as JSON</a></p>
${bugs.length ? `<table><tr><th>When</th><th>Game</th><th>From</th><th>What happened</th></tr>${[...bugs].reverse().map(r => `<tr><td class="muted">${when(r.at)}</td><td><b>${html(r.game || '–')}</b></td><td>${html(r.name || 'anonymous')}</td><td class="d">${html(r.what)}${r.diag ? `<details><summary>Technical details</summary><pre>${html(pretty(r.diag))}</pre></details>` : ''}</td></tr>`).join('')}</table>`
  : '<p>No bug reports yet. Players send them with the 🐞 button in any game or on the home screen.</p>'}
<h1>Game requests</h1><p class="muted">${requests.length} request${requests.length === 1 ? '' : 's'} · newest first below · <a href="/admin/requests.json">download as JSON</a></p>
${requests.length ? `<h2>Most wanted</h2><table><tr><th>Asks</th><th>Game</th><th>Last asked</th></tr>${top.map(g => `<tr><td class="n">${g.n}</td><td>${html(g.name)}</td><td class="muted">${when(g.last)}</td></tr>`).join('')}</table>
<h2>All requests</h2><table><tr><th>When</th><th>Game</th><th>Players</th><th>From</th><th>Details</th></tr>${[...requests].reverse().map(r => `<tr><td class="muted">${when(r.at)}</td><td><b>${html(r.game)}</b></td><td>${html(r.players || '–')}</td><td>${html(r.name || 'anonymous')}</td><td class="d">${html(r.details || '')}</td></tr>`).join('')}</table>`
  : '<p>No requests yet. They appear here as soon as someone sends one from the home screen.</p>'}</main>`);
}

/* ---------- static files ---------- */
const TYPES = {'.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json',
  '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon', '.webmanifest':'application/manifest+json'};
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (p === '/healthz'){ res.writeHead(200, {'content-type':'text/plain'}).end('ok'); return; }
  if (p === '/api/requests'){ if (req.method === 'POST') postRequest(req, res).catch(() => json(res, 500, {error:'Couldn’t save that. Try again'})); else res.writeHead(405).end(); return; }
  if (p === '/api/bugs'){ if (req.method === 'POST') postBug(req, res).catch(() => json(res, 500, {error:'Couldn’t send that. Try again'})); else res.writeHead(405).end(); return; }
  if (p === '/admin/requests' || p === '/admin/requests.json' || p === '/admin/bugs.json'){ adminRequests(req, res, p === '/admin/bugs.json' ? 'bugs' : p.endsWith('.json')); return; }
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
const DOC_PATH = /^tables\/[A-Z0-9]{5}(-qr|-ink-[a-z0-9]{1,40})?$/, ROOM_NAME = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
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
    case 'ping':
      return reply(true);
    default:
      return reply(null, 'unknown');
  }
}

const wss = new WebSocketServer({server, path:'/ws', maxPayload:MAX_DOC + 16 * 1024});
wss.on('connection', ws => {
  ws.peer = crypto.randomBytes(8).toString('hex'); ws.rooms = new Set(); ws.subs = new Set(); ws.alive = true;
  send(ws, {t:'hello', peer:ws.peer, build:BUILD});
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
