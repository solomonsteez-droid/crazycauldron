/**
 * Headless end-to-end check of the cooking loop against a running server.
 *
 * Signs in a fresh wallet, walks to the Meadows gate, gathers, cooks a Meadow
 * flatbread on the heat bar, sells it and buys an upgrade - asserting the
 * server's own replies at every step. This is the loop the brief describes,
 * driven the way the client drives it, with no browser involved.
 *
 *   npm run dev            # in another terminal
 *   npx tsx scripts/smoke-game.ts
 */

import { Client, type Room } from "colyseus.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import {
  HUB_PORTALS,
  MSG_BOUGHT,
  MSG_BUY,
  MSG_COOK_RESULT,
  MSG_COOK_START,
  MSG_COOK_STOP,
  MSG_EAT,
  MSG_GATHER,
  MSG_GATHER_RESULT,
  MSG_GATHER_STARTED,
  MSG_HEAT_BAR,
  MSG_MOVE,
  MSG_NODES,
  MSG_PROFILE,
  MSG_REJECTED,
  MSG_SELL,
  MSG_SOLD,
  MSG_TRAVEL,
  findSection,
  type CookResultPayload,
  type GatherResultPayload,
  type HeatBarPayload,
  type NodesPayload,
  type ProfilePayload,
  type RejectedPayload,
  type SoldPayload,
  type TilePos,
} from "@crazycauldron/shared";

const HTTP = process.env.SMOKE_HTTP_URL ?? "http://localhost:2567";
const WS = process.env.SMOKE_WS_URL ?? "ws://localhost:2567";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits for one server message, failing loudly rather than hanging forever. */
function next<T>(room: Room, type: string, timeoutMs = 15000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for "${type}"`)), timeoutMs);
    room.onMessage(type, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function signIn(): Promise<{ token: string; wallet: string }> {
  const kp = nacl.sign.keyPair();
  const address = bs58.encode(kp.publicKey);
  const nonce = (await (await fetch(`${HTTP}/auth/nonce?address=${address}`)).json()) as {
    message: string;
  };
  const signature = bs58.encode(
    nacl.sign.detached(new TextEncoder().encode(nonce.message), kp.secretKey),
  );
  const verified = (await (
    await fetch(`${HTTP}/auth/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, message: nonce.message, signature }),
    })
  ).json()) as { token: string; wallet: string };
  return verified;
}

interface SelfView {
  tileX: number;
  tileY: number;
  section: number;
}

function self(room: Room): SelfView {
  const state = room.state as { players: { get(id: string): SelfView | undefined } };
  const player = state.players.get(room.sessionId);
  if (!player) throw new Error("own player missing from state");
  return player;
}

/** Waits for a replicated field to catch up; state patches arrive every 100ms. */
async function waitForSection(room: Room, section: number, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (self(room).section === section) return true;
    await sleep(50);
  }
  return false;
}

/** Sends a destination and waits until the server has actually walked us there. */
async function walkTo(room: Room, target: TilePos, timeoutMs = 20000): Promise<void> {
  room.send(MSG_MOVE, target);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const me = self(room);
    if (me.tileX === target.tileX && me.tileY === target.tileY) return;
    await sleep(60);
  }
  throw new Error(`never reached ${target.tileX},${target.tileY}`);
}

