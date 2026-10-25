/* =====================================================================
   TIC TAC TOE — two players, X and O, three in a row wins. Rounds run as
   a series: X alternates between the players and X always moves first.
   Board cells 0..8 hold the index of the player who marked them.
   ===================================================================== */
const TTT = (() => {
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const TIE = '$tie';   // drawn rounds are counted in totals under this key

  function newGame(seats, extra = {}){
    const totals = {...(extra.totals || {})}, round = (extra.round || 0) + 1;
    const s = {...extra, cfg:{...(extra.cfg || {})}, totals, round, phase:'play', gid:rid(8), ack:extra.ack || {}, log:[], ln:0,
      players:seats.slice(0, 2).map(p => ({id:p.id, name:p.name})), board:Array(9).fill(null), line:null, winner:null};
    s.x = (round - 1) % 2; s.turn = s.x;
    log(s, `Round ${round}. ${s.players[s.x].name} is X and goes first`, 'turn');
    return s;
  }
  const markOf = (s, i) => i === s.x ? 'X' : 'O';
  const winLine = b => LINES.find(([a, c, d]) => b[a] != null && b[a] === b[c] && b[a] === b[d]) || null;
  function apply(s, pid, a){
    if (!a || typeof a !== 'object') return 'That move was not understood';
    const i = s.players.findIndex(p => p.id === pid);
    if (i < 0) return 'You’re watching this game';
    if (s.phase !== 'play') return 'This round is over';
    if (a.t !== 'move') return 'That move was not understood';
    if (i !== s.turn) return 'It’s not your turn';
    const c = a.i;
    if (!Number.isInteger(c) || c < 0 || c > 8) return 'Pick a square';
    if (s.board[c] != null) return 'That square is taken';
    s.board[c] = i;
    const line = winLine(s.board), p = s.players[i];
    if (line){
      s.line = line; s.winner = p.id; s.phase = 'over'; s.totals[p.id] = (s.totals[p.id] || 0) + 1;
      log(s, `${p.name} wins round ${s.round}`, 'win', {title:`${p.name} wins!`, sub:`Three ${markOf(s, i)}s in a row`});
    } else if (s.board.every(v => v != null)){
      s.phase = 'over'; s.totals[TIE] = (s.totals[TIE] || 0) + 1;
      log(s, `Round ${s.round} is a draw`, 'big', {title:'Draw', sub:'Nobody got three in a row'});
    } else { s.turn = 1 - i; log(s, `${p.name} played ${markOf(s, i)}`); }
  }
  const needs = s => s.phase === 'play' ? [s.players[s.turn].id] : [];
  // Out of time: win if you can, block if you must, otherwise the middle, a corner, anything.
  function timeout(s){
    const me2 = s.turn, empty = s.board.map((v, i) => v == null ? i : -1).filter(i => i >= 0);
    const finish = who => empty.find(c => { const b = [...s.board]; b[c] = who; return winLine(b); });
    const c = finish(me2) ?? finish(1 - me2) ?? (empty.includes(4) ? 4 : empty.find(c => [0, 2, 6, 8].includes(c)) ?? empty[0]);
    return {t:'move', i:c};
  }

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
      <li><b>Series</b><span>Play as many rounds as you like. X switches players every round, and the score keeps count.</span></li>
    </ul><div class="acts"><button class="btn gold" data-do="closemodal">Got it</button></div>`);
  function home(){
    const saved = store.get('tictactoe-local');
    while (form.locals.length < 2) form.locals.push('');
    const locals = form.locals.slice(0, 2).map((n, i) => `<input class="grow" id="tp${i}" data-local="${i}" value="${esc(n)}" placeholder="Player ${i + 1} (${i ? 'O' : 'X'})" maxlength="18" aria-label="Player ${i + 1} name">`).join('');
    return `<div class="home">
      <button class="btn small backlink" data-do="hub">← All games</button>
      <section class="hero">
        <div>
          <div class="eyebrow">Three in a row</div>
          <h1>Tic Tac <em>Toe</em></h1>
          <p>The classic, played as a series. X switches every round, the score keeps count, and the winning line lights up.</p>
          <div class="facts"><span class="fact"><b>2</b> players</span><span class="fact">Best of as many as you like</span><span class="fact">Online or one device</span></div>
        </div>
        <div class="fan" aria-hidden="true">${art()}</div>
      </section>
      <section class="panels">
        <div class="panel">
          <div class="eyebrow">Online</div><h2>Play a friend</h2>
          <div class="field"><label for="nm">Your name</label><input id="nm" data-f="name" value="${esc(form.name)}" maxlength="18" placeholder="e.g. Priya" autocomplete="nickname"></div>
          ${net.ready ? `<button class="btn gold" data-do="host">Host a new table</button>
          <div class="field"><label for="cd">Or join with a code</label><div class="row"><input id="cd" class="grow code-in" data-f="code" value="${esc(form.code)}" maxlength="5" placeholder="ABCDE" autocomplete="off"><button class="btn" data-do="join">Join</button></div></div>`
          : '<p class="note">Can’t reach the game server right now, so online play is off. One-device play still works.</p>'}
        </div>
        <div class="panel">
          <div class="eyebrow">One device</div><h2>Side by side</h2>
          <div class="names ttt-names">${locals}</div>
          <div class="row"><button class="btn gold" data-do="tlocal" style="margin-left:auto">Start</button></div>
          ${saved?.players ? `<button class="btn small" data-do="tresume">Resume ${saved.players.map(p => esc(p.name)).join(' vs ')}</button>` : ''}
        </div>
        <div class="panel">
          <div class="eyebrow">New here?</div><h2>How it works</h2>
          <p>Take turns placing X and O. Three in a row wins the round.</p>
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
    const mi = s.players.findIndex(p => p.id === me), myTurn = s.phase === 'play' && s.turn === mi;
    const old = shown.gid === s.gid ? shown.cells : [];
    shown = {gid:s.gid, cells:s.board.map((v, i) => v == null ? -1 : i).filter(i => i >= 0)};
    const card = i => { const p = s.players[i], up = s.phase === 'play' && s.turn === i, won = s.winner === p.id;
      return `<div class="ttt-p ${up ? 'up' : ''} ${won ? 'won' : ''} m${markOf(s, i)}" data-pid="${esc(p.id)}"><span class="ttt-m">${mk(markOf(s, i))}</span><div><b>${esc(p.name)}${p.id === me && mode !== 'local' ? ' (you)' : ''}</b><small>${up ? (p.id === me && mode !== 'local' ? 'Your move' : mode === 'local' ? 'To move' : 'Thinking…') : won ? 'Wins the round' : markOf(s, i)}</small></div><span class="ttt-sc">${s.totals[p.id] || 0}</span></div>`; };
    const next = mode === 'local' || mode === 'host';
    const say = s.phase === 'over' ? (s.winner ? `${esc(P(s, s.winner).name)} wins round ${s.round}` : 'It’s a draw')
      : mode === 'local' ? `${esc(s.players[s.turn].name)}’s move (${markOf(s, s.turn)})` : myTurn ? 'Your move' : mi < 0 ? `${esc(s.players[s.turn].name)} to move` : `Waiting for ${esc(s.players[s.turn].name)}`;
    const canTap = s.phase === 'play' && (mode === 'local' || myTurn);
    return `<div class="game ttt-room"><div class="main">
      <header class="top">
        <div class="brand">Tic Tac <em>Toe</em></div>
        <span class="sync">Round ${s.round}</span>
        <div class="tools">${s.code ? `<span class="codechip">${esc(s.code)}</span>` : ''}<button class="tool" data-do="rules">Rules</button><button class="tool" data-do="mute">${muted ? 'Sound off' : 'Sound on'}</button><button class="tool" data-do="leave">Leave</button></div>
      </header>
      <section class="ttt-score">${card(0)}<div class="ttt-tie"><b>${s.totals[TIE] || 0}</b><small>draws</small></div>${card(1)}</section>
      <section class="ttt-wrap"><div class="ttt-board ${s.phase === 'over' ? 'done' : ''} ${canTap ? 'live' : ''} t${markOf(s, s.turn)}">
        ${s.board.map((v, i) => v != null ? `<div class="tc m${markOf(s, v)} ${old.includes(i) ? '' : 'new'} ${s.line?.includes(i) ? 'win' : ''}">${mk(markOf(s, v))}</div>`
          : `<button class="tc" ${canTap ? `data-do="tmove" data-i="${i}" aria-label="Square ${i + 1}"` : 'disabled aria-label="Empty square"'}></button>`).join('')}
        ${s.line ? lineSVG(s.line) : ''}
      </div></section>
      <div class="ttt-say" aria-live="polite"><b>${say}</b>${s.phase === 'over' ? (next ? '<button class="btn gold" data-do="again">Next round</button>' : '<span class="muted">The host starts the next round.</span>') : ''}</div>
    </div></div>${ui.modal === 'rules' ? rules() : ''}`;
  }
  Object.assign(H, {
    tmove:d => send({t:'move', i:+d.i}),
    tlocal:() => {
      const names = form.locals.slice(0, 2).map((n, i) => n.trim() || `Player ${i + 1}`);
      mode = 'local'; ui = freshUI(); seenLog = -1;
      G = {...newGame(names.map((name, i) => ({id:'p' + i, name})), {game:'tictactoe'}), v:1};
      store.set('tictactoe-local', G); screen = 'game'; render();
    },
    tresume:() => { G = store.get('tictactoe-local'); if (!G) return; mode = 'local'; ui = freshUI(); seenLog = -1; screen = 'game'; render(); },
  });

  return {name:'Tic Tac Toe', min:2, max:2, timeout, newGame, apply, needs, home, view, rules, art, winLine};
})();
ENG.tictactoe = TTT;
