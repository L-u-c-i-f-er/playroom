/* =====================================================================
   CLIENT — local pass & play, or online through the game server (see js/net.js and server.js).
   Online: the host's page owns the state and saves it as the table document;
   other players send moves through their room presence and follow the document.
   ===================================================================== */
const app = document.getElementById('app');
const SEAT = ['#e4bc6c','#73c7e3','#ee8bab','#93d57f','#b7a1f2'];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k){ try { localStorage.removeItem(k); } catch {} },
};
const rid = (n, abc = 'abcdefghijkmnpqrstuvwxyz23456789') => Array.from({length:n}, () => abc[Math.random() * abc.length | 0]).join('');
function myPid(){
  const q = new URLSearchParams(location.search).get('p'); if (q) return q;   // local testing only
  let v = store.get('dm-pid'); if (!v){ v = rid(12); store.set('dm-pid', v); } return v;
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

let G = null, mode = null, me = myPid(), screen = 'hub', GID = 'dealmaker';
let opt = null, lastN = 0, shownErr = 0, seenLog = -1;
let muted = store.get('dm-muted', false);
const form = {name:store.get('dm-name', ''), code:'', locals:[store.get('dm-name', '') || '', '']};
const freshUI = () => ({sel:null, mode:null, pend:null, tcard:null, target:null, dbl:0, pay:[], payKey:null, disc:[], moveCard:null, modal:null, log:false, revealed:null, hostOnline:true});
let ui = freshUI();
const net = {db:null, lobby:null, room:null, doc:null, unsub:null, ready:false};
// The last few things that went wrong on this device, sent along with a bug report.
const errs = [];
const noteErr = msg => { errs.push(`${new Date().toISOString().slice(11, 19)} ${String(msg).slice(0, 300)}`); if (errs.length > 15) errs.shift(); };
addEventListener('error', e => noteErr(`${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`));
addEventListener('unhandledrejection', e => noteErr(`promise: ${e.reason?.message || e.reason?.code || e.reason}`));
// The server was updated (a new deploy): offer a reload, and come straight back to the same table.
addEventListener('playroom:update', () => {
  if (document.querySelector('.upd-bar')) return;
  const b = Object.assign(document.createElement('div'), {className:'upd-bar'});
  b.innerHTML = '<span>Playroom was just updated.</span><button class="btn small gold">Reload</button>';
  b.querySelector('button').onclick = () => { try { if (G?.code && mode !== 'local') sessionStorage.setItem('pr-rejoin', G.code); } catch {} location.reload(); };
  document.body.append(b);
});

(async () => {
  try { [net.db, net.lobby] = await PlayNet.connect(); net.ready = true; } catch { net.ready = false; }
  if (screen !== 'game' && booted) render();
  let back = null; try { back = sessionStorage.getItem('pr-rejoin'); sessionStorage.removeItem('pr-rejoin'); } catch {}
  if (back && net.ready && form.name.trim()) joinTable(back);   // reloaded for an update: back to the table
})();
let booted = false;   // set once every game module has loaded

const viewState = () => mode === 'guest' && opt && (G.ack?.[me] || 0) < opt.n ? opt.s : G;
const seatColor = (s, id) => SEAT[Math.max(0, s.players.findIndex(p => p.id === id)) % SEAT.length];
const avatar = (s, p, cls = '') => `<span class="av ${cls}" style="--pc:${seatColor(s, p.id)}">${esc((p.name || '?')[0].toUpperCase())}</span>`;
const live = () => new Set((net.room?.peers() || []).map(p => p.presence?.pid).filter(Boolean));

function toast(msg, cls = ''){
  const el = document.createElement('div'); el.className = 'toast ' + cls; el.textContent = msg;
  document.getElementById('toasts').append(el); setTimeout(() => el.remove(), 2800);
}
function showBanner(e){
  const b = document.getElementById('banner');
  b.innerHTML = `<div><div class="bt">${esc(e.title || e.text)}</div>${e.sub ? `<div class="bs" style="text-align:center">${esc(e.sub)}</div>` : ''}</div>`;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
let actx = null;
function sfx(k){
  if (muted) return;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime;
    const tone = (f, d, at = 0, type = 'triangle', vol = .07) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t + at); g.gain.exponentialRampToValueAtTime(.0001, t + at + d);
      o.connect(g).connect(actx.destination); o.start(t + at); o.stop(t + at + d + .02);
    };
    ({card:() => tone(560, .06, 0, 'triangle', .04),
      coin:() => { tone(988, .09); tone(1319, .22, .08); },
      big:() => { tone(330, .14, 0, 'sawtooth', .04); tone(494, .26, .1, 'sawtooth', .04); },
      turn:() => tone(660, .14, 0, 'sine', .05),
      flick:() => { tone(1800, .03, 0, 'triangle', .025); tone(900, .05, .02, 'triangle', .02); },
      err:() => tone(150, .16, 0, 'square', .03),
      win:() => [523, 659, 784, 1047].forEach((f, i) => tone(f, .3, i * .12)),
    })[k]?.();
  } catch {}
}
function confetti(){
  if (reduce) return;
  const cv = document.getElementById('confetti'), x = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const cols = Object.values(COLORS).map(c => c.hex).concat('#e4bc6c', '#fbf6ea');
  const ps = Array.from({length:180}, () => ({x:Math.random() * cv.width, y:-20 - Math.random() * cv.height * .5, vx:(Math.random() - .5) * 3, vy:2 + Math.random() * 4, r:Math.random() * 6, w:6 + Math.random() * 6, c:cols[Math.random() * cols.length | 0]}));
  const t0 = performance.now();
  (function f(t){
    x.clearRect(0, 0, cv.width, cv.height);
    for (const p of ps){ p.x += p.vx; p.y += p.vy; p.r += .1; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.w / 2, -3, p.w, 6); x.restore(); }
    if (t - t0 < 4200) requestAnimationFrame(f); else x.clearRect(0, 0, cv.width, cv.height);
  })(t0);
}

/* ---------- card faces ---------- */
const GLYPH = {
  breaker:'<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  jsn:'<svg viewBox="0 0 24 24"><path d="M8 2h8l6 6v8l-6 6H8l-6-6V8z"/><text x="12" y="15" text-anchor="middle" font-size="7.5" font-weight="800" font-family="Bricolage Grotesque, Arial, sans-serif" fill="currentColor" stroke="none">NO</text></svg>',
  sly:'<svg viewBox="0 0 24 24"><path d="M20 7H9a5 5 0 0 0 0 10h4"/><path d="M16 3l4 4-4 4"/></svg>',
  forced:'<svg viewBox="0 0 24 24"><path d="M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4"/></svg>',
  debt:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1-3 2.3c0 3.2 6 1.6 6 4.9 0 1.3-1.3 2.3-3 2.3s-3-1.1-3-2.5M12 5v2M12 17v2"/></svg>',
  birthday:'<svg viewBox="0 0 24 24"><path d="M4 21h16v-8H4zM4 16c2 1.5 4 1.5 6 0s4-1.5 6 0 3 1 4 0M8 13V9M12 13V9M16 13V9M8 5.5v.5M12 5.5v.5M16 5.5v.5"/></svg>',
  passgo:'<svg viewBox="0 0 24 24"><path d="M3 12h16M13 5l7 7-7 7"/></svg>',
  house:'<svg viewBox="0 0 24 24"><path d="M3 11 12 3l9 8v10H3z"/><path d="M10 21v-6h4v6"/></svg>',
  hotel:'<svg viewBox="0 0 24 24"><path d="M4 21V5h16v16M8 9h2M14 9h2M8 13h2M14 13h2M10 21v-4h4v4"/></svg>',
  double:'<span class="x2">×2</span>',
};
const MONEY = {1:'#ddd2a8', 2:'#eeb0a8', 3:'#b5d9a2', 4:'#a6cbe8', 5:'#cbadE2', 10:'#f2b56c'};
const ladder = (color, many) => COLORS[color].rent.map((r, i, arr) => `<div><i>${i + 1}${many && i === arr.length - 1 ? ' ★' : ''}</i><b>$${r}M</b></div>`).join('');
function cardEl(id, size = 'md', o = {}){
  const c = C(id);
  const attrs = `${o.cid ? `data-cid="${id}"` : ''} data-k="${id}" ${o.attrs || ''}`;
  const cls = `card ${size} ${o.cls || ''}`;
  if (c.type === 'prop'){
    const k = COLORS[c.color];
    return `<div class="${cls} prop" ${attrs} style="--c:${k.hex};--ci:${k.ink}"><div class="band"><span class="nm">${esc(c.name)}</span></div><div class="lad">${ladder(c.color, true)}</div><span class="cv">${c.value}</span></div>`;
  }
  if (c.type === 'wild'){
    const now = o.color ? `--now:${COLORS[o.color].hex}` : '';
    if (c.multi) return `<div class="${cls} prop wild multi" ${attrs} style="${now}"><div class="band"><span class="nm">Wild</span></div><div class="any">Part of any color set. No cash value.</div>${o.color ? '<span class="now"></span>' : ''}</div>`;
    const [a, b] = c.colors;
    return `<div class="${cls} prop wild" ${attrs} style="--c:${COLORS[o.color === b ? b : a].hex};--c2:${COLORS[o.color === b ? a : b].hex};${now}"><div class="band"><span class="nm">Wild</span></div><div class="duo">${[a, b].map(k => `<div style="--k:${COLORS[k].hex}"><h5>${COLORS[k].name}</h5><div class="lad">${ladder(k)}</div></div>`).join('')}</div><span class="cv">${c.value}</span>${o.color ? '<span class="now"></span>' : ''}</div>`;
  }
  if (c.type === 'money') return `<div class="${cls} money" ${attrs} style="--m:${MONEY[c.value]}"><span class="cv">${c.value}</span><div class="mbig">$${c.value}<small>M</small></div><div class="mname">Cash</div></div>`;
  if (c.type === 'action') return `<div class="${cls} act" ${attrs} data-short="${c.short}"><span class="cv">${c.value}</span><div class="atitle">${esc(c.name)}</div><div class="glyph">${GLYPH[c.act]}</div><div class="adesc">${esc(c.desc)}</div></div>`;
  const grad = c.wild ? 'conic-gradient(#d93a30,#f08a24,#f2cb2f,#a7d6b6,#1e9a58,#8fcbe8,#2747a3,#d24b93,#8a5a3b,#2a2a2e,#d93a30)'
    : `linear-gradient(90deg,${COLORS[c.colors[0]].hex} 50%,${COLORS[c.colors[1]].hex} 50%)`;
  const desc = c.wild ? 'Charge one player rent for any color you own.' : `Everyone pays rent for ${COLORS[c.colors[0]].name} or ${COLORS[c.colors[1]].name}.`;
  return `<div class="${cls} rent" ${attrs}><span class="cv">${c.value}</span><div class="atitle">${c.wild ? 'Wild Rent' : 'Rent'}</div><div class="wheel" style="background:${grad}"></div><div class="adesc">${desc}</div></div>`;
}
function grpEl(g, size, o = {}){
  const gattrs = o.gattrs ? o.gattrs(g) : '';
  const cards = g.cards.map(id => cardEl(id, size, {cid:o.cid, color:g.color, cls:o.ccls ? o.ccls(g, id) : '', attrs:o.cattrs ? o.cattrs(g, id) : ''}));
  const blds = [g.house, g.hotel].filter(x => x != null).map(id => cardEl(id, size, {cid:o.cid}));
  return `<div class="grp ${size === 'mini' ? 'mini-g' : ''} ${full(g) ? 'full' : ''} ${o.gcls ? o.gcls(g) : ''}" ${gattrs} title="${COLORS[g.color].name}: ${g.cards.length}/${COLORS[g.color].n}">${cards.join('')}${blds.join('')}</div>`;
}

/* ---------- hub ---------- */
// The shelf. Each game gets an entry here; tables in the db carry `game` so a code always opens the right one.
const GAMES = [
  {id:'dealmaker', name:'Dealmaker', blurb:'Bank cash, lay deeds and steal sets. First to three complete property sets wins.',
   tags:['2–5 players', '~20 min', 'Online', 'Pass & play'], art:() => fanHTML('md', .5)},
  {id:'tambola', name:'Tambola', blurb:'Housie with a ball caller, real 15-number tickets and live claims for Early Five, lines, corners and Full House.',
   tags:['1–20 players', 'Online', 'Caller on one device', 'Phone tickets'], art:() => TAM.art()},
  {id:'rummy', name:'Rummy', blurb:'13-card Indian Rummy. Build a pure sequence, use the wild joker and be first to declare.',
   tags:['2–6 players', '~10 min a deal', 'Online', 'Pass & play'], art:() => RUM.art()},
  {id:'andarbahar', name:'Andar Bahar', blurb:'Bet inside or outside, flip the joker and watch the cards fall until one matches. Play-money chips only.',
   tags:['1–12 players', '1 min rounds', 'Online', 'One device'], art:() => AB.art()},
  {id:'leastcount', name:'Least Count', blurb:'Throw high cards, keep the jokers and call Show at 10 or less. A wrong Show costs 40.',
   tags:['2–6 players', 'Elimination', 'Online', 'Pass & play'], art:() => LC.art()},
  {id:'uno', name:'UNO', blurb:'Match color or number, slam Draw Twos and bluff a Wild Draw Four. Forget to call UNO and you draw two.',
   tags:['2–10 players', 'First to 500', 'Online', 'Pass & play'], art:() => ENG.uno.art()},
  {id:'unoflip', name:'UNO Flip', blurb:'Two-sided UNO. One Flip card turns everything to the Dark Side: Draw Five, Skip Everyone, Wild Draw Color.',
   tags:['2–10 players', 'Light & Dark sides', 'Online', 'Pass & play'], art:() => ENG.unoflip.art()},
  {id:'unonm', name:'UNO No Mercy', blurb:'Stack Draw cards past +10, swap hands on a 7, spin the Color Roulette. Hit 25 cards and you’re out.',
   tags:['2–6 players', 'Stacking', 'Mercy rule', 'Online', 'Pass & play'], art:() => ENG.unonm.art()},
  {id:'mafia', name:'Mafia', blurb:'Draw an Ace and you’re Mafia. Secret picks by night, accusations and a vote by day. The page is the moderator.',
   tags:['4–15 players', 'Social deduction', 'Online', 'Pass & play'], art:() => MAF.art()},
  {id:'solitaire', name:'Solitaire', blurb:'Klondike, FreeCell and Spider for one. Unlimited undo, and your game saves itself.',
   tags:['1 player', 'Klondike', 'FreeCell', 'Spider'], art:() => SOL.art()},
  {id:'poker', name:'Poker', blurb:'No-limit Texas Hold’em with play-money chips. Blinds, side pots and a showdown under the lights.',
   tags:['2–9 players', 'Hold’em', 'Online', 'Pass & play'], art:() => PK.art()},
  {id:'teenpatti', name:'Teen Patti', blurb:'Three cards, blind or seen. Chaal, sideshow, show, and a trail of aces beats everything. Play-money chips.',
   tags:['3–8 players', 'Blind & seen', 'Online', 'Pass & play'], art:() => TP.art()},
  {id:'bingo', name:'Bingo', blurb:'Fill your number grid, take turns calling numbers, and be first to light up B-I-N-G-O. The host picks 5×5 up to 8×8.',
   tags:['2–8 players', 'Grids 5×5 to 8×8', 'Online', 'Pass & play'], art:() => BINGO.art()},
  {id:'scribble', name:'Scribble', blurb:'One player draws a secret word live on everyone’s screen; the rest race to guess it. Quick guesses score big.',
   tags:['2–12 players', 'Draw & guess', 'Online'], art:() => SC.art()},
  {id:'tictactoe', name:'Tic Tac Toe', blurb:'X and O, three in a row. Bring the group: winner stays on and everyone else queues for a shot.',
   tags:['2–8 players', 'Winner stays on', 'Online', 'One device'], art:() => TTT.art()},
];
// Each game plugs in here: rules engine (newGame/apply/needs) plus its home and table views.
const ENG = {dealmaker:{name:'Dealmaker', min:2, max:5, newGame, apply, needs, home:() => vHome(), view:s => vGame(s),
  timeout}};
