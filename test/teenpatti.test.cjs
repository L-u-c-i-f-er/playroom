// Teen Patti: hand ranks, blind/seen stakes, show and sideshow, pot limit, all-in side pots, and random games that never lose a chip.
const fs = require('fs'), path = require('path'), assert = require('assert');
const js = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const stub = `const store={get:(k,d)=>d,set(){}};const rid=n=>Math.random().toString(36).slice(2,2+n);const H={};const app={addEventListener(){}};const ENG={};const RUM={pc:()=>''};const capInput=()=>'';
let ui={},GID='',G=null,mode=null,me='',form={locals:[]},net={},muted=false;const esc=s=>s,sheet=x=>x,avatar=()=>'',send=()=>{},render=()=>{},toast=()=>{},viewState=()=>G,freshUI=()=>({}),live=()=>new Set(),rematch=()=>{},persist=()=>{};let seenLog=0;`;
const {TP, P} = new Function(js('dealmaker-rules.js') + stub + js('teenpatti.js') + '\nreturn {TP, P};')();
const C = t => 'shdc'.indexOf(t[1]) * 13 + 'A23456789TJQK'.indexOf(t[0]);
const H3 = str => str.split(' ').map(C);
const seats = n => Array.from({length:n}, (_, i) => ({id:'p' + i, name:'P' + i}));
const ok = (s, pid, a) => assert.strictEqual(TP.apply(s, pid, a), undefined, JSON.stringify(a));
const chips = s => s.players.reduce((a, p) => a + p.stack + (s.phase === 'play' ? p.total : 0), 0);

// --- Hand ranks
const order = ['As Ah Ad', '2s 2h 2d', 'Ah Kh Qh', 'Ah 2h 3h', '4c 3c 2c', 'As Kh Qd', 'Ad 2c 3h', '4s 3h 2d', 'Ac Jc 9c', 'As Ah Kd', '2s 2h 3d', 'Ad Kc Jh'];
const ranked = order.map(h => TP.rank3(H3(h)));
for (let i = 1; i < ranked.length; i++) assert(TP.cmp(ranked[i - 1], ranked[i]) > 0, `${order[i - 1]} beats ${order[i]}`);
assert.deepStrictEqual(ranked.map(r => r[0]), [5, 5, 4, 4, 4, 3, 3, 3, 2, 1, 1, 0]);
assert.strictEqual(TP.handName(TP.rank3(H3('Ah Kh Qh'))), 'Pure sequence, A-K-Q');
assert.strictEqual(TP.handName(TP.rank3(H3('Ah 2d 3c'))), 'Sequence, A-2-3');
assert.strictEqual(TP.handName(TP.rank3(H3('Ks Kh 5d'))), 'Pair of Kings');
assert.strictEqual(TP.cmp(TP.rank3(H3('Ks Qh 9d')), TP.rank3(H3('Kd Qc 9h'))), 0, 'same values tie');

