/* =====================================================================
   TIC TAC TOE — X and O, three in a row wins. Up to 8 people share a
   table, two at the board: winner stays on. The loser goes to the back of
   the queue and the next player steps up; after a draw both step down if
   anyone is waiting. The challenger is X and moves first; when the same
   two meet again, X swaps. Board cells hold the id of whoever marked them.
   ===================================================================== */
const TTT = (() => {
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const TIE = '$tie';   // drawn rounds are counted in totals under this key

  // extra.order, lastDuo and lastX come from the round before (see carry); new arrivals queue just ahead of the loser.
  function newGame(seats, extra = {}){
    const totals = {...(extra.totals || {})}, round = (extra.round || 0) + 1, order = extra.order || [];
    const rank = id => { const i = order.indexOf(id); return i < 0 ? order.length - 1.5 : i; };   // just ahead of the last (the loser)
    const players = [...seats].sort((a, b) => rank(a.id) - rank(b.id)).map(p => ({id:p.id, name:p.name}));
    const duo = [players[0].id, players[1].id], same = extra.lastDuo && duo.every(id => extra.lastDuo.includes(id));
    const x = !extra.lastDuo ? duo[0] : same ? duo.find(id => id !== extra.lastX) : duo[1];
    const s = {...extra, cfg:{...(extra.cfg || {})}, totals, round, phase:'play', gid:rid(8), ack:extra.ack || {}, log:[], ln:0,
      players, duo, x, turn:x, board:Array(9).fill(null), line:null, winner:null, order:null};
    delete s.lastDuo; delete s.lastX;
    log(s, `Round ${round}: ${P(s, duo[0]).name} vs ${P(s, duo[1]).name}. ${P(s, x).name} is X and goes first`, 'turn');
    return s;
  }
  const markOf = (s, id) => id === s.x ? 'X' : 'O';
  const other = (s, id) => s.duo.find(d => d !== id);
  const winLine = b => LINES.find(([a, c, d]) => b[a] != null && b[a] === b[c] && b[a] === b[d]) || null;
  function apply(s, pid, a){
    if (!a || typeof a !== 'object') return 'That move was not understood';
    const p = P(s, pid);
    if (!p) return 'You’re watching this game';
    if (!s.duo.includes(pid)) return 'You’re in the queue. You play when it’s your turn at the board';
    if (s.phase !== 'play') return 'This round is over';
    if (a.t !== 'move') return 'That move was not understood';
    if (pid !== s.turn) return 'It’s not your turn';
    const c = a.i;
    if (!Number.isInteger(c) || c < 0 || c > 8) return 'Pick a square';
    if (s.board[c] != null) return 'That square is taken';
    s.board[c] = pid;
    const line = winLine(s.board), rest = s.players.map(q => q.id).filter(id => !s.duo.includes(id));
    if (line){
      s.line = line; s.winner = pid; s.phase = 'over'; s.totals[pid] = (s.totals[pid] || 0) + 1;
      s.order = [pid, ...rest, other(s, pid)];
      log(s, `${p.name} wins round ${s.round}`, 'win', {title:`${p.name} wins!`, sub:rest.length ? `${P(s, rest[0]).name} is up next` : `Three ${markOf(s, pid)}s in a row`});
    } else if (s.board.every(v => v != null)){
      s.phase = 'over'; s.totals[TIE] = (s.totals[TIE] || 0) + 1;
      s.order = [...rest, ...s.duo];
      log(s, `Round ${s.round} is a draw`, 'big', {title:'Draw', sub:rest.length ? `${P(s, rest[0]).name}${rest[1] ? ' and ' + P(s, rest[1]).name : ''} play next` : 'Nobody got three in a row'});
    } else { s.turn = other(s, pid); log(s, `${p.name} played ${markOf(s, pid)}`); }
  }
  const needs = s => s.phase === 'play' ? [s.turn] : [];
  // Out of time: win if you can, block if you must, otherwise the middle, a corner, anything.
  function timeout(s){
    const empty = s.board.map((v, i) => v == null ? i : -1).filter(i => i >= 0);
    const finish = who => empty.find(c => { const b = [...s.board]; b[c] = who; return winLine(b); });
    const c = finish(s.turn) ?? finish(other(s, s.turn)) ?? (empty.includes(4) ? 4 : empty.find(c => [0, 2, 6, 8].includes(c)) ?? empty[0]);
    return {t:'move', i:c};
  }
  const carry = s => s.order ? {order:s.order, lastDuo:s.duo, lastX:s.x} : {};
  const late = {unit:'wins', why:'a fresh start', score:() => 0};

  /* ----- client ----- */
  // Marks are drawn strokes, so each one draws itself in when it appears.
  const X = '<svg viewBox="0 0 100 100" class="tx"><path d="M24 24L76 76"/><path d="M76 24L24 76"/></svg>';
  const O = '<svg viewBox="0 0 100 100" class="to"><circle cx="50" cy="50" r="28"/></svg>';
  const mk = m => m === 'X' ? X : O;
  function art(){
    const b = ['X', 'O', null, null, 'X', 'O', 'O', null, 'X'];
    return `<div class="ttt-art"><div class="ttt-board mini">${b.map(m => `<div class="tc">${m ? mk(m) : ''}</div>`).join('')}<svg class="tline" viewBox="0 0 300 300"><line x1="40" y1="40" x2="260" y2="260"/></svg></div></div>`;
  }
  const rules = () => sheet(`<div class="eyebrow">How to play</div><h2>Tic Tac Toe rules</h2><ul class="rules">
      <li><b>Goal</b><span>Get three of your marks in a row: across, down or diagonally.</span></li>
      <li><b>Turns</b><span>X always moves first. Take turns placing one mark in an empty square.</span></li>
      <li><b>Draw</b><span>If all nine squares fill up with no row of three, the round is a draw.</span></li>
      <li><b>Winner stays on</b><span>With more than two at the table, the winner keeps their seat, the loser goes to the back of the queue and the next player steps up. After a draw, both step down if anyone is waiting.</span></li>
      <li><b>Who starts</b><span>The challenger is X and moves first. When the same two play again, X swaps.</span></li>
      <li><b>Joining</b><span>Friends can join between rounds and wait in the queue.</span></li>
    </ul><div class="acts"><button class="btn gold" data-do="closemodal">Got it</button></div>`);
  function home(){
    const saved = store.get('tictactoe-local');
    while (form.locals.length < 2) form.locals.push('');
    const locals = form.locals.map((n, i) => `<div class="row"><input class="grow" id="tp${i}" data-local="${i}" value="${esc(n)}" placeholder="Player ${i + 1}" maxlength="18" aria-label="Player ${i + 1} name">${form.locals.length > 2 ? `<button class="tool" data-do="lrem" data-i="${i}">Remove</button>` : ''}</div>`).join('');
    return `<div class="home">
      <button class="btn small backlink" data-do="hub">← All games</button>
      <section class="hero">
        <div>
          <div class="eyebrow">Three in a row</div>
          <h1>Tic Tac <em>Toe</em></h1>
          <p>The classic, played as a series. Bring the whole group: winner stays on, everyone else queues for a shot, and the winning line lights up.</p>
          <div class="facts"><span class="fact"><b>2–8</b> players</span><span class="fact">Winner stays on</span><span class="fact">Online or one device</span></div>
        </div>
        <div class="fan" aria-hidden="true">${art()}</div>
      </section>
      <section class="panels">
        <div class="panel">
          <div class="eyebrow">Online</div><h2>Play friends</h2>
          <div class="field"><label for="nm">Your name</label><input id="nm" data-f="name" value="${esc(form.name)}" maxlength="18" placeholder="e.g. Priya" autocomplete="nickname"></div>
          ${net.ready ? `<button class="btn gold" data-do="host">Host a new table</button>
          <div class="field"><label for="cd">Or join with a code</label><div class="row"><input id="cd" class="grow code-in" data-f="code" value="${esc(form.code)}" maxlength="5" placeholder="ABCDE" autocomplete="off"><button class="btn" data-do="join">Join</button></div></div>`
          : '<p class="note">Can’t reach the game server right now, so online play is off. One-device play still works.</p>'}
        </div>
        <div class="panel">
          <div class="eyebrow">One device</div><h2>Side by side</h2>
          <p>Two at the board, the rest wait their turn.</p>
          <div class="names ttt-names">${locals}</div>
          <div class="row">${form.locals.length < 8 ? '<button class="btn small" data-do="ladd8">Add player</button>' : ''}<button class="btn gold" data-do="tlocal" style="margin-left:auto">Start</button></div>
          ${saved?.duo ? `<button class="btn small" data-do="tresume">Resume ${saved.players.map(p => esc(p.name)).join(', ')}</button>` : ''}
        </div>
        <div class="panel">
          <div class="eyebrow">New here?</div><h2>How it works</h2>
          <p>Take turns placing X and O. Three in a row wins the round, and the winner stays on.</p>
          <button class="btn" data-do="rules">Read the rules</button>
        </div>
      </section>
    </div>`;
  }
  // The winning line, as an SVG stroke across the board (cells are 100 units wide)
  const lineSVG = l => { const c = i => [(i % 3) * 100 + 50, Math.floor(i / 3) * 100 + 50], [a, b] = [c(l[0]), c(l[2])];
    const dx = Math.sign(b[0] - a[0]) * 34, dy = Math.sign(b[1] - a[1]) * 34;
    return `<svg class="tline" viewBox="0 0 300 300"><line x1="${a[0] - dx}" y1="${a[1] - dy}" x2="${b[0] + dx}" y2="${b[1] + dy}"/></svg>`; };
  let shown = {gid:'', cells:[]};   // squares already on screen: only a new mark draws itself in
  function view(s){
    const myTurn = s.phase === 'play' && s.turn === me, playing = s.duo.includes(me);
    const old = shown.gid === s.gid ? shown.cells : [];
    shown = {gid:s.gid, cells:s.board.map((v, i) => v == null ? -1 : i).filter(i => i >= 0)};
    const you = id => id === me && mode !== 'local';
    const card = id => { const p = P(s, id), up = s.phase === 'play' && s.turn === id, won = s.winner === id;
      return `<div class="ttt-p ${up ? 'up' : ''} ${won ? 'won' : ''} m${markOf(s, id)}" data-pid="${esc(id)}"><span class="ttt-m">${mk(markOf(s, id))}</span><div><b>${esc(p.name)}${you(id) ? ' (you)' : ''}</b><small>${up ? (you(id) ? 'Your move' : mode === 'local' ? 'To move' : 'Thinking…') : won ? 'Wins the round' : markOf(s, id)}</small></div><span class="ttt-sc">${s.totals[id] || 0}</span></div>`; };
    // During play: who's waiting. Between rounds: who plays next, and who waits after them.
    const queue = s.order ? s.order.filter(id => P(s, id)) : s.players.map(p => p.id).filter(id => !s.duo.includes(id));
    const nextUp = s.order ? queue.slice(0, 2) : [], waiting = s.order ? queue.slice(2) : queue;
    const say = s.phase === 'over' ? (s.winner ? `${esc(P(s, s.winner).name)} wins round ${s.round}` : 'It’s a draw')
      : mode === 'local' ? `${esc(P(s, s.turn).name)}’s move (${markOf(s, s.turn)})` : myTurn ? 'Your move' : !playing ? `${esc(P(s, s.turn).name)} to move` : `Waiting for ${esc(P(s, s.turn).name)}`;
    const canTap = s.phase === 'play' && (mode === 'local' || myTurn);
    const host = mode === 'local' || mode === 'host';
    return `<div class="game ttt-room"><div class="main">
      <header class="top">
        <div class="brand">Tic Tac <em>Toe</em></div>
        <span class="sync">Round ${s.round}</span>
        <div class="tools">${s.code ? `<span class="codechip">${esc(s.code)}</span>` : ''}<button class="tool" data-do="rules">Rules</button><button class="tool" data-do="mute">${muted ? 'Sound off' : 'Sound on'}</button><button class="tool" data-do="leave">Leave</button></div>
      </header>
      <section class="ttt-score">${card(s.duo[0])}<div class="ttt-tie"><b>${s.totals[TIE] || 0}</b><small>draws</small></div>${card(s.duo[1])}</section>
      ${s.players.length > 2 ? `<section class="ttt-queue"><span class="muted">${s.order ? 'Next round' : 'In the queue'}</span>
        ${s.order ? `<b>${nextUp.map(id => esc(P(s, id).name)).join(' vs ')}</b><span class="muted">then</span>` : ''}
        ${waiting.map((id, k) => `<span class="ttt-q ${id === me && mode !== 'local' ? 'me' : ''}" data-pid="${esc(id)}">${k + 1}. ${esc(P(s, id).name)} <small>${s.totals[id] || 0}</small></span>`).join('')}</section>` : ''}
      <section class="ttt-wrap"><div class="ttt-board ${s.phase === 'over' ? 'done' : ''} ${canTap ? 'live' : ''} t${markOf(s, s.turn)}">
        ${s.board.map((v, i) => v != null ? `<div class="tc m${markOf(s, v)} ${old.includes(i) ? '' : 'new'} ${s.line?.includes(i) ? 'win' : ''}">${mk(markOf(s, v))}</div>`
          : `<button class="tc" ${canTap ? `data-do="tmove" data-i="${i}" aria-label="Square ${i + 1}"` : 'disabled aria-label="Empty square"'}></button>`).join('')}
        ${s.line ? lineSVG(s.line) : ''}
      </div></section>
      <div class="ttt-say" aria-live="polite"><b>${say}</b>${s.phase === 'over' ? (host ? '<button class="btn gold" data-do="again">Next round</button>' : '<span class="muted">The host starts the next round.</span>')
        : P(s, me) && !playing && mode !== 'local' ? '<span class="muted">You’re in the queue. Winner stays on.</span>' : ''}</div>
    </div></div>${ui.modal === 'rules' ? rules() : ''}`;
  }
  Object.assign(H, {
    tmove:d => send({t:'move', i:+d.i}),
    tlocal:() => {
      const names = form.locals.map((n, i) => n.trim() || `Player ${i + 1}`);
      mode = 'local'; ui = freshUI(); seenLog = -1;
      G = {...newGame(names.map((name, i) => ({id:'p' + i, name})), {game:'tictactoe'}), v:1};
      store.set('tictactoe-local', G); screen = 'game'; render();
    },
    tresume:() => { G = store.get('tictactoe-local'); if (!G?.duo) return; mode = 'local'; ui = freshUI(); seenLog = -1; screen = 'game'; render(); },
  });

  return {name:'Tic Tac Toe', min:2, max:8, late, carry, timeout, newGame, apply, needs, home, view, rules, art, winLine};
})();
ENG.tictactoe = TTT;
