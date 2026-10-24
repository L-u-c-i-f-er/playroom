// UNO and UNO Flip: deck contents, action cards, Flip, challenges, UNO calls, and random matches to a winner.
const fs = require('fs'), path = require('path'), assert = require('assert');
const js = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const stub = `const store={get:(k,d)=>d,set(){}};const rid=n=>Math.random().toString(36).slice(2,2+n);const H={};const app={addEventListener(){}};const ENG={};const rotOf=()=>0;
let ui={},GID='',G=null,mode=null,me='',form={locals:[]},net={},muted=false;const esc=s=>s,sheet=x=>x,avatar=()=>'',send=()=>{},render=()=>{},toast=()=>{},viewState=()=>G,freshUI=()=>({}),live=()=>new Set(),rematch=()=>{},persist=()=>{};let seenLog=0;`;
const {ENG, P} = new Function(js('dealmaker-rules.js') + stub + js('uno.js') + '\nreturn {ENG, P};')();
const U = ENG.uno, F = ENG.unoflip;
const seats = n => Array.from({length:n}, (_, i) => ({id:'p' + i, name:'P' + i}));
const count = (E, sd, pred) => E.CARDS.filter(c => pred(c[sd])).length;
const id = (E, sd, c, v, skip = []) => E.CARDS.findIndex((x, i) => x[sd].c === c && x[sd].v === v && !skip.includes(i));
// A fresh game with chosen hands and top card; everything else stays in the draw pile.
function rig(E, n, hands, top, color){
  const s = E.newGame(seats(n));
  const used = [...hands.flat(), top];
  s.players.forEach((p, i) => { p.hand = [...(hands[i] || [])]; });
  s.pile = [top]; s.deck = [...E.CARDS.keys()].filter(x => !used.includes(x)); s.turn = 0; s.dir = 1; s.pend = null; s.step = 'play';
  s.color = color === undefined ? E.face(s, top).c : color;
  return s;
}

// --- Deck contents
assert.strictEqual(U.CARDS.length, 108);
assert.strictEqual(count(U, 0, f => f.v === '0'), 4);
assert.strictEqual(count(U, 0, f => f.v === '7'), 8);
for (const v of ['skip', 'rev', 'd2']) assert.strictEqual(count(U, 0, f => f.v === v), 8);
for (const v of ['wild', 'wd4']) assert.strictEqual(count(U, 0, f => f.v === v && f.c == null), 4);
assert.strictEqual(F.CARDS.length, 112);
assert.strictEqual(count(F, 0, f => f.v === '0'), 0);
for (const v of ['d1', 'rev', 'skip', 'flip']) assert.strictEqual(count(F, 0, f => f.v === v), 8);
for (const v of ['d5', 'rev', 'skipall', 'flip']) assert.strictEqual(count(F, 1, f => f.v === v), 8);
for (const v of ['wild', 'wd2']) assert.strictEqual(count(F, 0, f => f.v === v), 4);
for (const v of ['wild', 'wdc']) assert.strictEqual(count(F, 1, f => f.v === v), 4);
assert(F.CARDS.every(c => c[0].c == null || c[0].c < 4) && F.CARDS.every(c => c[1].c == null || c[1].c >= 4), 'light colors 0–3, dark 4–7');
assert.strictEqual(U.CARDS.reduce((t, c) => t + U.pts(c[0]), 0), 4 * (45 * 2) + 24 * 20 + 8 * 50);
assert.strictEqual(F.pts({c:null, v:'wdc'}), 60); assert.strictEqual(F.pts({c:4, v:'skipall'}), 30); assert.strictEqual(F.pts({c:0, v:'d1'}), 10); assert.strictEqual(F.pts({c:null, v:'wild'}), 40);