async function main() {
  console.log(`smoke-game against ${HTTP}\n`);

  const { token, wallet } = await signIn();
  console.log(`signed in as ${wallet}\n`);

  const entered = (await (
    await fetch(`${HTTP}/play/enter`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    })
  ).json()) as { room: string; reservation: unknown };

  const room = await new Client(WS).consumeSeatReservation(entered.reservation as never);
  const rejections: RejectedPayload[] = [];
  room.onMessage(MSG_REJECTED, (r: RejectedPayload) => rejections.push(r));

  let profile = await next<ProfilePayload>(room, MSG_PROFILE);
  console.log("-- sign-in --");
  check("profile arrives on join", profile.wallet === wallet);
  check("starts at Chef 1", profile.chefLevel === 1, `chef ${profile.chefLevel}`);
  check("starts with no coins", profile.coins === 0);
  check("starts with 16 carry slots", profile.carrySlots === 16, `${profile.carrySlots}`);
  check("Meadows is unlocked", profile.unlockedSections.includes(1));
  check("next goal is set", profile.nextGoal !== null, profile.nextGoal ?? "");

  // --- travel --------------------------------------------------------------
  console.log("\n-- travel --");
  const portal = HUB_PORTALS.find((p) => p.section === 1);
  const forestPortal = HUB_PORTALS.find((p) => p.section === 2);
  if (!portal || !forestPortal) throw new Error("missing portals in content");

  room.send(MSG_TRAVEL, { section: 1 });
  await sleep(300);
  check("travel refused away from the gate", rejections.some((r) => r.reason === "not_at_portal"));

  // A Chef 1 player standing at the Deep Forest gate should be told the level.
  const locked = findSection(2);
  await walkTo(room, { tileX: forestPortal.tileX, tileY: forestPortal.tileY });
  room.send(MSG_TRAVEL, { section: 2 });
  await sleep(300);
  check(
    "locked section names its Chef Level",
    rejections.some(
      (r) => r.reason === "locked" && r.message.includes(String(locked?.unlockChefLevel)),
    ),
  );

  await walkTo(room, { tileX: portal.tileX, tileY: portal.tileY });
  room.send(MSG_TRAVEL, { section: 1 });
  const nodes = await next<NodesPayload>(room, MSG_NODES);
  check("arrived in the Meadows", nodes.section === 1 && (await waitForSection(room, 1)));
  check("section has 12 nodes", nodes.nodes.length === 12, `${nodes.nodes.length}`);
  check("nodes start ready", nodes.nodes.every((n) => n.readyAt === 0));

  // --- gathering -----------------------------------------------------------
  console.log("\n-- gathering --");
  const meadows = findSection(1);
  if (!meadows) throw new Error("no meadows section");

  const sunwheatNodes = meadows.nodes.filter((n) => n.ingredient === "sunwheat");
  const saltNode = meadows.nodes.find((n) => n.ingredient === "rock_salt");
  if (sunwheatNodes.length === 0 || !saltNode) throw new Error("meadows is missing nodes");

  const before = rejections.length;
  const firstNode = sunwheatNodes[0]!;
  await walkTo(room, { tileX: firstNode.tileX, tileY: firstNode.tileY });

  room.send(MSG_GATHER, { nodeId: firstNode.id });
  const started = await next<{ durationMs: number }>(room, MSG_GATHER_STARTED);
  check("foraging takes 3s at level 1", started.durationMs === 3000, `${started.durationMs}ms`);

  // A second gather while the first is running must be refused outright.
  room.send(MSG_GATHER, { nodeId: firstNode.id });
  const gathered = await next<GatherResultPayload>(room, MSG_GATHER_RESULT);
  check("one action at a time", rejections.slice(before).some((r) => r.reason === "busy"));
  check("yielded 1-2 sunwheat", gathered.qty >= 1 && gathered.qty <= 2, `${gathered.qty}`);
  check("awarded 5-15 foraging XP", gathered.skillXp >= 5 && gathered.skillXp <= 15, `${gathered.skillXp}`);
  check("chef XP mirrors skill XP", gathered.chefXp === gathered.skillXp);
  check("node went on a 60s cooldown", Math.round((gathered.readyAt - Date.now()) / 1000) >= 55);

  profile = await next<ProfilePayload>(room, MSG_PROFILE);
  check("sunwheat is in the bag", profile.inventory.some((s) => s.id === "sunwheat"));

  room.send(MSG_GATHER, { nodeId: firstNode.id });
  await sleep(400);
  check("cooldown blocks a regather", rejections.some((r) => r.reason === "cooldown"));

  // Gather until we hold enough for a flatbread: sunwheat 2 + rock_salt 1.
  const held = () => {
    const p = profile;
    const find = (id: string) => p.inventory.find((s) => s.id === id)?.qty ?? 0;
    return { sunwheat: find("sunwheat"), rock_salt: find("rock_salt") };
  };

  for (const node of sunwheatNodes.slice(1)) {
    if (held().sunwheat >= 2) break;
    await walkTo(room, { tileX: node.tileX, tileY: node.tileY });
    room.send(MSG_GATHER, { nodeId: node.id });
    await next<GatherResultPayload>(room, MSG_GATHER_RESULT);
    profile = await next<ProfilePayload>(room, MSG_PROFILE);
  }

  await walkTo(room, { tileX: saltNode.tileX, tileY: saltNode.tileY });
  room.send(MSG_GATHER, { nodeId: saltNode.id });
  const salt = await next<GatherResultPayload>(room, MSG_GATHER_RESULT);
  check("prospecting awards prospecting XP", salt.skill === "prospecting");
  profile = await next<ProfilePayload>(room, MSG_PROFILE);

  const stock = held();
  check(
    "holding enough for a flatbread",
    stock.sunwheat >= 2 && stock.rock_salt >= 1,
    `sunwheat ${stock.sunwheat}, rock_salt ${stock.rock_salt}`,
  );

  const foraging = profile.skills.find((s) => s.id === "foraging");
  check("foraging XP accumulated", (foraging?.xp ?? 0) > 0, `${foraging?.xp ?? 0} xp`);
  check("chef XP accumulated", profile.chefXp > 0, `${profile.chefXp} xp`);

  // --- cooking -------------------------------------------------------------
  console.log("\n-- cooking --");
  const hubPortal = findSection(1)!.returnPortal;
  await walkTo(room, hubPortal);
  room.send(MSG_TRAVEL, { section: 0 });
  check("back in the hub", await waitForSection(room, 0));

  room.send(MSG_COOK_START, { recipeId: "meadow_flatbread" });
  const bar = await next<HeatBarPayload>(room, MSG_HEAT_BAR);
  check("heat bar runs for 3s", bar.durationMs === 3000, `${bar.durationMs}ms`);
  check("window is 12% at firecraft 1", Math.round(bar.windowPct) === 12, `${bar.windowPct.toFixed(1)}%`);
  check("server picked a start offset", bar.startOffset >= 0 && bar.startOffset <= 1);

  // Solve for the moment the marker sits dead centre of the window.
  const elapsedForCentre = solveForCentre(bar);
  await sleep(Math.max(elapsedForCentre, 0));
  room.send(MSG_COOK_STOP, { cookId: bar.cookId, elapsedMs: elapsedForCentre });

  const cooked = await next<CookResultPayload>(room, MSG_COOK_RESULT);
  check("a perfect stop is Superb", cooked.quality === "superb", cooked.quality);
  check("firecraft was paid", cooked.skillXp.some((x) => x.skill === "firecraft" && x.xp > 0));
  check("chef XP was paid", cooked.chefXp > 0, `${cooked.chefXp} xp`);

  profile = await next<ProfilePayload>(room, MSG_PROFILE);
  check("the dish is in the bag", profile.inventory.some((s) => s.kind === "dish"));
  check("ingredients were consumed", (profile.inventory.find((s) => s.id === "sunwheat")?.qty ?? 0) === stock.sunwheat - 2);
  check("codex recorded the recipe", profile.codex.some((c) => c.recipeId === "meadow_flatbread" && c.cooked));

  // --- economy -------------------------------------------------------------
  console.log("\n-- economy --");
  const dish = profile.inventory.find((s) => s.kind === "dish");
  if (!dish) throw new Error("no dish to sell");

  room.send(MSG_SELL, { stackKey: dish.key, qty: 1 });
  const sold = await next<SoldPayload>(room, MSG_SOLD);
  check("a Superb flatbread sells for 8", sold.coins === 8, `${sold.coins} coins`);
  check("coins went up", sold.totalCoins === sold.coins, `${sold.totalCoins}`);
  profile = await next<ProfilePayload>(room, MSG_PROFILE);

  room.send(MSG_BUY, { kind: "bag", tier: 1 });
  await sleep(300);
  check("cannot buy what you cannot afford", rejections.some((r) => r.reason === "too_poor"));

  console.log(`\n${failures === 0 ? "smoke-game: OK" : `smoke-game: ${failures} failure(s)`}`);
  await room.leave();
  process.exit(failures === 0 ? 0 : 1);
}

/**
 * The marker bounces between 0 and 1 at `speed` per ms. Walk it forward in
 * small steps and return the elapsed time closest to the window centre - the
 * same arithmetic the server uses in reverse.
 */
function solveForCentre(bar: HeatBarPayload): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let t = 0; t <= bar.durationMs; t += 1) {
    const travelled = bar.startOffset + bar.direction * bar.speed * t;
    const cycle = ((travelled % 2) + 2) % 2;
    const pos = cycle <= 1 ? cycle : 2 - cycle;
    const distance = Math.abs(pos - bar.windowCentre);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = t;
    }
  }
  return best;
}

main().catch((err) => {
  console.error(`\nsmoke-game failed: ${(err as Error).message}`);
  process.exit(1);
});
