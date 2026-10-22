/* =====================================================================
   RUMMY — 13-card Indian Rummy (points, one deal at a time, running totals).
   Cards 0..103 are two 52-card decks, 104 and 105 are printed jokers.
   ===================================================================== */
const RUM = (() => {
  const SUIT = ['♠', '♥', '♦', '♣'], RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const card = id => ({suit:Math.floor((id % 52) / 13), rank:id % 13 + 1});
  const isWild = (s, id) => id >= 104 || card(id).rank === s.jr;
  const pts = (s, id) => isWild(s, id) ? 0 : (r => r === 1 || r > 10 ? 10 : r)(card(id).rank);
  const lbl = id => id >= 104 ? 'a joker' : RANK[card(id).rank] + SUIT[card(id).suit];
  const consecutive = r => r.every((v, i) => !i || v === r[i - 1] + 1);
  const ranksOf = (cs, hi) => cs.map(c => c.rank === 1 && hi ? 14 : c.rank).sort((a, b) => a - b);

  // 'pure' = natural run, 'seq' = run using jokers, 'set' = same rank in different suits, null = not a valid meld.
  function classify(s, g){
    if (g.length < 3) return null;
    if (g.every(id => id < 104)){
      const cs = g.map(card);
      if (cs.every(c => c.suit === cs[0].suit) && [false, true].some(hi => consecutive(ranksOf(cs, hi)))) return 'pure';
    }
    const nat = g.filter(id => !isWild(s, id)).map(card);
    if (!nat.length) return 'seq';
    if (nat.every(c => c.suit === nat[0].suit) && [false, true].some(hi => { const r = ranksOf(nat, hi); return new Set(r).size === r.length && r.at(-1) - r[0] + 1 <= g.length; })) return 'seq';
    if (g.length <= 4 && nat.every(c => c.rank === nat[0].rank) && new Set(nat.map(c => c.suit)).size === nat.length) return 'set';
    return null;
  }
  function judge(s, groups){
    const kinds = groups.map(g => classify(s, g));
    const pure = kinds.filter(k => k === 'pure').length, seqs = kinds.filter(k => k === 'pure' || k === 'seq').length;
    return {kinds, pure, seqs, ok:kinds.every(Boolean) && pure >= 1 && seqs >= 2};
  }
  // No pure sequence: every card counts. Pure but no second sequence: all but the pure runs count. Otherwise only unmatched cards. Capped at 80.
  function score(s, groups){
    const {kinds, pure, seqs} = judge(s, groups);
    let t = 0;
    groups.forEach((g, i) => { const k = kinds[i]; if (!pure || (seqs < 2 ? k !== 'pure' : !k)) t += g.reduce((a, id) => a + pts(s, id), 0); });
    return Math.min(80, t);
  }
  const same = (a, b) => a.length === b.length && [...a].sort((x, y) => x - y).every((v, i) => v === [...b].sort((x, y) => x - y)[i]);
  const clean = gs => Array.isArray(gs) ? gs.filter(Array.isArray).map(g => g.filter(Number.isInteger)).filter(g => g.length) : [];

  function bestRun(ids){
    const by = new Map(); for (const id of ids){ const r = card(id).rank; if (!by.has(r)) by.set(r, id); if (r === 1 && !by.has(14)) by.set(14, id); }
    let best = null;
    for (let a = 1; a <= 12; a++){
      let b = a; while (by.has(b + 1) && b + 1 <= 14) b++;
      if (by.has(a) && b - a + 1 >= 3 && (!best || b - a > best[1] - best[0])) best = [a, b];
    }
    if (!best) return null;
    const out = []; for (let r = best[0]; r <= best[1]; r++) out.push(by.get(r));
    return new Set(out).size === out.length ? out : null;
  }
  // Greedy helper: pure runs, then natural sets, then joker-assisted melds, then leftovers by suit.
  function auto(s, hand){
    let rest = [...hand]; const out = [];
    const take = ids => { out.push(ids); rest = rest.filter(x => !ids.includes(x)); };
    for (let su = 0; su < 4; su++) for (let run; (run = bestRun(rest.filter(id => id < 104 && card(id).suit === su)));) take(run);
    for (let r = 1; r <= 13; r++){
      const by = new Map(); rest.filter(id => !isWild(s, id) && card(id).rank === r).forEach(id => { if (!by.has(card(id).suit)) by.set(card(id).suit, id); });
      if (by.size >= 3) take([...by.values()].slice(0, 4));
    }
    for (let j; (j = rest.find(id => isWild(s, id))) != null;){
      const nat = rest.filter(id => !isWild(s, id)); let hit = null;
      for (let i = 0; i < nat.length && !hit; i++) for (let k = i + 1; k < nat.length && !hit; k++) if (classify(s, [nat[i], nat[k], j])) hit = [nat[i], nat[k], j];
      if (!hit) break;
      take(hit);
    }
    for (const j of rest.filter(id => isWild(s, id))){ const g = out.find(g => classify(s, g) !== 'pure' && classify(s, [...g, j])); if (g){ g.push(j); rest = rest.filter(x => x !== j); } }
    return [...out, ...bySuit(s, rest)];
  }
  function bySuit(s, hand){
    const order = [0, 1, 3, 2], gs = order.map(su => hand.filter(id => id < 104 && !isWild(s, id) && card(id).suit === su).sort((a, b) => card(a).rank - card(b).rank));
    return [...gs, hand.filter(id => isWild(s, id))].filter(g => g.length);
  }

  function newGame(seats, extra = {}){
    const round = (extra.round || 0) + 1;
    const s = {...extra, phase:'play', gid:rid(8), round, totals:{...(extra.totals || {})}, ack:extra.ack || {},
      players:seats.map(p => ({id:p.id, name:p.name, hand:[], status:'in', drew:false, score:null, shown:false, groups:null})),
      deck:shuffle([...Array(106).keys()]), pile:[], step:'draw', declarer:null, log:[], ln:0};
    for (let i = 0; i < 13; i++) s.players.forEach(p => p.hand.push(s.deck.pop()));
    s.joker = s.deck.pop(); s.jr = s.joker >= 104 ? 1 : card(s.joker).rank;
    s.pile.push(s.deck.pop());
    s.turn = (round - 1) % s.players.length;
    log(s, `Deal ${round}. Wild joker: every ${RANK[s.jr]}${s.joker >= 104 ? ' (a printed joker was cut, so aces are wild)' : ''}`, 'turn');
    log(s, `${s.players[s.turn].name} starts`, 'turn');
    return s;
  }
  function finish(s){
    s.phase = 'over';
    const w = P(s, s.declarer);
    for (const p of s.players){
      if (p.score == null){ p.groups = auto(s, p.hand); p.score = score(s, p.groups); }
      s.totals[p.id] = (s.totals[p.id] || 0) + p.score;
    }
    const won = s.players.reduce((a, p) => a + (p === w ? 0 : p.score), 0);
    log(s, `${w.name} wins deal ${s.round} and collects ${won} points`, 'win', {title:`${w.name} wins!`, sub:`Deal ${s.round} · +${won} points`});
  }
  function advance(s){
    s.step = 'draw';
    const live = s.players.filter(p => p.status === 'in');
    if (live.length === 1){ const w = live[0]; s.declarer = w.id; w.score = 0; w.groups = auto(s, w.hand); return finish(s); }
    let t = s.turn; do t = (t + 1) % s.players.length; while (s.players[t].status !== 'in');
    s.turn = t;
    log(s, `${s.players[t].name}’s turn`, 'turn');
  }
  function needs(s){
    if (s.phase === 'play') return [s.players[s.turn].id];
    if (s.phase === 'show') return s.players.filter(p => p.status === 'in' && p.id !== s.declarer && !p.shown).map(p => p.id);
    return [];
  }
  function apply(s, pid, a){
    if (!a || typeof a !== 'object') return 'That move was not understood';
    const p = P(s, pid); if (!p) return 'You’re watching this game';
    if (s.phase === 'show'){
      if (a.t === 'force'){
        if (pid !== s.host) return 'Only the host can do that';
        for (const q of s.players) if (q.status === 'in' && q.id !== s.declarer && !q.shown){ q.groups = auto(s, q.hand); q.score = score(s, q.groups); q.shown = true; }
        return finish(s);
      }
      if (a.t !== 'show') return 'Waiting for everyone to show their cards';
      if (p.status !== 'in' || p.id === s.declarer || p.shown) return 'You have nothing to show';
      const gs = clean(a.groups); if (!same(gs.flat(), p.hand)) return 'Your groups must use exactly the cards in your hand';
      p.groups = gs; p.score = score(s, gs); p.shown = true;
      log(s, `${p.name} showed their cards: ${p.score} points`);
      if (!needs(s).length) finish(s);
      return;
    }
    if (s.phase !== 'play') return 'This deal is over';
    if (p !== s.players[s.turn]) return 'It’s not your turn';
    if (a.t === 'draw'){
      if (s.step !== 'draw') return 'You already picked a card. Now discard one';
      if (a.from === 'pile'){
        const top = s.pile.at(-1); if (top == null) return 'The open pile is empty';
        if (isWild(s, top)) return 'Jokers can’t be picked from the open pile';
        p.hand.push(s.pile.pop()); log(s, `${p.name} picked ${lbl(top)} from the open pile`);
      } else {
        if (!s.deck.length && s.pile.length > 1){ s.deck = shuffle(s.pile.splice(0, s.pile.length - 1)); log(s, 'The open pile was shuffled into a new deck'); }
        if (!s.deck.length) return 'No cards left to draw';
        p.hand.push(s.deck.pop()); log(s, `${p.name} drew from the deck`);
      }
      p.drew = true; s.step = 'discard'; return;
    }
    if (a.t === 'drop'){
      if (s.step !== 'draw') return 'You can only drop before picking a card';
      p.status = 'drop'; p.score = p.drew ? 40 : 20;
      log(s, `${p.name} dropped (${p.score} points)`, 'big', {title:'Dropped', sub:`${p.name} · ${p.score} points`});
      return advance(s);
    }
    if (a.t === 'discard' || a.t === 'declare'){
      if (s.step !== 'discard') return 'Pick a card first';
      if (!p.hand.includes(a.card)) return 'That card isn’t in your hand';
      const rest = p.hand.filter(x => x !== a.card);
      if (a.t === 'discard'){ p.hand = rest; s.pile.push(a.card); log(s, `${p.name} threw ${lbl(a.card)}`); return advance(s); }
      const gs = clean(a.groups);
      if (!same(gs.flat(), rest)) return 'Group all 13 of your other cards before declaring';
      p.hand = rest; s.pile.push(a.card); p.groups = gs;
      if (judge(s, gs).ok){
        p.score = 0; s.declarer = p.id; s.phase = 'show'; s.step = 'draw';
        log(s, `${p.name} declared a valid hand`, 'big', {title:'Rummy!', sub:`${p.name} declared`});
        if (!needs(s).length) finish(s);
        return;
      }
      p.status = 'out'; p.score = 80;
      log(s, `${p.name} made a wrong declaration (80 points)`, 'big', {title:'Wrong declaration', sub:`${p.name} · 80 points`});
      return advance(s);
    }
    return 'That move was not understood';
  }

  /* ----- client: each player arranges their own hand into groups ----- */
  let arr = {};
  function arrFor(s, pid){
    const hand = P(s, pid).hand, key = s.gid + pid;
    let g = arr[key] || bySuit(s, hand);
    g = g.map(x => x.filter(id => hand.includes(id))).filter(x => x.length);
    const seen = new Set(g.flat()), fresh = hand.filter(id => !seen.has(id));
    if (fresh.length) g.push(fresh);
    return arr[key] = g;
  }
  const setArr = (s, g) => { arr[s.gid + me] = g.filter(x => x.length); };
  const KL = {pure:'Pure sequence', seq:'Sequence', set:'Set'};
  function pc(s, id, o = {}){
    const at = `${o.cid ? `data-cid="${id}"` : ''} ${o.attrs || ''}`;
    if (id >= 104) return `<div class="pc joker ${o.cls || ''}" ${at}><span class="pr">★</span><span class="pj">JOKER</span></div>`;
    const c = card(id), w = s && isWild(s, id);
    return `<div class="pc ${c.suit === 1 || c.suit === 2 ? 'red' : ''} ${w ? 'wild' : ''} ${o.cls || ''}" ${at}><span class="pr">${RANK[c.rank]}<i>${SUIT[c.suit]}</i></span><span class="pbig">${SUIT[c.suit]}</span>${w ? '<span class="pw">J</span>' : ''}</div>`;
  }
  const miniGroups = (s, gs) => `<div class="mini-groups">${gs.map(g => `<div class="${classify(s, g) ? 'ok' : ''}">${g.map(id => pc(s, id, {cls:'xs'})).join('')}</div>`).join('')}</div>`;

  function art(){
    const cards = [[0, -18, -120, 18], [12 + 13, -7, -55, 2], [11 + 39, 3, 10, -6], [104, 13, 75, 4], [26 + 9, 23, 140, 22]];
    return `<div class="rummy-art" style="position:absolute;inset:0">${cards.map(([id, r, x, y]) => `<div class="fi" style="transform:translate(-50%,-50%) rotate(${r}deg) translate(${x * .55}px,${y * .9}px);--r2:${r * 1.25}deg;--x2:${x * .75}px;--yy:${y - 10}px">${pc(null, id)}</div>`).join('')}</div>`;
  }
  const rulesList = [
    ['Goal', 'Arrange all 13 cards into valid groups and declare first. You need at least two sequences, and one of them must be pure.'],
    ['Sequences', 'Three or more cards of one suit in a row, like 4♥ 5♥ 6♥. A pure sequence uses no jokers. Ace can go low (A 2 3) or high (Q K A).'],
    ['Sets', 'Three or four cards of the same rank in different suits, like 8♠ 8♥ 8♣. Jokers can fill in.'],
    ['Jokers', 'One card is cut at the start. Every card of that rank is a wild joker, plus the two printed jokers. Jokers can’t be picked from the open pile.'],
    ['Your turn', 'Pick a card from the closed deck or the open pile, then throw one card onto the open pile.'],
    ['Declare', 'With 14 cards in hand, select the card to throw away and press Declare. A wrong declaration costs 80 points.'],
    ['Drop', 'You can leave a deal before picking: 20 points if you haven’t picked any card yet, 40 points after.'],
    ['Scoring', 'After a valid declaration, everyone else shows their groups. A, K, Q, J score 10, number cards their value, jokers 0. Without a pure sequence every card counts; the most you can lose is 80. Lowest running total is ahead.'],
  ];
  const rules = () => sheet(`<div class="eyebrow">How to play</div><h2>13-card Rummy rules</h2><ul class="rules">${rulesList.map(([k, v]) => `<li><b>${k}</b><span>${v}</span></li>`).join('')}</ul>
    <div class="acts"><button class="btn gold" data-do="closemodal">Got it</button></div>`);

  function home(){
    const saved = store.get('rummy-local');
    const locals = form.locals.map((n, i) => `<div class="row"><input class="grow" id="lp${i}" data-local="${i}" value="${esc(n)}" placeholder="Player ${i + 1}" maxlength="18" aria-label="Player ${i + 1} name" style="min-width:0;background:rgba(0,0,0,.28);border:1px solid var(--line);border-radius:12px;padding:11px 14px;color:var(--text);font:500 16px var(--body)">${form.locals.length > 2 ? `<button class="tool" data-do="lrem" data-i="${i}">Remove</button>` : ''}</div>`).join('');
    return `<div class="home">
      <button class="btn small backlink" data-do="hub">← All games</button>
      <section class="hero">
        <div>
          <div class="eyebrow">13-card Indian Rummy</div>
          <h1>Rum<em>my</em></h1>
          <p>Build a pure sequence, bend the rest with the wild joker, and declare before anyone else. Lowest running score leads the table.</p>
          <div class="facts"><span class="fact"><b>2–6</b> players</span><span class="fact"><b>2</b> decks + jokers</span><span class="fact"><b>13</b> cards each</span><span class="fact"><b>80</b> point cap</span></div>
        </div>
        <div class="fan" aria-hidden="true">${art()}</div>
      </section>
      <section class="panels">
        <div class="panel">
          <div class="eyebrow">Online</div><h2>Play with friends</h2>
          <div class="field"><label for="nm">Your name</label><input id="nm" data-f="name" value="${esc(form.name)}" maxlength="18" placeholder="e.g. Priya" autocomplete="nickname"></div>
          ${net.ready ? `<button class="btn gold" data-do="host">Host a new table</button>
          <div class="field"><label for="cd">Or join with a code</label><div class="row"><input id="cd" class="grow code-in" data-f="code" value="${esc(form.code)}" maxlength="5" placeholder="ABCDE" autocomplete="off"><button class="btn" data-do="join">Join</button></div></div>`
          : '<p class="note">Can’t reach the game server right now, so online play is off. Offline modes still work.</p>'}
        </div>
        <div class="panel">
          <div class="eyebrow">One device</div><h2>Pass &amp; play</h2>
          <p>Hand the device around. Each hand stays hidden behind a pass screen.</p>
          <div class="names">${locals}</div>
          <div class="row">${form.locals.length < 6 ? '<button class="btn small" data-do="ladd6">Add player</button>' : ''}<button class="btn gold" data-do="rlocal" style="margin-left:auto">Start game</button></div>
          ${saved?.phase && saved.phase !== 'over' ? `<button class="btn small" data-do="rresume">Resume saved game (${saved.players.map(p => esc(p.name)).join(', ')})</button>` : ''}
        </div>
        <div class="panel">
          <div class="eyebrow">New here?</div><h2>How it works</h2>
          <p>Each turn: pick one card, throw one card. Group your hand into sequences and sets. Two sequences, one of them pure, and you can declare.</p>
          <button class="btn" data-do="rules">Read the rules</button>
        </div>
      </section>
    </div>`;
  }

  function view(s){
    const meP = P(s, me), cur = s.players[s.turn], myTurn = s.phase === 'play' && cur.id === me;
    const idx = s.players.findIndex(p => p.id === me);
    const opps = idx < 0 ? s.players : [...s.players.slice(idx + 1), ...s.players.slice(0, idx)];
    const top = s.pile.at(-1), canPick = myTurn && s.step === 'draw';
    const live = mode === 'local' ? null : live$();
    const status = p => p.status === 'drop' ? '<span class="chipst">Dropped</span>' : p.status === 'out' ? '<span class="chipst">Wrong declare</span>' : p.id === s.declarer ? '<span class="chipst good">Declared</span>' : s.phase === 'show' && !p.shown ? '<span class="chipst">Showing cards</span>' : '';
    let big, hint = '';
    const nd = needs(s);
    if (s.phase === 'over') big = `${esc(P(s, s.declarer).name)} wins the deal`;
    else if (s.phase === 'show'){ big = nd.includes(me) ? 'Arrange your cards and show them' : `Waiting for ${nd.map(id => esc(P(s, id).name)).join(', ')}`; hint = `${esc(P(s, s.declarer).name)} declared Rummy`; }
    else if (myTurn){ big = s.step === 'draw' ? 'Pick a card' : 'Throw a card or declare'; hint = s.step === 'draw' ? 'Tap the closed deck or the open pile.' : 'Select one card, then Discard or Declare.'; }
    else { big = `${esc(cur.name)} is playing`; hint = s.step === 'draw' ? 'Picking a card' : 'Choosing a card to throw'; }
    return `<div class="game"><div class="main">
      <header class="top">
        <div class="brand">Rum<em>my</em></div>
        <div class="turn">${avatar(s, cur, 'sm')}<span><b>${myTurn ? 'Your' : esc(cur.name) + '’s'}</b> turn</span></div>
        <span class="sync">Deal ${s.round}</span>
        <div class="tools">
          ${s.code ? `<span class="codechip">${esc(s.code)}</span>` : ''}
          <button class="tool" data-do="rules">Rules</button>
          <button class="tool" data-do="mute">${muted ? 'Sound off' : 'Sound on'}</button>
          <button class="tool" data-do="leave">Leave</button>
        </div>
      </header>
      <section class="opps">${opps.map(p => `<article class="opp ${p.id === cur.id && s.phase === 'play' ? 'is-turn' : ''}" data-pid="${esc(p.id)}">
        <div class="opp-head">${avatar(s, p)}<div class="opp-name"><b>${esc(p.name)}</b><small><span class="dot ${!live || live.has(p.id) ? 'on' : ''}"></span><span class="backs">${'<i></i>'.repeat(Math.min(p.hand.length, 8))}</span>&nbsp;${p.hand.length} cards</small></div>
        <div class="stat"><span class="num">${s.totals[p.id] || 0}</span><span>total pts</span></div></div>${status(p)}</article>`).join('')}</section>
      <section class="rtable">
        <div class="pile" id="deck"><div class="card sm back ${canPick ? 'canpick' : ''}" ${canPick ? 'data-do="rdraw" data-from="deck" role="button" tabindex="0" aria-label="Draw from the closed deck"' : ''}></div><span class="num">${s.deck.length} left</span></div>
        <div class="pile">${top != null ? pc(s, top, {cid:true, cls:canPick && !isWild(s, top) ? 'canpick' : '', attrs:canPick && !isWild(s, top) ? 'data-do="rdraw" data-from="pile" role="button" tabindex="0" aria-label="Pick the open card"' : ''}) : '<div class="card sm ghost"></div>'}<span>Open pile</span></div>
        <div class="pile"><div class="jk">${pc(s, s.joker)}</div><span>Wild: every ${RANK[s.jr]}</span></div>
        <div class="status"><span class="big">${big}</span>${hint ? `<span class="hint">${hint}</span>` : ''}</div>
      </section>
      ${meP ? mine(s, meP, myTurn) : '<div class="spect">You’re watching this game.</div>'}
    </div></div>${modal(s, meP)}${curtain(s)}`;
  }
  function mine(s, meP, myTurn){
    const groups = arrFor(s, me), sel = ui.rsel || [];
    const j = judge(s, groups), now = score(s, groups);
    const showing = s.phase === 'show' && needs(s).includes(me);
    const active = meP.status === 'in' && s.phase !== 'over';
    const acts = [];
    if (active){
      acts.push('<button class="btn small" data-do="rsort">Sort by suit</button>', '<button class="btn small" data-do="rauto">Auto arrange</button>');
      if (sel.length > 1) acts.push('<button class="btn small" data-do="rgroup">Group selected</button>');
    }
    if (myTurn && s.step === 'draw') acts.push(`<button class="btn small danger" data-do="rdropask">Drop (${meP.drew ? 40 : 20} pts)</button>`);
    if (myTurn && s.step === 'discard') acts.push(`<button class="btn gold" data-do="rdiscard" ${sel.length === 1 ? '' : 'disabled'}>Discard</button>`, `<button class="btn" data-do="rdeclare" ${sel.length === 1 ? '' : 'disabled'}>Declare</button>`);
    if (showing) acts.push(`<button class="btn gold" data-do="rshow">Show my cards (${now} pts)</button>`);
    if (s.phase === 'show' && mode === 'host') acts.push('<button class="btn small" data-do="rforce">Score everyone now</button>');
    const hint = !active ? (meP.status === 'drop' ? `You dropped this deal (${meP.score} points).` : meP.status === 'out' ? 'Wrong declaration. You’re out of this deal (80 points).' : '')
      : `${j.pure ? `${j.pure} pure` : 'No pure sequence yet'} · ${j.seqs} sequence${j.seqs === 1 ? '' : 's'} · ${now} points if the deal ended now`;
    return `<section class="mine ${myTurn ? 'is-turn' : ''}" data-pid="${esc(me)}">
      <div class="mine-head">${avatar(s, meP)}<b>${esc(meP.name)}</b><span class="muted">(you) · ${s.totals[me] || 0} total pts</span></div>
      <div class="rgroups">${groups.map((g, gi) => { const k = classify(s, g); return `<div class="rg k-${k}" data-rdrop="${gi}">
        <div class="rl ${k ? 'ok' : ''} ${k === 'pure' ? 'pure' : ''}">${k ? KL[k] : g.length < 3 ? 'Loose' : 'Not a meld'}${!k ? ` · ${g.reduce((a, id) => a + pts(s, id), 0)} pts` : ''}${sel.length && !sel.every(id => g.includes(id)) ? `<button class="tool" data-do="rmove" data-g="${gi}" style="min-height:24px;padding:2px 8px">Move here</button>` : ''}</div>
        <div class="rcards">${g.map(id => `<div class="rslot ${sel.includes(id) ? 'sel' : ''}" draggable="true" data-drag="${id}">${pc(s, id, {cid:true, attrs:`data-do="rsel" data-id="${id}" role="button" tabindex="0" aria-pressed="${sel.includes(id)}"`})}</div>`).join('')}</div>
      </div>`; }).join('')}
        ${active ? `<div class="rg newg" data-rdrop="new">${sel.length ? '<button class="btn small" data-do="rgroup">New group</button>' : 'Drag cards here for a new group'}</div>` : ''}</div>
      <div class="ractions"><span class="hint">${hint}</span>${acts.join('')}</div>
    </section>`;
  }
  function modal(s, meP){
    if (ui.modal === 'rules') return rules();
    if (s.phase === 'over'){
      const w = P(s, s.declarer), next = mode === 'local' || mode === 'host';
      const rows = [...s.players].sort((a, b) => a.score - b.score);
      return sheet(`<div class="eyebrow">Deal ${s.round} result</div><h2>${w.id === me && mode !== 'local' ? 'You win the deal!' : `${esc(w.name)} wins the deal`}</h2>
        <div class="rres">${rows.map(p => `<div class="rr ${p.id === w.id ? 'win' : ''}"><div style="min-width:0"><b>${esc(p.name)}</b> ${p.status !== 'in' ? `<span class="muted">${p.status === 'drop' ? 'dropped' : 'wrong declare'}</span>` : ''}${p.groups ? miniGroups(s, p.groups) : ''}</div>
          <span class="num">${p.id === w.id ? '0' : '+' + p.score}</span><span class="num muted">${s.totals[p.id] || 0} total</span></div>`).join('')}</div>
        <div class="acts"><button class="btn" data-do="leave">Back to menu</button>${next ? '<button class="btn gold" data-do="again">Next deal</button>' : '<span class="muted">The host deals the next round.</span>'}</div>`);
    }
    if (ui.rdecl != null && meP){
      const gs = arrFor(s, me).map(g => g.filter(id => id !== ui.rdecl)).filter(g => g.length), j = judge(s, gs);
      const why = j.ok ? 'Your hand is valid. Declare to win the deal.' : !j.pure ? 'You don’t have a pure sequence.' : j.seqs < 2 ? 'You need a second sequence.' : 'Some groups aren’t valid melds.';
      return sheet(`<div class="eyebrow">Declare</div><h2>${j.ok ? 'Ready to declare' : 'This hand isn’t valid yet'}</h2>
        <p class="lede">Throwing ${lbl(ui.rdecl)}. ${why}</p>${j.ok ? '' : '<p class="warn">Declaring anyway costs you 80 points and ends your deal.</p>'}
        ${miniGroups(s, gs)}
        <div class="acts"><button class="btn" data-do="rdeclx">Cancel</button><button class="btn ${j.ok ? 'gold' : 'danger'}" data-do="rdeclgo">${j.ok ? 'Declare' : 'Declare anyway'}</button></div>`);
    }
    if (ui.rdrop && meP) return sheet(`<div class="eyebrow">Drop</div><h2>Leave this deal?</h2><p class="lede">You’ll take ${meP.drew ? 40 : 20} points and sit out until the next deal.</p>
      <div class="acts"><button class="btn" data-do="rdropx">Keep playing</button><button class="btn danger" data-do="rdropgo">Drop</button></div>`);
    return '';
  }
  function curtain(s){
    if (mode !== 'local' || s.phase === 'over' || ui.revealed === me) return '';
    const p = P(s, me); if (!p) return '';
    const why = s.phase === 'show' ? `${esc(P(s, s.declarer).name)} declared. Show your cards` : 'Your turn';
    return `<div class="curtain"><div><div class="eyebrow">Pass the device</div><h2>${avatar(s, p)} ${esc(p.name)}</h2><p class="muted">${why}</p><br><button class="btn gold" data-do="reveal">I’m ${esc(p.name)}. Show my cards</button></div></div>`;
  }
  const live$ = () => { const l = live(); l.add(me); return l; };
  const selected = () => ui.rsel || [];
  const moveSel = (s, target, ids) => {
    let g = arrFor(s, me).map(x => x.filter(id => !ids.includes(id)));
    if (target === 'new') g.push(ids); else g[target]?.push(...ids);
    setArr(s, g); ui.rsel = []; render();
  };

  Object.assign(H, {
    rdraw:d => send({t:'draw', from:d.from}),
    rsel:d => { const id = +d.id, s = selected(); ui.rsel = s.includes(id) ? s.filter(x => x !== id) : [...s, id]; render(); },
    rgroup:() => moveSel(viewState(), 'new', selected()),
    rmove:d => moveSel(viewState(), +d.g, selected()),
    rsort:() => { const s = viewState(); setArr(s, bySuit(s, P(s, me).hand)); render(); },
    rauto:() => { const s = viewState(); setArr(s, auto(s, P(s, me).hand)); render(); },
    rdiscard:() => { const sel = selected(); if (sel.length !== 1) return toast('Select one card to throw'); send({t:'discard', card:sel[0]}); },
    rdeclare:() => { const sel = selected(); if (sel.length !== 1) return toast('Select the card to throw away'); ui.rdecl = sel[0]; render(); },
    rdeclx:() => { ui.rdecl = null; render(); },
    rdeclgo:() => { const s = viewState(), c = ui.rdecl; send({t:'declare', card:c, groups:arrFor(s, me).map(g => g.filter(id => id !== c)).filter(g => g.length)}); },
    rdropask:() => { ui.rdrop = true; render(); },
    rdropx:() => { ui.rdrop = false; render(); },
    rdropgo:() => send({t:'drop'}),
    rshow:() => send({t:'show', groups:arrFor(viewState(), me)}),
    rforce:() => send({t:'force'}),
    ladd6:() => { if (form.locals.length < 6) form.locals.push(''); render(); },
    rlocal:() => {
      const names = form.locals.map(n => n.trim()).filter(Boolean);
      if (names.length < 2) return toast('Add at least two player names');
      mode = 'local'; ui = freshUI(); seenLog = -1; arr = {};
      G = {...newGame(names.map((name, i) => ({id:'p' + i, name})), {game:'rummy'}), v:1};
      store.set('rummy-local', G); screen = 'game'; render();
    },
    rresume:() => { G = store.get('rummy-local'); if (!G) return; mode = 'local'; ui = freshUI(); seenLog = -1; screen = 'game'; render(); },
  });
  app.addEventListener('dragover', e => { if (GID !== 'rummy') return; const z = e.target.closest('[data-rdrop]'); if (z){ e.preventDefault(); z.classList.add('over'); } });
  app.addEventListener('dragleave', e => { if (GID === 'rummy') e.target.closest('[data-rdrop]')?.classList.remove('over'); });
  app.addEventListener('drop', e => {
    if (GID !== 'rummy') return;
    const z = e.target.closest('[data-rdrop]'); if (!z) return;
    e.preventDefault();
    const id = +e.dataTransfer.getData('text/plain'); if (Number.isNaN(id)) return;
    const ids = selected().includes(id) ? selected() : [id];
    moveSel(viewState(), z.dataset.rdrop === 'new' ? 'new' : +z.dataset.rdrop, ids);
  });

  return {name:'Rummy', min:2, max:6, newGame, apply, needs, home, view, rules, art, classify, judge, score, auto, bySuit, card, isWild, pc};
})();
ENG.rummy = RUM;
