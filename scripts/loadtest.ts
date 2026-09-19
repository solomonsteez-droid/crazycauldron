/**
 * Synthetic load against a running dev server.
 *
 *   npm run loadtest -- --clients 50 --duration 60
 *
 * Each virtual client is a freshly generated Solana keypair that signs the
 * server's real sign-in message, so the whole path is exercised - nonce,
 * signature, JWT, matchmaking, room join, move intents - rather than a
 * shortcut past auth.
 *
 * Requires the server to be running with TEST_BYPASS_HOLD=true: the generated
 * wallets hold no $COOK and would otherwise be turned away at the gate. Raise
 * AUTH_RATE_LIMIT too, since every client signs in from one IP.
 */

import { Keypair } from "@solana/web3.js";
import { Client } from "colyseus.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import {
  MAP_SIZE,
  MSG_MOVE,
  ROOM_HUB,
  type EnterResponse,
  type NonceResponse,
  type VerifyResponse,
} from "@crazycauldron/shared";

interface Options {
  clients: number;
  duration: number;
  httpUrl: string;
  wsUrl: string;
  /** ms between a client's move intents. */
  moveInterval: number;
  /** ms between client start-ups, to avoid a thundering herd at t=0. */
  rampMs: number;
}

function parseArgs(argv: string[]): Options {
  const flag = (name: string, fallback: string): string => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? (argv[index + 1] ?? fallback) : fallback;
  };
  return {
    clients: Number(flag("clients", "25")),
    duration: Number(flag("duration", "30")),
    httpUrl: flag("endpoint", process.env.VITE_SERVER_HTTP_URL ?? "http://localhost:2567"),
    wsUrl: flag("ws", process.env.VITE_SERVER_WS_URL ?? "ws://localhost:2567"),
    moveInterval: Number(flag("move-interval", "3000")),
    rampMs: Number(flag("ramp", "80")),
  };
}

const stats = {
  signedIn: 0,
  joinedHub: 0,
  queued: 0,
  moves: 0,
  rateLimited: 0,
  failures: new Map<string, number>(),
  authMs: [] as number[],
  enterMs: [] as number[],
};

function fail(reason: string) {
  stats.failures.set(reason, (stats.failures.get(reason) ?? 0) + 1);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Fetch that retries once when the auth limiter pushes back. */
async function postJson<T>(url: string, body: unknown, token?: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
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
  throw new Error("429 after retry");
}

async function getJson<T>(url: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url);
    if (response.status === 429) {
      stats.rateLimited += 1;
      await sleep((Number(response.headers.get("retry-after")) || 1) * 1000);
      continue;
    }
    if (!response.ok) throw new Error(`${response.status}`);
    return (await response.json()) as T;
  }
  throw new Error("429 after retry");
}

/** One virtual player: sign in, take a seat, wander until told to stop. */
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
  const entered = await postJson<EnterResponse>(
    `${options.httpUrl}/matchmake/enter`,
    {},
    verified.token,
  );
  const gameClient = new Client(options.wsUrl);
  const room = await gameClient.consumeSeatReservation(entered.reservation as never);
  stats.enterMs.push(Date.now() - enterStart);

  if (entered.room === ROOM_HUB) stats.joinedHub += 1;
  else stats.queued += 1;

  // Wander only in the hub; a queued client just holds its place.
  const moving = entered.room === ROOM_HUB;
  while (Date.now() < stopAt) {
    await sleep(options.moveInterval);
    if (!moving) continue;
    // Any tile at all: the server rejects unwalkable destinations, and having
    // some intents refused is part of what is being measured.
    room.send(MSG_MOVE, {
      tileX: Math.floor(Math.random() * MAP_SIZE),
      tileY: Math.floor(Math.random() * MAP_SIZE),
    });
    stats.moves += 1;
  }

  await room.leave();
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index] ?? 0;
}

function report(options: Options) {
  const line = (label: string, value: string | number) =>
    console.log(`  ${label.padEnd(22)} ${value}`);

  console.log(`\nload test: ${options.clients} clients for ${options.duration}s`);
  line("signed in", stats.signedIn);
  line("joined hub", stats.joinedHub);
  line("sent to queue", stats.queued);
  line("move intents", stats.moves);
  line("rate limited (retried)", stats.rateLimited);
  line("auth p50 / p95 ms", `${percentile(stats.authMs, 50)} / ${percentile(stats.authMs, 95)}`);
  line("enter p50 / p95 ms", `${percentile(stats.enterMs, 50)} / ${percentile(stats.enterMs, 95)}`);

  if (stats.failures.size === 0) {
    console.log("  no failures");
    return;
  }
  console.log("  failures:");
  for (const [reason, count] of stats.failures) console.log(`    ${count}x ${reason}`);
}

const options = parseArgs(process.argv.slice(2));
const stopAt = Date.now() + options.duration * 1000;

console.log(`connecting ${options.clients} clients to ${options.httpUrl} ...`);

const running: Promise<void>[] = [];
for (let i = 0; i < options.clients; i += 1) {
  running.push(
    runClient(options, stopAt).catch((err: Error) => fail(err.message.slice(0, 80))),
  );
  await sleep(options.rampMs);
}

await Promise.all(running);
report(options);
process.exit(stats.failures.size === 0 ? 0 : 1);