// --- Matching, drawing, action cards
{
  const r5 = id(U, 0, 0, '5'), b5 = id(U, 0, 3, '5'), b7 = id(U, 0, 3, '7'), g2 = id(U, 0, 2, '2'), wild = id(U, 0, null, 'wild');
  let s = rig(U, 3, [[b5, b7, g2, wild], [g2 + 1], [id(U, 0, 1, '1')]], r5);
  assert(U.apply(s, 'p0', {t:'play', card:b7}).includes('match'));
  assert(U.apply(s, 'p1', {t:'play', card:g2 + 1}).includes('not your turn'));
  assert(U.apply(s, 'p0', {t:'play', card:wild}).includes('color'));
  assert.strictEqual(U.apply(s, 'p0', {t:'play', card:b5}), undefined, 'same number');
  assert.strictEqual(s.color, 3); assert.strictEqual(s.turn, 1);
  // Draw: a playable drawn card may be played, nothing else from the hand.
  s = rig(U, 2, [[b7, g2], [r5]], b5); s.deck.push(id(U, 0, 3, '9'));
  assert.strictEqual(U.apply(s, 'p0', {t:'draw'}), undefined); assert.strictEqual(s.step, 'drawn');
  assert(U.apply(s, 'p0', {t:'play', card:b7}).includes('card you drew'));
  assert.strictEqual(U.apply(s, 'p0', {t:'pass'}), undefined); assert.strictEqual(s.turn, 1); assert.strictEqual(s.players[0].hand.length, 3);
  // An unplayable drawn card ends the turn at once.
  s = rig(U, 2, [[g2], [r5]], b5); s.deck.push(id(U, 0, 0, '9'));
  assert.strictEqual(U.apply(s, 'p0', {t:'draw'}), undefined); assert.strictEqual(s.turn, 1); assert.strictEqual(s.step, 'play');
  // Skip, Reverse (and Reverse as Skip with two), Draw Two.
  const bs = id(U, 0, 3, 'skip'), br = id(U, 0, 3, 'rev'), bd = id(U, 0, 3, 'd2');
  s = rig(U, 4, [[bs, b7], [], [], []], b5); U.apply(s, 'p0', {t:'play', card:bs}); assert.strictEqual(s.turn, 2);
  s = rig(U, 4, [[br, b7], [], [], []], b5); U.apply(s, 'p0', {t:'play', card:br}); assert.strictEqual(s.turn, 3); assert.strictEqual(s.dir, -1);
  s = rig(U, 2, [[br, b7], [g2]], b5); U.apply(s, 'p0', {t:'play', card:br}); assert.strictEqual(s.turn, 0, 'two players: Reverse skips');
  s = rig(U, 3, [[bd, b7], [g2], [r5]], b5); U.apply(s, 'p0', {t:'play', card:bd});
  assert.strictEqual(s.players[1].hand.length, 3); assert.strictEqual(s.turn, 2);
}

// --- Wild Draw Four challenges
{
  const r5 = id(U, 0, 0, '5'), r9 = id(U, 0, 0, '9'), b2 = id(U, 0, 3, '2'), wd4 = id(U, 0, null, 'wd4');
  let s = rig(U, 3, [[wd4, r9, b2], [b2 + 1], [r5 + 1]], r5);
  assert.strictEqual(U.apply(s, 'p0', {t:'play', card:wd4, color:1}), undefined, 'bluffing is allowed');
  assert.deepStrictEqual(U.needs(s), ['p1']); assert.strictEqual(s.pend.legal, false);
  assert(U.apply(s, 'p1', {t:'draw'}).includes('challenge'));
  assert.strictEqual(U.apply(s, 'p1', {t:'challenge'}), undefined);
  assert.strictEqual(s.players[0].hand.length, 6, 'guilty player draws 4'); assert.strictEqual(s.turn, 1, 'challenger plays'); assert.strictEqual(s.color, 1);
  s = rig(U, 3, [[wd4, b2, b2 + 1], [r9], [r5 + 1]], r5);
  U.apply(s, 'p0', {t:'play', card:wd4, color:3}); assert.strictEqual(s.pend.legal, true);
  U.apply(s, 'p1', {t:'challenge'});
  assert.strictEqual(s.players[1].hand.length, 7, 'failed challenge draws 6'); assert.strictEqual(s.turn, 2);
  s = rig(U, 3, [[wd4, b2, b2 + 1], [r9], [r5 + 1]], r5);
  U.apply(s, 'p0', {t:'play', card:wd4, color:3}); U.apply(s, 'p1', {t:'accept'});
  assert.strictEqual(s.players[1].hand.length, 5); assert.strictEqual(s.turn, 2);
}

