/**
 * Headless end-to-end check of the cooking loop against a running server.
 *
 * Signs in a fresh wallet, walks to the Meadows, gathers, cooks Meadow
 * flatbread on the heat bar, sells one at the tavern and eats one for the buff -
 * asserting the server's own replies at every step, including the ones that
 * should be refused. This is the loop the brief describes, driven the way the
 * client drives it, with no browser involved.
 *
 *   npm run dev                      # in another terminal
 *   npx tsx scripts/smoke-game.ts
 */

import { Client, type Room } from "colyseus.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import {
  HUB_MAP,
  approachTo,
  areaNode,
  isWalkableOn,
  zoneById,
  MSG_ATE,
  MSG_BUY,
  MSG_COOK_PREP,
  MSG_COOK_PREPARED,
  MSG_COOK_RESULT,
  MSG_COOK_START,
  MSG_COOK_STOP,
  MSG_EAT,
  MSG_DEV,
  MSG_EQUIP,
  MSG_GATHER,
  MSG_GATHER_RESULT,
  MSG_GATHER_STARTED,
  MSG_GREET,
  MSG_GREETED,
  MSG_HEAT_BAR,
  MSG_MOVE,
  MSG_NODES,
  MSG_PROFILE,
  MSG_REJECTED,
  MSG_SELL,
  MSG_SOLD,
  MSG_UNLOCKED,
  MSG_TRAVEL,
  AMBIENCE,
  findSection,
  type AtePayload,
  type CookPreparedPayload,
  type CookResultPayload,
  type GatherResultPayload,
  type GatherStartedPayload,
  type GreetedPayload,
  type HeatBarPayload,
  type NodesPayload,
  type ProfilePayload,
  type RejectedPayload,
  type SoldPayload,
  type UnlockedPayload,
  type TilePos,
} from "@crazycauldron/shared";

const HTTP = process.env.SMOKE_HTTP_URL ?? "http://localhost:2567";
const WS = process.env.SMOKE_WS_URL ?? "ws://localhost:2567";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A queue per message type.
 *
 * colyseus.js keeps one handler per type, so registering a fresh listener for
 * each await would silently unhook the previous one. Everything lands in a
 * queue instead and `next()` takes from it - which also means a message that
 * arrives before its await is not lost.
 */
class Mailbox {
  private readonly queues = new Map<string, unknown[]>();
  private readonly waiters = new Map<string, ((value: unknown) => void)[]>();

  listen(room: Room, type: string) {
    room.onMessage(type, (payload: unknown) => {
      const waiting = this.waiters.get(type);
      if (waiting && waiting.length > 0) {
        waiting.shift()?.(payload);
        return;
      }
      const queue = this.queues.get(type) ?? [];
      queue.push(payload);
      this.queues.set(type, queue);
    });
  }

  next<T>(type: string, timeoutMs = 20000): Promise<T> {
    const queued = this.queues.get(type);
    if (queued && queued.length > 0) return Promise.resolve(queued.shift() as T);

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for "${type}"`)), timeoutMs);
      const waiting = this.waiters.get(type) ?? [];
      waiting.push((value) => {
        clearTimeout(timer);
        resolve(value as T);
      });
      this.waiters.set(type, waiting);
    });
  }

  /** Everything of a type received so far, without consuming it. */
  peekAll<T>(type: string): T[] {
    return [...((this.queues.get(type) ?? []) as T[])];
  }

  /** Takes one if it has already arrived, without waiting for one that has not. */
  tryNext<T>(type: string): T | undefined {
    return (this.queues.get(type) ?? []).shift() as T | undefined;
  }

  drain(type: string) {
    this.queues.set(type, []);
  }
}

const mail = new Mailbox();

/** The latest profile the server sent; every payout refreshes it. */
let profile: ProfilePayload;

async function takeProfile(): Promise<ProfilePayload> {
  profile = await mail.next<ProfilePayload>(MSG_PROFILE);
  return profile;
}

const rejections = () => mail.peekAll<RejectedPayload>(MSG_REJECTED);
const rejected = (reason: string) => rejections().some((r) => r.reason === reason);
const countOf = (id: string) => profile.inventory.find((stack) => stack.id === id)?.qty ?? 0;

async function signIn(): Promise<{ token: string; wallet: string }> {
  const kp = nacl.sign.keyPair();
  const address = bs58.encode(kp.publicKey);
  const nonce = (await (await fetch(`${HTTP}/auth/nonce?address=${address}`)).json()) as {
    message: string;
  };
  const signature = bs58.encode(
    nacl.sign.detached(new TextEncoder().encode(nonce.message), kp.secretKey),
  );
  return (await (
    await fetch(`${HTTP}/auth/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, message: nonce.message, signature }),
    })
  ).json()) as { token: string; wallet: string };
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

