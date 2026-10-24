/* =====================================================================
   POKER — No-Limit Texas Hold'em with play-money chips, 2–9 players.
   Two hole cards each and five on the board; small and big blinds; four
   betting rounds; side pots for all-ins; best five of seven at showdown.
   A raise must be at least the last full bet or raise. A short all-in
   doesn't reopen betting for anyone who already acted, unless short
   all-ins add up to a full raise. Heads-up, the button posts the small
   blind and acts first before the flop.
   Card ids 0..51: rank id % 13 (0 = ace), suit Math.floor(id / 13): ♠ ♥ ♦ ♣.
   ===================================================================== */
const PK = (() => {
  const SUIT = ['♠', '♥', '♦', '♣'], SNAME = ['spades', 'hearts', 'diamonds', 'clubs'];
  const RK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const NM = ['', '', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
  const rv = id => id % 13 === 0 ? 14 : id % 13 + 1;   // 2..14
  const su = id => Math.floor(id / 13);
  const lbl = id => RK[id % 13] + SUIT[su(id)];
  const pl = v => v === 6 ? 'Sixes' : NM[v] + 's';
  const cfg = {stack:1000, bb:20};

  /* ----- hand values: [category, tiebreaks…], compared left to right ----- */
  function eval5(c){
    const r = c.map(rv).sort((a, b) => b - a), flush = c.every(x => su(x) === su(c[0]));
    const cnt = {}; r.forEach(x => { cnt[x] = (cnt[x] || 0) + 1; });
    const g = Object.entries(cnt).map(([k, n]) => [n, +k]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    let hi = 0;
    if (g.length === 5){ if (r[0] - r[4] === 4) hi = r[0]; else if (r[0] === 14 && r[1] === 5) hi = 5; }   // A-2-3-4-5 is a five-high straight
    if (hi && flush) return [8, hi];
    if (g[0][0] === 4) return [7, g[0][1], g[1][1]];
    if (g[0][0] === 3 && g[1][0] === 2) return [6, g[0][1], g[1][1]];
    if (flush) return [5, ...r];
    if (hi) return [4, hi];
    if (g[0][0] === 3) return [3, ...g.map(x => x[1])];
    if (g[0][0] === 2 && g[1][0] === 2) return [2, ...g.map(x => x[1])];
    if (g[0][0] === 2) return [1, ...g.map(x => x[1])];
    return [0, ...r];
  }
  const cmp = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++){ const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
  const handName = ([c, a, b]) => [`High card, ${NM[a]}`, `Pair of ${pl(a)}`, `Two pair, ${pl(a)} and ${pl(b)}`, `Three ${pl(a)}`, `Straight, ${NM[a]} high`,
    `Flush, ${NM[a]} high`, `Full house, ${pl(a)} full of ${pl(b)}`, `Four ${pl(a)}`, a === 14 ? 'Royal flush' : `Straight flush, ${NM[a]} high`][c];
  // The best five of five to seven cards.
  function best(cards){
    let top = null;
    const go = (from, acc) => {
      if (acc.length === 5){ const sc = eval5(acc); if (!top || cmp(sc, top.score) > 0) top = {score:sc, cards:[...acc]}; return; }
      for (let i = from; i <= cards.length - (5 - acc.length); i++){ acc.push(cards[i]); go(i + 1, acc); acc.pop(); }
    };
    go(0, []);
    top.name = handName(top.score);
    return top;
  }

  /* ----- a hand ----- */
  const nextIn = (s, i) => { const n = s.players.length; for (let k = 1; k <= n; k++){ const j = (i + k) % n; if (!s.players[j].out) return j; } return i; };
  const move = (p, n) => { p.stack -= n; p.street += n; p.total += n; if (!p.stack) p.allin = true; };
  const needsAct = (s, p) => !p.fold && !p.allin && (!p.acted || p.street < s.bet);
  // Re-raising is open to anyone who hasn't acted yet, or who now faces at least a full raise more than when they last acted.
  const canRaise = (s, p) => p.street + p.stack > s.bet && (!p.acted || s.bet - p.faced >= s.minRaise);
  const pot = s => s.players.reduce((a, p) => a + p.total, 0);

  function newGame(seats, extra = {}){
    const c = {...cfg, ...(extra.cfg || {})}, totals = {...(extra.totals || {})}, round = (extra.round || 0) + 1;
    const s = {...extra, cfg:c, totals, round, phase:'play', gid:rid(8), ack:extra.ack || {}, log:[], ln:0, champion:null, results:null, showdown:false,
      players:seats.map(p => ({id:p.id, name:p.name, stack:totals[p.id] ?? c.stack, hand:[], street:0, total:0, fold:false, allin:false, acted:false, faced:0, last:'', out:false, won:0, best:null})),
      deck:shuffle([...Array(52).keys()]), board:[], bet:0, minRaise:c.bb, street:0, turn:-1, btn:0};
    s.players.forEach(p => { p.out = p.stack <= 0; p.fold = p.out; s.totals[p.id] = p.stack; });
    const seated = s.players.filter(p => !p.out);
    if (seated.length < 2){ s.phase = 'over'; s.champion = seated[0]?.id ?? null; s.results = []; return s; }
    const n = s.players.length;
    let b = (round - 1) % n; while (s.players[b].out) b = (b + 1) % n;   // the button moves one seat a hand
    s.btn = b;
    const sb = seated.length === 2 ? b : nextIn(s, b), bb = nextIn(s, sb);
    s.sb = sb; s.bb = bb;
    for (let k = 0; k < 2; k++) for (let i = 1; i <= n; i++){ const p = s.players[(b + i) % n]; if (!p.out) p.hand.push(s.deck.pop()); }
    move(s.players[sb], Math.min(c.bb / 2, s.players[sb].stack)); s.players[sb].last = 'Small blind';
    move(s.players[bb], Math.min(c.bb, s.players[bb].stack)); s.players[bb].last = 'Big blind';
    s.bet = Math.max(s.players[sb].street, s.players[bb].street);
    log(s, `Hand ${round}. ${s.players[b].name} has the button. Blinds ${c.bb / 2}/${c.bb}`, 'turn');
    advance(s, bb);
    return s;
  }
  function advance(s, from){
    const live = s.players.filter(p => !p.fold);
    if (live.length === 1) return winUncontested(s, live[0]);
    const n = s.players.length;
    for (let k = 1; k <= n; k++){ const j = (from + k) % n; if (needsAct(s, s.players[j])){ s.turn = j; return; } }
    nextStreet(s);
  }
  function nextStreet(s){
    s.players.forEach(p => { p.street = 0; p.acted = false; p.faced = 0; if (!p.fold && !p.allin) p.last = ''; });
    s.bet = 0; s.minRaise = s.cfg.bb; s.turn = -1;
    if (s.street === 3) return showdown(s);
    s.street++;
    const dealt = s.deck.splice(-(s.street === 1 ? 3 : 1));
    s.board.push(...dealt);
    log(s, `${['', 'Flop', 'Turn', 'River'][s.street]}: ${dealt.map(lbl).join(' ')}`, 'deal');
    // With at most one player still able to bet, there's nothing to decide: run the board out.
    if (s.players.filter(p => !p.fold && !p.allin).length < 2) return nextStreet(s);
    advance(s, s.btn);
  }
  function winUncontested(s, w){
    const amt = pot(s);
    w.stack += amt; w.won = amt;
    s.results = [{amt, ids:[w.id], name:null}];
    log(s, `${w.name} wins ${amt}. Everyone else folded`, 'big', {title:`${w.name} takes it`, sub:`${amt.toLocaleString()} chips, no showdown`});
    finish(s);
  }
  // Each layer of contributions is its own pot, won by the best hand among the players who paid into all of it.
  function showdown(s){
    const live = s.players.filter(p => !p.fold), n = s.players.length;
    live.forEach(p => { p.best = best([...p.hand, ...s.board]); });
    const levels = [...new Set(s.players.map(p => p.total).filter(Boolean))].sort((a, b) => a - b);
    let prev = 0; s.results = [];
    for (const lv of levels){
      const amt = s.players.reduce((a, p) => a + Math.max(0, Math.min(p.total, lv) - prev), 0);
      let elig = live.filter(p => p.total >= lv);
      prev = lv;
      if (!amt) continue;
      if (!elig.length) elig = live.filter(p => p.total === Math.max(...live.map(q => q.total)));
      const topScore = elig.reduce((m, p) => cmp(p.best.score, m) > 0 ? p.best.score : m, elig[0].best.score);
      const ws = elig.filter(p => !cmp(p.best.score, topScore)).sort((a, b) => (s.players.indexOf(a) - s.btn - 1 + n) % n - (s.players.indexOf(b) - s.btn - 1 + n) % n);
      const share = Math.floor(amt / ws.length);
      let odd = amt - share * ws.length;   // odd chips go to the winners closest to the button's left
      ws.forEach(p => { const w = share + (odd-- > 0 ? 1 : 0); p.stack += w; p.won += w; });
      const last = s.results.at(-1);
      if (last && last.ids.join() === ws.map(p => p.id).join()) last.amt += amt;
      else s.results.push({amt, ids:ws.map(p => p.id), name:ws[0].best.name});
    }
    s.showdown = true;
    s.results.forEach((r, i) => {
      const who = r.ids.map(id => P(s, id).name).join(' and ');
      log(s, `${who} ${r.ids.length > 1 ? 'split' : 'wins'} ${i ? 'a side pot of ' : ''}${r.amt} with ${r.name.replace(/^[A-Z]/, m => m.toLowerCase())}`, 'big',
        {title:r.name.split(',')[0], sub:`${who} ${r.ids.length > 1 ? 'split' : 'wins'} ${r.amt.toLocaleString()}`});
    });
    finish(s);
  }
  function finish(s){
    s.phase = 'over'; s.turn = -1;
    s.players.forEach(p => { s.totals[p.id] = p.stack; });
    const left = s.players.filter(p => p.stack > 0);
    if (left.length === 1){
      s.champion = left[0].id;
      log(s, `${left[0].name} has every chip and wins the game`, 'win', {title:`${left[0].name} wins!`, sub:'Every chip at the table'});
    }
  }

  function apply(s, pid, a){
    if (!a || typeof a !== 'object') return 'That move was not understood';
    const p = P(s, pid); if (!p) return 'You’re watching this game';
    if (a.t === 'rebuy'){
      if (s.phase !== 'over') return 'You can buy back in between hands';
      if (p.stack > 0) return 'You still have chips';
      p.stack = s.totals[p.id] = s.cfg.stack;
      if (s.players.filter(q => q.stack > 0).length > 1) s.champion = null;
      return log(s, `${p.name} buys back in for ${s.cfg.stack}`);
    }
    if (s.phase !== 'play') return 'This hand is over';
    if (s.players[s.turn] !== p) return 'It’s not your turn';
    const toCall = s.bet - p.street, was = s.bet;
    if (a.t === 'fold'){ p.fold = true; p.last = 'Fold'; log(s, `${p.name} folds`); }
    else if (a.t === 'check'){
      if (toCall > 0) return `Call ${Math.min(toCall, p.stack)} or fold`;
      p.last = 'Check'; log(s, `${p.name} checks`);
    } else if (a.t === 'call'){
      if (toCall <= 0) return 'Nothing to call. Check instead';
      move(p, Math.min(toCall, p.stack)); p.last = p.allin ? 'All-in' : 'Call';
      log(s, `${p.name} calls${p.allin ? ' all-in' : ''}`);
    } else if (a.t === 'raise'){
      const to = Math.floor(+a.to), max = p.street + p.stack;
      if (!(to > s.bet)) return `Raise to more than ${s.bet}`;
      if (!canRaise(s, p)) return 'You can call or fold. That all-in was too small to reopen the betting';
      if (to > max) return `You have ${max} in total`;
      if (to - s.bet < s.minRaise && to < max) return `The smallest ${s.bet ? 'raise' : 'bet'} is to ${s.bet + s.minRaise}`;
      move(p, to - p.street);
      if (to - s.bet >= s.minRaise) s.minRaise = to - s.bet;
      s.bet = to;
      p.last = p.allin ? 'All-in' : was ? 'Raise' : 'Bet';
      log(s, `${p.name} ${p.allin ? 'goes all-in for' : was ? 'raises to' : 'bets'} ${to}`, p.allin ? 'big' : 'info', p.allin ? {title:'All-in', sub:`${p.name} · ${to.toLocaleString()}`} : {});
    } else return 'That move was not understood';
    p.acted = true; p.faced = s.bet;
    advance(s, s.turn);
  }
  const needs = s => s.phase === 'play' && s.turn >= 0 ? [s.players[s.turn].id] : [];

  /* ----- client ----- */
  const fmt = n => n.toLocaleString();
  function card(id, o = {}){
    if (id == null || o.down) return `<div class="pkc down ${o.cls || ''}" ${o.attrs || ''}></div>`;
    const k = su(id);
    return `<div class="pkc s${k} ${o.cls || ''}" ${o.cid ? `data-cid="${id}"` : ''} ${o.attrs || ''} role="img" aria-label="${RK[id % 13]} of ${SNAME[k]}"><b>${RK[id % 13]}</b><i>${SUIT[k]}</i><span>${SUIT[k]}</span></div>`;
  }
  // A stack of chips for an amount, coloured by denomination.
  const DEN = [[1000, '#d4a72c'], [500, '#7c3aed'], [100, '#18181c'], [25, '#15803d'], [5, '#c8102e'], [1, '#ece8dc']];
  function chips(n){
    const out = []; let r = n;
    for (const [v, c] of DEN){ let k = Math.floor(r / v); r -= k * v; while (k-- > 0 && out.length < 9) out.push(c); }
    return `<span class="pk-chips" aria-hidden="true">${out.reverse().map((c, i) => `<i style="--c:${c};--i:${i}"></i>`).join('')}</span>`;
  }
  const preflop = h => { const [a, b] = [...h].sort((x, y) => rv(y) - rv(x)); return rv(a) === rv(b) ? `Pocket ${pl(rv(a))}` : `${NM[rv(a)]}–${NM[rv(b)]}${su(a) === su(b) ? ' suited' : ''}`; };
  function art(){
    const cards = [[9, -18, -112, 18], [10, -8, -54, 4], [11, 2, 4, -4], [12, 12, 62, 4], [0, 22, 120, 18]];
    return `<div class="pk-art" style="position:absolute;inset:0">${cards.map(([id, r, x, y]) => `<div class="fi" style="transform:translate(-50%,-50%) rotate(${r}deg) translate(${x * .55}px,${y * .9}px);--r2:${r * 1.25}deg;--x2:${x * .75}px;--yy:${y - 10}px">${card(id)}</div>`).join('')}</div>`;
  }
  const rulesList = [
    ['Goal', 'Win chips by having the best five-card hand at showdown, or by betting so everyone else folds. Play-money chips only.'],
    ['The deal', 'Everyone gets two cards face down. The two players left of the button post the small and big blinds.'],
    ['Betting', 'Fold, check if nobody has bet, call, or bet and raise. This is no-limit: you can bet everything you have. A raise must be at least the size of the last bet or raise.'],
    ['The board', 'After the first round comes the flop (three shared cards), then the turn (one) and the river (one), each followed by a round of betting.'],
    ['Showdown', 'Players still in show their cards. The best five of your two cards and the five on the board wins. Ties split the pot.'],
    ['Hand ranks', 'From best: royal flush, straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, pair, high card. A-2-3-4-5 is the lowest straight.'],
    ['All-in', 'Out of chips mid-hand? You stay in for what you put in; the rest goes to side pots you can’t win. A short all-in doesn’t let players who already acted raise again.'],
    ['Two players', 'The button posts the small blind and acts first before the flop, then last after it.'],
    ['Out of chips', 'You can buy back in between hands. The last player with chips wins the game.'],
    ['Four colours', 'Spades are black, hearts red, diamonds blue and clubs green, so flushes are easy to spot.'],
  ];
  const rules = () => sheet(`<div class="eyebrow">How to play</div><h2>Texas Hold’em rules</h2><ul class="rules">${rulesList.map(([k, v]) => `<li><b>${k}</b><span>${v}</span></li>`).join('')}</ul>
    <div class="acts"><button class="btn gold" data-do="closemodal">Got it</button></div>`);

  function home(){
    const saved = store.get('poker-local');
    const locals = form.locals.map((n, i) => `<div class="row"><input class="grow" id="lp${i}" data-local="${i}" value="${esc(n)}" placeholder="Player ${i + 1}" maxlength="18" aria-label="Player ${i + 1} name" style="min-width:0;background:rgba(0,0,0,.28);border:1px solid var(--line);border-radius:12px;padding:11px 14px;color:var(--text);font:500 16px var(--body)">${form.locals.length > 2 ? `<button class="tool" data-do="lrem" data-i="${i}">Remove</button>` : ''}</div>`).join('');
    return `<div class="home">
      <button class="btn small backlink" data-do="hub">← All games</button>
      <section class="hero">
        <div>
          <div class="eyebrow">No-limit Texas Hold’em</div>
          <h1>Poker</h1>
          <p>Two cards each, five on the board and every chip on the line. Bluff, call, shove. Play money only.</p>
          <div class="facts"><span class="fact"><b>2–9</b> players</span><span class="fact"><b>${cfg.stack}</b> chips each</span><span class="fact">Blinds <b>${cfg.bb / 2}/${cfg.bb}</b></span><span class="fact">Side pots</span></div>
        </div>
        <div class="fan" aria-hidden="true">${art()}</div>
      </section>
      <section class="panels">
        <div class="panel">
          <div class="eyebrow">Online</div><h2>Host a table</h2>
          <div class="field"><label for="nm">Your name</label><input id="nm" data-f="name" value="${esc(form.name)}" maxlength="18" placeholder="e.g. Priya" autocomplete="nickname"></div>
          ${net.ready ? `<button class="btn gold" data-do="host">Host a new table</button>
          <div class="field"><label for="cd">Or join with a code</label><div class="row"><input id="cd" class="grow code-in" data-f="code" value="${esc(form.code)}" maxlength="5" placeholder="ABCDE" autocomplete="off"><button class="btn" data-do="join">Join</button></div></div>`
          : '<p class="note">Can’t reach the game server right now, so online play is off. Offline modes still work.</p>'}
        </div>
        <div class="panel">
          <div class="eyebrow">One device</div><h2>Pass &amp; play</h2>
          <p>Hand the device to whoever’s turn it is. Hole cards stay hidden behind a pass screen.</p>
          <div class="names">${locals}</div>
          <div class="row">${form.locals.length < 9 ? '<button class="btn small" data-do="ladd9">Add player</button>' : ''}<button class="btn gold" data-do="pklocal" style="margin-left:auto">Start game</button></div>
          ${saved?.players ? `<button class="btn small" data-do="pkresume">Resume saved game (${saved.players.map(p => esc(p.name)).join(', ')})</button>` : ''}
        </div>
        <div class="panel">
          <div class="eyebrow">New here?</div><h2>How it works</h2>
          <p>Make the best five-card hand from your two cards and the five shared ones, or make everyone else fold first.</p>
          <button class="btn" data-do="rules">Read the rules</button>
        </div>
      </section>
    </div>`;
  }

  let boardSeen = '';   // the board cards already on the felt, so only new ones play the deal-in flip
  function view(s){
    const meP = P(s, me), actor = s.players[s.turn], myTurn = s.phase === 'play' && actor?.id === me, over = s.phase === 'over';
    const n = s.players.length, k0 = Math.max(0, s.players.findIndex(p => p.id === me));
    const on = mode === 'local' ? null : (() => { const l = live(); l.add(me); return l; })();
    const showCards = p => over && s.showdown && !p.fold;
    const peek = p => p.id === me && (mode !== 'local' || myTurn);
    const winSet = new Set(over && s.showdown ? s.results.flatMap(r => r.ids.flatMap(id => P(s, id).best.cards)) : []);
    const mark = id => winSet.size ? (winSet.has(id) ? 'hi' : 'dim') : '';
    const key = `${s.gid}:${s.board.length}`, prevN = boardSeen.startsWith(s.gid + ':') ? +boardSeen.split(':')[1] : 0;
    boardSeen = key;
    const inPot = pot(s) - s.players.reduce((a, p) => a + p.street, 0);
    const seats = s.players.map((p, i) => {
      const a = Math.PI / 2 + 2 * Math.PI * ((i - k0 + n) % n) / n, cx = Math.cos(a).toFixed(3), cy = Math.sin(a).toFixed(3);
      const at = (x, y, dx = cx, dy = cy) => `left:calc(50% + ${dx} * var(--${x}));top:calc(50% + ${dy} * var(--${y}))`;   // radii shrink on phones
      const won = over && p.won > 0, mine = p.id === me && mode !== 'local';
      const hole = p.out ? '' : p.hand.map(id => showCards(p) || peek(p) ? card(id, {cid:peek(p), cls:mark(id)}) : card(id, {down:true})).join('');
      const tag = p.out ? 'Out' : p.last;
      const bet = p.street ? `<div class="pk-bet" style="${at('bx', 'by')}">${chips(p.street)}<b>${fmt(p.street)}</b></div>` : '';
      const btn = i === s.btn && !p.out ? `<span class="pk-dealer" style="${at('dx', 'dy', Math.cos(a + .32).toFixed(3), Math.sin(a + .32).toFixed(3))}">D</span>` : '';
      return `${bet}${btn}<div class="pk-seat ${actor === p ? 'up' : ''} ${p.fold && !p.out ? 'folded' : ''} ${p.out ? 'out' : ''} ${won ? 'won' : ''} ${mine ? 'me' : ''}" style="${at('sx', 'sy')}" data-pid="${esc(p.id)}">
        <div class="pk-hole">${hole}</div>
        <div class="pk-plate">${avatar(s, p)}<div><b>${on && !on.has(p.id) ? '<span class="dot"></span> ' : ''}${esc(p.name)}</b><span>${fmt(p.stack)}</span></div></div>
        ${won ? `<span class="pk-tag win">+${fmt(p.won)}</span>` : tag ? `<span class="pk-tag ${tag === 'All-in' ? 'allin' : tag === 'Fold' ? 'fold' : ''}">${tag}</span>` : ''}
        ${showCards(p) && p.best ? `<small class="pk-hand">${p.best.name}</small>` : ''}
      </div>`;
    }).join('');
    const board = Array.from({length:5}, (_, i) => s.board[i] != null ? card(s.board[i], {cid:true, cls:`${mark(s.board[i])} ${i >= prevN ? 'deal' : ''}`, attrs:i >= prevN ? `style="animation-delay:${(i - prevN) * 140}ms"` : ''}) : '<div class="pkc spot"></div>').join('');
    const say = over ? (s.champion ? `${esc(P(s, s.champion).name)} wins the game` : s.results.map(r => `${r.ids.map(id => esc(P(s, id).name)).join(' & ')} ${r.ids.length > 1 ? 'split' : 'wins'} ${fmt(r.amt)}`).join(' · '))
      : myTurn ? 'Your turn' : `${esc(actor.name)} to act`;
    return `<div class="game pk-room"><div class="main">
      <header class="pk-bar">
        <div class="pk-logo">Poker</div>
        <span class="pk-meta">Hand ${s.round} · Blinds ${s.cfg.bb / 2}/${s.cfg.bb}</span>
        <div class="tools">${s.code ? `<span class="codechip">${esc(s.code)}</span>` : ''}<button class="tool" data-do="rules">Rules</button><button class="tool" data-do="mute">${muted ? 'Sound off' : 'Sound on'}</button><button class="tool" data-do="leave">Leave</button></div>
      </header>
      <section class="pk-table">
        <div class="pk-rail"><div class="pk-felt"><span class="pk-mark">Playroom</span></div></div>
        <div class="pk-center">
          <div class="pk-pot">${inPot ? chips(inPot) : ''}<span>Pot <b>${fmt(pot(s))}</b></span></div>
          <div class="pk-board">${board}</div>
          <div class="pk-say">${say}</div>
        </div>
        <div class="pk-shoe" id="deck">${card(null, {down:true})}</div>
        ${seats}
      </section>
      ${dock(s, meP, myTurn)}
    </div></div>${modal(s)}${curtain(s)}`;
  }
  function dock(s, meP, myTurn){
    const over = s.phase === 'over', next = mode === 'local' || mode === 'host';
    if (!meP) return `<section class="pk-dock"><span class="pk-info">You’re watching this game.</span>${over && next && !s.champion ? '<button class="pk-btn gold" data-do="again">Next hand</button>' : ''}</section>`;
    const local = mode === 'local';
    const strength = !meP.hand.length || (local && !myTurn && !over) ? '' : s.board.length ? best([...meP.hand, ...s.board]).name : preflop(meP.hand);
    if (over){
      const busted = s.players.filter(p => p.stack <= 0 && (local || p.id === me));
      return `<section class="pk-dock"><span class="pk-info">${local ? 'Hand over.' : strength ? `You had ${strength.replace(/^[A-Z]/, m => m.toLowerCase())}.` : ''}</span>
        ${busted.map(p => `<button class="pk-btn" data-do="pkrebuy" data-id="${esc(p.id)}">${local ? `${esc(p.name)}: ` : ''}Buy back in for ${fmt(s.cfg.stack)}</button>`).join('')}
        ${next && !s.champion ? '<button class="pk-btn gold" data-do="again">Next hand</button>' : !next ? '<span class="pk-info">The host deals the next hand.</span>' : ''}</section>`;
    }
    if (!myTurn) return `<section class="pk-dock"><span class="pk-info">${strength ? `<b>${strength}</b> · ` : ''}Waiting for ${esc(s.players[s.turn].name)}…</span></section>`;
    const toCall = Math.min(s.bet - meP.street, meP.stack), max = meP.street + meP.stack, raise = canRaise(s, meP);
    const minTo = Math.min(s.bet + s.minRaise, max), all = pot(s);
    const to = Math.max(minTo, Math.min(max, ui.pkTo || minTo));
    const at = f => Math.max(minTo, Math.min(max, Math.round(s.bet + (all + toCall) * f)));
    const quick = [['Min', minTo], ['½ pot', at(.5)], ['¾ pot', at(.75)], ['Pot', at(1)], ['All-in', max]].filter(([, v], i, arr) => arr.findIndex(x => x[1] === v) === i);
    const verb = v => v >= max ? `All-in ${fmt(v)}` : `${s.bet ? 'Raise to' : 'Bet'} ${fmt(v)}`;
    return `<section class="pk-dock turn">
      <span class="pk-info">${strength ? `<b>${strength}</b>` : ''}${toCall ? ` · ${fmt(toCall)} to call` : ''}</span>
      <div class="pk-acts">
        <button class="pk-btn fold" data-do="pkact" data-t="fold">Fold</button>
        <button class="pk-btn" data-do="pkact" data-t="${toCall ? 'call' : 'check'}">${toCall ? `${toCall >= meP.stack ? 'All-in' : 'Call'} ${fmt(toCall)}` : 'Check'}</button>
        ${raise ? `<div class="pk-raise">
          <div class="pk-quick">${quick.map(([l, v]) => `<button data-do="pkto" data-v="${v}" class="${v === to ? 'on' : ''}">${l}</button>`).join('')}</div>
          <input type="range" id="pkr" data-pkr min="${minTo}" max="${max}" step="${Math.max(1, s.cfg.bb / 2)}" value="${to}" aria-label="Raise amount">
          <button class="pk-btn gold" data-do="pkraise" id="pkrb">${verb(to)}</button></div>` : ''}
      </div>
    </section>`;
  }
  function modal(s){
    if (ui.modal === 'rules') return rules();
    if (s.phase !== 'over' || !s.champion) return '';
    const next = mode === 'local' || mode === 'host', c = P(s, s.champion);
    return sheet(`<div class="eyebrow">Game over</div><h2>${esc(c.name)} wins with ${fmt(c.stack)} chips</h2>
      <p class="lede">Everyone else is out of chips. Busted players can buy back in to keep playing, or start a new game.</p>
      <div class="acts"><button class="btn" data-do="leave">Back to menu</button>${s.players.filter(p => p.stack <= 0 && (mode === 'local' || p.id === me)).map(p => `<button class="btn" data-do="pkrebuy" data-id="${esc(p.id)}">${mode === 'local' ? esc(p.name) + ': b' : 'B'}uy back in</button>`).join('')}${next ? '<button class="btn gold" data-do="pknew">New game</button>' : ''}</div>`);
  }
  function curtain(s){
    if (mode !== 'local' || s.phase !== 'play' || ui.revealed === me) return '';
    const p = P(s, me), tc = Math.min(s.bet - p.street, p.stack);
    return `<div class="curtain"><div><div class="eyebrow">Pass the device</div><h2>${avatar(s, p)} ${esc(p.name)}</h2><p class="muted">Your turn. ${tc ? `${fmt(tc)} to call.` : 'Nothing to call.'}</p><br><button class="btn gold" data-do="reveal">I’m ${esc(p.name)}. Show my cards</button></div></div>`;
  }

  Object.assign(H, {
    pkact:d => send({t:d.t}),
    pkto:d => { ui.pkTo = +d.v; render(); },
    pkraise:() => { const el = document.getElementById('pkr'); send({t:'raise', to:+(el?.value || ui.pkTo)}); },
    pkrebuy:d => { if (mode !== 'local') return send({t:'rebuy'}); const keep = me; me = d.id; send({t:'rebuy'}); me = keep; render(); },
    pknew:() => { G = {...G, totals:{}, round:0}; rematch(); },
    ladd9:() => { if (form.locals.length < 9) form.locals.push(''); render(); },
    pklocal:() => {
      const names = form.locals.map(n => n.trim()).filter(Boolean);
      if (names.length < 2) return toast('Add at least two player names');
      mode = 'local'; ui = freshUI(); seenLog = -1;
      G = {...newGame(names.map((name, i) => ({id:'p' + i, name})), {game:'poker'}), v:1};
      store.set('poker-local', G); screen = 'game'; render();
    },
    pkresume:() => { G = store.get('poker-local'); if (!G) return; mode = 'local'; ui = freshUI(); seenLog = -1; screen = 'game'; render(); },
  });

  return {name:'Poker', min:2, max:9, cfg, newGame, apply, needs, home, view, rules, art, best, eval5, cmp, canRaise, pot,
    lobby:(s, host) => {
      const c = s.cfg || cfg;
      if (!host) return `<p class="muted">${fmt(c.stack)} chips each · blinds ${c.bb / 2}/${c.bb}</p>`;
      const sel = (k, opts) => `<select data-pkcfg="${k}">${opts.map(([v, t]) => `<option value="${v}" ${v === c[k] ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
      return `<div class="row" style="flex-wrap:wrap;gap:12px"><label class="muted">Chips each ${sel('stack', [[500, '500'], [1000, '1,000'], [2000, '2,000'], [5000, '5,000']])}</label>
        <label class="muted">Blinds ${sel('bb', [[10, '5/10'], [20, '10/20'], [50, '25/50'], [100, '50/100']])}</label></div>`;
    }};
})();
ENG.poker = PK;
app.addEventListener('change', e => {
  const k = e.target.dataset.pkcfg;
  if (GID === 'poker' && k && mode === 'host' && G?.phase === 'lobby'){ G.cfg = {...G.cfg, [k]:+e.target.value}; G.v++; persist(); render(); }
});
// The raise slider updates its button live; re-rendering mid-drag would drop the slider.
app.addEventListener('input', e => {
  if (e.target.dataset.pkr == null) return;
  ui.pkTo = +e.target.value;
  const b = document.getElementById('pkrb'), max = +e.target.max, s = viewState();
  if (b) b.textContent = ui.pkTo >= max ? `All-in ${ui.pkTo.toLocaleString()}` : `${s.bet ? 'Raise to' : 'Bet'} ${ui.pkTo.toLocaleString()}`;
  document.querySelectorAll('.pk-quick button').forEach(x => x.classList.toggle('on', +x.dataset.v === ui.pkTo));
});
