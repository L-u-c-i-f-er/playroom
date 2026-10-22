/* =====================================================================
   RULES ENGINE — pure state + apply(). Runs on the host (online) or the
   single device (pass & play). Guests run it too, to check moves early.
   ===================================================================== */
const COLORS = {
  brown:     {n:2, rent:[1,2],     name:'Brown',      hex:'#8a5a3b', ink:'#fff'},
  lightblue: {n:3, rent:[1,2,3],   name:'Light Blue', hex:'#8fcbe8', ink:'#11232c'},
  pink:      {n:3, rent:[1,2,4],   name:'Pink',       hex:'#d24b93', ink:'#fff'},
  orange:    {n:3, rent:[1,3,5],   name:'Orange',     hex:'#f08a24', ink:'#2a1503'},
  red:       {n:3, rent:[2,3,6],   name:'Red',        hex:'#d93a30', ink:'#fff'},
  yellow:    {n:3, rent:[2,4,6],   name:'Yellow',     hex:'#f2cb2f', ink:'#2a2203'},
  green:     {n:3, rent:[2,4,7],   name:'Green',      hex:'#1e9a58', ink:'#fff'},
  darkblue:  {n:2, rent:[3,8],     name:'Dark Blue',  hex:'#2747a3', ink:'#fff'},
  railroad:  {n:4, rent:[1,2,3,4], name:'Railroad',   hex:'#2a2a2e', ink:'#fff'},
  utility:   {n:2, rent:[1,2],     name:'Utility',    hex:'#a7d6b6', ink:'#10261a'},
};
const CK = Object.keys(COLORS);
const CARDS = [];
const add = (o, k = 1) => { for (let i = 0; i < k; i++) CARDS.push({...o, id: CARDS.length}); };
[[10,1],[5,2],[4,3],[3,3],[2,5],[1,6]].forEach(([v,k]) => add({type:'money', value:v, name:`$${v}M`}, k));
const STREETS = {
  brown:['Mediterranean Ave','Baltic Ave'], lightblue:['Oriental Ave','Vermont Ave','Connecticut Ave'],
  pink:['St. Charles Place','States Ave','Virginia Ave'], orange:['St. James Place','Tennessee Ave','New York Ave'],
  red:['Kentucky Ave','Indiana Ave','Illinois Ave'], yellow:['Atlantic Ave','Ventnor Ave','Marvin Gardens'],
  green:['Pacific Ave','North Carolina Ave','Pennsylvania Ave'], darkblue:['Park Place','Boardwalk'],
  railroad:['Reading Railroad','Pennsylvania Railroad','B. & O. Railroad','Short Line'], utility:['Electric Company','Water Works'],
};
const PVAL = {brown:1, lightblue:1, pink:2, orange:2, red:3, yellow:3, green:4, darkblue:4, railroad:2, utility:2};
CK.forEach(c => STREETS[c].forEach(name => add({type:'prop', color:c, value:PVAL[c], name})));
[[['pink','orange'],2,2],[['lightblue','brown'],1,1],[['lightblue','railroad'],4,1],[['darkblue','green'],4,1],
 [['railroad','green'],4,1],[['red','yellow'],3,2],[['utility','railroad'],2,1]]
  .forEach(([colors,value,k]) => add({type:'wild', colors, value, name:'Property Wild'}, k));
add({type:'wild', colors:CK, value:0, name:'Property Wild', multi:true}, 2);
const ACTS = {
  breaker: ['Deal Breaker', 5, 2, 'Steal a complete set from any player, buildings included.', 'DB'],
  jsn:     ['Just Say No', 4, 3, 'Cancel an action played against you. Does not use a play.', 'NO'],
  sly:     ['Sly Deal', 3, 3, 'Steal one property from a player. Not from a complete set.', 'SD'],
  forced:  ['Forced Deal', 3, 3, 'Swap one of your properties for another player’s. Not from complete sets.', 'FD'],
  debt:    ['Debt Collector', 3, 3, 'Make one player pay you $5M.', 'DC'],
  birthday:['It’s My Birthday', 2, 3, 'Every other player pays you $2M.', 'B'],
  passgo:  ['Pass Go', 1, 10, 'Draw 2 extra cards.', 'GO'],
  house:   ['House', 3, 3, 'Add to a complete set for +$3M rent. Not railroads or utilities.', 'H'],
  hotel:   ['Hotel', 4, 2, 'Add to a set that has a house for +$4M rent.', 'HT'],
  double:  ['Double the Rent', 1, 2, 'Play with a rent card to double it. Uses a play.', '×2'],
};
Object.entries(ACTS).forEach(([act,[name,value,k,desc,short]]) => add({type:'action', act, name, value, desc, short}, k));
[['pink','orange'],['railroad','utility'],['green','darkblue'],['brown','lightblue'],['red','yellow']]
  .forEach(colors => add({type:'rent', colors, value:1, name:'Rent'}, 2));