// --- Boot and the deal
const deal = (n, totals) => TP.newGame(seats(n), {totals});
{
  const s = deal(4);
  assert(s.players.every(p => p.hand.length === 3 && p.total === 10 && p.stack === 990));
  assert.strictEqual(TP.pot(s), 40); assert.strictEqual(s.stake, 10); assert.strictEqual(s.turn, 1, 'left of the dealer starts');
}
// --- Stakes: blind 1x or 2x, seen 2x or 4x; doubling raises the stake
{
  const s = deal(4);
  ok(s, 'p1', {t:'chaal'}); assert.strictEqual(P(s, 'p1').total, 20);
  ok(s, 'p2', {t:'chaal', double:true}); assert.strictEqual(s.stake, 20); assert.strictEqual(P(s, 'p2').total, 30);
  ok(s, 'p3', {t:'see'}); ok(s, 'p3', {t:'chaal'}); assert.strictEqual(P(s, 'p3').total, 50, 'seen pays twice the stake');
  ok(s, 'p0', {t:'see'}); ok(s, 'p0', {t:'chaal', double:true}); assert.strictEqual(P(s, 'p0').total, 90); assert.strictEqual(s.stake, 40);
  assert(TP.apply(s, 'p2', {t:'chaal'}).includes('not your turn'));
  ok(s, 'p2', {t:'see'});   // looking is free, any time
  ok(s, 'p1', {t:'pack'}); assert(P(s, 'p1').packed); assert.strictEqual(s.turn, 2);
  assert(TP.apply(s, 'p2', {t:'show'}).includes('two players'));
}
// --- Show: blind pays the stake, seen twice; a tie goes against whoever asked
{
  const s = deal(3);
  s.players[0].hand = H3('Ks Kh 5d'); s.players[1].hand = H3('Ah Kd 9c'); s.players[2].hand = H3('2c 7d 9s');
  ok(s, 'p1', {t:'pack'});
  ok(s, 'p2', {t:'chaal'});
  ok(s, 'p0', {t:'show'});
  assert.strictEqual(s.phase, 'over'); assert.strictEqual(s.results[0].ids[0], 'p0');
  assert.strictEqual(P(s, 'p0').stack, 990 - 10 + 50, 'blind show costs the stake; winner takes 50');
  const t = deal(2);
  t.players[0].hand = H3('Ks Qh 9d'); t.players[1].hand = H3('Kd Qc 9h');
  ok(t, 'p1', {t:'see'}); ok(t, 'p1', {t:'show'});
  assert.strictEqual(t.results[0].ids[0], 'p0', 'equal hands: the one who asked loses');
  assert.strictEqual(P(t, 'p1').total, 30, 'seen show costs twice the stake');
}
// --- Sideshow: both seen, three or more in; weaker packs, tie goes against the asker; can be denied
{
  const s = deal(4);
  s.players[1].hand = H3('As Ah 5d'); s.players[2].hand = H3('Kc Qd 2h');
  ok(s, 'p1', {t:'see'}); ok(s, 'p1', {t:'chaal'});
  assert(!TP.canSide(s, P(s, 'p2')), 'not seen yet');
  ok(s, 'p2', {t:'see'});
  assert(TP.canSide(s, P(s, 'p2')));
  ok(s, 'p2', {t:'side'});
  assert.deepStrictEqual(TP.needs(s), ['p1']);
  assert(TP.apply(s, 'p3', {t:'chaal'}).includes('sideshow'));
  ok(s, 'p1', {t:'sideshow', accept:true});
  assert(P(s, 'p2').packed, 'the weaker hand packs'); assert.strictEqual(s.turn, 3);
  const d = deal(4);
  ok(d, 'p1', {t:'see'}); ok(d, 'p1', {t:'chaal'}); ok(d, 'p2', {t:'see'}); ok(d, 'p2', {t:'side'});
  ok(d, 'p1', {t:'sideshow', accept:false});
  assert(!P(d, 'p1').packed && !P(d, 'p2').packed); assert.strictEqual(d.turn, 3);
  const two = deal(3); ok(two, 'p1', {t:'pack'}); ok(two, 'p2', {t:'see'}); ok(two, 'p0', {t:'see'}); ok(two, 'p2', {t:'chaal'});
  assert(!TP.canSide(two, P(two, 'p0')), 'not with only two left: that is a show');
}
// --- Pot limit forces a showdown; everyone packing hands the pot over
{
  const s = TP.newGame(seats(3), {cfg:{boot:10, potLimit:50}});
  ok(s, 'p1', {t:'chaal'}); ok(s, 'p2', {t:'chaal'});
  assert.strictEqual(s.phase, 'over'); assert(s.showdown);
  const f = deal(3); ok(f, 'p1', {t:'pack'}); ok(f, 'p2', {t:'pack'});
  assert.strictEqual(P(f, 'p0').stack, 1020);
}
// --- All-in for less: plays for what it matched; the rest goes to a side pot
{
  const s = deal(3, {p0:1000, p1:25, p2:1000});
  s.players[1].hand = H3('As Ah Ad'); s.players[0].hand = H3('Ks Kh 2d'); s.players[2].hand = H3('3c 7d 9s');
  assert(TP.apply(s, 'p1', {t:'allin'}).includes('still afford'));
  assert(TP.apply(s, 'p1', {t:'chaal', double:true}).includes('double'), '15 left can’t cover a double of 20');
}
{
  const s = deal(3, {p0:1000, p1:25, p2:1000});
  s.players[1].hand = H3('As Ah Ad'); s.players[0].hand = H3('Ks Kh 2d'); s.players[2].hand = H3('3c 7d 9s');
  ok(s, 'p1', {t:'chaal'}); ok(s, 'p2', {t:'chaal', double:true}); ok(s, 'p0', {t:'chaal'});
  assert(TP.apply(s, 'p1', {t:'chaal'}).includes('all-in'));
  ok(s, 'p1', {t:'allin'});
  ok(s, 'p2', {t:'chaal'}); ok(s, 'p0', {t:'pack'});
  assert.strictEqual(s.phase, 'over');
  assert.strictEqual(P(s, 'p1').stack, 25 * 3, 'the trail wins the main pot it matched');
  assert.strictEqual(chips(s), 2025);
}
// --- Random games
let games = 0, hands = 0, shows = 0, sides = 0;
for (let g = 0; g < 150; g++){
  const n = 3 + g % 6, total = n * 1000;
  let extra = {cfg:{boot:[5, 10, 25][g % 3], stack:1000, potLimit:g % 4 ? 0 : 2000}}, s;
  for (let h = 0; h < 500; h++){
    s = TP.newGame(seats(n), extra); hands++;
    for (let step = 0; step < 600 && s.phase === 'play'; step++){
      assert.strictEqual(chips(s), total);
      const pid = TP.needs(s)[0], p = P(s, pid), r = Math.random();
      if (s.side){ ok(s, pid, {t:'sideshow', accept:Math.random() < .6}); sides++; continue; }
      if (!p.seen && r < .3){ ok(s, pid, {t:'see'}); continue; }
      const min = (p.seen ? 2 : 1) * s.stake, live = s.players.filter(q => !q.out && !q.packed);
      if (r < .4) ok(s, pid, {t:'pack'});
      else if (p.stack < min) ok(s, pid, {t:'allin'});
      else if (live.length === 2 && r < .55 && !live.some(q => q.allin)){ ok(s, pid, {t:'show'}); shows++; }
      else if (TP.canSide(s, p) && r < .6) ok(s, pid, {t:'side'});
      else ok(s, pid, {t:'chaal', double:r > .9 && p.stack >= 2 * min});
    }
    assert.strictEqual(s.phase, 'over');
    assert.strictEqual(s.players.reduce((a, p) => a + p.stack, 0), total, 'no chip created or lost');
    if (s.champion) break;
    extra = {cfg:s.cfg, totals:s.totals, round:s.round};
  }
  if (s.champion) games++;
}
console.log(`ok: teen patti — rules verified; ${hands} random hands (${shows} shows, ${sides} sideshows), ${games} games played to one winner`);
