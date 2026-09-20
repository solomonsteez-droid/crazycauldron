# CrazyCauldron

An isometric pixel-art browser game with a Solana token gate: hold at least
`MIN_HOLD` $COOK, sign in with your wallet, and cook in a shared hub with up to
`HUB_MAX_PLAYERS` others.

Gather ingredients across three maps, cook them on a timing mini-game, sell the
dishes, and level five skills plus a Chef track.

One process serves all of it: Express for sign-in, matchmaking and the public
pages, Colyseus on the same server for the rooms, and the built client as
static files at `/`. One deploy, one origin, no second host to keep in step.

## Layout

```
art/       every drawing the sprite pipeline reads. Nothing here is served
shared/    content JSON, progression maths, the map grids, pathfinding, SIWS
server/    Express + Colyseus: auth, token gate, matchmaking, rooms, storage
client/    Vite + Phaser: sign-in, the world scene, the panels, the pages
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
sections.json      what each gathering area *is*: its name, its price of entry,
                   and the 12 things that grow there
skills.json        both XP curves, every unlock, and the tuning constants
wardrobe.json      hats and what earns each one; cloaks, kept and dormant
ambience.json      villagers, particles, day length, and every sound cue
maps/*.json        the four painted areas: a walkable mask, the spawn, the
                   gates and counters, and where each node stands
```

The four maps are hand-painted images in `client/public/assets/maps/`. Each is
drawn at a fixed world size with an invisible 24px square grid over it, and
`npm run areas` turns the painting into that grid: the open regions and the big
structures are authored in `scripts/area-layout.json`, everything smaller comes
out of the pixels, and `/dev/mapedit` is where a person corrects what a
classifier cannot tell apart.

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
npm run sprites                            # art drops -> game-ready sprites
npm run areas                              # paintings -> walkable grids
npm run areas -- --preview                 # ...and a picture of what it decided

# No server needed
npx tsx scripts/validate-content.ts        # content, and every map's layout
npx tsx scripts/simulate-progression.ts    # hours-to-level report
npx tsx scripts/simulate-progression.ts --tune
npx tsx scripts/test-cooking.ts            # heat bar outcome rates
npx tsx scripts/test-camera.ts             # zoom and clamping maths
npx tsx scripts/test-ambience.ts           # scenery, day-night and villagers
npx tsx scripts/test-motion.ts             # world motion: where it lands, what it costs
npx tsx scripts/test-mobile.ts             # the 390px audit, as rules

# Against a running server
npx tsx scripts/smoke-game.ts              # the whole loop, end to end
npx tsx scripts/test-auth-abuse.ts         # replay, forgery, expiry
npx tsx scripts/test-action-abuse.ts       # a client that cheats
AUTH_RATE_LIMIT=20 npx tsx scripts/test-rate-limits.ts

# These start and stop their own server
npx tsx scripts/test-persistence.ts        # SIGKILL mid-session, then restart
npx tsx scripts/test-production.ts         # what NODE_ENV=production changes
npx tsx scripts/test-postgres.ts           # the Postgres backend, on a real one
npx tsx scripts/test-migration.ts          # an old database gains new columns
npx tsx scripts/test-prebuilt.ts           # the committed client, and its guard
npx tsx scripts/test-shop.ts               # the $COOK shop, against devnet
npx tsx scripts/test-pages.ts              # /official, /rules, /roadmap
npx tsx scripts/test-maintenance.ts        # the rollback switch
npx tsx scripts/test-config-docs.ts        # every setting is written down

# Operations
npx tsx scripts/backup.ts                  # take one now; --list shows the rest
npx tsx scripts/restore.ts --latest        # stop the server first
npm run loadtest -- --clients 600 --duration 600
```

Deployment, configuration and the capacity numbers are in [DEPLOY.md](DEPLOY.md).

## How a player gets in

```
GET  /auth/nonce?address=…   -> single-use nonce + the exact message to sign
POST /auth/verify            -> signature checked, $COOK checked, 1h JWT issued
POST /play/enter             -> a Colyseus seat reservation for hub or waiting
     consumeSeatReservation  -> the client redeems it; it never calls joinOrCreate
