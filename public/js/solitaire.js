/* =====================================================================
   SOLITAIRE — Klondike (draw 1 or 3), FreeCell and Spider (1, 2 or 4
   suits). One player on this device. Tap a card to pick it up (with every
   card on top of it), then tap where it goes; tap the same pile again to
   send it to the best spot. Undo as far back as you like.
   Card ids: rank = id % 13 + 1; Spider's 104 cards fold their suits down
   to the 1, 2 or 4 suits in play.
   ===================================================================== */
const SOL = (() => {
  const VARS = {
    k1:{name:'Klondike', sub:'Draw 1', kind:'klondike', draw:1},
    k3:{name:'Klondike', sub:'Draw 3', kind:'klondike', draw:3},
    fc:{name:'FreeCell', sub:'Every card face up', kind:'freecell'},
    s1:{name:'Spider', sub:'1 suit', kind:'spider', suits:1},
    s2:{name:'Spider', sub:'2 suits', kind:'spider', suits:2},
    s4:{name:'Spider', sub:'4 suits', kind:'spider', suits:4},
  };
  const V = s => VARS[s.cfg.vk];
  const rank = id => id % 13 + 1;
  const suit = (s, id) => Math.floor(id / 13) % (V(s).suits || 4);
  const red = (s, id) => suit(s, id) === 1 || suit(s, id) === 2;
  const KEYS = ['t', 'd', 'stock', 'waste', 'f', 'cells', 'moves'];
  const cfg = {vk:'k1'};

  function newGame(seats, extra = {}){
    const c = {...cfg, ...(extra.cfg || {})}, v = VARS[c.vk];
    const s = {...extra, cfg:c, phase:'play', gid:rid(8), log:[], ln:0, hist:[], moves:0, t0:Date.now(),
      players:[{id:seats[0]?.id || 'p0', name:seats[0]?.name || 'You', hand:[]}], t:[], d:[], stock:[], waste:[], f:[], cells:[]};
    if (v.kind === 'klondike'){
      const deck = shuffle([...Array(52).keys()]);
      for (let i = 0; i < 7; i++){ s.t.push(deck.splice(0, i + 1)); s.d.push(i); }
      s.stock = deck; s.f = [[], [], [], []];
    } else if (v.kind === 'freecell'){
      const deck = shuffle([...Array(52).keys()]);
      s.t = Array.from({length:8}, (_, i) => deck.filter((_, j) => j % 8 === i)); s.d = Array(8).fill(0);
      s.f = [[], [], [], []]; s.cells = [null, null, null, null];
    } else {
      const deck = shuffle([...Array(104).keys()]);
      for (let i = 0; i < 10; i++){ s.t.push(deck.splice(0, i < 4 ? 6 : 5)); s.d.push(s.t[i].length - 1); }
      s.stock = deck;
    }
    log(s, `${v.name} · ${v.sub}. Good luck`, 'turn');
    return s;
  }
  const runOk = (s, run) => run.every((id, j) => !j || (rank(run[j - 1]) === rank(id) + 1 &&
    (V(s).kind === 'spider' ? suit(s, id) === suit(s, run[j - 1]) : red(s, id) !== red(s, run[j - 1]))));
  // The cards picked up from a spot, or null if nothing there can be moved.
  function take(s, from){
    const {p, i, k} = from || {};
    if (p === 't'){ const col = s.t[i]; if (!col || !(k >= s.d[i] && k < col.length)) return null; const run = col.slice(k); return runOk(s, run) ? run : null; }
    if (p === 'w') return s.waste.length ? [s.waste.at(-1)] : null;
    if (p === 'f') return V(s).kind !== 'spider' && s.f[i]?.length ? [s.f[i].at(-1)] : null;
    if (p === 'c') return s.cells[i] != null ? [s.cells[i]] : null;
    return null;
  }
  // FreeCell moves one card at a time; a longer run needs room: (free cells + 1) × 2^(empty columns).
  const room = (s, toEmpty) => (s.cells.filter(x => x == null).length + 1) * 2 ** (s.t.filter(c => !c.length).length - (toEmpty ? 1 : 0));
  function fits(s, cards, to){
    const kind = V(s).kind, c0 = cards[0];
    if (to.p === 't'){
      const col = s.t[to.i]; if (!col) return false;
      if (kind === 'freecell' && cards.length > room(s, !col.length)) return false;
      if (!col.length) return kind !== 'klondike' || rank(c0) === 13;
      const top = col.at(-1);
      return rank(top) === rank(c0) + 1 && (kind === 'spider' || red(s, top) !== red(s, c0));
    }
    if (to.p === 'f'){
      const f = s.f[to.i]; if (kind === 'spider' || !f || cards.length !== 1) return false;
      return f.length ? suit(s, f.at(-1)) === suit(s, c0) && rank(c0) === rank(f.at(-1)) + 1 : rank(c0) === 1;
    }
    return to.p === 'c' && kind === 'freecell' && cards.length === 1 && to.i >= 0 && to.i < 4 && s.cells[to.i] == null;
  }
  function lift(s, from){
    if (from.p === 't'){ s.t[from.i].splice(from.k); if (s.d[from.i] && s.t[from.i].length === s.d[from.i]) s.d[from.i]--; }
    else if (from.p === 'w') s.waste.pop();
    else if (from.p === 'f') s.f[from.i].pop();
    else s.cells[from.i] = null;
  }
  function drop(s, cards, to){
    if (to.p === 't') s.t[to.i].push(...cards); else if (to.p === 'f') s.f[to.i].push(cards[0]); else s.cells[to.i] = cards[0];
  }
  // Spider: a full King-to-Ace run of one suit leaves the table.
  function clearRuns(s){
    s.t.forEach((col, i) => {
      const run = col.slice(-13);
      if (run.length === 13 && col.length - 13 >= s.d[i] && rank(run[0]) === 13 && runOk(s, run)){
        col.splice(-13); s.f.push(suit(s, run[0]));
        if (s.d[i] && col.length === s.d[i]) s.d[i]--;
        log(s, `Run of ${['spades', 'hearts', 'diamonds', 'clubs'][suit(s, run[0])]} complete`);
      }
    });
  }
  function won(s){
    if (!(V(s).kind === 'spider' ? s.f.length === 8 : s.f.every(f => f.length === 13))) return;
    s.phase = 'over'; s.t1 = Date.now();
    log(s, `Solved in ${s.moves} moves`, 'win', {title:'You won!', sub:`${s.moves} moves`});
  }
  // Where a card is best sent when its pile is tapped twice: home first, then onto a card, then an empty column, then a free cell.
  function best(s, from){
    const cards = take(s, from); if (!cards) return null;
    const spots = [...s.f.map((_, i) => ({p:'f', i})), ...s.t.map((c, i) => ({p:'t', i, e:!c.length})).sort((a, b) => a.e - b.e), ...s.cells.map((_, i) => ({p:'c', i}))];
    return spots.find(to => !(to.p === from.p && to.i === from.i) && fits(s, cards, to)) || null;
  }
  const save = s => { s.hist.push(JSON.stringify(Object.fromEntries(KEYS.map(k => [k, s[k]])))); if (s.hist.length > 300) s.hist.shift(); };

  function apply(s, pid, a){
    if (!a || typeof a !== 'object') return 'That move was not understood';
    if (s.phase !== 'play') return 'This game is over. Deal again';
    const kind = V(s).kind;
    if (a.t === 'undo' || a.t === 'restart'){
      if (!s.hist.length) return 'Nothing to undo';
      Object.assign(s, JSON.parse(a.t === 'undo' ? s.hist.pop() : s.hist[0]));
      if (a.t === 'restart') s.hist = [];
      return;
    }
    if (a.t === 'stock'){
      if (kind !== 'klondike') return 'That move was not understood';
      if (!s.stock.length && !s.waste.length) return 'The stock is empty';
      save(s); s.moves++;
      if (!s.stock.length){ s.stock = s.waste.reverse(); s.waste = []; return; }
      s.waste.push(...s.stock.splice(-Math.min(V(s).draw, s.stock.length)).reverse());
      return;
    }
    if (a.t === 'deal'){
      if (kind !== 'spider') return 'That move was not understood';
      if (!s.stock.length) return 'No more cards to deal';
      if (s.t.some(c => !c.length)) return 'Fill every empty column before dealing';
      save(s); s.moves++;
      s.t.forEach(col => col.push(s.stock.pop()));
      clearRuns(s); return won(s);
    }
    if (a.t === 'auto'){
      if (kind === 'spider') return 'That move was not understood';
      let n = 0;
      for (let go = true; go;){
        go = false;
        const from = [...s.t.map((c, i) => ({p:'t', i, k:c.length - 1})), {p:'w'}, ...s.cells.map((_, i) => ({p:'c', i}))];
        for (const f of from){
          const cards = take(s, f), to = cards && s.f.map((_, i) => ({p:'f', i})).find(t => fits(s, cards, t));
          if (!to) continue;
          if (!n) save(s);
          lift(s, f); drop(s, cards, to); s.moves++; n++; go = true;
        }
      }
      if (!n) return 'Nothing can go up to the foundations yet';
      return won(s);
    }
    if (a.t === 'move'){
      const from = a.from, to = a.to || {};
      if (from?.p === to.p && from?.i === to.i) return 'Pick a different spot';
      const cards = take(s, from);
      if (!cards) return 'Those cards can’t be moved';
      if (!fits(s, cards, to)) return kind === 'freecell' && to.p === 't' && cards.length > room(s, !s.t[to.i]?.length) ? `Not enough free space to move ${cards.length} cards` : 'That card can’t go there';
      save(s); lift(s, from); drop(s, cards, to); s.moves++;
      if (kind === 'spider') clearRuns(s);
      return won(s);
    }
    return 'That move was not understood';
  }
  const needs = s => s.phase === 'play' ? [s.players[0].id] : [];

  /* ----- client ----- */
  const face = (s, id, at = '', cls = '') => RUM.pc(null, suit(s, id) * 13 + rank(id) - 1, {cls, attrs:`data-cid="c${id}" ${at}`});
  const slot = (at, txt = '') => `<div class="pc slot" ${at}>${txt ? `<span>${txt}</span>` : ''}</div>`;
  function art(){
    const cards = [[12, -16, -110, 16], [24, -6, -50, 2], [36, 4, 10, -4], [48, 14, 70, 4], [0, 24, 128, 20]];
    return `<div class="rummy-art" style="position:absolute;inset:0">${cards.map(([id, r, x, y]) => `<div class="fi" style="transform:translate(-50%,-50%) rotate(${r}deg) translate(${x * .55}px,${y * .9}px);--r2:${r * 1.25}deg;--x2:${x * .75}px;--yy:${y - 10}px">${RUM.pc(null, id)}</div>`).join('')}</div>`;
  }
  const rulesList = [
    ['Moving cards', 'Tap a card to pick it up, along with any cards on top of it. Tap where it should go. Tap the same pile again to send it to the best spot (home if it can go there).'],
    ['Klondike', 'Build the four foundations up by suit from Ace to King. In the seven columns, build down in alternating colors; only a King can fill an empty column. Turn cards from the stock one or three at a time; when it runs out, the waste turns back over as many times as you like.'],
    ['FreeCell', 'Every card is dealt face up into eight columns. Build down in alternating colors, and up by suit on the foundations. Four free cells each hold one card; any card can fill an empty column. You can move a run only if there is room to move it one card at a time: (free cells + 1) × 2 for each empty column.'],
    ['Spider', 'Two decks, ten columns. Build down regardless of suit, but only a run of one suit moves together. A complete King-to-Ace run of one suit is cleared away. Deal ten more cards (one per column) from the stock whenever you’re stuck, as long as no column is empty. Clear all eight runs to win.'],
    ['Undo', 'Undo goes back one move at a time, all the way to the deal. Restart puts the deal back exactly as it started.'],
  ];
  const rules = () => sheet(`<div class="eyebrow">How to play</div><h2>Solitaire rules</h2><ul class="rules">${rulesList.map(([k, v]) => `<li><b>${k}</b><span>${v}</span></li>`).join('')}</ul>
    <div class="acts"><button class="btn gold" data-do="closemodal">Got it</button></div>`);

  function home(){
    const saved = store.get('solitaire-local');
    return `<div class="home">
      <button class="btn small backlink" data-do="hub">← All games</button>
      <section class="hero">
        <div>
          <div class="eyebrow">Just you and the deck</div>
          <h1>Solit<em>aire</em></h1>
          <p>Klondike, FreeCell and Spider. Unlimited undo, and the game saves itself on this device.</p>
          <div class="facts"><span class="fact"><b>1</b> player</span><span class="fact"><b>3</b> games</span><span class="fact"><b>6</b> ways to play</span></div>
        </div>
        <div class="fan" aria-hidden="true">${art()}</div>
      </section>
      <section class="panels">
        <div class="panel">
          <div class="eyebrow">New game</div><h2>Pick a game</h2>
          <div class="sol-pick">${Object.entries(VARS).map(([k, v]) => `<button class="btn" data-do="solnew" data-vk="${k}"><b>${v.name}</b><small>${v.sub}</small></button>`).join('')}</div>
          ${saved?.phase === 'play' ? `<button class="btn small" data-do="solresume">Resume ${VARS[saved.cfg?.vk]?.name || ''} (${VARS[saved.cfg?.vk]?.sub || ''}, ${saved.moves} moves)</button>` : ''}
        </div>
        <div class="panel">
          <div class="eyebrow">New here?</div><h2>How it works</h2>
          <p>Tap a card to pick it up, tap where it goes. Tap the same pile twice to send a card to the best spot.</p>
          <button class="btn" data-do="rules">Read the rules</button>
        </div>
      </section>
    </div>`;
  }

  const clock = s => { if (!s.t0) return '–'; const t = Math.floor(((s.t1 || Date.now()) - s.t0) / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  function view(s){
    const v = V(s), kind = v.kind, sel = ui.solSel, picked = sel && take(s, sel);
    const isSel = (p, i, k) => picked && sel.p === p && sel.i === i && (p !== 't' || k >= sel.k);
    const at = (p, i, k) => `data-do="solsel" data-p="${p}" data-i="${i}" ${k != null ? `data-k="${k}"` : ''} role="button" tabindex="0"`;
    const spot = (p, i, inner, cls = '') => `<div class="sol-slot ${cls}" data-p="${p}" data-i="${i}">${inner}</div>`;   // also a drop target
    const fnd = i => spot('f', i, s.f[i].length ? face(s, s.f[i].at(-1), at('f', i), isSel('f', i) ? 'sel' : '') : slot(at('f', i), 'A'));
    let top;
    if (kind === 'klondike'){
      const w = s.waste.slice(-v.draw);
      top = `<div class="sol-slot">${s.stock.length ? `<div class="pc down" data-do="solstock" role="button" tabindex="0" aria-label="Turn cards from the stock"><span class="sol-n">${s.stock.length}</span></div>`
        : slot('data-do="solstock" role="button" tabindex="0" aria-label="Turn the waste back over"', '↺')}</div>
        <div class="sol-slot sol-waste">${w.length ? w.map((id, j) => j === w.length - 1 ? face(s, id, at('w', 0), isSel('w', 0) ? 'sel' : '') : face(s, id)).join('') : slot('')}</div><div></div>
        ${s.f.map((_, i) => fnd(i)).join('')}`;
    } else if (kind === 'freecell'){
      top = `${s.cells.map((c, i) => spot('c', i, c != null ? face(s, c, at('c', i), isSel('c', i) ? 'sel' : '') : slot(at('c', i)), 'cell')).join('')}
        ${s.f.map((_, i) => fnd(i)).join('')}`;
    } else {
      top = `<div class="sol-slot">${s.stock.length ? `<div class="pc down" data-do="soldeal" role="button" tabindex="0" aria-label="Deal ten more cards"><span class="sol-n">${s.stock.length / 10}</span></div>` : slot('')}</div><div></div>
        ${Array.from({length:8}, (_, i) => `<div class="sol-slot">${s.f[i] != null ? RUM.pc(null, s.f[i] * 13 + 12) : slot('')}</div>`).join('')}`;
    }
    const tab = s.t.map((col, i) => `<div class="sol-col" data-p="t" data-i="${i}">${col.length ? col.map((id, k) => k < s.d[i] ? `<div class="pc down" data-cid="c${id}"></div>`
      : face(s, id, at('t', i, k), isSel('t', i, k) ? 'sel' : '')).join('') : slot(at('t', i), kind === 'klondike' ? 'K' : '')}</div>`).join('');
    return `<div class="game sol-room"><div class="main sol" style="--n:${s.t.length}">
      <header class="sol-bar">
        <div class="sol-logo">Solitaire</div>
        <nav class="sol-tabs" aria-label="Start a new game of">${Object.entries(VARS).map(([k, x]) => `<button class="${k === s.cfg.vk ? 'on' : ''}" data-do="solnew" data-vk="${k}" ${k === s.cfg.vk ? 'aria-current="true"' : ''}>${x.name}<small>${x.sub}</small></button>`).join('')}</nav>
      </header>
      <section class="sol-row">${top}</section>
      <section class="sol-row sol-tab">${tab}</section>
      <footer class="sol-dock">
        <button data-do="solundo" ${s.hist.length ? '' : 'disabled'}>Undo</button>${kind === 'spider' ? '' : '<button data-do="solauto">Send cards home</button>'}
        <button data-do="solrestart" ${s.hist.length ? '' : 'disabled'}>Restart</button><button data-do="solnew" data-vk="${s.cfg.vk}">New deal</button>
        <span class="sol-stat"><b id="sol-time">${clock(s)}</b> time</span><span class="sol-stat"><b>${s.moves}</b> moves</span>${kind === 'spider' ? `<span class="sol-stat"><b>${s.f.length}/8</b> runs</span>` : ''}
        <span class="sol-gap"></span><button data-do="rules">Rules</button><button data-do="leave">Leave</button>
      </footer>
    </div></div>${modal(s)}`;
  }
  function modal(s){
    if (ui.modal === 'rules') return rules();
    if (s.phase !== 'over') return '';
    return sheet(`<div class="eyebrow">${V(s).name} · ${V(s).sub}</div><h2>You won!</h2><p class="lede">Solved in ${s.moves} moves${s.t0 ? ` and ${clock(s)}` : ''}.</p>
      <div class="acts"><button class="btn" data-do="leave">Back to menu</button><button class="btn gold" data-do="solnew" data-vk="${s.cfg.vk}">Deal again</button></div>`);
  }

  Object.assign(H, {
    solsel:d => {
      const s = viewState(), from = ui.solSel, here = {p:d.p, i:+d.i, k:d.k == null ? undefined : +d.k};
      if (from && from.p === here.p && from.i === here.i){ const to = best(s, from); ui.solSel = null; if (to) return send({t:'move', from, to}); toast('No better spot for that'); return render(); }
      if (from){ const a = {t:'move', from, to:{p:here.p, i:here.i}}; if (!apply(clone(s), me, a)) return send(a); }
      ui.solSel = take(s, here) ? here : null;
      if (from && !ui.solSel) toast('That card can’t go there');
      render();
    },
    solstock:() => send({t:'stock'}),
    soldeal:() => send({t:'deal'}),
    solauto:() => send({t:'auto'}),
    solundo:() => send({t:'undo'}),
    solrestart:() => send({t:'restart'}),
    solnew:d => {
      mode = 'local'; ui = freshUI(); seenLog = -1; GID = 'solitaire';
      G = {...newGame([{id:'p0', name:'You'}], {game:'solitaire', cfg:{vk:d.vk}}), v:1};
      store.set('solitaire-local', G); screen = 'game'; render(); scrollTo(0, 0);
    },
    solresume:() => { G = store.get('solitaire-local'); if (!G) return; mode = 'local'; ui = freshUI(); seenLog = -1; screen = 'game'; render(); },
  });

  // Drag and drop: press a card, move a few pixels and the run follows the pointer; let go over a pile.
  let drag = null, eatClick = 0;
  app.addEventListener('pointerdown', e => {
    if (GID !== 'solitaire' || e.button || G?.phase !== 'play') return;
    const el = e.target.closest('.sol .pc[data-do="solsel"]'); if (!el || el.classList.contains('slot')) return;
    const from = {p:el.dataset.p, i:+el.dataset.i, k:el.dataset.k == null ? undefined : +el.dataset.k};
    if (take(viewState(), from)) drag = {from, el, x:e.clientX, y:e.clientY, ghost:null, hid:[]};
  });
  addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.ghost){
      if (Math.hypot(dx, dy) < 6) return;
      const sibs = [...drag.el.parentElement.children], els = drag.from.p === 't' ? sibs.slice(sibs.indexOf(drag.el)) : [drag.el];
      const r = drag.el.getBoundingClientRect();
      drag.ghost = Object.assign(document.createElement('div'), {className:'sol sol-ghost'});
      drag.ghost.style.cssText = `left:${r.left}px;top:${r.top}px;--sw:${r.width}px`;
      els.forEach(x => { drag.ghost.append(x.cloneNode(true)); x.style.visibility = 'hidden'; drag.hid.push(x); });
      document.body.append(drag.ghost);
    }
    drag.ghost.style.transform = `translate(${dx}px,${dy}px)`;
  });
  const endDrag = e => {
    const d = drag; drag = null; if (!d?.ghost) return;
    d.ghost.remove(); eatClick = Date.now();
    const t = e.type === 'pointerup' && document.elementFromPoint(e.clientX, e.clientY)?.closest('.sol [data-p]');
    if (t && !(t.dataset.p === d.from.p && +t.dataset.i === d.from.i)){
      const a = {t:'move', from:d.from, to:{p:t.dataset.p, i:+t.dataset.i}}, err = apply(clone(viewState()), me, a);
      ui.solSel = null;
      if (!err) return send(a);
      toast(err);
    }
    d.hid.forEach(x => { x.style.visibility = ''; });
  };
  addEventListener('pointerup', endDrag); addEventListener('pointercancel', endDrag);
  app.addEventListener('click', e => { if (Date.now() - eatClick < 400){ eatClick = 0; e.stopPropagation(); } }, true);   // the click that ends a drag isn't a tap
  setInterval(() => { const el = GID === 'solitaire' && G?.phase === 'play' && document.getElementById('sol-time'); if (el) el.textContent = clock(G); }, 1000);

  // Winning: every card bounces off the foundations and leaves a trail, like the old Windows game.
  function cascade(s){
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = Object.assign(document.createElement('canvas'), {className:'sol-cascade'}), dpr = devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; document.body.append(cv);
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    const W = Math.min(90, innerWidth / 9), Hh = W * 1.4, SUITS = ['♠', '♥', '♦', '♣'], R = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const homes = [...document.querySelectorAll('.sol-row:first-of-type .sol-slot')].slice(-4).map(el => el.getBoundingClientRect());
    const queue = [];
    for (let r = 13; r >= 1; r--) for (let f = 0; f < 4; f++) queue.push({r, su:f, x:homes[f]?.left ?? innerWidth - (4 - f) * (W + 10), y:homes[f]?.top ?? 20});
    let cur = null, stop = false;
    const card = (x, y, r, su) => {
      c.fillStyle = '#fffdf8'; c.strokeStyle = '#333'; c.lineWidth = 1;
      c.beginPath(); c.roundRect(x, y, W, Hh, W * .1); c.fill(); c.stroke();
      c.fillStyle = su === 1 || su === 2 ? '#c0272d' : '#16161a';
      c.font = `700 ${W * .26}px 'Libre Baskerville',serif`; c.fillText(R[r], x + W * .08, y + W * .3);
      c.font = `${W * .5}px serif`; c.fillText(SUITS[su], x + W * .3, y + Hh * .66);
    };
    const tick = () => {
      if (stop) return;
      if (!cur){ const q = queue.shift(); if (!q) return setTimeout(() => cv.remove(), 1500); cur = {...q, vx:(Math.random() < .5 ? -1 : 1) * (2 + Math.random() * 4), vy:-Math.random() * 8}; }
      cur.vy += .45; cur.x += cur.vx; cur.y += cur.vy;
      if (cur.y + Hh > innerHeight){ cur.y = innerHeight - Hh; cur.vy *= -.78; }
      card(cur.x, cur.y, cur.r, cur.su);
      if (cur.x < -W || cur.x > innerWidth) cur = null;
      requestAnimationFrame(tick);
    };
    cv.addEventListener('pointerdown', () => { stop = true; cv.remove(); });
    tick();
  }

  return {name:'Solitaire', min:1, max:1, cfg, VARS, newGame, apply, needs, home, view, rules, art, take, fits, best, rank, suit,
    onEvents:(fresh, s) => { if (fresh.some(e => e.kind === 'win')) cascade(s); }};
})();
ENG.solitaire = SOL;
