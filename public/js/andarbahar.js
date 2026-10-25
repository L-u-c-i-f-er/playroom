/* =====================================================================
   ANDAR BAHAR — play-money chips. Everyone bets Andar or Bahar, the dealer
   (host, or anyone on a shared device) turns up a joker and deals both
   sides alternately, Andar first, until a card matches the joker's rank.
   Andar pays 0.9:1 because it gets the first card; Bahar pays 1:1.
   ===================================================================== */
const AB = (() => {
  const RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'], SUIT = ['♠', '♥', '♦', '♣'];
  const rank = id => id % 13 + 1;
  const lbl = id => RANK[rank(id)] + SUIT[Math.floor(id / 13)];
  const PAY = {andar:.9, bahar:1}, SIDE = {andar:'Andar', bahar:'Bahar'};
  const cfg = {start:1000};

  function newGame(seats, extra = {}){
    const c = {...cfg, ...(extra.cfg || {})};
    const s = {...extra, cfg:c, phase:'bet', round:1, gid:rid(8), ack:extra.ack || {}, log:[], ln:0, history:[],
      players:seats.map(p => ({id:p.id, name:p.name, chips:c.start, bet:null, prev:null, last:null, topups:0})), joker:null, seq:[], winner:null};
    log(s, `Round 1. Everyone starts with ${c.start} chips`, 'turn');
    return s;
  }
  const isDealer = (s, pid) => s.host == null || pid === s.host;
  function apply(s, pid, a){
    if (!a || typeof a !== 'object') return 'That move was not understood';
    const p = P(s, pid);
    if (a.t === 'bet'){
      if (!p) return 'You’re watching this table';
      if (s.phase !== 'bet') return 'Bets are closed. Wait for the next round';
      if (!PAY[a.side]) return 'Pick Andar or Bahar';
      const amt = Math.floor(a.amt);
      if (!(amt >= 1)) return 'Pick a stake';
      if (amt > p.chips) return `You only have ${p.chips} chips`;
      p.bet = {side:a.side, amt}; return;
    }
    if (a.t === 'clear'){ if (!p || s.phase !== 'bet') return 'Nothing to clear'; p.bet = null; return; }
    if (a.t === 'topup'){
      if (!p) return 'You’re watching this table';
      if (p.chips >= 100) return 'Top-ups are for players below 100 chips';
      if (s.phase !== 'bet') return 'Top up between rounds';
      p.chips = s.cfg.start; p.topups++; log(s, `${p.name} topped up to ${s.cfg.start} chips`); return;
    }
    if (a.t === 'deal'){
      if (!isDealer(s, pid)) return 'Only the dealer can deal';
      if (s.phase !== 'bet') return 'Start a new round first';
      if (!s.players.some(q => q.bet)) return 'Nobody has bet yet';
      const deck = shuffle([...Array(52).keys()]);
      s.joker = deck.pop(); s.seq = [];
      for (let side = 'andar'; ; side = side === 'andar' ? 'bahar' : 'andar'){
        const id = deck.pop(); s.seq.push({side, id});
        if (rank(id) === rank(s.joker)){ s.winner = side; break; }
      }
      for (const q of s.players){
        q.last = null;
        if (!q.bet) continue;
        const win = q.bet.side === s.winner;
        q.last = win ? Math.floor(q.bet.amt * PAY[q.bet.side]) : -q.bet.amt;
        q.chips += q.last; q.prev = q.bet; q.bet = null;
      }
      s.history = [...s.history, s.winner].slice(-16); s.phase = 'done';
      log(s, `Joker ${lbl(s.joker)}. ${SIDE[s.winner]} won after ${s.seq.length} cards`, 'info');
      return;
    }
    if (a.t === 'next'){
      if (!isDealer(s, pid)) return 'Only the dealer can start the next round';
      if (s.phase !== 'done') return 'Deal this round first';
      s.phase = 'bet'; s.round++; s.joker = null; s.seq = []; s.winner = null;
      log(s, `Round ${s.round}. Place your bets`, 'turn'); return;
    }
    return 'That move was not understood';
  }

  /* ----- client: reveal the dealt cards one by one, then announce ----- */
  let shown = {key:null, n:0}, timer = null;
  const stake = {};
  function reveal(s){
    const key = s.gid + ':' + s.round;
    if (s.phase !== 'done'){ shown = {key:null, n:0}; return 0; }
    if (shown.key !== key){
      shown = {key, n:0}; clearInterval(timer);
      timer = setInterval(() => {
        if (GID !== 'andarbahar' || !G || G.gid + ':' + G.round !== key){ clearInterval(timer); return; }
        shown.n++; sfx('flick');
        if (shown.n >= G.seq.length){
          clearInterval(timer);
          const me$ = P(G, me), d = me$?.last;
          requestAnimationFrame(() => payout(G));
          showBanner({title:`${SIDE[G.winner]} wins!`, sub:mode !== 'local' && d != null ? (d > 0 ? `You won ${d} chips` : `You lost ${-d} chips`) : `Joker ${lbl(G.joker)} · card ${G.seq.length}`});
          sfx(mode !== 'local' && d < 0 ? 'err' : 'coin');
        }
        render();
      }, s.seq.length > 24 ? 260 : 480);
    }
    return Math.min(shown.n, s.seq.length);
  }
  const card = (id, o = {}) => RUM.pc(null, id, o);
  // Chips: a bet slides from the player's box to its lane; when the cards are all out, winnings slide back
  // and losing chips slide to the dealer's shoe.
  const laneEl = side => app.querySelector(`.ab-row[data-side="${side}"] .ab-pot`);
  const boxEl = id => app.querySelector(`.ab-players [data-pid="${CSS.escape(id)}"] .stat`);
  let betSeen = null;
  function motion(s){
    if (app.querySelector('.curtain')) return;
    const prev = betSeen;
    betSeen = {gid:s.gid, round:s.round, bets:Object.fromEntries(s.players.map(p => [p.id, p.bet ? p.bet.side + p.bet.amt : '']))};
    if (!prev || prev.gid !== s.gid || prev.round !== s.round) return;
    let k = 0;
    for (const p of s.players) if (p.bet && prev.bets[p.id] !== p.bet.side + p.bet.amt) chipFly(boxEl(p.id), laneEl(p.bet.side), {n:Math.min(6, 2 + Math.round(p.bet.amt / 100)), delay:k++ * 100});
  }
  function payout(s){
    let k = 0;
    for (const p of s.players){
      if (p.last > 0) chipFly(laneEl(s.winner), boxEl(p.id), {n:Math.min(8, 3 + Math.round(p.last / 100)), delay:k++ * 140});
      else if (p.last < 0) chipFly(laneEl(p.prev?.side), app.querySelector('#deck'), {n:3, delay:k++ * 140});
    }
  }
  // A small stack of chips for what's riding on a lane
  const DEN = [[500, '#7c3aed'], [250, '#1f1f24'], [100, '#16a34a'], [50, '#dc2626'], [10, '#0ea5e9']];
  function stack(n){
    const out = []; let r = n;
    for (const [v, c] of DEN){ let k = Math.floor(r / v); r -= k * v; while (k-- > 0 && out.length < 10) out.push(c); }
    if (!out.length && n > 0) out.push('#0ea5e9');
    return `<span class="pk-chips" aria-hidden="true">${out.reverse().map((c, i) => `<i style="--c:${c};--i:${i}"></i>`).join('')}</span>`;
  }

  function art(){
    const fan = (ids, dir) => ids.map((id, i) => { const x = dir * (78 + i * 20), r = dir * (10 + i * 8);
      return `<div class="fi" style="transform:translate(-50%,-50%) translate(${x}px,${i * 6}px) rotate(${r}deg);--r2:${r * 1.3}deg;--x2:${x * 1.3}px;--yy:${i * 6 - 4}px">${card(id, {cls:'sm'})}</div>`; }).join('');
    return `<div class="ab-art">${fan([3, 17, 29], -1)}${fan([44, 8, 49], 1)}
      <div class="fi ab-j" style="transform:translate(-50%,-50%) rotate(-5deg);--r2:-2deg;--x2:0px;--yy:-14px">${card(36, {cls:'lg'})}</div></div>`;
  }
  const rulesList = [
    ['Joker', 'The dealer turns up one card. Only its rank matters.'],
    ['Bets', 'Before the deal, everyone bets chips on Andar (inside) or Bahar (outside).'],
    ['Deal', 'Cards go one at a time to Andar, then Bahar, then Andar again, until a card of the joker’s rank appears. That side wins.'],
    ['Payouts', 'Andar gets the first card, so it pays 0.9 to 1 (bet 100, win 90). Bahar pays 1 to 1. Losing bets are lost.'],
    ['Chips', 'Everyone starts with the same play-money chips. Below 100 chips you can top up between rounds; top-ups are counted on the scoreboard.'],
  ];
  const rules = () => sheet(`<div class="eyebrow">How to play</div><h2>Andar Bahar rules</h2><ul class="rules">${rulesList.map(([k, v]) => `<li><b>${k}</b><span>${v}</span></li>`).join('')}</ul>
    <p class="muted">Play money only. Nothing here is real betting.</p><div class="acts"><button class="btn gold" data-do="closemodal">Got it</button></div>`);

  function home(){
    const saved = store.get('andarbahar-local');
    const locals = form.locals.map((n, i) => `<div class="row"><input class="grow" id="lp${i}" data-local="${i}" value="${esc(n)}" placeholder="Player ${i + 1}" maxlength="18" aria-label="Player ${i + 1} name" style="min-width:0;background:rgba(0,0,0,.28);border:1px solid var(--line);border-radius:12px;padding:11px 14px;color:var(--text);font:500 16px var(--body)">${form.locals.length > 1 ? `<button class="tool" data-do="lrem" data-i="${i}">Remove</button>` : ''}</div>`).join('');
    return `<div class="home">
      <button class="btn small backlink" data-do="hub">← All games</button>
      <section class="hero">
        <div>
          <div class="eyebrow">Inside or outside</div>
          <h1>Andar <em>Bahar</em></h1>
          <p>One joker, two piles and a single question: which side gets the match first? Fast rounds with play-money chips.</p>
          <div class="facts"><span class="fact"><b>1–12</b> players</span><span class="fact"><b>0.9 : 1</b> Andar</span><span class="fact"><b>1 : 1</b> Bahar</span><span class="fact"><b>Play</b> money</span></div>
        </div>
        <div class="fan" aria-hidden="true">${art()}</div>
      </section>
      <section class="panels">
        <div class="panel">
          <div class="eyebrow">Online</div><h2>Deal for friends</h2>
          <div class="field"><label for="nm">Your name</label><input id="nm" data-f="name" value="${esc(form.name)}" maxlength="18" placeholder="e.g. Priya" autocomplete="nickname"></div>
          ${net.ready ? `<button class="btn gold" data-do="host">Host a table</button>
          <div class="field"><label for="cd">Or join with a code</label><div class="row"><input id="cd" class="grow code-in" data-f="code" value="${esc(form.code)}" maxlength="5" placeholder="ABCDE" autocomplete="off"><button class="btn" data-do="join">Join</button></div></div>
          <p class="note">You deal; everyone bets from their own phone.</p>`
          : '<p class="note">Can’t reach the game server right now, so online play is off. Offline modes still work.</p>'}
        </div>
        <div class="panel">
          <div class="eyebrow">One device</div><h2>Play at one table</h2>
          <p>Everyone’s bets go on the same screen. Works solo too.</p>
          <div class="names">${locals}</div>
          <div class="row">${form.locals.length < 8 ? '<button class="btn small" data-do="ladd8">Add player</button>' : ''}<button class="btn gold" data-do="ablocal" style="margin-left:auto">Start</button></div>
          ${saved ? `<button class="btn small" data-do="abresume">Resume (${saved.players.map(p => esc(p.name)).join(', ')})</button>` : ''}
        </div>
        <div class="panel">
          <div class="eyebrow">New here?</div><h2>How it works</h2>
          <p>Bet on a side, the dealer flips a joker, then cards fall left and right until one matches. Andar pays 0.9 to 1, Bahar pays 1 to 1.</p>
          <button class="btn" data-do="rules">Read the rules</button>
        </div>
      </section>
    </div>`;
  }

  function view(s){
    const n = reveal(s), dealt = s.seq.slice(0, n), done = s.phase === 'done' && n >= s.seq.length;
    const dealer = mode === 'local' || isDealer(s, me);
    const lane = side => { const on = s.players.filter(p => (p.bet || (s.phase === 'done' ? p.prev : null))?.side === side).reduce((a, p) => a + (p.bet || p.prev).amt, 0);
      return `<div class="ab-row ${done && s.winner === side ? 'win' : done ? 'lose' : ''}" data-side="${side}">
      <div class="ab-label"><b>${SIDE[side]}</b><span>${side === 'andar' ? 'Inside · pays 0.9 : 1' : 'Outside · pays 1 : 1'}</span></div>
      <div class="ab-pot">${on ? stack(on) : ''}<span class="num">${on ? on.toLocaleString() : 'No bets'}</span></div>
      <div class="ab-cards">${dealt.filter(c => c.side === side).map((c, i, arr) => `<div class="ab-c" style="--r:${(rotOf(c.id) * .6).toFixed(1)}deg">${card(c.id, {cid:true, cls:`sm ${done && i === arr.length - 1 && s.winner === side ? 'hit' : ''}`})}</div>`).join('') || '<span class="ab-empty">Cards fall here</span>'}</div></div>`; };
    const players = [...s.players].sort((a, b) => b.chips - a.chips);
    const controls = p => {
      const st = stake[p.id] || Math.min(100, p.chips) || 0;
      if (s.phase !== 'bet') return p.prev && s.phase === 'done' ? `<span class="muted">Bet ${p.prev.amt} on ${SIDE[p.prev.side]}</span>` : '<span class="muted">No bet this round</span>';
      if (p.chips < 1) return `<button class="btn small gold" data-do="abtop" data-pid="${esc(p.id)}">Top up to ${s.cfg.start}</button>`;
      return `<div class="ab-ctrl">
        <div class="row ab-stakes">${[10, 50, 100, 250, 500].filter(v => v <= p.chips).concat(p.chips).filter((v, i, a) => a.indexOf(v) === i).map(v => `<button class="chipbtn ${v === st ? 'on' : ''}" data-do="abstake" data-pid="${esc(p.id)}" data-v="${v}">${v === p.chips ? 'All' : v}</button>`).join('')}</div>
        <div class="row"><button class="btn small ${p.bet?.side === 'andar' ? 'gold' : ''}" data-do="abbet" data-pid="${esc(p.id)}" data-side="andar">Andar ${st}</button><button class="btn small ${p.bet?.side === 'bahar' ? 'gold' : ''}" data-do="abbet" data-pid="${esc(p.id)}" data-side="bahar">Bahar ${st}</button>
          ${p.bet ? `<button class="tool" data-do="abclear" data-pid="${esc(p.id)}">Clear</button>` : p.prev && p.prev.amt <= p.chips ? `<button class="tool" data-do="abrepeat" data-pid="${esc(p.id)}">Same as last (${p.prev.amt} ${SIDE[p.prev.side]})</button>` : ''}
          ${p.chips < 100 ? `<button class="tool" data-do="abtop" data-pid="${esc(p.id)}">Top up</button>` : ''}</div></div>`;
    };
    const canAct = p => mode === 'local' || p.id === me;
    return `<div class="game"><div class="main">
      <header class="top">
        <div class="brand">Andar <em>Bahar</em></div>
        <div class="turn"><span style="padding-left:10px">Round <b>${s.round}</b> · ${s.phase === 'bet' ? 'bets open' : done ? `${SIDE[s.winner]} won` : 'dealing'}</span></div>
        <div class="tools">${s.code ? `<span class="codechip">${esc(s.code)}</span>` : ''}<button class="tool" data-do="rules">Rules</button><button class="tool" data-do="mute">${muted ? 'Sound off' : 'Sound on'}</button><button class="tool" data-do="leave">Leave</button></div>
      </header>
      <section class="ab-table">
        <div class="ab-head">
          <div class="ab-shoe" id="deck" aria-label="Dealer’s shoe"><div class="pc sm down"></div><span>Shoe</span></div>
          <div class="ab-joker ${s.joker != null ? 'up' : ''}">${s.joker != null ? card(s.joker, {cid:true, cls:'lg'}) : '<div class="pc lg down"></div>'}<span class="eyebrow">${s.joker != null ? 'Joker' : 'Joker after bets'}</span></div>
          <div class="ab-says"><b>${s.phase === 'bet' ? 'Place your bets' : done ? `${SIDE[s.winner]} wins` : 'Dealing…'}</b><span>${s.phase === 'bet' ? 'Pick a chip, then Andar or Bahar' : done ? `Card ${s.seq.length} matched the joker` : `${n} card${n === 1 ? '' : 's'} out`}</span></div>
        </div>
        <div class="ab-lanes">${lane('andar')}${lane('bahar')}</div>
      </section>
      <div class="ab-bar">
        <div class="ab-hist" aria-label="Recent winners">${s.history.map(h => `<span class="${h}">${h === 'andar' ? 'A' : 'B'}</span>`).join('') || '<span class="muted" style="background:none;width:auto">No rounds yet</span>'}</div>
        ${dealer ? (s.phase === 'bet' ? `<button class="btn gold" data-do="abdeal" ${s.players.some(p => p.bet) ? '' : 'disabled'}>Deal</button>` : `<button class="btn gold" data-do="abnext" ${done ? '' : 'disabled'}>Next round</button>`)
          : `<span class="muted">${s.phase === 'bet' ? 'Waiting for the dealer to deal' : 'Waiting for the next round'}</span>`}
      </div>
      <section class="ab-players">${players.map(p => `<article class="opp ${p.id === me && mode !== 'local' ? 'is-turn' : ''}" data-pid="${esc(p.id)}">
        <div class="opp-head">${avatar(s, p)}<div class="opp-name"><b>${esc(p.name)}${p.id === me && mode !== 'local' ? ' (you)' : ''}</b><small>${p.topups ? `${p.topups} top-up${p.topups > 1 ? 's' : ''}` : '&nbsp;'}</small></div>
          <div class="stat"><span class="num">${s.phase === 'done' && !done ? p.chips - (p.last || 0) : p.chips}</span><span>${done && p.last != null ? `<b class="${p.last > 0 ? 'up' : 'down'}">${p.last > 0 ? '+' : ''}${p.last}</b>` : p.bet ? `${p.bet.amt} on ${SIDE[p.bet.side]}` : 'chips'}</span></div></div>
        ${canAct(p) ? controls(p) : ''}</article>`).join('')}</section>
    </div></div>${ui.modal === 'rules' ? rules() : ''}`;
  }

  // On a shared device every player bets from the same screen, so moves are made on their behalf.
  const as = (pid, a) => { if (mode !== 'local') return send(a, true); const keep = me; me = pid; send(a, true); me = keep; render(); };
  Object.assign(H, {
    abstake:d => { stake[d.pid] = +d.v; render(); },
    abbet:d => { const p = P(viewState(), d.pid); as(d.pid, {t:'bet', side:d.side, amt:stake[d.pid] || Math.min(100, p.chips)}); },
    abrepeat:d => { const p = P(viewState(), d.pid); stake[d.pid] = p.prev.amt; as(d.pid, {t:'bet', side:p.prev.side, amt:p.prev.amt}); },
    abclear:d => as(d.pid, {t:'clear'}),
    abtop:d => as(d.pid, {t:'topup'}),
    abdeal:() => send({t:'deal'}, true),
    abnext:() => send({t:'next'}, true),
    ladd8:() => { if (form.locals.length < 8) form.locals.push(''); render(); },
    ablocal:() => {
      const names = form.locals.map(n => n.trim()).filter(Boolean);
      if (!names.length) return toast('Add at least one player name');
      mode = 'local'; ui = freshUI(); seenLog = -1;
      G = {...newGame(names.map((name, i) => ({id:'p' + i, name})), {game:'andarbahar'}), v:1};
      store.set('andarbahar-local', G); screen = 'game'; render();
    },
    abresume:() => { G = store.get('andarbahar-local'); if (!G) return; mode = 'local'; ui = freshUI(); seenLog = -1; screen = 'game'; render(); },
  });

  return {name:'Andar Bahar', motion, min:1, max:12, cfg, newGame, apply, home, view, rules, art, rank};
})();
ENG.andarbahar = AB;
