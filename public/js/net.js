/* =====================================================================
   NETWORK — talks to server.js over one WebSocket and reconnects on its own.
   PlayNet.connect() resolves [db, lobby]:
     db.doc('tables/CODE')  .get() .set(data) .onSnapshot(fn)
     lobby.join(name)       .presence(patch) .peers() .onPeers(fn) .leave()
   ===================================================================== */
const PlayNet = (() => {
  let ws = null, peerId = null, seq = 0, opened = null, ever = false, build = null;
  const waits = new Map(), docSubs = new Map(), rooms = new Map();
  const randomKey = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  // Private key for tables this browser hosts: only the creator's browser may save over a table.
  const key = (() => { try { let k = localStorage.getItem('pr-key'); if (!k){ k = randomKey(); localStorage.setItem('pr-key', k); } return k; } catch { return randomKey(); } })();

  function open(){
    opened = new Promise((resolve, reject) => {
      const sock = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
      let ok = false;
      sock.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === 'hello'){
          if (m.build && build && m.build !== build) dispatchEvent(new Event('playroom:update'));   // reconnected to a newer server
          build = m.build || build; peerId = m.peer; ws = sock; ok = ever = true; resolve(); restore(); return;
        }
        onMessage(m);
      };
      sock.onclose = () => {
        if (!ok){ if (ever) setTimeout(open, 3000); return reject(new Error('Game server unreachable')); }
        lost(sock);
      };
    });
    opened.catch(() => {});
    return opened;
  }
  function lost(sock){
    if (sock.lost) return;
    sock.lost = true; try { sock.close(); } catch {}
    if (ws === sock) ws = null;
    for (const w of waits.values()) w.reject({code:'unavailable'}); waits.clear();
    rooms.forEach(r => r.drop());
    setTimeout(open, 1500);
  }
  // No answer in time means the connection died without closing (a phone call, a network switch, a phone
  // waking up): drop it and reconnect, which also re-sends our presence and latest move.
  function call(msg, ms = 15000){
    return opened.then(() => new Promise((resolve, reject) => {
      if (!ws) return reject({code:'unavailable'});
      const id = ++seq, sock = ws, t = setTimeout(() => { waits.delete(id); reject({code:'timeout'}); lost(sock); }, ms);
      waits.set(id, {resolve:v => { clearTimeout(t); resolve(v); }, reject:e => { clearTimeout(t); reject(e); }});
      ws.send(JSON.stringify({...msg, id}));
    }));
  }
  const beat = () => { if (ws) call({t:'ping'}, 6000).catch(() => {}); };
  setInterval(beat, 12000);
  addEventListener('online', beat);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && beat());
  function onMessage(m){
    if (m.id && waits.has(m.id)){ const w = waits.get(m.id); waits.delete(m.id); m.error ? w.reject({code:m.error, message:m.error}) : w.resolve(m.data); return; }
    if (m.t === 'doc') docSubs.get(m.path)?.forEach(fn => fn(snap(m.data)));
    if (m.t === 'peers') rooms.get(m.room)?.setPeers(m.peers);
  }
  // After a reconnect: follow the same tables and rejoin the same rooms with the same presence.
  function restore(){
    for (const [path, fns] of docSubs) if (fns.size) call({t:'sub', path}).then(d => fns.forEach(fn => fn(snap(d)))).catch(() => {});
    for (const r of rooms.values()) r.rejoin();
  }
  const snap = data => ({exists:data != null, data:() => data, metadata:{fromCache:false, hasPendingWrites:false}});

  const db = {
    doc:path => ({
      path,
      get:() => call({t:'get', path}).then(snap),
      set:data => call({t:'set', path, data, key}),
      onSnapshot(fn){
        if (!docSubs.has(path)) docSubs.set(path, new Set());
        docSubs.get(path).add(fn);
        call({t:'sub', path}).then(d => fn(snap(d))).catch(() => {});
        return () => { const s = docSubs.get(path); s?.delete(fn); if (s && !s.size){ docSubs.delete(path); call({t:'unsub', path}).catch(() => {}); } };
      },
    }),
  };

  function room(name){
    let peers = [], mine = {};
    const handlers = new Set(), notify = () => handlers.forEach(h => h({peers, joined:[], left:[], updated:peers}));
    const r = {
      name,
      setPeers(list){ peers = Object.freeze(list.map(p => Object.freeze({...p, isMe:p.peer === peerId, sameTab:p.peer === peerId, by:null, kind:'viewer', guest:false, updatedAt:Date.now()}))); notify(); },
      drop(){ peers = []; notify(); },
      rejoin(){ call({t:'join', room:name, presence:mine}).catch(() => {}); },
      presence(patch){
        mine = {...mine, ...patch};
        for (const k of Object.keys(patch)) if (patch[k] === null) delete mine[k];
        return call({t:'presence', room:name, presence:mine}).then(() => {});
      },
      peers:() => peers,
      onPeers(fn){ handlers.add(fn); queueMicrotask(() => fn({peers, joined:peers, left:[], updated:[]})); return () => handlers.delete(fn); },
      connected:() => !!ws,
      leave(){ rooms.delete(name); return call({t:'leave', room:name}).then(() => {}); },
    };
    return r;
  }
  const lobby = {
    async join(name){
      const r = room(name); rooms.set(name, r);
      await call({t:'join', room:name, presence:{}});
      return r;
    },
  };

  return {connect:() => (opened || open()).then(() => [db, lobby]), build:() => build};
})();
