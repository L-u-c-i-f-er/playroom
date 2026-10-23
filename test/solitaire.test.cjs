// Solitaire: deals, move rules for Klondike / FreeCell / Spider, undo, auto-finish, and random play that never loses a card.
const fs = require('fs'), path = require('path'), assert = require('assert');
const js = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const stub = `const store={get:(k,d)=>d,set(){}};const rid=n=>Math.random().toString(36).slice(2,2+n);const H={};const app={addEventListener(){}};const ENG={};const RUM={pc:()=>''};const addEventListener=()=>{},setInterval=()=>0;
let ui={},GID='',G=null,mode=null,me='',form={locals:[]},net={},muted=false;const esc=s=>s,sheet=x=>x,avatar=()=>'',send=()=>{},render=()=>{},toast=()=>{},viewState=()=>G,freshUI=()=>({}),live=()=>new Set(),rematch=()=>{},persist=()=>{};let seenLog=0;`;
const {SOL} = new Function(js('dealmaker-rules.js') + stub + js('solitaire.js') + '\nreturn {SOL};')();
const deal = vk => SOL.newGame([{id:'p0', name:'You'}], {cfg:{vk}});
const ok = (s, a) => assert.strictEqual(SOL.apply(s, 'p0', a), undefined, JSON.stringify(a));
const cards = s => [...s.t.flat(), ...s.stock, ...s.waste, ...(SOL.VARS[s.cfg.vk].kind === 'spider' ? [] : s.f.flat()), ...s.cells.filter(x => x != null)];
const empty = s => { s.t = s.t.map(() => []); s.d = s.d.map(() => 0); s.stock = []; s.waste = []; s.cells = s.cells.map(() => null); return s; };
const id = (rank, suit) => suit * 13 + rank - 1;   // suit 0 ♠ 1 ♥ 2 ♦ 3 ♣

// --- Deals
{
  const k = deal('k1');
  assert.deepStrictEqual(k.t.map(c => c.length), [1, 2, 3, 4, 5, 6, 7]); assert.deepStrictEqual(k.d, [0, 1, 2, 3, 4, 5, 6]); assert.strictEqual(k.stock.length, 24);
  const f = deal('fc');
  assert.deepStrictEqual(f.t.map(c => c.length), [7, 7, 7, 7, 6, 6, 6, 6]); assert(f.d.every(x => x === 0));
  const s = deal('s2');
  assert.deepStrictEqual(s.t.map(c => c.length), [6, 6, 6, 6, 5, 5, 5, 5, 5, 5]); assert.strictEqual(s.stock.length, 50);
  assert.strictEqual(new Set(cards(s)).size, 104);
  assert.deepStrictEqual([...new Set(cards(s).map(x => SOL.suit(s, x)))].sort(), [0, 1], 'two suits: spades and hearts');
  assert.deepStrictEqual([...new Set(cards(deal('s1')).map(x => SOL.suit(deal('s1'), x)))], [0]);
}

// --- Klondike
{
  const s = empty(deal('k3'));
  s.t[0] = [id(13, 3), id(9, 1)]; s.d[0] = 1; s.t[1] = [id(10, 0)]; s.t[2] = [id(5, 2)];
  ok(s, {t:'move', from:{p:'t', i:0, k:1}, to:{p:'t', i:1}});
  assert.deepStrictEqual(s.t[1], [id(10, 0), id(9, 1)]); assert.strictEqual(s.d[0], 0, 'the card underneath turns up');
  assert(SOL.apply(s, 'p0', {t:'move', from:{p:'t', i:2, k:0}, to:{p:'t', i:3}}).includes('can’t go'), 'only a King fills an empty column');
  ok(s, {t:'move', from:{p:'t', i:0, k:0}, to:{p:'t', i:3}});
  assert(SOL.apply(s, 'p0', {t:'move', from:{p:'t', i:1, k:1}, to:{p:'t', i:2}}).includes('can’t go'), 'same color can’t stack');
  s.stock = [id(1, 0), id(2, 0), id(3, 0), id(4, 0)];
  ok(s, {t:'stock'}); assert.deepStrictEqual(s.waste, [id(4, 0), id(3, 0), id(2, 0)]);
  ok(s, {t:'stock'}); assert.deepStrictEqual(s.waste.at(-1), id(1, 0));
  ok(s, {t:'stock'}); assert.deepStrictEqual(s.stock, [id(1, 0), id(2, 0), id(3, 0), id(4, 0)], 'waste turns back over in order');
  ok(s, {t:'undo'}); ok(s, {t:'undo'}); assert.deepStrictEqual(s.waste, [id(4, 0), id(3, 0), id(2, 0)]);
  ok(s, {t:'restart'}); assert.deepStrictEqual(s.t[0], [id(13, 3), id(9, 1)]); assert.strictEqual(s.moves, 0);
  // Auto-finish: everything sitting in order goes home and wins.
  const w = empty(deal('k1'));
  for (let su = 0; su < 4; su++) w.t[su] = Array.from({length:13}, (_, r) => id(13 - r, su));
  ok(w, {t:'auto'}); assert(w.f.every(f => f.length === 13)); assert.strictEqual(w.phase, 'over');
}

