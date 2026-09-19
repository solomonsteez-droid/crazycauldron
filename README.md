# CrazyCauldron

Skeleton for an isometric pixel-art browser game with a Solana token gate: hold
at least `MIN_HOLD` $COOK, sign in with your wallet, and walk around a shared
hub with up to `HUB_MAX_PLAYERS` others.

This is a **skeleton** — the plumbing is real and complete, the game is not.
There is one placeholder map, one placeholder avatar, no gameplay beyond
walking, and all art is generated at runtime.

## Layout

```
shared/    types, constants, the hub grid, pathfinding, the SIWS message format
server/    Express + Colyseus: auth, token gate, matchmaking, rooms, SQLite
client/    Vite + Phaser: wallet sign-in, the hub scene, the overflow queue
scripts/   loadtest.ts
```

`shared` exists so the two sides cannot disagree. The walkability grid, the
tile geometry and the exact bytes of the sign-in message all live there.

## Running it

```bash
cp .env.example .env     # then edit JWT_SECRET at minimum
npm install
npm run dev              # server on :2567, client on :5173
```

`.env.example` ships with `TEST_BYPASS_HOLD=true`, which skips the $COOK
balance check so you can sign in with any wallet. The server **refuses to
start** with that flag set while `NODE_ENV=production`.

To exercise the real gate, set `TEST_BYPASS_HOLD=false` and point `COOK_MINT`
at a mint your wallet actually holds. `COOK_MINT` in `.env.example` is a
placeholder (wrapped SOL) — replace it at launch.

Other useful scripts: `npm run typecheck`, `npm run build`, `npm start`.

## How a player gets in

```
GET  /auth/nonce?address=…   -> single-use nonce + the exact message to sign
POST /auth/verify            -> signature checked, $COOK checked, 1h JWT issued
POST /play/enter             -> a Colyseus seat reservation for hub or waiting
     consumeSeatReservation  -> the client redeems it; it never calls joinOrCreate
```

The server decides which room you belong in, so capacity rules live in one
place. Past `GLOBAL_MAX_PLAYERS` a joiner is parked in the `waiting` room,
which pushes a ready-made hub reservation over the socket when a seat frees up
— the client never polls.

## The parts worth knowing about

**Movement is server-authoritative in the strict sense.** A client sends a
*destination tile* and nothing else. The server pathfinds with BFS, rejects
anything unwalkable, unreachable or longer than `MAX_PATH_TILES`, then walks
the player one tile per `MOVE_STEP_MS`. No position ever travels from client to
server, so there is nothing to falsify. The cost is one round trip of input
latency, which is why the client tweens each step over exactly `MOVE_STEP_MS`.

**Sign-in resists replay and message substitution.** The nonce is single-use and
is consumed *before* the signature is checked, so a replayed message fails the
second time however good its signature. `/auth/verify` also re-renders the
message from the server's own `SIWS_DOMAIN`/`SIWS_URI` and demands a
byte-for-byte match — without that, a wallet could be talked into signing
arbitrary text that happens to carry a live nonce.

**The token gate is re-checked, not trusted once.** A reservation can be
redeemed minutes after sign-in and a JWT lives an hour, so every room re-runs
the gate in `onAuth`, and the hub keeps re-checking while players are seated. A
balance that drops below `MIN_HOLD` gets a `MSG_KICK` with a reason the UI can
explain. An RPC failure leaves players seated rather than evicting them on an
infrastructure blip — but it is never a free pass at the door, where a wallet
with no cached balance is refused.

**No secret is reachable from the browser.** Vite only inlines `VITE_`-prefixed
vars, and `RPC_URL`, `COOK_MINT` and `JWT_SECRET` deliberately lack the prefix.
Balances are gate input, not game state, and are never replicated.

**Storage is behind one interface.** `PlayerRepository` is the only way the
server reaches the database; swapping SQLite for Postgres means adding one
implementation and changing `db/index.ts`.

## Load testing

```bash
npm run loadtest -- --clients 50 --duration 60
```

Each virtual client generates a real Solana keypair and signs the server's real
message, so the whole path is measured rather than a shortcut past auth. It
needs `TEST_BYPASS_HOLD=true` (generated wallets hold no $COOK) and a raised
`AUTH_RATE_LIMIT`, since every client signs in from one IP:

```bash
AUTH_RATE_LIMIT=1000 npm run dev
```

## What is deliberately left open

- **Art.** Every texture is drawn at runtime in `client/src/map/textures.ts`.
  Replacing those texture keys with a real sprite sheet is the whole job.
- **The map.** One 24×24 grid with a cauldron in the middle, defined in
  `shared/src/map.ts`. Everyone spawns on the same tile.
- **Gameplay.** Players can walk and see each other. That is all.
- **Horizontal scale.** Nonces, rate-limit buckets and the balance cache are
  in-process, and capacity is counted per node. A second node needs Redis
  (`@colyseus/redis-driver` plus shared stores for those three).
- **Reconnection.** A dropped socket returns to sign-in; there is no
  `allowReconnection` grace window.
- **Tests.** None. `shared/src/path.ts` and `siwsVerify.ts` are the two places
  where unit tests would pay for themselves immediately.
