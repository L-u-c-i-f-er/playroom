/* =====================================================================
   TEEN PATTI — three-card Indian poker with play-money chips, 3–8 players.
   Everyone antes the boot, which becomes the stake. Play blind (cards
   unseen: bet the stake or double it) or seen (look any time, then bet
   2× or 4× the stake). Pack to fold. With two players left either may
   ask for a show (blind pays the stake, seen pays 2×); a tie goes against
   whoever asked. A seen player may ask the previous seen player for a
   sideshow: the weaker hand packs, a tie goes against the asker. An
   optional pot limit forces a showdown. Short stacks go all-in and play
   for side pots.
   Ranks: Trail > Pure sequence > Sequence > Color > Pair > High card.
   A-K-Q is the top sequence, A-2-3 the second, then K-Q-J down to 4-3-2.
   Card ids 0..51: rank id % 13 (0 = ace), suit Math.floor(id / 13).
   ===================================================================== */
const TP = (() => {
  const NM = ['', '', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
  const pl = v => v === 6 ? 'Sixes' : NM[v] + 's';
  const rv = id => id % 13 === 0 ? 14 : id % 13 + 1;
  const su = id => Math.floor(id / 13);
  const cfg = {boot:10, stack:1000, potLimit:0};

  // [category, tiebreaks…]: 5 trail, 4 pure sequence, 3 sequence, 2 color, 1 pair, 0 high card.
  function rank3(c){
    const r = c.map(rv).sort((a, b) => b - a), flush = c.every(x => su(x) === su(c[0]));
    let seq = 0;
    if (r[0] - r[1] === 1 && r[1] - r[2] === 1) seq = r[0] === 14 ? 15 : r[0];   // A-K-Q tops, K-Q-J = 13 … 4-3-2 = 4
    else if (r[0] === 14 && r[1] === 3 && r[2] === 2) seq = 14;                  // A-2-3 is second only to A-K-Q
    if (r[0] === r[2]) return [5, r[0]];
    if (seq && flush) return [4, seq];
    if (seq) return [3, seq];
    if (flush) return [2, ...r];
    if (r[0] === r[1]) return [1, r[0], r[2]];
    if (r[1] === r[2]) return [1, r[1], r[0]];
    return [0, ...r];
  }
  const cmp = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++){ const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
  const seqName = v => v === 15 ? 'A-K-Q' : v === 14 ? 'A-2-3' : `${NM[v]}-high`;
  const handName = ([c, a, b]) => [`High card, ${NM[a]}`, `Pair of ${pl(a)}`, `Color, ${NM[a]} high`, `Sequence, ${seqName(a)}`, `Pure sequence, ${seqName(a)}`, `Trail of ${pl(a)}`][c];

  /* ----- a hand ----- */
  const pot = s => s.players.reduce((a, p) => a + p.total, 0);
  const inHand = s => s.players.filter(p => !p.out && !p.packed);
  const bet = (s, p) => (p.seen ? 2 : 1) * s.stake;   // the least this player can put in
  const nextFrom = (s, i, ok) => { const n = s.players.length; for (let k = 1; k <= n; k++){ const j = (i + k) % n; if (ok(s.players[j])) return j; } return -1; };
  const prevLive = (s, i) => { const n = s.players.length; for (let k = 1; k < n; k++){ const p = s.players[(i - k + n) % n]; if (!p.out && !p.packed) return p; } return null; };
  const move = (p, n) => { p.stack -= n; p.total += n; if (!p.stack) p.allin = true; };
  const canSide = (s, p) => { const q = prevLive(s, s.players.indexOf(p)); return p.seen && inHand(s).length >= 3 && q && q !== p && q.seen && !q.allin && !p.allin && p.stack >= 2 * s.stake; };

  function newGame(seats, extra = {}){
    const c = {...cfg, ...(extra.cfg || {})}, totals = {...(extra.totals || {})}, round = (extra.round || 0) + 1;
    const s = {...extra, cfg:c, totals, round, phase:'play', gid:rid(8), ack:extra.ack || {}, log:[], ln:0, champion:null, results:null, showdown:false,
      players:seats.map(p => ({id:p.id, name:p.name, stack:totals[p.id] ?? c.stack, hand:[], seen:false, packed:false, allin:false, total:0, out:false, last:'', won:0, best:null})),
      deck:shuffle([...Array(52).keys()]), stake:c.boot, turn:-1, dealer:0, side:null, peek:null};
    s.players.forEach(p => { p.out = p.stack < c.boot; s.totals[p.id] = p.stack; });
    const live = s.players.filter(p => !p.out);
    if (live.length < 2){ s.phase = 'over'; s.champion = live[0]?.id ?? null; s.results = []; return s; }
    const n = s.players.length;
    let d = (round - 1) % n; while (s.players[d].out) d = (d + 1) % n;   // the deal moves one seat a hand
    s.dealer = d;
    for (let k = 0; k < 3; k++) for (let i = 1; i <= n; i++){ const p = s.players[(d + i) % n]; if (!p.out) p.hand.push(s.deck.pop()); }
    live.forEach(p => move(p, c.boot));
    log(s, `Hand ${round}. ${s.players[d].name} deals. Boot ${c.boot} each, pot ${pot(s)}`, 'turn');
    s.turn = nextFrom(s, d, p => !p.out);
    advance(s, s.turn, true);
    return s;
  }
  // Whose turn next, or the end of the hand.
  function advance(s, from, here = false){
    s.side = null;
    const live = inHand(s);
    if (live.length === 1) return winAll(s, live[0]);
    if (s.cfg.potLimit && pot(s) >= s.cfg.potLimit){ log(s, `The pot reached the ${s.cfg.potLimit} limit: everyone still in shows`, 'big', {title:'Pot limit', sub:'Showdown'}); return showdown(s, live); }
    if (live.filter(p => !p.allin).length <= 1 && live.some(p => p.allin)) return showdown(s, live);
    s.turn = here && !s.players[from].allin && !s.players[from].packed ? from : nextFrom(s, from, p => !p.out && !p.packed && !p.allin);
  }
  function winAll(s, w){
    const amt = pot(s);
    w.stack += amt; w.won = amt;
    s.results = [{amt, ids:[w.id], name:null}];
    log(s, `${w.name} wins ${amt}. Everyone else packed`, 'big', {title:`${w.name} takes the pot`, sub:`${amt.toLocaleString()} chips`});
    finish(s);
  }
  // Each layer of contributions is its own pot, won by the best hand among those who paid into all of it.
  function showdown(s, live){
    live.forEach(p => { p.best = rank3(p.hand); p.seen = true; });
    const levels = [...new Set(s.players.map(p => p.total).filter(Boolean))].sort((a, b) => a - b);
    let prev = 0; s.results = [];
    for (const lv of levels){
      const amt = s.players.reduce((a, p) => a + Math.max(0, Math.min(p.total, lv) - prev), 0);
      let elig = live.filter(p => p.total >= lv);
      prev = lv;
      if (!amt) continue;
      if (!elig.length) elig = live.filter(p => p.total === Math.max(...live.map(q => q.total)));
      const top = elig.reduce((m, p) => cmp(p.best, m) > 0 ? p.best : m, elig[0].best);
      const ws = elig.filter(p => !cmp(p.best, top)), share = Math.floor(amt / ws.length);
      let odd = amt - share * ws.length;
      ws.forEach(p => { const w = share + (odd-- > 0 ? 1 : 0); p.stack += w; p.won += w; });
      const last = s.results.at(-1);
      if (last && last.ids.join() === ws.map(p => p.id).join()) last.amt += amt;
      else s.results.push({amt, ids:ws.map(p => p.id), name:handName(top)});
    }
    s.showdown = true;
    s.results.forEach((r, i) => {
      const who = r.ids.map(id => P(s, id).name).join(' and ');
      log(s, `${who} ${r.ids.length > 1 ? 'split' : 'wins'} ${i ? 'a side pot of ' : ''}${r.amt} with ${r.name.replace(/^[A-Z]/, m => m.toLowerCase())}`, 'big', {title:r.name.split(',')[0], sub:`${who} · ${r.amt.toLocaleString()}`});
    });
    finish(s);
  }
  function finish(s){
    s.phase = 'over'; s.turn = -1; s.side = null;
    s.players.forEach(p => { s.totals[p.id] = p.stack; });
    const left = s.players.filter(p => p.stack >= s.cfg.boot);
    if (left.length === 1){ s.champion = left[0].id; log(s, `${left[0].name} has the table’s chips and wins the game`, 'win', {title:`${left[0].name} wins!`, sub:'Nobody else can pay the boot'}); }
  }

  function apply(s, pid, a){
    if (!a || typeof a !== 'object') return 'That move was not understood';
    const p = P(s, pid); if (!p) return 'You’re watching this game';
    if (a.t === 'rebuy'){
      if (s.phase !== 'over') return 'You can buy back in between hands';
      if (p.stack >= s.cfg.boot) return 'You still have chips';
      p.stack = s.totals[p.id] = s.cfg.stack;
      if (s.players.filter(q => q.stack >= s.cfg.boot).length > 1) s.champion = null;
      return log(s, `${p.name} buys back in for ${s.cfg.stack}`);
    }
    if (s.phase !== 'play') return 'This hand is over';
    if (p.out || p.packed) return 'You’re out of this hand';
    // Looking at your cards is free and can happen any time.
    if (a.t === 'see'){ if (p.seen) return 'You’ve already seen your cards'; p.seen = true; log(s, `${p.name} looks at their cards`); return; }
    if (s.side){
      if (pid !== s.side.to) return `Waiting for ${P(s, s.side.to).name} to answer the sideshow`;
      if (a.t !== 'sideshow') return 'Accept or deny the sideshow first';
      const asker = P(s, s.side.from), from = s.players.indexOf(asker);
      if (a.accept){
        const loser = cmp(rank3(asker.hand), rank3(p.hand)) > 0 ? p : asker;   // a tie goes against the one who asked
        loser.packed = true; loser.last = 'Packed';
        s.peek = {ids:[asker.id, p.id], hands:{[asker.id]:asker.hand, [p.id]:p.hand}, at:s.ln + 1};
        log(s, `${p.name} accepts the sideshow. ${loser.name} has the weaker hand and packs`, 'big', {title:'Sideshow', sub:`${loser.name} packs`});
      } else log(s, `${p.name} denies the sideshow`);
      return advance(s, from);
    }
    if (s.players[s.turn] !== p) return 'It’s not your turn';
    const min = bet(s, p), i = s.turn;
    s.peek = null;
    if (a.t === 'pack'){ p.packed = true; p.last = 'Packed'; log(s, `${p.name} packs`); return advance(s, i); }
    if (a.t === 'chaal'){
      const amt = min * (a.double ? 2 : 1);
      if (amt > p.stack) return p.stack < min ? `You have ${p.stack}. Go all-in or pack` : 'Not enough chips to double';
      move(p, amt);
      if (a.double) s.stake *= 2;
      p.last = `${p.seen ? 'Chaal' : 'Blind'} ${amt}`;
      log(s, `${p.name} ${p.seen ? 'plays chaal' : 'bets blind'} ${amt}${a.double ? ' and doubles the stake' : ''}`);
      return advance(s, i);
    }
    if (a.t === 'allin'){
      if (p.stack >= min) return `You can still afford ${min}. Bet it, or pack`;
      const amt = p.stack; move(p, amt); p.last = 'All-in';
      log(s, `${p.name} goes all-in for ${amt}`, 'big', {title:'All-in', sub:`${p.name} · ${amt}`});
      return advance(s, i);
    }
    if (a.t === 'show'){
      const live = inHand(s);
      if (live.length !== 2) return 'A show is only possible with two players left';
      const o = live.find(q => q !== p);
      if (min > p.stack) return `A show costs ${min}. You have ${p.stack}`;
      move(p, min); p.last = 'Show';
      p.seen = o.seen = true; p.best = rank3(p.hand); o.best = rank3(o.hand);
      const w = cmp(p.best, o.best) > 0 ? p : o, l = w === p ? o : p;   // a tie goes against whoever asked
      l.packed = true;
      log(s, `${p.name} pays ${min} for a show`);
      s.showdown = true;
      const amt = pot(s); w.stack += amt; w.won = amt;
      s.results = [{amt, ids:[w.id], name:handName(w.best)}];
      log(s, `${w.name} wins ${amt} with ${handName(w.best).replace(/^[A-Z]/, m => m.toLowerCase())}`, 'big', {title:handName(w.best).split(',')[0], sub:`${w.name} wins the show`});
      return finish(s);
    }
    if (a.t === 'side'){
      if (!canSide(s, p)) return 'A sideshow needs you and the previous player both seen, with three or more players in';
      const q = prevLive(s, i);
      move(p, 2 * s.stake); p.last = `Sideshow ${2 * s.stake}`;
      s.side = {from:pid, to:q.id};
      log(s, `${p.name} plays chaal ${2 * s.stake} and asks ${q.name} for a sideshow`);
      return;
    }
    return 'That move was not understood';
  }
  const needs = s => s.phase === 'play' ? [s.side ? s.side.to : s.players[s.turn]?.id].filter(Boolean) : [];

  /* ----- client ----- */
  const pc = (id, o) => RUM.pc(null, id, o);
  const fmt = n => n.toLocaleString();
  const back = (cls = '') => `<div class="pc down tp-back ${cls}"></div>`;
  function art(){
    const cards = [[0, -14, -80, 10], [13, 0, 0, -4], [26, 14, 80, 10]];
    return `<div class="rummy-art tp-art" style="position:absolute;inset:0">${cards.map(([id, r, x, y]) => `<div class="fi" style="transform:translate(-50%,-50%) rotate(${r}deg) translate(${x * .6}px,${y}px);--r2:${r * 1.4}deg;--x2:${x * .85}px;--yy:${y - 10}px">${pc(id)}</div>`).join('')}</div>`;
  }
  const rulesList = [
    ['Goal', 'Win the pot with the best three cards, or keep betting until everyone else packs. Play-money chips only.'],
    ['Boot', 'Everyone puts the boot in the pot before the deal. The boot is the first stake.'],
    ['Blind or seen', 'You can bet without looking (blind) or look at your cards any time (seen). Blind: bet the stake, or double it. Seen: bet twice the stake, or four times it. Doubling raises the stake for everyone.'],
    ['Pack', 'Fold on your turn and lose what you’ve put in.'],
    ['Show', 'With only two players left, either can ask for a show: blind pays the stake, seen pays twice the stake. Both hands are shown and the better one takes the pot. A tie goes against whoever asked.'],
    ['Sideshow', 'With three or more players in, a seen player can bet twice the stake and ask the previous player, if they are also seen, to compare cards privately. They can accept or deny. If accepted, the weaker hand packs; a tie goes against whoever asked.'],
    ['Pot limit', 'If the host sets one, the moment the pot reaches it everyone still in shows their cards.'],
    ['All-in', 'Can’t afford the stake? Go all-in with what you have. You can only win what you matched; the rest goes to side pots.'],
    ['Hand ranks', 'Best first: Trail (three of a kind), Pure sequence (three in a row, one suit), Sequence, Color (one suit), Pair, High card. A-K-Q is the best sequence, A-2-3 the second, then K-Q-J down to 4-3-2.'],
    ['Out of chips', 'Buy back in between hands. The game ends when only one player can pay the boot.'],
  ];
  const rules = () => sheet(`<div class="eyebrow">How to play</div><h2>Teen Patti rules</h2><ul class="rules">${rulesList.map(([k, v]) => `<li><b>${k}</b><span>${v}</span></li>`).join('')}</ul>
    <div class="acts"><button class="btn gold" data-do="closemodal">Got it</button></div>`);
  const setup = (s, id) => `<div class="row tp-setup"><label class="muted" for="${id}b">Boot</label>${capInput(id + 'b', 'boot', s.boot, [5, 10, 25, 50, 100], 1, 10000)}
    <label class="muted" for="${id}s">Chips each</label>${capInput(id + 's', 'stack', s.stack, [500, 1000, 2000, 5000], 10, 1000000)}
    <label class="muted" for="${id}p">Pot limit</label>${capInput(id + 'p', 'potLimit', s.potLimit, [0, 500, 1000, 5000], 0, 10000000)}<span class="muted">0 for none</span></div>`;

  function home(){
    const saved = store.get('teenpatti-local');
    const locals = form.locals.map((n, i) => `<div class="row"><input class="grow" id="lp${i}" data-local="${i}" value="${esc(n)}" placeholder="Player ${i + 1}" maxlength="18" aria-label="Player ${i + 1} name" style="min-width:0;background:rgba(0,0,0,.28);border:1px solid var(--line);border-radius:12px;padding:11px 14px;color:var(--text);font:500 16px var(--body)">${form.locals.length > 2 ? `<button class="tool" data-do="lrem" data-i="${i}">Remove</button>` : ''}</div>`).join('');
    return `<div class="home">
      <button class="btn small backlink" data-do="hub">← All games</button>
      <section class="hero">
        <div>
          <div class="eyebrow">Three cards · blind or seen</div>
          <h1>Teen <em>Patti</em></h1>
          <p>Ante the boot, bet blind or look and play chaal, call a show or a sideshow. A trail of aces beats everything. Play-money chips only.</p>
          <div class="facts"><span class="fact"><b>3–8</b> players</span><span class="fact"><b>3</b> cards</span><span class="fact">Boot <b>${cfg.boot}</b></span><span class="fact">Sideshow &amp; show</span></div>
        </div>
        <div class="fan" aria-hidden="true">${art()}</div>
      </section>
      <section class="panels">
        <div class="panel">
          <div class="eyebrow">Online</div><h2>Host a table</h2>
          <div class="field"><label for="nm">Your name</label><input id="nm" data-f="name" value="${esc(form.name)}" maxlength="18" placeholder="e.g. Priya" autocomplete="nickname"></div>
          ${net.ready ? `<button class="btn gold" data-do="host">Host a new table</button>
          <div class="field"><label for="cd">Or join with a code</label><div class="row"><input id="cd" class="grow code-in" data-f="code" value="${esc(form.code)}" maxlength="5" placeholder="ABCDE" autocomplete="off"><button class="btn" data-do="join">Join</button></div></div>`
          : '<p class="note">Can’t reach the game server right now, so online play is off. Offline modes still work.</p>'}
        </div>
        <div class="panel">
          <div class="eyebrow">One device</div><h2>Pass &amp; play</h2>
          <p>Hand the device to whoever’s turn it is. Cards stay hidden behind a pass screen.</p>
          <div class="names">${locals}</div>
          ${setup(cfg, 'tph')}
          <div class="row">${form.locals.length < 8 ? '<button class="btn small" data-do="ladd8">Add player</button>' : ''}<button class="btn gold" data-do="tplocal" style="margin-left:auto">Start game</button></div>
          ${saved?.players ? `<button class="btn small" data-do="tpresume">Resume saved game (${saved.players.map(p => esc(p.name)).join(', ')})</button>` : ''}
        </div>
        <div class="panel">
          <div class="eyebrow">New here?</div><h2>How it works</h2>
          <p>Stay blind and your bets cost half. Look, and you know what you’re playing for. Two left? Call a show.</p>
          <button class="btn" data-do="rules">Read the rules</button>
        </div>
      </section>
    </div>`;
  }

  function view(s){
    const meP = P(s, me), actor = P(s, needs(s)[0]), myTurn = s.phase === 'play' && actor?.id === me && !s.side, over = s.phase === 'over';
    const n = s.players.length, k0 = Math.max(0, s.players.findIndex(p => p.id === me));
    const on = mode === 'local' ? null : (() => { const l = live(); l.add(me); return l; })();
    const showFaces = p => over && s.showdown && !p.packed && !p.out;
    const peekFor = p => s.peek && s.peek.ids.includes(me) && s.peek.ids.includes(p.id) && p.id !== me;
    const winSet = new Set(over ? s.results.flatMap(r => r.ids) : []);
    const seats = s.players.map((p, i) => {
      const a = Math.PI / 2 + 2 * Math.PI * ((i - k0 + n) % n) / n, cx = Math.cos(a).toFixed(3), cy = Math.sin(a).toFixed(3);
      const tag = p.out ? 'Sitting out' : p.packed ? 'Packed' : p.allin ? 'All-in' : p.seen ? 'Seen' : 'Blind';
      const cards = p.out ? '' : p.id === me && mode !== 'local' ? '' : showFaces(p) || peekFor(p) ? p.hand.map(id => pc(id, {cls:'xs'})).join('') : p.hand.map(() => back('xs')).join('');
      return `<div class="tp-seat ${actor === p && !over ? 'up' : ''} ${p.packed || p.out ? 'gone' : ''} ${winSet.has(p.id) ? 'won' : ''} ${p.id === me && mode !== 'local' ? 'me' : ''}" style="left:calc(50% + ${cx} * var(--sx));top:calc(50% + ${cy} * var(--sy))" data-pid="${esc(p.id)}">
        <div class="tp-cards">${cards}</div>
        <div class="tp-plate">${avatar(s, p)}<div><b>${on && !on.has(p.id) ? '<span class="dot"></span> ' : ''}${esc(p.name)}</b><span>${fmt(p.stack)}</span></div>${i === s.dealer ? '<i class="tp-dealer" title="Dealer">D</i>' : ''}</div>
        <span class="tp-tag ${tag.toLowerCase().replace(/[^a-z]/g, '')}">${winSet.has(p.id) ? `+${fmt(p.won)}` : p.last && !p.packed ? p.last : tag}</span>
        ${showFaces(p) ? `<small class="tp-hand">${handName(rank3(p.hand))}</small>` : ''}
      </div>`;
    }).join('');
    const say = over ? (s.champion ? `${esc(P(s, s.champion).name)} wins the game` : s.results.map(r => `${r.ids.map(id => esc(P(s, id).name)).join(' & ')} ${r.ids.length > 1 ? 'split' : 'wins'} ${fmt(r.amt)}`).join(' · '))
      : s.side ? `${esc(P(s, s.side.from).name)} asks ${esc(P(s, s.side.to).name)} for a sideshow` : myTurn ? 'Your turn' : `${esc(actor?.name || '')}’s turn`;
    return `<div class="game tp-room"><div class="main">
      <header class="tp-bar">
        <div class="tp-logo">Teen Patti</div>
        <span class="tp-meta">Hand ${s.round} · Boot ${s.cfg.boot}${s.cfg.potLimit ? ` · Pot limit ${fmt(s.cfg.potLimit)}` : ''}</span>
        <div class="tools">${s.code ? `<span class="codechip">${esc(s.code)}</span>` : ''}<button class="tool" data-do="rules">Rules</button><button class="tool" data-do="mute">${muted ? 'Sound off' : 'Sound on'}</button><button class="tool" data-do="leave">Leave</button></div>
      </header>
      <section class="tp-table">
        <div class="tp-cloth"><div class="tp-mandala"></div></div>
        <div class="tp-center">
          <div class="tp-pot"><span class="tp-coins" aria-hidden="true"></span><b>${fmt(pot(s))}</b><small>pot</small></div>
          <div class="tp-stake">Stake <b>${fmt(s.stake)}</b> · blind ${fmt(s.stake)}, seen ${fmt(2 * s.stake)}</div>
          <div class="tp-say">${say}</div>
        </div>
        ${seats}
      </section>
      ${dock(s, meP, myTurn)}
    </div></div>${modal(s, meP)}${curtain(s)}`;
  }
  function dock(s, meP, myTurn){
    const over = s.phase === 'over', next = mode === 'local' || mode === 'host', local = mode === 'local';
    if (!meP) return `<section class="tp-dock"><span class="tp-info">You’re watching this game.</span>${over && next && !s.champion ? '<button class="tp-btn gold" data-do="again">Next hand</button>' : ''}</section>`;
    if (over){
      const busted = s.players.filter(p => p.stack < s.cfg.boot && (local || p.id === me));
      return `<section class="tp-dock"><span class="tp-info">${local ? 'Hand over.' : meP.packed ? 'You packed this hand.' : `You had ${handName(rank3(meP.hand)).replace(/^[A-Z]/, m => m.toLowerCase())}.`}</span>
        ${busted.map(p => `<button class="tp-btn" data-do="tprebuy" data-id="${esc(p.id)}">${local ? `${esc(p.name)}: ` : ''}Buy back in for ${fmt(s.cfg.stack)}</button>`).join('')}
        ${next && !s.champion ? '<button class="tp-btn gold" data-do="again">Next hand</button>' : !next ? '<span class="tp-info">The host deals the next hand.</span>' : ''}</section>`;
    }
    const mine = local && !myTurn ? '' : `<div class="tp-mine ${meP.seen ? 'seen' : ''}">${meP.hand.map(id => meP.seen ? pc(id, {cid:true}) : back()).join('')}</div>`;
    const info = meP.packed ? 'You packed this hand.' : meP.out ? 'You’re sitting out this hand.' : meP.seen ? `<b>${handName(rank3(meP.hand))}</b>` : 'Playing blind. Your bets cost half.';
    const see = !meP.seen && !meP.packed && !meP.out && (!local || myTurn) ? '<button class="tp-btn" data-do="tpact" data-t="see">See cards</button>' : '';
    if (!myTurn) return `<section class="tp-dock">${mine}<span class="tp-info">${info}${!meP.packed && !meP.out && s.phase === 'play' ? ` · waiting for ${esc(P(s, needs(s)[0])?.name || '')}` : ''}</span>${see}</section>`;
    const min = bet(s, meP), live = inHand(s);
    const acts = [`<button class="tp-btn pack" data-do="tpact" data-t="pack">Pack</button>`];
    if (meP.stack >= min) acts.push(`<button class="tp-btn gold" data-do="tpchaal">${meP.seen ? 'Chaal' : 'Blind'} ${fmt(min)}</button>`);
    if (meP.stack >= 2 * min) acts.push(`<button class="tp-btn" data-do="tpchaal" data-double="1">Double ${fmt(2 * min)}</button>`);
    if (meP.stack < min) acts.push(`<button class="tp-btn gold" data-do="tpact" data-t="allin">All-in ${fmt(meP.stack)}</button>`);
    if (live.length === 2 && meP.stack >= min && !live.some(p => p.allin)) acts.push(`<button class="tp-btn show" data-do="tpact" data-t="show">Show ${fmt(min)}</button>`);
    if (canSide(s, meP)) acts.push(`<button class="tp-btn" data-do="tpact" data-t="side">Sideshow ${fmt(2 * s.stake)}</button>`);
    return `<section class="tp-dock turn">${mine}<span class="tp-info">${info}</span>${see}<div class="tp-acts">${acts.join('')}</div></section>`;
  }
  function modal(s, meP){
    if (ui.modal === 'rules') return rules();
    if (s.phase === 'play' && s.side && s.side.to === me && (mode !== 'local' || ui.revealed === me)){
      const asker = P(s, s.side.from);
      return sheet(`<div class="eyebrow">Sideshow</div><h2>${esc(asker.name)} wants to compare cards</h2>
        <p class="lede">Only the two of you see both hands. The weaker hand packs; if they’re equal, ${esc(asker.name)} packs.</p>
        <div class="tp-mine seen" style="justify-content:center">${meP.hand.map(id => pc(id)).join('')}</div>
        <div class="acts"><button class="btn" data-do="tpside" data-a="0">Deny</button><button class="btn gold" data-do="tpside" data-a="1">Accept</button></div>`);
    }
    if (s.phase !== 'over' || !s.champion) return '';
    const next = mode === 'local' || mode === 'host', c = P(s, s.champion);
    return sheet(`<div class="eyebrow">Game over</div><h2>${esc(c.name)} wins with ${fmt(c.stack)} chips</h2>
      <p class="lede">Nobody else can pay the boot. Busted players can buy back in, or start a new game.</p>
      <div class="acts"><button class="btn" data-do="leave">Back to menu</button>${s.players.filter(p => p.stack < s.cfg.boot && (mode === 'local' || p.id === me)).map(p => `<button class="btn" data-do="tprebuy" data-id="${esc(p.id)}">${mode === 'local' ? esc(p.name) + ': b' : 'B'}uy back in</button>`).join('')}${next ? '<button class="btn gold" data-do="tpnew">New game</button>' : ''}</div>`);
  }
  function curtain(s){
    if (mode !== 'local' || s.phase !== 'play' || ui.revealed === me) return '';
    const p = P(s, me);
    return `<div class="curtain"><div><div class="eyebrow">Pass the device</div><h2>${avatar(s, p)} ${esc(p.name)}</h2><p class="muted">${s.side ? `${esc(P(s, s.side.from).name)} asks you for a sideshow` : `Your turn${p.seen ? '' : ', playing blind'}`}</p><br><button class="btn gold" data-do="reveal">I’m ${esc(p.name)}</button></div></div>`;
  }

  Object.assign(H, {
    tpact:d => send({t:d.t}, d.t === 'see'),
    tpchaal:d => send({t:'chaal', double:!!d.double}),
    tpside:d => send({t:'sideshow', accept:d.a === '1'}),
    tprebuy:d => { if (mode !== 'local') return send({t:'rebuy'}); const keep = me; me = d.id; send({t:'rebuy'}); me = keep; render(); },
    tpnew:() => { G = {...G, totals:{}, round:0}; rematch(); },
    tplocal:() => {
      const names = form.locals.map(n => n.trim()).filter(Boolean);
      if (names.length < 3) return toast('Teen Patti needs at least three players');
      mode = 'local'; ui = freshUI(); seenLog = -1;
      G = {...newGame(names.map((name, i) => ({id:'p' + i, name})), {game:'teenpatti'}), v:1};
      store.set('teenpatti-local', G); screen = 'game'; render();
    },
    tpresume:() => { G = store.get('teenpatti-local'); if (!G) return; mode = 'local'; ui = freshUI(); seenLog = -1; screen = 'game'; render(); },
  });

  return {name:'Teen Patti', min:3, max:8, cfg, late:{unit:'chips', why:'the starting chips', score:s => s.cfg.stack}, newGame, apply, needs, home, view, rules, art, rank3, cmp, handName, pot, canSide,
    lobby:(s, host) => host ? setup({...cfg, ...(s.cfg || {})}, 'tpl')
      : `<p class="muted">Boot ${s.cfg?.boot ?? cfg.boot} · ${fmt(s.cfg?.stack ?? cfg.stack)} chips each${s.cfg?.potLimit ? ` · pot limit ${fmt(s.cfg.potLimit)}` : ''}</p>`};
})();
ENG.teenpatti = TP;
