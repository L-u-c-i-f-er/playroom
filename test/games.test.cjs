// Tambola and Rummy: ticket structure, claims, melds, scoring, and random rummy deals.
const fs = require('fs'), assert = require('assert');
const path = require('path'), js = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const scripts = [js('dealmaker-rules.js'), js('tambola.js'), js('rummy.js')];
const engine = scripts[0];
const pick = (src, name) => src.slice(src.indexOf(`const ${name} = (() => {`), src.lastIndexOf('})();') + 5);
// Minimal stand-ins for the browser-side globals the modules touch at load time.
const stub = `const store={get:(k,d)=>d,set(){}};const rid=n=>Math.random().toString(36).slice(2,2+n);const H={};const app={addEventListener(){}};
const setInterval=()=>0;const esc=s=>s;let ui={},GID='',G=null,mode=null,me='',screen='',form={locals:[]},net={},muted=false;const sheet=x=>x;const avatar=()=>'';
const send=()=>{};const render=()=>{};const toast=()=>{};const viewState=()=>G;const freshUI=()=>({});const live=()=>new Set();let seenLog=0;const speechSynthesis={};`;
const E = new Function(engine + stub + pick(scripts[1], 'TAM') + '\n' + pick(scripts[2], 'RUM') + '\nreturn {TAM, RUM, P};')();
const {TAM, RUM, P} = E;

