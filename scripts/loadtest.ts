/**
 * Synthetic load against a running server.
 *
 *   AUTH_RATE_LIMIT=5000 npm run dev            # in another terminal
 *   npm run loadtest -- --clients 600 --duration 600
 *
 * Each virtual client is a freshly generated Solana keypair that signs the
 * server's real sign-in message, so the whole path is exercised - nonce,
 * signature, JWT, matchmaking, room join, and then the game itself - rather
 * than a shortcut past auth.
 *
 * The clients play rather than twitch. Each one runs the real loop: travel to
 * the Meadows, walk to a node, gather, come back, walk to the kitchen, cook,
 * sell at the tavern. One action every four to eight seconds, which is roughly
 * what a person does. Anything faster measures the rate limiter instead of the
 * game.
 *
 * Requires TEST_BYPASS_HOLD=true - the generated wallets hold no $COOK - and a
 * raised AUTH_RATE_LIMIT, since every client signs in from one IP.
 */

import { Keypair } from "@solana/web3.js";
import { Client, type Room } from "@colyseus/sdk";
import bs58 from "bs58";
import nacl from "tweetnacl";
import {
  HUB_MAP,
  approachTo,
  areaNode,
  zoneById,
  MSG_ADMIT,
  MSG_COOK_PREP,
  MSG_COOK_PREPARED,
  MSG_COOK_RESULT,
  MSG_COOK_START,
  MSG_COOK_STOP,
  MSG_GATHER,
  MSG_ATE,
  MSG_BOUGHT,
  MSG_GATHER_RESULT,
  MSG_GATHER_STARTED,
  MSG_KICK,
  MSG_NODES,
  MSG_UNLOCKED,
  MSG_HEAT_BAR,
  MSG_MOVE,
  MSG_PROFILE,
  MSG_REJECTED,
  MSG_SELL,
  MSG_SOLD,
  MSG_TRAVEL,
  RECIPES,
  ROOM_HUB,
  SECTIONS,
  areaFor,
  findPath,
  isWalkableOn,
  type CookPreparedPayload,
  type EnterResponse,
  type HeatBarPayload,
  type NonceResponse,
  type ProfilePayload,
  type TilePos,
  type VerifyResponse,
} from "@crazycauldron/shared";

interface Options {
  clients: number;
  duration: number;
  httpUrl: string;
  wsUrl: string;
  /** Range between one client action and the next, in ms. */
  actionMinMs: number;
  actionMaxMs: number;
  /** ms between client start-ups, to avoid a thundering herd at t=0. */
  rampMs: number;
  /** How often to sample /health, in ms. */
  sampleMs: number;
}

function parseArgs(argv: string[]): Options {
  const flag = (name: string, fallback: string): string => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? (argv[index + 1] ?? fallback) : fallback;
  };
  return {
    clients: Number(flag("clients", "600")),
    duration: Number(flag("duration", "600")),
    httpUrl: flag("endpoint", process.env.VITE_SERVER_HTTP_URL ?? "http://localhost:2567"),
    wsUrl: flag("ws", process.env.VITE_SERVER_WS_URL ?? "ws://localhost:2567"),
    actionMinMs: Number(flag("action-min", "4000")),
    actionMaxMs: Number(flag("action-max", "8000")),
    rampMs: Number(flag("ramp", "40")),
    sampleMs: Number(flag("sample", "5000")),
  };
}

// --------------------------------------------------------------------------
// Tallies
// --------------------------------------------------------------------------

const stats = {
  signedIn: 0,
  joinedHub: 0,
  queued: 0,
  promoted: 0,
  actions: 0,
  gathers: 0,
  cooks: 0,
  sells: 0,
  travels: 0,
  rejected: new Map<string, number>(),
  rateLimited: 0,
  failures: new Map<string, number>(),
  authMs: [] as number[],
  enterMs: [] as number[],
  /** Peak hub occupancy the server reported while the test ran. */
  peakHubPlayers: 0,
  peakQueued: 0,
};

interface HealthSample {
  at: number;
  cpu: number;
  rssMb: number;
  tickP95: number;
  tickMax: number;
  messages: number;
  hubPlayers: number;
  hubRooms: number;
  dbOk: boolean;
  ticks: number;
  slowTicks: number;
  cores: number;
}