```

And three that are not the game: `/official` publishes the real $COOK contract
address, `/rules` says in plain language what the token is and is not, and
`/roadmap` renders `client/public/roadmap.md`. They are the same bundle, so a
request for one gets `index.html`, the client notices the path, and the game
never boots.

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
*destination tile* and nothing else. The server pathfinds over the grid,
rejects anything unwalkable, unreachable or longer than `MAX_PATH_TILES`, then
walks the player one cell per `MOVE_STEP_MS`. No position ever travels from
client to server, so there is nothing to falsify.

**The animation is predicted; the position is not.** The cost of the above is a
round trip before the first step, and a character who stands still through it
looks broken. So the client runs the same pathfinder over the same grid on the
click, and starts the stride from its own answer - while the tween still only
ever moves between cells the server has confirmed. A mispredicted route costs a
wrong-footed stride for a frame; a mispredicted *position* would cost a player
walking through a wall, which is why only one of the two is guessed at.

**A slot can be switched off without being deleted.** Cloaks are not worn at
launch: nothing renders one, no panel offers one, and the room state has no
field for one. The art, the pipeline that cuts it and every unlock condition
are all still here, moved to a `dormant` list in `wardrobe.json` - and a player
who earned the Midnight cloak still has it in their record, because migration
reads both lists while everything that grants or equips reads only the live
one. Turning the slot back on is moving entries between two arrays.

**A companion is drawn from nothing but the player it follows.** Room state
carries a `companionId` and no position: the creature's place comes from where
its player is and which way they face, so nothing about it goes on the wire and
every client draws it identically. It trails a cell behind and to the left,
chases rather than sticks, faces the way it is travelling, bobs, hops every ten
seconds or so, and stands aside by the kitchen while its player cooks. It is
never interactive, so it cannot eat a click meant for the ground under it. Some
villagers bring one too, rolled once when the server spawns them.

**Which frames a walk cycle plays is measured, not assumed.** `npm run sprites`
compares the four drawings of each direction two ways - how much of the outline
moved, and how much the pixels changed - and where two of them are the same
pose twice it writes a ping-pong order (0-1-2-3-2-1) into the manifest instead
of a loop, so a weak sheet reads as a turning point rather than a stumble. The
report names the pairs, so the sheet can be redrawn rather than worked around
forever. In development the **D** key puts the animation key, the frame and the
movement vector over every character, which is what makes a walk fault
reportable from a screenshot.

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

**Storage is behind two interfaces, and there are two of everything behind
them.** `PlayerRepository` and `GameRepository` are the only way the server
reaches the database. `DATABASE_URL` decides which implementation answers:
Postgres where the filesystem is not ours - Colyseus Cloud makes no promise
that a container's disk survives a deploy - and a SQLite file on a developer's
machine, which needs no server and no credentials. Both are exercised by the
suite; `scripts/test-postgres.ts` brings its own Postgres, compiled to
WebAssembly, so nobody has to install one to run the tests.

**The world is checked before it is served.** Every building, gate, prop and
gather node is authored by hand in JSON, and the ways that goes wrong are
quiet: a shrub on a doorstep, two nodes on one tile, a well in a path. None of
them throw. `shared/src/layout.ts` states the rules once - no overlaps, nothing
on a path, nothing crowding a doorway, a clear ring around each building - and
the server refuses to start if any map breaks them, naming every offender.

**Production refuses to start rather than starting badly.** Eight settings that
are right on a laptop and wrong on the internet - the token gate bypass, a
short or example signing key, missing or localhost or wildcard CORS origins, a
localhost signing domain, a devnet RPC, an unset mint, and a shop switched on
with nowhere to send the treasury half - each stop the boot with the reason. `scripts/test-production.ts` proves every one of them by starting a
real server and watching it refuse.

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

- **Art that has not landed yet.** `npm run sprites` turns whatever is in
  `art/sprites/` into game-ready output, and anything still
  missing is drawn as a lettered placeholder at boot — so no lookup in the game
  ever has to ask whether the art exists.
- **Spawning.** Everyone still lands on the same hub tile.
- **Horizontal scale, the last third of it.** Rooms across processes are
  handled - `server/src/cloud.ts` wires the Redis driver and presence on
  Colyseus Cloud - and the database is shared. Still per-process: sign-in
  nonces, rate-limit buckets and the cached $COOK balances. None is wrong,
  each is weaker than it looks: a nonce issued by one process cannot be
  redeemed at another, the effective rate limit is the configured one times
  the number of processes, and the RPC bill scales with cores.
- **Reconnection.** A dropped socket returns to sign-in; there is no
  `allowReconnection` grace window.
- **Tests.** No unit-test runner, and no assertion library. What exists are the
  scripts above - close to 300 checks across content, maths, layout, the mobile
  rules, the whole game loop end to end, two suites that attack the server, and
  two that start and kill their own. They are integration tests by preference:
  the interesting failures in this codebase have all been between parts, not
  inside them. `siwsVerify.ts` is still the one place a unit test would pay for
  itself immediately.
