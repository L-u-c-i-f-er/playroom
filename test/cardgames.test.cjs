// Andar Bahar and Least Count: dealing, payouts, throws, Show scoring, elimination, card conservation.
const fs = require('fs'), path = require('path'), assert = require('assert');
const js = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const pick = (src, name) => src.slice(src.indexOf(`const ${name} = (() => {`), src.lastIndexOf('})();') + 5);
const stub = `const store={get:(k,d)=>d,set(){}};const rid=n=>Math.random().toString(36).slice(2,2+n);const H={};const app={addEventListener(){}};
let ui={},GID='',G=null,mode=null,me='',form={locals:[]},net={},muted=false;const esc=s=>s,sheet=x=>x,avatar=()=>'',send=()=>{},render=()=>{},toast=()=>{},sfx=()=>{},showBanner=()=>{},viewState=()=>G,freshUI=()=>({}),live=()=>new Set(),rematch=()=>{},persist=()=>{};let seenLog=0;`;
const {AB, LC, P} = new Function(js('dealmaker-rules.js') + stub + pick(js('andarbahar.js'), 'AB') + '\n' + pick(js('leastcount.js'), 'LC') + '\nreturn {AB, LC, P};')();

// --- Andar Bahar
{
  let andar = 0;
  for (let i = 0; i < 3000; i++){
    const s = AB.newGame([{id:'h', name:'H'}, {id:'g', name:'G'}], {host:'h'});
    assert(AB.apply(s, 'h', {t:'deal'}).includes('Nobody'));
    assert(AB.apply(s, 'g', {t:'bet', side:'andar', amt:5000}).includes('only have'));
    assert.strictEqual(AB.apply(s, 'g', {t:'bet', side:'andar', amt:100}), undefined);
    assert.strictEqual(AB.apply(s, 'h', {t:'bet', side:'bahar', amt:100}), undefined);
    assert(AB.apply(s, 'g', {t:'deal'}).includes('dealer'), 'only the host deals online');
    assert.strictEqual(AB.apply(s, 'h', {t:'deal'}), undefined);
    s.seq.forEach((c, k) => assert.strictEqual(c.side, k % 2 ? 'bahar' : 'andar', 'alternates, Andar first'));
    s.seq.slice(0, -1).forEach(c => assert.notStrictEqual(AB.rank(c.id), AB.rank(s.joker), 'no earlier match'));
    assert.strictEqual(AB.rank(s.seq.at(-1).id), AB.rank(s.joker)); assert.strictEqual(s.winner, s.seq.at(-1).side);
    const g = P(s, 'g'), h = P(s, 'h');
    if (s.winner === 'andar'){ andar++; assert.strictEqual(g.chips, 1090); assert.strictEqual(h.chips, 900); }
    else { assert.strictEqual(g.chips, 900); assert.strictEqual(h.chips, 1100); }
    assert(AB.apply(s, 'g', {t:'bet', side:'andar', amt:10}).includes('closed'));
    assert.strictEqual(AB.apply(s, 'h', {t:'next'}), undefined);
    assert.strictEqual(s.round, 2); assert.strictEqual(g.bet, null);
  }
  const local = AB.newGame([{id:'p0', name:'Solo'}], {});
  local.players[0].chips = 50;
  assert.strictEqual(AB.apply(local, 'p0', {t:'topup'}), undefined); assert.strictEqual(local.players[0].chips, 1000);
  console.log(`ok: andar bahar — 3000 deals, Andar won ${(andar / 30).toFixed(1)}%`);
}

// --- Least Count: Show scoring
{
  const s = LC.newGame([{id:'a', name:'A'}, {id:'b', name:'B'}, {id:'c', name:'C'}], {});
  const id = (r, suit = 0) => suit * 13 + r - 1;
  s.jr = 13; const [A, B, C] = s.players; s.turn = 0; s.step = 'throw';
  A.hand = [id(1), id(2)]; B.hand = [id(5), id(9)]; C.hand = [id(10), id(13)];   // 3, 14, 10 (K is wild = 0)
  assert.strictEqual(LC.total(s, C.hand), 10);
  assert.strictEqual(LC.apply(s, 'a', {t:'show'}), undefined);
  assert.deepStrictEqual(s.players.map(p => p.score), [0, 14, 10], 'good show');
  const t = LC.newGame([{id:'a', name:'A'}, {id:'b', name:'B'}, {id:'c', name:'C'}], {});
  t.jr = 13; t.turn = 0; t.step = 'throw';
  t.players[0].hand = [id(4)]; t.players[1].hand = [id(4, 1)]; t.players[2].hand = [id(8)];
  assert.strictEqual(LC.apply(t, 'a', {t:'show'}), undefined);
  assert.deepStrictEqual(t.players.map(p => p.score), [40, 0, 8], 'tie means wrong show; lowest scores 0');
  const u = LC.newGame([{id:'a', name:'A'}, {id:'b', name:'B'}], {}); u.jr = 13; u.turn = 0; u.step = 'throw';
  u.players[0].hand = [id(12), id(11)];
  assert(LC.apply(u, 'a', {t:'show'}).includes('10 points or less'));
  assert(LC.apply(u, 'a', {t:'throw', cards:[id(12), id(11)]}).includes('same rank'));
}
// --- Least Count: random matches to the end
let matches = 0, deals = 0;
for (let m = 0; m < 150; m++){
  const n = 2 + m % 5, seats = Array.from({length:n}, (_, i) => ({id:'p' + i, name:'P' + i}));
  let extra = {cfg:{limit:100}}, s;
  for (let d = 0; d < 200; d++){
    s = LC.newGame(seats, extra); deals++;
    const size = 52 * (s.players.filter(p => !p.out).length > 4 ? 2 : 1) + 2;
    for (let step = 0; step < 4000 && s.phase === 'play'; step++){
      const all = [...s.deck, ...s.pile, s.joker, ...s.players.flatMap(p => p.hand)];
      assert.strictEqual(all.length, size); assert.strictEqual(new Set(all).size, size);
      const pid = LC.needs(s)[0], p = P(s, pid);
      if (s.step === 'throw'){
        // An empty hand (threw everything, then matched and skipped picking) can only Show.
        if (LC.total(s, p.hand) <= 10 && (!p.hand.length || Math.random() < .5)){ assert.strictEqual(LC.apply(s, pid, {t:'show'}), undefined); break; }
        const hi = [...p.hand].sort((a, b) => LC.val(s, b) - LC.val(s, a))[0];
        const set = p.hand.filter(x => LC.rank(x) === LC.rank(hi));
        assert.strictEqual(LC.apply(s, pid, {t:'throw', cards:Math.random() < .5 ? set : [hi]}), undefined);
      } else {
        const r = Math.random(), from = s.matched && r < .5 ? 'skip' : r < .7 ? 'open' : 'deck';
        if (LC.apply(s, pid, {t:'pick', from})) assert.strictEqual(LC.apply(s, pid, {t:'pick', from:'deck'}), undefined);
      }
    }
    assert.strictEqual(s.phase, 'over', 'deal ended with a Show');
    s.players.forEach(p => { if (p.score != null) assert(p.score >= 0); });
    if (s.champion){ matches++; break; }
    extra = {cfg:s.cfg, totals:s.totals, round:s.round};
  }
  assert(s.champion, 'match finished');
  assert(s.players.filter(p => (s.totals[p.id] || 0) < 100).length <= 1);
}
console.log(`ok: least count — scoring rules verified; ${matches} random matches played to a winner over ${deals} deals`);
