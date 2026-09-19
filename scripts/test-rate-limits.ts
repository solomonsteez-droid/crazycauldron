/**
 * The two limiters, under pressure, with a bystander watching.
 *
 *   AUTH_RATE_LIMIT=20 npm run dev       # in another terminal
 *   npx tsx scripts/test-rate-limits.ts
 *
 * Two rules to hold at once. A burst of requests from one IP must be throttled
 * - that is the easy half. The half that matters is that everyone else keeps
 * playing while it happens: a limiter that protects the server by stalling the
 * game has only moved the outage.
 *
 * So each case runs with a bystander already seated in a hub, and checks that
 * its round trips stay healthy throughout.
 */

import { Keypair } from "@solana/web3.js";
import { Client, type Room } from "colyseus.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import {
  AUTH_RATE_LIMIT,
  HUB_MAP,
  MSG_GATHER,
  MSG_GATHER_RESULT,
  MSG_GATHER_STARTED,
  MSG_KICK,
  MSG_MOVE,
  MSG_NODES,
  MSG_PROFILE,
  MSG_REJECTED,
  MSG_UNLOCKED,
  isWalkableOn,
  type EnterResponse,
  type NonceResponse,
  type ProfilePayload,
  type RejectedPayload,
  type TilePos,
  type VerifyResponse,
} from "@crazycauldron/shared";

const HTTP = process.env.SMOKE_HTTP_URL ?? "http://localhost:2567";
const WS = process.env.SMOKE_WS_URL ?? "ws://localhost:2567";