function fanHTML(size, k){
  const pick = f => CARDS.find(f).id;
  return [[pick(c => c.name === 'Boardwalk'), -16, -150, 18], [pick(c => c.act === 'breaker'), -6, -70, 0], [pick(c => c.value === 10 && c.type === 'money'), 4, 10, -6],
    [pick(c => c.wild && c.type === 'rent'), 13, 90, 4], [pick(c => c.act === 'jsn'), 22, 168, 24]]
    .map(([id, r, x, y]) => `<div class="fi" style="transform:translate(-50%,-50%) rotate(${r}deg) translate(${x * k}px,${y * k * 1.8}px);--r2:${r * 1.25}deg;--x2:${x * k * 1.36}px;--yy:${(y - 10) * k * 1.8}px">${cardEl(id, size)}</div>`).join('');
}
function vHub(){
  const last = store.get('dm-last');
  return `<div class="hub">
    <section class="hub-hero">
      <div>
        <div class="eyebrow">Games with friends</div>
        <h1>Play<em>room</em></h1>
        <p>Pick a game, host it online and share a 5-letter code, or pass one device around the table.</p>
      </div>
      <div class="panel">
        <div class="eyebrow">Got a code?</div>
        <h2>Join a friend’s table</h2>
        ${net.ready ? `
        <div class="field"><label for="nm">Your name</label><input id="nm" data-f="name" value="${esc(form.name)}" maxlength="18" placeholder="e.g. Priya" autocomplete="nickname"></div>
        <div class="field"><label for="cd">Table code</label><div class="row"><input id="cd" class="grow code-in" data-f="code" value="${esc(form.code)}" maxlength="5" placeholder="ABCDE" autocomplete="off"><button class="btn gold" data-do="join">Join</button></div></div>
        ${last ? `<button class="btn small" data-do="rejoin">Rejoin table ${esc(last)}</button>` : ''}`
        : `<p class="note">Can’t reach the game server right now, so online play is off. Offline modes still work.</p>`}
      </div>
    </section>
    <section style="display:grid;gap:18px">
      <div class="shelf-head"><h2>Games</h2><span class="muted">${GAMES.length} ready to play</span></div>
      <div class="shelf">
        ${GAMES.map((g, i) => `<button class="tile" data-do="open" data-game="${g.id}" style="--i:${i}" aria-label="Open ${esc(g.name)}">
          <div class="art" aria-hidden="true">${g.art()}</div><span class="go">Play</span>
          <div class="meta"><h3>${esc(g.name)}</h3><p>${esc(g.blurb)}</p><div class="tags">${g.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div></div>
        </button>`).join('')}
        <button class="tile soon" data-do="reqopen"><div><div class="plus">+</div><b>Request a game</b><p class="muted">Missing a favourite? Tell us what to add next.</p></div></button>
        <button class="tile soon bugtile" data-do="bugopen"><div><div class="plus">🐞</div><b>Report a bug</b><p class="muted">Something not working? Tell us and we’ll fix it.</p></div></button>
      </div>
    </section>
  </div>`;
}

// Reporting a bug: what happened, plus (if allowed) a snapshot of this device and game, to /admin/requests.
const diag = () => ({build:PlayNet.build?.(), ua:navigator.userAgent, size:`${innerWidth}x${innerHeight}@${devicePixelRatio}`, game:GID, screen, mode,
  code:G?.code, phase:G?.phase, stage:G?.stage, v:G?.v, players:G?.players?.length, online:!!net.room?.connected?.(), hostAway:hostAway(), skew, errors:errs.slice(), game_state:ENG[GID]?.debug?.()});
const vBug = () => sheet(`<div class="eyebrow">Report a bug</div><h2>What went wrong?</h2>
  <p class="lede">Tell us what happened and what you were doing. The developer reads every report.</p>
  <div class="field"><label for="bg-what">What happened</label><textarea id="bg-what" maxlength="1000" rows="4" placeholder="e.g. Ravi’s drawing didn’t show on my phone"></textarea></div>
  <div class="field"><label for="bg-name">Your name (optional)</label><input id="bg-name" maxlength="30" value="${esc(form.name)}"></div>
  <label class="bg-diag"><input type="checkbox" id="bg-diag" checked> Include technical details (game, device, recent errors)</label>
  <div class="acts"><button class="btn" data-do="closemodal">Cancel</button><button class="btn gold" data-do="bugsend">Send report</button></div>`);
async function sendBug(btn){
  const what = document.getElementById('bg-what')?.value.trim() || '';
  if (what.length < 5) return toast('Tell us a little about what happened');
  btn.disabled = true;
  const body = {what, name:document.getElementById('bg-name')?.value.trim() || '', game:ENG[GID]?.name || GID || '', diag:document.getElementById('bg-diag')?.checked ? diag() : null};
  try {
    const r = await fetch('/api/bugs', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)});
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Couldn’t send that. Try again');
    ui.modal = null; render(); toast('Thanks! The bug report was sent');
  } catch (e) { btn.disabled = false; toast(e.message === 'Failed to fetch' ? 'Couldn’t reach the server. Try again' : e.message); }
}
// Asking for a game: it goes to the server, and the developer reads it at /admin/requests (see server.js).
const vRequest = () => sheet(`<div class="eyebrow">Request a game</div><h2>What should we add next?</h2>
  <p class="lede">Name the game and tell us how your group plays it. The developer reads every request.</p>
  <div class="field"><label for="rq-game">Game</label><input id="rq-game" maxlength="60" placeholder="e.g. Ludo, Carrom, 29, Kachuful" autocomplete="off"></div>
  <div class="field"><label for="rq-players">Players</label><input id="rq-players" maxlength="30" placeholder="e.g. 2–4"></div>
  <div class="field"><label for="rq-details">How it’s played, house rules, or a link (optional)</label><textarea id="rq-details" maxlength="600" rows="4"></textarea></div>
  <div class="field"><label for="rq-name">Your name (optional)</label><input id="rq-name" maxlength="30" value="${esc(form.name)}"></div>
  <div class="acts"><button class="btn" data-do="closemodal">Cancel</button><button class="btn gold" data-do="reqsend">Send request</button></div>`);
async function sendRequest(btn){
  const v = id => document.getElementById(id)?.value.trim() || '';
  const body = {game:v('rq-game'), players:v('rq-players'), details:v('rq-details'), name:v('rq-name')};
  if (body.game.length < 2) return toast('Tell us the game’s name');
  btn.disabled = true;
  try {
    const r = await fetch('/api/requests', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)});
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Couldn’t send that. Try again');
    ui.modal = null; render(); toast(`Thanks! “${body.game}” is on the list`);
  } catch (e) { btn.disabled = false; toast(e.message === 'Failed to fetch' ? 'Couldn’t reach the server. Try again' : e.message); }
}

/* ---------- views ---------- */
function vHome(){
  const saved = store.get('dm-local'), last = store.get('dm-last');
  const locals = form.locals.map((n, i) => `<div class="row"><input class="grow" id="lp${i}" data-local="${i}" value="${esc(n)}" placeholder="Player ${i + 1}" maxlength="18" aria-label="Player ${i + 1} name" style="min-width:0;background:rgba(0,0,0,.28);border:1px solid var(--line);border-radius:12px;padding:11px 14px;color:var(--text);font:500 16px var(--body)">${form.locals.length > 2 ? `<button class="tool" data-do="lrem" data-i="${i}" aria-label="Remove player ${i + 1}">Remove</button>` : ''}</div>`).join('');
  return `<div class="home">
    <button class="btn small backlink" data-do="hub">← All games</button>
    <section class="hero">
      <div>
        <div class="eyebrow">The property card game</div>
        <h1>Deal<em>maker</em></h1>
        <p>Bank cash, lay deeds, charge rent and steal sets with Sly Deals and Deal Breakers. First to three complete property sets wins.</p>
        <div class="facts"><span class="fact"><b>2–5</b> players</span><span class="fact"><b>106</b> cards</span><span class="fact"><b>3</b> plays a turn</span><span class="fact"><b>~20</b> minutes</span></div>
      </div>
      <div class="fan" aria-hidden="true">${fanHTML('lg', .55)}</div>
    </section>
    <section class="panels">
      <div class="panel">
        <div class="eyebrow">Online</div>
        <h2>Play with friends</h2>
        <div class="field"><label for="nm">Your name</label><input id="nm" data-f="name" value="${esc(form.name)}" maxlength="18" placeholder="e.g. Priya" autocomplete="nickname"></div>
        ${net.ready ? `
        <button class="btn gold" data-do="host">Host a new table</button>
        <div class="sep"></div>
        <div class="field"><label for="cd">Table code</label><div class="row"><input id="cd" class="grow code-in" data-f="code" value="${esc(form.code)}" maxlength="5" placeholder="ABCDE" autocomplete="off"><button class="btn" data-do="join">Join</button></div></div>
        ${last ? `<button class="btn small" data-do="rejoin">Rejoin table ${esc(last)}</button>` : ''}
        <p class="note">Everyone opens this same page while signed in. The host shares a 5-letter code and friends join with it.</p>`
        : `<p class="note">Can’t reach the game server right now, so online play is off. Offline modes still work.</p>`}
      </div>
      <div class="panel">
        <div class="eyebrow">One device</div>
        <h2>Pass &amp; play</h2>
        <p>Hand the phone or laptop around. Hands stay hidden behind a pass screen.</p>
        <div class="names">${locals}</div>
        <div class="row">${form.locals.length < 5 ? '<button class="btn small" data-do="ladd">Add player</button>' : ''}<button class="btn gold" data-do="local" style="margin-left:auto">Start game</button></div>
        ${saved?.phase === 'play' ? `<button class="btn small" data-do="resume">Resume saved game (${saved.players.map(p => esc(p.name)).join(', ')})</button>` : ''}
      </div>
      <div class="panel">
        <div class="eyebrow">New here?</div>
        <h2>How it works</h2>
        <p>Draw 2 cards each turn and play up to 3. Money goes in your bank, deeds go on the table, actions go in the middle. Payments come from your bank and properties, never your hand.</p>
        <button class="btn" data-do="rules">Read the full rules</button>
      </div>
    </section>
  </div>`;
}

function vLobby(s){
  const host = mode === 'host', on = live(); on.add(me);
  const hostP = P(s, s.host);
  return `<div class="lobby-wrap"><div class="panel lobby">
    <div class="eyebrow">Table code</div>
    <div class="row"><div class="bigcode">${esc(s.code)}</div><button class="btn small" data-do="copy" style="margin-left:auto">Copy code</button></div>
    <p>Friends open this page, enter their name, choose <b>Join</b> and type the code.</p>
    <ul class="seats">${s.players.map(p => `<li>${avatar(s, p)}<span class="grow">${esc(p.name)}${p.id === me ? ' (you)' : ''}</span>${p.id === s.host ? '<span class="tag">Host</span>' : ''}${payMark(s, p, host)}<span class="dot ${on.has(p.id) ? 'on' : ''}" title="${on.has(p.id) ? 'Connected' : 'Away'}"></span>${host && p.id !== me ? `<button class="tool" data-do="kick" data-id="${esc(p.id)}">Remove</button>` : ''}</li>`).join('')}</ul>
    <p class="muted">${ENG[GID].name} · ${s.players.length}/${ENG[GID].max} seats taken</p>
    ${ENG[GID].lobby ? ENG[GID].lobby(s, host) : ''}
    ${ENG[GID].timeout ? host ? `<label class="row timer-f"><b class="grow">Turn timer</b><select data-timer aria-label="Time for each turn">${TIMES.map(t => `<option value="${t}" ${t === (s.timer || 0) ? 'selected' : ''}>${t ? t + ' seconds' : 'Off'}</option>`).join('')}</select></label>`
      : s.timer ? `<p class="muted">Turn timer: ${s.timer} seconds. When it runs out, the game makes a safe move for you.</p>` : '' : ''}
    ${payPanel(s, host)}
    ${host ? (n => `<button class="btn gold" data-do="start" ${n < ENG[GID].min ? 'disabled' : ''}>${n < ENG[GID].min ? (s.pay?.on ? `Mark at least ${ENG[GID].min} players paid` : 'Waiting for at least one friend') : `Start with ${n}${s.pay?.on ? ' paid' : ''} player${n > 1 ? 's' : ''}`}</button>`)(seated(s).length)
      : P(s, me) ? (s.pay?.on && !isPaid(s, me) ? '' : `<p class="note">You’re in. Waiting for ${esc(hostP?.name || 'the host')} to deal.</p>`) : `<p class="note">Joining… if this takes long, check the code with the host.</p>`}
    <button class="btn small" data-do="leave">Leave table</button>
  </div></div>`;
}