const samples: HealthSample[] = [];

const fail = (reason: string) =>
  stats.failures.set(reason, (stats.failures.get(reason) ?? 0) + 1);
const refused = (reason: string) =>
  stats.rejected.set(reason, (stats.rejected.get(reason) ?? 0) + 1);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const between = (min: number, max: number) => min + Math.random() * (max - min);

// --------------------------------------------------------------------------
// HTTP
// --------------------------------------------------------------------------

async function postJson<T>(url: string, body: unknown, token?: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (response.status === 429) {
      stats.rateLimited += 1;
      await sleep((Number(response.headers.get("retry-after")) || 1) * 1000);
      continue;
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status} ${text.slice(0, 120)}`);
    }
    return (await response.json()) as T;
  }
  throw new Error("429 after retries");
}

async function getJson<T>(url: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url);
    if (response.status === 429) {
      stats.rateLimited += 1;
      await sleep((Number(response.headers.get("retry-after")) || 1) * 1000);
      continue;
    }
    if (!response.ok) throw new Error(`${response.status}`);
    return (await response.json()) as T;
  }
  throw new Error("429 after retries");
}

// --------------------------------------------------------------------------
// One virtual player
// --------------------------------------------------------------------------

/** The starter recipe and what it needs, read from content rather than named. */
const STARTER = RECIPES.find((r) => Object.keys(r.requirements).length === 0) ?? RECIPES[0]!;
const MEADOWS = SECTIONS[0]!;

/** Walks the server's own pathfinder to see how far a destination is. */
function reachable(mapId: number, from: TilePos, to: TilePos): boolean {
  return findPath(from, to, (x, y) => isWalkableOn(mapId, x, y)).length > 0;
}

/**
 * A cell to stand on to use a zone, and one to stand on to gather a node.
 *
 * Both come from shared rather than being worked out here: a painted building
 * is solid, so the cell a player wants is always outside it, and "outside it"
 * is a question about the map's walkable mask rather than about arithmetic on
 * a centre point.
 */
function approachZone(mapId: number, zoneId: string, from: TilePos): TilePos | null {
  const zone = zoneById(mapId, zoneId);
  return zone ? approachTo(mapId, zone, from) : null;
}

function besideNode(mapId: number, nodeId: string): TilePos | null {
  const node = areaNode(mapId, nodeId);
  if (!node) return null;
  for (const [dx, dy] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ] as const) {
    if (isWalkableOn(mapId, node.c + dx, node.r + dy)) {
      return { tileX: node.c + dx, tileY: node.r + dy };
    }
  }
  return null;
}


interface Self {
  tileX: number;
  tileY: number;
  section: number;
  moving: boolean;
}

function selfOf(room: Room): Self | undefined {
  const state = room.state as { players?: { get(id: string): Self | undefined } };
  return state.players?.get(room.sessionId);
}

/** Sends a destination and waits for the server to walk us there, or gives up. */
async function walkTo(room: Room, target: TilePos, timeoutMs: number): Promise<boolean> {
  room.send(MSG_MOVE, target);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const me = selfOf(room);
    if (me && me.tileX === target.tileX && me.tileY === target.tileY) return true;
    await sleep(200);
  }
  return false;
}

/**
 * The loop a person actually runs, paced like a person.
 *
 * Deliberately forgiving: any step that does not land inside its window is
 * abandoned and the next cycle starts over. A load test that insists on a
 * perfect run measures its own assumptions.
 */
async function play(room: Room, options: Options, stopAt: number) {
  // Explicitly typed holders: the callbacks below are the only writers, and
  // TypeScript narrows an assigned-once closure variable to `never` otherwise.
  const latest: {
    profile: ProfilePayload | null;
    heatBar: HeatBarPayload | null;
    prepared: CookPreparedPayload | null;
  } = { profile: null, heatBar: null, prepared: null };

  /*
   * Read through functions, not directly.
   *
   * These are written only by the message callbacks, so after "latest.heatBar
   * = null" TypeScript narrows the property to null and every later read to
   * never - it cannot see that a socket will fill it in between. A call
   * returns the declared type and the narrowing stops there.
   */
  const takePrepared = (): CookPreparedPayload | null => latest.prepared;
  const takeHeatBar = (): HeatBarPayload | null => latest.heatBar;
  const takeProfile = (): ProfilePayload | null => latest.profile;

  room.onMessage(MSG_PROFILE, (p: ProfilePayload) => {
    latest.profile = p;
  });
  room.onMessage(MSG_HEAT_BAR, (p: HeatBarPayload) => {
    latest.heatBar = p;
  });
  room.onMessage(MSG_COOK_PREPARED, (p: CookPreparedPayload) => {
    latest.prepared = p;
  });
  room.onMessage(MSG_COOK_RESULT, () => (stats.cooks += 1));
  room.onMessage(MSG_GATHER_RESULT, () => (stats.gathers += 1));
  room.onMessage(MSG_SOLD, () => (stats.sells += 1));
  room.onMessage(MSG_REJECTED, (r: { reason?: string }) => refused(r.reason ?? "unknown"));

  // The SDK warns for every unhandled type, which at 600 clients drowns
  // the report. These are all fire-and-forget updates the load test ignores.
  for (const type of [MSG_NODES, MSG_GATHER_STARTED, MSG_UNLOCKED, MSG_ATE, MSG_BOUGHT, MSG_KICK]) {
    room.onMessage(type, () => undefined);
  }

  const pause = async () => {
    stats.actions += 1;
    await sleep(between(options.actionMinMs, options.actionMaxMs));
  };
  const running = () => Date.now() < stopAt;

  while (running()) {
    // --- out to the Meadows ------------------------------------------------
    const gate = selfOf(room)?.section === HUB_MAP;
    if (gate) {
      const me = selfOf(room);
      const here = me ? { tileX: me.tileX, tileY: me.tileY } : { tileX: 0, tileY: 0 };
      const at = approachZone(HUB_MAP, `portal_${MEADOWS.index}`, here);
      if (at && reachable(HUB_MAP, here, at)) await walkTo(room, at, 20000);
      if (!running()) break;
      room.send(MSG_TRAVEL, { section: MEADOWS.index });
      stats.travels += 1;
      await pause();
    }

    // --- gather a few times -------------------------------------------------
    for (let i = 0; i < 3 && running(); i += 1) {
      const me = selfOf(room);
      if (!me || me.section !== MEADOWS.index) break;
      const node = MEADOWS.nodes[Math.floor(Math.random() * MEADOWS.nodes.length)]!;
      const beside = besideNode(MEADOWS.index, node.id);
      if (!beside) continue;

      await walkTo(room, beside, 20000);
      if (!running()) break;
      room.send(MSG_GATHER, { nodeId: node.id });
      await pause();
    }
    if (!running()) break;

    // --- home again ----------------------------------------------------------
    const inMeadows = selfOf(room);
    if (inMeadows?.section === MEADOWS.index) {
      const out = approachZone(MEADOWS.index, "portal_hub", {
        tileX: inMeadows.tileX,
        tileY: inMeadows.tileY,
      });
      if (out) await walkTo(room, out, 20000);
      room.send(MSG_TRAVEL, { section: HUB_MAP });
      stats.travels += 1;
      await pause();
    }
    if (!running()) break;

    // --- cook, if the bag allows --------------------------------------------
    const canCook = STARTER.ingredients.every(
      (need) =>
        (takeProfile()?.inventory.find((i) => i.kind === "ingredient" && i.id === need.id)?.qty ??
          0) >=
        need.qty,
    );
    if (canCook) {
      const me = selfOf(room);
      const door = approachZone(HUB_MAP, "kitchen", {
        tileX: me?.tileX ?? 0,
        tileY: me?.tileY ?? 0,
      });
      if (door) await walkTo(room, door, 20000);
      if (!running()) break;

      latest.heatBar = null;
      latest.prepared = null;
      room.send(MSG_COOK_START, { recipeId: STARTER.id });
      await sleep(600);

      // Prep is a hold-and-release; the server sends the bar either way.
      const readyPrep = takePrepared();
      if (readyPrep && !readyPrep.autoPrep) {
        await sleep(readyPrep.prepMs);
        room.send(MSG_COOK_PREP, { cookId: readyPrep.cookId });
        await sleep(400);
      }

      const bar = takeHeatBar();
      if (bar) {
        // Stop near the middle of the bar - a real player aiming and missing.
        const target = bar.durationMs / 2 + between(-120, 120);
        await sleep(Math.max(0, target));
        room.send(MSG_COOK_STOP, { cookId: bar.cookId, elapsedMs: Math.round(target) });
      }
      await pause();
    }
    if (!running()) break;

    // --- sell whatever came out ---------------------------------------------
    const dish = takeProfile()?.inventory.find((i) => i.kind === "dish");
    if (dish) {
      const me = selfOf(room);
      const counter = approachZone(HUB_MAP, "tavern", {
        tileX: me?.tileX ?? 0,
        tileY: me?.tileY ?? 0,
      });
      if (counter) await walkTo(room, counter, 20000);
      if (!running()) break;
      room.send(MSG_SELL, { stackKey: dish.key, qty: 1 });
      await pause();
    }

    // A wander between cycles, so the movement loop always has work to do.
    const wanderer = selfOf(room);
    if (wanderer) {
      // Somewhere walkable, picked from the map rather than from memory.
      const area = areaFor(wanderer.section);
      for (let tries = 0; tries < 12; tries += 1) {
        const tileX = Math.floor(Math.random() * area.cols);
        const tileY = Math.floor(Math.random() * area.rows);
        if (!isWalkableOn(wanderer.section, tileX, tileY)) continue;
        await walkTo(room, { tileX, tileY }, 10000);
        break;
      }
    }
    await pause();
  }
}

async function runClient(options: Options, stopAt: number) {
  const keypair = Keypair.generate();
  const address = keypair.publicKey.toBase58();

  const authStart = Date.now();
  const { message } = await getJson<NonceResponse>(
    `${options.httpUrl}/auth/nonce?address=${address}`,
  );
  const signature = bs58.encode(
    nacl.sign.detached(new TextEncoder().encode(message), keypair.secretKey),
  );
  const verified = await postJson<VerifyResponse>(`${options.httpUrl}/auth/verify`, {
    address,
    message,
    signature,
  });
  stats.authMs.push(Date.now() - authStart);
  stats.signedIn += 1;

  const enterStart = Date.now();
  const entered = await postJson<EnterResponse>(`${options.httpUrl}/play/enter`, {}, verified.token);
  const gameClient = new Client(options.wsUrl);
  const room = await gameClient.consumeSeatReservation(entered.reservation as never);
  stats.enterMs.push(Date.now() - enterStart);

  if (entered.room === ROOM_HUB) {
    stats.joinedHub += 1;
    await play(room, options, stopAt);
  } else {
    /*
     * Queued clients are the point of the exercise above 300: they hold their
     * place, and when the waiting room promotes them they take the seat and
     * start playing, which is what proves the queue drains.
     */
    stats.queued += 1;
    let promoted = false;
    room.onMessage(MSG_ADMIT, () => {
      promoted = true;
    });
    while (Date.now() < stopAt && !promoted) await sleep(1000);
    if (promoted) stats.promoted += 1;
  }

  await room.leave();
}

// --------------------------------------------------------------------------
// Sampling and report
// --------------------------------------------------------------------------

interface Health {
  ok: boolean;
  rooms: { hubPlayers: number; hubRooms: number };
  database: { ok: boolean };
  process: {
    cpuPercentOfCore: number;
    peakCpuPercentOfCore: number;
    rssMb: number;
    peakRssMb: number;
    cores: number;
  };
  tick: { count: number; p95Ms: number; maxMs: number; slow: number };
  messages: { total: number; perSecond: number; byType: Record<string, number> };
}

async function sampleHealth(options: Options, stopAt: number) {
  while (Date.now() < stopAt) {
    try {
      const health = await getJson<Health>(`${options.httpUrl}/health`);
      samples.push({
        at: Date.now(),
        cpu: health.process.cpuPercentOfCore,
        rssMb: health.process.rssMb,
        tickP95: health.tick.p95Ms,
        tickMax: health.tick.maxMs,
        messages: health.messages.total,
        hubPlayers: health.rooms.hubPlayers,
        hubRooms: health.rooms.hubRooms,
        dbOk: health.database.ok,
        ticks: health.tick.count,
        slowTicks: health.tick.slow,
        cores: health.process.cores,
      });
      stats.peakHubPlayers = Math.max(stats.peakHubPlayers, health.rooms.hubPlayers);
    } catch (err) {
      fail(`health: ${(err as Error).message.slice(0, 60)}`);
    }
    await sleep(options.sampleMs);
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

function report(options: Options, elapsedSeconds: number) {
  const line = (label: string, value: string | number) =>
    console.log(`  ${label.padEnd(26)} ${value}`);

  const peakCpu = Math.max(0, ...samples.map((s) => s.cpu));
  const peakRss = Math.max(0, ...samples.map((s) => s.rssMb));
  const tickP95 = percentile(samples.map((s) => s.tickP95), 95);
  const tickMax = Math.max(0, ...samples.map((s) => s.tickMax));
  const first = samples[0];
  const last = samples[samples.length - 1];
  const messageRate =
    first && last && last.at > first.at
      ? ((last.messages - first.messages) / ((last.at - first.at) / 1000)).toFixed(1)
      : "0";

  console.log(`\nload test: ${options.clients} clients for ${Math.round(elapsedSeconds)}s`);
  line("signed in", stats.signedIn);
  line("joined a hub", stats.joinedHub);
  line("sent to the queue", stats.queued);
  line("promoted out of queue", stats.promoted);
  line("peak hub players", stats.peakHubPlayers);
  line("peak hub rooms", Math.max(0, ...samples.map((s) => s.hubRooms)));

  console.log("");
  line("player actions", stats.actions);
  line("gathers / cooks / sells", `${stats.gathers} / ${stats.cooks} / ${stats.sells}`);
  line("travels", stats.travels);
  line("server messages/s", messageRate);

  console.log("");
  line("peak CPU (% of one core)", peakCpu.toFixed(1));
  line("peak RSS (MB)", peakRss.toFixed(1));
  line("tick p95 / max (ms)", `${tickP95.toFixed(2)} / ${tickMax.toFixed(2)}`);
  line(
    "slow ticks",
    last ? `${last.slowTicks} of ${last.ticks} (over the 180ms budget)` : "n/a",
  );
  line("machine", last ? `${last.cores} cores` : "unknown");
  line("database healthy", samples.every((s) => s.dbOk) ? "yes" : "NO");

  console.log("");
  line("auth p50 / p95 ms", `${percentile(stats.authMs, 50)} / ${percentile(stats.authMs, 95)}`);
  line("enter p50 / p95 ms", `${percentile(stats.enterMs, 50)} / ${percentile(stats.enterMs, 95)}`);
  line("rate limited (retried)", stats.rateLimited);

  if (stats.rejected.size > 0) {
    console.log("\n  server refusals (expected - the clients are not careful):");
    for (const [reason, count] of [...stats.rejected].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      console.log(`    ${String(count).padStart(6)}x ${reason}`);
    }
  }

  if (stats.failures.size === 0) {
    console.log("\n  no client failures");
  } else {
    console.log("\n  client failures:");
    for (const [reason, count] of [...stats.failures].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
      console.log(`    ${String(count).padStart(6)}x ${reason}`);
    }
  }

  if (peakCpu > 70) {
    console.log(
      `\n  CPU peaked at ${peakCpu.toFixed(1)}% of one core with ${stats.joinedHub} ` +
        "players seated - see the tick timings above for where it went.",
    );
  }
}

// --------------------------------------------------------------------------

const options = parseArgs(process.argv.slice(2));
const startedAt = Date.now();
const stopAt = startedAt + options.duration * 1000;

console.log(
  `connecting ${options.clients} clients to ${options.httpUrl} for ${options.duration}s ` +
    `(one action every ${options.actionMinMs / 1000}-${options.actionMaxMs / 1000}s)`,
);

const sampler = sampleHealth(options, stopAt);
const running: Promise<void>[] = [];
for (let i = 0; i < options.clients; i += 1) {
  running.push(
    runClient(options, stopAt).catch((err: Error) => {
      fail(err.message.slice(0, 80));
    }),
  );
  await sleep(options.rampMs);
}

await Promise.all(running);
await sampler;
report(options, (Date.now() - startedAt) / 1000);
process.exit(stats.failures.size === 0 ? 0 : 1);
