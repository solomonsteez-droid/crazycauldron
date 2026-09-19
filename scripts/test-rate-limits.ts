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
import { Client, type Room } from "@colyseus/sdk";
import bs58 from "bs58";
import nacl from "tweetnacl";
import {
  AUTH_RATE_LIMIT,
  HUB_MAP,
  approachTo,
  areaFor,
  areaNode,
  zoneById,
  SECTIONS,
  MSG_TRAVEL,
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

/**
 * Where to stand to use a zone, and where to stand to gather a node.
 *
 * Asked of the map rather than worked out here: a painted building is solid,
 * so the cell a player wants is always outside it, and which cell that is is a
 * question about the walkable mask.
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

/**
 * A walkable cell to walk to, taken from the map rather than from memory.
 *
 * The old version named hub tiles by hand. A painted map's walkable set is
 * decided by the picture, so a hard-coded destination is a coin flip.
 */
function somewhereWalkable(mapId: number, from: TilePos): TilePos {
  const area = areaFor(mapId);
  let best = from;
  let bestDistance = 0;
  for (let r = 0; r < area.rows; r += 1) {
    for (let c = 0; c < area.cols; c += 1) {
      if (!isWalkableOn(mapId, c, r)) continue;
      const distance = Math.max(Math.abs(c - from.tileX), Math.abs(r - from.tileY));
      // Somewhere a few cells away: far enough that arriving proves movement,
      // near enough that the walk finishes inside the timeout.
      if (distance > bestDistance && distance <= 5) {
        bestDistance = distance;
        best = { tileX: c, tileY: r };
      }
    }
  }
  return best;
}

/** Where a seated player is standing. */
function tileOf(seat: Seat): TilePos {
  const me = seat.self();
  return me ? { tileX: me.tileX, tileY: me.tileY } : { tileX: 0, tileY: 0 };
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

  /*
   * Every seat is taken before the burst, not after.
   *
   * The burst deliberately exhausts the per-IP budget, and this test signs in
   * from that same IP - so a seat taken afterwards would be refused by the
   * very limiter the test is proving works, and the failure would look like a
   * bug rather than the point.
   */
  const bystander = await takeSeat();
  const hammer = await takeSeat();
  const quiet = await takeSeat();
  check("three players are seated before the storm", bystander.self()?.section === HUB_MAP);

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
    const walked = await walkTo(bystander, somewhereWalkable(HUB_MAP, tileOf(bystander)), 10000);
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
    /*
     * Both go to the Meadows and stand beside a node first.
     *
     * Hammering from the hub is refused too, but for the wrong reason - the
     * map answers "wrong section" before the action guard is ever consulted,
     * and a test that passes on the wrong refusal is not testing the guard.
     */
    const meadows = SECTIONS[0]!;
    const gateId = `portal_${meadows.index}`;
    const node = meadows.nodes[0]!;

    for (const seat of [hammer, quiet]) {
      await walkTo(seat, approachZone(HUB_MAP, gateId, tileOf(seat))!);
      seat.room.send(MSG_TRAVEL, { section: meadows.index });
      await sleep(1200);
      await walkTo(seat, besideNode(meadows.index, node.id)!);
    }
    check(
      "both are standing at a node in the Meadows",
      hammer.self()?.section === meadows.index && quiet.self()?.section === meadows.index,
    );

    hammer.rejections.length = 0;
    quiet.rejections.length = 0;

    // Fifty gathers in one burst, from a player who could legitimately make
    // exactly one of them.
    for (let i = 0; i < BURST; i += 1) hammer.room.send(MSG_GATHER, { nodeId: node.id });
    await sleep(1500);

    const reasons = [...new Set(hammer.rejections.map((r) => r.reason))];
    check(
      "the hammering session is refused",
      hammer.rejections.length > 1,
      `${hammer.rejections.length} refusals: ${reasons.join(", ")}`,
    );
    check(
      "and refused by the action guard, not by the map",
      reasons.includes("busy") || reasons.includes("too_fast"),
      reasons.join(", "),
    );
    check(
      "it gathered at most the one it was entitled to",
      hammer.gathers <= 1,
      `${hammer.gathers} gathers from ${BURST} attempts`,
    );

    // The quiet session sends exactly one of the same message, from a
    // different node so the first one's cooldown is not what answers.
    const otherNode = meadows.nodes[1] ?? node;
    await walkTo(quiet, besideNode(meadows.index, otherNode.id)!);
    quiet.rejections.length = 0;
    quiet.room.send(MSG_GATHER, { nodeId: otherNode.id });
    await sleep(4500);

    check(
      "a quiet session is not held back by its neighbour",
      quiet.rejections.every((r) => r.reason !== "too_fast" && r.reason !== "busy"),
      quiet.rejections.map((r) => r.reason).join(", ") || "nothing",
    );
    check("and its own gather went through", quiet.gathers >= 1, `${quiet.gathers} gathers`);

    const stillMoving = await walkTo(
      quiet,
      approachZone(meadows.index, "portal_hub", tileOf(quiet))!,
      12000,
    );
    check("and it still moves", stillMoving);

    await hammer.room.leave();
    await quiet.room.leave();
  }

  // --- and the bystander is still fine --------------------------------------
  console.log("\n-- afterwards --");
  {
    const walked = await walkTo(bystander, somewhereWalkable(HUB_MAP, tileOf(bystander)), 10000);
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
