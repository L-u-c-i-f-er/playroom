// Poker: hand ranking, blinds and turn order, min-raise and reopening, side pots, and random hands that never create or lose a chip.
const fs = require('fs'), path = require('path'), assert = require('assert');
const js = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const stub = `const store={get:(k,d)=>d,set(){}};const rid=n=>Math.random().toString(36).slice(2,2+n);const H={};const app={addEventListener(){}};const ENG={};
let ui={},GID='',G=null,mode=null,me='',form={locals:[]},net={},muted=false;const esc=s=>s,sheet=x=>x,avatar=()=>'',send=()=>{},render=()=>{},toast=()=>{},viewState=()=>G,freshUI=()=>({}),live=()=>new Set(),rematch=()=>{},persist=()=>{};let seenLog=0;`;
const {PK, P} = new Function(js('dealmaker-rules.js') + stub + js('poker.js') + '\nreturn {PK, P};')();
const C = t => { const r = 'A23456789TJQK'.indexOf(t[0]), s = '♠♥♦♣'.indexOf(t[1]) >= 0 ? '♠♥♦♣'.indexOf(t[1]) : 'shdc'.indexOf(t[1]); return s * 13 + r; };
const H7 = str => str.split(' ').map(C);
const seats = n => Array.from({length:n}, (_, i) => ({id:'p' + i, name:'P' + i}));
const ok = (s, pid, a) => assert.strictEqual(PK.apply(s, pid, a), undefined, JSON.stringify(a));
const chipsIn = s => s.players.reduce((a, p) => a + p.stack + p.total, 0) - (s.phase === 'over' ? s.players.reduce((a, p) => a + p.total, 0) : 0);

// --- Hand ranking
const order = ['As Ks Qs Js Ts 2d 3c', '9h 9d 9s 9c 2h 3d 4c', 'Kh Kd Ks 7c 7h 2d 3c', 'Ah 9h 6h 4h 2h Kd Kc', '5d 4c 3h 2s Ah Kd Qc',
  'Qh Qd Qs 9c 7h 2d 3c', 'Jh Jd 4s 4c Ah 2d 3c', 'Th Td As 8c 6h 2d 3c', 'Ah Jd 9s 7c 5h 3d 2c'];
const scored = order.map(h => PK.best(H7(h)));
assert.deepStrictEqual(scored.map(b => b.score[0]), [8, 7, 6, 5, 4, 3, 2, 1, 0]);
assert.strictEqual(scored[0].name, 'Royal flush');
assert.strictEqual(scored[2].name, 'Full house, Kings full of Sevens');
assert.strictEqual(scored[4].name, 'Straight, Five high', 'the wheel');
assert(PK.cmp(PK.best(H7('6d 5c 4h 3s 2h Kd Qc')).score, scored[4].score) > 0, 'six-high straight beats the wheel');
assert(PK.cmp(PK.best(H7('Ah Ad Ks 7c 5h 3d 2c')).score, PK.best(H7('Ah Ad Qs 7c 5h 3d 2c')).score) > 0, 'kicker decides');
assert.strictEqual(PK.cmp(PK.best(H7('Ah Kd Qs Jc Th 2d 2c')).score, PK.best(H7('As Kc Qd Jh Ts 3d 3c')).score), 0, 'board plays: tie');
assert.strictEqual(PK.best(H7('6h 6d 6s 9c 9h 9d 2c')).name, 'Full house, Nines full of Sixes');
assert.deepStrictEqual(PK.best(H7('2h 3h 4h 5h 6h 7h 8h')).score, [8, 8]);