/* ---------- paid entry ----------
   For games played for money: the host shows an entry fee and their payment QR, players pay outside
   the app and tap "I've paid", the host marks who really has, and only paid players get a seat.
   The QR lives in its own small document ("tables/CODE-qr") so it isn't re-sent with every move. */
let qrCache = {key:'', img:'', loading:''};
const safeImg = u => typeof u === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(u) ? u : '';
const isPaid = (s, id) => id === s.host || !!s.pay?.paid?.[id];
const seated = s => s.pay?.on ? s.players.filter(p => isPaid(s, p.id)) : s.players;
function loadQR(s){
  const key = s.code + ':' + s.pay.qr;
  if (qrCache.key === key || qrCache.loading === key || !net.db) return;
  qrCache.loading = key;
  net.db.doc(`tables/${s.code}-qr`).get().then(sn => { qrCache = {key, img:sn.exists ? safeImg(sn.data().img) : '', loading:''}; render(); }).catch(() => { qrCache.loading = ''; });
}
function payMark(s, p, host){
  if (!s.pay?.on || p.id === s.host) return '';
  const paid = isPaid(s, p.id), said = s.pay.said?.[p.id];
  if (host) return `<button class="tool pay-mark ${paid ? 'on' : said ? 'said' : ''}" data-do="paid" data-id="${esc(p.id)}" aria-pressed="${paid}">${paid ? 'Paid ✓' : said ? 'Says paid · confirm' : 'Mark paid'}</button>`;
  return `<span class="tag ${paid ? 'paid' : ''}">${paid ? 'Paid' : said ? 'Checking' : 'Not paid'}</span>`;
}
function payPanel(s, host){
  const pay = s.pay || {};
  if (!pay.on && !host) return '';
  if (pay.on && pay.qr) loadQR(s);
  const qr = pay.qr && qrCache.key === s.code + ':' + pay.qr ? qrCache.img : '', fee = +pay.fee || 0, n = seated(s).length;
  const pot = fee ? `<p class="pay-pot">Pot <b>₹${(fee * n).toLocaleString('en-IN')}</b> · ${n} paid</p>` : '';
  if (host) return `<div class="payp"><div class="row"><b class="grow">Paid entry</b><button class="btn small ${pay.on ? 'gold' : ''}" data-do="payon" aria-pressed="${!!pay.on}">${pay.on ? 'On' : 'Off'}</button></div>
    ${pay.on ? `<div class="row pay-f"><label>Entry fee ₹<input type="number" id="payfee" data-pay="fee" min="0" step="1" inputmode="numeric" value="${fee || ''}" placeholder="100"></label>
      <label class="grow">Pay to<input id="payto" data-pay="to" maxlength="40" value="${esc(pay.to || '')}" placeholder="Your name or UPI ID"></label></div>
      <div class="row">${qr ? `<img class="payqr" src="${qr}" alt="Your payment QR">` : ''}<label class="btn small">${qr ? 'Change QR' : 'Upload payment QR'}<input type="file" accept="image/*" data-payqr hidden></label></div>
      ${pot}<p class="muted">Players see your QR and tap “I’ve paid”. Mark them paid once the money arrives; only paid players get a seat when you start.</p>`
    : '<p class="muted">Playing for money? Turn this on to show an entry fee and your payment QR, and mark who has paid.</p>'}</div>`;
  const meSeat = P(s, me), paid = isPaid(s, me), said = pay.said?.[me] || ui.said;
  return `<div class="payp guest"><div class="row"><b class="grow">Entry fee ${fee ? `₹${fee.toLocaleString('en-IN')}` : ''}</b>${pay.to ? `<span class="muted">Pay to ${esc(pay.to)}</span>` : ''}</div>
    ${qr ? `<img class="payqr big" src="${qr}" alt="Payment QR for ${esc(pay.to || 'the host')}">` : pay.qr ? '<p class="muted">Loading the payment QR…</p>' : '<p class="muted">The host hasn’t added a QR yet. Ask them how to pay.</p>'}
    ${pot}
    ${!meSeat ? '' : paid ? '<p class="pay-ok">Payment confirmed. You have a seat.</p>' : said ? '<p class="note">Waiting for the host to confirm your payment.</p>' : '<button class="btn gold" data-do="paysaid">I’ve paid</button>'}
    <p class="muted">Only players the host marks as paid get a seat when the game starts.</p></div>`;
}
// The host's QR: shrunk to at most 480px so it fits comfortably in a table document.
async function uploadQR(file){
  if (mode !== 'host' || G?.phase !== 'lobby') return;
  if (!file || !/^image\//.test(file.type)) return toast('Pick an image of your payment QR');
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return toast('Couldn’t read that image');
  const k = Math.min(1, 480 / Math.max(img.width, img.height)), c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  let url = c.toDataURL('image/png');
  if (url.length > 200000) url = c.toDataURL('image/jpeg', .85);
  if (url.length > 240000) return toast('That image is too large. Try a cropped screenshot of the QR');
  try { await net.db.doc(`tables/${G.code}-qr`).set({img:url}); } catch { return toast('Couldn’t upload the QR. Check your connection and try again'); }
  const v = Date.now(); qrCache = {key:G.code + ':' + v, img:url, loading:''};
  G.pay = {...G.pay, qr:v}; G.v++; persist(); render();
}

/* ---------- joining mid-game ----------
   Long score games (Rummy, Least Count, the UNO games, Poker, Teen Patti) can take new players
   between rounds. Online, a spectator asks to join; the host gives them a starting score (or
   chips) and they're dealt in from the next round. On one device the host adds them by name. */
const lateCan = s => !!ENG[GID]?.late && s.phase !== 'lobby' && !!s.players;
function lateBar(s){
  if (!lateCan(s) || ui.modal) return '';
  const e = ENG[GID], late = s.late || [], wait = s.wait || {}, room = e.max - s.players.length - late.length;
  if (mode === 'guest'){
    if (P(s, me)) return '';
    const mine = late.find(l => l.id === me);
    return `<div class="late-bar">${mine ? `<span>You join next round with <b>${mine.score.toLocaleString()}</b> ${e.late.unit}.</span>`
      : (s.nolate || []).includes(me) ? '<span>The host didn’t add you to this game.</span>'
      : wait[me] || ui.asked ? '<span>Asked to join. Waiting for the host…</span>'
      : room > 0 ? '<button class="btn small gold" data-do="lateask">Ask to join this game</button>' : '<span>The table is full.</span>'}</div>`;
  }
  const n = Object.keys(wait).length;
  if (s.phase === 'play' && !n && !late.length) return '';   // mid-round it would only cover the table; new players join between rounds anyway
  return `<div class="late-bar"><button class="btn small ${n ? 'gold' : ''}" data-do="lateopen">${n ? `${n} waiting to join` : 'Add a player'}${late.length ? ` · ${late.length} joining next round` : ''}</button></div>`;
}
function lateSheet(s){
  const e = ENG[GID], late = s.late || [], wait = Object.entries(s.wait || {}), room = e.max - s.players.length - late.length;
  const sug = Math.round(e.late.score(s)), field = (id, v) => `<input type="number" class="cap-in" id="${id}" min="0" step="1" inputmode="numeric" value="${v}" aria-label="Starting ${e.late.unit}">`;
  return `<div class="scrim late-scrim"><div class="sheet" role="dialog" aria-modal="true"><div class="eyebrow">Joining mid-game</div><h2>Add players</h2>
    <p class="lede">New players are dealt in from the next round, starting with the ${e.late.unit} you give them. Suggested: ${sug.toLocaleString()} (${e.late.why}).</p>
    ${mode === 'local' ? `<div class="late-row"><input class="grow" id="late-name" maxlength="18" placeholder="Name" aria-label="New player’s name">${field('late-new', sug)}<button class="btn gold" data-do="lateadd" ${room > 0 ? '' : 'disabled'}>Add</button></div>`
      : wait.length ? wait.map(([id, w]) => `<div class="late-row"><b class="grow">${esc(w.name)}</b>${field('late-' + id, sug)}<button class="btn small" data-do="latedeny" data-id="${esc(id)}">Decline</button><button class="btn small gold" data-do="lateadmit" data-id="${esc(id)}" ${room > 0 ? '' : 'disabled'}>Add</button></div>`).join('')
      : '<p class="muted">Nobody is waiting. Friends who open this table’s code see an “Ask to join” button.</p>'}
    ${s.pay?.on ? `<p class="muted">Paid table: collect the ₹${(+s.pay.fee || 0).toLocaleString('en-IN')} entry before you add someone.</p>` : ''}
    ${late.length ? `<div class="field"><label>Joining next round</label>${late.map(l => `<div class="late-row"><span class="grow">${esc(l.name)}</span><span class="muted">${l.score.toLocaleString()} ${e.late.unit}</span><button class="tool" data-do="lateremove" data-id="${esc(l.id)}">Remove</button></div>`).join('')}</div>` : ''}
    ${room <= 0 ? `<p class="warn">The table is full (${e.max} players).</p>` : ''}
    <div class="acts"><button class="btn" data-do="closemodal">Done</button></div></div></div>`;
}
const lateSave = () => { G.v++; if (mode === 'host') persist(); else store.set(LKEY(), G); render(); };
function lateAdmit(id, name, el){
  const v = Math.round(+el?.value);
  if (!el || el.value === '' || !(v >= 0)) return toast('Type a starting score of 0 or more');
  if ((G.late || []).length + G.players.length >= ENG[GID].max) return toast('The table is full');
  G.late = [...(G.late || []), {id, name, score:v}];
  const wait = {...(G.wait || {})}; delete wait[id]; G.wait = wait;
  if (G.pay?.on) G.pay = {...G.pay, paid:{...(G.pay.paid || {}), [id]:true}};
  log(G, `${name} will join next round with ${v.toLocaleString()} ${ENG[GID].late.unit}`);
  lateSave();
}

/* ---------- turn timer and voting a player out (online tables) ----------
   The host picks seconds per turn in the lobby. Each player who has to act gets that long (fresh after
   every move they make); when it runs out, the host's device makes the game's safe move for them
   (draw, fold, pack, end the turn…). The host can also call a vote to remove a player: a majority of
   the others decides, and the game plays their turns safely until the round ends, then deals without them. */
const TIMES = [0, 15, 30, 45, 60, 90, 120];
const playing = s => !!s?.players && s.phase !== 'lobby' && s.phase !== 'over';
let skew = 0;   // host's clock minus this device's, so guests count down to the host's deadlines
const clockEl = Object.assign(document.createElement('div'), {className:'turn-clock', hidden:true});
document.body.append(clockEl);
const voters = s => s.players.filter(p => !s.gone?.[p.id] && p.id !== s.vote?.target).map(p => p.id);
function tally(){
  const v = G.vote, ids = voters(G), y = ids.filter(id => v.yes[id]).length, n = ids.filter(id => v.no[id]).length;
  if (y * 2 > ids.length){
    G.gone = {...G.gone, [v.target]:true}; G.nolate = [...(G.nolate || []), v.target]; G.vote = null;
    log(G, `${v.name} was voted out (${y}–${n})`, 'big', {title:'Voted out', sub:v.name});
  } else if (n * 2 >= ids.length || Date.now() > v.until){ G.vote = null; log(G, `${v.name} stays (${y}–${n})`); }
}
function hostClock(){
  if (mode !== 'host' || !playing(G)) return;
  const e = ENG[GID], now = Date.now(), need = e.timeout ? e.needs(G) : [], clock = {...(G.clock || {})};
  let changed = false;
  if (G.vote && now > G.vote.until){ tally(); changed = true; }
  for (const id of Object.keys(clock)) if (!need.includes(id)){ delete clock[id]; changed = true; }
  for (const id of need){
    const gone = G.gone?.[id];
    if (!gone && !G.timer) continue;
    if (!gone && !clock[id]){ clock[id] = now + G.timer * 1000; changed = true; continue; }
    if (!gone && clock[id] > now) continue;
    if (!gone) log(G, `${P(G, id).name} ran out of time`);
    for (let k = 0; k < 8 && e.needs(G).includes(id) && !e.apply(G, id, e.timeout(G, id)); k++) changed = true;
    delete clock[id];
  }
  if (changed){ G.clock = clock; G.now = now; G.v++; persist(); render(); }
}
function showClock(){
  if (screen === 'game' && hostAway()){
    const html = `<span>${esc(P(G, G.host)?.name || 'Host')}’s phone is away</span><b>…</b>`;
    if (clockEl.innerHTML !== html) clockEl.innerHTML = html;
    clockEl.className = 'turn-clock away'; clockEl.hidden = false; return;
  }
  clockEl.classList.remove('away');
  const s = G, ids = s?.timer && screen === 'game' && mode !== 'local' && playing(s) ? ENG[GID].needs(s).filter(id => s.clock?.[id] && !s.gone?.[id]) : [];
  if (!ids.length){ clockEl.hidden = true; return; }
  const mine = ids.includes(me), left = Math.max(0, Math.ceil((s.clock[mine ? me : ids[0]] - Date.now() - skew) / 1000));
  const who = mine ? 'Your turn' : ids.slice(0, 2).map(id => P(s, id).name).join(', ') + (ids.length > 2 ? ` +${ids.length - 2}` : '');
  const html = `<span>${esc(who)}</span><b>${left}s</b>`;
  if (clockEl.innerHTML !== html) clockEl.innerHTML = html;
  clockEl.classList.toggle('mine', mine); clockEl.classList.toggle('low', left <= 5);
  clockEl.hidden = false;
}
let wasMine = false;
setInterval(() => {
  const now = Date.now();
  if (mode === 'host' && net.room && now - lastBeat > 10000){ lastBeat = now; net.room.presence({beat:now}).catch(() => {}); }
  if (mode === 'guest' && opt && now - opt.at > 5000){ opt.at = now; net.room?.presence({act:{n:opt.n, a:opt.a}}).catch(() => {}); }   // no answer yet: send it again (the host ignores repeats)
  const mine = mode !== 'local' && screen === 'game' && playing(G) && !!ENG[GID].needs?.(G).includes(me);
  if (mine && !wasMine && document.visibilityState === 'visible') navigator.vibrate?.(70);
  wasMine = mine;
  hostClock(); showClock(); catchUp();
  if (mode === 'host' && playing(G) && ENG[GID].tick?.(G)){ G.v++; persist(); render(); }
}, 500);
function voteCard(s){
  const v = s.vote, ids = voters(s), y = ids.filter(id => v.yes[id]).length, n = ids.filter(id => v.no[id]).length;
  const mine = v.yes[me] ? 'to remove' : v.no[me] ? 'to keep' : myVote === v.id ? '' : null;
  const done = mine != null || !ids.includes(me) || me === v.target;   // nothing left to answer: shrink so it doesn't cover the game
  return `<div class="vote-card ${done && mode !== 'host' ? 'small' : ''}" role="status"><div class="eyebrow">Table vote</div><b>Remove ${esc(v.name)} from the game?</b>
    <p class="muted">${y} remove · ${n} keep · ${Math.floor(ids.length / 2) + 1} needed</p>
    ${me === v.target ? '<p>The table is voting on you.</p>' : !ids.includes(me) ? '' : mine != null ? `<p>You voted${mine ? ' ' + mine : ''}.</p>`
      : '<div class="acts"><button class="btn small" data-do="vote" data-yes="">Keep</button><button class="btn small gold" data-do="vote" data-yes="1">Remove</button></div>'}
    ${mode === 'host' ? '<button class="tool" data-do="votestop">Cancel the vote</button>' : ''}</div>`;
}
function playersSheet(s){
  return sheet(`<div class="eyebrow">Players</div><h2>Vote someone out</h2>
    <p class="lede">Call a vote to remove a player. Everyone else votes; a majority removes them. The game plays their turns safely until this round ends.</p>
    ${s.players.filter(p => p.id !== me).map(p => `<div class="late-row"><span class="grow">${esc(p.name)}</span>${s.gone?.[p.id] ? '<span class="muted">Voted out</span>'
      : `<button class="btn small" data-do="votecall" data-id="${esc(p.id)}" ${s.vote ? 'disabled' : ''}>Call a vote</button>`}</div>`).join('')}
    ${s.vote ? '<p class="muted">One vote at a time.</p>' : ''}
    <div class="acts"><button class="btn" data-do="closemodal">Done</button></div>`);
}
let myVote = null;


/* ---------- table chat ----------
   Everyone at an online table can chat, in the lobby and during play. Each player's last few messages ride
   in their presence, so chat works even while the host's phone is away and nothing is stored on the server;
   someone who arrives later sees messages from then on. The panel lives outside #app so re-renders never
   steal the text box. */
const QUICK = ['👍', '😂', '🔥', '😮', '😬', 'Nice one!', 'Hurry up!', 'Good game!', 'Not again 😩'];
let chat = {code:'', log:[], seen:{}, mine:[], open:false, unread:0};
const chatEl = Object.assign(document.createElement('div'), {className:'chat', hidden:true});
chatEl.innerHTML = `<button class="chat-btn" data-c="toggle" aria-label="Table chat">💬<b class="chat-n" hidden></b></button>
  <div class="chat-pop" aria-live="polite"></div>
  <section class="chat-panel" role="dialog" aria-label="Table chat" hidden>
    <header><b>Table chat</b><button class="tool" data-c="toggle">Close</button></header>
    <ol class="chat-log"></ol>
    <div class="chat-quick">${QUICK.map(q => `<button data-c="quick">${q}</button>`).join('')}</div>
    <form class="chat-form"><input class="chat-in" maxlength="120" placeholder="Say something…" aria-label="Message" autocomplete="off"><button class="btn small gold">Send</button></form>
  </section>`;
document.body.append(chatEl);
const chatOn = () => !!net.room && screen === 'game' && mode !== 'local' && !!G;
function chatPull(){
  if (!chatOn()) return;
  if (chat.code !== G.code) chat = {code:G.code, log:[], seen:{}, mine:[], open:chat.open, unread:0};
  let fresh = null;
  for (const peer of net.room.peers()){
    const pr = peer.presence || {};
    if (typeof pr.pid !== 'string' || !Array.isArray(pr.chat)) continue;
    for (const m of pr.chat.slice(-4)){
      if (!m || typeof m.t !== 'string' || typeof m.n !== 'number') continue;
      const k = pr.pid + ':' + m.n; if (chat.seen[k]) continue;
      chat.seen[k] = 1;
      const e = {pid:pr.pid, name:String(pr.name || 'Player').slice(0, 18), t:m.t.slice(0, 120), n:m.n};
      chat.log.push(e);
      if (pr.pid !== me){ fresh = e; if (!chat.open) chat.unread++; }
    }
  }
  chat.log.sort((a, b) => a.n - b.n); chat.log = chat.log.slice(-80);
  if (fresh){ sfx('turn'); if (!chat.open) chatPop(fresh); }
  drawChat(true);
}
function chatSay(t){
  t = String(t || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!t || !net.room) return;
  const m = {n:Date.now(), t};
  chat.mine = [...chat.mine, m].slice(-4);
  chat.seen[me + ':' + m.n] = 1;
  chat.log.push({pid:me, name:form.name.trim().slice(0, 18) || 'You', t, n:m.n});
  net.room.presence({chat:chat.mine}).catch(() => toast('Couldn’t send that. Check your connection'));
  drawChat(true);
}
let popT = 0;
function chatPop(e){
  const p = chatEl.querySelector('.chat-pop');
  p.innerHTML = `<b>${esc(e.name)}</b> ${esc(e.t)}`; p.classList.add('on');
  clearTimeout(popT); popT = setTimeout(() => p.classList.remove('on'), 3200);
}
function drawChat(list){
  const on = chatOn();
  chatEl.hidden = !on; if (!on) return;
  const panel = chatEl.querySelector('.chat-panel'), n = chatEl.querySelector('.chat-n');
  panel.hidden = !chat.open;
  n.hidden = !chat.unread; n.textContent = chat.unread > 9 ? '9+' : chat.unread;
  if (!list) return;
  const ol = chatEl.querySelector('.chat-log');
  ol.innerHTML = chat.log.length ? chat.log.map(e => `<li class="${e.pid === me ? 'me' : ''}"><b style="--pc:${G?.players ? seatColor(G, e.pid) : '#fff'}">${e.pid === me ? 'You' : esc(e.name)}</b><span>${esc(e.t)}</span></li>`).join('')
    : '<li class="muted">No messages yet. Say hi 👋</li>';
  ol.scrollTop = ol.scrollHeight;
}
chatEl.addEventListener('click', e => {
  const b = e.target.closest('[data-c]'); if (!b) return;
  if (b.dataset.c === 'toggle'){ chat.open = !chat.open; chat.unread = 0; chatEl.querySelector('.chat-pop').classList.remove('on'); drawChat(true); if (chat.open) chatEl.querySelector('.chat-in').focus(); }
  if (b.dataset.c === 'quick') chatSay(b.textContent);
});
chatEl.querySelector('.chat-form').addEventListener('submit', e => {
  e.preventDefault(); const i = chatEl.querySelector('.chat-in'); chatSay(i.value); i.value = ''; i.focus();
});
chatEl.addEventListener('keydown', e => { if (e.key === 'Escape' && chat.open){ chat.open = false; drawChat(); } });

function vGame(s){
  if (s.phase === 'lobby') return vLobby(s);
  const meP = P(s, me), cur = s.players[s.turn], myTurn = s.phase === 'play' && cur.id === me;
  const idx = s.players.findIndex(p => p.id === me);
  const opps = idx < 0 ? s.players : [...s.players.slice(idx + 1), ...s.players.slice(0, idx)];
  return `<div class="game ${ui.log ? 'log-open' : ''}">
    <div class="main">
      ${vTop(s, cur, myTurn)}
      <section class="opps" aria-label="Other players">${opps.map(p => vOpp(s, p, cur)).join('')}</section>
      ${vMid(s, cur, myTurn)}
      ${meP ? vMine(s, meP, myTurn) + vHandbar(s, meP, myTurn) : '<div class="spect">You’re watching this game.</div>'}
    </div>
    ${vLog(s)}
  </div>${vModal(s, meP, cur, myTurn)}${vCurtain(s)}`;
}

function vTop(s, cur, myTurn){
  const syncing = mode === 'guest' && opt && (G.ack?.[me] || 0) < opt.n;
  return `<header class="top">
    <div class="brand">Deal<em>maker</em></div>
    <div class="turn">${avatar(s, cur, 'sm')}<span><b>${myTurn ? 'Your' : esc(cur.name) + '’s'}</b> turn</span><span class="pips" aria-label="${3 - s.plays} plays left">${[0, 1, 2].map(i => `<i class="${i < s.plays ? 'used' : ''}"></i>`).join('')}</span></div>
    ${syncing ? '<span class="sync"><span class="dot on"></span>Syncing</span>' : ''}
    ${mode === 'guest' && !ui.hostOnline ? '<span class="sync"><span class="dot"></span>Host is away</span>' : ''}
    <div class="tools">
      ${s.code ? `<span class="codechip" title="Table code">${esc(s.code)}</span>` : ''}
      <button class="tool logbtn" data-do="log">Log</button>
      <button class="tool" data-do="rules">Rules</button>
      <button class="tool" data-do="mute">${muted ? 'Sound off' : 'Sound on'}</button>
      <button class="tool" data-do="leave">Leave</button>
    </div>
  </header>`;
}

function vOpp(s, p, cur){
  const on = live(), online = mode === 'local' || on.has(p.id) || p.id === me;
  const pickPlayer = ui.mode === 'pickplayer';
  const opts = {cid:true};
  if (ui.mode === 'sly' || ui.mode === 'forced-theirs'){
    opts.ccls = g => full(g) ? '' : 'pick';
    opts.cattrs = (g, id) => full(g) ? '' : `data-do="tprop" data-id="${id}" data-owner="${esc(p.id)}" role="button" tabindex="0"`;
  }
  if (ui.mode === 'breaker'){
    opts.gcls = g => full(g) ? 'pick' : '';
    opts.gattrs = g => full(g) ? `data-do="tset" data-gcard="${g.cards[0]}" data-owner="${esc(p.id)}" role="button" tabindex="0"` : '';
  }
  const sets = setsOf(p);
  return `<article class="opp ${p.id === cur.id && s.phase === 'play' ? 'is-turn' : ''} ${pickPlayer ? 'pickable' : ''}" data-pid="${esc(p.id)}" ${pickPlayer ? `data-do="player" data-id="${esc(p.id)}" role="button" tabindex="0"` : ''}>
    <div class="opp-head">${avatar(s, p)}
      <div class="opp-name"><b>${esc(p.name)}</b><small><span class="dot ${online ? 'on' : ''}"></span><span class="backs">${'<i></i>'.repeat(Math.min(p.hand.length, 8))}</span>&nbsp;${p.hand.length} in hand</small></div>
      <div class="stat"><span class="num">$${worth(p.bank)}M</span><span class="stars" aria-label="${sets} of 3 sets"><b>${'★'.repeat(Math.min(sets, 3))}</b>${'★'.repeat(Math.max(0, 3 - sets))}</span></div>
    </div>
    <div class="opp-props">${p.groups.length ? p.groups.map(g => grpEl(g, 'mini', opts)).join('') : '<span class="empty">No properties yet</span>'}</div>
  </article>`;
}

function vMid(s, cur, myTurn){
  const pile = s.discard.slice(-3);
  let big, hint = '';
  const pd = s.pending, nd = needs(s);
  if (s.phase === 'over') big = `${esc(P(s, s.winner).name)} wins`;
  else if (pd){
    big = nd.includes(me) ? 'Your answer is needed' : `Waiting on ${nd.map(id => esc(P(s, id).name)).join(', ')}`;
    hint = `${esc(P(s, pd.actor).name)} played ${KIND[pd.kind]}${PAY.has(pd.kind) ? ` for $${pd.amount}M` : ''}`;
  } else if (s.discarding) big = myTurn ? 'Discard down to 7' : `${esc(cur.name)} is discarding`;
  else if (myTurn){
    const left = 3 - s.plays;
    big = left ? `Play up to ${left} more card${left > 1 ? 's' : ''}` : 'No plays left';
    hint = left ? 'Tap a card in your hand, or drag it to your bank or properties.' : 'End your turn when you’re ready.';
  } else { big = `${esc(cur.name)} is playing`; hint = `${3 - s.plays} play${3 - s.plays === 1 ? '' : 's'} left this turn`; }
  return `<section class="mid">
    <div class="pile" id="deck" title="Draw pile"><div class="card sm back"></div><span class="num">${s.deck.length} left</span></div>
    <div class="pile" id="discard" data-drop="center" title="Discard pile"><div class="stack">${pile.length ? pile.map(id => `<div class="dc" style="--rot:${rotOf(id)}deg">${cardEl(id, 'sm', {cid:true})}</div>`).join('') : '<div class="card sm ghost"></div>'}</div><span>Discard</span></div>
    <div class="status" aria-live="polite"><span class="big">${big}</span>${hint ? `<span class="hint">${hint}</span>` : ''}</div>
  </section>`;
}

function vMine(s, meP, myTurn){
  const free = myTurn && !s.pending && !s.discarding;
  const opts = {cid:true};
  if (ui.mode === 'forced-mine'){
    opts.ccls = g => full(g) ? '' : 'pick';
    opts.cattrs = (g, id) => full(g) ? '' : `data-do="mprop" data-id="${id}" role="button" tabindex="0"`;
  } else if (free){
    opts.ccls = (g, id) => C(id).type === 'wild' ? 'movable' : '';
    opts.cattrs = (g, id) => C(id).type === 'wild' ? `data-do="wild" data-id="${id}" role="button" tabindex="0" title="Move this wild card"` : '';
  }
  const bank = [...meP.bank].sort((a, b) => C(b).value - C(a).value);
  const sets = setsOf(meP);
  return `<section class="mine ${myTurn ? 'is-turn' : ''}" data-pid="${esc(me)}">
    <div class="mine-head">${avatar(s, meP)}<b>${esc(meP.name)}</b><span class="muted">(you)</span>
      <span class="stars" aria-label="${sets} of 3 sets"><b>${'★'.repeat(Math.min(sets, 3))}</b>${'★'.repeat(Math.max(0, 3 - sets))}</span>
      <span class="muted">${sets}/3 sets</span></div>
    <div class="zones">
      <div class="zone" data-drop="prop"><div class="zl">Properties</div>
        <div class="groups">${meP.groups.length ? meP.groups.map(g => `<div>${grpEl(g, 'sm', opts)}<div class="cnt">${COLORS[g.color].name} ${g.cards.length}/${COLORS[g.color].n}</div></div>`).join('') : '<p class="empty">Lay property cards here. Three complete sets wins.</p>'}</div></div>
      <div class="zone" data-drop="bank"><div class="zl">Bank <b>$${worth(meP.bank)}M</b></div>
        ${bank.length ? `<div class="bankrow">${bank.map(id => cardEl(id, 'sm', {cid:true})).join('')}</div>` : '<p class="empty">Bank money and action cards here.</p>'}</div>
    </div>
  </section>`;
}

const cbtn = (color, act, data, label, dis = '') => `<button class="chipc" data-do="${act}" ${Object.entries(data).map(([k, v]) => `data-${k}="${v}"`).join(' ')} ${dis} style="--c:${COLORS[color].hex}"><i></i>${label}</button>`;
function vDock(s, meP, myTurn){
  const free = myTurn && !s.pending && !s.discarding && s.phase === 'play';
  const cancel = '<button class="btn small" data-do="cancel">Cancel</button>';
  const prompts = {
    sly:'Tap a property to steal. Complete sets are safe.',
    'forced-theirs':'Tap the property you want to take.',
    'forced-mine':'Now tap one of your properties to give away.',
    breaker:'Tap a complete set to steal.',
    pickplayer:`Tap a player to charge${ui.pend?.amt ? ` $${ui.pend.amt}M` : ''}.`,
  };
  if (ui.mode) return `<span class="what">${prompts[ui.mode]}</span>${cancel}`;
  if (ui.moveCard != null && free){
    const c = C(ui.moveCard), g = groupOf(meP, ui.moveCard);
    return `<span class="what">Move wild card to</span>${c.colors.filter(k => k !== g?.color).map(k => cbtn(k, 'move', {id:ui.moveCard, color:k}, COLORS[k].name)).join('')}${cancel}`;
  }
  if (ui.sel == null || !meP.hand.includes(ui.sel)){
    if (!myTurn) return `<span class="hint idle">Your cards are safe in your hand. Payments come from your bank and table.</span>`;
    return `<span class="hint idle">${s.plays < 3 ? 'Select a card to see what it can do.' : 'Out of plays. Tap End turn.'}</span>`;
  }
  const id = ui.sel, c = C(id);
  if (!free) return `<span class="what">${esc(c.name)}</span><span class="hint">You can play this on your turn.</span>`;
  const dis = s.plays >= 3 ? 'disabled' : '';
  const b = [];
  if (c.type === 'money') b.push(`<button class="btn gold" data-do="bank" data-id="${id}" ${dis}>Bank $${c.value}M</button>`);
  if (c.type === 'prop') b.push(cbtn(c.color, 'prop', {id, color:c.color}, `Lay on ${COLORS[c.color].name}`, dis));
  if (c.type === 'wild') c.colors.forEach(k => b.push(cbtn(k, 'prop', {id, color:k}, COLORS[k].name, dis)));
  if (c.type === 'rent'){
    const nd = meP.hand.filter(x => C(x).act === 'double').length, maxD = Math.max(0, Math.min(nd, 2 - s.plays));
    if (ui.dbl > maxD) ui.dbl = maxD;
    const opts = c.colors.filter(k => rentFor(meP, k) > 0);
    if (!opts.length) b.push(`<span class="hint">You need a matching property to charge rent.</span>`);
    opts.forEach(k => b.push(cbtn(k, 'rent', {id, color:k}, `${COLORS[k].name} · $${rentFor(meP, k) * 2 ** ui.dbl}M`, dis)));
    if (maxD && opts.length) b.push(`<button class="chipc ${ui.dbl ? 'on' : ''}" data-do="dbl" style="--c:var(--brass)"><i></i>${ui.dbl ? `Doubled ×${2 ** ui.dbl}` : 'Double the Rent'}</button>`);
  }
  if (c.type === 'action'){
    const opps = s.players.filter(p => p.id !== me);
    const loose = opps.some(p => p.groups.some(g => !full(g)));
    const mineLoose = meP.groups.some(g => !full(g));
    const fullSets = opps.some(p => p.groups.some(full));
    const can = {sly:loose, forced:loose && mineLoose, breaker:fullSets};
    const label = {passgo:'Draw 2 cards', birthday:'Everyone pays you $2M', debt:'Choose who pays $5M', sly:'Choose a property to steal', forced:'Choose a swap', breaker:'Choose a set to steal'};
    if (label[c.act]) b.push(`<button class="btn gold" data-do="${c.act}" data-id="${id}" ${dis || (c.act in can && !can[c.act] ? 'disabled' : '')}>${label[c.act]}</button>`);
    if (c.act in can && !can[c.act]) b.push(`<span class="hint">${c.act === 'breaker' ? 'No one has a complete set yet.' : c.act === 'forced' && !mineLoose ? 'You need a loose property to swap.' : 'No properties to take.'}</span>`);
    if (c.act === 'house' || c.act === 'hotel'){
      const ok = meP.groups.filter(g => full(g) && g.color !== 'railroad' && g.color !== 'utility' && (c.act === 'house' ? g.house == null : g.house != null && g.hotel == null));
      ok.forEach(g => b.push(cbtn(g.color, 'build', {id, gcard:g.cards[0]}, `Build on ${COLORS[g.color].name}`, dis)));
      if (!ok.length) b.push(`<span class="hint">${c.act === 'house' ? 'Needs a complete set (not railroads or utilities).' : 'Needs a complete set with a house.'}</span>`);
    }
    if (c.act === 'jsn') b.push('<span class="hint">Keep it to block an action, or bank it.</span>');
    if (c.act === 'double') b.push('<span class="hint">Select a rent card to use this.</span>');
  }
  if (c.type === 'action' || c.type === 'rent') b.push(`<button class="btn" data-do="bank" data-id="${id}" ${dis}>Bank $${c.value}M</button>`);
  return `<span class="what">${esc(c.name)}</span>${b.join('')}`;
}

const HORDER = {prop:0, wild:1, rent:2, action:3, money:4};
function vHandbar(s, meP, myTurn){
  const hand = [...meP.hand].sort((a, b) => HORDER[C(a).type] - HORDER[C(b).type] || C(b).value - C(a).value || a - b);
  const mid = (hand.length - 1) / 2;
  const canEnd = myTurn && !s.pending && !s.discarding && s.phase === 'play';
  return `<section class="handbar" aria-label="Your hand">
    <div class="dock">${vDock(s, meP, myTurn)}</div>
    <div class="handrow">
      <div class="hand">${hand.map((id, i) => {
        const d = i - mid, r = (d * Math.min(4, 26 / Math.max(hand.length, 1))).toFixed(2), y = (d * d * .9).toFixed(1);
        return `<div class="slot ${ui.sel === id ? 'sel' : ''}" style="--r:${r}deg;--y:${y}px" draggable="${canEnd}" data-drag="${id}">${cardEl(id, 'md', {cid:true, attrs:`data-do="sel" data-id="${id}" role="button" tabindex="0" aria-label="${esc(C(id).name)}"`})}</div>`;
      }).join('') || '<p class="empty">No cards in hand. You’ll draw 5 next turn.</p>'}</div>
      <button class="btn gold endturn" data-do="end" ${canEnd ? '' : 'disabled'}>End turn</button>
    </div>
  </section>`;
}

function vLog(s){
  return `<aside class="log" aria-label="Table log"><div class="row" style="margin-bottom:10px"><h3>Table log</h3><button class="tool logbtn" data-do="log" style="margin-left:auto">Close</button></div>
    <ol>${s.log.slice().reverse().map(e => `<li class="k-${e.kind}">${esc(e.text)}</li>`).join('')}</ol></aside>`;
}

const sheet = inner => `<div class="scrim"><div class="sheet" role="dialog" aria-modal="true">${inner}</div></div>`;
function vModal(s, meP, cur, myTurn){
  if (ui.modal === 'rules') return vRules();
  if (s.phase === 'over') return vWin(s);
  if (s.pending && meP && needs(s).includes(me) && !(mode === 'local' && ui.revealed !== me)) return vRespond(s, meP);
  if (s.discarding && myTurn) return vDiscard(s, meP);
  return '';
}
function vRespond(s, meP){
  const pd = s.pending, actor = P(s, pd.actor);
  const jsnId = CARDS.find(c => c.act === 'jsn').id;
  if (me === pd.actor){
    const slot = pd.targets.find(t => !t.done && t.no % 2), tp = P(s, slot.pid);
    return sheet(`<div class="eyebrow">${KIND[pd.kind]}</div><h2>${esc(tp.name)} said Just Say No</h2>
      <p class="lede">Accept it and your ${KIND[pd.kind]} is cancelled for ${esc(tp.name)}, or play your own Just Say No to push it through.</p>
      <div class="sheet-cards">${cardEl(jsnId, 'lg')}</div>
      <div class="acts"><button class="btn" data-do="accept" data-target="${esc(tp.id)}">Accept</button><button class="btn gold" data-do="no" data-target="${esc(tp.id)}">Just Say No back</button></div>`);
  }
  const slot = pd.targets.find(t => t.pid === me && !t.done && t.no % 2 === 0);
  const no = hasNo(meP) ? `<button class="btn gold" data-do="no">Just Say No</button>` : '';
  const countered = slot.no ? `<p class="warn">${esc(actor.name)} answered your No with one of their own.</p>` : '';
  if (PAY.has(pd.kind)){
    const assets = payable(meP), key = `${pd.actor}:${pd.card}:${slot.no}`;
    if (ui.payKey !== key){ ui.payKey = key; ui.pay = autoPick(meP, assets, pd.amount); }
    ui.pay = ui.pay.filter(id => assets.includes(id));
    const sum = worth(ui.pay), ok = sum >= pd.amount || ui.pay.length === assets.length;
    const why = pd.kind === 'rent' ? `Rent on ${COLORS[pd.color].name}${pd.doubled ? `, doubled${pd.doubled > 1 ? ' twice' : ''}` : ''}` : pd.kind === 'birthday' ? 'It’s their birthday' : 'Debt Collector';
    const pickc = (id, color) => `<button class="pickc ${ui.pay.includes(id) ? 'on' : ''}" data-do="ptog" data-id="${id}" aria-pressed="${ui.pay.includes(id)}">${cardEl(id, 'sm', {color})}</button>`;
    const props = meP.groups.flatMap(g => [...g.cards.filter(id => C(id).value > 0).map(id => pickc(id, g.color)), ...[g.house, g.hotel].filter(x => x != null).map(id => pickc(id))]);
    return sheet(`<div class="eyebrow">${why}</div><h2>${esc(actor.name)} wants $${pd.amount}M from you</h2>${countered}
      <p class="lede">You choose what to pay with. No change is given. If you can’t cover it, you pay everything on your table.</p>
      <div class="picker">${meP.bank.length ? `<h4>Bank</h4><div class="picks">${[...meP.bank].sort((a, b) => C(b).value - C(a).value).map(id => pickc(id)).join('')}</div>` : ''}
        ${props.length ? `<h4>Properties and buildings</h4><div class="picks">${props.join('')}</div>` : ''}</div>
      <div class="paybar"><div class="grow"><span class="num">$${sum}M</span> <span class="muted">of $${pd.amount}M selected${sum > pd.amount ? ` · overpaying $${sum - pd.amount}M` : ''}</span><div class="meter"><i style="width:${Math.min(100, sum / pd.amount * 100)}%"></i></div></div>
        <button class="btn small" data-do="autopay">Best pick</button></div>
      <div class="acts">${no}<button class="btn ${no ? '' : 'gold'}" data-do="pay" ${ok ? '' : 'disabled'}>Pay $${sum}M</button></div>`);
  }
  let show = '', head = '';
  if (pd.kind === 'breaker'){ const g = groupOf(meP, pd.gcard); head = `${esc(actor.name)} is taking your ${COLORS[g?.color || pd.color].name} set`; show = g ? grpEl(g, 'md') : ''; }
  else if (pd.kind === 'sly'){ head = `${esc(actor.name)} is taking a property`; show = cardEl(pd.tcard, 'lg', {color:groupOf(meP, pd.tcard)?.color}); }
  else { head = `${esc(actor.name)} wants to swap`; show = `<div style="display:grid;gap:6px;justify-items:center"><span class="eyebrow">You give</span>${cardEl(pd.tcard, 'md', {color:groupOf(meP, pd.tcard)?.color})}</div><div style="display:grid;gap:6px;justify-items:center"><span class="eyebrow">You get</span>${cardEl(pd.mycard, 'md', {color:groupOf(actor, pd.mycard)?.color})}</div>`; }
  return sheet(`<div class="eyebrow">${KIND[pd.kind]}</div><h2>${head}</h2>${countered}<div class="sheet-cards">${show}</div>
    <div class="acts"><button class="btn ${no ? '' : 'gold'}" data-do="accept">Allow it</button>${no}</div>`);
}
function vDiscard(s, meP){
  const need = meP.hand.length - 7;
  ui.disc = ui.disc.filter(id => meP.hand.includes(id));
  return sheet(`<div class="eyebrow">End of turn</div><h2>Discard ${need} card${need > 1 ? 's' : ''}</h2><p class="lede">You can hold 7 cards at the end of your turn.</p>
    <div class="picks">${meP.hand.map(id => `<button class="pickc ${ui.disc.includes(id) ? 'on' : ''}" data-do="dtog" data-id="${id}">${cardEl(id, 'sm')}</button>`).join('')}</div>
    <div class="acts"><span class="muted" style="margin-right:auto">${ui.disc.length} of ${need} picked</span><button class="btn gold" data-do="discard" ${ui.disc.length === need ? '' : 'disabled'}>Discard</button></div>`);
}
function vWin(s){
  const w = P(s, s.winner), canRestart = mode === 'local' || mode === 'host';
  return sheet(`<div class="eyebrow">Game over</div><h2>${w.id === me && mode !== 'local' ? 'You win!' : `${esc(w.name)} wins!`}</h2>
    <p class="lede">Three complete sets on the table.</p>
    <div class="sheet-cards">${w.groups.filter(full).map(g => grpEl(g, 'sm')).join('')}</div>
    <div class="acts"><button class="btn" data-do="leave">Back to menu</button>${canRestart ? '<button class="btn gold" data-do="again">Play again</button>' : '<span class="muted">The host can start a new game.</span>'}</div>`);
}
function vRules(){
  const R = [
    ['Goal', 'Be the first to have 3 complete property sets on the table. Each card shows how many of its color make a set. Sets of the same color count.'],
    ['Setup', 'Everyone gets 5 cards. At the start of your turn draw 2, or 5 if your hand is empty.'],
    ['Your turn', 'Play up to 3 cards: money or action cards into your bank, property cards onto the table, or action cards into the middle. You don’t have to play all 3.'],
    ['Hand limit', 'End your turn with 7 cards or fewer. Discard the rest.'],
    ['Paying', 'You choose what to pay with, from your bank and properties. Cards in your hand are safe. No change is given. If you can’t cover the amount, you hand over everything on your table.'],
    ['Rent', 'Two-color rent charges everyone for one of its colors. Wild rent charges one player for any color. You need at least one property of that color. Double the Rent goes with a rent card and counts as a play.'],
    ['Just Say No', 'Cancels any action played against you. It can be answered by another Just Say No. It doesn’t use a play.'],
    ['Stealing', 'Sly Deal takes one property and Forced Deal swaps one. Neither can touch a complete set. Deal Breaker takes a whole complete set, including any house and hotel.'],
    ['Buildings', 'A house goes on a complete set before a hotel. Not on railroads or utilities. If a set with buildings breaks up, the buildings drop into its owner’s bank.'],
    ['Wild cards', 'Re-color your wild properties for free during your turn. The ten-color wild has no cash value.'],
  ];
  return sheet(`<div class="eyebrow">How to play</div><h2>Rules of the table</h2><ul class="rules">${R.map(([k, v]) => `<li><b>${k}</b><span>${v}</span></li>`).join('')}</ul>
    <div class="acts"><button class="btn gold" data-do="closemodal">Got it</button></div>`);
}
function vCurtain(s){
  if (mode !== 'local' || s.phase !== 'play' || ui.revealed === me) return '';
  const p = P(s, me), pd = s.pending;
  const why = pd ? (pd.actor === me ? 'to answer a Just Say No' : `to answer ${esc(P(s, pd.actor).name)}’s ${KIND[pd.kind]}`) : 'for their turn';
  return `<div class="curtain"><div><div class="eyebrow">Pass the device</div><h2>${avatar(s, p)} ${esc(p.name)}</h2><p class="muted">${why}</p><br><button class="btn gold" data-do="reveal">I’m ${esc(p.name)}. Show my cards</button></div></div>`;
}

/* ---------- render with card motion ---------- */
function rectOf(sel){ const el = app.querySelector(sel); return el && el.getBoundingClientRect(); }
const rotOf = id => (id * 37 % 17) - 8;
const ctr = (r, w) => ({x:r.left + r.width / 2, y:r.top + r.height / 2, w:w ?? r.width});
let prevS = null, dealAnim = false;
// One card arcing across the table: from/to are {x, y, w} centers; flip turns a face-down card face up mid-air.
function fly({from, to, html, flip = false, delay = 0, spin = 0, fade = false, dur = 620, onDone}){
  const el = document.createElement('div'); el.className = 'flight';
  el.innerHTML = `<div class="flip">${html}${flip ? '<div class="card back fb"></div>' : ''}</div>`;
  document.body.append(el);
  const face = el.querySelector('.card'), w = face.offsetWidth, h = face.offsetHeight;
  el.querySelector('.fb')?.style.setProperty('--cw', w + 'px');
  const at = (p, s, r) => `translate(${p.x - w / 2}px,${p.y - h / 2}px) rotate(${r}deg) scale(${s})`;
  const mid = {x:(from.x + to.x) / 2, y:Math.min(from.y, to.y) - 70};
  const a = el.animate([
    {transform:at(from, from.w / w, spin), opacity:1},
    {transform:at(mid, Math.max(from.w, to.w) / w * 1.12, spin / 2), offset:.5},
    {transform:at(to, to.w / w, to.rot || 0), opacity:fade ? 0 : 1},
  ], {duration:dur, delay, easing:'cubic-bezier(.25,.8,.25,1)', fill:'both'});
  if (flip) el.firstElementChild.animate([{transform:'rotateY(180deg)'}, {transform:'rotateY(180deg)', offset:.3}, {transform:'rotateY(0deg)'}], {duration:dur, delay, easing:'ease-in-out', fill:'both'});
  setTimeout(() => sfx('flick'), delay);
  let ended = false;
  const end = () => { if (ended) return; ended = true; el.remove(); onDone?.(); };
  a.onfinish = end; setTimeout(end, delay + dur + 400);
}
// One card arcing in to where it now sits, from a point {x, y, w}; face down until mid-air when `down`.
// Used by every card game for cards that just appeared: drawn, dealt, or played by someone else.
function flyEl(el, from, {down = false, delay = 0, dur = 560} = {}){
  const r = el.getBoundingClientRect(), w = r.width, h = r.height, to = {x:r.left + w / 2, y:r.top + h / 2};
  const f = document.createElement('div'); f.className = 'gfly'; f.style.cssText = `width:${w}px;height:${h}px`;
  const inner = document.createElement('div'); inner.className = 'gfly-in';
  const front = el.cloneNode(true);
  for (const k of ['--pw', '--cw']) front.style.setProperty(k, w + 'px');
  front.style.visibility = '';
  inner.innerHTML = `<div class="gfly-f"></div>${down ? `<div class="gfly-b">${ENG[GID].backHTML?.() || '<div class="pc down"></div>'}</div>` : ''}`;
  inner.firstElementChild.append(front);
  inner.querySelector('.gfly-b > *')?.style.setProperty('--pw', w + 'px');
  f.append(inner); document.body.append(f);
  el.style.visibility = 'hidden';
  const at = (p, k, rot) => `translate(${p.x - w / 2}px,${p.y - h / 2}px) rotate(${rot}deg) scale(${k})`;
  const mid = {x:(from.x + to.x) / 2, y:(from.y + to.y) / 2 - Math.min(90, Math.hypot(to.x - from.x, to.y - from.y) * .2)};
  const a = f.animate([{transform:at(from, (from.w || w) / w, -12)}, {transform:at(mid, 1.1, -4), offset:.55}, {transform:at(to, 1, 0)}],
    {duration:dur, delay, easing:'cubic-bezier(.22,.8,.25,1)', fill:'both'});
  if (down) inner.animate([{transform:'rotateY(180deg)'}, {transform:'rotateY(180deg)', offset:.3}, {transform:'rotateY(0)'}], {duration:dur, delay, easing:'ease-in-out', fill:'both'});
  setTimeout(() => sfx('flick'), delay);
  let ended = false;
  const end = () => { if (ended) return; ended = true; f.remove(); el.style.visibility = ''; el.classList.add('land'); setTimeout(() => el.classList.remove('land'), 320); };
  a.onfinish = end; setTimeout(end, delay + dur + 500);
}
// Chips sliding across the table: a few discs arc from one element to another.
const CHIP = ['#c8102e', '#15803d', '#18181c', '#d4a72c', '#7c3aed', '#1f6bd0'];
function chipFly(from, to, {n = 4, delay = 0} = {}){
  if (!from || !to || reduce) return;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const p0 = {x:a.left + a.width / 2, y:a.top + a.height / 2}, p1 = {x:b.left + b.width / 2, y:b.top + b.height / 2};
  for (let i = 0; i < n; i++){
    const c = document.createElement('i'), j = (Math.random() - .5) * 22;
    c.className = 'chipfly'; c.style.setProperty('--c', CHIP[Math.random() * CHIP.length | 0]); document.body.append(c);
    const mid = {x:(p0.x + p1.x) / 2 + j, y:Math.min(p0.y, p1.y) - 36 - Math.random() * 24};
    c.animate([{transform:`translate(${p0.x}px,${p0.y}px) scale(.6)`, opacity:0}, {opacity:1, offset:.12}, {transform:`translate(${mid.x}px,${mid.y}px) scale(1.1)`, offset:.5},
      {transform:`translate(${p1.x + j / 2}px,${p1.y - i * 3}px) scale(1)`, opacity:1}], {duration:560, delay:delay + i * 70, easing:'cubic-bezier(.3,.7,.3,1)', fill:'both'});
    setTimeout(() => c.remove(), delay + i * 70 + 700);
  }
  setTimeout(() => sfx('coin'), delay + 380);
}
// Poker and Teen Patti: what each player puts in slides from their seat to the pot (blinds and boot included,
// as a hand starts), and the winnings slide from the pot to the winners.
let chipSeen = null;
function chipMotion(s, potSel){
  if (app.querySelector('.curtain')) return;   // behind the pass screen: show it once the next player looks
  const prev = chipSeen;
  chipSeen = {gid:s.gid, phase:s.phase, total:Object.fromEntries(s.players.map(p => [p.id, p.total || 0]))};
  if (s.phase === 'lobby') return;
  const base = prev?.gid === s.gid ? prev.total : {}, pot = app.querySelector(potSel);   // a new hand (or a first look): blinds and boot slide in
  const seat = id => app.querySelector(`[data-pid="${CSS.escape(id)}"] [class$="-plate"]`) || app.querySelector(`[data-pid="${CSS.escape(id)}"]`);
  let k = 0;
  for (const p of s.players){ const d = (p.total || 0) - (base[p.id] || 0); if (d > 0) chipFly(seat(p.id), pot, {n:Math.min(7, 2 + Math.round(Math.log2(1 + d / 10))), delay:k++ * 120}); }
  if (prev && s.phase === 'over' && (prev.phase !== 'over' || prev.gid !== s.gid)) for (const p of s.players) if (p.won > 0) chipFly(pot, seat(p.id), {n:9, delay:450 + k++ * 160});
}
// Compare with the last rendered state: new hand cards fly from the deck, new discards fly from whoever held them.
function flights(s, before){
  const done = new Set();
  if (reduce || s.phase === 'lobby' || app.querySelector('.curtain')) return done;
  let p0 = prevS;
  const dealing = dealAnim;
  if (dealing){ p0 = clone(s); p0.players.forEach(p => { p.hand = []; }); dealAnim = false; }
  if (!p0 || (s.ln || 0) < (p0.ln || 0) || p0.players.map(p => p.id).join() !== s.players.map(p => p.id).join()) return done;
  const deck = rectOf('#deck .card, #deck .uc, #deck .pkc'); if (!deck) return done;
  const from0 = ctr(deck), stag = dealing ? 85 : 140;
  let i = 0;
  for (const p of s.players){
    const q = P(p0, p.id);
    if (p.id === me){
      for (const el of app.querySelectorAll('.hand [data-cid]')){
        const id = +el.dataset.cid; if (q.hand.includes(id)) continue;
        done.add(String(id)); el.style.visibility = 'hidden';
        const r = el.getBoundingClientRect(), rot = parseFloat(el.parentElement.style.getPropertyValue('--r')) || 0;
        fly({from:from0, to:{...ctr(r, el.offsetWidth), rot}, html:cardEl(id, 'md'), flip:true, delay:(i++) * stag, onDone:() => { el.style.visibility = ''; }});
      }
    } else {
      const k = p.hand.length - q.hand.length, b = app.querySelector(`.opp[data-pid="${CSS.escape(p.id)}"] .backs`);
      if (k > 0 && b){ const r = b.getBoundingClientRect(); for (let j = 0; j < k; j++) fly({from:from0, to:{x:r.right - 4, y:r.top + r.height / 2, w:14}, html:'<div class="card sm back"></div>', delay:(i++) * stag, fade:true}); }
    }
  }
  if (s.discard.length >= p0.discard.length){
    for (const id of s.discard.filter(id => !p0.discard.includes(id))){
      const el = app.querySelector(`#discard [data-cid="${id}"]`); if (!el) continue;
      const owner = p0.players.find(p => p.hand.includes(id)), was = before.get(String(id));
      let from;
      if (was) from = ctr(was);
      else if (owner){ const b = app.querySelector(`[data-pid="${CSS.escape(owner.id)}"] .backs`); from = b ? ctr(b.getBoundingClientRect(), 16) : from0; }
      else continue;
      done.add(String(id)); el.style.visibility = 'hidden';
      fly({from, to:{...ctr(el.getBoundingClientRect(), el.offsetWidth), rot:rotOf(id)}, html:cardEl(id, 'sm'), flip:!was, delay:(i++) * stag, spin:Math.random() * 70 - 35, onDone:() => { el.style.visibility = ''; }});
    }
  }
  return done;
}
// Replacing the page can blur an input mid-edit, which fires its change handler, which renders again:
// that nested render waits until this one is done instead of tearing the page down twice.
let rendering = false;
function render(){
  if (rendering) return void queueMicrotask(render);
  if (screen === 'game' && ENG[GID]?.busy?.()) return;   // mid-stroke in Scribble: it renders when the pen lifts
  rendering = true;
  try { renderNow(); } finally { rendering = false; }
}
function renderNow(){
  const before = new Map();
  if (!reduce && !app.querySelector('.curtain')) app.querySelectorAll('[data-cid]').forEach(el => before.set(el.dataset.cid, el.getBoundingClientRect()));   // cards under a pass screen don't count as seen
  if (mode === 'local' && G && G.phase !== 'lobby'){ const nd = ENG[GID].needs?.(G); if (nd?.length) me = nd[0]; }
  const s = G && viewState();
  const focusId = document.activeElement?.id, selStart = document.activeElement?.selectionStart;
  document.body.dataset.game = screen === 'hub' ? '' : GID;   // lets each game theme the page behind it
  app.innerHTML = screen === 'hub' ? vHub() : screen === 'home' || !s ? ENG[GID].home() : s.phase === 'lobby' ? vLobby(s) : ENG[GID].view(s);
  if (ui.modal === 'rules' && screen !== 'game') app.insertAdjacentHTML('beforeend', (ENG[GID].rules || vRules)());
  if (ui.modal === 'request' && screen === 'hub') app.insertAdjacentHTML('beforeend', vRequest());
  if (ui.modal === 'bug') app.insertAdjacentHTML('beforeend', vBug());
  if (screen === 'game' && ui.modal !== 'bug') app.querySelector('.tool[data-do="leave"]')?.insertAdjacentHTML('beforebegin', '<button class="tool bug" data-do="bugopen" aria-label="Report a bug">🐞<span> Bug</span></button>');
  if (screen === 'game' && s && lateCan(s)){
    app.insertAdjacentHTML('beforeend', ui.modal === 'late' && mode !== 'guest' ? lateSheet(s) : lateBar(s));
  }
  if (screen === 'game' && playing(G) && mode !== 'local'){
    if (mode === 'host') app.querySelector('.tool[data-do="leave"]')?.insertAdjacentHTML('beforebegin', '<button class="tool kick" data-do="players" aria-label="Vote to kick a player">Kick</button>');
    if (ui.modal === 'players' && mode === 'host') app.insertAdjacentHTML('beforeend', playersSheet(G));
    else if (G.vote) app.insertAdjacentHTML('beforeend', voteCard(G));
    else if (G.gone?.[me]) app.insertAdjacentHTML('beforeend', '<div class="late-bar"><span>You were voted out of this game.</span><button class="btn small" data-do="leave">Leave</button></div>');
  }
  drawChat();
  if (focusId){ const f = document.getElementById(focusId); if (f){ f.focus({preventScroll:true}); try { f.setSelectionRange(selStart, selStart); } catch {} } }
  if (s && screen === 'game') events(s);
  const flown = !(s && screen === 'game' && s.players && s.phase !== 'lobby') ? new Set() : GID === 'dealmaker' ? flights(s, before) : ENG[GID].motion?.(s, before) || new Set();
  const was = prevS;
  if (!(s && screen === 'game' && s.phase !== 'lobby')) prevS = null;
  else if (!app.querySelector('.curtain')) prevS = clone(s);   // behind the pass screen, keep the old state so the next player sees their draws
  if (reduce || !s || app.querySelector('.curtain')) return;
  // A new round (or the first look at one) is dealt in from the deck; otherwise a card that wasn't on screen
  // comes from the player who held it, or from the deck.
  const cards = s.players || ENG[GID].dealFrom;   // games with players, or one that names where its cards come from (Solitaire)
  const deal = cards && s.phase !== 'lobby' && (dealAnim || !was || was.gid !== s.gid);
  if (deal && GID !== 'dealmaker') dealAnim = false;
  const deckR = rectOf(ENG[GID].dealFrom || '#deck .card, #deck .uc, #deck .pkc, #deck .pc');
  let k = 0;
  app.querySelectorAll('[data-cid]').forEach(el => {
    const b = el.getBoundingClientRect(), id = el.dataset.cid;
    if (flown.has(id) || !b.width) return;
    let a = deal ? null : before.get(id);
    if (!a){
      if (!cards || (!deal && !was) || k > (deal ? 60 : 24)) return;
      const owner = deal ? null : was.players?.find(p => Array.isArray(p.hand) && p.hand.some(h => String(h) === id));
      if (owner?.id === me) return;   // already yours: it doesn't come from anywhere
      const seat = owner && owner.id !== me ? rectOf(`[data-pid="${CSS.escape(owner.id)}"]`) : null, src = seat || deckR;
      if (src) flyEl(el, ctr(src, Math.min(src.width, b.width)), {down:true, delay:k++ * (deal ? (GID === 'solitaire' ? 40 : 70) : 110)});
      return;
    }
    const dx = a.left - b.left, dy = a.top - b.top, sc = a.width / b.width;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sc - 1) < .02) return;
    el.animate([{transform:`translate(${dx}px,${dy}px) scale(${sc})`, transformOrigin:'0 0'}, {transform:'none', transformOrigin:'0 0'}], {duration:560, easing:'cubic-bezier(.2,.9,.25,1)'});
  });
}
function events(s){
  if (!s.log) return;
  const last = s.log.at(-1)?.n || 0;
  if (seenLog < 0 || last < seenLog){ seenLog = last; return; }
  const fresh = s.log.filter(e => e.n > seenLog); seenLog = last;
  ENG[GID].onEvents?.(fresh, s);
  const big = fresh.filter(e => e.kind === 'big' || e.kind === 'win').at(-1);
  if (big && !(mode === 'local' && ui.revealed !== me && big.kind !== 'win')) showBanner(big);
  const has = k => fresh.some(e => e.kind === k);
  sfx(has('win') ? 'win' : has('big') ? 'big' : has('pay') || has('steal') ? 'coin' : has('turn') ? 'turn' : fresh.length ? 'card' : null);
  if (has('win')) confetti();
  if (mode !== 'local') for (const e of fresh) if (e.to?.includes(me)){ toast(e.you, 'you'); navigator.vibrate?.([90, 60, 90]); }
  const er = G?.errs?.[me];
  if (mode === 'guest' && er && er.n === lastN && shownErr !== er.n){ shownErr = er.n; toast(er.msg); }
}

