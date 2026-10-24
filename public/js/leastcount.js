/* =====================================================================
   LEAST COUNT — 7 cards each, one wild joker rank. On your turn throw one
   card or several of the same rank, then pick one card: from the closed
   deck, or the open card the previous player left. Call Show at the start
   of your turn with 10 points or less. Lowest hand wins the deal; a wrong
   Show costs 40. Reach the point limit and you're out; last player in wins.
   Cards 0..103 are up to two decks, 104 and 105 printed jokers.
   ===================================================================== */
const LC = (() => {
  const RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'], SUIT = ['♠', '♥', '♦', '♣'];
  const rank = id => id >= 104 ? 0 : id % 13 + 1;
  const isWild = (s, id) => id >= 104 || rank(id) === s.jr;
  const val = (s, id) => isWild(s, id) ? 0 : Math.min(10, rank(id));
  const total = (s, hand) => hand.reduce((a, id) => a + val(s, id), 0);
  const lbl = id => id >= 104 ? 'a joker' : RANK[rank(id)] + SUIT[Math.floor((id % 52) / 13)];
  const SHOW_MAX = 10, BAD_SHOW = 40, HAND = 7;
  const cfg = {limit:100};

  function newGame(seats, extra = {}){
    const c = {...cfg, ...(extra.cfg || {})}, totals = {...(extra.totals || {})}, round = (extra.round || 0) + 1;
    const s = {...extra, cfg:c, totals, round, phase:'play', gid:rid(8), ack:extra.ack || {}, log:[], ln:0, champion:null,
      players:seats.map(p => ({id:p.id, name:p.name, hand:[], out:(totals[p.id] || 0) >= c.limit, score:null})),
      deck:[], pile:[], step:'throw', avail:null, lastThrow:[], caller:null};
    const inPlay = s.players.filter(p => !p.out);
    const decks = inPlay.length > 4 ? 2 : 1;
    s.deck = shuffle([...Array(52 * decks).keys(), 104, 105]);
    for (let i = 0; i < HAND; i++) inPlay.forEach(p => p.hand.push(s.deck.pop()));
    s.joker = s.deck.pop(); s.jr = s.joker >= 104 ? 1 : rank(s.joker);
    s.pile = [s.deck.pop()]; s.avail = s.pile[0];
    s.turn = s.players.indexOf(inPlay[(round - 1) % inPlay.length]);
    log(s, `Deal ${round}. Wild joker: every ${RANK[s.jr]}${s.joker >= 104 ? ' (a printed joker was cut, so aces are wild)' : ''}`, 'turn');
    log(s, `${s.players[s.turn].name} starts`, 'turn');
    return s;
  }
  const alive = s => s.players.filter(p => !p.out);
  function nextTurn(s){
    let t = s.turn; do t = (t + 1) % s.players.length; while (s.players[t].out);
    s.turn = t; s.step = 'throw'; s.avail = s.pile.at(-1) ?? null;
    log(s, `${s.players[t].name}’s turn`, 'turn');
  }
  // Show: the caller wins the deal only with a strictly lower hand than everyone else.
  function show(s, caller){
    const others = alive(s).filter(p => p !== caller), low = Math.min(...others.map(p => total(s, p.hand)));
    const mine = total(s, caller.hand), good = mine < low;
    for (const p of alive(s)) p.score = p === caller ? (good ? 0 : BAD_SHOW) : (!good && total(s, p.hand) === low ? 0 : total(s, p.hand));
    for (const p of alive(s)){ s.totals[p.id] = (s.totals[p.id] || 0) + p.score; if (s.totals[p.id] >= s.cfg.limit) p.out = true; }
    s.caller = caller.id; s.good = good; s.phase = 'over';
    log(s, good ? `${caller.name} showed ${mine} and has the least count` : `${caller.name} showed ${mine}, but someone had ${low}. 40 point penalty`, 'big',
      {title:good ? 'Least count!' : 'Wrong show', sub:`${caller.name} · ${mine} points`});
    const left = s.players.filter(p => (s.totals[p.id] || 0) < s.cfg.limit);
    for (const p of s.players.filter(p => (s.totals[p.id] || 0) >= s.cfg.limit && p.score != null)) log(s, `${p.name} reached ${s.totals[p.id]} and is out`);
    if (left.length <= 1){
      const w = left[0] || [...s.players].sort((a, b) => s.totals[a.id] - s.totals[b.id])[0];
      s.champion = w.id;
      log(s, `${w.name} wins the match`, 'win', {title:`${w.name} wins the match!`, sub:`Last player under ${s.cfg.limit}`});
    }
  }
  function apply(s, pid, a){
    if (!a || typeof a !== 'object') return 'That move was not understood';
    const p = P(s, pid); if (!p) return 'You’re watching this game';
    if (s.phase !== 'play') return 'This deal is over';
    if (p !== s.players[s.turn]) return 'It’s not your turn';
    if (a.t === 'show'){
      if (s.step !== 'throw') return 'Show at the start of your turn, before throwing';
      const t = total(s, p.hand); if (t > SHOW_MAX) return `You can show with ${SHOW_MAX} points or less. You have ${t}`;
      return show(s, p);
    }
    if (a.t === 'throw'){
      if (s.step !== 'throw') return 'You already threw. Now pick a card';
      const ids = [...new Set(a.cards || [])];
      if (!ids.length || ids.some(id => !p.hand.includes(id))) return 'Select cards from your hand';
      if (ids.some(id => rank(id) !== rank(ids[0]))) return 'You can only throw cards of the same rank together';
      p.hand = p.hand.filter(id => !ids.includes(id)); s.pile.push(...ids); s.lastThrow = ids;
      s.matched = s.avail != null && rank(s.avail) === rank(ids[0]);
      log(s, `${p.name} threw ${ids.map(lbl).join(', ')}`);
      s.step = 'pick'; return;
    }
    if (a.t === 'pick'){
      if (s.step !== 'pick') return 'Throw a card first';
      if (a.from === 'skip'){
        if (!s.matched) return 'You can only skip picking when you threw the same rank as the open card';
        log(s, `${p.name} matched the open card and skipped picking`);
      } else if (a.from === 'open'){
        if (s.avail == null || !s.pile.includes(s.avail)) return 'There is no open card to pick';
        s.pile.splice(s.pile.indexOf(s.avail), 1); p.hand.push(s.avail); log(s, `${p.name} picked ${lbl(s.avail)}`);
      } else {
        if (!s.deck.length){ const keep = s.lastThrow; s.deck = shuffle(s.pile.filter(id => !keep.includes(id))); s.pile = [...keep]; log(s, 'The open pile was shuffled into a new deck'); }
        if (!s.deck.length) return 'No cards left to draw';
        p.hand.push(s.deck.pop()); log(s, `${p.name} drew from the deck`);
      }
      return nextTurn(s);
    }
    return 'That move was not understood';
  }
  const needs = s => s.phase === 'play' ? [s.players[s.turn].id] : [];

  /* ----- client ----- */
  const pc = (s, id, o) => RUM.pc(s, id, o);
  function art(){
    const cards = [[0, -16, -110, 16], [14, -6, -50, 2], [28, 4, 10, -4], [104, 14, 70, 4], [41, 24, 128, 20]];
    return `<div class="rummy-art" style="position:absolute;inset:0">${cards.map(([id, r, x, y]) => `<div class="fi" style="transform:translate(-50%,-50%) rotate(${r}deg) translate(${x * .55}px,${y * .9}px);--r2:${r * 1.25}deg;--x2:${x * .75}px;--yy:${y - 10}px">${pc(null, id)}</div>`).join('')}</div>`;
  }
  const rulesList = [
    ['Goal', 'Keep the lowest total in your hand. A is 1, 2–10 count their number, J Q K count 10. Jokers count 0.'],
    ['Jokers', 'One card is cut at the start; every card of that rank is a wild joker worth 0, plus the printed jokers.'],
    ['Your turn', 'Throw one card, or several cards of the same rank. Then pick one card: from the closed deck, or the open card the previous player left.'],
    ['Matching', 'If you throw the same rank as the open card, you may skip picking and keep your hand smaller.'],
    ['Show', 'At the start of your turn, with 10 points or less, you can call Show. Everyone reveals.'],
    ['Scoring', 'If you have the strictly lowest hand, you score 0 and everyone else scores their hand. If anyone ties or beats you, you take 40 and the lowest hand scores 0.'],
    ['Elimination', 'Reach the point limit (100 by default) and you’re out. The last player left wins the match.'],
  ];
  const rules = () => sheet(`<div class="eyebrow">How to play</div><h2>Least Count rules</h2><ul class="rules">${rulesList.map(([k, v]) => `<li><b>${k}</b><span>${v}</span></li>`).join('')}</ul>
    <div class="acts"><button class="btn gold" data-do="closemodal">Got it</button></div>`);

  function home(){
    const saved = store.get('leastcount-local');
    const locals = form.locals.map((n, i) => `<div class="row"><input class="grow" id="lp${i}" data-local="${i}" value="${esc(n)}" placeholder="Player ${i + 1}" maxlength="18" aria-label="Player ${i + 1} name" style="min-width:0;background:rgba(0,0,0,.28);border:1px solid var(--line);border-radius:12px;padding:11px 14px;color:var(--text);font:500 16px var(--body)">${form.locals.length > 2 ? `<button class="tool" data-do="lrem" data-i="${i}">Remove</button>` : ''}</div>`).join('');
    return `<div class="home">
      <button class="btn small backlink" data-do="hub">← All games</button>
      <section class="hero">
        <div>
          <div class="eyebrow">Lowest hand wins</div>
          <h1>Least <em>Count</em></h1>
          <p>Shed high cards, hoard jokers and call Show at the right moment. Call too early and it costs you 40.</p>
          <div class="facts"><span class="fact"><b>2–6</b> players</span><span class="fact"><b>7</b> cards each</span><span class="fact">Show at <b>10</b> or less</span><span class="fact">Out at <b>${cfg.limit}</b> (you choose)</span></div>
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
          <div class="field"><label for="lccaph">Players are out at</label><div class="row">${capInput('lccaph', 'limit', cfg.limit, [50, 100, 150, 200], 20, 1000)}<span class="muted">points</span></div></div>
          <div class="row">${form.locals.length < 6 ? '<button class="btn small" data-do="ladd6">Add player</button>' : ''}<button class="btn gold" data-do="lclocal" style="margin-left:auto">Start game</button></div>
          ${saved?.phase === 'play' ? `<button class="btn small" data-do="lcresume">Resume saved game (${saved.players.map(p => esc(p.name)).join(', ')})</button>` : ''}
        </div>
        <div class="panel">
          <div class="eyebrow">New here?</div><h2>How it works</h2>
          <p>Throw a card (or a pair, or more of the same rank), pick one up. When your hand is 10 or less, call Show and hope nobody is lower.</p>
          <button class="btn" data-do="rules">Read the rules</button>
        </div>
      </section>
    </div>`;
  }

  function view(s){
    const meP = P(s, me), cur = s.players[s.turn], myTurn = s.phase === 'play' && cur.id === me;
    const idx = s.players.findIndex(p => p.id === me);
    const opps = idx < 0 ? s.players : [...s.players.slice(idx + 1), ...s.players.slice(0, idx)];
    const pick = myTurn && s.step === 'pick';
    const openOk = pick && s.avail != null && s.pile.includes(s.avail);
    const on = mode === 'local' ? null : (() => { const l = live(); l.add(me); return l; })();
    let big, hint = '';
    if (s.phase === 'over') big = s.good ? `${esc(P(s, s.caller).name)} had the least count` : `${esc(P(s, s.caller).name)}’s show was wrong`;
    else if (myTurn){ big = s.step === 'throw' ? 'Throw a card' : 'Pick a card'; hint = s.step === 'throw' ? 'Select one card, or several of the same rank.' : 'Tap the closed deck or the open card.'; }
    else { big = `${esc(cur.name)} is playing`; hint = s.step === 'throw' ? 'Throwing' : 'Picking'; }
    return `<div class="game"><div class="main">
      <header class="top">
        <div class="brand">Least <em>Count</em></div>
        <div class="turn">${avatar(s, cur, 'sm')}<span><b>${myTurn ? 'Your' : esc(cur.name) + '’s'}</b> turn</span></div>
        <span class="sync">Deal ${s.round} · out at ${s.cfg.limit}</span>
        <div class="tools">${s.code ? `<span class="codechip">${esc(s.code)}</span>` : ''}<button class="tool" data-do="rules">Rules</button><button class="tool" data-do="mute">${muted ? 'Sound off' : 'Sound on'}</button><button class="tool" data-do="leave">Leave</button></div>
      </header>
      <section class="opps">${opps.map(p => `<article class="opp ${p.id === cur.id && s.phase === 'play' ? 'is-turn' : ''}" data-pid="${esc(p.id)}">
        <div class="opp-head">${avatar(s, p)}<div class="opp-name"><b>${esc(p.name)}</b><small><span class="dot ${!on || on.has(p.id) ? 'on' : ''}"></span>${p.out ? 'Out' : `<span class="backs">${'<i></i>'.repeat(Math.min(p.hand.length, 8))}</span>&nbsp;${p.hand.length} cards`}</small></div>
        <div class="stat"><span class="num">${s.totals[p.id] || 0}</span><span>of ${s.cfg.limit}</span></div></div>
        <span class="lc-bar" style="--p:${Math.min(100, (s.totals[p.id] || 0) / s.cfg.limit * 100)}%" aria-hidden="true"></span>
        ${p.out ? '<span class="chipst">Out</span>' : ''}</article>`).join('')}</section>
      <section class="rtable">
        <div class="pile" id="deck"><div class="card sm back ${pick ? 'canpick' : ''}" ${pick ? 'data-do="lcpick" data-from="deck" role="button" tabindex="0" aria-label="Draw from the closed deck"' : ''}></div><span class="num">${s.deck.length} left</span></div>
        <div class="pile">${s.avail != null && s.pile.includes(s.avail) ? pc(s, s.avail, {cid:true, cls:openOk ? 'canpick' : '', attrs:openOk ? 'data-do="lcpick" data-from="open" role="button" tabindex="0" aria-label="Pick the open card"' : ''}) : '<div class="card sm ghost"></div>'}<span>Open card</span></div>
        ${s.step === 'pick' && s.lastThrow.length ? `<div class="pile"><div class="lc-thrown">${s.lastThrow.map(id => pc(s, id, {cls:'sm'})).join('')}</div><span>Just thrown</span></div>` : ''}
        <div class="pile"><div class="jk">${pc(s, s.joker)}</div><span>Wild: every ${RANK[s.jr]}</span></div>
        <div class="status"><span class="big">${big}</span>${hint ? `<span class="hint">${hint}</span>` : ''}</div>
      </section>
      ${meP && !meP.out ? mine(s, meP, myTurn) : meP ? '<div class="spect">You’re out of this match. Watch the rest of the game.</div>' : '<div class="spect">You’re watching this game.</div>'}
    </div></div>${modal(s)}${curtain(s)}`;
  }
  function mine(s, meP, myTurn){
    const sel = (ui.lsel || []).filter(id => meP.hand.includes(id)), t = total(s, meP.hand);
    const hand = [...meP.hand].sort((a, b) => val(s, a) - val(s, b) || rank(a) - rank(b));
    const sameRank = sel.length && sel.every(id => rank(id) === rank(sel[0]));
    const acts = [];
    if (myTurn && s.step === 'throw'){
      acts.push(`<button class="btn gold" data-do="lcthrow" ${sameRank ? '' : 'disabled'}>Throw${sel.length > 1 ? ` ${sel.length}` : ''}</button>`);
      acts.push(`<button class="btn ${t <= SHOW_MAX ? 'danger' : ''}" data-do="lcshowask" ${t <= SHOW_MAX ? '' : 'disabled'}>Show (${t})</button>`);
    }
    if (myTurn && s.step === 'pick' && s.matched) acts.push('<button class="btn" data-do="lcpick" data-from="skip">Skip picking (matched)</button>');
    const hint = !meP.hand.length ? 'No cards left. Call Show on your turn.' : myTurn && s.step === 'throw' && sel.length && !sameRank ? 'Cards thrown together must be the same rank.' : t <= SHOW_MAX ? `${t} points. You can call Show at the start of your turn.` : `${t} points in hand. Show needs ${SHOW_MAX} or less.`;
    return `<section class="mine ${myTurn ? 'is-turn' : ''}" data-pid="${esc(me)}">
      <div class="mine-head">${avatar(s, meP)}<b>${esc(meP.name)}</b><span class="muted">(you) · ${s.totals[me] || 0} of ${s.cfg.limit}</span></div>
      <div class="rcards lc-hand">${hand.map(id => `<div class="rslot ${sel.includes(id) ? 'sel' : ''}">${pc(s, id, {cid:true, attrs:`data-do="lcsel" data-id="${id}" role="button" tabindex="0" aria-pressed="${sel.includes(id)}"`})}</div>`).join('')}</div>
      <div class="ractions"><span class="hint">${hint}</span>${acts.join('')}</div>
    </section>`;
  }
  function modal(s){
    if (ui.modal === 'rules') return rules();
    if (s.phase === 'over'){
      const next = mode === 'local' || mode === 'host', c = P(s, s.caller);
      const rows = [...s.players].sort((a, b) => (s.totals[a.id] || 0) - (s.totals[b.id] || 0));
      const champ = s.champion && P(s, s.champion);
      return sheet(`<div class="eyebrow">Deal ${s.round}</div><h2>${champ ? `${esc(champ.name)} wins the match!` : s.good ? `${esc(c.name)} had the least count` : `Wrong show by ${esc(c.name)}`}</h2>
        <div class="rres">${rows.map(p => `<div class="rr ${p.score === 0 && p.hand.length ? 'win' : ''}"><div style="min-width:0"><b>${esc(p.name)}</b> ${p.id === s.caller ? '<span class="chipst good">Show</span>' : ''} ${p.out ? '<span class="chipst">Out</span>' : ''}
          ${p.hand.length ? `<div class="mini-groups"><div>${p.hand.map(id => pc(s, id, {cls:'xs'})).join('')}</div></div>` : ''}</div>
          <span class="num">${p.score == null ? '–' : '+' + p.score}</span><span class="num muted">${s.totals[p.id] || 0} total</span></div>`).join('')}</div>
        <div class="acts"><button class="btn" data-do="leave">Back to menu</button>${next ? (champ ? '<button class="btn gold" data-do="lcnew">New match</button>' : '<button class="btn gold" data-do="again">Next deal</button>') : '<span class="muted">The host deals next.</span>'}</div>`);
    }
    if (ui.lshow){
      const t = total(s, P(s, me).hand);
      return sheet(`<div class="eyebrow">Show</div><h2>Call Show with ${t} points?</h2><p class="lede">If anyone has ${t} or less, you take a 40 point penalty.</p>
        <div class="acts"><button class="btn" data-do="lcshowx">Keep playing</button><button class="btn danger" data-do="lcshow">Show</button></div>`);
    }
    return '';
  }
  function curtain(s){
    if (mode !== 'local' || s.phase !== 'play' || ui.revealed === me) return '';
    const p = P(s, me);
    return `<div class="curtain"><div><div class="eyebrow">Pass the device</div><h2>${avatar(s, p)} ${esc(p.name)}</h2><p class="muted">Your turn</p><br><button class="btn gold" data-do="reveal">I’m ${esc(p.name)}. Show my cards</button></div></div>`;
  }

  Object.assign(H, {
    lcsel:d => { const id = +d.id, s = ui.lsel || []; ui.lsel = s.includes(id) ? s.filter(x => x !== id) : [...s, id]; render(); },
    lcthrow:() => { const hand = P(G, me)?.hand || [], cards = (ui.lsel || []).filter(id => hand.includes(id)); ui.lsel = []; send({t:'throw', cards}); },   // only send what the button shows: stale picks from earlier throws/deals made the server reject the throw
    lcpick:d => send({t:'pick', from:d.from}),
    lcshowask:() => { ui.lshow = true; render(); },
    lcshowx:() => { ui.lshow = false; render(); },
    lcshow:() => send({t:'show'}),
    lcnew:() => { G = {...G, totals:{}, round:0}; rematch(); },
    lclocal:() => {
      const names = form.locals.map(n => n.trim()).filter(Boolean);
      if (names.length < 2) return toast('Add at least two player names');
      mode = 'local'; ui = freshUI(); seenLog = -1;
      G = {...newGame(names.map((name, i) => ({id:'p' + i, name})), {game:'leastcount'}), v:1};
      store.set('leastcount-local', G); screen = 'game'; render();
    },
    lcresume:() => { G = store.get('leastcount-local'); if (!G) return; mode = 'local'; ui = freshUI(); seenLog = -1; screen = 'game'; render(); },
  });

  return {name:'Least Count', min:2, max:6, cfg, newGame, apply, needs, home, view, rules, art, total, val, rank,
    lobby:(s, host) => host
      ? `<div class="row"><label class="muted" for="lccap">Players are out at</label>${capInput('lccap', 'limit', s.cfg?.limit ?? cfg.limit, [50, 100, 150, 200], 20, 1000)}<span class="muted">points</span></div>`
      : `<p class="muted">Players are out at ${s.cfg?.limit || cfg.limit} points</p>`};
})();
ENG.leastcount = LC;