interface SelfView {
  tileX: number;
  tileY: number;
  section: number;
}

interface VillagerView {
  id: string;
  name: string;
  tileX: number;
  tileY: number;
}

interface VillagerMap {
  size: number;
  forEach(callback: (value: VillagerView, key: string) => void): void;
}

function villagers(room: Room): VillagerView[] {
  const state = room.state as { villagers?: VillagerMap };
  const out: VillagerView[] = [];
  state.villagers?.forEach((villager) => out.push({ ...villager }));
  return out;
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
async function walkTo(room: Room, target: TilePos, timeoutMs = 25000): Promise<void> {
  room.send(MSG_MOVE, target);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const me = self(room);
    if (me.tileX === target.tileX && me.tileY === target.tileY) return;
    await sleep(60);
  }
  throw new Error(`never reached ${target.tileX},${target.tileY}`);
}

interface NodeDef {
  id: string;
  ingredient: string;
}

/**
 * Gathers one node, tolerating a refusal.
 *
 * A node the caller already worked is still regrowing, and the server answers
 * that with a rejection rather than a result - so waiting only on the result
 * would hang. Returns null when the node refused.
 */
async function tryGather(room: Room, node: NodeDef): Promise<GatherResultPayload | null> {
  mail.drain(MSG_REJECTED);
  room.send(MSG_GATHER, { nodeId: node.id });

  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const result = mail.tryNext<GatherResultPayload>(MSG_GATHER_RESULT);
    if (result) {
      await takeProfile();
      return result;
    }
    if (rejections().length > 0) {
      mail.drain(MSG_REJECTED);
      return null;
    }
    await sleep(50);
  }
  throw new Error(`gather on ${node.id} neither completed nor was refused`);
}

/**
 * Gathers from every node of one ingredient until `want` are held, waiting out
 * per-player cooldowns rather than giving up short.
 *
 * `known` seeds cooldowns the caller has already caused, so the first pass does
 * not waste a walk on a node it just emptied.
 */
async function stockUp(
  room: Room,
  mapId: number,
  nodes: NodeDef[],
  ingredientId: string,
  want: number,
  known: Map<string, number> = new Map(),
) {
  const matching = nodes.filter((n) => n.ingredient === ingredientId);
  if (matching.length === 0) throw new Error(`no ${ingredientId} nodes`);

  const cooldowns = new Map(known);
  const COMMON_RESPAWN_MS = 60000;
  let guard = 0;

  while (countOf(ingredientId) < want && guard < 20) {
    guard += 1;
    let gatheredSomething = false;

    for (const node of matching) {
      if (countOf(ingredientId) >= want) break;
      if (Date.now() < (cooldowns.get(node.id) ?? 0)) continue;

      const beside = besideNode(mapId, node.id);
      if (!beside) throw new Error(`nowhere to stand beside ${node.id}`);
      await walkTo(room, beside);
      const result = await tryGather(room, node);
      if (result) {
        cooldowns.set(node.id, result.readyAt);
        gatheredSomething = true;
      } else {
        cooldowns.set(node.id, Date.now() + COMMON_RESPAWN_MS);
      }
    }

    if (countOf(ingredientId) >= want) return;
    if (!gatheredSomething) {
      const soonest = Math.min(...cooldowns.values());
      const wait = Math.max(soonest - Date.now() + 250, 500);
      console.log(`       (waiting ${Math.ceil(wait / 1000)}s for ${ingredientId} to regrow)`);
      await sleep(wait);
    }
  }
}

