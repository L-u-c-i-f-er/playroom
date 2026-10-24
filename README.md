# Playroom

Card and number games to play with friends: **Dealmaker** (Monopoly Deal rules), **Tambola / Housie**, **13-card Indian Rummy**, **Andar Bahar** (play-money chips), **Least Count**, **UNO**, **UNO Flip**, **UNO No Mercy**, **Mafia** and **Poker** (Texas Hold’em, play-money chips), plus **Solitaire** (Klondike, FreeCell, Spider) to play alone.

- **Online:** one person hosts a table and shares a 5-letter code. Friends open the site, enter the code and play from their own devices.
- **Offline:** pass one device around (Dealmaker, Rummy, Least Count, UNO, UNO Flip, UNO No Mercy, Mafia, Poker), bet from one shared screen (Andar Bahar), or use one device as the Tambola caller while everyone else opens tickets on their phones.

## Run it on your computer

Needs [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000. While editing the code, use `npm run dev` instead: it restarts the server whenever you save a file.

To try online play alone, open a second browser (or a private window) and join your own table with the code.

Friends on the same Wi-Fi can join at `http://<your-computer's-IP>:3000`.

```bash
npm test
```

runs the rules checks: hundreds of simulated Dealmaker, Rummy, Least Count, UNO, UNO Flip, Mafia, Poker and Solitaire games, thousands of Andar Bahar deals, plus Tambola ticket and claim checks.

## Deploy it

It's one small Node.js server that serves the site and handles online tables over WebSockets. Any host that runs Node and allows WebSockets works. Run **one instance**: tables live in that server's memory and are saved to `data/tables.json`.

### Render (free tier works)
1. Push this folder to a GitHub repository.
2. On render.com: **New → Web Service**, pick the repo.
3. Build command `npm install`, start command `npm start`. Render sets `PORT` for you.
4. Open the `https://….onrender.com` address it gives you and share it with friends.

Free instances sleep when idle and forget saved tables on restart; games in progress need the host's browser to be open anyway.

### Railway / Fly.io / any Docker host
A `Dockerfile` is included:

```bash
docker build -t playroom .
docker run -p 3000:3000 -v playroom-data:/app/data playroom
```

### Your own server (VPS)
Run `npm install && npm start` behind a reverse proxy (nginx, Caddy) with HTTPS. Make sure the proxy forwards WebSocket upgrades on `/ws`. With Caddy this is just:

```
yourdomain.com {
  reverse_proxy localhost:3000
}
```

## Settings

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | Port the server listens on |
| `DATA_FILE` | `data/tables.json` | Where online tables are saved |
| `KEEP_DAYS` | `7` | Tables untouched this long are deleted |

## How it's built

No build step and no framework: plain HTML, CSS and JavaScript.

```
server.js              static files + WebSocket server (/ws), health check at /healthz
public/index.html      the page
public/css/style.css   all styles
public/js/net.js       browser side of the WebSocket connection
public/js/app.js       hub, shared online/offline logic, Dealmaker screens
public/js/dealmaker-rules.js   Dealmaker rules engine
public/js/tambola.js   Tambola rules and screens
public/js/rummy.js     Rummy rules and screens (also draws the playing cards other games reuse)
public/js/andarbahar.js   Andar Bahar rules and screens
public/js/leastcount.js   Least Count rules and screens
public/js/uno.js       UNO, UNO Flip and UNO No Mercy rules and screens (one engine, three decks)
public/js/mafia.js     Mafia roles, night and day rules and screens
public/js/solitaire.js Klondike, FreeCell and Spider rules and screens
public/js/poker.js     Texas Hold’em rules, hand evaluator, side pots and screens
public/js/boot.js      loaded last; draws the hub once every game has registered
test/                  rules checks (npm test)
```

**How online play works:** the host's browser runs the game rules and saves the whole game state to the server as the table. Other players send their moves through the live room; the host's browser checks each move, applies it and saves the new state, which the server pushes to everyone. Only the browser that created a table can save over it. The server never needs to know the rules, so adding a game is a front-end change: write a module like `tambola.js`, register it in `ENG` and `GAMES`, and add its `<script>` to `index.html` before `boot.js`.

Hidden information (other players' hands) is sent to every browser at the table and hidden by the page, so this is meant for friends, not for strangers or money games.