/** What the server was started with, read from the same environment it reads. */
const CONFIGURED_LIMIT = Number(process.env.AUTH_RATE_LIMIT ?? AUTH_RATE_LIMIT);
const BURST = 50;

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function signIn(): Promise<VerifyResponse> {
  const keypair = Keypair.generate();
  const address = keypair.publicKey.toBase58();
  const nonce = (await (await fetch(`${HTTP}/auth/nonce?address=${address}`)).json()) as NonceResponse;
  const signature = bs58.encode(
    nacl.sign.detached(new TextEncoder().encode(nonce.message), keypair.secretKey),
  );
  const response = await fetch(`${HTTP}/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, message: nonce.message, signature }),
  });
  if (!response.ok) throw new Error(`sign-in failed: ${response.status}`);
  return (await response.json()) as VerifyResponse;
}

interface Seat {
  room: Room;
  rejections: RejectedPayload[];
  gathers: number;
  profile: () => ProfilePayload | null;
  self: () => { tileX: number; tileY: number; section: number } | undefined;
}

async function takeSeat(): Promise<Seat> {
  const verified = await signIn();
  const entered = (await (
    await fetch(`${HTTP}/play/enter`, {
      method: "POST",
      headers: { authorization: `Bearer ${verified.token}` },
    })
  ).json()) as EnterResponse;

  const room = await new Client(WS).consumeSeatReservation(entered.reservation as never);
  const state = { profile: null as ProfilePayload | null, gathers: 0 };
  const rejections: RejectedPayload[] = [];

  room.onMessage(MSG_PROFILE, (p: ProfilePayload) => {
    state.profile = p;
  });
  room.onMessage(MSG_REJECTED, (r: RejectedPayload) => rejections.push(r));
  room.onMessage(MSG_GATHER_RESULT, () => {
    state.gathers += 1;
  });
  for (const type of [MSG_NODES, MSG_GATHER_STARTED, MSG_UNLOCKED, MSG_KICK]) {
    room.onMessage(type, () => undefined);
  }

  const seat: Seat = {
    room,
    rejections,
    get gathers() {
      return state.gathers;
    },
    profile: () => state.profile,
    self: () => {
      const s = room.state as {
        players?: { get(id: string): { tileX: number; tileY: number; section: number } | undefined };
      };
      return s.players?.get(room.sessionId);
    },
  };
  await sleep(600);
  return seat;
}

/** Sends a destination and waits for the server to walk the player there. */
async function walkTo(seat: Seat, target: TilePos, timeoutMs = 20000): Promise<boolean> {
  seat.room.send(MSG_MOVE, target);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const me = seat.self();
    if (me && me.tileX === target.tileX && me.tileY === target.tileY) return true;
    await sleep(150);
  }
  return false;
}

async function main() {
  console.log("test-rate-limits\n");
  console.log(`  the server's auth limit is ${CONFIGURED_LIMIT} per window\n`);

  // A player already in the game, who must not notice any of what follows.
  const bystander = await takeSeat();
  check("a bystander is seated before the storm", bystander.self()?.section === HUB_MAP);

  // --- per-IP auth burst ---------------------------------------------------
  console.log("\n-- a burst of sign-ins from one IP --");
  {
    const before = Date.now();
    const results = await Promise.all(
      Array.from({ length: BURST }, async () => {
        const address = Keypair.generate().publicKey.toBase58();
        const response = await fetch(`${HTTP}/auth/nonce?address=${address}`);
        return response.status;
      }),
    );
    const elapsed = Date.now() - before;
    const throttled = results.filter((s) => s === 429).length;
    const served = results.filter((s) => s === 200).length;

    console.log(`  ${BURST} nonce requests in ${elapsed}ms: ${served} served, ${throttled} throttled`);

    if (CONFIGURED_LIMIT < BURST) {
      check(
        `the burst is throttled above ${CONFIGURED_LIMIT}`,
        throttled > 0,
        `${throttled} of ${BURST} got 429`,
      );
      check(
        "and the limit is roughly where it was configured",
        served <= CONFIGURED_LIMIT + 2,
        `${served} served against a limit of ${CONFIGURED_LIMIT}`,
      );
    } else {
      check(
        `a burst of ${BURST} is under the configured limit and is served`,
        throttled === 0,
        `set AUTH_RATE_LIMIT below ${BURST} to exercise the throttle`,
      );
    }

    check(
      "a throttled request answers rather than hanging",
      elapsed < 15000,
      `${elapsed}ms for ${BURST}`,
    );
  }

  // --- the bystander is unaffected ------------------------------------------
  console.log("\n-- the bystander --");
  {
    const start = Date.now();
    const walked = await walkTo(bystander, { tileX: 12, tileY: 18 }, 10000);
    check("still moves during the burst", walked, `${Date.now() - start}ms`);
    check("and was never kicked", bystander.self() !== undefined);
    check(
      "and was refused nothing",
      bystander.rejections.length === 0,
      bystander.rejections.map((r) => r.reason).join(", "),
    );
  }

  // --- per-session action limit --------------------------------------------
  console.log("\n-- one session hammering its actions --");
  {
    const hammer = await takeSeat();
    const quiet = await takeSeat();

    // Both are in the hub, where there is nothing to gather - so the refusals
    // are the action guard's, not the map's. Fifty gathers in one burst.
    hammer.rejections.length = 0;
    quiet.rejections.length = 0;
    for (let i = 0; i < BURST; i += 1) hammer.room.send(MSG_GATHER, { nodeId: "meadows_1" });
    await sleep(1500);

    check(
      "the hammering session is refused",
      hammer.rejections.length > 1,
      `${hammer.rejections.length} refusals: ${[...new Set(hammer.rejections.map((r) => r.reason))].join(", ")}`,
    );
    check(
      "it never gathered anything",
      hammer.gathers === 0,
      `${hammer.gathers} gathers`,
    );

    // The quiet session sends exactly one of the same message.
    quiet.room.send(MSG_GATHER, { nodeId: "meadows_1" });
    await sleep(800);
    check(
      "a quiet session's own action is judged on its own merits",
      quiet.rejections.every((r) => r.reason !== "too_fast" && r.reason !== "busy"),
      quiet.rejections.map((r) => r.reason).join(", ") || "nothing",
    );

    const stillMoving = await walkTo(quiet, { tileX: 11, tileY: 18 }, 10000);
    check("and it still moves", stillMoving);

    await hammer.room.leave();
    await quiet.room.leave();
  }

  // --- and the bystander is still fine --------------------------------------
  console.log("\n-- afterwards --");
  {
    const walked = await walkTo(bystander, { tileX: 13, tileY: 17 }, 10000);
    check("the bystander is still playing", walked);
    const health = (await (await fetch(`${HTTP}/health`)).json()) as { ok: boolean };
    check("and the server is healthy", health.ok);
  }

  await bystander.room.leave();
  console.log(
    `\n${failures === 0 ? "test-rate-limits: OK" : `test-rate-limits: ${failures} failure(s)`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\ntest-rate-limits failed: ${(err as Error).message}`);
  process.exit(1);
});