// --- UNO calls
{
  const r5 = id(U, 0, 0, '5'), r6 = id(U, 0, 0, '6'), r7 = id(U, 0, 0, '7'), g1 = id(U, 0, 2, '1');
  let s = rig(U, 3, [[r6, r7], [g1], [g1 + 1]], r5);
  U.apply(s, 'p0', {t:'play', card:r6});
  assert(s.players[0].unoMiss);
  assert.strictEqual(U.apply(s, 'p2', {t:'catch', target:'p0'}), undefined, 'anyone can catch');
  assert.strictEqual(s.players[0].hand.length, 3);
  s = rig(U, 3, [[r6, r7], [g1, g1 + 2], [g1 + 1]], r5);
  U.apply(s, 'p0', {t:'play', card:r6, uno:true});
  assert(U.apply(s, 'p1', {t:'catch', target:'p0'}).includes('safe'));
  s = rig(U, 3, [[r6, r7], [g1, id(U, 0, 0, '1')], [g1 + 1]], r5);
  U.apply(s, 'p0', {t:'play', card:r6});
  U.apply(s, 'p1', {t:'play', card:id(U, 0, 0, '1')});
  assert(U.apply(s, 'p2', {t:'catch', target:'p0'}).includes('safe'), 'too late once the next player acts');
}

// --- Flip side: Flip, Skip Everyone, Draw Five, Wild Draw Color, scoring by side
{
  const fl = id(F, 0, 0, 'flip'), r3 = id(F, 0, 0, '3');
  let s = rig(F, 3, [[fl, r3], [r3 + 1], [id(F, 0, 1, '2')]], id(F, 0, 0, '8'));
  const bottom = s.pile[0];
  s.pile.unshift(id(F, 0, 2, '4'));   // the card that will come up after the flip
  const up = s.pile[0], deckTop = s.deck[0];
  assert.strictEqual(F.apply(s, 'p0', {t:'play', card:fl}), undefined);
  assert.strictEqual(s.side, 1); assert.strictEqual(s.pile.at(-1), up); assert.strictEqual(s.pile[0], fl, 'Flip card ends up at the bottom');
  assert.strictEqual(s.deck.at(-1), deckTop, 'draw pile turned over'); assert.notStrictEqual(bottom, undefined);
  assert.strictEqual(s.color, F.face(s, up).c); assert.strictEqual(s.turn, 1);
  // Skip Everyone: same player again. Draw Five: next draws 5 and is skipped.
  const sa = id(F, 1, 4, 'skipall'), d5 = id(F, 1, 4, 'd5'), p1 = id(F, 1, 4, '1');
  s = rig(F, 3, [[sa, p1, d5], [], []], id(F, 1, 4, '9')); s.side = 1; s.color = 4;
  F.apply(s, 'p0', {t:'play', card:sa}); assert.strictEqual(s.turn, 0);
  F.apply(s, 'p0', {t:'play', card:d5}); assert.strictEqual(s.players[1].hand.length, 5); assert.strictEqual(s.turn, 2);
  // Wild Draw Color: draw until the chosen color, then lose the turn.
  const wdc = id(F, 1, null, 'wdc');
  s = rig(F, 3, [[wdc, id(F, 1, 5, '2')], [], []], id(F, 1, 4, '9')); s.side = 1; s.color = 4;
  F.apply(s, 'p0', {t:'play', card:wdc, color:7}); F.apply(s, 'p1', {t:'accept'});
  const h = s.players[1].hand;
  assert.strictEqual(F.face(s, h.at(-1)).c, 7); assert(h.slice(0, -1).every(x => F.face(s, x).c !== 7)); assert.strictEqual(s.turn, 2);
  // The round ends on the side in play: the loser's cards count their Dark Side.
  s = rig(F, 2, [[id(F, 1, 4, '2')], [wdc]], id(F, 1, 4, '9')); s.side = 1; s.color = 4;
  F.apply(s, 'p0', {t:'play', card:s.players[0].hand[0]});
  assert.strictEqual(s.phase, 'over'); assert.strictEqual(s.gain, 60); assert.strictEqual(s.totals.p0, 60);
}

