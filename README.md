# Playroom

Card and number games to play with friends: **Dealmaker** (Monopoly Deal rules), **Tambola / Housie**, **13-card Indian Rummy**, **Andar Bahar** (play-money chips), **Least Count**, **UNO**, **UNO Flip**, **UNO No Mercy**, **Mafia**, **Poker** (Texas Hold’em, play-money chips) and **Teen Patti**, plus **Solitaire** (Klondike, FreeCell, Spider) to play alone.

- **Online:** one person hosts a table and shares a 5-letter code. Friends open the site, enter the code and play from their own devices.
- **Offline:** pass one device around (Dealmaker, Rummy, Least Count, UNO, UNO Flip, UNO No Mercy, Mafia, Poker, Teen Patti), bet from one shared screen (Andar Bahar), or use one device as the Tambola caller while everyone else opens tickets on their phones.

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

runs the rules checks: hundreds of simulated Dealmaker, Rummy, Least Count, UNO, UNO Flip, Mafia, Poker, Teen Patti, Solitaire, Tic Tac Toe and Bingo games, thousands of Andar Bahar deals, Tambola ticket and claim checks, and the game request server.

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
| `ADMIN_KEY` | (none) | Password for reading game requests at `/admin/requests`. Without it that page stays off |
| `REQUESTS_FILE` | `data/requests.json` | Where game requests are saved |
| `GITHUB_TOKEN` | (none) | Optional: also open each game request as a GitHub issue |
| `GITHUB_REPO` | (none) | The repository for those issues, e.g. `your-name/playroom` |

## Bug reports

Every game has a 🐞 **Bug** button in its top bar, and the home screen has a **Report a bug** tile. Players describe what went wrong and, unless they untick it, a snapshot of their device and game goes along (game, stage, connection, recent errors on that device, and for Scribble where their copy of the drawing stands). Reports appear at the top of `/admin/requests` (same `ADMIN_KEY` password), `/admin/bugs.json` downloads them, and with `GITHUB_TOKEN` and `GITHUB_REPO` set each one also becomes a GitHub issue labelled **bug**. They're saved to `data/bugs.json` (`BUGS_FILE`).

## Updates while people are playing

The server sends a fingerprint of the site's files with every connection. After a deploy, browsers that reconnect see "Playroom was just updated" with a Reload button, which brings them straight back to the table they were at.

## Game requests

Players tap **Request a game** at the end of the games shelf on the home screen and send a game name, player count and how they play it.

**Read them:** set `ADMIN_KEY` to a long password of your choice (on Render: your service → **Environment** → add `ADMIN_KEY`). Then open `https://your-site/admin/requests`. The browser asks for a username and password: type anything as the username and your `ADMIN_KEY` as the password. The page lists the most wanted games first (requests for the same game are counted together), then every request with its details. `/admin/requests.json` downloads them all.

**Keep them on Render's free tier:** free instances wipe saved files on every restart and deploy, so requests saved only on the server don't last. To keep each one, also send them to GitHub Issues:

1. On GitHub: **Settings → Developer settings → Fine-grained tokens → Generate new token**. Give it access to only this repository, with **Issues: Read and write**.
2. On Render, add `GITHUB_TOKEN` (the token) and `GITHUB_REPO` (e.g. `your-name/playroom`).

Every request then also appears as an issue labelled **game request** in that repository, and GitHub emails you about each one.

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
public/js/teenpatti.js Teen Patti rules (blind/seen, show, sideshow, pot limit) and screens
public/js/boot.js      loaded last; draws the hub once every game has registered
test/                  rules checks (npm test)
```

**How online play works:** the host's browser runs the game rules and saves the whole game state to the server as the table. Other players send their moves through the live room; the host's browser checks each move, applies it and saves the new state, which the server pushes to everyone. Only the browser that created a table can save over it. The server never needs to know the rules, so adding a game is a front-end change: write a module like `tambola.js`, register it in `ENG` and `GAMES`, and add its `<script>` to `index.html` before `boot.js`.

Hidden information (other players' hands) is sent to every browser at the table and hidden by the page, so this is meant for friends, not for strangers.

**Points caps:** Least Count (out at), the UNO games (play to) and Rummy (pool: out at, 0 for points rummy) take any number the host types, in the lobby or on the pass & play panel. The choice is remembered on that device.

**Paid entry:** in any online lobby the host can turn on paid entry, set an entry fee, add who to pay and upload their payment QR. Players pay outside the app and tap "I've paid"; the host marks who really has, and only paid players get a seat when the game starts. The app never handles money; the host's QR is stored with the table (as `tables/CODE-qr`).

**Turn timer:** in the lobby of any turn-based online game the host can set seconds per turn (15 to 120). The pill at the top counts down for whoever we are waiting on; when it runs out, the host's device makes a safe move for that player (draw, check or fold, pack, end the turn, throw the highest card…).

**Voting a player out:** during an online game the host taps **Players** and calls a vote on someone. Everyone else votes Remove or Keep; a majority removes them (a tie keeps them, and the vote lapses after a minute). The game plays their turns safely until the round ends, then deals without them.

**Table chat:** every online table has a chat button on the right edge, in the lobby and during play, with quick reactions. Messages travel with each player's live connection, so chat keeps working while the host's phone is away; nothing is stored.

**Tic Tac Toe:** 2–8 players, online or on one device, two at the board at a time: winner stays on, the loser goes to the back of the queue, and after a draw both step down if anyone is waiting. The challenger is X and moves first; when the same two meet again, X swaps. Friends can join between rounds.

**Bingo:** the number grid game for 2–8 players. The host picks the grid: 5×5 (1–25, the classic), 6×6, 7×7 or 8×8 (1–64) for bigger groups. Fill your grid (tap squares in order, or shuffle), take turns calling numbers, and be first to five complete lines (B-I-N-G-O) on any size. Players who reach five on the same call share the round. Friends can join between rounds.

**Scribble:** draw and guess for 2–12 players, online (everyone on their own phone or computer). Each turn the artist picks an Easy, Medium or Hard word (500+ drawable words; medium scores 15% more, hard 30%) and draws it live with a brush, fill bucket, eraser, sixteen colours and a colour wheel for any other colour. Everyone else types guesses; the blanks show each word's letter count, and the guess box counts the letters you've typed. A right guess earns up to 500: half for the time left, half for how many got it before you. The artist is paid for the share of players who guessed (up to 150, plus 25 when everyone does, nothing when nobody does), so a quick guesser always scores more. Letters are revealed as the clock runs down, near misses are told privately, and everyone draws once a round. The host sets the rounds and seconds to draw. The drawing streams through the artist's live connection (each update repeats the last few strokes), and the artist's own device saves the whole picture to the server every couple of seconds (`tables/CODE-ink-PLAYER`). Anyone who misses an update, joins late or reloads fetches that copy and carries on; a screen that gets no live strokes for 5 seconds keeps fetching it; and the artist can reload mid-turn without losing the picture.