// --- Blinds, turn order, heads-up
{
  const s = PK.newGame(seats(4));
  assert.strictEqual(s.btn, 0); assert.strictEqual(s.sb, 1); assert.strictEqual(s.bb, 2);
  assert.deepStrictEqual(s.players.map(p => p.street), [0, 10, 20, 0]);
  assert.strictEqual(s.turn, 3, 'under the gun acts first');
  assert(s.players.every(p => p.hand.length === 2));
  const h = PK.newGame(seats(2));
  assert.strictEqual(h.sb, h.btn, 'heads-up: button posts the small blind'); assert.strictEqual(h.turn, h.btn, 'and acts first before the flop');
  ok(h, 'p0', {t:'call'}); ok(h, 'p1', {t:'check'});
  assert.strictEqual(h.street, 1); assert.strictEqual(h.board.length, 3); assert.strictEqual(h.turn, 1, 'big blind acts first after the flop');
  assert.strictEqual(PK.newGame(seats(4), {round:1}).btn, 1, 'button moves a seat each hand');
  assert.strictEqual(PK.newGame(seats(3), {round:1, totals:{p1:0}}).players[1].hand.length, 0, 'busted players sit out');
}

// --- Bets: big blind option, min raise, check and call errors
{
  const s = PK.newGame(seats(3));   // btn 0, sb 1, bb 2; p0 acts first
  assert(PK.apply(s, 'p0', {t:'check'}).includes('Call'));
  assert(PK.apply(s, 'p0', {t:'raise', to:30}).includes('smallest raise is to 40'));
  ok(s, 'p0', {t:'raise', to:60});   // raise of 40
  assert(PK.apply(s, 'p1', {t:'raise', to:90}).includes('smallest raise is to 100'));
  ok(s, 'p1', {t:'call'}); ok(s, 'p2', {t:'call'});
  assert.strictEqual(s.street, 1); assert.strictEqual(PK.pot(s), 180);
  const t = PK.newGame(seats(3));
  ok(t, 'p0', {t:'call'}); ok(t, 'p1', {t:'call'});
  assert.strictEqual(t.turn, 2, 'big blind gets the option'); ok(t, 'p2', {t:'raise', to:80}); assert.strictEqual(t.street, 0);
}

// --- A short all-in doesn't reopen the betting
{
  const s = PK.newGame(seats(3), {totals:{p0:1000, p1:1000, p2:1000}});
  ok(s, 'p0', {t:'call'}); ok(s, 'p1', {t:'call'}); ok(s, 'p2', {t:'check'});   // flop: p1 first
  s.players[2].stack = 30;
  ok(s, 'p1', {t:'raise', to:100}); ok(s, 'p2', {t:'call'});   // p2 all-in for 30 (a call for less)
  ok(s, 'p0', {t:'raise', to:300});
  ok(s, 'p1', {t:'call'});
  assert.strictEqual(s.street, 2);
  const u = PK.newGame(seats(3), {totals:{p0:1000, p1:1000, p2:130}});
  ok(u, 'p0', {t:'call'}); ok(u, 'p1', {t:'call'}); ok(u, 'p2', {t:'check'});
  ok(u, 'p1', {t:'raise', to:100});
  ok(u, 'p2', {t:'raise', to:110});   // all-in, only 10 more: not a full raise
  ok(u, 'p0', {t:'call'});
  assert(PK.apply(u, 'p1', {t:'raise', to:400}).includes('too small to reopen'), 'p1 already acted: call or fold only');
  ok(u, 'p1', {t:'call'}); assert.strictEqual(u.street, 2);
}