// --- Random matches to the end, checking every card is accounted for
for (const [E, name] of [[U, 'uno'], [F, 'uno flip']]){
  let matches = 0, rounds = 0, flips = 0, challenges = 0, catches = 0;
  for (let m = 0; m < 60; m++){
    const n = 2 + m % 9;
    let extra = {cfg:{target:500}}, s;
    for (let r = 0; r < 100; r++){
      s = E.newGame(seats(n), extra); rounds++;
      for (let step = 0; step < 20000 && s.phase === 'play'; step++){
        const all = [...s.deck, ...s.pile, ...s.players.flatMap(p => p.hand)];
        assert.strictEqual(all.length, E.CARDS.length); assert.strictEqual(new Set(all).size, E.CARDS.length);
        const pid = E.needs(s)[0], p = P(s, pid), side = s.side;
        const miss = s.players.find(q => q.unoMiss && q.id !== pid);
        if (miss && Math.random() < .5){ assert.strictEqual(E.apply(s, pid, {t:'catch', target:miss.id}), undefined); catches++; continue; }
        if (s.pend){ const ch = Math.random() < .3; challenges += ch; assert.strictEqual(E.apply(s, pid, {t:ch ? 'challenge' : 'accept'}), undefined); continue; }
        const ok = p.hand.filter(x => (s.step === 'play' || x === s.drawn) && E.canPlay(s, x));
        if (ok.length && (s.step === 'play' || Math.random() < .8)){
          const card = ok[Math.random() * ok.length | 0], color = (side ? 4 : 0) + (Math.random() * 4 | 0);
          assert.strictEqual(E.apply(s, pid, {t:'play', card, color, uno:Math.random() < .8}), undefined);
          if (s.side !== side) flips++;
        } else assert.strictEqual(E.apply(s, pid, {t:s.step === 'drawn' ? 'pass' : 'draw'}), undefined);
      }
      assert.strictEqual(s.phase, 'over', 'round ended');
      const w = P(s, s.winner);
      assert.strictEqual(w.hand.length, 0);
      assert.strictEqual(s.gain, s.players.reduce((t, p) => t + p.hand.reduce((a, x) => a + E.pts(E.face(s, x)), 0), 0));
      if (s.champion){ matches++; assert(s.totals[s.champion] >= 500); break; }
      extra = {cfg:s.cfg, totals:s.totals, round:s.round};
    }
    assert(s.champion, 'match finished');
  }
  console.log(`ok: ${name} — rules verified; ${matches} random matches over ${rounds} rounds (${flips} flips, ${challenges} challenges, ${catches} UNO catches)`);
}

