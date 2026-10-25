/* =====================================================================
   SCRIBBLE — draw and guess, online. Each turn one player (the artist)
   picks one of three words and draws it; everyone else types guesses.
   Guess sooner, score more; the artist scores for every right guess.
   Letters are revealed as the clock runs down. Everyone draws once a round.
   The drawing travels live in the artist's presence (just the newest
   strokes, numbered in order), and the host folds it into the saved table
   every few seconds, so late arrivals and reconnects catch up.
   ===================================================================== */
const SC = (() => {
  const WORDS = ('apple,banana,mango,pineapple,watermelon,grapes,cherry,carrot,potato,onion,pizza,burger,sandwich,ice cream,cake,cookie,donut,popcorn,' +
    'samosa,jalebi,tea,coffee,egg,cheese,bread,noodles,dosa,biryani,ladoo,corn,lemon,coconut,strawberry,' +
    'cat,dog,cow,horse,elephant,tiger,lion,monkey,giraffe,zebra,camel,rabbit,mouse,snake,frog,turtle,fish,shark,whale,dolphin,octopus,crab,' +
    'penguin,owl,parrot,peacock,duck,chicken,butterfly,bee,spider,ant,snail,bat,kangaroo,panda,bear,fox,deer,crocodile,goat,pig,sheep,' +
    'house,castle,tent,bridge,tower,temple,school,hospital,lighthouse,igloo,windmill,pyramid,skyscraper,taj mahal,' +
    'car,bus,bicycle,motorcycle,rickshaw,train,airplane,helicopter,rocket,boat,ship,submarine,truck,tractor,scooter,skateboard,' +
    'sun,moon,star,cloud,rain,rainbow,snowman,lightning,volcano,mountain,island,beach,river,waterfall,tree,flower,cactus,leaf,mushroom,palm tree,' +
    'book,pencil,scissors,glasses,umbrella,clock,watch,phone,laptop,television,camera,guitar,drum,piano,violin,headphones,microphone,lamp,' +
    'candle,key,lock,bell,balloon,kite,gift,crown,ring,necklace,hat,shoe,sock,shirt,dress,tie,glove,backpack,wallet,mirror,chair,table,bed,' +
    'sofa,door,window,ladder,bucket,hammer,saw,toothbrush,comb,broom,fan,fridge,kettle,spoon,fork,knife,plate,bottle,cup,teapot,' +
    'football,cricket bat,basketball,trophy,medal,chess,dice,bowling,swing,slide,' +
    'doctor,pirate,robot,alien,ghost,king,queen,clown,astronaut,ninja,wizard,mermaid,superhero,vampire,' +
    'heart,smile,eye,nose,ear,hand,foot,tooth,brain,skeleton,beard,' +
    'fire,snowflake,diamond,treasure,map,compass,anchor,flag,sword,shield,bow and arrow,dragon,unicorn,dinosaur,' +
    'diya,rangoli,saree,turban,tiffin,auto,kabaddi,mehndi,firecracker,coconut tree').split(',');
  const PAL = ['#ffffff', '#1b1b1f', '#7d7d86', '#c9c9cf', '#e53935', '#fb8c00', '#fdd835', '#7cb342', '#2e7d32', '#00acc1', '#1e88e5', '#283593', '#8e24aa', '#ec407a', '#8d6e63', '#ffcc80'];
  const SIZES = [4, 9, 18, 34], CAP = 10000, PICK = 15000, SHOW = 6000;
  const cfg = {rounds:3, secs:80};
  // The host's clock: guests add the skew measured when the table last arrived (see take() in app.js).
  const clock = () => Date.now() + (typeof skew === 'number' ? skew : 0);
  const norm = t => String(t || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  // One letter added, dropped or changed: “so close”.
  function near(a, b){
    if (a === b || Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, e = 0;
    while (i < a.length && j < b.length){
      if (a[i] === b[j]){ i++; j++; continue; }
      if (++e > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return e + (a.length - i) + (b.length - j) <= 1;
  }
  const trim = s => { if (s.log.length > 80) s.log = s.log.slice(-80); };

  function newGame(seats, extra = {}){
    const totals = {...(extra.totals || {})}, round = (extra.round || 0) + 1;
    const s = {...extra, cfg:{...cfg, ...(extra.cfg || {})}, totals, round, phase:'play', stage:'pick', gid:rid(8), ack:extra.ack || {}, log:[], ln:0,
      players:seats.map(p => ({id:p.id, name:p.name})), lap:1, di:-1, turnNo:0, used:[], champion:null, ink:[], inkv:0, inkq:0, guessed:{}, gain:{}, hint:[]};
    s.players.forEach(p => { s.totals[p.id] ??= 0; });
    log(s, `Game ${round}: ${s.cfg.rounds} round${s.cfg.rounds > 1 ? 's' : ''}, ${s.cfg.secs} seconds to draw`, 'sys');
    nextTurn(s);
    return s;
  }
  const artistOf = s => s.players[s.di];
  const guessers = s => s.players.filter(p => p !== artistOf(s) && !s.gone?.[p.id]);
  function nextTurn(s){
    for (const l of s.late || []) if (!P(s, l.id) && s.players.length < 12){ s.players.push({id:l.id, name:l.name}); s.totals[l.id] = l.score; log(s, `${l.name} joins the game`, 'sys'); }
    s.late = [];
    let di = s.di, k = 0;
    do { di++; if (di >= s.players.length){ di = 0; s.lap++; } } while (s.gone?.[s.players[di].id] && ++k <= s.players.length);
    if (s.lap > s.cfg.rounds || s.players.filter(p => !s.gone?.[p.id]).length < 2) return finish(s);
    const pool = WORDS.filter(w => !s.used.includes(w)), from = pool.length >= 3 ? pool : WORDS;
    Object.assign(s, {di, turnNo:s.turnNo + 1, stage:'pick', until:clock() + PICK, choices:shuffle([...from]).slice(0, 3), word:null,
      ink:[], inkv:0, inkq:0, guessed:{}, gain:{}, hint:[]});
    log(s, `${artistOf(s).name} is choosing a word`, 'turn');
    tell(s, [artistOf(s).id], 'Your turn to draw! Pick a word');
  }
  function startDraw(s, w){
    Object.assign(s, {stage:'draw', word:w, choices:null, start:clock()});
    s.until = s.start + s.cfg.secs * 1000;
    s.used.push(w);
    log(s, `${artistOf(s).name} is drawing`, 'sys');
  }
  function endTurn(s){
    const n = Object.keys(s.guessed).length, m = guessers(s).length;
    s.stage = 'reveal'; s.until = clock() + SHOW;
    log(s, `The word was “${s.word}” (${n ? `${n} of ${m} guessed it` : 'nobody guessed it'})`, 'sys');   // the paper shows the reveal
  }
  function finish(s){
    s.phase = 'over'; s.stage = 'done';
    const best = [...s.players].sort((a, b) => (s.totals[b.id] || 0) - (s.totals[a.id] || 0))[0];
    s.champion = best?.id ?? null;
    if (best) log(s, `${best.name} wins with ${s.totals[best.id] || 0} points`, 'win', {title:`${best.name} wins!`, sub:`${s.totals[best.id] || 0} points`});
  }
  // The drawing as numbered steps: start or extend the newest stroke, undo the last one, or wipe the page.
  // `m` is anything holding {ink, inkv, inkq}: the saved table, or a viewer's live copy.
  function inkApply(m, ops){
    if (!Array.isArray(ops) || ops.length > 80) return 'Bad drawing data';
    let used = m.ink.reduce((a, k) => a + k.p.length / 2, 0);
    for (const o of ops){
      if (!o || !Number.isInteger(o.q)) return 'Bad drawing data';
      if (o.q <= m.inkq) continue;
      if (o.q !== m.inkq + 1) return 'gap';
      if (o.a === 'undo'){ const k = m.ink.pop(); if (k) used -= k.p.length / 2; m.inkv++; }
      else if (o.a === 'clear'){ m.ink = []; used = 0; m.inkv++; }
      else if (o.a === 'pt'){
        const p = o.p;
        if (!Array.isArray(p) || !p.length || p.length % 2 || p.length > 400 || !p.every((v, i) => Number.isInteger(v) && v >= 0 && v <= (i % 2 ? 750 : 1000))) return 'Bad drawing data';
        if (used + p.length / 2 > CAP) return 'The page is full';
        if (o.n === m.ink.length){
          if (!PAL[o.c] || !SIZES.includes(o.w)) return 'Bad drawing data';
          m.ink.push({c:o.c, w:o.w, p:[...p]});
        } else if (o.n === m.ink.length - 1) m.ink[o.n].p.push(...p);
        else return 'Bad drawing data';
        used += p.length / 2;
      } else return 'Bad drawing data';
      m.inkq = o.q;
    }
  }
  function apply(s, pid, a){
    if (!a || typeof a !== 'object') return 'That move was not understood';
    const p = P(s, pid); if (!p) return 'You’re watching this game';
    if (s.phase !== 'play') return 'This game is over';
    const artist = artistOf(s);
    if (a.t === 'pick'){
      if (p !== artist) return 'It’s not your turn to draw';
      if (s.stage !== 'pick') return 'The word is already chosen';
      const w = s.choices?.[a.i]; if (w == null) return 'Pick one of the words';
      startDraw(s, w); trim(s); return;
    }
    if (a.t === 'ink'){
      if (p !== artist) return 'Only the artist can draw';
      if (s.stage !== 'draw') return 'Not drawing right now';
      return inkApply(s, a.ops);
    }
    if (a.t !== 'guess') return 'That move was not understood';
    if (s.stage !== 'draw') return s.stage === 'pick' ? 'Wait for the word to be chosen' : 'This turn is over';
    if (p === artist) return 'You’re drawing! Talk in the table chat';
    if (s.guessed[pid] != null) return 'You already got it';
    const raw = String(a.text || '').replace(/\s+/g, ' ').trim().slice(0, 40), g = norm(raw), w = norm(s.word);
    if (!g) return 'Type a guess';
    if (` ${g} `.includes(` ${w} `)){   // “an apple” counts for “apple”
      const left = Math.max(0, s.until - clock()), total = s.cfg.secs * 1000;
      const pts = 5 * Math.round((50 + 250 * left / total) / 5), dpts = 5 * Math.round(pts * .4 / 5);
      s.guessed[pid] = pts; s.gain[pid] = pts; s.totals[pid] = (s.totals[pid] || 0) + pts;
      s.gain[artist.id] = (s.gain[artist.id] || 0) + dpts; s.totals[artist.id] = (s.totals[artist.id] || 0) + dpts;
      log(s, `${p.name} guessed the word!`, 'right', {pid, pts});
      if (guessers(s).every(q => s.guessed[q.id] != null)) endTurn(s);
      trim(s); return;
    }
    log(s, `${p.name}: ${raw}`, 'g', {pid, g:raw});
    if (w.length >= 4 && near(g, w)) tell(s, [pid], `“${raw}” is close!`);
    trim(s);
  }
  const needs = s => s.phase === 'play' && s.stage !== 'reveal' ? [artistOf(s).id] : [];
  // The host runs this every half second: auto-pick, letter hints, time up, the next turn.
  function tick(s){
    if (s.phase !== 'play') return false;
    const t = clock(), artist = artistOf(s), gone = !!s.gone?.[artist.id];
    if (s.stage === 'pick' && gone){ log(s, `${artist.name}’s turn is skipped`, 'sys'); nextTurn(s); return true; }
    if (s.stage === 'pick' && t >= s.until){ startDraw(s, s.choices[0]); return true; }
    if (s.stage === 'draw'){
      if (t >= s.until || gone || !guessers(s).length){ endTurn(s); return true; }
      const idx = [...s.word].map((ch, i) => ch === ' ' ? -1 : i).filter(i => i >= 0 && !s.hint.includes(i));
      const frac = (t - s.start) / (s.cfg.secs * 1000), letters = s.word.replace(/ /g, '').length;
      const want = letters < 4 ? 0 : Math.min(letters - 2, frac >= .75 ? 2 : frac >= .5 ? 1 : 0);
      if (s.hint.length < want && idx.length){ s.hint.push(idx[Math.random() * idx.length | 0]); return true; }
      return false;
    }
    if (s.stage === 'reveal' && t >= s.until){ nextTurn(s); trim(s); return true; }
    return false;
  }
  const late = {unit:'points', why:'the lowest score at the table', score:s => Math.min(...s.players.map(p => s.totals[p.id] || 0))};

  /* ----- client: the drawing board ----- */
  const turnKey = s => s.gid + ':' + s.turnNo;
  const drawingNow = s => mode !== 'local' && s.phase === 'play' && s.stage === 'draw' && artistOf(s)?.id === me;
  let mine = null;                                   // the artist's own copy of this turn's drawing
  let seen = {key:'', ink:[], inkv:0, inkq:0};       // everyone else's copy, fed by the artist's presence
  let batch = [], nextq = 0, stroke = null, drawing = false, full = false;
  const pen = {c:1, w:1, erase:false};
  let draft = '', board = null, ring = null, ctx = null, painted = {key:'', v:-1, n:0, k:0, W:0};
  const model = () => mine && G && mine.key === turnKey(G) ? mine : seen;
  const used = m => m.ink.reduce((a, k) => a + k.p.length / 2, 0);
  // Bring the local copy up to date with the table: a new turn starts blank, and a newer saved copy replaces a stale one.
  function sync(s){
    const key = turnKey(s);
    if (drawingNow(s)){
      if (mine?.key !== key){ mine = {key, ink:clone(s.ink || []), inkv:0, inkq:s.inkq || 0}; nextq = mine.inkq; batch = []; }
    } else if (seen.key !== key || (s.inkq || 0) > seen.inkq){
      seen = {key, ink:clone(s.ink || []), inkv:seen.inkv + 1, inkq:s.inkq || 0};
    }
  }
  // Paint only what's new since last time; a different turn, an undo or a resize repaints the page.
  function paint(){
    if (!board?.width || !G) return;
    const m = model(), W = board.width, H = board.height, key = (m === mine ? 'm' : 'v') + m.key;
    if (painted.key !== key || painted.v !== m.inkv || painted.W !== W || painted.n > m.ink.length){
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); painted = {key, v:m.inkv, n:0, k:0, W};
    }
    const k = W / 1000;
    ctx.lineCap = ctx.lineJoin = 'round';
    for (let n = painted.n; n < m.ink.length; n++){
      const st = m.ink[n], p = st.p, from = n === painted.n ? painted.k : 0;
      ctx.strokeStyle = ctx.fillStyle = PAL[st.c]; ctx.lineWidth = st.w * k;
      if (p.length === 2){ if (!from){ ctx.beginPath(); ctx.arc(p[0] * k, p[1] * k, st.w * k / 2, 0, Math.PI * 2); ctx.fill(); } continue; }
      const i0 = Math.max(0, from - 2);
      ctx.beginPath(); ctx.moveTo(p[i0] * k, p[i0 + 1] * k);
      for (let i = i0 + 2; i < p.length; i += 2) ctx.lineTo(p[i] * k, p[i + 1] * k);
      ctx.stroke();
    }
    const last = m.ink.at(-1);
    painted.n = Math.max(0, m.ink.length - 1); painted.k = last ? last.p.length : 0;
  }
  const at = e => { const r = board.getBoundingClientRect();
    return [Math.round(Math.min(1000, Math.max(0, (e.clientX - r.left) / r.width * 1000))), Math.round(Math.min(750, Math.max(0, (e.clientY - r.top) / r.height * 750)))]; };
  const brush = () => SIZES[pen.w];
  function makeBoard(){
    board = Object.assign(document.createElement('canvas'), {className:'sc-canvas'});
    ctx = board.getContext('2d');
    ring = Object.assign(document.createElement('div'), {className:'sc-ring'});
    board.addEventListener('pointerdown', e => {
      if (!G || GID !== 'scribble' || !drawingNow(G) || clock() >= G.until || !mine) return;
      e.preventDefault();
      if (used(mine) >= CAP){ if (!full) toast('The page is full. Undo or clear to keep drawing'); full = true; return; }
      board.setPointerCapture(e.pointerId); drawing = true;
      const [x, y] = at(e), c = pen.erase ? 0 : pen.c, w = brush();
      stroke = {c, w, p:[x, y]}; mine.ink.push(stroke);
      batch.push({q:++nextq, a:'pt', n:mine.ink.length - 1, c, w, p:[x, y]});
      paint();
    });
    board.addEventListener('pointermove', e => {
      if (ring && G && drawingNow(G) && e.pointerType === 'mouse'){
        const r = board.getBoundingClientRect(), d = brush() * r.width / 1000;
        ring.style.cssText = `display:block;width:${d}px;height:${d}px;left:${e.clientX - r.left}px;top:${e.clientY - r.top}px;--rc:${pen.erase ? '#999' : PAL[pen.c]}`;
      }
      if (!drawing || !stroke) return;
      for (const ev of e.getCoalescedEvents?.() || [e]){
        const [x, y] = at(ev), p = stroke.p;
        if (Math.hypot(x - p.at(-2), y - p.at(-1)) < 3) continue;
        if (used(mine) >= CAP) break;
        p.push(x, y);
        const last = batch.at(-1);
        if (last?.a === 'pt' && last.n === mine.ink.length - 1 && last.p.length < 380) last.p.push(x, y);
        else batch.push({q:++nextq, a:'pt', n:mine.ink.length - 1, c:stroke.c, w:stroke.w, p:[x, y]});
      }
      paint();
    });
    const up = () => { if (!drawing) return; drawing = false; stroke = null; flush(); render(); };
    board.addEventListener('pointerup', up); board.addEventListener('pointercancel', up);
    board.addEventListener('pointerleave', () => { if (ring) ring.style.display = 'none'; });
  }
  // Send the newest strokes: into the artist's presence for everyone, and straight into the table on the host.
  let saveT = 0;
  const hostSave = () => { if (!saveT) saveT = setTimeout(() => { saveT = 0; if (mode === 'host' && GID === 'scribble' && G){ G.v++; persist(); } }, 4000); };
  function flush(){
    if (!batch.length || !G || GID !== 'scribble') return;
    const ops = batch; batch = [];
    if (mode === 'host' && apply(G, me, {t:'ink', ops}) === undefined) hostSave();
    net.room?.presence({ink:{k:turnKey(G), ops}}).catch(() => {});
  }
  setInterval(flush, 100);
  // Every presence update: pick up the artist's newest strokes (the host also folds them into the table).
  function onPeers(){
    const s = G; if (!s || GID !== 'scribble' || s.phase !== 'play' || !net.room) return;
    const a = artistOf(s); if (!a || a.id === me) return;
    const ink = net.room.peers().find(p => p.presence?.pid === a.id)?.presence?.ink;
    if (!ink || ink.k !== turnKey(s)) return;
    if (mode === 'host' && s.stage === 'draw' && apply(G, a.id, {t:'ink', ops:ink.ops}) === undefined) hostSave();
    if (seen.key !== ink.k) sync(s);
    if (seen.key === ink.k) inkApply(seen, ink.ops);   // a gap (missed update) waits for the next saved copy
    paint();
  }
  // After each render: put the board back in place, size it to the page, and catch it up.
  function motion(s){
    sync(s);
    const slot = app.querySelector('.sc-slot');
    if (slot){
      if (!board) makeBoard();
      if (board.parentElement !== slot) slot.append(board, ring);
      const W = Math.round(slot.clientWidth * Math.min(2, devicePixelRatio || 1));
      if (W && board.width !== W){ board.width = W; board.height = Math.round(W * .75); }
      board.classList.toggle('can', drawingNow(s));
      paint();
    }
    const feed = app.querySelector('.sc-feed'); if (feed) feed.scrollTop = feed.scrollHeight;
  }
  // The clock ring counts down between renders.
  setInterval(() => {
    if (GID !== 'scribble' || screen !== 'game' || !G?.until || G.phase !== 'play') return;
    const el = app.querySelector('.sc-time'); if (!el) return;
    const total = G.stage === 'draw' ? G.cfg.secs * 1000 : G.stage === 'pick' ? PICK : SHOW, left = Math.max(0, G.until - clock()), sec = Math.ceil(left / 1000);
    el.style.setProperty('--t', (left / total).toFixed(3));
    if (el.dataset.s !== String(sec)){ el.dataset.s = sec; el.querySelector('b').textContent = sec; el.classList.toggle('low', G.stage === 'draw' && sec <= 10); }
  }, 200);

  /* ----- client: screens ----- */
  const doodle = `<svg viewBox="0 0 200 150" class="sc-doodle" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="160" cy="34" r="16" stroke="#fdd835" stroke-width="6"/><path d="M160 8v-6M160 66v-6M134 34h-6M192 34h-6M142 16l-4-4M182 56l-4-4M178 16l4-4M138 52l4-4" stroke="#fdd835" stroke-width="4"/>
    <path d="M40 120V78l34-28 34 28v42z" stroke="#e53935" stroke-width="6"/><path d="M62 120V96h22v24" stroke="#1e88e5" stroke-width="5"/>
    <path d="M128 120c0-30 4-46 6-56M134 64c-14-4-22 6-20 14 10 2 18-4 20-14zm0 0c10-10 24-6 24 4-10 6-20 4-24-4z" stroke="#2e7d32" stroke-width="5"/>
    <path d="M10 124c40-6 140-6 184 0" stroke="#8d6e63" stroke-width="5"/></svg>`;
  const art = () => `<div class="sc-art"><div class="sc-artpaper">${doodle}<div class="sc-artword">${'<span></span>'.repeat(5)}</div></div><div class="sc-artpencil"></div></div>`;
  const rules = () => sheet(`<div class="eyebrow">How to play</div><h2>Scribble rules</h2><ul class="rules">
      <li><b>Turns</b><span>Each turn one player is the artist. They pick one of three words and draw it. No letters or numbers in the drawing!</span></li>
      <li><b>Guessing</b><span>Everyone else types guesses. Wrong guesses show up in the feed; type something one letter off and you’ll hear it’s close.</span></li>
      <li><b>Scoring</b><span>The sooner you guess, the more you score (up to 300). The artist scores for every player who gets it.</span></li>
      <li><b>Hints</b><span>As the clock runs down, letters of the word are revealed.</span></li>
      <li><b>Rounds</b><span>Everyone draws once a round. The host picks how many rounds and how long each drawing lasts. Most points at the end wins.</span></li>
    </ul><div class="acts"><button class="btn gold" data-do="closemodal">Got it</button></div>`);
  function home(){
    return `<div class="home">
      <button class="btn small backlink" data-do="hub">← All games</button>
      <section class="hero">
        <div>
          <div class="eyebrow">Draw it, guess it</div>
          <h1>Scrib<em>ble</em></h1>
          <p>One player draws a secret word live on everyone’s screen, the rest race to guess it. Quick guesses score big, and the artist scores for every right guess.</p>
          <div class="facts"><span class="fact"><b>2–12</b> players</span><span class="fact"><b>250+</b> words</span><span class="fact">Everyone on their <b>own phone</b></span></div>
        </div>
        <div class="fan" aria-hidden="true">${art()}</div>
      </section>
      <section class="panels">
        <div class="panel">
          <div class="eyebrow">Online</div><h2>Play with friends</h2>
          <div class="field"><label for="nm">Your name</label><input id="nm" data-f="name" value="${esc(form.name)}" maxlength="18" placeholder="e.g. Priya" autocomplete="nickname"></div>
          ${net.ready ? `<button class="btn gold" data-do="host">Host a new table</button>
          <div class="field"><label for="cd">Or join with a code</label><div class="row"><input id="cd" class="grow code-in" data-f="code" value="${esc(form.code)}" maxlength="5" placeholder="ABCDE" autocomplete="off"><button class="btn" data-do="join">Join</button></div></div>`
          : '<p class="note">Can’t reach the game server right now, so Scribble can’t start. It needs everyone online.</p>'}
        </div>
        <div class="panel">
          <div class="eyebrow">New here?</div><h2>How it works</h2>
          <p>Everyone joins with the table code on their own phone or computer. The artist draws with a finger or mouse; everyone else types guesses.</p>
          <button class="btn" data-do="rules">Read the rules</button>
        </div>
      </section>
    </div>`;
  }
  const PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21l3.5-1 11-11-2.5-2.5-11 11zM14 5.5l2.5-2.5 4.5 4.5-2.5 2.5" fill="currentColor"/></svg>';
  function view(s){
    const a = artistOf(s), meP = P(s, me), mineTurn = a?.id === me && mode !== 'local', over = s.phase === 'over';
    const got = s.guessed?.[me] != null, show = mineTurn || got || s.stage === 'reveal' || over;
    const letters = s.word ? s.word.replace(/ /g, '').length : 0;
    const word = s.word ? [...s.word].map((ch, i) => ch === ' ' ? '<i class="sp"></i>' : show || s.hint.includes(i) ? `<span class="on">${esc(ch)}</span>` : '<span></span>').join('') : '';
    const top = over ? '<b class="sc-say">Game over</b>' : s.stage === 'pick' ? `<b class="sc-say">${mineTurn ? 'Pick a word to draw' : `${esc(a.name)} is choosing a word…`}</b>`
      : `<div class="sc-word ${show ? 'open' : ''}" aria-label="${show ? esc(s.word) : `${letters} letters`}">${word}</div><small>${mineTurn ? 'Draw this!' : got ? 'You got it!' : `${letters} letters${s.word.includes(' ') ? `, ${s.word.split(' ').length} words` : ''}`}</small>`;
    const ranked = [...s.players].sort((x, y) => (s.totals[y.id] || 0) - (s.totals[x.id] || 0));
    const players = ranked.map((p, i) => `<div class="sc-p ${p === a && !over ? 'draws' : ''} ${s.guessed?.[p.id] != null ? 'got' : ''} ${s.gone?.[p.id] ? 'gone' : ''}" data-pid="${esc(p.id)}">
        <span class="sc-rank">#${i + 1}</span>${avatar(s, p)}<div><b>${esc(p.name)}${p.id === me ? ' (you)' : ''}</b><small>${s.totals[p.id] || 0} pts</small></div>
        ${p === a && !over ? `<span class="sc-tag pen">${PENCIL}</span>` : s.guessed?.[p.id] != null ? '<span class="sc-tag ok">✓</span>' : ''}</div>`).join('');
    // What sits on top of the paper: the word choice, the wait, the reveal, or the final podium
    let over$ = '';
    if (over){
      const pod = ranked.slice(0, 3), order = [pod[1], pod[0], pod[2]].filter(Boolean);
      over$ = `<div class="sc-over"><div class="sc-podium">${order.map(p => { const r = pod.indexOf(p); return `<div class="pl r${r + 1}">${avatar(s, p)}<b>${esc(p.name)}</b><small>${s.totals[p.id] || 0} pts</small><div class="step">${['🥇', '🥈', '🥉'][r]}</div></div>`; }).join('')}</div>
        ${mode === 'host' ? '<button class="btn gold" data-do="scnew">New game</button>' : '<p class="muted">The host can start a new game.</p>'}</div>`;
    } else if (s.stage === 'pick') over$ = mineTurn ? `<div class="sc-cover"><div class="sc-pick">${s.choices.map((w, i) => `<button class="sc-wc" style="--i:${i}" data-do="scpick" data-i="${i}">${esc(w)}</button>`).join('')}</div><small>Pick one. The others won’t see it.</small></div>`
      : `<div class="sc-cover wait"><div class="sc-wiggle">${PENCIL}</div><b>${esc(a.name)} is picking a word</b></div>`;
    else if (s.stage === 'reveal'){
      const gains = s.players.filter(p => s.gain[p.id]).sort((x, y) => s.gain[y.id] - s.gain[x.id]);
      over$ = `<div class="sc-cover reveal"><small>The word was</small><div class="sc-big">${[...s.word].map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('')}</div>
        <div class="sc-gains">${gains.length ? gains.map(p => `<span>${esc(p.name)} <b>+${s.gain[p.id]}</b></span>`).join('') : '<span>Nobody guessed it</span>'}</div></div>`;
    }
    const tools = s.stage === 'draw' && mineTurn && !over ? `<div class="sc-tools">
        <div class="sc-pal">${PAL.map((c, i) => `<button class="sw ${!pen.erase && pen.c === i ? 'on' : ''}" style="--c:${c}" data-do="sccolor" data-c="${i}" aria-label="Colour ${i + 1}"></button>`).join('')}</div>
        <div class="sc-sizes">${SIZES.map((w, i) => `<button class="${pen.w === i ? 'on' : ''}" data-do="scsize" data-w="${i}" aria-label="Brush size ${i + 1}"><i style="--d:${Math.max(4, w * .7)}px"></i></button>`).join('')}</div>
        <div class="sc-acts"><button class="${pen.erase ? 'on' : ''}" data-do="scerase" aria-pressed="${pen.erase}">Eraser</button><button data-do="scundo">Undo</button><button data-do="scclear">Clear</button></div></div>` : '';
    const feed = s.log.filter(e => ['g', 'right', 'turn', 'big', 'win', 'sys'].includes(e.kind)).slice(-40).map(e =>
      e.kind === 'g' ? `<li><b style="color:${seatColor(s, e.pid)}">${esc(P(s, e.pid)?.name || '')}</b> ${esc(e.g)}</li>`
      : e.kind === 'right' ? `<li class="ok"><b>${esc(P(s, e.pid)?.name || '')}</b> guessed it! <span>+${e.pts}</span></li>`
      : `<li class="sys">${esc(e.text)}</li>`).join('');
    const box = !meP ? '<p class="sc-note">You’re watching this game.</p>' : over ? '' : mineTurn ? '<p class="sc-note">You’re the artist. Talk in the table chat 💬</p>'
      : got ? `<p class="sc-note ok">You got it! +${s.guessed[me]}</p>` : s.stage !== 'draw' ? '<p class="sc-note">Guess when the drawing starts</p>'
      : `<div class="sc-guess"><input id="sc-in" maxlength="40" placeholder="Type your guess…" autocomplete="off" autocapitalize="off" value="${esc(draft)}" aria-label="Your guess"><button class="btn gold" data-do="scguess">Guess</button></div>`;
    return `<div class="game sc-room"><div class="main">
      <header class="top">
        <div class="brand">Scrib<em>ble</em></div>
        <span class="sync">Round ${Math.min(s.lap, s.cfg.rounds)} of ${s.cfg.rounds}</span>
        <div class="tools">${s.code ? `<span class="codechip">${esc(s.code)}</span>` : ''}<button class="tool" data-do="rules">Rules</button><button class="tool" data-do="mute">${muted ? 'Sound off' : 'Sound on'}</button><button class="tool" data-do="leave">Leave</button></div>
      </header>
      <div class="sc-grid">
        <aside class="sc-players">${players}</aside>
        <section class="sc-stage">
          <div class="sc-head">${over ? '' : `<div class="sc-time" aria-hidden="true"><b>${Math.max(0, Math.ceil((s.until - clock()) / 1000))}</b></div>`}<div class="sc-mid">${top}</div></div>
          <div class="sc-paper ${s.stage === 'draw' && mineTurn ? 'live' : ''}"><div class="sc-slot"></div>${over$}</div>
          ${tools}
        </section>
        <aside class="sc-chat"><ol class="sc-feed">${feed}</ol>${box}</aside>
      </div>
    </div></div>${ui.modal === 'rules' ? rules() : ''}`;
  }
  // A right guess: “+120” rises from that player’s row.
  function onEvents(fresh){
    for (const e of fresh) if (e.kind === 'right'){
      sfx('coin');
      const row = app.querySelector(`.sc-p[data-pid="${CSS.escape(e.pid)}"]`); if (!row) continue;
      const r = row.getBoundingClientRect(), f = Object.assign(document.createElement('div'), {className:'sc-float', textContent:`+${e.pts}`});
      f.style.cssText = `left:${r.right - 30}px;top:${r.top + r.height / 2}px`; document.body.append(f); setTimeout(() => f.remove(), 1300);
    }
  }

  app.addEventListener('input', e => { if (e.target.id === 'sc-in') draft = e.target.value; });
  app.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'sc-in'){ e.preventDefault(); H.scguess(); } });
  const edit = op => { if (!mine || !G || !drawingNow(G)) return; op(); mine.inkv++; full = false; flush(); paint(); };
  Object.assign(H, {
    scpick:d => send({t:'pick', i:+d.i}, true),
    scguess:() => { const t = draft.trim(); if (!t) return; draft = ''; send({t:'guess', text:t}, true); },
    sccolor:d => { pen.c = +d.c; pen.erase = false; render(); },
    scsize:d => { pen.w = +d.w; render(); },
    scerase:() => { pen.erase = !pen.erase; render(); },
    scundo:() => edit(() => { if (mine.ink.length){ mine.ink.pop(); batch.push({q:++nextq, a:'undo'}); } }),
    scclear:() => edit(() => { mine.ink = []; batch.push({q:++nextq, a:'clear'}); }),
    scnew:() => { G = {...G, totals:{}, round:0}; rematch(); },
  });

  return {name:'Scribble', min:2, max:12, cfg, late, newGame, apply, needs, tick, home, view, rules, art, motion, onPeers, onEvents,
    busy:() => drawing, inkApply, near, norm, WORDS, CAP, PICK, SHOW,
    lobby:(s, host) => host
      ? `<div class="row"><label class="muted" for="scr">Rounds</label>${capInput('scr', 'rounds', s.cfg?.rounds ?? cfg.rounds, [2, 3, 4, 5], 1, 10)}<label class="muted" for="scs">Seconds to draw</label>${capInput('scs', 'secs', s.cfg?.secs ?? cfg.secs, [60, 80, 100, 120], 30, 240)}</div>`
      : `<p class="muted">${s.cfg?.rounds ?? cfg.rounds} rounds · ${s.cfg?.secs ?? cfg.secs} seconds to draw</p>`};
})();
ENG.scribble = SC;
