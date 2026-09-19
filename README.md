# CrazyCauldron

An isometric pixel-art browser game with a Solana token gate: hold at least
`MIN_HOLD` $COOK, sign in with your wallet, and cook in a shared hub with up to
`HUB_MAX_PLAYERS` others.

Gather ingredients across three maps, cook them on a timing mini-game, sell the
dishes, and level five skills plus a Chef track. All art is still generated at
runtime — there are no image assets to license or load.

## Layout

```
shared/    content JSON, progression maths, the map grids, pathfinding, SIWS
server/    Express + Colyseus: auth, token gate, matchmaking, rooms, SQLite
client/    Vite + Phaser: sign-in, the world scene, the panels
scripts/   loadtest, smoke-game, validate-content, simulate-progression
```

`shared` exists so the two sides cannot disagree. The walkability grids, the
tile geometry, every XP curve and unlock, and the exact bytes of the sign-in
message all live there.

## Content

Everything tunable is JSON under `shared/src/content/`, loaded by both runtimes
— Vite inlines it, Node parses it through an import attribute.

```
ingredients.json   24 ingredients, 8 per section
recipes.json       20 recipes: ingredients, technique, requirements, XP, price
sections.json      the three maps, their gates, and 12 gather nodes each
skills.json        both XP curves, every unlock, and the tuning constants
```

Change a number there and the server, the client and the simulation all agree
about it without a code change. `npx tsx scripts/validate-content.ts` checks the
files hang together: unknown ingredients, nodes inside rocks or unreachable from
spawn, techniques nothing unlocks, the rare-node cap, recipes needing more
ingredient slots than Knifework 20 grants, and that a brand new player can
actually cook something and level every skill.

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

Other useful scripts:

```bash
npm run typecheck
npx tsx scripts/validate-content.ts        # content sanity
npx tsx scripts/smoke-game.ts              # end-to-end, needs a running server
npx tsx scripts/simulate-progression.ts    # hours-to-level report
npx tsx scripts/simulate-progression.ts --tune
```

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

## The cooking loop

```
walk to a gate -> gather nodes -> back to the kitchen -> heat bar -> tavern
```

**Gathering** is validated, timed and paid out by the server. Nodes are
per-player, so thirty people can work the same sunwheat without contending for
it, and each keeps their own cooldown — persisted, so relogging cannot reset it.
Yield, double-drop rolls and XP are all rolled server-side.

**The heat bar** is generated server-side: marker speed, start offset, direction
and window position. The client draws that and replies with how long after the
bar arrived it clicked; the server recomputes the marker from the same triangle
wave and decides the quality. It never receives a result, only a time — and a
time that disagrees with its own measurement by more than
`MAX_CLICK_LATENCY_MS` is thrown away.

**Quality** stacks in one order: where the marker stopped, capped by knifework
prep, pulled down by an unsafe spice, then lifted by spicecraft. At Knifework 1
the cap is Common, so a perfect stop still plates a Common dish — that cap is
the reason to level the skill.

**Anti-abuse**: one action in flight per session, and a new action refused if it
arrives sooner than the previous animation minus `ACTION_GRACE_MS`. Every
refusal is logged with wallet and reason. A cancelled action, which pays out
nothing, recharges only the time actually spent.

## Progression

Five skills (1–20) and a separate Chef track (1–30). Every skill XP award adds
the same amount of Chef XP, so the Chef level is the sum of everything a player
has done. `scripts/simulate-progression.ts` models the loop using the same
shared code the server runs, and reports hours-to-level:

```
  level   hours   target   delta
     10    2.83      2.5   +13.3%
     20    8.67       10   -13.3%
     30   27.70       25   +10.8%
```

Two content rules exist because the simulation found the game unplayable
without them, both documented where they are implemented:

- A recipe stating **no requirements** is a starter recipe and teaches its own
  technique. Otherwise nothing at all is cookable on a new account: `bake` needs
  Firecraft 3, and Firecraft XP comes only from cooking.
- Every cook pays a **quarter share** to knifework and spicecraft even when the
  recipe does not require them. Otherwise neither skill can ever leave level 1,
  because every recipe granting their XP also requires level 2+ of it.

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