// --- UNO Show 'Em No Mercy
{
  const N = ENG.unonm, nid = (c, v, skip = []) => id(N, 0, c, v, skip);
  const ok = (s, pid, a) => assert.strictEqual(N.apply(s, pid, a), undefined, JSON.stringify(a));
  const all = s => [...s.deck, ...s.pile, ...s.aside, ...s.players.flatMap(p => p.hand)];
  // deck: 168 cards
  assert.strictEqual(N.CARDS.length, 168);
  assert.strictEqual(count(N, 0, f => f.v === '0'), 4);
  assert.strictEqual(count(N, 0, f => f.v === '7'), 8);
  for (const v of ['skip', 'rev', 'd2', 'd4', 'skipall', 'discard']) assert.strictEqual(count(N, 0, f => f.v === v), 12, v);
  for (const v of ['wild', 'wrd4', 'wd6', 'wd10', 'roul']) assert.strictEqual(count(N, 0, f => f.v === v && f.c == null), 4, v);
  assert.strictEqual(N.max, 6);
  const fresh = N.newGame(seats(4));
  assert(/^\d$/.test(N.face(fresh, fresh.pile[0]).v), 'only a number card starts the pile');
  assert.strictEqual(fresh.cfg.target, 1000);

  const r5 = nid(0, '5'), r9 = nid(0, '9'), b5 = nid(3, '5'), g3 = nid(2, '3'), y1 = nid(1, '1');
  // Stacking: equal or higher, any color; the one who can't takes the lot
  {
    const d2r = nid(0, 'd2'), d4b = nid(3, 'd4'), w6 = nid(null, 'wd6'), d2g = nid(2, 'd2');
    const s = rig(N, 3, [[d2r, r9], [d4b, g3], [d2g, y1]], r5);
    ok(s, 'p0', {t:'play', card:d2r});
    assert.deepStrictEqual(s.stack, {n:2, last:2}); assert.strictEqual(s.turn, 1);
    assert(N.apply(s, 'p1', {t:'play', card:g3}).includes('Stack'), 'only a draw card answers a stack');
    ok(s, 'p1', {t:'play', card:d4b});
    assert.deepStrictEqual(s.stack, {n:6, last:4});
    assert(N.apply(s, 'p2', {t:'play', card:d2g}).includes('+4 or higher'), 'a +2 can’t go on a +4');
    ok(s, 'p2', {t:'draw'});
    assert.strictEqual(s.players[2].hand.length, 8, 'takes 6'); assert.strictEqual(s.stack, null); assert.strictEqual(s.turn, 0);
    const t = rig(N, 2, [[nid(0, 'd4'), r9], [w6, g3]], r5);
    ok(t, 'p0', {t:'play', card:nid(0, 'd4')}); ok(t, 'p1', {t:'play', card:w6, color:2});
    assert.deepStrictEqual(t.stack, {n:10, last:6}); assert.strictEqual(t.color, 2);
  }
  // Wild Reverse Draw 4 with two players comes back at you
  {
    const wr = nid(null, 'wrd4'), s = rig(N, 2, [[wr, r9], [g3]], r5);
    ok(s, 'p0', {t:'play', card:wr, color:0});
    assert.strictEqual(s.turn, 0); assert.deepStrictEqual(s.stack, {n:4, last:4});
    ok(s, 'p0', {t:'draw'}); assert.strictEqual(s.players[0].hand.length, 5);
    const t = rig(N, 3, [[wr, r9], [g3], [y1]], r5);
    ok(t, 'p0', {t:'play', card:wr, color:0});
    assert.strictEqual(t.dir, -1); assert.strictEqual(t.turn, 2, 'next in the new direction');
  }
  // Draw until playable, then that card must be played
  {
    const s = rig(N, 2, [[g3, y1], [b5]], r9);
    s.deck.push(r5, nid(2, '8'), nid(1, '4'));   // pops 4y, 8g, then 5r (red matches)
    assert(N.apply(rig(N, 2, [[r5 + 0, y1], [b5]], r9), 'p0', {t:'draw'}).includes('can play'), 'no drawing while holding a match');
    ok(s, 'p0', {t:'draw'});
    assert.strictEqual(s.players[0].hand.length, 5); assert.strictEqual(s.step, 'drawn'); assert.strictEqual(s.drawn, r5);
    assert(N.apply(s, 'p0', {t:'pass'}).includes('play the card you drew'));
    assert(N.apply(s, 'p0', {t:'play', card:g3}).includes('only play the card you drew'));
    ok(s, 'p0', {t:'play', card:r5});
  }
  // Mercy rule: 25 cards and you're out; last one standing wins with 250 per knockout
  {
    const s = rig(N, 3, [[nid(0, 'd2'), r9], Array.from({length:23}, (_, k) => k + 100), [y1, g3]], r5);
    const v = s.players[1].hand; s.deck = s.deck.filter(x => !v.includes(x));
    ok(s, 'p0', {t:'play', card:nid(0, 'd2')}); ok(s, 'p1', {t:'draw'});
    assert(s.players[1].out); assert.strictEqual(s.players[1].hand.length, 0); assert.strictEqual(s.aside.length, 25);
    assert.strictEqual(s.turn, 2, 'turn skips the knocked-out player'); assert.strictEqual(s.phase, 'play');
    assert(N.apply(s, 'p1', {t:'draw'}).includes('out'));
    const t = rig(N, 2, [[nid(0, 'd4'), r9], Array.from({length:22}, (_, k) => k + 100)], r5);
    t.deck = t.deck.filter(x => !t.players[1].hand.includes(x));
    ok(t, 'p0', {t:'play', card:nid(0, 'd4')}); ok(t, 'p1', {t:'draw'});
    assert.strictEqual(t.phase, 'over'); assert.strictEqual(t.winner, 'p0');
    assert.strictEqual(t.gain, 250, 'knockout bonus; the knocked-out hand doesn’t count');
  }
  // 7 swaps hands with a chosen player; 0 passes every hand along
  {
    const r7 = nid(0, '7'), s = rig(N, 3, [[r7, g3, y1], [b5], [r9, nid(2, '9')]], r5);
    assert(N.apply(s, 'p0', {t:'play', card:r7}).includes('swap'));
    ok(s, 'p0', {t:'play', card:r7, target:'p2'});
    assert.deepStrictEqual(s.players[0].hand, [r9, nid(2, '9')]); assert.deepStrictEqual(s.players[2].hand, [g3, y1]);
    const r0 = nid(0, '0'), t = rig(N, 3, [[r0, g3], [b5], [r9, y1]], r5);
    ok(t, 'p0', {t:'play', card:r0});
    assert.deepStrictEqual(t.players.map(p => p.hand), [[r9, y1], [g3], [b5]], 'clockwise: each hand moves one seat on');
  }
  // Discard All takes every card of its color with it
  {
    const da = nid(0, 'discard'), s = rig(N, 2, [[da, r9, nid(0, '2'), g3], [b5]], r5);
    ok(s, 'p0', {t:'play', card:da});
    assert.deepStrictEqual(s.players[0].hand, [g3]); assert.strictEqual(s.pile.at(-1), da); assert.strictEqual(s.pile.length, 4);
    const t = rig(N, 2, [[da, r9], [b5, g3]], r5);
    ok(t, 'p0', {t:'play', card:da}); assert.strictEqual(t.phase, 'over', 'Discard All can win the round');
  }
  // Color Roulette: the victim names the color and turns cards until it shows
  {
    const ro = nid(null, 'roul'), s = rig(N, 3, [[ro, r9], [b5], [y1]], r5);
    ok(s, 'p0', {t:'play', card:ro});
    assert.deepStrictEqual(N.needs(s), ['p1']);
    assert(N.apply(s, 'p1', {t:'play', card:b5}).includes('roulette'));
    s.deck.push(nid(2, '2'), nid(null, 'wild'), nid(1, '6'));   // 6y, wild (doesn't count), 2g
    ok(s, 'p1', {t:'roulette', color:2});
    assert.strictEqual(s.players[1].hand.length, 4); assert.strictEqual(s.color, 2); assert.strictEqual(s.turn, 2, 'victim loses their turn');
  }
  // Skip Everyone, Reverse with two
  {
    const sa = nid(0, 'skipall'), s = rig(N, 3, [[sa, r9], [b5], [y1]], r5);
    ok(s, 'p0', {t:'play', card:sa}); assert.strictEqual(s.turn, 0);
  }
  // Random matches: every card accounted for, someone always wins
  let matches = 0, rounds = 0, kos = 0, stacks = 0;
  for (let m = 0; m < 40; m++){
    const n = 2 + m % 5;
    let extra = {cfg:{target:1000}}, s;
    for (let r = 0; r < 60; r++){
      s = N.newGame(seats(n), extra); rounds++;
      for (let step = 0; step < 5000 && s.phase === 'play'; step++){
        const cards = all(s);
        assert.strictEqual(cards.length, 168); assert.strictEqual(new Set(cards).size, 168);
        const pid = N.needs(s)[0], p = P(s, pid);
        assert(!p.out, 'knocked-out players never act');
        if (s.roul){ ok(s, pid, {t:'roulette', color:Math.random() * 4 | 0}); continue; }
        const can = p.hand.filter(x => (s.step === 'play' || x === s.drawn) && N.legal(s, x));
        if (s.stack && can.length) stacks++;
        if (can.length && (s.step === 'drawn' || !s.stack || Math.random() < .7)){
          const card = can[Math.random() * can.length | 0], f = N.face(s, card);
          const others = s.players.filter(q => q !== p && !q.out);
          ok(s, pid, {t:'play', card, color:Math.random() * 4 | 0, target:others[Math.random() * others.length | 0].id, uno:Math.random() < .9});
        } else ok(s, pid, {t:'draw'});
      }
      assert.strictEqual(s.phase, 'over', 'round ended');
      kos += s.ko;
      if (s.champion){ matches++; break; }
      extra = {cfg:s.cfg, totals:s.totals, round:s.round};
    }
  }
  console.log(`ok: uno no mercy — rules verified; ${matches} random matches over ${rounds} rounds (${kos} mercy knockouts, ${stacks} stacking chances)`);
}