add({type:'rent', colors:CK, value:3, name:'Wild Rent', wild:true}, 3);   // 106 playable cards

const PAY = new Set(['rent','debt','birthday']);
const KIND = {rent:'Rent', debt:'Debt Collector', birthday:'It’s My Birthday', sly:'Sly Deal', forced:'Forced Deal', breaker:'Deal Breaker'};
const C = id => CARDS[id];
const P = (s, id) => s.players.find(p => p.id === id);
const isProp = id => C(id).type === 'prop' || C(id).type === 'wild';
const full = g => g.cards.length >= COLORS[g.color].n;
const setsOf = p => p.groups.filter(full).length;
const groupOf = (p, id) => p.groups.find(g => g.cards.includes(id) || g.house === id || g.hotel === id);
const worth = ids => ids.reduce((a, id) => a + C(id).value, 0);
const hasNo = p => p.hand.some(id => C(id).act === 'jsn');
const clone = o => JSON.parse(JSON.stringify(o));
function shuffle(a){ for (let i = a.length - 1; i > 0; i--){ const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
function payable(p){
  const out = [...p.bank];
  for (const g of p.groups){ out.push(...g.cards.filter(id => C(id).value > 0)); if (g.house != null) out.push(g.house); if (g.hotel != null) out.push(g.hotel); }
  return out;
}
function rentFor(p, color){
  let best = 0;
  for (const g of p.groups) if (g.color === color){
    const {n, rent} = COLORS[color];
    let r = rent[Math.min(g.cards.length, n) - 1];
    if (full(g)) r += (g.house != null ? 3 : 0) + (g.hotel != null ? 4 : 0);
    best = Math.max(best, r);
  }
  return best;
}
function addProp(p, id, color){
  const g = p.groups.find(g => g.color === color && !full(g));
  if (g) g.cards.push(id); else p.groups.push({color, cards:[id], house:null, hotel:null});
}
function removeFromTable(p, id){
  const g = groupOf(p, id); if (!g) return;
  if (g.house === id){ g.house = null; if (g.hotel != null){ p.bank.push(g.hotel); g.hotel = null; } }
  else if (g.hotel === id) g.hotel = null;
  else g.cards.splice(g.cards.indexOf(id), 1);
}
// Complete sets keep their buildings; broken sets merge back together and any buildings fall into the owner's bank.
function normalize(p){
  const out = [];
  for (const c of CK){
    const pool = [];
    for (const g of p.groups.filter(g => g.color === c)){
      if (full(g)) out.push(g);
      else { pool.push(...g.cards); if (g.house != null) p.bank.push(g.house); if (g.hotel != null) p.bank.push(g.hotel); }
    }
    while (pool.length) out.push({color:c, cards:pool.splice(0, COLORS[c].n), house:null, hotel:null});
  }
  p.groups = out;
}
function log(s, text, kind = 'info', extra = {}){
  s.ln = (s.ln || 0) + 1;
  s.log.push({n:s.ln, text, kind, ...extra});
  if (s.log.length > 80) s.log.shift();
}
function draw(s, p, n){
  for (let i = 0; i < n; i++){
    if (!s.deck.length){
      if (!s.discard.length) break;
      s.deck = shuffle(s.discard); s.discard = [];
      log(s, 'The discard pile was shuffled into a new deck');
    }
    p.hand.push(s.deck.pop());
  }
}
function newGame(seats, extra = {}){
  const s = {phase:'play', players:seats.map(p => ({id:p.id, name:p.name, hand:[], bank:[], groups:[]})),
    deck:shuffle(CARDS.map(c => c.id)), discard:[], turn:0, plays:0, pending:null, discarding:false, winner:null, log:[], ln:0, ack:{}, ...extra};
  for (let i = 0; i < 5; i++) s.players.forEach(p => p.hand.push(s.deck.pop()));
  s.turn = Math.random() * s.players.length | 0;
  log(s, `New game. ${s.players[s.turn].name} goes first`, 'turn');
  draw(s, s.players[s.turn], 2);
  return s;
}
function nextTurn(s){
  s.turn = (s.turn + 1) % s.players.length; s.plays = 0;
  const p = s.players[s.turn];
  draw(s, p, p.hand.length ? 2 : 5);
  log(s, `${p.name}’s turn`, 'turn');
}
function needs(s){
  if (s.phase !== 'play') return [];
  const pd = s.pending;
  if (pd) return [...new Set(pd.targets.filter(t => !t.done).map(t => t.no % 2 ? pd.actor : t.pid))];
  return [s.players[s.turn].id];
}
function startPending(s, pd, targets){
  s.pending = {...pd, targets: targets.map(t => ({pid:t.id, no:0, done:false}))};
  const a = P(s, pd.actor).name, who = targets.length > 1 ? 'everyone' : targets[0].name;
  const title = pd.kind === 'rent' ? `Rent · $${pd.amount}M` : KIND[pd.kind];
  const what = PAY.has(pd.kind) ? `${a} charged ${who} $${pd.amount}M` + (pd.kind === 'rent' ? ` rent on ${COLORS[pd.color].name}` : ` with ${KIND[pd.kind]}`)
    : pd.kind === 'breaker' ? `${a} played Deal Breaker on ${who}’s ${COLORS[pd.color].name} set`
    : `${a} played ${KIND[pd.kind]} on ${who}’s ${C(pd.tcard).type === 'prop' ? C(pd.tcard).name : 'wild card'}`;
  log(s, what, 'big', {title, sub:`${a} → ${who}`});
}
function payWith(s, pd, t, ids){
  const tp = P(s, t.pid), ap = P(s, pd.actor);
  for (const id of ids){
    if (tp.bank.includes(id)){ tp.bank.splice(tp.bank.indexOf(id), 1); ap.bank.push(id); continue; }
    const g = groupOf(tp, id); if (!g) continue;
    if (g.house === id || g.hotel === id){ removeFromTable(tp, id); ap.bank.push(id); }
    else { const color = g.color; removeFromTable(tp, id); addProp(ap, id, color); }
  }
  normalize(tp); normalize(ap); t.done = true;
  log(s, ids.length ? `${tp.name} paid ${ap.name} $${worth(ids)}M` : `${tp.name} had nothing to pay with`, 'pay');
}
function resolveSteal(s, pd, t){
  const tp = P(s, t.pid), ap = P(s, pd.actor); t.done = true;
  if (pd.kind === 'breaker'){
    const g = groupOf(tp, pd.gcard);
    if (!g || !full(g)) return log(s, 'That set is no longer complete. Deal Breaker fizzled');
    tp.groups.splice(tp.groups.indexOf(g), 1); ap.groups.push(g);
    log(s, `${ap.name} took ${tp.name}’s ${COLORS[g.color].name} set`, 'steal');
  } else {
    const g = groupOf(tp, pd.tcard);
    if (!g || full(g) || !g.cards.includes(pd.tcard)) return log(s, 'That property is no longer available');
    if (pd.kind === 'forced'){
      const mg = groupOf(ap, pd.mycard);
      if (!mg || full(mg) || !mg.cards.includes(pd.mycard)) return log(s, 'The swap card is no longer available');
      const mc = mg.color; removeFromTable(ap, pd.mycard); addProp(tp, pd.mycard, mc);
    }
    const c = g.color; removeFromTable(tp, pd.tcard); addProp(ap, pd.tcard, c);
    log(s, pd.kind === 'forced' ? `${ap.name} swapped properties with ${tp.name}` : `${ap.name} took ${tp.name}’s property`, 'steal');
  }
  normalize(tp); normalize(ap);
}
// Skip prompts that have only one possible answer (no Just Say No in hand, or nothing left to choose).
function autoResolve(s){
  const pd = s.pending; if (!pd) return;
  const actor = P(s, pd.actor);
  for (const t of pd.targets){
    if (t.done) continue;
    const tp = P(s, t.pid);
    if (t.no % 2){ if (!hasNo(actor)){ t.done = true; log(s, `${tp.name} blocked ${actor.name}’s ${KIND[pd.kind]}`, 'info'); } }
    else if (!hasNo(tp)){
      if (PAY.has(pd.kind)){ const as = payable(tp); if (worth(as) <= pd.amount) payWith(s, pd, t, as); }
      else resolveSteal(s, pd, t);
    }
  }
  if (pd.targets.every(t => t.done)) s.pending = null;
}
function checkWin(s){
  if (s.phase !== 'play') return;
  const order = [s.players[s.turn], ...s.players];
  const w = order.find(p => setsOf(p) >= 3);
  if (w){ s.phase = 'over'; s.winner = w.id; s.pending = null; log(s, `${w.name} wins with three complete sets!`, 'win', {title:`${w.name} wins!`, sub:'Three complete sets'}); }
}
function apply(s, pid, a){
  if (!a || typeof a !== 'object') return 'That move was not understood';
  if (s.phase !== 'play') return 'The game is not running';
  const me = P(s, pid); if (!me) return 'You are watching this game';
  const err = act(s, me, a);
  if (!err){ autoResolve(s); checkWin(s); }
  return err;
}
function act(s, me, a){
  const cur = s.players[s.turn], pd = s.pending;
  if (a.t === 'no' || a.t === 'accept' || a.t === 'pay'){
    if (!pd) return 'There is nothing to answer';
    const slot = me.id === pd.actor
      ? pd.targets.find(t => !t.done && t.no % 2 === 1 && (a.target == null || t.pid === a.target))
      : pd.targets.find(t => t.pid === me.id && !t.done && t.no % 2 === 0);
    if (!slot) return 'Nothing is waiting on you right now';
    if (a.t === 'no'){
      const j = me.hand.find(id => C(id).act === 'jsn'); if (j == null) return 'You have no Just Say No card';
      me.hand.splice(me.hand.indexOf(j), 1); s.discard.push(j); slot.no++;
      log(s, `${me.name} said Just Say No!`, 'big', {title:'Just Say No!', sub:me.name});
    } else if (me.id === pd.actor){
      if (a.t !== 'accept') return 'Choose Accept or Just Say No';
      slot.done = true; log(s, `${P(s, slot.pid).name} blocked ${me.name}’s ${KIND[pd.kind]}`);
    } else if (PAY.has(pd.kind)){
      if (a.t !== 'pay') return 'Choose cards to pay with';
      const ids = [...new Set(a.cards || [])], as = payable(me);
      if (ids.some(id => !as.includes(id))) return 'You can only pay with cards from your bank and properties';
      if (worth(ids) < pd.amount && ids.length < as.length) return `Pick at least $${pd.amount}M, or everything you have`;
      payWith(s, pd, slot, ids);
    } else {
      if (a.t !== 'accept') return 'Choose Allow or Just Say No';
      resolveSteal(s, pd, slot);
    }
    if (pd.targets.every(t => t.done)) s.pending = null;
    return;
  }
  if (me !== cur) return 'It’s not your turn';
  if (pd) return 'Waiting for other players to respond';
  if (a.t === 'discard'){
    if (!s.discarding) return 'You don’t need to discard';
    const ids = [...new Set(a.cards || [])], need = me.hand.length - 7;
    if (ids.length !== need || ids.some(id => !me.hand.includes(id))) return `Pick exactly ${need} card${need > 1 ? 's' : ''} to discard`;
    ids.forEach(id => { me.hand.splice(me.hand.indexOf(id), 1); s.discard.push(id); });
    s.discarding = false; log(s, `${me.name} discarded ${need} card${need > 1 ? 's' : ''}`);
    return nextTurn(s);
  }
  if (s.discarding) return 'Discard down to 7 cards first';
  if (a.t === 'end'){ if (me.hand.length > 7){ s.discarding = true; return; } return nextTurn(s); }
  if (a.t === 'move'){
    const g = groupOf(me, a.card);
    if (!g || !g.cards.includes(a.card) || C(a.card).type !== 'wild') return 'Pick one of your wild cards';
    if (!C(a.card).colors.includes(a.color)) return 'This wild card can’t be that color';
    if (g.color === a.color) return;
    removeFromTable(me, a.card); addProp(me, a.card, a.color); normalize(me);
    log(s, `${me.name} moved a wild card to ${COLORS[a.color].name}`); return;
  }
  const id = a.card, c = C(id);
  if (!c || !me.hand.includes(id)) return 'That card is not in your hand';
  if (s.plays >= 3) return 'You’ve used all 3 plays. End your turn';
  const spend = (ids, n = 1) => { ids.forEach(x => me.hand.splice(me.hand.indexOf(x), 1)); s.plays += n; };
  const tgt = () => { const t = P(s, a.target); return t && t !== me ? t : null; };
  switch (a.t){
    case 'prop': {
      if (!isProp(id)) return 'That is not a property';
      const color = c.type === 'prop' ? c.color : a.color;
      if (c.type === 'wild' && !c.colors.includes(color)) return 'Pick a color for this wild card';
      spend([id]); addProp(me, id, color); normalize(me);
      log(s, `${me.name} laid ${c.type === 'prop' ? c.name : 'a wild card'} (${COLORS[color].name})`, 'play'); return;
    }
    case 'bank':
      if (isProp(id)) return 'Properties can’t go in the bank';
      spend([id]); me.bank.push(id); log(s, `${me.name} banked $${c.value}M`, 'play'); return;
    case 'passgo':
      if (c.act !== 'passgo') return 'That is not Pass Go';
      spend([id]); s.discard.push(id); draw(s, me, 2); log(s, `${me.name} played Pass Go and drew 2`, 'play'); return;
    case 'build': {
      if (c.act !== 'house' && c.act !== 'hotel') return 'That is not a building';
      const g = groupOf(me, a.gcard);
      if (!g || !full(g)) return 'Buildings go on complete sets';
      if (g.color === 'railroad' || g.color === 'utility') return 'Buildings can’t go on railroads or utilities';
      if (c.act === 'house'){ if (g.house != null) return 'That set already has a house'; spend([id]); g.house = id; }
      else { if (g.house == null) return 'Add a house before a hotel'; if (g.hotel != null) return 'That set already has a hotel'; spend([id]); g.hotel = id; }
      log(s, `${me.name} built a ${c.act} on ${COLORS[g.color].name}`, 'play'); return;
    }
    case 'rent': {
      if (c.type !== 'rent') return 'That is not a rent card';
      if (!c.colors.includes(a.color)) return 'This rent card can’t charge that color';
      const base = rentFor(me, a.color); if (!base) return `You have no ${COLORS[a.color].name} properties`;
      const dbl = [...new Set(a.doubles || [])];
      if (dbl.some(x => !me.hand.includes(x) || C(x).act !== 'double')) return 'Double the Rent card not found';
      if (s.plays + 1 + dbl.length > 3) return 'Not enough plays left to double';
      let targets;
      if (c.wild){ const t = tgt(); if (!t) return 'Pick a player to charge'; targets = [t]; }
      else targets = s.players.filter(p => p !== me);
      spend([id, ...dbl], 1 + dbl.length); s.discard.push(id, ...dbl);
      return startPending(s, {kind:'rent', actor:me.id, card:id, amount:base * 2 ** dbl.length, color:a.color, doubled:dbl.length}, targets);
    }
    case 'debt': case 'birthday': {
      if (c.act !== a.t) return 'Wrong card';
      const targets = a.t === 'debt' ? [tgt()] : s.players.filter(p => p !== me);
      if (!targets[0]) return 'Pick a player';
      spend([id]); s.discard.push(id);
      return startPending(s, {kind:a.t, actor:me.id, card:id, amount:a.t === 'debt' ? 5 : 2}, targets);
    }
    case 'sly': case 'forced': {
      if (c.act !== a.t) return 'Wrong card';
      const t = tgt(); if (!t) return 'Pick a player';
      const g = groupOf(t, a.tcard);
      if (!g || !g.cards.includes(a.tcard) || full(g)) return 'Pick a property that isn’t part of a complete set';
      if (a.t === 'forced'){
        const mg = groupOf(me, a.mycard);
        if (!mg || !mg.cards.includes(a.mycard) || full(mg)) return 'Pick one of your properties that isn’t in a complete set';
      }
      spend([id]); s.discard.push(id);
      return startPending(s, {kind:a.t, actor:me.id, card:id, tcard:a.tcard, mycard:a.mycard ?? null}, [t]);
    }
    case 'breaker': {
      if (c.act !== 'breaker') return 'Wrong card';
      const t = tgt(); if (!t) return 'Pick a player';
      const g = groupOf(t, a.gcard); if (!g || !full(g)) return 'Pick a complete set';
      spend([id]); s.discard.push(id);
      return startPending(s, {kind:'breaker', actor:me.id, card:id, gcard:g.cards[0], color:g.color}, [t]);
    }
  }
  return 'That move was not understood';
}
