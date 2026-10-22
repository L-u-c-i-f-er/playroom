/* =====================================================================
   UNO and UNO FLIP — Mattel's rules. Classic: 108 cards. Flip: 112 two-sided
   cards; a Flip card turns over the hands, draw pile and discard pile to the
   harsher Dark Side (and back). Match the top card by color, number or symbol,
   or play a Wild; otherwise draw one and play it if you can. Wild Draw Four
   (Flip: Wild Draw Two / Wild Draw Color) may be bluffed and challenged.
   Forget to call UNO and get caught: draw 2. First out scores the cards left
   in everyone else's hand; first to the target (500) wins the match.
   ===================================================================== */
const UCOL = [{name:'Red', hex:'#d8352a'}, {name:'Yellow', hex:'#f2c21b'}, {name:'Green', hex:'#2e9b48'}, {name:'Blue', hex:'#1f6bd0'},
  {name:'Pink', hex:'#e0438c'}, {name:'Teal', hex:'#109f9f'}, {name:'Orange', hex:'#f0781a'}, {name:'Purple', hex:'#7a3bc9'}];
function makeUno(flip){
  const NAME = {skip:'Skip', rev:'Reverse', d1:'Draw One', d2:'Draw Two', d5:'Draw Five', skipall:'Skip Everyone', flip:'Flip',
    wild:'Wild', wd4:'Wild Draw Four', wd2:'Wild Draw Two', wdc:'Wild Draw Color'};
  const GLY = {skip:'⊘', rev:'⇄', d1:'+1', d2:'+2', d5:'+5', skipall:'⊘', flip:'⇅', wild:'', wd4:'+4', wd2:'+2', wdc:'+?'};
  const SUB = {skipall:'ALL', flip:'FLIP', wild:'WILD', wdc:'COLOR'};
  const PTS = {d1:10, d2:20, d5:20, skip:20, rev:20, flip:20, skipall:30, wild:flip ? 40 : 50, wd4:50, wd2:50, wdc:60};
  const ORD = [...'0123456789', 'd1', 'd2', 'd5', 'skip', 'skipall', 'rev', 'flip', 'wild', 'wd2', 'wd4', 'wdc'];
  const DRAWS = {wd4:4, wd2:2};
  // One side of the deck: two of each 1–9 and each action per color (plus one 0 in classic), and four of each wild.
  const faces = (cols, acts, wilds, zero) => {
    const out = [];
    for (const c of cols){ if (zero) out.push({c, v:'0'}); for (const v of [...'123456789', ...acts]) out.push({c, v}, {c, v}); }
    for (const v of wilds) for (let k = 0; k < 4; k++) out.push({c:null, v});
    return out;
  };
  const light = flip ? faces([0, 1, 2, 3], ['d1', 'rev', 'skip', 'flip'], ['wild', 'wd2']) : faces([0, 1, 2, 3], ['skip', 'rev', 'd2'], ['wild', 'wd4'], true);
  const dark = flip ? faces([4, 5, 6, 7], ['d5', 'rev', 'skipall', 'flip'], ['wild', 'wdc']) : light;
  // Each Flip card has a fixed Dark Side: a seeded shuffle pairs the sides the same way on every device.
  if (flip){ let seed = 20190706; for (let i = dark.length - 1; i > 0; i--){ seed = seed * 16807 % 2147483647; const j = seed % (i + 1); [dark[i], dark[j]] = [dark[j], dark[i]]; } }
  const CARDS = light.map((f, i) => [f, dark[i]]);
  const cfg = {target:500};
  const TARGETS = [[1, 'one round'], [200, '200 points'], [300, '300 points'], [500, '500 points']];
  const face = (s, id) => CARDS[id][s.side];
  const label = f => f.c == null ? NAME[f.v] : `${UCOL[f.c].name} ${NAME[f.v] || f.v}`;
  const pts = f => PTS[f.v] ?? +f.v;
  const colors = s => s.side ? [4, 5, 6, 7] : [0, 1, 2, 3];
  const seat = (s, i, k) => { const n = s.players.length; return ((i + s.dir * k) % n + n) % n; };
  const canPlay = (s, id) => { const f = face(s, id); return f.c == null || s.color == null || f.c === s.color || f.v === face(s, s.pile.at(-1)).v; };

  function newGame(seats, extra = {}){
    const c = {...cfg, ...(extra.cfg || {})}, totals = {...(extra.totals || {})}, round = (extra.round || 0) + 1;
    const s = {...extra, cfg:c, totals, round, phase:'play', gid:rid(8), ack:extra.ack || {}, log:[], ln:0, champion:null, winner:null, gain:0,
      players:seats.map(p => ({id:p.id, name:p.name, hand:[], unoMiss:false, score:null})),
      deck:shuffle([...CARDS.keys()]), pile:[], side:0, dir:1, color:null, step:'play', drawn:null, pend:null};
    for (let i = 0; i < 7; i++) s.players.forEach(p => p.hand.push(s.deck.pop()));
    const dealer = (round - 1) % s.players.length;
    // A Wild Draw Four / Wild Draw Two (or a Flip) can't start the pile: it goes back into the deck.
    let top; while (['wd4', 'wd2', 'flip'].includes(CARDS[top = s.deck.pop()][0].v)) s.deck.splice(Math.random() * s.deck.length | 0, 0, top);
    s.pile = [top];
    const f = face(s, top);
    log(s, `Round ${round}. ${s.players[dealer].name} deals and turns up ${f.c == null ? 'a Wild: play any card' : label(f)}`, 'turn');
    if (f.v === 'rev'){ s.dir = -1; s.color = f.c; s.turn = dealer; log(s, `Reverse: ${s.players[dealer].name} starts`); }
    else effect(s, dealer, f, null);
    return s;
  }
  function drawOne(s){
    if (!s.deck.length && s.pile.length > 1){ const top = s.pile.pop(); s.deck = shuffle(s.pile); s.pile = [top]; log(s, 'The discard pile was shuffled into a new draw pile'); }
    return s.deck.length ? s.deck.pop() : null;
  }
  function drawN(s, p, n){
    let k = 0; for (; k < n; k++){ const id = drawOne(s); if (id == null) break; p.hand.push(id); }
    log(s, `${p.name} draws ${k}`);
  }
  function drawUntil(s, p, c){
    let k = 0;
    for (;;){ const id = drawOne(s); if (id == null) break; p.hand.push(id); k++; if (face(s, id).c === c) break; }
    log(s, `${p.name} drew ${k} card${k === 1 ? '' : 's'} to find ${UCOL[c].name}`);
  }
  function penalty(s, p, pd, extra){
    if (pd.v === 'wdc'){ drawUntil(s, p, pd.color); if (extra) drawN(s, p, extra); }
    else drawN(s, p, DRAWS[pd.v] + extra);
  }
  // Turn the whole game over: discard pile (the Flip card ends up at the bottom), draw pile and hands.
  function flipOver(s){
    s.side ^= 1; s.pile.reverse(); s.deck.reverse();
    s.color = face(s, s.pile.at(-1)).c;
    log(s, `Flip! Now playing the ${s.side ? 'Dark' : 'Light'} Side${s.color == null ? '. A Wild is on top: any card can be played' : ''}`, 'big',
      {title:'Flip!', sub:s.side ? 'Dark Side up' : 'Light Side up'});
  }
  // What a card does once it lands (player at seat i), and whose turn is next.
  function effect(s, i, f, color){
    s.color = f.c ?? color ?? null;
    const nx = s.players[seat(s, i, 1)];
    switch (f.v){
      case 'rev': s.dir = -s.dir; log(s, s.players.length === 2 ? `${nx.name} is skipped` : 'Play reverses'); s.turn = s.players.length === 2 ? i : seat(s, i, 1); break;
      case 'skip': log(s, `${nx.name} is skipped`); s.turn = seat(s, i, 2); break;
      case 'skipall': log(s, `Everyone is skipped. ${s.players[i].name} plays again`); s.turn = i; break;
      case 'd1': case 'd2': case 'd5': drawN(s, nx, +f.v[1]); s.turn = seat(s, i, 2); break;
      case 'flip': flipOver(s); s.turn = seat(s, i, 1); break;
      default: s.turn = seat(s, i, 1);
    }
  }
  function endRound(s, w){
    s.phase = 'over'; s.winner = w.id;
    for (const p of s.players) p.score = p.hand.reduce((t, id) => t + pts(face(s, id)), 0);
    s.gain = s.players.reduce((t, p) => t + p.score, 0);
    s.totals[w.id] = (s.totals[w.id] || 0) + s.gain;
    if (s.cfg.target <= 1 || s.totals[w.id] >= s.cfg.target){
      s.champion = w.id;
      log(s, `${w.name} went out, scores ${s.gain} and wins the match`, 'win', {title:`${w.name} wins!`, sub:`${s.totals[w.id]} points`});
    } else log(s, `${w.name} went out and scores ${s.gain}`, 'big', {title:`${w.name} wins the round`, sub:`+${s.gain} points`});
  }
  const clearMiss = s => s.players.forEach(p => { p.unoMiss = false; });

  function apply(s, pid, a){
    if (!a || typeof a !== 'object') return 'That move was not understood';
    const p = P(s, pid); if (!p) return 'You’re watching this game';
    if (s.phase !== 'play') return 'This round is over';
    const i = s.players.indexOf(p);
    // Anyone may catch a player who went down to one card without calling UNO, until the next player acts.
    if (a.t === 'catch'){
      const t = P(s, a.target);
      if (!t || t === p) return 'Pick another player to catch';
      if (!t.unoMiss || t.hand.length !== 1) return `${t.name} is safe`;
      t.unoMiss = false; log(s, `${p.name} caught ${t.name} without UNO`, 'big', {title:'Caught!', sub:`${t.name} forgot to call UNO · draws 2`});
      return drawN(s, t, 2);
    }
    if (a.t === 'uno'){
      if (!p.unoMiss || p.hand.length !== 1) return 'Call UNO when you play your second-to-last card';
      p.unoMiss = false; return log(s, `${p.name}: UNO!`, 'big', {title:'UNO!', sub:p.name});
    }
    const pd = s.pend;
    if (pd){
      if (pid !== pd.victim) return `Waiting for ${P(s, pd.victim).name}`;
      if (a.t !== 'accept' && a.t !== 'challenge') return 'Draw the cards or challenge first';
      clearMiss(s); s.pend = null;
      const by = P(s, pd.by);
      if (a.t === 'accept'){ penalty(s, p, pd, 0); s.turn = seat(s, i, 1); }
      else if (pd.legal){
        log(s, `${p.name} challenged, but ${by.name} had no ${pd.prev == null ? 'matching' : UCOL[pd.prev].name} card`, 'big', {title:'Challenge failed', sub:`${p.name} draws extra`});
        penalty(s, p, pd, 2); s.turn = seat(s, i, 1);
      } else {
        log(s, `${p.name} challenged: ${by.name} had a ${UCOL[pd.prev].name} card`, 'big', {title:'Challenge won', sub:`${by.name} draws instead`});
        penalty(s, by, pd, 0); s.turn = i;
      }
      return;
    }
    if (i !== s.turn) return 'It’s not your turn';
    if (a.t === 'draw'){
      if (s.step !== 'play') return 'You already drew. Play that card or keep it';
      clearMiss(s);
      const id = drawOne(s);
      if (id == null){ log(s, `${p.name} has nothing to draw and passes`); s.turn = seat(s, i, 1); return; }
      p.hand.push(id);
      if (!canPlay(s, id)){ log(s, `${p.name} drew a card and passes`); s.turn = seat(s, i, 1); return; }
      log(s, `${p.name} drew a card`); s.step = 'drawn'; s.drawn = id; return;
    }
    if (a.t === 'pass'){
      if (s.step !== 'drawn') return 'Play a card or draw one';
      log(s, `${p.name} keeps the card`); s.step = 'play'; s.drawn = null; s.turn = seat(s, i, 1); return;
    }
    if (a.t === 'play'){
      const id = a.card;
      if (!p.hand.includes(id)) return 'That card isn’t in your hand';
      if (s.step === 'drawn' && id !== s.drawn) return 'After drawing you can only play the card you drew';
      if (!canPlay(s, id)) return `That doesn’t match. Play ${s.color == null ? 'any card' : `a ${UCOL[s.color].name} card`}, a ${label(face(s, s.pile.at(-1))).replace(/^\S+ /, '')} or a Wild`;
      const f = face(s, id);
      if (f.c == null && !colors(s).includes(a.color)) return 'Choose a color';
      clearMiss(s);
      const prev = s.color;
      p.hand.splice(p.hand.indexOf(id), 1); s.pile.push(id); s.step = 'play'; s.drawn = null;
      log(s, `${p.name} played ${label(f)}${f.c == null ? ` and chose ${UCOL[a.color].name}` : ''}`);
      if (p.hand.length === 1){ if (a.uno) log(s, `${p.name}: UNO!`, 'big', {title:'UNO!', sub:p.name}); else p.unoMiss = true; }
      if (f.v in DRAWS || f.v === 'wdc'){
        s.color = a.color;
        const v = seat(s, i, 1);
        // Only legal with no card of the color that was in play; it can still be bluffed, and challenged.
        const card = {by:pid, victim:s.players[v].id, v:f.v, color:a.color, prev, legal:prev == null || !p.hand.some(x => face(s, x).c === prev)};
        if (!p.hand.length){ penalty(s, s.players[v], card, 0); return endRound(s, p); }
        s.pend = card; s.turn = v; return;
      }
      effect(s, i, f, a.color);
      if (!p.hand.length) endRound(s, p);
      return;
    }
    return 'That move was not understood';
  }
  const needs = s => s.phase === 'play' ? [s.pend ? s.pend.victim : s.players[s.turn].id] : [];

  /* ----- client ----- */
  function uc(s, id, o = {}){
    const f = CARDS[id][o.side ?? s?.side ?? 0], dk = (o.side ?? s?.side ?? 0) === 1;
    const g = GLY[f.v] ?? f.v, sub = SUB[f.v] || '';
    return `<div class="uc ${dk ? 'dark' : ''} ${f.c == null ? 'wild' : ''} ${o.cls || ''}" style="--uc:${f.c == null ? '#141416' : UCOL[f.c].hex}" ${o.cid ? `data-cid="${id}"` : ''} ${o.attrs || ''} title="${label(f)}">
      <span class="ucn">${g || 'W'}</span><span class="uco"><b class="${g.length > 2 ? 'w' : ''}">${g}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="ucn r">${g || 'W'}</span></div>`;
  }
  const find = (sd, c, v) => CARDS.findIndex(fc => fc[sd].c === c && fc[sd].v === v);
  function art(){
    const cards = flip ? [[find(0, 0, '7'), 0, -16, -110, 16], [find(0, 3, 'flip'), 0, -6, -50, 2], [find(1, null, 'wdc'), 1, 4, 10, -4], [find(1, 4, 'd5'), 1, 14, 70, 4], [find(1, 5, 'skipall'), 1, 24, 128, 20]]
      : [[find(0, 0, '7'), 0, -16, -110, 16], [find(0, 3, 'rev'), 0, -6, -50, 2], [find(0, null, 'wild'), 0, 4, 10, -4], [find(0, 1, 'd2'), 0, 14, 70, 4], [find(0, 2, 'skip'), 0, 24, 128, 20]];
    return `<div class="uno-art" style="position:absolute;inset:0">${cards.map(([id, sd, r, x, y]) => `<div class="fi" style="transform:translate(-50%,-50%) rotate(${r}deg) translate(${x * .55}px,${y * .9}px);--r2:${r * 1.25}deg;--x2:${x * .75}px;--yy:${y - 10}px">${uc(null, id, {side:sd})}</div>`).join('')}</div>`;
  }
  const rulesList = flip ? [
    ['Goal', 'Be first to play every card in your hand. You score the cards left in everyone else’s hand; first to 500 wins the match.'],
    ['Two sides', 'Every card has a Light Side and a Dark Side. You start on the Light Side. You can see the other side of everyone else’s cards and of the top card of the draw pile.'],
    ['Your turn', 'Match the top card by color, number or symbol, or play a Wild. You may also choose to draw instead.'],
    ['Drawing', 'Draw one card. If it can be played you may play it right away; otherwise your turn ends. You can’t play another card after drawing.'],
    ['Light Side', 'Draw One: next player draws 1 and misses their turn. Skip: next player misses a turn. Reverse: play changes direction (with two players it works like Skip).'],
    ['Dark Side', 'Draw Five: next player draws 5 and misses their turn. Skip Everyone: everyone misses a turn and you play again. Reverse works the same.'],
    ['Flip', 'Everything turns over: the discard pile (the Flip card ends up at the bottom), the draw pile and every hand. Play the new side until someone flips again. If a Wild comes up on top, any card can be played.'],
    ['Wilds', 'Wild: pick the next color, any time. Wild Draw Two (light): pick a color, next player draws 2 and misses a turn. Wild Draw Color (dark): next player draws until they get the color you picked and misses a turn.'],
    ['Challenges', 'Wild Draw Two and Wild Draw Color are only allowed when you have no card of the color in play, but you can bluff. If challenged and guilty you draw instead; if innocent the challenger draws 2 extra and misses their turn.'],
    ['UNO', 'Call UNO before playing your second-to-last card. If someone catches you before the next player acts, you draw 2.'],
    ['Scoring', 'Count the side the round ended on. Numbers: face value. Draw One 10. Draw Five, Reverse, Skip, Flip 20. Skip Everyone 30. Wild 40. Wild Draw Two 50. Wild Draw Color 60.'],
  ] : [
    ['Goal', 'Be first to play every card in your hand. You score the cards left in everyone else’s hand; first to 500 wins the match.'],
    ['Your turn', 'Match the top card by color, number or symbol, or play a Wild. You may also choose to draw instead.'],
    ['Drawing', 'Draw one card. If it can be played you may play it right away; otherwise your turn ends. You can’t play another card after drawing.'],
    ['Action cards', 'Skip: next player misses a turn. Reverse: play changes direction (with two players it works like Skip). Draw Two: next player draws 2 and misses their turn.'],
    ['Wild', 'Pick the color that continues play. Playable on any turn.'],
    ['Wild Draw Four', 'Pick a color; the next player draws 4 and misses their turn. Only allowed when you have no card of the color in play, but you can bluff.'],
    ['Challenge', 'The player hit by a Wild Draw Four may challenge. If you had a matching color, you draw 4 instead and they play. If you didn’t, they draw 6 and miss their turn.'],
    ['First card', 'A Wild Draw Four goes back into the deck. Skip, Reverse and Draw Two count against the first player; Reverse means the dealer starts. A Wild lets the first player play anything.'],
    ['UNO', 'Call UNO before playing your second-to-last card. If someone catches you before the next player acts, you draw 2.'],
    ['No stacking', 'You can’t answer a Draw Two or Wild Draw Four with another one: Mattel’s official rules don’t allow stacking.'],
    ['Scoring', 'Numbers: face value. Skip, Reverse, Draw Two: 20. Wild and Wild Draw Four: 50.'],
  ];
  const title = flip ? 'UNO <em>Flip</em>' : '<em>UNO</em>';
  const rules = () => sheet(`<div class="eyebrow">How to play</div><h2>${flip ? 'UNO Flip' : 'UNO'} rules</h2><ul class="rules">${rulesList.map(([k, v]) => `<li><b>${k}</b><span>${v}</span></li>`).join('')}</ul>
    <div class="acts"><button class="btn gold" data-do="closemodal">Got it</button></div>`);

  function home(){
    const saved = store.get(GID + '-local');
    const locals = form.locals.map((n, i) => `<div class="row"><input class="grow" id="lp${i}" data-local="${i}" value="${esc(n)}" placeholder="Player ${i + 1}" maxlength="18" aria-label="Player ${i + 1} name" style="min-width:0;background:rgba(0,0,0,.28);border:1px solid var(--line);border-radius:12px;padding:11px 14px;color:var(--text);font:500 16px var(--body)">${form.locals.length > 2 ? `<button class="tool" data-do="lrem" data-i="${i}">Remove</button>` : ''}</div>`).join('');
    return `<div class="home">
      <button class="btn small backlink" data-do="hub">← All games</button>
      <section class="hero">
        <div>
          <div class="eyebrow">${flip ? 'Two sides, double the trouble' : 'Match, shed, shout'}</div>
          <h1>${title}</h1>
          <p>${flip ? 'UNO with a twist: one Flip card turns every card over to the Dark Side, where Draw Five, Skip Everyone and Wild Draw Color are waiting.'
            : 'Match the color or number, hit the next player with Draw Twos and Wild Draw Fours, and don’t forget to call UNO.'}</p>
          <div class="facts"><span class="fact"><b>2–10</b> players</span><span class="fact"><b>${flip ? 112 : 108}</b> cards</span><span class="fact"><b>7</b> each</span><span class="fact">First to <b>500</b></span></div>
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
          <div class="row">${form.locals.length < 10 ? '<button class="btn small" data-do="ladd10">Add player</button>' : ''}<button class="btn gold" data-do="unolocal" style="margin-left:auto">Start game</button></div>
          ${saved?.phase === 'play' ? `<button class="btn small" data-do="unoresume">Resume saved game (${saved.players.map(p => esc(p.name)).join(', ')})</button>` : ''}
        </div>
        <div class="panel">
          <div class="eyebrow">New here?</div><h2>How it works</h2>
          <p>${flip ? 'Plays like UNO until someone throws a Flip. Then every hand, the draw pile and the discard pile turn over, and the Dark Side bites back.'
            : 'Play a card that matches the top of the pile by color, number or symbol. Can’t? Draw one. Down to one card? Call UNO.'}</p>
          <button class="btn" data-do="rules">Read the rules</button>
        </div>
      </section>
    </div>`;
  }

  function view(s){
    const meP = P(s, me), cur = s.players[s.turn], actor = needs(s)[0], who = P(s, actor) || cur, myTurn = s.phase === 'play' && actor === me;
    const idx = s.players.findIndex(p => p.id === me);
    const opps = idx < 0 ? s.players : [...s.players.slice(idx + 1), ...s.players.slice(0, idx)];
    const on = mode === 'local' ? null : (() => { const l = live(); l.add(me); return l; })();
    const canDraw = myTurn && !s.pend && s.step === 'play', pd = s.pend;
    const da = canDraw ? 'data-do="unodraw" role="button" tabindex="0" aria-label="Draw a card"' : '';
    const deck = flip && s.deck.length ? uc(s, s.deck.at(-1), {side:1 - s.side, cls:canDraw ? 'canpick' : '', attrs:da})
      : `<div class="uc back ${canDraw ? 'canpick' : ''}" ${da}><span>UNO</span></div>`;
    let big, hint = '';
    if (s.phase === 'over') big = `${esc(P(s, s.winner).name)} went out`;
    else if (pd){ big = myTurn ? 'Draw or challenge' : `${esc(who.name)} is deciding`; hint = `${esc(P(s, pd.by).name)} played ${NAME[pd.v]}`; }
    else if (myTurn) big = s.step === 'drawn' ? 'Play it or keep it' : 'Your turn';
    else big = `${esc(cur.name)} is playing`;
    return `<div class="game ${s.side ? 'uno-dark' : ''}"><div class="main">
      <header class="top">
        <div class="brand">${title}</div>
        <div class="turn">${avatar(s, who, 'sm')}<span><b>${myTurn ? 'Your' : esc(who.name) + '’s'}</b> turn</span></div>
        <span class="sync">Round ${s.round} · ${s.cfg.target <= 1 ? 'one round' : 'to ' + s.cfg.target} · ${s.dir > 0 ? '↻ clockwise' : '↺ counter-clockwise'}</span>
        ${flip ? `<span class="chipst ${s.side ? '' : 'good'}">${s.side ? 'Dark Side' : 'Light Side'}</span>` : ''}
        <div class="tools">${s.code ? `<span class="codechip">${esc(s.code)}</span>` : ''}<button class="tool" data-do="rules">Rules</button><button class="tool" data-do="mute">${muted ? 'Sound off' : 'Sound on'}</button><button class="tool" data-do="leave">Leave</button></div>
      </header>
      <section class="opps">${opps.map(p => {
        const n = p.hand.length;
        return `<article class="opp ${p.id === actor ? 'is-turn' : ''}" data-pid="${esc(p.id)}">
        <div class="opp-head">${avatar(s, p)}<div class="opp-name"><b>${esc(p.name)}</b><small><span class="dot ${!on || on.has(p.id) ? 'on' : ''}"></span>${flip ? '' : `<span class="backs">${'<i></i>'.repeat(Math.min(n, 8))}</span>&nbsp;`}${n} card${n === 1 ? '' : 's'}</small></div>
        <div class="stat"><span class="num">${s.totals[p.id] || 0}</span><span>points</span></div></div>
        ${flip && n ? `<div class="uno-peek" title="The other side of ${esc(p.name)}’s cards">${p.hand.map(id => uc(s, id, {side:1 - s.side, cls:'xs'})).join('')}</div>` : ''}
        ${n !== 1 ? '' : !p.unoMiss ? '<span class="chipst good">UNO</span>' : meP && s.phase === 'play' ? `<button class="btn small danger" data-do="unocatch" data-id="${esc(p.id)}">No UNO call! Catch</button>` : '<span class="chipst">No UNO call</span>'}
      </article>`; }).join('')}</section>
      <section class="rtable">
        <div class="pile" id="deck">${deck}<span class="num">${s.deck.length} left</span></div>
        <div class="pile"><div class="upile">${s.pile.slice(-3).map(id => `<div style="transform:rotate(${rotOf(id)}deg)">${uc(s, id, {cid:true})}</div>`).join('')}</div>
          ${s.color != null ? `<span class="uswatch" style="--uc:${UCOL[s.color].hex}">${UCOL[s.color].name}</span>` : '<span>Any color</span>'}</div>
        <div class="status"><span class="big">${big}</span>${hint ? `<span class="hint">${hint}</span>` : ''}<div class="ulog">${s.log.slice(-3).map(e => `<span>${esc(e.text)}</span>`).join('')}</div></div>
      </section>
      ${meP ? mine(s, meP, myTurn) : '<div class="spect">You’re watching this game.</div>'}
    </div></div>${modal(s)}${curtain(s)}`;
  }
  function mine(s, meP, myTurn){
    const key = id => ((face(s, id).c ?? 9) * 100) + ORD.indexOf(face(s, id).v);
    const hand = [...meP.hand].sort((a, b) => key(a) - key(b)), n = hand.length;
    const act = myTurn && !s.pend;
    const ok = id => act && (s.step === 'play' || id === s.drawn) && canPlay(s, id), any = hand.some(ok);
    const acts = [];
    if (act && n === 2 && any) acts.push(`<button class="btn ${ui.unoArm ? 'gold' : ''}" data-do="unoarm" aria-pressed="${!!ui.unoArm}">${ui.unoArm ? 'UNO called ✓' : 'Call UNO'}</button>`);
    if (meP.unoMiss && n === 1 && s.phase === 'play') acts.push('<button class="btn gold" data-do="unolate">Say UNO!</button>');
    if (act && s.step === 'play') acts.push('<button class="btn" data-do="unodraw">Draw a card</button>');
    if (act && s.step === 'drawn') acts.push('<button class="btn" data-do="unopass">Keep it</button>');
    const hint = !act ? `${n} card${n === 1 ? '' : 's'} in hand` : s.step === 'drawn' ? `You drew ${label(face(s, s.drawn))}. Play it, or keep it and end your turn.`
      : n === 2 && any ? 'Two cards left: call UNO before you play, or you can be caught.' : any ? 'Tap a lit card to play it, or draw.' : 'Nothing matches. Draw a card.';
    return `<section class="mine ${myTurn ? 'is-turn' : ''}" data-pid="${esc(me)}">
      <div class="mine-head">${avatar(s, meP)}<b>${esc(meP.name)}</b><span class="muted">(you) · ${s.totals[me] || 0} points</span></div>
      <div class="rcards uno-hand">${hand.map(id => `<div class="rslot ${act ? ok(id) ? 'ok' : 'no' : ''}">${uc(s, id, {cid:true, attrs:ok(id) ? `data-do="unoplay" data-id="${id}" role="button" tabindex="0" aria-label="Play ${label(face(s, id))}"` : ''})}</div>`).join('')}</div>
      <div class="ractions"><span class="hint">${hint}</span>${acts.join('')}</div>
    </section>`;
  }
  function modal(s){
    if (ui.modal === 'rules') return rules();
    if (s.phase === 'over'){
      const w = P(s, s.winner), champ = s.champion && P(s, s.champion), next = mode === 'local' || mode === 'host';
      const rows = [...s.players].sort((a, b) => (s.totals[b.id] || 0) - (s.totals[a.id] || 0));
      return sheet(`<div class="eyebrow">Round ${s.round}</div><h2>${champ ? `${esc(champ.name)} wins the match!` : `${esc(w.name)} went out`}</h2>
        <p class="lede">${esc(w.name)} scores ${s.gain} for the cards left in everyone’s hands${flip ? `, counted on the ${s.side ? 'Dark' : 'Light'} Side` : ''}.</p>
        <div class="rres">${rows.map(p => `<div class="rr ${p === w ? 'win' : ''}"><div style="min-width:0"><b>${esc(p.name)}</b> ${p === w ? '<span class="chipst good">Out</span>' : ''}
          ${p.hand.length ? `<div class="mini-groups"><div>${p.hand.map(id => uc(s, id, {cls:'xs'})).join('')}</div></div>` : ''}</div>
          <span class="num">${p === w ? '+' + s.gain : p.score + ' in hand'}</span><span class="num muted">${s.totals[p.id] || 0} total</span></div>`).join('')}</div>
        <div class="acts"><button class="btn" data-do="leave">Back to menu</button>${next ? (champ ? '<button class="btn gold" data-do="unonew">New match</button>' : '<button class="btn gold" data-do="again">Next round</button>') : '<span class="muted">The host deals next.</span>'}</div>`);
    }
    const pd = s.pend;
    if (pd && pd.victim === me){
      const by = esc(P(s, pd.by).name), col = pd.prev == null ? 'matching' : UCOL[pd.prev].name;
      const take = pd.v === 'wdc' ? `cards until you get a ${UCOL[pd.color].name} one` : `${DRAWS[pd.v]} cards`;
      const lose = pd.v === 'wdc' ? 'draw until you get the color, plus 2 more,' : `draw ${DRAWS[pd.v] + 2}`;
      return sheet(`<div class="eyebrow">${NAME[pd.v]}</div><h2>${by} played ${NAME[pd.v]}</h2>
        <p class="lede">Draw ${take} and miss your turn, or challenge. It was only allowed if ${by} had no ${col} card.</p>
        <p class="lede">Challenge and you’re right: ${by} draws instead and you play. Wrong: you ${lose} and miss your turn.</p>
        <div class="acts"><button class="btn" data-do="unoaccept">Draw</button><button class="btn danger" data-do="unochal">Challenge</button></div>`);
    }
    const meP = P(s, me);
    if (ui.unoPick != null && meP?.hand.includes(ui.unoPick)){
      const have = c => meP.hand.filter(id => id !== ui.unoPick && face(s, id).c === c).length;
      return sheet(`<div class="eyebrow">${NAME[face(s, ui.unoPick).v]}</div><h2>Pick the next color</h2>
        <div class="ucolors">${colors(s).map(c => `<button class="ucol" data-do="unocolor" data-c="${c}" style="--uc:${UCOL[c].hex}">${UCOL[c].name}<small>${have(c)} in your hand</small></button>`).join('')}</div>
        <div class="acts"><button class="btn" data-do="unox">Cancel</button></div>`);
    }
    return '';
  }
  function curtain(s){
    if (mode !== 'local' || s.phase !== 'play' || ui.revealed === me) return '';
    const p = P(s, me);
    return `<div class="curtain"><div><div class="eyebrow">Pass the device</div><h2>${avatar(s, p)} ${esc(p.name)}</h2><p class="muted">${s.pend ? `${esc(P(s, s.pend.by).name)} played ${NAME[s.pend.v]} on you` : 'Your turn'}</p><br><button class="btn gold" data-do="reveal">I’m ${esc(p.name)}. Show my cards</button></div></div>`;
  }

  return {name:flip ? 'UNO Flip' : 'UNO', min:2, max:10, cfg, CARDS, newGame, apply, needs, home, view, rules, art, face, canPlay, pts,
    lobby:(s, host) => host
      ? `<div class="row"><label class="muted">Play to <select data-unocfg="target">${TARGETS.map(([v, t]) => `<option value="${v}" ${v === s.cfg?.target ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>`
      : `<p class="muted">Playing to ${TARGETS.find(([v]) => v === (s.cfg?.target ?? cfg.target))?.[1]}</p>`};
}
ENG.uno = makeUno(false);
ENG.unoflip = makeUno(true);
Object.assign(H, {
  unoplay:d => { const id = +d.id; if (ENG[GID].face(viewState(), id).c == null){ ui.unoPick = id; return render(); } send({t:'play', card:id, uno:!!ui.unoArm}); },
  unocolor:d => send({t:'play', card:ui.unoPick, color:+d.c, uno:!!ui.unoArm}),
  unox:() => { ui.unoPick = null; render(); },
  unoarm:() => { ui.unoArm = !ui.unoArm; render(); },
  unodraw:() => send({t:'draw'}),
  unopass:() => send({t:'pass'}),
  unolate:() => send({t:'uno'}),
  unocatch:d => send({t:'catch', target:d.id}),
  unoaccept:() => send({t:'accept'}),
  unochal:() => send({t:'challenge'}),
  unonew:() => { G = {...G, totals:{}, round:0}; rematch(); },
  ladd10:() => { if (form.locals.length < 10) form.locals.push(''); render(); },
  unolocal:() => {
    const names = form.locals.map(n => n.trim()).filter(Boolean);
    if (names.length < 2) return toast('Add at least two player names');
    mode = 'local'; ui = freshUI(); seenLog = -1;
    G = {...ENG[GID].newGame(names.map((name, i) => ({id:'p' + i, name})), {game:GID}), v:1};
    store.set(GID + '-local', G); screen = 'game'; render();
  },
  unoresume:() => { G = store.get(GID + '-local'); if (!G) return; mode = 'local'; ui = freshUI(); seenLog = -1; screen = 'game'; render(); },
});
app.addEventListener('change', e => {
  const k = e.target.dataset.unocfg;
  if (GID.startsWith('uno') && k && mode === 'host' && G?.phase === 'lobby'){ G.cfg = {...G.cfg, [k]:+e.target.value}; G.v++; persist(); render(); }
});
