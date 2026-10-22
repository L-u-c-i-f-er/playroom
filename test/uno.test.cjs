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
