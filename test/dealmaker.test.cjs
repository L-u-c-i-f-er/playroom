// Dealmaker: random self-play; asserts no card is ever lost or duplicated and rejected moves change nothing.
const fs = require('fs'), assert = require('assert');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dealmaker-rules.js'), 'utf8');
const E = new Function(src + '\nreturn {CARDS,COLORS,newGame,apply,needs,payable,worth,P,C,full,setsOf,rentFor,clone,timeout};')();
const {CARDS, newGame, apply, needs, payable, P, C, full, rentFor} = E;
assert.strictEqual(CARDS.length, 106);
const pick = a => a[Math.random() * a.length | 0];
function count(s){
  const all = [...s.deck, ...s.discard];
  for (const p of s.players){ all.push(...p.hand, ...p.bank); for (const g of p.groups){ all.push(...g.cards); if (g.house != null) all.push(g.house); if (g.hotel != null) all.push(g.hotel);
    assert(g.cards.length <= E.COLORS[g.color].n, 'overfull group'); if (g.hotel != null) assert(g.house != null, 'hotel without house'); } }
  assert.strictEqual(all.length, 106, 'card count'); assert.strictEqual(new Set(all).size, 106, 'duplicate card');
}
function candidates(s, pid){
  const me = P(s, pid), pd = s.pending, out = [];
  if (pd){
    if (pid === pd.actor) return [{t:'accept'}, {t:'no'}];
    const as = payable(me); out.push({t:'no'});
    if (['rent','debt','birthday'].includes(pd.kind)) out.push({t:'pay', cards:as.slice().sort(() => Math.random() - .5).slice(0, 1 + (Math.random() * as.length | 0))}, {t:'pay', cards:as});
    else out.push({t:'accept'});
    return out;
  }
  if (s.discarding) return [{t:'discard', cards:me.hand.slice(0, me.hand.length - 7)}];
  const opps = s.players.filter(p => p !== me);
  for (const id of me.hand){
    const c = C(id);
    out.push({t:'bank', card:id}, {t:'prop', card:id, color:c.color || pick(c.colors || ['red'])}, {t:c.act || 'x', card:id});
    if (c.type === 'rent') for (const col of c.colors) out.push({t:'rent', card:id, color:col, target:pick(opps).id, doubles:me.hand.filter(x => C(x).act === 'double').slice(0, Math.random() * 2 | 0)});
    for (const o of opps){
      out.push({t:'debt', card:id, target:o.id});
      for (const g of o.groups){ out.push({t:'sly', card:id, target:o.id, tcard:g.cards[0]}, {t:'breaker', card:id, target:o.id, gcard:g.cards[0]});
        for (const mg of me.groups) out.push({t:'forced', card:id, target:o.id, tcard:g.cards[0], mycard:mg.cards[0]}); }
    }
    for (const g of me.groups) out.push({t:'build', card:id, gcard:g.cards[0]});
  }
  for (const g of me.groups) for (const id of g.cards) if (C(id).type === 'wild') out.push({t:'move', card:id, color:pick(C(id).colors)});
  out.push({t:'end'});
  return out;
}
let wins = 0, moves = 0;
for (let game = 0; game < 400; game++){
  const n = 2 + game % 4;
  let s = newGame(Array.from({length:n}, (_, i) => ({id:'p' + i, name:'P' + i})));
  count(s);
  for (let step = 0; step < 4000 && s.phase === 'play'; step++){
    const pid = needs(s)[0], cs = candidates(s, pid).sort(() => Math.random() - .5);
    if (Math.random() < .1){ assert.strictEqual(apply(s, pid, E.timeout(s, pid)), undefined, 'timeout move'); count(s); continue; }
    let ok = false;
    for (const a of cs){
      const before = JSON.stringify(s), err = apply(s, pid, a);
      if (err){ assert.strictEqual(JSON.stringify(s), before, `rejected move mutated state: ${err} ${JSON.stringify(a)}`); continue; }
      ok = true; moves++; count(s); break;
    }
    assert(ok, 'no legal move found');
    if (!s.pending && s.plays > 3) assert.fail('more than 3 plays');
  }
  if (s.phase === 'over'){ wins++; assert(E.setsOf(P(s, s.winner)) >= 3); }
}
// targeted rule checks
{
  const s = newGame([{id:'a', name:'A'}, {id:'b', name:'B'}]);
  const A = s.players.find(p => p.id === 'a'), B = s.players.find(p => p.id === 'b');
  A.hand = []; B.hand = []; s.turn = 0; s.plays = 0; s.players[0] = A; s.players[1] = B; s.discard = [];
  const id = f => CARDS.find(f).id, ids = f => CARDS.filter(f).map(c => c.id);
  const [r1, r2, r3] = ids(c => c.color === 'red'), m5 = id(c => c.type === 'money' && c.value === 5), rent = id(c => c.type === 'rent' && c.colors.includes('red') && !c.wild);
  const dbl = ids(c => c.act === 'double'), house = id(c => c.act === 'house'), sly = id(c => c.act === 'sly');
  for (const x of [r1, r2, r3, m5, rent, ...dbl, house, sly]) s.deck.splice(s.deck.indexOf(x), 1);
  A.groups = [{color:'red', cards:[r1, r2, r3], house:null, hotel:null}];
  A.hand = [house, rent, dbl[0]]; B.bank = [m5];
  assert.strictEqual(apply(s, 'a', {t:'build', card:house, gcard:r1}), undefined);
  assert.strictEqual(rentFor(A, 'red'), 9);
  assert.strictEqual(apply(s, 'a', {t:'rent', card:rent, color:'red', doubles:[dbl[0]]}), undefined);
  assert.strictEqual(s.plays, 3);
  assert.strictEqual(s.pending, null, 'B had no Just Say No and < $18M, so paid everything automatically');
  assert.deepStrictEqual(B.bank, []); assert(A.bank.includes(m5));
  assert(apply(s, 'a', {t:'bank', card:sly}), 'fourth play must be refused');
  A.hand.push(sly);
  assert(apply(s, 'a', {t:'sly', card:sly, target:'b', tcard:r1}), 'cannot steal from yourself');
}
console.log(`ok: ${wins}/400 games reached a winner, ${moves} moves checked`);
