/* =====================================================================
   UNO, UNO FLIP and UNO SHOW 'EM NO MERCY — Mattel's rules.
   Classic: 108 cards. Flip: 112 two-sided cards; a Flip card turns over
   the hands, draw pile and discard pile to the harsher Dark Side (and back).
   Match the top card by color, number or symbol, or play a Wild; otherwise
   draw one and play it if you can. Wild Draw Four (Flip: Wild Draw Two /
   Wild Draw Color) may be bluffed and challenged.
   No Mercy: 168 cards. Draw cards stack (equal or higher value passes the
   whole penalty on); no match means drawing until you can play; a 7 swaps
   hands with a player you pick, a 0 passes every hand along; 25 cards in
   hand and you're out (the Mercy rule). Win by going out or by being the
   last player left; knockouts score 250 each.
   Forget to call UNO and get caught: draw 2. First out scores the cards
   left in everyone else's hand; first to the target wins the match.
   ===================================================================== */
const UCOL = [{name:'Red', hex:'#d8352a'}, {name:'Yellow', hex:'#f2c21b'}, {name:'Green', hex:'#2e9b48'}, {name:'Blue', hex:'#1f6bd0'},
  {name:'Pink', hex:'#e0438c'}, {name:'Teal', hex:'#109f9f'}, {name:'Orange', hex:'#f0781a'}, {name:'Purple', hex:'#7a3bc9'}];
