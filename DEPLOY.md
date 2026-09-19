# Deploying CrazyCauldron

One Node process serves the game: an Express app for sign-in and matchmaking,
Colyseus on the same HTTP server for the rooms, and SQLite on local disk. The
client is a static bundle that can be served from anywhere.

This is a single-node deployment. What that costs you is in
[Scaling out](#scaling-out) at the bottom — read it before you buy a second
box, not after.

---

## What you need

- Node 20 or newer (24 is what it is developed against)
- A writable disk for the database, the backups and the logs
- A Solana RPC endpoint that will answer token-account queries
- TLS in front of the process — it speaks plain HTTP and WebSocket

## Configuration

Everything comes from environment variables, read once at startup from `.env`
at the repo root. Copy `.env.example` and fill it in.

**The server refuses to start with `NODE_ENV=production` if any of these are
wrong.** That is deliberate: each one is right on a laptop and wrong on the
internet, and each one fails quietly rather than loudly.

| Variable | Production must be | Why |
|---|---|---|
| `TEST_BYPASS_HOLD` | unset or `false` | `true` disables the token gate entirely |
| `JWT_SECRET` | 32+ random characters, not the example | anyone with it can mint sessions |
| `CORS_ORIGIN` | your real origins, comma separated | no `localhost`, no `*` |
| `SIWS_DOMAIN` | the domain wallets should display | wallets sign for whatever this says |
| `RPC_URL` | a mainnet endpoint | devnet balances are not real balances |
| `COOK_MINT` | the real mint | the gate has nothing to check otherwise |

The rest:

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `2567` | HTTP and WebSocket share it |
| `DATABASE_PATH` | `./data/crazycauldron.db` | put it on a disk you back up |
| `MIN_HOLD` | `2000` | $COOK required to enter |
| `HUB_MAX_PLAYERS` | `30` | players per room before a new one opens |
| `GLOBAL_MAX_PLAYERS` | `300` | beyond this, joiners go to the waiting room |
| `AUTH_RATE_LIMIT` | `10` | per IP, per window. Raise only for load tests |
| `AUTH_RATE_WINDOW_MS` | `60000` | the window those requests are counted in |
| `BACKUP_CRON` | `0 4 * * *` | nightly backup, server local time |
| `BACKUP_DIR` | `./backups` | where timestamped copies land |
| `BACKUP_DEST` | unset | a second directory each backup is copied to |
| `LOG_DIR` | `./logs` | rotating `server.log` |
| `LOG_MAX_BYTES` | `5242880` | roll over at 5 MB |
| `LOG_GENERATIONS` | `5` | how many old logs to keep |
| `ALERT_WEBHOOK_URL` | unset | POSTed to on failures; see below |
| `HEALTH_CHECK_MS` | `60000` | how often the server probes itself |

The client needs `VITE_SERVER_HTTP_URL` and `VITE_SERVER_WS_URL` at **build**
time — they are baked into the bundle, so a change means a rebuild.

## Building and running

```bash
npm ci
npm run sprites          # only if the art drops have changed
npm run build            # shared -> server -> client
NODE_ENV=production npm start
```

`npm run build` emits the server to `server/dist` and the client to
`client/dist`. Serve `client/dist` as static files from any web server or CDN.

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

## What is not in a production build

- **`/dev/align`**, the overlay workbench, and the endpoints that write to
  `generated/`. These live in a Vite dev-server plugin (`apply: "serve"`) and
  the page is excluded from `rollupOptions.input`. They cannot be built.
- **`/dev level <n>`** and the `cc.*` console helpers. The server only
  registers the handler when `NODE_ENV !== "production"`; an unregistered
  message type is dropped by Colyseus before any game code runs, so there is no
  path to it even for a client that sends one. The client half is behind
  `import.meta.env.DEV`, which the bundler removes outright.

## Health and alerts

`GET /health` answers with room and player counts, whether the database still
answers a read, uptime, process CPU and memory, simulation tick timings, and
message counts by type. It returns **503** when the database is not answering,
so it works as a load balancer probe as-is.

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
  "detail": { "error": "...", "file": "/srv/crazycauldron/data/crazycauldron.db" }
}
```

`kind` is one of `health_failed`, `backup_failed`, `unhandled_error` or
`unhandled_rejection`. Each kind is rate limited to one alert per
`ALERT_COOLDOWN_MS` (five minutes by default) — the failures worth alerting on
repeat, and an alerting system that pages a hundred times gets turned off.

Logs are JSON, one object per line, on stdout **and** in `logs/server.log`,
which rotates at `LOG_MAX_BYTES` keeping `LOG_GENERATIONS` older copies.

## Backups

The server takes one every night at `BACKUP_CRON` and keeps the newest 14 in
`BACKUP_DIR`, copying each to `BACKUP_DEST` when that is set. By hand:

```bash
npx tsx scripts/backup.ts           # take one now
npx tsx scripts/backup.ts --list    # what is already there
```

Both use SQLite's own backup API rather than copying the file. In WAL mode the
newest transactions live in the `-wal` file, so a `cp` of the `.db` can hand
back a backup missing the last few minutes, and copying all three mid-
checkpoint can hand back a torn one. The backup API copies a live database
consistently while the server keeps serving.

Restoring:

```bash
systemctl stop crazycauldron
npx tsx scripts/restore.ts --latest
systemctl start crazycauldron
```

`restore.ts` refuses to run while something is listening on `PORT`, checks the
backup opens before touching anything, copies the database it is replacing
aside, and removes the stale `-wal`/`-shm` files — left in place, SQLite would
try to replay them onto the restored file.

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

## Scaling out

A second process on the same box will not work as it stands. Three things are
in-process and would each need a shared store:

- sign-in nonces (`server/src/auth/nonceStore.ts`)
- rate-limit buckets (`server/src/auth/rateLimit.ts`)
- the cached $COOK balances (`server/src/tokengate/`)

Colyseus also needs `@colyseus/redis-driver` and a shared presence for rooms to
be visible across nodes, and capacity is counted per node. SQLite would have to
become Postgres — `PlayerRepository` and `GameRepository` in `server/src/db/`
are the only two interfaces that reach the database, so that is one new
implementation and one line in `db/index.ts`.

## Before you open the doors

```bash
npm run typecheck
npx tsx scripts/validate-content.ts      # content and map layout
npx tsx scripts/test-ambience.ts
npx tsx scripts/test-cooking.ts
npx tsx scripts/test-camera.ts
npx tsx scripts/simulate-progression.ts

npm run dev                              # then, against it:
npx tsx scripts/smoke-game.ts            # the whole loop, end to end
npx tsx scripts/test-auth-abuse.ts       # replay, forgery, expiry
npx tsx scripts/test-action-abuse.ts     # cheating clients
AUTH_RATE_LIMIT=20 npx tsx scripts/test-rate-limits.ts

npx tsx scripts/test-persistence.ts      # runs its own server, kills it
```

The layout validator also runs at startup: the server refuses to boot if any
building, gate, prop or gather node overlaps another, stands on a path, or
crowds a doorway, and names every offender.