// --- Tambola tickets: 3x9, 5 per row, every column used, right ranges, sorted down columns, unique.
for (let i = 0; i < 3000; i++){
  const T = TAM.ticket();
  T.forEach(r => assert.strictEqual(r.filter(Boolean).length, 5));
  for (let c = 0; c < 9; c++){
    const col = T.map(r => r[c]).filter(Boolean), lo = c ? c * 10 : 1, hi = c === 8 ? 90 : c * 10 + 9;
    assert(col.length >= 1 && col.length <= 3, 'column count');
    col.forEach(n => assert(n >= lo && n <= hi, `range col ${c}: ${n}`));
    assert.deepStrictEqual(col, [...col].sort((a, b) => a - b));
  }
  assert.strictEqual(new Set(T.flat().filter(Boolean)).size, 15);
}
// --- Tambola claims: checked against called numbers; wrong claim = bogey; one winner per prize.
{
  const s = TAM.newGame([{id:'h', name:'Host'}, {id:'g', name:'Guest'}], {host:'h', cfg:{tickets:2}});
  assert.strictEqual(TAM.apply(s, 'g', {t:'call'}), 'Only the caller can do that');
  const T = s.players[1].tickets[0], top = T[0].filter(Boolean);
  assert.strictEqual(TAM.apply(s, 'g', {t:'claim', prize:'top', ticket:0}), undefined);
  assert.deepStrictEqual(s.players[1].bogey, [0], 'early wrong claim is a bogey');
  assert(TAM.apply(s, 'g', {t:'claim', prize:'top', ticket:0}).includes('cancelled'));
  const T2 = s.players[1].tickets[1];
  s.called = [...new Set([...top, ...T2[0].filter(Boolean)])];
  assert.strictEqual(TAM.apply(s, 'g', {t:'claim', prize:'top', ticket:1}), undefined);
  assert.strictEqual(s.prizes.top.pid, 'g');
  assert(TAM.apply(s, 'h', {t:'claim', prize:'top', ticket:0}).includes('already'));
  assert(TAM.won(T2, 'early', s.called));
  for (let k = 0; k < 90 && s.phase === 'play'; k++) if (s.called.length < 90) TAM.apply(s, 'h', {t:'call'});
  assert.strictEqual(new Set(s.called).size, s.called.length, 'no repeated numbers');
  assert.strictEqual(TAM.apply(s, 'h', {t:'claim', prize:'full', ticket:0}), undefined);
  assert.strictEqual(s.phase, 'over');
}
// --- Rummy melds.
{
  const s = {jr:7};
  const id = (rank, suit, deck = 0) => deck * 52 + suit * 13 + rank - 1;   // suit: 0 spade, 1 heart, 2 diamond, 3 club
  const c = g => RUM.classify(s, g);
  assert.strictEqual(c([id(4, 1), id(5, 1), id(6, 1)]), 'pure');
  assert.strictEqual(c([id(12, 0), id(13, 0), id(1, 0)]), 'pure', 'Q K A');
  assert.strictEqual(c([id(1, 0), id(2, 0), id(3, 0)]), 'pure', 'A 2 3');
  assert.strictEqual(c([id(13, 0), id(1, 0), id(2, 0)]), null, 'no wrap-around');
  assert.strictEqual(c([id(6, 2), id(7, 2), id(8, 2)]), 'pure', 'wild-rank card in its natural place');
  assert.strictEqual(c([id(4, 1), id(7, 0), id(6, 1)]), 'seq', 'joker fills the 5');
  assert.strictEqual(c([id(4, 1), 104, id(8, 1)]), null, 'gap too wide');
  assert.strictEqual(c([id(9, 0), id(9, 1), id(9, 3)]), 'set');
  assert.strictEqual(c([id(9, 0), id(9, 0, 1), id(9, 3)]), null, 'same suit twice is not a set');
  assert.strictEqual(c([id(9, 0), id(9, 1), 105, id(9, 3)]), 'set');
  assert.strictEqual(c([id(9, 0), id(9, 1), id(9, 2), id(9, 3), 104]), null, 'sets max 4');
  const pure = [id(4, 1), id(5, 1), id(6, 1)], imp = [id(10, 3), 104, id(12, 3)], set = [id(2, 0), id(2, 1), id(2, 2)], loose = [id(13, 0), id(11, 2), id(3, 3), id(1, 1)];
  assert(RUM.judge(s, [pure, imp, set, [id(9, 0), id(9, 1), id(9, 3), id(9, 2)]]).ok);
  assert(!RUM.judge(s, [imp, imp, set]).ok, 'needs a pure sequence');
  assert.strictEqual(RUM.score(s, [pure, imp, set, loose]), 33, 'only unmatched cards count (K J 3 A)');
  assert.strictEqual(RUM.score(s, [imp, set, loose]), 20 + 6 + 33, 'no pure: everything counts, jokers 0');
  assert.strictEqual(RUM.score(s, [pure, set, loose]), 6 + 33, 'pure but one sequence: all but the pure run');
  assert.strictEqual(RUM.score(s, [[id(13, 0), id(13, 1), id(12, 2), id(12, 3), id(11, 0), id(11, 1), id(10, 2), id(10, 3), id(9, 0)]]), 80, 'capped at 80');
}
// --- Rummy random games: card conservation, legal flow, every deal finishes.
let deals = 0, declared = 0;
for (let g = 0; g < 300; g++){
  const n = 2 + g % 5;
  let s = RUM.newGame(Array.from({length:n}, (_, i) => ({id:'p' + i, name:'P' + i})), {host:'p0'});
  for (let step = 0; step < 3000 && s.phase !== 'over'; step++){
    const all = [...s.deck, ...s.pile, s.joker, ...s.players.flatMap(p => p.hand)];
    assert.strictEqual(all.length, 106); assert.strictEqual(new Set(all).size, 106);
    const pid = RUM.needs(s)[0], p = P(s, pid);
    if (s.phase === 'show'){ assert.strictEqual(RUM.apply(s, pid, {t:'show', groups:RUM.auto(s, p.hand)}), undefined); continue; }
    if (s.step === 'draw'){
      if (Math.random() < .01){ assert.strictEqual(RUM.apply(s, pid, {t:'drop'}), undefined); continue; }
      const err = RUM.apply(s, pid, {t:'draw', from:Math.random() < .3 ? 'pile' : 'deck'});
      if (err) assert.strictEqual(RUM.apply(s, pid, {t:'draw', from:'deck'}), undefined);
      continue;
    }
    assert.strictEqual(p.hand.length, 14);
    // Try to declare with the helper's grouping for each possible throw-away card.
    let done = false;
    for (const cId of p.hand){
      const rest = p.hand.filter(x => x !== cId), gs = RUM.auto(s, rest);
      assert.deepStrictEqual(gs.flat().sort((a, b) => a - b), [...rest].sort((a, b) => a - b), 'auto keeps every card');
      if (RUM.judge(s, gs).ok){ assert.strictEqual(RUM.apply(s, pid, {t:'declare', card:cId, groups:gs}), undefined); declared++; done = true; break; }
    }
    if (done) continue;
    if (Math.random() < .005){ RUM.apply(s, pid, {t:'declare', card:p.hand[0], groups:[p.hand.slice(1)]}); continue; }
    const groups = RUM.auto(s, p.hand), loose = groups.filter(gg => !RUM.classify(s, gg)).flat();
    const throwId = (loose.length ? loose : p.hand).sort((a, b) => (s.jr === RUM.card(b).rank) - (s.jr === RUM.card(a).rank))[0];
    assert.strictEqual(RUM.apply(s, pid, {t:'discard', card:throwId}), undefined);
  }
  assert.strictEqual(s.phase, 'over', 'deal finished'); deals++;
  const w = P(s, s.declarer); assert.strictEqual(w.score, 0);
  s.players.forEach(p => assert(p.score >= 0 && p.score <= 80));
}
console.log(`ok: tickets, claims, melds and scoring verified; ${deals} random rummy deals finished (${declared} by valid declaration)`);