function makeUno(kind){
  const flip = kind === 'flip', nm = kind === 'nomercy';
  const NAME = {skip:'Skip', rev:'Reverse', d1:'Draw One', d2:'Draw Two', d4:'Draw Four', d5:'Draw Five', skipall:'Skip Everyone', flip:'Flip', discard:'Discard All',
    wild:'Wild', wd4:'Wild Draw Four', wd2:'Wild Draw Two', wdc:'Wild Draw Color', wrd4:'Wild Reverse Draw Four', wd6:'Wild Draw Six', wd10:'Wild Draw Ten', roul:'Wild Color Roulette'};
  const GLY = {skip:'⊘', rev:'⇄', d1:'+1', d2:'+2', d4:'+4', d5:'+5', skipall:'⊘', flip:'⇅', discard:'✱', wild:'', wd4:'+4', wd2:'+2', wdc:'+?', wrd4:'+4', wd6:'+6', wd10:'+10', roul:'?'};
  const SUB = {skipall:'ALL', flip:'FLIP', discard:'ALL', wild:'WILD', wdc:'COLOR', wrd4:'⇄', roul:'ROULETTE'};
  const PTS = nm ? {skip:20, rev:20, d2:20, d4:20, skipall:20, discard:20, wild:50, wrd4:50, wd6:50, wd10:50, roul:50}
    : {d1:10, d2:20, d5:20, skip:20, rev:20, flip:20, skipall:30, wild:flip ? 40 : 50, wd4:50, wd2:50, wdc:60};
  const ORD = [...'0123456789', 'd1', 'd2', 'd4', 'd5', 'skip', 'skipall', 'rev', 'flip', 'discard', 'wild', 'wd2', 'wd4', 'wdc', 'wrd4', 'wd6', 'wd10', 'roul'];
  const DRAWS = {wd4:4, wd2:2};
  const STACK = {d2:2, d4:4, wrd4:4, wd6:6, wd10:10};   // No Mercy draw cards and their stacking value
  const MERCY = 25, KO = 250;
  // One side of the deck: two of each 1–9 and each action per color (plus one 0 in classic), and four of each wild.
  const faces = (cols, acts, wilds, zero, actK = 2) => {
    const out = [];
    for (const c of cols){
      if (zero) out.push({c, v:'0'});
      for (const v of '123456789') out.push({c, v}, {c, v});
      for (const v of acts) for (let k = 0; k < actK; k++) out.push({c, v});
    }
    for (const v of wilds) for (let k = 0; k < 4; k++) out.push({c:null, v});
    return out;
  };
  const light = flip ? faces([0, 1, 2, 3], ['d1', 'rev', 'skip', 'flip'], ['wild', 'wd2'])
    : nm ? faces([0, 1, 2, 3], ['skip', 'rev', 'd2', 'd4', 'skipall', 'discard'], ['wild', 'wrd4', 'wd6', 'wd10', 'roul'], true, 3)
    : faces([0, 1, 2, 3], ['skip', 'rev', 'd2'], ['wild', 'wd4'], true);
  const dark = flip ? faces([4, 5, 6, 7], ['d5', 'rev', 'skipall', 'flip'], ['wild', 'wdc']) : light;
  // Each Flip card has a fixed Dark Side: a seeded shuffle pairs the sides the same way on every device.
  if (flip){ let seed = 20190706; for (let i = dark.length - 1; i > 0; i--){ seed = seed * 16807 % 2147483647; const j = seed % (i + 1); [dark[i], dark[j]] = [dark[j], dark[i]]; } }
  const CARDS = light.map((f, i) => [f, dark[i]]);
  const cfg = {target:nm ? 1000 : 500};
  const TARGETS = nm ? [[1, 'one round'], [500, '500 points'], [1000, '1,000 points']] : [[1, 'one round'], [200, '200 points'], [300, '300 points'], [500, '500 points']];
  const face = (s, id) => CARDS[id][s.side];
  const label = f => f.c == null ? NAME[f.v] : `${UCOL[f.c].name} ${NAME[f.v] || f.v}`;
  const pts = f => PTS[f.v] ?? +f.v;
  const colors = s => s.side ? [4, 5, 6, 7] : [0, 1, 2, 3];
  const alive = s => s.players.filter(p => !p.out);
  // k seats on in the current direction, passing over anyone knocked out.
  const seat = (s, i, k) => { const n = s.players.length; let j = i; for (let m = 0; m < k; m++){ let g = 0; do j = ((j + s.dir) % n + n) % n; while (s.players[j].out && ++g < n); } return j; };
  const canPlay = (s, id) => { const f = face(s, id); return f.c == null || s.color == null || f.c === s.color || f.v === face(s, s.pile.at(-1)).v; };
  // With a No Mercy stack on you, only a draw card of equal or higher value can be played.
  const legal = (s, id) => s.stack ? (STACK[face(s, id).v] ?? -1) >= s.stack.last : canPlay(s, id);

  function newGame(seats, extra = {}){
    const c = {...cfg, ...(extra.cfg || {})}, totals = {...(extra.totals || {})}, round = (extra.round || 0) + 1;
    const s = {...extra, cfg:c, totals, round, phase:'play', gid:rid(8), ack:extra.ack || {}, log:[], ln:0, champion:null, winner:null, gain:0,
      players:seats.map(p => ({id:p.id, name:p.name, hand:[], unoMiss:false, score:null, out:false})),
      deck:shuffle([...CARDS.keys()]), pile:[], side:0, dir:1, color:null, step:'play', drawn:null, pend:null, stack:null, roul:null, aside:[], ko:0};
    for (let i = 0; i < 7; i++) s.players.forEach(p => p.hand.push(s.deck.pop()));
    const dealer = (round - 1) % s.players.length;
    // Classic and Flip: a Wild Draw Four / Wild Draw Two (or a Flip) can't start the pile. No Mercy: only a number card can.
    const bad = v => nm ? !/^\d$/.test(v) : ['wd4', 'wd2', 'flip'].includes(v);
    let top; while (bad(CARDS[top = s.deck.pop()][0].v)) s.deck.splice(Math.random() * s.deck.length | 0, 0, top);
    s.pile = [top];
    const f = face(s, top);
    log(s, `Round ${round}. ${s.players[dealer].name} deals and turns up ${f.c == null ? 'a Wild: play any card' : label(f)}`, 'turn');
    if (nm){ s.color = f.c; s.turn = seat(s, dealer, 1); }
    else if (f.v === 'rev'){ s.dir = -1; s.color = f.c; s.turn = dealer; log(s, `Reverse: ${s.players[dealer].name} starts`); }
    else effect(s, dealer, f, null);
    return s;
  }
  function drawOne(s){
    if (!s.deck.length && (s.pile.length > 1 || s.aside.length)){
      const top = s.pile.pop(); s.deck = shuffle([...s.pile, ...s.aside], reseed(s)); s.pile = [top]; s.aside = [];
      log(s, 'The discard pile was shuffled into a new draw pile');
    }
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
  // No Mercy: 25 or more cards and you're out; your hand is set aside until the next reshuffle. Last one standing wins.
  function mercy(s){
    if (!nm || s.phase !== 'play') return false;
    for (const p of s.players) if (!p.out && p.hand.length >= MERCY){
      p.out = true; p.unoMiss = false; s.aside.push(...p.hand); p.hand = []; s.ko++;
      log(s, `Mercy! ${p.name} hit ${MERCY} cards and is out`, 'big', {title:'No mercy!', sub:`${p.name} is out`});
      tell(s, [p.id], `You hit ${MERCY} cards: you’re out this round`);
    }
    const live = alive(s);
    if (live.length === 1){ endRound(s, live[0]); return true; }
    if (s.players[s.turn]?.out) s.turn = seat(s, s.turn, 1);
    return false;
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
    const nx = s.players[seat(s, i, 1)], two = alive(s).length === 2, by = s.players[i].name;
    switch (f.v){
      case 'rev': s.dir = -s.dir; log(s, two ? `${nx.name} is skipped` : 'Play reverses'); if (two) tell(s, [nx.id], `${by} skipped you`); s.turn = two ? i : seat(s, i, 1); break;
      case 'skip': log(s, `${nx.name} is skipped`); tell(s, [nx.id], `${by} skipped you`); s.turn = seat(s, i, 2); break;
      case 'skipall': log(s, `Everyone is skipped. ${by} plays again`); tell(s, alive(s).filter(q => q !== s.players[i]).map(q => q.id), `${by} skipped everyone`); s.turn = i; break;
      case 'd1': case 'd5': drawN(s, nx, +f.v[1]); tell(s, [nx.id], `${by} made you draw ${f.v[1]} and skipped you`); s.turn = seat(s, i, 2); break;
      case 'd2': if (!nm){ drawN(s, nx, 2); tell(s, [nx.id], `${by} made you draw 2 and skipped you`); s.turn = seat(s, i, 2); break; }   // falls through to stacking in No Mercy
      case 'd4': case 'wrd4': case 'wd6': case 'wd10': {
        // The penalty builds until someone can't answer it. Wild Reverse Draw Four turns play around first;
        // with two players that sends it straight back to whoever played it.
        if (f.v === 'wrd4'){ s.dir = -s.dir; if (two){ s.stack = {n:(s.stack?.n || 0) + 4, last:4}; s.turn = i; log(s, `Play reverses: ${s.players[i].name} faces +${s.stack.n}`); break; } }
        s.stack = {n:(s.stack?.n || 0) + STACK[f.v], last:STACK[f.v]};
        s.turn = seat(s, i, 1);
        log(s, `${s.players[s.turn].name} faces +${s.stack.n}`); tell(s, [s.players[s.turn].id], `+${s.stack.n} on you: stack a draw card or take them`);
        break;
      }
      case 'roul': s.color = null; s.turn = seat(s, i, 1); s.roul = {victim:s.players[s.turn].id}; tell(s, [s.roul.victim], `${by} hit you with Color Roulette`); break;
      case 'flip': flipOver(s); s.turn = seat(s, i, 1); break;
      default: s.turn = seat(s, i, 1);
    }
  }
  function endRound(s, w){
    s.phase = 'over'; s.winner = w.id; s.stack = null; s.roul = null;
    for (const p of s.players) p.score = p.hand.reduce((t, id) => t + pts(face(s, id)), 0);
    const bonus = nm ? s.ko * KO : 0;
    s.gain = s.players.reduce((t, p) => t + (p === w ? 0 : p.score), 0) + bonus;   // the last one standing may still hold cards; those don't count
    s.totals[w.id] = (s.totals[w.id] || 0) + s.gain;
    const how = alive(s).length === 1 && w.hand.length ? 'is the last one standing' : 'went out';
    if (s.cfg.target <= 1 || s.totals[w.id] >= s.cfg.target){
      s.champion = w.id;
      log(s, `${w.name} ${how}, scores ${s.gain} and wins the match`, 'win', {title:`${w.name} wins!`, sub:`${s.totals[w.id]} points`});
    } else log(s, `${w.name} ${how} and scores ${s.gain}${bonus ? ` (${bonus} for knockouts)` : ''}`, 'big', {title:`${w.name} wins the round`, sub:`+${s.gain} points`});
  }
  const clearMiss = s => s.players.forEach(p => { p.unoMiss = false; });

  function apply(s, pid, a){
    if (!a || typeof a !== 'object') return 'That move was not understood';
    const p = P(s, pid); if (!p) return 'You’re watching this game';
    if (s.phase !== 'play') return 'This round is over';
    if (p.out) return 'You’re out of this round';
    const i = s.players.indexOf(p);
    // Anyone may catch a player who went down to one card without calling UNO, until the next player acts.
    if (a.t === 'catch'){
      const t = P(s, a.target);
      if (!t || t === p) return 'Pick another player to catch';
      if (!t.unoMiss || t.hand.length !== 1) return `${t.name} is safe`;
      t.unoMiss = false; log(s, `${p.name} caught ${t.name} without UNO`, 'big', {title:'Caught!', sub:`${t.name} forgot to call UNO · draws 2`});
      tell(s, [t.id], `${p.name} caught you without UNO: draw 2`);
      drawN(s, t, 2); mercy(s); return;
    }
    if (a.t === 'uno'){
      if (!p.unoMiss || p.hand.length !== 1) return 'Call UNO when you play your second-to-last card';
      p.unoMiss = false; return log(s, `${p.name}: UNO!`, 'big', {title:'UNO!', sub:p.name});
    }
    // Color Roulette: the victim names a color, then turns cards over until it shows up (Wilds don't count).
    if (s.roul){
      if (pid !== s.roul.victim) return `Waiting for ${P(s, s.roul.victim).name} to pick a color`;
      if (a.t !== 'roulette' || !colors(s).includes(a.color)) return 'Pick a color for the roulette';
      clearMiss(s); s.roul = null;
      drawUntil(s, p, a.color); s.color = a.color;
      s.turn = seat(s, i, 1);
      mercy(s); return;
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
      clearMiss(s);
      if (s.stack){   // can't (or won't) stack: take the whole pile of penalties and lose the turn
        const n = s.stack.n; s.stack = null;
        log(s, `${p.name} takes +${n}`, n >= 10 ? 'big' : 'info', n >= 10 ? {title:`+${n}`, sub:`${p.name} takes it`} : {});
        drawN(s, p, n); s.turn = seat(s, i, 1);
        mercy(s); return;
      }
      if (s.step !== 'play') return nm ? 'Play the card you drew' : 'You already drew. Play that card or keep it';
      if (nm){
        if (p.hand.some(id => canPlay(s, id))) return 'You have a card you can play';
        let k = 0, id = null;
        while ((id = drawOne(s)) != null){ p.hand.push(id); k++; if (canPlay(s, id) || p.hand.length >= MERCY) break; }
        log(s, `${p.name} drew ${k} card${k === 1 ? '' : 's'}`);
        if (mercy(s) || p.out) return;
        if (id == null || !canPlay(s, id)){ log(s, `${p.name} has nothing to draw and passes`); s.turn = seat(s, i, 1); return; }
        s.step = 'drawn'; s.drawn = id; return;
      }
      const id = drawOne(s);
      if (id == null){ log(s, `${p.name} has nothing to draw and passes`); s.turn = seat(s, i, 1); return; }
      p.hand.push(id);
      if (!canPlay(s, id)){ log(s, `${p.name} drew a card and passes`); s.turn = seat(s, i, 1); return; }
      log(s, `${p.name} drew a card`); s.step = 'drawn'; s.drawn = id; return;
    }
    if (a.t === 'pass'){
      if (nm) return 'In No Mercy you play the card you drew';
      if (s.step !== 'drawn') return 'Play a card or draw one';
      log(s, `${p.name} keeps the card`); s.step = 'play'; s.drawn = null; s.turn = seat(s, i, 1); return;
    }
    if (a.t === 'play'){
      const id = a.card;
      if (!p.hand.includes(id)) return 'That card isn’t in your hand';
      if (s.step === 'drawn' && id !== s.drawn) return 'After drawing you can only play the card you drew';
      const f = face(s, id);
      if (s.stack && !legal(s, id)) return `Stack a +${s.stack.last} or higher, or take ${s.stack.n}`;
      if (!legal(s, id)) return `That doesn’t match. Play ${s.color == null ? 'any card' : `a ${UCOL[s.color].name} card`}, a ${label(face(s, s.pile.at(-1))).replace(/^\S+ /, '')} or a Wild`;
      if (f.c == null && f.v !== 'roul' && !colors(s).includes(a.color)) return 'Choose a color';
      const swapWith = nm && f.v === '7' && p.hand.length > 1 ? P(s, a.target) : null;
      if (nm && f.v === '7' && p.hand.length > 1 && (!swapWith || swapWith === p || swapWith.out)) return 'Pick a player to swap hands with';
      clearMiss(s);
      const prev = s.color;
      p.hand.splice(p.hand.indexOf(id), 1); s.pile.push(id); s.step = 'play'; s.drawn = null;
      log(s, `${p.name} played ${label(f)}${f.c == null && f.v !== 'roul' ? ` and chose ${UCOL[a.color].name}` : ''}`, f.v === 'wd10' ? 'big' : 'info', f.v === 'wd10' ? {title:'+10', sub:`${p.name} shows no mercy`} : {});
      if (nm && f.v === 'discard'){   // the rest of that color goes under the Discard All card
        const same = p.hand.filter(x => face(s, x).c === f.c);
        if (same.length){ p.hand = p.hand.filter(x => !same.includes(x)); s.pile.splice(s.pile.length - 1, 0, ...same); log(s, `${p.name} discards ${same.length} more ${UCOL[f.c].name} card${same.length > 1 ? 's' : ''}`); }
      }
      if (!p.hand.length){
        if (nm && f.v in STACK){ effect(s, i, f, a.color); const v = s.players[s.turn]; if (v !== p){ drawN(s, v, s.stack.n); s.stack = null; } }
        else if (!nm && (f.v in DRAWS || f.v === 'wdc')){ s.color = a.color; penalty(s, s.players[seat(s, i, 1)], {v:f.v, color:a.color}, 0); }
        else if (!nm) effect(s, i, f, a.color);
        return endRound(s, p);
      }
      if (p.hand.length === 1){ if (a.uno) log(s, `${p.name}: UNO!`, 'big', {title:'UNO!', sub:p.name}); else p.unoMiss = true; }
      if (!nm && (f.v in DRAWS || f.v === 'wdc')){
        s.color = a.color;
        const v = seat(s, i, 1);
        // Only legal with no card of the color that was in play; it can still be bluffed, and challenged.
        s.pend = {by:pid, victim:s.players[v].id, v:f.v, color:a.color, prev, legal:prev == null || !p.hand.some(x => face(s, x).c === prev)};
        tell(s, [s.pend.victim], `${p.name} played ${label(f)} on you`);
        s.turn = v; return;
      }
      if (swapWith){
        [p.hand, swapWith.hand] = [swapWith.hand, p.hand];
        [p.unoMiss, swapWith.unoMiss] = [false, false];
        log(s, `${p.name} swaps hands with ${swapWith.name}`, 'big', {title:'Swap!', sub:`${p.name} ⇄ ${swapWith.name}`});
        tell(s, [swapWith.id], `${p.name} swapped hands with you`);
      }
      if (nm && f.v === '0'){   // every hand moves one seat along in the direction of play
        const live = alive(s), hands = live.map(q => q.hand);
        live.forEach((q, k) => { q.hand = hands[((k - s.dir) % live.length + live.length) % live.length]; q.unoMiss = false; });
        log(s, `Every hand passes ${s.dir > 0 ? 'clockwise' : 'counter-clockwise'}`, 'big', {title:'Pass!', sub:'Every hand moves one seat'});
        tell(s, live.filter(q => q !== p).map(q => q.id), 'Hands passed: you have a new hand');
      }
      effect(s, i, f, a.color);
      mercy(s);
      return;
    }
    return 'That move was not understood';
  }
  const needs = s => s.phase === 'play' ? [s.roul ? s.roul.victim : s.pend ? s.pend.victim : s.players[s.turn].id] : [];

  /* ----- client ----- */
  /* ----- card art, drawn like the official app's deck -----
     Every face is a small SVG: a white border (black on the Dark Side), a tilted oval, and a white symbol with a
     heavy black outline and drop shadow. Skip, Reverse and the draw cards are drawn shapes, not font glyphs,
     so they look the same on every phone. Faces are built once and cached. */
  const LIGHT4 = ['#d8352a', '#1f6bd0', '#2e9b48', '#f2c21b'], DARK4 = ['#e0438c', '#109f9f', '#f0781a', '#7a3bc9'];
  const ARROW = 'M-21-5H5v-10l17 15-17 15v-10h-26z';
  const SHAPE = {
    skip:'<path fill-rule="evenodd" d="M0-25a25 25 0 1 1 0 50a25 25 0 1 1 0-50zm0 9a16 16 0 1 0 0 32a16 16 0 1 0 0-32z"/><rect x="-5" y="-18" width="10" height="36" transform="rotate(45)"/>',
    rev:`<path d="${ARROW}" transform="rotate(-45) translate(0 -11)"/><path d="${ARROW}" transform="rotate(135) translate(0 -11)"/>`,
  };
  const txt = (t, size, y = 0) => `<text y="${y}" text-anchor="middle" dominant-baseline="central" font-family="Lilita One,sans-serif" font-size="${size}">${t}</text>`;
  // A symbol in three coats: drop shadow, black outline, then the fill.
  const ink = (g, fill, shadow = true, w = 8) => `<g stroke-linejoin="round">${shadow ? `<g transform="translate(3 4)" fill="#111" stroke="#111" stroke-width="${w}">${g}</g>` : ''}<g fill="none" stroke="#111" stroke-width="${w}">${g}</g><g fill="${fill}">${g}</g></g>`;
  // Little cards (+2, +4…): each outlined in black with a white edge.
  const LAY = {1:[[0, 0, -8]], 2:[[-8, -8, -10], [8, 8, -10]], 3:[[-15, 5, -18], [0, -4, 0], [15, 5, 18]], 4:[[-13, 7, -12], [-3, -9, -4], [11, -2, 8], [1, 11, 0]]};
  const minis = cols => LAY[cols.length].map(([x, y, a], i) => {
    const r = `<rect x="${x - 11}" y="${y - 16}" width="22" height="32" rx="4" transform="rotate(${a} ${x} ${y})"`;
    return `<g stroke-linejoin="round"><g transform="translate(3 4)">${r} fill="#111" stroke="#111" stroke-width="7"/></g>${r} fill="none" stroke="#111" stroke-width="7"/>${r} fill="${cols[i]}" stroke="#fff" stroke-width="2.5"/></g>`;
  }).join('');
  const quads = (rx, ry, c) => `<path d="M0 0V${-ry}A${rx} ${ry} 0 0 0 ${-rx} 0Z" fill="${c[0]}"/><path d="M0 0H${rx}A${rx} ${ry} 0 0 0 0 ${-ry}Z" fill="${c[1]}"/><path d="M0 0V${ry}A${rx} ${ry} 0 0 0 ${rx} 0Z" fill="${c[2]}"/><path d="M0 0H${-rx}A${rx} ${ry} 0 0 0 0 ${ry}Z" fill="${c[3]}"/>`;
  const PLUS = {d1:1, d2:2, d4:4, wd2:2, wd4:4, wrd4:4};
  const faceCache = new Map();
  function faceSVG(f, dk){
    const k = `${f.c}${f.v}${dk}`; if (faceCache.has(k)) return faceCache.get(k);
    const wild = f.c == null, col = wild ? '#16161a' : UCOL[f.c].hex, four = dk ? DARK4 : LIGHT4;
    const sym = dk ? col : '#fff', v = f.v, n = PLUS[v];
    // the middle of the card
    let mid, corner;
    if (/^\d$/.test(v)){ const g = txt(v, 80, 2) + (v === '6' || v === '9' ? '<rect x="-15" y="33" width="30" height="7" rx="3.5"/>' : ''); mid = ink(g, sym); corner = txt(v, 30); }
    else if (SHAPE[v]){ mid = ink(SHAPE[v], sym); corner = `<g transform="scale(.42)">${SHAPE[v]}</g>`; }
    else if (v === 'skipall'){ mid = ink(`<g transform="translate(0 -10) scale(.8)">${SHAPE.skip}</g>${txt('ALL', 24, 30)}`, sym); corner = `<g transform="scale(.42)">${SHAPE.skip}</g>`; }
    else if (n){ mid = minis(wild ? [four[2], four[1], four[3], four[0]].slice(0, n) : Array(n).fill(col)) + (v === 'wrd4' ? `<g transform="translate(20 -34) scale(.45)">${ink(SHAPE.rev, '#fff', false, 9)}</g>` : ''); corner = txt('+' + n, 24); }
    else if (v === 'discard'){ mid = minis([col, col, col]) + ink(txt('ALL', 22, 34), '#fff'); corner = txt('ALL', 17); }
    else if (v === 'flip'){ mid = minis(dk ? ['#fbf8f0', '#16161a'] : ['#16161a', '#fbf8f0']) + ink(txt('FLIP', 22, 36), sym); corner = txt('FLIP', 14); }
    else if (v === 'wild'){ mid = ''; corner = `<g stroke="#111" stroke-width="1.5">${quads(7, 11, four)}</g>`; }
    else { const t = {d5:'+5', wd6:'+6', wd10:'+10', wdc:'+?', roul:'?'}[v] || '?'; mid = ink(txt(t, t.length > 2 ? 46 : 60, 2), wild ? '#fff' : sym); corner = txt(t, t.length > 2 ? 18 : 24); }
    // the oval: four colors on wilds, an outline on everything else (filled black on the Dark Side)
    const oval = wild && (v === 'wild' || !n) ? `<g transform="rotate(28)">${quads(44, 70, four)}<ellipse rx="44" ry="70" fill="none" stroke="#fff" stroke-width="4"/></g>`
      : `<ellipse rx="44" ry="70" transform="rotate(28)" fill="${dk ? '#15101c' : 'none'}" stroke="${dk ? col : '#fff'}" stroke-width="${dk ? 3 : 5}"/>`;
    const cfill = dk ? col : '#fff', cdraw = c => `<g fill="${cfill}" stroke="#111" stroke-width="4" paint-order="stroke" stroke-linejoin="round">${c}</g>`;
    const svg = `<svg viewBox="0 0 120 178" aria-hidden="true"><defs><linearGradient id="ug" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <rect width="120" height="178" rx="14" fill="${dk ? '#0d0d10' : '#fbf8f0'}"/><rect x="6" y="6" width="108" height="166" rx="9" fill="${col}"/>
      <g transform="translate(60 89)">${oval}${mid}</g>
      <g transform="translate(19 25)">${cdraw(corner)}</g><g transform="translate(101 153) rotate(180)">${cdraw(corner)}</g>
      <rect x="6" y="6" width="108" height="166" rx="9" fill="url(#ug)"/><path d="M6 60L114 6V40L6 104Z" fill="#fff" opacity=".07"/></svg>`;
    faceCache.set(k, svg); return svg;
  }
  const BACK = `<svg viewBox="0 0 120 178" aria-hidden="true"><rect width="120" height="178" rx="14" fill="#fbf8f0"/><rect x="6" y="6" width="108" height="166" rx="9" fill="#16161a"/>
    <ellipse cx="60" cy="89" rx="44" ry="70" transform="rotate(28 60 89)" fill="#d8352a"/>
    <g transform="translate(60 89) rotate(-22)" font-family="Lilita One,sans-serif" font-size="40" text-anchor="middle" dominant-baseline="central" stroke-linejoin="round">
      <text x="3" y="4" fill="#111" stroke="#111" stroke-width="9">UNO</text><text fill="#f2c21b" stroke="#111" stroke-width="7" paint-order="stroke">UNO</text></g></svg>`;
  function uc(s, id, o = {}){
    const f = CARDS[id][o.side ?? s?.side ?? 0], dk = (o.side ?? s?.side ?? 0) === 1;
    return `<div class="uc ${dk ? 'dark' : ''} ${f.c == null ? 'wild' : ''} ${o.cls || ''}" ${o.cid ? `data-cid="${id}"` : ''} ${o.attrs || ''} title="${label(f)}">${faceSVG(f, dk)}</div>`;
  }
  const find = (sd, c, v) => CARDS.findIndex(fc => fc[sd].c === c && fc[sd].v === v);
  function art(){
    const cards = flip ? [[find(0, 0, '7'), 0, -16, -110, 16], [find(0, 3, 'flip'), 0, -6, -50, 2], [find(1, null, 'wdc'), 1, 4, 10, -4], [find(1, 4, 'd5'), 1, 14, 70, 4], [find(1, 5, 'skipall'), 1, 24, 128, 20]]
      : nm ? [[find(0, null, 'wd6'), 0, -16, -110, 16], [find(0, 0, 'd4'), 0, -6, -50, 2], [find(0, null, 'roul'), 0, 4, 10, -4], [find(0, 3, 'skipall'), 0, 14, 70, 4], [find(0, null, 'wd10'), 0, 24, 128, 20]]
      : [[find(0, 0, '7'), 0, -16, -110, 16], [find(0, 3, 'rev'), 0, -6, -50, 2], [find(0, null, 'wild'), 0, 4, 10, -4], [find(0, 1, 'd2'), 0, 14, 70, 4], [find(0, 2, 'skip'), 0, 24, 128, 20]];
    return `<div class="uno-art" style="position:absolute;inset:0">${cards.map(([id, sd, r, x, y]) => `<div class="fi" style="transform:translate(-50%,-50%) rotate(${r}deg) translate(${x * .55}px,${y * .9}px);--r2:${r * 1.25}deg;--x2:${x * .75}px;--yy:${y - 10}px">${uc(null, id, {side:sd})}</div>`).join('')}</div>`;
  }
  const rulesList = nm ? [
    ['Goal', 'Get rid of all your cards, or be the last player left. The winner scores the cards in everyone else’s hands plus 250 for every player knocked out; first to 1,000 wins.'],
    ['Your turn', 'Match the top card by color, number or symbol, or play a Wild. No match? Draw until you get a card you can play, then play it.'],
    ['Stacking', 'Hit with a Draw card (+2, +4, +6, +10)? Answer with a Draw card of equal or higher value, any color, and the whole penalty moves on. Whoever can’t stack takes all of it and loses their turn.'],
    ['Mercy rule', 'Reach 25 cards and you’re out of the round. Your cards are set aside until the draw pile runs out.'],
    ['7s and 0s', 'Play a 7 and you must swap hands with a player you pick. Play a 0 and every hand passes one seat in the direction of play.'],
    ['Colored actions', 'Skip, Reverse (with two players it works like Skip), Draw 2, Draw 4, Skip Everyone (you play again) and Discard All (every card of its color in your hand goes with it).'],
    ['Wild cards', 'Wild: pick a color. Wild Reverse Draw 4: play reverses, then the next player draws 4; with two players it comes back at you, so stack it back. Wild Draw 6 and Wild Draw 10: the next player draws 6 or 10.'],
    ['Color Roulette', 'The next player names a color, then turns cards from the draw pile until it shows up (Wilds don’t count). They keep every card and lose their turn.'],
    ['First card', 'An action card turned up to start goes back; cards are turned until a number comes up.'],
    ['UNO', 'Call UNO before playing your second-to-last card. If someone catches you before the next player acts, you draw 2.'],
    ['Scoring', 'Numbers: face value. Colored action cards: 20. Wild cards: 50. Plus 250 for each player knocked out this round.'],
  ] : flip ? [
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
  const tag = flip ? '<i>FLIP</i>' : nm ? '<i class="nm">NO MERCY</i>' : '', NICE = flip ? 'UNO Flip' : nm ? 'UNO No Mercy' : 'UNO';
  const title = `<span class="uno-logo big"><b>UNO</b>${tag}</span>`;
  const rules = () => sheet(`<div class="eyebrow">How to play</div><h2>${NICE} rules</h2><ul class="rules">${rulesList.map(([k, v]) => `<li><b>${k}</b><span>${v}</span></li>`).join('')}</ul>
    <div class="acts"><button class="btn gold" data-do="closemodal">Got it</button></div>`);

  function home(){
    const saved = store.get(GID + '-local');
    const locals = form.locals.map((n, i) => `<div class="row"><input class="grow" id="lp${i}" data-local="${i}" value="${esc(n)}" placeholder="Player ${i + 1}" maxlength="18" aria-label="Player ${i + 1} name" style="min-width:0;background:rgba(0,0,0,.28);border:1px solid var(--line);border-radius:12px;padding:11px 14px;color:var(--text);font:500 16px var(--body)">${form.locals.length > 2 ? `<button class="tool" data-do="lrem" data-i="${i}">Remove</button>` : ''}</div>`).join('');
    return `<div class="home">
      <button class="btn small backlink" data-do="hub">← All games</button>
      <section class="hero">
        <div>
          <div class="eyebrow">${flip ? 'Two sides, double the trouble' : nm ? 'Show ’em no mercy' : 'Match, shed, shout'}</div>
          <h1>${title}</h1>
          <p>${flip ? 'UNO with a twist: one Flip card turns every card over to the Dark Side, where Draw Five, Skip Everyone and Wild Draw Color are waiting.'
            : nm ? 'The brutal one. Stack Draw cards past +10, swap hands on a 7, spin the Color Roulette. Hit 25 cards and you’re out.'
            : 'Match the color or number, hit the next player with Draw Twos and Wild Draw Fours, and don’t forget to call UNO.'}</p>
          <div class="facts"><span class="fact"><b>${nm ? '2–6' : '2–10'}</b> players</span><span class="fact"><b>${nm ? 168 : flip ? 112 : 108}</b> cards</span><span class="fact">${nm ? 'Out at <b>25</b> cards' : '<b>7</b> each'}</span><span class="fact">First to <b>${cfg.target.toLocaleString()}</b></span></div>
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
          <div class="field"><label for="unocaph">Play to</label><div class="row">${capInput('unocaph', 'target', cfg.target, TARGETS.map(t => t[0]), 1, 10000)}<span class="muted">points · 1 for a single round</span></div></div>
          <div class="row">${form.locals.length < (nm ? 6 : 10) ? '<button class="btn small" data-do="ladd10">Add player</button>' : ''}<button class="btn gold" data-do="unolocal" style="margin-left:auto">Start game</button></div>
          ${saved?.phase === 'play' ? `<button class="btn small" data-do="unoresume">Resume saved game (${saved.players.map(p => esc(p.name)).join(', ')})</button>` : ''}
        </div>
        <div class="panel">
          <div class="eyebrow">New here?</div><h2>How it works</h2>
          <p>${flip ? 'Plays like UNO until someone throws a Flip. Then every hand, the draw pile and the discard pile turn over, and the Dark Side bites back.'
            : nm ? 'Plays like UNO, but Draw cards stack, you draw until you can play, and anyone holding 25 cards is knocked out.'
            : 'Play a card that matches the top of the pile by color, number or symbol. Can’t? Draw one. Down to one card? Call UNO.'}</p>
          <button class="btn" data-do="rules">Read the rules</button>
        </div>
      </section>
    </div>`;
  }

  // Opponents sit around the top of an oval table; positions are % of the table box.
  const seatXY = n => Array.from({length:n}, (_, i) => { const a = Math.PI * (1 + (i + 1) / (n + 1)); return [50 + 45 * Math.cos(a), 50 + 42 * Math.sin(a)]; });
  const pt = d => { const a = d * Math.PI / 180; return `${(100 + 88 * Math.cos(a)).toFixed(1)} ${(100 + 88 * Math.sin(a)).toFixed(1)}`; };
  const RING = [0, 120, 240].map(d => `<path d="M${pt(d)} A88 88 0 0 1 ${pt(d + 92)}" marker-end="url(#uah)"/>`).join('');
  let lastSide = {}, flipT = 0;   // when the side changes, the table plays a flip for 900ms
  let lastDir = {}, dirT = 0;     // when play reverses, the ring turns once
  const since = (t, ms) => { const e = Date.now() - t; return e < ms ? e : -1; };
  function view(s){
    const meP = P(s, me), cur = s.players[s.turn], actor = needs(s)[0], who = P(s, actor) || cur, myTurn = s.phase === 'play' && actor === me;
    const idx = s.players.findIndex(p => p.id === me);
    const opps = idx < 0 ? s.players : [...s.players.slice(idx + 1), ...s.players.slice(0, idx)];
    const on = mode === 'local' ? null : (() => { const l = live(); l.add(me); return l; })();
    const canDraw = myTurn && !s.pend && !s.roul && s.step === 'play' && (!nm || !!s.stack || !meP.hand.some(id => canPlay(s, id))), pd = s.pend;
    const da = canDraw ? 'data-do="unodraw" role="button" tabindex="0" aria-label="Draw a card"' : '';
    const deck = flip && s.deck.length ? uc(s, s.deck.at(-1), {side:1 - s.side, cls:canDraw ? 'canpick' : '', attrs:da})
      : `<div class="uc uback ${canDraw ? 'canpick' : ''}" ${da}>${BACK}</div>`;
    const cc = s.color != null ? UCOL[s.color].hex : (s.side ? '#f3e9ff' : '#ffffff');
    if (lastSide.gid === s.gid && lastSide.side !== s.side) flipT = Date.now();
    lastSide = {gid:s.gid, side:s.side};
    if (lastDir.gid === s.gid && lastDir.dir !== s.dir) dirT = Date.now();
    lastDir = {gid:s.gid, dir:s.dir};
    const fl = since(flipT, 900), turned = since(dirT, 900);
    let big, hint = '';
    if (s.phase === 'over') big = `${esc(P(s, s.winner).name)} ${P(s, s.winner).hand.length ? 'is the last one standing' : 'went out'}`;
    else if (s.roul) big = myTurn ? 'Spin the roulette' : `${esc(who.name)} spins the roulette`;
    else if (s.stack) big = myTurn ? `Stack it or take ${s.stack.n}` : `${esc(cur.name)} faces +${s.stack.n}`;
    else if (pd){ big = myTurn ? 'Draw or challenge' : `${esc(who.name)} is deciding`; hint = `${esc(P(s, pd.by).name)} played ${NAME[pd.v]}`; }
    else if (myTurn) big = s.step === 'drawn' ? (nm ? 'Play the card you drew' : 'Play it or keep it') : 'Your turn';
    else big = `${esc(cur.name)}’s turn`;
    const xy = seatXY(opps.length);
    return `<div class="game uno-room ${flip ? 'is-flip' : ''} ${nm ? 'is-nm' : ''} ${s.side ? 'dark' : 'light'}"><div class="main">
      <header class="uno-bar">
        <div class="uno-logo" aria-label="${NICE}"><b>UNO</b>${tag}</div>
        <span class="uno-meta">Round ${s.round} · ${s.cfg.target <= 1 ? 'one round' : `first to ${s.cfg.target}`}${flip ? ` · ${s.side ? 'Dark' : 'Light'} Side` : ''}${nm ? ` · ${alive(s).length} of ${s.players.length} still in` : ''}</span>
        <div class="tools">${s.code ? `<span class="codechip">${esc(s.code)}</span>` : ''}<button class="tool" data-do="rules">Rules</button><button class="tool" data-do="mute">${muted ? 'Sound off' : 'Sound on'}</button><button class="tool" data-do="leave">Leave</button></div>
      </header>
      <section class="uno-table ${fl >= 0 ? 'flipping' : ''}" style="--cc:${cc};${fl >= 0 ? `animation-delay:-${fl}ms` : ''}">
        <div class="uno-felt"><span class="uno-floor" aria-hidden="true">UNO</span></div>
        ${opps.map((p, i) => {
          const n = p.hand.length, m = Math.min(n, 9);
          const fan = flip ? p.hand.slice(0, m).map(id => uc(s, id, {side:1 - s.side, cls:'mini'})) : Array.from({length:m}, () => `<div class="uc uback mini">${BACK}</div>`);
          return `<div class="uno-seat ${p.id === actor ? 'up' : ''} ${p.out ? 'gone' : ''} ${nm && n >= 18 ? 'danger' : ''}" style="left:${xy[i][0]}%;top:${xy[i][1]}%" data-pid="${esc(p.id)}">
            <div class="uno-fan" ${flip ? `title="The other side of ${esc(p.name)}’s cards"` : ''}>${fan.map((h, j) => `<div style="--j:${j - (m - 1) / 2}">${h}</div>`).join('')}</div>
            <div class="uno-who">${avatar(s, p)}<span class="uno-n">${n}</span></div>
            <b>${on && !on.has(p.id) ? '<span class="dot"></span> ' : ''}${esc(p.name)}</b><small>${s.totals[p.id] || 0} pts</small>
            ${nm && !p.out ? `<span class="uno-mercy" style="--m:${Math.min(1, n / 25)}" title="${n} of 25 cards"></span>` : ''}${p.out ? '<span class="uno-tag out">OUT</span>' : ''}
            ${n !== 1 ? '' : !p.unoMiss ? '<span class="uno-tag">UNO!</span>' : meP && s.phase === 'play' ? `<button class="uno-catch" data-do="unocatch" data-id="${esc(p.id)}">Catch! No UNO</button>` : ''}
          </div>`; }).join('')}
        <div class="uno-pit">
          <svg class="uno-ring ${turned ? 'turned' : ''}" viewBox="0 0 200 200" aria-hidden="true" style="--rd:${s.dir}"><defs><marker id="uah" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs><g ${s.dir < 0 ? 'transform="translate(200 0) scale(-1 1)"' : ''}>${RING}</g></svg>
          <div class="uno-deck" id="deck">${deck}<span class="uno-left">${s.deck.length}</span></div>
          <div class="upile">${s.pile.slice(-4).map(id => `<div style="transform:rotate(${rotOf(id) * 1.6}deg)">${uc(s, id, {cid:true})}</div>`).join('')}</div>
          ${s.stack ? `<div class="uno-stack" aria-live="polite">+${s.stack.n}</div>` : ''}
          <span class="uno-color">${s.roul ? 'Roulette!' : s.color != null ? UCOL[s.color].name : 'Any color'}</span>
          <span class="uno-dirchip" title="Direction of play">${s.dir > 0 ? '↻ Clockwise' : '↺ Counter-clockwise'}</span>
        </div>
      </section>
      <div class="uno-say" aria-live="polite"><b>${big}</b>${hint ? `<span>${hint}</span>` : ''}<span class="uno-last">${esc(s.log.at(-1)?.text || '')}</span></div>
      ${meP?.out ? '<div class="spect">No mercy: you hit 25 cards and you’re out of this round.</div>' : meP ? mine(s, meP, myTurn) : '<div class="spect">You’re watching this game.</div>'}
    </div></div>${modal(s)}${curtain(s)}`;
  }
  function mine(s, meP, myTurn){
    const key = id => ((face(s, id).c ?? 9) * 100) + ORD.indexOf(face(s, id).v);
    const hand = [...meP.hand].sort((a, b) => key(a) - key(b)), n = hand.length;
    const act = myTurn && !s.pend && !s.roul;
    const ok = id => act && (s.step === 'play' || id === s.drawn) && legal(s, id), any = hand.some(ok);
    const unoNow = act && n === 2 && any, late = meP.unoMiss && n === 1 && s.phase === 'play';
    const hint = !act ? (myTurn ? '' : `${n} card${n === 1 ? '' : 's'} in your hand`) : s.step === 'drawn' ? `You drew ${label(face(s, s.drawn))}. ${nm ? 'Play it.' : 'Play it, or keep it.'}`
      : s.stack ? (any ? `Stack a +${s.stack.last} or higher, or take ${s.stack.n}.` : `Nothing to stack. Take ${s.stack.n}.`)
      : unoNow ? (ui.unoArm ? 'UNO called. Now play your card.' : 'Two cards left: hit UNO before you play.') : any ? (nm ? 'Tap a lit card to play it.' : 'Tap a lit card to play it, or draw.') : nm ? 'Nothing matches. Draw until you can play.' : 'Nothing matches. Draw a card.';
    return `<section class="uno-me ${myTurn ? 'up' : ''}" data-pid="${esc(me)}">
      <div class="uno-hand" style="--n:${n}">${hand.map((id, i) => `<div class="uno-slot ${act ? ok(id) ? 'ok' : 'no' : ''}" style="--i:${(i - (n - 1) / 2).toFixed(2)}">${uc(s, id, {cid:true, attrs:ok(id) ? `data-do="unoplay" data-id="${id}" role="button" tabindex="0" aria-label="Play ${label(face(s, id))}"` : ''})}</div>`).join('')}</div>
      <div class="uno-dock">
        <div class="uno-me-who">${avatar(s, meP)}<b>${esc(meP.name)}</b><small>${s.totals[me] || 0} pts</small>${nm ? `<small class="uno-count ${n >= 18 ? 'danger' : ''}">${n}/25 cards</small>` : ''}</div>
        <span class="uno-hint">${hint}</span>
        ${act && s.step === 'play' && (!nm || s.stack || !any) ? `<button class="uno-btn ${s.stack ? 'take' : ''}" data-do="unodraw">${s.stack ? `Take +${s.stack.n}` : nm ? 'Draw until playable' : 'Draw'}</button>` : ''}
        ${act && s.step === 'drawn' && !nm ? '<button class="uno-btn" data-do="unopass">Keep it</button>' : ''}
        <button class="uno-call ${ui.unoArm ? 'on' : ''} ${unoNow && !ui.unoArm || late ? 'urgent' : ''}" data-do="${late ? 'unolate' : 'unoarm'}" ${unoNow || late ? '' : 'disabled'} aria-pressed="${!!ui.unoArm}"><small>CALL</small>UNO</button>
      </div>
    </section>`;
  }
  function modal(s){
    if (ui.modal === 'rules') return rules();
    if (s.phase === 'over'){
      const w = P(s, s.winner), champ = s.champion && P(s, s.champion), next = mode === 'local' || mode === 'host';
      const rows = [...s.players].sort((a, b) => (s.totals[b.id] || 0) - (s.totals[a.id] || 0));
      return sheet(`<div class="eyebrow">Round ${s.round}</div><h2>${champ ? `${esc(champ.name)} wins the match!` : `${esc(w.name)} ${w.hand.length ? 'is the last one standing' : 'went out'}`}</h2>
        <p class="lede">${esc(w.name)} scores ${s.gain}${nm && s.ko ? `: ${s.gain - s.ko * KO} for cards left in other hands and ${s.ko * KO} for ${s.ko} knockout${s.ko > 1 ? 's' : ''}` : ' for the cards left in everyone’s hands'}${flip ? `, counted on the ${s.side ? 'Dark' : 'Light'} Side` : ''}.</p>
        <div class="rres">${rows.map(p => `<div class="rr ${p === w ? 'win' : ''}"><div style="min-width:0"><b>${esc(p.name)}</b> ${p === w ? `<span class="chipst good">${p.hand.length ? 'Last one standing' : 'Out'}</span>` : p.out ? '<span class="chipst">Knocked out</span>' : ''}
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
    if (s.roul && s.roul.victim === me) return sheet(`<div class="eyebrow">Wild Color Roulette</div><h2>Pick a color</h2>
      <p class="lede">You’ll turn over cards until that color shows up, keep every one, and lose your turn. Wilds don’t count.</p>
      <div class="ucolors">${colors(s).map(c => `<button class="ucol" data-do="unoroul" data-c="${c}" style="--uc:${UCOL[c].hex}">${UCOL[c].name}</button>`).join('')}</div>`);
    if (ui.unoSwap != null && meP?.hand.includes(ui.unoSwap)) return sheet(`<div class="eyebrow">7 swap</div><h2>Swap hands with who?</h2>
      <p class="lede">You must trade hands with another player. After the 7 you’ll have ${meP.hand.length - 1} card${meP.hand.length === 2 ? '' : 's'}.</p>
      <div class="uswap">${alive(s).filter(p => p !== meP).map(p => `<button class="uno-btn" data-do="unoswap" data-id="${esc(p.id)}">${avatar(s, p)} ${esc(p.name)}<small>${p.hand.length} card${p.hand.length === 1 ? '' : 's'}</small></button>`).join('')}</div>
      <div class="acts"><button class="btn" data-do="unox">Cancel</button></div>`);
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
    return `<div class="curtain"><div><div class="eyebrow">Pass the device</div><h2>${avatar(s, p)} ${esc(p.name)}</h2><p class="muted">${s.pend ? `${esc(P(s, s.pend.by).name)} played ${NAME[s.pend.v]} on you` : s.roul ? 'Color Roulette: pick a color' : s.stack ? `You face +${s.stack.n}` : 'Your turn'}</p><br><button class="btn gold" data-do="reveal">I’m ${esc(p.name)}. Show my cards</button></div></div>`;
  }


  /* ----- motion: every card travels -----
     After each render we compare with the last state drawn: a new round is dealt card by card from the deck,
     a played card flies from whoever held it to the pile (turning face up), drawn cards fly from the deck to
     the player, swapped hands fly between seats. Skips, reverses, color changes, penalties and UNO calls each
     get a short effect. Works the same on every device, since each one compares its own before and after. */
  let seen = null;
  const centre = el => { const r = el.getBoundingClientRect(); return {x:r.left + r.width / 2, y:r.top + r.height / 2, w:r.width}; };
  function flyCard({from, to, front, up = true, down = false, delay = 0, dur = 520, rot = 0, onDone}){
    const el = document.createElement('div'); el.className = 'ufly'; el.style.width = to.w + 'px';
    el.innerHTML = `<div class="ufly-in"><div class="ufly-f">${front || `<div class="uc">${BACK}</div>`}</div><div class="ufly-b"><div class="uc">${BACK}</div></div></div>`;
    document.body.append(el);
    const h = to.w * 178 / 120, at = (p, k, r) => `translate(${p.x - to.w / 2}px,${p.y - h / 2}px) rotate(${r}deg) scale(${k})`;
    const mid = {x:(from.x + to.x) / 2, y:(from.y + to.y) / 2 - Math.min(90, Math.hypot(to.x - from.x, to.y - from.y) * .18)};
    const a = el.animate([{transform:at(from, from.w / to.w, rot - 14)}, {transform:at(mid, 1.12, rot - 4), offset:.55}, {transform:at(to, 1, rot)}],
      {duration:dur, delay, easing:'cubic-bezier(.22,.8,.25,1)', fill:'both'});
    if (front && (down || !up)) el.firstElementChild.animate(down ? [{transform:'rotateY(180deg)'}, {transform:'rotateY(180deg)', offset:.25}, {transform:'rotateY(0)'}] : [{transform:'none'}],
      {duration:dur, delay, easing:'ease-in-out', fill:'both'});
    if (!front) el.firstElementChild.style.transform = 'none';
    setTimeout(() => sfx('flick'), delay);
    let ended = false;
    const end = () => { if (ended) return; ended = true; el.remove(); onDone?.(); };
    a.onfinish = end; setTimeout(end, delay + dur + 500);
  }
  const land = el => { if (!el) return; el.style.visibility = ''; el.classList.remove('uland'); void el.offsetWidth; el.classList.add('uland'); };
  // Effects float in a layer over the table and remove themselves.
  function fx(html, at, cls, ms = 1100, delay = 0){
    setTimeout(() => {
      const el = document.createElement('div'); el.className = 'ufx ' + cls; el.innerHTML = html;
      el.style.left = at.x + 'px'; el.style.top = at.y + 'px';
      document.body.append(el); setTimeout(() => el.remove(), ms);
    }, delay);
  }
  const burst = (at, color, delay) => fx(Array.from({length:16}, (_, i) => { const a = i / 16 * Math.PI * 2, d = 90 + (i % 3) * 30;
    return `<i style="--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;background:${color}"></i>`; }).join('') + `<b style="border-color:${color}"></b>`, at, 'uburst', 1000, delay);
  function motion(s, before){
    const done = new Set(), prev = seen;
    if (app.querySelector('.curtain')) return done;   // behind the pass screen: show what happened once the next player looks
    seen = {gid:s.gid, ln:s.ln, side:s.side, pile:[...s.pile], hands:Object.fromEntries(s.players.map(p => [p.id, [...p.hand]]))};
    if (reduce || s.phase === 'lobby') return done;
    const deckEl = app.querySelector('#deck .uc'); if (!deckEl) return done;
    const deck = centre(deckEl);
    const seatEl = pid => app.querySelector(`.uno-seat[data-pid="${CSS.escape(pid)}"]`);
    const fanEl = pid => seatEl(pid)?.querySelector('.uno-fan');
    const slot = id => app.querySelector(`.uno-hand [data-cid="${id}"]`);
    const pileEl = id => app.querySelector(`.upile [data-cid="${id}"]`);
    const spot = pid => { const f = fanEl(pid) || seatEl(pid); if (f) return {...centre(f), w:Math.max(26, centre(f).w / 4)};
      const me2 = app.querySelector('.uno-hand'); return me2 ? {...centre(me2), w:60} : deck; };
    const hide = el => { if (el){ el.style.visibility = 'hidden'; } return el; };
    // A new round: deal it out, one card at a time, round the table
    const fresh0 = s.pile.length === 1 && s.log.length <= 3;   // a round that has only just been dealt
    if (fresh0 && (dealAnim || !prev || prev.gid !== s.gid)){
      dealAnim = false;
      const n = Math.max(...s.players.map(p => p.hand.length)), total = s.players.reduce((a, p) => a + p.hand.length, 0), stag = Math.min(70, 2400 / Math.max(1, total));
      const fans = Object.fromEntries(s.players.map(p => [p.id, [...(fanEl(p.id)?.children || [])]]));
      Object.values(fans).flat().forEach(hide);
      let k = 0;
      for (let r = 0; r < n; r++) for (const p of s.players){
        const id = p.hand[r]; if (id == null) continue;
        if (p.id === me){ const el = hide(slot(id)); if (el){ done.add(String(id)); flyCard({from:deck, to:centre(el), front:uc(s, id), down:true, delay:k++ * stag, rot:0, onDone:() => land(el)}); continue; } }
        const f = fans[p.id], el = f?.[Math.min(r, f.length - 1)];
        flyCard({from:deck, to:el ? centre(el) : spot(p.id), delay:k++ * stag, dur:460, onDone:() => { if (el) el.style.visibility = ''; }});
      }
      const top = s.pile.at(-1), pe = hide(pileEl(top));
      if (pe){ done.add(String(top)); flyCard({from:deck, to:centre(pe), front:uc(s, top), down:true, delay:k * stag + 200, onDone:() => land(pe)}); }
      return done;
    }
    if (!prev || s.ln < prev.ln || prev.side !== s.side) return done;
    let k = 0;
    // Plays: from the hand that held the card to the pile
    for (const id of s.pile.filter(id => !prev.pile.includes(id))){
      const el = pileEl(id); if (!el) continue;
      const owner = Object.keys(prev.hands).find(pid => prev.hands[pid].includes(id)), was = before.get(String(id));
      const from = was ? {x:was.left + was.width / 2, y:was.top + was.height / 2, w:was.width} : owner ? spot(owner) : deck;
      done.add(String(id)); hide(el);
      flyCard({from, to:centre(el), front:uc(s, id), down:!was, delay:k++ * 110, rot:parseFloat(el.parentElement.style.transform.replace(/[^\d.-]/g, '')) || 0, onDone:() => { land(el); sfx('card'); }});
    }
    const after = k * 110 + (k ? 250 : 0);
    // Draws (from the deck) and swaps (from another player)
    for (const p of s.players){
      const add = p.hand.filter(id => !(prev.hands[p.id] || []).includes(id));
      add.slice(0, 12).forEach((id, j) => {
        const from = Object.keys(prev.hands).find(pid => pid !== p.id && prev.hands[pid].includes(id));
        const src = from ? spot(from) : deck, d = after + j * 120;
        if (p.id === me){ const el = slot(id); if (!el) return; done.add(String(id)); hide(el); flyCard({from:src, to:centre(el), front:uc(s, id), down:true, delay:d, onDone:() => land(el)}); }
        else flyCard({from:src, to:spot(p.id), delay:d, dur:480});
      });
    }
    // Effects for what just happened
    const fresh = s.log.filter(e => e.n > prev.ln), at = pid => pid === me ? (app.querySelector('.uno-hand') ? centre(app.querySelector('.uno-hand')) : deck) : spot(pid);
    const pileC = app.querySelector('.upile') ? centre(app.querySelector('.upile')) : deck;
    for (const e of fresh){
      for (const pid of e.to || []){
        if (/skipped/.test(e.you)) fx(`<svg viewBox="-40 -40 80 80">${ink(SHAPE.skip, '#fff')}</svg>`, at(pid), 'ustamp', 1200, after);
        const m = e.you.match(/\+(\d+)|draw (\d+)/); if (m) fx(`<span>+${m[1] || m[2]}</span>`, at(pid), 'upen', 1300, after);
      }
      const u = e.text.match(/^(.+): UNO!$/), up = u && s.players.find(p => p.name === u[1]);
      if (up) fx('<span>UNO!</span>', at(up.id), 'ucall', 1400);
    }
    const topF = face(s, s.pile.at(-1));
    if (s.pile.at(-1) !== prev.pile.at(-1)){
      if (topF.v === 'rev') fx(`<svg viewBox="-40 -40 80 80">${ink(SHAPE.rev, '#fff')}</svg>`, pileC, 'urev', 1000, 250);
      if (topF.c == null && s.color != null) burst(pileC, UCOL[s.color].hex, 350);
    }
    return done;
  }

  const late = {unit:'points', why:'the lowest score at the table', score:s => Math.min(...s.players.map(p => s.totals[p.id] || 0))};
  // Out of time: take any penalty, draw, and play a drawn card only where the rules insist (No Mercy).
  function timeout(s, pid){
    const p = P(s, pid), cs = colors(s), n = cs.map(k => p.hand.filter(id => face(s, id).c === k).length), most = cs[n.indexOf(Math.max(...n))];
    if (s.roul) return {t:'roulette', color:most};
    if (s.pend) return {t:'accept'};
    if (s.stack) return {t:'draw'};
    const play = card => ({t:'play', card, color:most, target:alive(s).find(q => q !== p)?.id, uno:true});
    if (s.step === 'drawn') return nm ? play(s.drawn) : {t:'pass'};
    const can = nm ? p.hand.find(id => canPlay(s, id)) : null;   // No Mercy: no drawing while you can play
    return can != null ? play(can) : {t:'draw'};
  }
  return {name:NICE, nm, late, timeout, min:2, max:nm ? 6 : 10, cfg, CARDS, STACK, newGame, apply, needs, home, view, rules, art, face, canPlay, legal, pts, uc, BACK, motion,
    lobby:(s, host) => host
      ? `<div class="row"><label class="muted" for="unocap">Play to</label>${capInput('unocap', 'target', s.cfg?.target ?? cfg.target, TARGETS.map(t => t[0]), 1, 10000)}<span class="muted">points · 1 for a single round</span></div>`
      : `<p class="muted">Playing ${(s.cfg?.target ?? cfg.target) <= 1 ? 'a single round' : `to ${(s.cfg?.target ?? cfg.target).toLocaleString()} points`}</p>`};
}
ENG.uno = makeUno('classic');
ENG.unoflip = makeUno('flip');
ENG.unonm = makeUno('nomercy');
Object.assign(H, {
  unoplay:d => {
    const id = +d.id, s = viewState(), e = ENG[GID], f = e.face(s, id);
    if (f.c == null && f.v !== 'roul'){ ui.unoPick = id; return render(); }
    if (e.nm && f.v === '7' && P(s, me).hand.length > 1){ ui.unoSwap = id; return render(); }   // a No Mercy 7 needs someone to swap with
    send({t:'play', card:id, uno:!!ui.unoArm});
  },
  unoswap:d => send({t:'play', card:ui.unoSwap, target:d.id, uno:!!ui.unoArm}),
  unoroul:d => send({t:'roulette', color:+d.c}),
  unocolor:d => send({t:'play', card:ui.unoPick, color:+d.c, uno:!!ui.unoArm}),
  unox:() => { ui.unoPick = null; ui.unoSwap = null; render(); },
  unoarm:() => { ui.unoArm = !ui.unoArm; render(); },
  unodraw:() => send({t:'draw'}),
  unopass:() => send({t:'pass'}),
  unolate:() => send({t:'uno'}),
  unocatch:d => send({t:'catch', target:d.id}),
  unoaccept:() => send({t:'accept'}),
  unochal:() => send({t:'challenge'}),
  unonew:() => { G = {...G, totals:{}, round:0}; rematch(); },
  ladd10:() => { if (form.locals.length < (ENG[GID].max || 10)) form.locals.push(''); render(); },
  unolocal:() => {
    const names = form.locals.map(n => n.trim()).filter(Boolean);
    if (names.length < 2) return toast('Add at least two player names');
    if (names.length > ENG[GID].max) return toast(`${ENG[GID].name} is for up to ${ENG[GID].max} players`);
    mode = 'local'; ui = freshUI(); seenLog = -1;
    G = {...ENG[GID].newGame(names.map((name, i) => ({id:'p' + i, name})), {game:GID}), v:1};
    store.set(GID + '-local', G); screen = 'game'; render();
  },
  unoresume:() => { G = store.get(GID + '-local'); if (!G) return; mode = 'local'; ui = freshUI(); seenLog = -1; screen = 'game'; render(); },
});