/* ---------- moves ---------- */
// Every move goes through here: checked on a copy first, then applied (host/local) or sent to the host (guest).
function send(a, keepUI = false){
  const s = viewState(), eng = ENG[GID];
  if (G?.gone?.[me]) return toast('You were voted out of this game');
  if (mode === 'guest' && opt && (G.ack?.[me] || 0) < opt.n) return toast(hostAway() ? `Waiting for ${P(G, G.host)?.name || 'the host'}’s phone. Your move goes through when they open the game` : 'Still sending your last move…');
  const trial = clone(s), err = eng.apply(trial, me, a);
  if (err){ sfx('err'); return toast(err); }
  if (!keepUI) ui = {...freshUI(), log:ui.log, revealed:ui.revealed, hostOnline:ui.hostOnline};
  if (mode === 'guest'){
    const n = Math.max(lastN, G.ack?.[me] || 0) + 1; lastN = n; opt = {n, s:trial, a, at:Date.now()};
    net.room?.presence({act:{n, a}}).catch(() => toast('Connection hiccup. Try that again'));
    return render();
  }
  eng.apply(G, me, a); G.v++;
  if (G.clock?.[me]){ G.clock = {...G.clock}; delete G.clock[me]; }
  if (mode === 'host') persist(); else store.set(LKEY(), G);
  render();
}
const LKEY = () => GID === 'dealmaker' ? 'dm-local' : GID + '-local';
// A fresh round with the same seats (and the table's code, settings and running totals when online).
function rematch(){
  const late = (G.late || []).filter(l => !P(G, l.id));
  const seats = [...G.players.filter(p => !G.gone?.[p.id]), ...late].map(({id, name}) => ({id, name})).slice(0, ENG[GID].max);
  if (seats.length < ENG[GID].min) return toast(`Not enough players left for another round (${ENG[GID].min} needed)`);
  const totals = {...(G.totals || {})}; late.forEach(l => { totals[l.id] = l.score; });
  const keep = {game:GID, cfg:G.cfg, totals, round:G.round, pay:G.pay, wait:G.wait, nolate:G.nolate, timer:G.timer};
  if (mode === 'host') Object.assign(keep, {code:G.code, host:G.host, ack:G.ack});
  if (mode === 'local' && G.host) keep.host = G.host;
  Object.assign(keep, ENG[GID].carry?.(G));   // anything a game passes from one round to the next (Tic Tac Toe's queue)
  G = {...ENG[GID].newGame(seats, keep), v:(G.v || 0) + 1};
  ui = freshUI(); seenLog = -1; dealAnim = true;
  if (mode === 'host') persist(); else store.set(LKEY(), G);
  render();
}
let writing = false, dirty = false;
async function persist(){
  if (writing){ dirty = true; return; }
  writing = true;
  try {
    do { dirty = false; G.now = Date.now(); await net.doc.set({state:G}); net.room?.presence({v:G.v}).catch(() => {}); } while (dirty);
  } catch { toast('Couldn’t save the table. Check your connection'); }
  writing = false;
}
function hostTick(){
  if (mode !== 'host' || !net.room || !G) return;
  let changed = false;
  for (const peer of net.room.peers()){
    const pr = peer.presence || {};
    if (typeof pr.pid !== 'string' || pr.pid === me || pr.pid.length > 40) continue;
    const name = String(pr.name || 'Player').slice(0, 18);
    if (G.phase === 'lobby'){
      const seat = P(G, pr.pid);
      if (!seat && pr.join === G.code && G.players.length < ENG[GID].max && !(G.kicked || []).includes(pr.pid)){ G.players.push({id:pr.pid, name}); changed = true; }
      else if (seat && seat.name !== name){ seat.name = name; changed = true; }
      if (seat && pr.said && G.pay?.on && !G.pay.said?.[pr.pid]){ G.pay = {...G.pay, said:{...(G.pay.said || {}), [pr.pid]:true}}; changed = true; }
    }
    if (pr.ask && lateCan(G) && !P(G, pr.pid) && !G.wait?.[pr.pid] && !(G.late || []).some(l => l.id === pr.pid) && !(G.nolate || []).includes(pr.pid)){
      G.wait = {...(G.wait || {}), [pr.pid]:{name}}; changed = true;
      log(G, `${name} asks to join`);
    }
    const kv = pr.kv, v = G.vote;
    if (kv && v && kv.id === v.id && voters(G).includes(pr.pid) && !v.yes[pr.pid] && !v.no[pr.pid]){
      G.vote = {...v, [kv.yes ? 'yes' : 'no']:{...v[kv.yes ? 'yes' : 'no'], [pr.pid]:true}}; tally(); changed = true;
    }
    const a = pr.act;
    if (a && typeof a.n === 'number' && a.n > (G.ack[pr.pid] || 0)){
      G.ack[pr.pid] = a.n;
      const err = G.gone?.[pr.pid] ? 'You were voted out of this game' : G.phase !== 'lobby' ? ENG[GID].apply(G, pr.pid, a.a) : 'The game hasn’t started';
      if (err){ G.errs = {...(G.errs || {}), [pr.pid]:{n:a.n, msg:err}}; }
      else if (G.clock?.[pr.pid]){ G.clock = {...G.clock}; delete G.clock[pr.pid]; }
      changed = true;
    }
  }
  if (changed){ G.v++; persist(); }
  render();
}
// The host's phone says it's alive every 10 seconds; a phone that's locked or in another app goes quiet.
let hostBeat = {n:null, at:Date.now()}, lastBeat = 0;
const hostAway = () => mode === 'guest' && !!net.room && (!net.room.peers().some(p => p.presence?.host === true) || Date.now() - hostBeat.at > 30000);
let refetching = false;
function guestTick(){
  if (!net.room || mode !== 'guest') return;
  const h = net.room.peers().find(p => p.presence?.host === true);
  if (h?.presence.beat !== hostBeat.n){ hostBeat = {n:h?.presence.beat, at:Date.now()}; }
  ui.hostOnline = !hostAway();
  catchUp();
  render();
}
// The host says the table is newer than ours (a missed update): fetch it. Checked on every presence change and every
// half second, at most once every two seconds, so a screen never stays stuck on an old turn.
let caughtAt = 0;
function catchUp(){
  if (!net.room || mode !== 'guest' || refetching || Date.now() - caughtAt < 2000) return;
  const h = net.room.peers().find(p => p.presence?.host === true);
  if (!h || !(h.presence.v > (G?.v || 0))) return;
  refetching = true; caughtAt = Date.now();
  net.doc.get().then(sn => { if (sn.exists) take(sn.data().state); }).catch(() => {}).finally(() => { refetching = false; });
}
function take(st){
  if (mode !== 'guest' || !st || st.v <= (G?.v || 0)) return;
  if (G?.phase === 'lobby' && st.phase === 'play') dealAnim = true;
  G = clone(st);
  if (G.now) skew = G.now - Date.now();
  if (opt && (G.ack?.[me] || 0) >= opt.n) opt = null;
  render();
}
async function joinRoom(code){
  net.room = await net.lobby.join('t-' + code.toLowerCase());
  await net.room.presence({pid:me, name:form.name.trim().slice(0, 18) || 'Player', join:code, host:mode === 'host' || null, v:G.v});
  let sig = '';
  const tick = () => {
    const now = JSON.stringify(net.room.peers().map(p => [p.peer, {...p.presence, ink:0}]));
    if (now !== sig){ sig = now; if (mode === 'host') hostTick(); else guestTick(); chatPull(); }
    ENG[GID]?.onPeers?.();
  };
  net.room.onPeers(tick, () => toast('Lost the live connection to the table'));
  setTimeout(tick, 1500);
}
async function hostTable(){
  const name = form.name.trim(); if (!name) return toast('Enter your name first');
  const code = rid(5, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789');
  mode = 'host'; opt = null;
  G = {game:GID, phase:'lobby', code, host:me, v:1, players:[{id:me, name}], ack:{}, log:[], cfg:ENG[GID].cfg ? {...ENG[GID].cfg} : undefined, timer:ENG[GID].timeout ? store.get('turn-timer', 0) : 0};
  net.doc = net.db.doc('tables/' + code);
  try { await net.doc.set({state:G}); }
  catch { mode = null; G = null; return toast('Couldn’t create the table. Check your connection and try again.'); }
  store.set('dm-last', code);
  try { await joinRoom(code); } catch { toast('Couldn’t open the live room. Friends may not see you yet'); }
  screen = 'game'; render();
}
async function joinTable(code){
  const name = form.name.trim(); if (!name) return toast('Enter your name first');
  code = (code || '').trim().toUpperCase(); if (code.length !== 5) return toast('Table codes are 5 letters');
  const doc = net.db.doc('tables/' + code);
  let snap; try { snap = await doc.get(); } catch { return toast('Couldn’t reach the table. Try again'); }
  if (!snap.exists) return toast(`No table found with code ${code}`);
  const game = snap.data().state?.game || 'dealmaker';
  if (!ENG[game]) return toast('That table is for a game this page doesn’t have yet');
  GID = game;
  G = clone(snap.data().state); net.doc = doc; opt = null; seenLog = -1;
  mode = G.host === me ? 'host' : 'guest';
  lastN = G.ack?.[me] || 0;
  store.set('dm-last', code);
  if (mode === 'guest') net.unsub = doc.onSnapshot(sn => sn.exists && take(sn.data().state), () => {});
  try { await joinRoom(code); } catch { toast('Couldn’t open the live room'); }
  screen = 'game'; render();
}
function leave(){
  net.unsub?.(); net.unsub = null; net.room?.leave().catch(() => {}); net.room = null;
  mode = null; G = null; opt = null; screen = 'home'; seenLog = -1; me = myPid(); skew = 0;
  ui = freshUI(); render();
}

/* ---------- input ---------- */
const H = {
  sel:d => { ui.sel = ui.sel === +d.id ? null : +d.id; ui.moveCard = null; ui.mode = null; ui.dbl = 0; render(); },
  bank:d => send({t:'bank', card:+d.id}),
  prop:d => send({t:'prop', card:+d.id, color:d.color}),
  passgo:d => send({t:'passgo', card:+d.id}),
  birthday:d => send({t:'birthday', card:+d.id}),
  build:d => send({t:'build', card:+d.id, gcard:+d.gcard}),
  dbl:() => { ui.dbl = (ui.dbl + 1) % 3; render(); },
  rent:d => {
    const s = viewState(), meP = P(s, me), c = C(+d.id);
    const doubles = meP.hand.filter(x => C(x).act === 'double').slice(0, ui.dbl);
    const a = {t:'rent', card:+d.id, color:d.color, doubles};
    if (c.wild){ ui.mode = 'pickplayer'; ui.pend = {...a, amt:rentFor(meP, d.color) * 2 ** doubles.length}; render(); }
    else send(a);
  },
  debt:d => { ui.mode = 'pickplayer'; ui.pend = {t:'debt', card:+d.id, amt:5}; render(); },
  sly:d => { ui.mode = 'sly'; ui.pend = {t:'sly', card:+d.id}; render(); },
  forced:d => { ui.mode = 'forced-theirs'; ui.pend = {t:'forced', card:+d.id}; render(); },
  breaker:d => { ui.mode = 'breaker'; ui.pend = {t:'breaker', card:+d.id}; render(); },
  player:d => ui.mode === 'pickplayer' && send({...ui.pend, target:d.id}),
  tprop:d => {
    if (ui.mode === 'sly') return send({...ui.pend, target:d.owner, tcard:+d.id});
    if (ui.mode === 'forced-theirs'){ ui.pend = {...ui.pend, target:d.owner, tcard:+d.id}; ui.mode = 'forced-mine'; render(); }
  },
  tset:d => ui.mode === 'breaker' && send({...ui.pend, target:d.owner, gcard:+d.gcard}),
  mprop:d => ui.mode === 'forced-mine' && send({...ui.pend, mycard:+d.id}),
  wild:d => { ui.moveCard = +d.id; ui.sel = null; render(); },
  move:d => send({t:'move', card:+d.id, color:d.color}),
  cancel:() => { ui.mode = null; ui.pend = null; ui.moveCard = null; render(); },
  end:() => send({t:'end'}),
  ptog:d => { const id = +d.id; ui.pay = ui.pay.includes(id) ? ui.pay.filter(x => x !== id) : [...ui.pay, id]; render(); },
  autopay:() => { const s = viewState(), meP = P(s, me); ui.pay = autoPick(meP, payable(meP), s.pending.amount); render(); },
  pay:() => send({t:'pay', cards:ui.pay}),
  no:d => send({t:'no', target:d.target}),
  accept:d => send({t:'accept', target:d.target}),
  dtog:d => { const id = +d.id; ui.disc = ui.disc.includes(id) ? ui.disc.filter(x => x !== id) : [...ui.disc, id]; render(); },
  discard:() => send({t:'discard', cards:ui.disc}),
  reveal:() => { ui.revealed = me; seenLog = -1; render(); },
  log:() => { ui.log = !ui.log; render(); },
  rules:() => { ui.modal = 'rules'; render(); },
  closemodal:() => { ui.modal = null; render(); },
  mute:() => { muted = !muted; store.set('dm-muted', muted); render(); },
  leave:() => leave(),
  again:() => { if (mode === 'local' || mode === 'host') rematch(); },
  host:() => hostTable(),
  join:() => joinTable(form.code),
  rejoin:() => joinTable(store.get('dm-last')),
  start:() => {
    if (mode !== 'host' || seated(G).length < ENG[GID].min) return;
    if (G.pay?.on) G.players = seated(G);   // unpaid players stay at the table as spectators
    rematch();
  },
  payon:() => { if (mode !== 'host' || G.phase !== 'lobby') return; G.pay = {fee:0, to:'', paid:{}, said:{}, ...(G.pay || {}), on:!G.pay?.on}; G.v++; persist(); render(); },
  paid:d => {
    if (mode !== 'host' || G.phase !== 'lobby') return;
    const paid = {...(G.pay?.paid || {})};
    if (paid[d.id]) delete paid[d.id]; else paid[d.id] = true;
    G.pay = {...G.pay, paid}; G.v++; persist(); render();
  },
  lateask:() => { ui.asked = true; net.room?.presence({ask:true}).catch(() => toast('Connection hiccup. Try that again')); render(); },
  lateopen:() => { ui.modal = 'late'; render(); },
  lateadmit:d => lateAdmit(d.id, G.wait?.[d.id]?.name || 'Player', document.getElementById('late-' + d.id)),
  lateadd:() => {
    const name = document.getElementById('late-name')?.value.trim().slice(0, 18);
    if (!name) return toast('Type the new player’s name');
    let k = G.players.length + (G.late || []).length; while (P(G, 'p' + k) || (G.late || []).some(l => l.id === 'p' + k)) k++;
    lateAdmit('p' + k, name, document.getElementById('late-new'));
  },
  latedeny:d => { const wait = {...(G.wait || {})}; delete wait[d.id]; G.wait = wait; G.nolate = [...(G.nolate || []), d.id]; lateSave(); },
  lateremove:d => { G.late = (G.late || []).filter(l => l.id !== d.id); lateSave(); },
  players:() => { ui.modal = 'players'; render(); },
  votecall:d => {
    if (mode !== 'host' || G.vote || !playing(G)) return;
    const name = P(G, d.id)?.name || 'Player';
    G.vote = {id:rid(6), target:d.id, name, yes:{[me]:true}, no:{}, until:Date.now() + 60000};
    log(G, `${P(G, me).name} called a vote to remove ${name}`, 'big', {title:'Table vote', sub:`Remove ${name}?`});
    ui.modal = null; tally(); G.v++; persist(); render();
  },
  vote:d => {
    const v = G.vote; if (!v) return;
    if (mode === 'host'){ G.vote = {...v, [d.yes ? 'yes' : 'no']:{...v[d.yes ? 'yes' : 'no'], [me]:true}}; tally(); G.v++; persist(); return render(); }
    myVote = v.id; net.room?.presence({kv:{id:v.id, yes:!!d.yes}}).catch(() => toast('Connection hiccup. Try that again')); render();
  },
  votestop:() => { if (mode !== 'host' || !G.vote) return; log(G, `Vote on ${G.vote.name} cancelled`); G.vote = null; G.v++; persist(); render(); },
  paysaid:() => { ui.said = true; net.room?.presence({said:true}).catch(() => toast('Connection hiccup. Try that again')); render(); },
  open:d => { if (ENG[d.game]){ GID = d.game; screen = 'home'; ui = freshUI(); dealAnim = false; render(); scrollTo(0, 0); } },
  hub:() => { screen = 'hub'; render(); scrollTo(0, 0); },
  reqopen:() => { ui.modal = 'request'; render(); document.getElementById('rq-game')?.focus(); },
  bugopen:() => { ui.modal = 'bug'; render(); },
  bugsend:(d, el) => sendBug(el),
  reqsend:(d, el) => sendRequest(el),
  kick:d => { if (mode !== 'host' || G.phase !== 'lobby') return; G.players = G.players.filter(p => p.id !== d.id); G.kicked = [...(G.kicked || []), d.id]; G.v++; persist(); render(); },
  copy:() => navigator.clipboard?.writeText(G.code).then(() => toast('Code copied'), () => toast(`Code: ${G.code}`)) ?? toast(`Code: ${G.code}`),
  ladd:() => { if (form.locals.length < 5) form.locals.push(''); render(); },
  lrem:d => { form.locals.splice(+d.i, 1); render(); },
  local:() => {
    const names = form.locals.map(n => n.trim()).filter(Boolean);
    if (names.length < 2) return toast('Add at least two player names');
    mode = 'local'; ui = freshUI(); seenLog = -1; dealAnim = true;
    G = {...newGame(names.map((name, i) => ({id:'p' + i, name}))), v:1};
    store.set('dm-local', G); screen = 'game'; render();
  },
  resume:() => { G = store.get('dm-local'); if (!G) return; mode = 'local'; ui = freshUI(); seenLog = -1; screen = 'game'; render(); },
};
app.addEventListener('click', e => {
  const el = e.target.closest('[data-do]'); if (!el || el.disabled) return;
  e.stopPropagation(); H[el.dataset.do]?.(el.dataset, el);
});
app.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-do]:not(button)')){ e.preventDefault(); e.target.click(); }
  if (e.key === 'Escape'){ if (ui.modal){ ui.modal = null; render(); } else if (ui.mode || ui.sel != null || ui.moveCard != null){ ui.mode = null; ui.sel = null; ui.moveCard = null; render(); } }
  if (e.key === 'Enter' && e.target.id === 'cd') joinTable(form.code);
});
app.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.f === 'name'){ form.name = t.value; store.set('dm-name', t.value); if (!form.locals[0]) form.locals[0] = ''; }
  if (t.dataset.f === 'code') form.code = t.value;
  if (t.dataset.local != null) form.locals[+t.dataset.local] = t.value;
});
app.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.payqr != null) return uploadQR(t.files?.[0]);
  if (t.dataset.timer != null && mode === 'host' && G?.phase === 'lobby'){ G.timer = +t.value; store.set('turn-timer', G.timer); G.v++; persist(); return render(); }
  const k = t.dataset.pay;
  if (k && mode === 'host' && G?.phase === 'lobby'){
    G.pay = {...G.pay, [k]:k === 'fee' ? Math.max(0, Math.round(+t.value) || 0) : t.value.trim().slice(0, 40)};
    G.v++; persist(); render();
  }
});
// A points cap the host can type (Least Count, UNO, Rummy pool), with common values suggested. Remembered on this device.
const capInput = (id, key, val, presets, min, max) => `<input type="number" class="cap-in" id="${id}" data-cap="${key}" value="${val}" min="${min}" max="${max}" step="1" inputmode="numeric" list="${id}-l"><datalist id="${id}-l">${presets.map(v => `<option value="${v}"></option>`).join('')}</datalist>`;
app.addEventListener('change', e => {
  const k = e.target.dataset.cap; if (!k || !ENG[GID]?.cfg) return;
  const v = Math.round(+e.target.value), min = +e.target.min, max = +e.target.max;
  if (e.target.value === '' || !(v >= min && v <= max)){ toast(`Type a number from ${min} to ${max}`); return render(); }
  ENG[GID].cfg[k] = v; store.set(`cap-${GID}-${k}`, v);
  if (mode === 'host' && G?.phase === 'lobby'){ G.cfg = {...G.cfg, [k]:v}; G.v++; persist(); }
  render();
});
// Game tiles lean toward the pointer, with a glare that follows it.
app.addEventListener('pointermove', e => {
  const t = e.target.closest?.('.tile:not(.soon)'); if (!t || reduce || e.pointerType === 'touch') return;
  const r = t.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  t.style.setProperty('--ry', `${(x - .5) * 10}deg`); t.style.setProperty('--rx', `${(.5 - y) * 8}deg`);
  t.style.setProperty('--mx', `${x * 100}%`); t.style.setProperty('--my', `${y * 100}%`);
});
app.addEventListener('pointerout', e => { const t = e.target.closest?.('.tile'); if (t && !t.contains(e.relatedTarget)) for (const k of ['--rx', '--ry']) t.style.removeProperty(k); });
app.addEventListener('dragstart', e => { const d = e.target.closest('[data-drag]'); if (d) e.dataTransfer.setData('text/plain', d.dataset.drag); });
app.addEventListener('dragover', e => { const z = e.target.closest('[data-drop]'); if (z){ e.preventDefault(); z.classList.add('over'); } });
app.addEventListener('dragleave', e => e.target.closest('[data-drop]')?.classList.remove('over'));
app.addEventListener('drop', e => {
  const z = e.target.closest('[data-drop]'); if (!z || GID !== 'dealmaker') return;
  e.preventDefault(); z.classList.remove('over');
  const id = +e.dataTransfer.getData('text/plain'); if (Number.isNaN(id)) return;
  const c = C(id);
  if (z.dataset.drop === 'bank') return send({t:'bank', card:id});
  if (z.dataset.drop === 'prop' && c.type === 'prop') return send({t:'prop', card:id, color:c.color});
  if (z.dataset.drop === 'center' && c.type === 'action' && ['passgo', 'birthday'].includes(c.act)) return send({t:c.act, card:id});
  if (z.dataset.drop === 'center' && c.type === 'action' && ['debt', 'sly', 'forced', 'breaker'].includes(c.act)){ ui.sel = id; return H[c.act]({id}); }
  ui.sel = id; render();
});
const peek = document.getElementById('peek');
if (matchMedia('(hover: hover)').matches){
  app.addEventListener('mouseover', e => {
    const c = e.target.closest('.card.sm[data-k], .card.mini[data-k]');
    if (!c){ peek.classList.remove('show'); return; }
    const g = c.closest('.grp'), color = g ? CK.find(k => g.title.startsWith(COLORS[k].name)) : null;
    peek.innerHTML = cardEl(+c.dataset.k, 'lg', {color}); peek.classList.add('show');
  });
  app.addEventListener('mouseleave', () => peek.classList.remove('show'));
}