// --- Side pots
{
  const s = PK.newGame(seats(3), {totals:{p0:100, p1:300, p2:300}});
  ok(s, 'p0', {t:'raise', to:100}); ok(s, 'p1', {t:'raise', to:300}); ok(s, 'p2', {t:'call'});
  assert.strictEqual(s.phase, 'over'); assert.strictEqual(s.board.length, 5, 'board runs out');
  const tot = s.players.reduce((a, p) => a + p.stack, 0);
  assert.strictEqual(tot, 700);
  // rig: p0 best, then p1
  const r = PK.newGame(seats(3), {totals:{p0:100, p1:300, p2:300}});
  r.deck = r.deck.filter(x => ![...H7('Ah Ad Kh Kd 2c 3c 7s 8s Jd 9c')].includes(x)).concat(H7('Jd 9c 7s 8s 2c').reverse());
  r.players[0].hand = H7('Ah Ad'); r.players[1].hand = H7('Kh Kd'); r.players[2].hand = H7('2s 3c');
  ok(r, 'p0', {t:'raise', to:100}); ok(r, 'p1', {t:'raise', to:300}); ok(r, 'p2', {t:'call'});
  assert.deepStrictEqual(r.players.map(p => p.stack), [300, 400, 0], 'main pot 300 to aces, side pot 400 to kings');
  assert.strictEqual(r.results.length, 2);
  assert.strictEqual(r.champion, null);
  assert(PK.apply(r, 'p0', {t:'rebuy'}).includes('still have'));
  ok(r, 'p2', {t:'rebuy'}); assert.strictEqual(r.players[2].stack, 1000);
}

// --- Everyone folds; split pots
{
  const s = PK.newGame(seats(3));
  ok(s, 'p0', {t:'fold'}); ok(s, 'p1', {t:'fold'});
  assert.strictEqual(s.phase, 'over'); assert.deepStrictEqual(s.players.map(p => p.stack), [1000, 990, 1010]);
  const t = PK.newGame(seats(2));
  t.deck = t.deck.filter(x => !H7('Ah Kd Qs Jc Th 2d 3c 4h 5s').includes(x)).concat(H7('Th Jc Qs Kd Ah').reverse());
  t.players[0].hand = H7('2d 3c'); t.players[1].hand = H7('4h 5s');
  ok(t, 'p0', {t:'call'}); ok(t, 'p1', {t:'check'});
  for (let k = 0; k < 3; k++){ ok(t, 'p1', {t:'check'}); ok(t, 'p0', {t:'check'}); }
  assert.deepStrictEqual(t.players.map(p => p.stack), [1000, 1000], 'board plays, pot split');
}

// --- Random games: legal moves only, chips conserved, someone wins
let games = 0, hands = 0, showdowns = 0, sides = 0;
for (let g = 0; g < 120; g++){
  const n = 2 + g % 8;
  let extra = {cfg:{stack:500 + (g % 3) * 500, bb:[10, 20, 50][g % 3]}}, s, total = n * extra.cfg.stack;
  for (let h = 0; h < 400; h++){
    s = PK.newGame(seats(n), extra); hands++;
    for (let step = 0; step < 500 && s.phase === 'play'; step++){
      const pid = PK.needs(s)[0], p = P(s, pid), toCall = s.bet - p.street, r = Math.random();
      assert.strictEqual(s.players.reduce((a, q) => a + q.stack + q.total, 0), total);
      if (Math.random() < .1){ assert.strictEqual(PK.apply(s, pid, PK.timeout(s, pid)), undefined, 'timeout move'); continue; }
      if (r < .15 && toCall > 0) ok(s, pid, {t:'fold'});
      else if (r < .35 && PK.canRaise(s, p)){
        const max = p.street + p.stack, min = Math.min(s.bet + s.minRaise, max);
        ok(s, pid, {t:'raise', to:Math.random() < .2 ? max : min + Math.floor(Math.random() * (max - min + 1))});
      } else ok(s, pid, {t:toCall > 0 ? 'call' : 'check'});
    }
    assert.strictEqual(s.phase, 'over');
    assert.strictEqual(s.players.reduce((a, q) => a + q.stack, 0), total, 'no chip created or lost');
    showdowns += s.showdown; sides += s.results.length > 1;
    if (s.champion) break;
    extra = {cfg:s.cfg, totals:s.totals, round:s.round};
  }
  if (s.champion) games++;
}
console.log(`ok: poker — rules verified; ${hands} random hands (${showdowns} showdowns, ${sides} with side pots), ${games} games played to one winner`);
