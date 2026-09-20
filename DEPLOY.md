# Deploying CrazyCauldron

One Node process serves everything: Express for sign-in, matchmaking and the
public pages, Colyseus on the same server for the rooms, and the built client
as static files at `/`. One deploy covers both halves, and the client asks
whatever origin served it for its API and its socket — so there is no second
host to configure and no way for the two to drift to different versions.

Two ways to run it, and the difference is mostly where the database lives:

- **[Colyseus Cloud](#colyseus-cloud)** — `npx @colyseus/cloud deploy`, one
  process per core, Postgres. This is what the repo is set up for.
- **[Your own box](#your-own-box)** — one process, SQLite on local disk, pm2 or
  systemd in front. Simpler, and it is what the capacity numbers below were
  measured on.

---

## What you need

- Node 20 or newer (24 is what it is developed against)
- A Solana RPC endpoint that will answer token-account queries
- A Postgres database, unless the filesystem is genuinely yours
- TLS in front of the process — it speaks plain HTTP and WebSocket

## Configuration

Everything comes from environment variables. Locally they are read from `.env`
at the repo root; on Colyseus Cloud they go in the dashboard. Copy
`.env.example` and work through it.

**The server refuses to start with `NODE_ENV=production` if any of these are
wrong.** That is deliberate: each one is right on a laptop and wrong on the
internet, and each fails quietly rather than loudly.

| Variable | Production must be | Why |
|---|---|---|
| `TEST_BYPASS_HOLD` | unset or `false` | `true` disables the token gate entirely |
| `JWT_SECRET` | 32+ random characters, not the example | anyone with it can mint sessions |
| `CORS_ORIGIN` | your real origins, comma separated | no `localhost`, no `*`; see below |
| `SHOW_MINT` | `true`, once the mint is real | the site says "revealed at launch" while false |
| `SIWS_DOMAIN` | the domain wallets should display | wallets sign for whatever this says |
| `RPC_URL` | a mainnet endpoint | devnet balances are not real balances |
| `COOK_MINT` | the real mint | the gate has nothing to check, and `/official` publishes it |
| `TREASURY_WALLET` | set, if `SHOP_ENABLED=true` | a shop with nowhere to send the treasury half would burn everything |

The rest:

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `2567` | HTTP and WebSocket share it. Ignored on Cloud |
| `DATABASE_URL` | unset | set it and the server is on Postgres; unset and it is on SQLite |
| `DATABASE_PATH` | `./data/crazycauldron.db` | the SQLite file, when `DATABASE_URL` is unset |
| `MIN_HOLD` | `2000` | $COOK required to enter |
| `HUB_MAX_PLAYERS` | `30` | players per room before a new one opens |
| `GLOBAL_MAX_PLAYERS` | `300` | beyond this, joiners go to the waiting room |
| `AUTH_RATE_LIMIT` | `10` | per IP, per window. Raise only for load tests |
| `AUTH_RATE_WINDOW_MS` | `60000` | the window those requests are counted in |
| `PUBLIC_DOMAIN` | `crazycauldron.art` | what `/official` names as the only real site |
| `SOCIAL_X` | `none` | `none` renders "no account yet", which is the point |
| `SOCIAL_TELEGRAM` | `none` | same |
| `SHOP_ENABLED` | `false` | every `/shop` route answers 404 while it is false |
| `TREASURY_WALLET` | unset | where the half that is not burned goes |
| `MAINTENANCE` | `false` | closes entry at boot; only a seed, see below |
| `ADMIN_TOKEN` | unset | bearer token for `/admin/maintenance`; unset means 404 |
| `BACKUP_CRON` | `0 4 * * *` | nightly backup, server local time |
| `BACKUP_DIR` | `./backups` | where timestamped copies land |
| `BACKUP_DEST` | unset | a second directory each backup is copied to |
| `LOG_DIR` | `./logs` | rotating `server.log` |
| `LOG_MAX_BYTES` | `5242880` | roll over at 5 MB |
| `LOG_GENERATIONS` | `5` | how many old logs to keep |
| `ALERT_WEBHOOK_URL` | unset | POSTed to on failures; see below |
| `ALERT_COOLDOWN_MS` | `300000` | one alert per kind per this long |
| `HEALTH_CHECK_MS` | `60000` | how often the server probes itself |

`VITE_SERVER_HTTP_URL` and `VITE_SERVER_WS_URL` are **dev-server settings
only**. A production build ignores them: `vite.config.ts` pins both to empty
for `build`, and `client/src/net/env.ts` takes `window.location.origin`
unconditionally when `PROD`. So the deployed client always asks whatever origin
served the page — for `/auth`, for `/play`, and for the WebSocket, which is
`https://…` rewritten to `wss://…`.

That is belt *and* braces on purpose, and it is the fix for an outage. The
client build moved onto a developer's machine when `client/dist` started being
committed, `envDir` is the repo root, and the repo-root `.env` says
`VITE_SERVER_HTTP_URL=http://localhost:2567` — right for a laptop, and shipped
to the world. The deployed client asked `localhost:2567` for `/auth/nonce` and
nobody could sign in. While the host still did the building there was no `.env`
there, which is why it had never happened before.

`scripts/test-prebuilt.ts` greps the committed bundle for `localhost:2567` so
it cannot come back quietly. A split deployment — client and server on
different hosts — is a code change in `net/env.ts`, deliberately, because a
switch that can point production at a laptop is worth more than the rarity of
wanting one.

## Colyseus Cloud

The repo is already shaped the way Cloud expects: the server entry is built
with `defineServer()` from `colyseus`, `ecosystem.config.js` at the root names
the built entry, and the root `build` script builds all three workspaces.

### 1. The database, first

Cloud makes no promise that a container's filesystem survives a deploy, and a
SQLite database is one file on that filesystem. **Provision Postgres before
the first deploy**, not after — the failure mode is not a crash, it is every
player quietly starting again, noticed some time after the deploy that caused
it. Any managed Postgres will do. Put its connection string in `DATABASE_URL`.

### 2. Deploy

```bash
npx @colyseus/cloud deploy
```

It opens a browser to pick the application, then builds from your current git
remote and branch. The first run writes `.colyseus-cloud.json` — that file
holds deployment credentials, so treat it accordingly. Useful flags:
`--branch` and `--remote` to force one, `--preview` to look before it lands.

Cloud runs the root `build` script, which is:

```
npm run build -w shared && npm run build -w server && node scripts/build-client.mjs --verify
```

and then starts `ecosystem.config.js`, which runs `server/dist/index.js` in
pm2 **fork** mode, one process per core. Not cluster mode: Colyseus assigns
each process its own port and its own rooms, and a shared listening socket
would hand a websocket to whichever process answered first, which is usually
not the one holding the room that reserved the seat.

### The client is committed, not built here

**`client/dist` is in git, and the host checks it rather than building it.**
That is unusual and it is deliberate.

Bundling the client needs about 1 GB and this host has 1 GB in total. A deploy
has already been killed for it - "JavaScript heap out of memory", 108 modules
in. Measured on a 16-core Windows box with the same scripts:

| Build | Peak, largest process | Peak, whole tree |
|---|---|---|
| Client, as it was (source maps on) | 1897 MB | 2130 MB |
| Client, after the fixes below | 779 MB | 1045 MB |
| **shared + server only** | **324 MB** | **564 MB** |

The middle row would *probably* fit. "Probably", on a box that has already
died once, is not a good enough reason to spend another failed deploy finding
out - so the host builds the bottom row and uses a client that was built here.

What made the difference, in order of how much each bought:

- **No source map in production.** It was 11.6 MB against a 1.8 MB bundle, and
  rollup holds the whole mapping in memory while it renders. This one line is
  1897 MB → 782 MB on its own. `npm run build -w client -- --sourcemap` still
  makes one when something needs debugging against the built bundle.
- **Source art moved out of `client/public`.** Everything under that directory
  is copied verbatim into the build, and 306 MB of 2048px drawings were living
  there - so every build copied them and every deploy shipped them. They are
  inputs to `npm run sprites`, not files any browser asks for, and they now
  live in `art/` at the repo root. `client/dist` went from **342 MB to 27 MB**.
- **`assetsInlineLimit: 0`.** Nothing imports an image today; this is a guard
  against the first one that does, because an inlined asset is base64 in the
  bundle rather than a cached file.
- **`NODE_OPTIONS=--max-old-space-size=768` on the client build script only.**
  Below the host's 1 GB, and explicit: left to itself V8 sizes the heap from
  the machine's memory, which in a container is frequently not the container's.

**When you change client or shared code, rebuild and commit the bundle:**

```bash
npm run build:client
git add client/dist && git commit -m "client: rebuild"
```

There are two bundles now, and `build:client` makes both: `index.html` is the
marketing site and `play.html` is the game. They are separate inputs so that
the front page does not carry Phaser — the game bundle is about 1.8 MB and the
site's is about 90 kB, and somebody deciding in four seconds whether to try
this should not download a renderer to read a paragraph. The server sends
`play.html` for `/play` and `index.html` for everything else that looks like a
page.

**When you change a painting or the brand art**, also run:

```bash
npm run site:art
git add client/public/assets/site client/public/favicon.png && git commit -m "art: site sizes"
```

That makes the web-sized copies the site loads. The paintings the game uses are
4.5 to 6.7 MB each and the whole page has a 3 MB budget, so each one becomes a
wide and a narrow JPEG — about 1 MB for all eight, and a phone downloads a
fifth of that. It also cuts the Open Graph card and the icons from
`art/brand/cook_token.png`. Like `client/dist`, the output is committed, so the
1 GB host never runs an image pipeline.

`npm run build:client` bundles and writes `client/dist/.build-stamp`; the root
`npm run build` only *checks* that stamp, and fails if it does not match. That
split is deliberate and it is the fix for a real failed deploy:

> The check used to switch on `NODE_ENV === "production"`. That variable is
> set in `ecosystem.config.js`, which pm2 applies to the server process it
> starts - long after the build has finished. During the build it was unset,
> the guard never ran, the fallback was to build, and the deploy of 789ac74
> died bundling the client on a 1 GB host. The stamp was never wrong.

So the mode is not inferred any more. The host runs `build`, which passes
`--verify` and has **no path that bundles anything**. Environment variables are
still read, but only to refuse: `COLYSEUS_CLOUD`, `NODE_ENV=production` or
`CI=true` turn building off even if `--build` was asked for.

The stamp hashes `client/src`, `client/public`, `shared/src`,
`client/index.html`, the client and shared `package.json`, the client's
tsconfig and vite config, and `tsconfig.base.json`.

`client/public` is in there because vite copies it into dist verbatim, so the
art is part of what ships: a re-nudged hat offset or a repainted map changes
the deployment without touching a line of code, and that is the most common
kind of change this game has. Images are hashed as raw bytes — **only** under
`client/public`, where everything is served. Elsewhere a binary is a leftover
rather than a source file, and hashing it would make the number depend on
which machine happens to have a stray screenshot.

Three things keep it identical on Windows and Linux: line endings are
normalised in text files, a byte-order mark is stripped, and only known
extensions are hashed, with dotfiles and `node_modules` skipped — so a stray
`.orig` from a merge cannot move it on one machine and not the other.
`package-lock.json` is deliberately **not** hashed: it is committed, but an
install on the host may rewrite it, and that would be a mismatch caused by the
installer rather than by anything that changes the bundle.

If two machines ever disagree, run this on each and diff the output rather
than guessing:

```bash
node scripts/build-client.mjs --explain
```

**To go back to building on the host** - if it is moved to a larger box - put
`client/dist` back in `.gitignore`, `git rm -r --cached client/dist`, and
change the root `build` script's last step to `npm run build -w client`.
`scripts/measure-build.ts` is how to check it fits first:

```bash
npx tsx scripts/measure-build.ts --cap 768
```

### 3. Environment variables

In the dashboard, under the application's environment settings. Everything
from the tables above that is not a default, which at minimum is:

```
NODE_ENV=production
DATABASE_URL=postgres://...
JWT_SECRET=<32+ random characters>
CORS_ORIGIN=https://crazycauldron.art
SIWS_DOMAIN=crazycauldron.art
SIWS_URI=https://crazycauldron.art
RPC_URL=<a mainnet endpoint>
COOK_MINT=<the real mint>
MIN_HOLD=2000
TREASURY_WALLET=CTjcrsrKUTbEbm91XbL1BToD3cUEJcjxNvyeuW2nd8LU
SHOP_ENABLED=false
ADMIN_TOKEN=<a long random string>
PUBLIC_DOMAIN=crazycauldron.art
SOCIAL_X=none
SOCIAL_TELEGRAM=none
BACKUP_DEST=<somewhere off the container>
ALERT_WEBHOOK_URL=<where failures should page you>
```

Leave `PORT`, `TEST_BYPASS_HOLD` and both `VITE_SERVER_*` unset. Redeploy after
changing any of them — they are read once at startup.

**`CORS_ORIGIN` does not have to list the deployment's own address.** The
server hosts the client, so a request from its own page is allowed whatever the
allowlist says, and the check reads `X-Forwarded-Host` before `Host` — behind
Cloud's edge proxy, `Host` is an internal name and comparing against it would
have the deployment call its own front end foreign. That is what makes the
generated `https://<region>-<id>.colyseus.cloud` URL work before you have a
custom domain. Matching for everything else is exact on scheme, host and port,
forgiving only a trailing slash and letter case.

Cloud sets `COLYSEUS_CLOUD`, `REDIS_URI`, `SUBDOMAIN`, `SERVER_NAME` and
`NODE_APP_INSTANCE` itself. `server/src/cloud.ts` reads those and wires the
Redis driver and presence, which is what lets processes see each other's
rooms; without it, `/health`'s player count, the decision to queue somebody
and a reservation redeemed on a different process would each be wrong.

It also decides `publicAddress` — the address the client is told to open its
WebSocket on once a seat is reserved, which is the step immediately after
sign-in. It is set **only when `SUBDOMAIN` and `SERVER_NAME` are both actually
present**: a template literal does not fail on a missing variable, it writes
the word `undefined`, so the unconditional version produced
`undefined.undefined/2567` anywhere Cloud had not exported them, and every
player reached "Could not reach the cauldron" one step past signing in. Unset,
Colyseus advertises the host the request arrived on — behind the proxy, the
address in the browser's bar — and the startup log carries a warning saying
so.

### 4. Point the domain at it

In the dashboard, add `crazycauldron.art` as a custom domain for the
application and create the DNS record it gives you (a CNAME to the deployment,
at your registrar). Cloud issues the certificate once the record resolves.
Then set `CORS_ORIGIN`, `SIWS_DOMAIN`, `SIWS_URI` and `PUBLIC_DOMAIN` to that
domain and redeploy — wallets sign for whatever `SIWS_DOMAIN` says, so a stale
value asks players to sign for the wrong site.

### 5. Verify, in this order

`DOMAIN` is whatever address a player will type — the generated
`https://<region>-<id>.colyseus.cloud` one before the custom domain exists,
and the custom domain after.

```bash
DOMAIN=https://crazycauldron.art

curl -s $DOMAIN/health | jq '{ok, rooms, database}'
```

- `database.backend` says **`postgres`**. If it says `sqlite`, `DATABASE_URL`
  did not reach the process, and progress is being written somewhere that will
  not survive the next deploy. Stop and fix that before anyone plays.
- `ok` is `true` and `rooms` is present.

```bash
curl -s $DOMAIN/public/config | jq
```

- `cookMint` is the real mint, and `domain` is the real domain.
- Nothing else is in there. It is a public endpoint.

```bash
# The client must ask this origin, not a laptop. Both should print nothing.
curl -s $DOMAIN/ | grep -o 'assets/index-[^"]*\.js'
curl -s $DOMAIN/assets/index-*.js | grep -c 'localhost:2567'
```

That second number being anything but `0` is the failure that looks like the
server being down: `/health` answers, the login page renders, and then sign-in
reports "Could not reach the cauldron" because the bundle is calling
`localhost`. Rebuild with `npm run build:client`, commit `client/dist` and
redeploy. `npx tsx scripts/test-prebuilt.ts` checks the same thing locally,
before it can ship.

Then, in a browser:

- `/` loads the game and the login panel offers a wallet.
- With the network tab open, `/play/capacity` and `/auth/nonce` go to this
  origin, and the WebSocket upgrade is `wss://<this origin>/…` returning
  `101 Switching Protocols`. Anything pointing elsewhere is the bundle above,
  or `SUBDOMAIN`/`SERVER_NAME` leaking into `publicAddress`.
- `/official`, `/rules` and `/roadmap` all render, and the address on
  `/official` matches `cookMint` above.
- Sign in with a wallet that holds enough $COOK, and walk around. Then sign in
  with one that does not, and confirm it is turned away.
- Open a second browser and confirm the two see each other.

```bash
curl -s -X POST $DOMAIN/admin/maintenance \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' -d '{"on":true}'
```

- Entry now refuses with a friendly message and `/health` still answers.
- Flip it back with `{"on":false}` and check somebody can get in again.

Finally, take a backup by hand and **restore it somewhere**, before you need
to. An untested backup is a belief.

## Your own box

```bash
npm ci
npm run sprites          # only if the art drops in art/ have changed
npm run build            # shared -> server -> client
NODE_ENV=production npm start
```

`npm run build` emits the server to `server/dist` and the client to
`client/dist`; the server serves the latter at `/`. SQLite on local disk is a
reasonable choice here, because the disk is yours — put `DATABASE_PATH` on one
you back up.

### With pm2

```bash
pm2 start ecosystem.config.js
```

The same file Cloud uses. It runs one process per core in fork mode and waits
for each to say it is ready before routing to it, which is the difference
between a rolling restart and a minute of refused connections.

More than one process needs Postgres and Redis — see
[Scaling out](#scaling-out).

### As a service

```ini
[Unit]
Description=CrazyCauldron
After=network.target

[Service]
Type=simple
WorkingDirectory=/srv/crazycauldron
EnvironmentFile=/srv/crazycauldron/.env
ExecStart=/usr/bin/node server/dist/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

`Restart=always` is doing real work. Saves are transactional and written as
they happen, so a hard restart loses nothing that was already paid out —
`npx tsx scripts/test-persistence.ts` is the proof, and it kills the process
with SIGKILL rather than asking it to stop.

### Behind a proxy

The WebSocket upgrade has to pass through. With nginx:

```nginx
location / {
  proxy_pass http://127.0.0.1:2567;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_read_timeout 300s;
}
```

`proxy_read_timeout` matters: a player standing still sends nothing, and a
60-second default will close their socket.

Rate limiting is per IP, so the app must see the real client address. Set
`app.set("trust proxy", 1)` if you terminate TLS somewhere that rewrites it —
without that, every request looks like it comes from the proxy and one noisy
client throttles everybody.

## The rollback switch

Something is wrong and you want players out of the way while you look at it.

```bash
curl -s -X POST $DOMAIN/admin/maintenance \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' -d '{"on":true}'
```

- Entry closes — `/play/enter` and the room's own join check both refuse, so a
  reservation handed out a moment before the switch does not slip through.
- `/health` keeps answering, because whatever is watching the deployment must
  not be told the process died when it is deliberately quiet.
- Anyone already in a room stays there. Emptying the hub is a harsher decision
  and is available by restarting once nobody new can get in.
- It takes effect on every process within about two seconds, because the flag
  is in the database rather than in one process's memory.
- It survives a restart. `MAINTENANCE=true` seeds it at boot, but once the
  switch has been flipped by hand the stored value is what decides, so a hub
  closed for a reason does not reopen when the process bounces.

With no `ADMIN_TOKEN` set the endpoint returns 404 rather than existing
unprotected.

## The $COOK shop

Dormant. `SHOP_ENABLED=false` is the default and every `/shop` route answers
404 while it is — not a hidden button, an absent endpoint.

When it is switched on, the flow is: `POST /shop/quote` builds an unsigned
transaction that burns half the price and sends half to `TREASURY_WALLET`; the
wallet signs and submits it; `POST /shop/claim` reads the chain and grants the
item only if the transaction is finalized, succeeded, was signed by that
buyer, used the right mint, burned and paid the right amounts, and has not
been claimed before.

Before switching it on in production:

1. Point a staging deployment at a devnet mint and run
   `npx tsx scripts/test-shop.ts`.
2. Complete one purchase by hand with a funded devnet wallet — sign a quote,
   submit it, claim it — and then claim the same signature again and confirm
   the 409. That last step is the one the automated test cannot reach.
3. Check the treasury's associated token account for the real mint exists.

## What is not in a production build

- **`/dev/align`** and **`/dev/mapedit`**, and the endpoints that write to
  `generated/` and to the map JSON. These live in a Vite dev-server plugin
  (`apply: "serve"`) and their pages are excluded from `rollupOptions.input`.
  They cannot be built.
- **The walk-debug overlay** on the D key, which draws an animation readout
  over every character. It lives behind `import.meta.env.DEV` and the bundler
  drops the whole module.
- **`/dev level <n>`** and the `cc.*` console helpers. The server only
  registers the handler when `NODE_ENV !== "production"`; an unregistered
  message type is dropped by Colyseus before any game code runs, so there is no
  path to it even for a client that sends one. The client half is behind
  `import.meta.env.DEV`, which the bundler removes outright.

## Health and alerts

`GET /health` answers with room and player counts, which database backend is in
use and whether it still answers a read, uptime, process CPU and memory,
simulation tick timings, and message counts by type. It returns **503** when
the database is not answering, so it works as a load balancer probe as-is.

It is unauthenticated, because a load balancer has to be able to poll it -
which means everything in it is public. The `database` block is therefore
exactly four fields: `backend`, `ok`, `players` and `sizeBytes`. It never
carries the connection string, not even with the password removed, because
that still names the host and the user; where the database lives appears once,
in this process's own boot log. `scripts/test-pages.ts` checks the shape and
greps the response for any trace of a URL.

```bash
curl -s localhost:2567/health | jq '{ok, rooms, database, tick}'
```

The server also probes itself every `HEALTH_CHECK_MS`. If `ALERT_WEBHOOK_URL`
is set, a failure POSTs:

```json
{
  "service": "crazycauldron",
  "env": "production",
  "at": "2026-09-19T04:00:00.000Z",
  "kind": "health_failed",
  "message": "The health check failed: the database is not answering.",
  "detail": { "backend": "postgres", "error": "..." }
}
```

`kind` is one of `health_failed`, `backup_failed`, `unhandled_error` or
`unhandled_rejection`. Each kind is rate limited to one alert per
`ALERT_COOLDOWN_MS` (five minutes by default) — the failures worth alerting on
repeat, and an alerting system that pages a hundred times gets turned off.

Logs are JSON, one object per line, on stdout **and** in `logs/server.log`,
which rotates at `LOG_MAX_BYTES` keeping `LOG_GENERATIONS` older copies. On
Cloud, stdout is what you will actually read.

## Backups

The server takes one every night at `BACKUP_CRON` and keeps the newest 14 in
`BACKUP_DIR`, copying each to `BACKUP_DEST` when that is set. By hand:

```bash
npx tsx scripts/backup.ts           # take one now
npx tsx scripts/backup.ts --list    # what is already there
```

Two shapes, and the extension tells them apart:

- **SQLite** → `crazycauldron-<timestamp>.db`, taken through SQLite's own
  backup API rather than copying the file. In WAL mode the newest transactions
  live in the `-wal` file, so a `cp` of the `.db` can hand back a backup
  missing the last few minutes, and copying all three mid-checkpoint can hand
  back a torn one.
- **Postgres** → `crazycauldron-<timestamp>.json.gz`, a logical dump of every
  row of every table read inside one repeatable-read transaction. `pg_dump` is
  the right tool and is not in the image the server runs in; this needs no
  binary, is readable by anything, and restores into an empty database.

Neither stops the server.

Restoring:

```bash
# SQLite: stop the server first.
systemctl stop crazycauldron
npx tsx scripts/restore.ts --latest
systemctl start crazycauldron

# Postgres: DATABASE_URL decides where it goes.
npx tsx scripts/restore.ts --latest
```

`restore.ts` reads the file to decide which kind it is and refuses to put one
into the other. For SQLite it also refuses to run while something is listening
on `PORT`, checks the backup opens before touching anything, copies the
database it is replacing aside, and removes the stale `-wal`/`-shm` files —
left in place, SQLite would try to replay them onto the restored file. For
Postgres it replaces every table in one transaction: all of it, or none of it.

**On Colyseus Cloud, set `BACKUP_DEST` to somewhere off the container, or pull
the backups off it.** The local disk is not a place to keep the only copy of
anything.

**Test the restore, not the backup.** An untested backup is a belief.

## Capacity

Measured on a 16-core Windows box, one server process, SQLite on local disk:

- 600 clients signing in and playing the real loop for 10 minutes
- 300 seated across 10 hub rooms, 300 held in the waiting room
- peak CPU **30.5% of one core**, peak RSS **229 MB**
- simulation tick p95 **0.03 ms** against a 180 ms budget, zero slow ticks

The game loop is nowhere near the limit. What saturates first is socket count
and the per-IP auth limiter, not the simulation. `GLOBAL_MAX_PLAYERS` is a
policy number, not a measured ceiling — raise it and re-run
`npm run loadtest -- --clients N --duration 600` rather than guessing.

Those numbers are from before the Postgres backend existed. On Postgres each
join costs one round trip and each save costs one transaction, which the
figures above do not include; re-measure against the database you actually
deploy with.

## Scaling out

Rooms across processes are handled: `server/src/cloud.ts` wires the Redis
driver and presence when `COLYSEUS_CLOUD` and `REDIS_URI` are set, and
Postgres handles the shared state that used to be a single file.

Three things are still per-process and would each need a shared store before
the second process is entirely honest:

- sign-in nonces (`server/src/auth/nonceStore.ts`) — a nonce issued by one
  process cannot be redeemed at another, so a sign-in that lands on two
  different processes fails and has to be retried
- rate-limit buckets (`server/src/auth/rateLimit.ts`) — the effective limit is
  the configured one times the number of processes
- the cached $COOK balances (`server/src/tokengate/`) — each process does its
  own RPC lookups, so the RPC bill scales with cores

None of those is wrong, exactly; each is just weaker than it looks. Redis is
already there on Cloud, so all three are a small change when they matter.

## Before you open the doors

```bash
npm run typecheck
npx tsx scripts/validate-content.ts      # content, map layout and the shop
npx tsx scripts/test-ambience.ts
npx tsx scripts/test-motion.ts           # world motion cost, against a 4ms budget
npx tsx scripts/test-cooking.ts
npx tsx scripts/test-camera.ts
npx tsx scripts/test-walk.ts             # the stride advances, and the sheets that have one
npx tsx scripts/test-mobile.ts
npx tsx scripts/test-config-docs.ts      # every setting is in this file
npx tsx scripts/test-site.ts             # the marketing site, and its 3 MB budget
npx tsx scripts/simulate-progression.ts

npm run build                            # the page tests read the built bundle
npm run dev                              # then, against it:
npx tsx scripts/smoke-game.ts            # the whole loop, end to end
npx tsx scripts/test-auth-abuse.ts       # replay, forgery, expiry
npx tsx scripts/test-action-abuse.ts     # cheating clients
npx tsx scripts/test-pages.ts            # routing, /public/config and /stats
AUTH_RATE_LIMIT=20 npx tsx scripts/test-rate-limits.ts

# These start and stop their own servers
npx tsx scripts/test-persistence.ts      # SIGKILL mid-session, then restart
npx tsx scripts/test-production.ts       # what NODE_ENV=production changes
npx tsx scripts/test-postgres.ts         # the Postgres backend, on a real one
npx tsx scripts/test-migration.ts        # an old database gains new columns
npx tsx scripts/test-prebuilt.ts         # the committed client, and its guard
npx tsx scripts/test-maintenance.ts      # the rollback switch
npx tsx scripts/test-shop.ts             # the $COOK shop, against devnet
```

The layout validator also runs at startup: the server refuses to boot if any
building, gate, prop or gather node overlaps another, stands on a path, or
crowds a doorway, and names every offender.