// --- FreeCell
{
  const s = empty(deal('fc'));
  s.t[0] = [id(9, 1), id(8, 0), id(7, 1), id(6, 0), id(5, 1), id(4, 0)]; s.t[1] = [id(10, 3)];
  s.t.slice(2).forEach((_, j) => { s.t[j + 2] = [id(13, j % 4)]; });
  s.cells = [id(2, 2), id(3, 2), id(4, 2), null];
  assert(SOL.apply(s, 'p0', {t:'move', from:{p:'t', i:0, k:0}, to:{p:'t', i:1}}).includes('free space'), '6 cards with 1 free cell and no empty column');
  ok(s, {t:'move', from:{p:'t', i:0, k:5}, to:{p:'c', i:3}});
  assert(SOL.apply(s, 'p0', {t:'move', from:{p:'t', i:0, k:4}, to:{p:'c', i:0}}).includes('can’t'), 'a cell holds one card');
  s.cells = [null, null, null, null]; s.t[0].push(id(4, 0)); s.t[7] = [];
  assert.strictEqual(SOL.apply(SOL.newGame([{id:'p0'}], {cfg:{vk:'fc'}}), 'p0', {t:'stock'}), 'That move was not understood');
  ok(s, {t:'move', from:{p:'t', i:0, k:0}, to:{p:'t', i:1}});   // 6 cards: (4 + 1) × 2
  assert.strictEqual(s.t[1].length, 7);
}

// --- Spider
{
  const s = empty(deal('s4'));
  s.t[0] = [id(5, 1), id(13, 0), ...Array.from({length:11}, (_, r) => id(12 - r, 0))]; s.d[0] = 1;
  s.t[1] = [id(1, 0)];
  ok(s, {t:'move', from:{p:'t', i:1, k:0}, to:{p:'t', i:0}});
  assert.deepStrictEqual(s.f, [0], 'complete run cleared'); assert.deepStrictEqual(s.t[0], [id(5, 1)]); assert.strictEqual(s.d[0], 0);
  s.t[2] = [id(9, 2), id(8, 3), id(7, 3)]; s.t[3] = [id(10, 1)]; s.t[4] = [id(9, 0)];
  assert(SOL.apply(s, 'p0', {t:'move', from:{p:'t', i:2, k:0}, to:{p:'t', i:3}}).includes('can’t be moved'), 'mixed suits don’t move together');
  ok(s, {t:'move', from:{p:'t', i:2, k:1}, to:{p:'t', i:4}});
  s.stock = Array.from({length:10}, (_, j) => id(2, j % 4) + 52);
  assert(SOL.apply(s, 'p0', {t:'deal'}).includes('empty'));
  s.t = s.t.map(c => c.length ? c : [id(3, 0)]);
  ok(s, {t:'deal'}); assert(s.t.every(c => c.length >= 2)); assert.strictEqual(s.stock.length, 0);
}

// --- Random play: every move is legal or refused, no card is lost or duplicated, undo is exact
let played = 0, won = 0, moves = 0;
for (const vk of Object.keys(SOL.VARS)) for (let g = 0; g < 40; g++){
  const s = deal(vk), kind = SOL.VARS[vk].kind, total = kind === 'spider' ? 104 : 52;
  for (let step = 0; step < 600 && s.phase === 'play'; step++){
    const all = cards(s);
    assert.strictEqual(all.length + (kind === 'spider' ? s.f.length * 13 : 0), total); assert.strictEqual(new Set(all).size, all.length);
    const froms = [...s.t.flatMap((c, i) => c.map((_, k) => ({p:'t', i, k}))), {p:'w', i:0}, ...s.f.map((_, i) => ({p:'f', i})), ...s.cells.map((_, i) => ({p:'c', i}))].filter(f => SOL.take(s, f));
    const tos = [...s.t.map((_, i) => ({p:'t', i})), ...s.f.map((_, i) => ({p:'f', i})), ...s.cells.map((_, i) => ({p:'c', i}))];
    const legal = froms.flatMap(f => tos.filter(t => !(t.p === f.p && t.i === f.i) && SOL.fits(s, SOL.take(s, f), t)).map(to => ({t:'move', from:f, to})));
    const home = legal.filter(a => a.to.p === 'f');
    if (Math.random() < .05 && s.hist.length){
      const before = JSON.parse(s.hist.at(-1)); ok(s, {t:'undo'});
      assert.deepStrictEqual(s.t, before.t); assert.deepStrictEqual(s.f, before.f); continue;
    }
    const a = home.length ? home[0] : legal.length && Math.random() < .7 ? legal[Math.random() * legal.length | 0]
      : kind === 'klondike' ? {t:'stock'} : kind === 'spider' && s.stock.length && s.t.every(c => c.length) ? {t:'deal'} : legal[0];
    if (!a) break;
    if (a.t === 'stock' && !s.stock.length && !s.waste.length) break;
    ok(s, a); moves++;
  }
  played++; won += s.phase === 'over';
}
console.log(`ok: solitaire — rules verified; ${played} random games, ${moves} moves checked (${won} won by chance)`);