/**
 * The marker bounces between 0 and 1 at `speed` per ms. Walk it forward and
 * return the elapsed time closest to the window centre - the same arithmetic
 * the server runs in reverse.
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

/** Runs a whole cook: start, prep, stop dead centre, collect the result. */
async function cookOnce(room: Room, recipeId: string): Promise<CookResultPayload> {
  room.send(MSG_COOK_START, { recipeId });
  const prep = await mail.next<CookPreparedPayload>(MSG_COOK_PREPARED);
  if (!prep.autoPrep) {
    await sleep(prep.prepMs);
    room.send(MSG_COOK_PREP, { cookId: prep.cookId });
  }
  const bar = await mail.next<HeatBarPayload>(MSG_HEAT_BAR);
  const elapsed = solveForCentre(bar);
  await sleep(elapsed);
  room.send(MSG_COOK_STOP, { cookId: bar.cookId, elapsedMs: elapsed });

  const result = await mail.next<CookResultPayload>(MSG_COOK_RESULT);
  await takeProfile();
  return result;
}

/** The cell to stand on to use one of the hub's counters. */
const station = (id: string, from: TilePos): TilePos => {
  const at = approachZone(HUB_MAP, id, from);
  if (!at) throw new Error(`nowhere to stand at the ${id}`);
  return at;
};

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
  for (const type of [
    MSG_PROFILE,
    MSG_NODES,
    MSG_REJECTED,
    MSG_GATHER_STARTED,
  MSG_GREET,
  MSG_GREETED,
    MSG_GATHER_RESULT,
    MSG_COOK_PREPARED,
    MSG_HEAT_BAR,
    MSG_COOK_RESULT,
    MSG_SOLD,
  MSG_UNLOCKED,
    MSG_ATE,
    MSG_GREETED,
  ]) {
    mail.listen(room, type);
  }

  // --- sign-in -------------------------------------------------------------
  await takeProfile();
  console.log("-- sign-in --");
  check("profile arrives on join", profile.wallet === wallet);
  check("starts at Chef 1", profile.chefLevel === 1, `chef ${profile.chefLevel}`);
  check("starts with no coins", profile.coins === 0);
  check("starts with 16 carry slots", profile.carrySlots === 16, `${profile.carrySlots}`);
  check("Meadows is unlocked", profile.unlockedSections.includes(1));
  check("starts wearing the wool cloak", profile.cloakId === "cloak_01_wool", profile.cloakId);
  check("starts bare-headed", profile.hatId === "");
  check("wardrobe lists every item", profile.wardrobe.length === 16, `${profile.wardrobe.length}`);
  check(
    "locked items explain themselves",
    profile.wardrobe.find((w) => w.id === "hat_02_straw")?.requirement.includes("foraging") ?? false,
    profile.wardrobe.find((w) => w.id === "hat_02_straw")?.requirement ?? "",
  );
  check("next goal is set", profile.nextGoal !== null, profile.nextGoal ?? "");
  check(
    "meadow flatbread is cookable from level 1",
    profile.recipes.find((r) => r.recipeId === "meadow_flatbread")?.reasons.every(
      (reason) => reason.startsWith("Needs 2 Sunwheat") || reason.startsWith("Needs 1 Rock salt"),
    ) ?? false,
    "only missing ingredients block it",
  );

  // --- travel --------------------------------------------------------------
  console.log("\n-- travel --");
  const portal = zoneById(HUB_MAP, "portal_1");
  const forestPortal = zoneById(HUB_MAP, "portal_2");
  if (!portal || !forestPortal) throw new Error("missing portals in content");

  room.send(MSG_TRAVEL, { section: 1 });
  await sleep(300);
  check("travel refused away from the gate", rejected("not_at_portal"));

  const locked = findSection(2);
  await walkTo(room, approachZone(HUB_MAP, "portal_2", self(room))!);
  room.send(MSG_TRAVEL, { section: 2 });
  await sleep(300);
  check(
    "locked section names its Chef Level",
    rejections().some(
      (r) => r.reason === "locked" && r.message.includes(String(locked?.unlockChefLevel)),
    ),
  );

  await walkTo(room, approachZone(HUB_MAP, "portal_1", self(room))!);
  room.send(MSG_TRAVEL, { section: 1 });
  const nodes = await mail.next<NodesPayload>(MSG_NODES);
  check("arrived in the Meadows", nodes.section === 1 && (await waitForSection(room, 1)));
  check("section has 12 nodes", nodes.nodes.length === 12, `${nodes.nodes.length}`);
  check("nodes start ready", nodes.nodes.every((n) => n.readyAt === 0));

  // --- gathering -----------------------------------------------------------
  console.log("\n-- gathering --");
  const meadows = findSection(1);
  if (!meadows) throw new Error("no meadows section");

  const sunwheatNodes = meadows.nodes.filter((n) => n.ingredient === "sunwheat");
  const saltNode = meadows.nodes.find((n) => n.ingredient === "rock_salt");
  const firstNode = sunwheatNodes[0];
  if (!firstNode || !saltNode) throw new Error("meadows is missing nodes");

  mail.drain(MSG_REJECTED);
  await walkTo(room, besideNode(1, firstNode.id)!);

  room.send(MSG_GATHER, { nodeId: firstNode.id });
  const started = await mail.next<GatherStartedPayload>(MSG_GATHER_STARTED);
  check("foraging takes 3s at level 1", started.durationMs === 3000, `${started.durationMs}ms`);

  // A second gather while the first is running must be refused outright.
  room.send(MSG_GATHER, { nodeId: firstNode.id });
  const gathered = await mail.next<GatherResultPayload>(MSG_GATHER_RESULT);
  check("one action at a time", rejected("busy"));
  check("yielded 1-2 sunwheat", gathered.qty >= 1 && gathered.qty <= 2, `${gathered.qty}`);
  check(
    "awarded 5-15 foraging XP",
    gathered.skillXp >= 5 && gathered.skillXp <= 15,
    `${gathered.skillXp}`,
  );
  check("chef XP mirrors skill XP", gathered.chefXp === gathered.skillXp);
  check("node went on a 60s cooldown", Math.round((gathered.readyAt - Date.now()) / 1000) >= 55);

  await takeProfile();
  check("sunwheat is in the bag", countOf("sunwheat") > 0);

  room.send(MSG_GATHER, { nodeId: firstNode.id });
  await sleep(400);
  check("cooldown blocks a regather", rejected("cooldown"));

  await walkTo(room, besideNode(1, saltNode.id)!);
  room.send(MSG_GATHER, { nodeId: saltNode.id });
  const salt = await mail.next<GatherResultPayload>(MSG_GATHER_RESULT);
  check("prospecting awards prospecting XP", salt.skill === "prospecting");
  await takeProfile();

  // Two flatbreads worth: one for the tavern, one to eat. Both nodes worked
  // above are still regrowing, so seed their timers rather than rediscover them.
  await stockUp(room, 1, meadows.nodes, "sunwheat", 4, new Map([[firstNode.id, gathered.readyAt]]));
  await stockUp(room, 1, meadows.nodes, "rock_salt", 2, new Map([[saltNode.id, salt.readyAt]]));
  check(
    "holding enough for two flatbreads",
    countOf("sunwheat") >= 4 && countOf("rock_salt") >= 2,
    `sunwheat ${countOf("sunwheat")}, rock_salt ${countOf("rock_salt")}`,
  );

  const foraging = profile.skills.find((s) => s.id === "foraging");
  check("foraging XP accumulated", (foraging?.xp ?? 0) > 0, `${foraging?.xp ?? 0} xp`);
  check("chef XP accumulated", profile.chefXp > 0, `${profile.chefXp} xp`);

  // --- cooking -------------------------------------------------------------
  console.log("\n-- cooking --");
  const wayOut = approachZone(meadows.index, "portal_hub", self(room));
  if (!wayOut) throw new Error("no way out of the Meadows");
  await walkTo(room, wayOut);
  room.send(MSG_TRAVEL, { section: 0 });
  check("back in the hub", await waitForSection(room, 0));

  mail.drain(MSG_REJECTED);
  room.send(MSG_COOK_START, { recipeId: "meadow_flatbread" });
  await sleep(300);
  check("cooking is refused away from the kitchen", rejected("not_at_kitchen"));

  await walkTo(room, station("kitchen", self(room)));

  // A click whose reported time is nowhere near the server measurement is
  // thrown away, and nothing is consumed by the attempt.
  const sunwheatBefore = countOf("sunwheat");
  room.send(MSG_COOK_START, { recipeId: "meadow_flatbread" });
  const fakePrep = await mail.next<CookPreparedPayload>(MSG_COOK_PREPARED);
  check("prep is required at knifework 1", !fakePrep.autoPrep && fakePrep.prepMs === 1500);
  await sleep(fakePrep.prepMs);
  room.send(MSG_COOK_PREP, { cookId: fakePrep.cookId });

  const fakeBar = await mail.next<HeatBarPayload>(MSG_HEAT_BAR);
  check("heat bar runs for 3s", fakeBar.durationMs === 3000, `${fakeBar.durationMs}ms`);
  // Retuned in Block 3.5: a 3.3% Superb window at Firecraft 1 gives about 15%
  // Superbs for a 60ms player, instead of the 54% the old 12% window gave.
  check(
    "window is 3.3% at firecraft 1",
    Math.abs(fakeBar.windowPct - 3.3) < 0.05,
    `${fakeBar.windowPct.toFixed(2)}%`,
  );
  check(
    "the Fine band is 3.95x the Superb one",
    Math.abs(fakeBar.fineWindowPct / fakeBar.windowPct - 3.95) < 0.01,
    `${(fakeBar.fineWindowPct / fakeBar.windowPct).toFixed(2)}x`,
  );

  room.send(MSG_COOK_STOP, { cookId: fakeBar.cookId, elapsedMs: fakeBar.durationMs });
  await sleep(500);
  check("a click out of step with the server is refused", rejected("implausible_latency"));
  check("a refused click consumes nothing", countOf("sunwheat") === sunwheatBefore);

  const cooked = await cookOnce(room, "meadow_flatbread");
  const landedInWindow = Math.abs(cooked.markerPos - cooked.windowCentre) <= fakeBar.windowPct / 200;
  check(
    "the marker stopped inside the window",
    landedInWindow,
    `marker ${cooked.markerPos.toFixed(3)} vs centre ${cooked.windowCentre.toFixed(3)}`,
  );

  // Knifework no longer caps the result: a perfect stop at Firecraft 1 plates
  // a Superb dish. This is the play-test bug from Block 3 - the cap used to
  // force Common here no matter how well the bar was played.
  check("a perfect stop at Firecraft 1 is Superb", cooked.quality === "superb", cooked.quality);
  check("firecraft was paid", cooked.skillXp.some((x) => x.skill === "firecraft" && x.xp > 0));
  // 10 to firecraft, plus the quarter-share base to knifework and spicecraft
  // that keeps those two skills from being pinned at level 1 forever.
  // Superb doubles each award before rounding: firecraft 10x1x2 = 20, and the
  // two quarter-shares 10x0.25x2 = 5 each.
  check("a Superb flatbread pays 30 chef XP", cooked.chefXp === 30, `${cooked.chefXp}`);
  check(
    "knifework and spicecraft both earn from every cook",
    cooked.skillXp.some((x) => x.skill === "knifework" && x.xp > 0) &&
      cooked.skillXp.some((x) => x.skill === "spicecraft" && x.xp > 0),
  );
  check("ingredients were consumed", countOf("sunwheat") === sunwheatBefore - 2);
  check("the dish is in the bag", profile.inventory.some((s) => s.kind === "dish"));
  check(
    "codex recorded the recipe",
    profile.codex.some((c) => c.recipeId === "meadow_flatbread" && c.cooked),
  );

  // --- wardrobe ------------------------------------------------------------
  console.log("\n-- wardrobe --");

  // Cooking that Superb flatbread satisfies "cook any dish at Fine or better".
  const unlocked = await mail.next<UnlockedPayload>(MSG_UNLOCKED, 5000).catch(() => null);
  check(
    "a Fine-or-better cook grants the chef toque",
    unlocked?.items.some((i) => i.id === "hat_01_chef") ?? false,
    unlocked ? unlocked.items.map((i) => i.id).join(", ") : "no unlock message",
  );

  // cookOnce already consumed the profile that followed the unlock, so the
  // current one is up to date - asking for another would just block.
  check(
    "the toque shows as unlocked but not worn",
    profile.wardrobe.find((w) => w.id === "hat_01_chef")?.unlocked === true &&
      profile.hatId === "",
  );

  mail.drain(MSG_REJECTED);
  room.send(MSG_EQUIP, { kind: "hat", itemId: "hat_01_chef" });
  await takeProfile();
  check("equipping it sticks", profile.hatId === "hat_01_chef", profile.hatId);
  check(
    "and it reads as worn",
    profile.wardrobe.find((w) => w.id === "hat_01_chef")?.equipped === true,
  );

  room.send(MSG_EQUIP, { kind: "hat", itemId: "hat_05_circlet" });
  await sleep(300);
  check("an unearned item is refused", rejected("locked"));

  // TEST_BYPASS_HOLD leaves the balance at 0, so no tier is backed.
  room.send(MSG_EQUIP, { kind: "hat", itemId: "hat_08_bronze" });
  await sleep(300);
  check("a tier item is refused without the balance", rejected("tier_required"));
  check("no tier with a zero balance", profile.tier === null, String(profile.tier));

  const bronze = profile.wardrobe.find((w) => w.id === "hat_08_bronze");
  check("tier items carry their badge", bronze?.tier === "bronze", bronze?.tier ?? "none");
  check(
    "and say what the balance must be",
    bronze?.requirement.includes("5,000") ?? false,
    bronze?.requirement ?? "",
  );

  room.send(MSG_EQUIP, { kind: "hat", itemId: "" });
  await takeProfile();
  check("a hat can be taken off again", profile.hatId === "");

  // --- economy -------------------------------------------------------------
  console.log("\n-- economy --");
  const dish = profile.inventory.find((entry) => entry.kind === "dish");
  if (!dish) throw new Error("no dish to sell");

  mail.drain(MSG_REJECTED);
  room.send(MSG_SELL, { stackKey: dish.key, qty: 1 });
  await sleep(300);
  check("selling is refused away from the tavern", rejected("not_at_tavern"));

  await walkTo(room, station("tavern", self(room)));
  room.send(MSG_SELL, { stackKey: dish.key, qty: 1 });
  const sold = await mail.next<SoldPayload>(MSG_SOLD);
  // 5 base x 2.4 for Superb, retuned in Block 3.5 from 1.6.
  check("a Superb flatbread sells for 12", sold.coins === 12, `${sold.coins} coins`);
  check("coins went up", sold.totalCoins === 12, `${sold.totalCoins}`);
  await takeProfile();

  mail.drain(MSG_REJECTED);
  room.send(MSG_BUY, { kind: "bag", tier: 1 });
  await sleep(300);
  check("buying is refused away from the outfitter", rejected("not_at_outfitter"));

  await walkTo(room, station("outfitter", self(room)));
  room.send(MSG_BUY, { kind: "bag", tier: 1 });
  await sleep(300);
  check("cannot buy what you cannot afford", rejected("too_poor"));

  room.send(MSG_BUY, { kind: "bag", tier: 3 });
  await sleep(300);
  check("tiers cannot be skipped", rejected("skipped_tier"));

  // --- buff ----------------------------------------------------------------
  console.log("\n-- buff --");
  await walkTo(room, station("kitchen", self(room)));
  await cookOnce(room, "meadow_flatbread");

  const spare = profile.inventory.find((entry) => entry.kind === "dish");
  if (!spare) throw new Error("no dish to eat");

  room.send(MSG_EAT, { stackKey: spare.key });
  const ate = await mail.next<AtePayload>(MSG_ATE);
  check("eating grants +10% gather speed", ate.gatherSpeedPct === 10, `${ate.gatherSpeedPct}%`);
  const buffSeconds = Math.round((ate.buffExpiresAt - Date.now()) / 1000);
  check("the buff runs for 5 minutes", buffSeconds >= 295 && buffSeconds <= 300, `${buffSeconds}s`);
  await takeProfile();
  check("the buff is on the profile", profile.buffExpiresAt > Date.now());

  // --- dev command ---------------------------------------------------------
  console.log("\n-- dev command --");
  mail.drain(MSG_REJECTED);
  room.send(MSG_DEV, { command: "level", value: 20 });
  await takeProfile();
  check("dev level sets the Chef track", profile.chefLevel === 20, `chef ${profile.chefLevel}`);
  check(
    "and every skill",
    profile.skills.every((s) => s.level === 20),
    profile.skills.map((s) => `${s.id} ${s.level}`).join(", "),
  );
  check(
    "which unlocks the later sections",
    profile.unlockedSections.includes(2) && profile.unlockedSections.includes(3),
    profile.unlockedSections.join(","),
  );
  check(
    "and grants the level-gated wardrobe items",
    profile.wardrobe.find((w) => w.id === "hat_05_circlet")?.unlocked === true,
  );

  room.send(MSG_DEV, { command: "nonsense" });
  await sleep(300);
  check("an unknown dev command is refused", rejected("unknown_command"));

  // --- villagers -----------------------------------------------------------
  console.log(`
-- villagers --`);
  const crowd = villagers(room);
  const settings = AMBIENCE.villagers;
  check(
    `the hub is populated`,
    crowd.length >= settings.min && crowd.length <= settings.max,
    `${crowd.length} villagers (want ${settings.min}-${settings.max})`,
  );
  check(
    "each is one of the authored residents",
    crowd.every((v) => settings.roster.some((def) => def.id === v.id && def.name === v.name)),
    crowd.map((v) => v.name).join(", "),
  );
  check(
    "no two share an id",
    new Set(crowd.map((v) => v.id)).size === crowd.length,
  );
  check(
    "none of them is in the room count",
    typeof (room.state as { players: { size: number } }).players.size === "number" &&
      (room.state as { players: { size: number } }).players.size === 1,
  );

  // They stroll on their own clock, so a few seconds is enough to see one move.
  const before = crowd.map((v) => `${v.id}:${v.tileX},${v.tileY}`).join("|");
  await sleep(6000);
  const after = villagers(room)
    .map((v) => `${v.id}:${v.tileX},${v.tileY}`)
    .join("|");
  check("they wander on their own", before !== after);

  const subject = crowd[0];
  if (subject) {
    room.send(MSG_GREET, { villagerId: subject.id });
    const greeted = await mail.next<GreetedPayload>(MSG_GREETED);
    const lines = settings.roster.find((def) => def.id === subject.id)?.lines ?? [];
    check("greeting one answers", greeted.villagerId === subject.id, greeted.line);
    check("with a line from the roster", lines.includes(greeted.line));
  }

  mail.drain(MSG_GREETED);
  room.send(MSG_GREET, { villagerId: "nobody_here" });
  await sleep(300);
  check("greeting nobody says nothing", mail.peekAll(MSG_GREETED).length === 0);

  // --- leaderboard ---------------------------------------------------------
  console.log("\n-- leaderboard --");
  const board = (await (await fetch(`${HTTP}/play/leaderboard`)).json()) as {
    rows: { wallet: string; chefLevel: number; chefXp: number }[];
  };
  check("leaderboard responds", Array.isArray(board.rows), `${board.rows.length} rows`);
  check(
    "this chef is on it",
    board.rows.some((r) => r.wallet === wallet),
  );
  check(
    "it is ordered by chef XP",
    board.rows.every((r, i) => i === 0 || (board.rows[i - 1]?.chefXp ?? 0) >= r.chefXp),
  );

  console.log(`\n${failures === 0 ? "smoke-game: OK" : `smoke-game: ${failures} failure(s)`}`);
  await room.leave();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\nsmoke-game failed: ${(err as Error).message}`);
  process.exit(1);
});
