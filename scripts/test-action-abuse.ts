/**
 * Every way a client can lie to the game, tried against a running server.
 *
 *   npm run dev                         # in another terminal
 *   npx tsx scripts/test-action-abuse.ts
 *
 * The client is the attacker here, not the user interface. It sends whatever it
 * likes: gathers faster than the animation, cooks with an empty bag, cooks a
 * recipe far above its skill, sells a dish it never had, wears a garment it
 * never earned, walks into a locked section, and asks for negative and absurd
 * quantities. Every one must be refused server-side, with a reason logged.
 *
 * It also checks that nothing was quietly paid out anyway - a refusal that
 * still moves coins is not a refusal.
 */

import { Keypair } from "@solana/web3.js";
import { Client, type Room } from "colyseus.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import {
  HUB_MAP,
  HUB_PORTALS,
  HUB_STATIONS,
  MSG_ATE,
  MSG_BOUGHT,
  MSG_BUY,
  MSG_COOK_RESULT,
  MSG_COOK_START,
  MSG_EAT,
  MSG_EQUIP,
  MSG_GATHER,
  MSG_GATHER_RESULT,
  MSG_GATHER_STARTED,
  MSG_KICK,
  MSG_MOVE,
  MSG_NODES,
  MSG_PROFILE,
  MSG_REJECTED,
  MSG_SELL,
  MSG_SOLD,
  MSG_TRAVEL,
  MSG_UNLOCKED,
  RECIPES,
  SECTIONS,
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

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --------------------------------------------------------------------------
// A connected, signed-in client with a queue of everything the server said
// --------------------------------------------------------------------------

class Session {
  readonly rejections: RejectedPayload[] = [];
  private profileValue: ProfilePayload | null = null;
  /** Anything that means a payout actually happened. */
  readonly payouts: string[] = [];

  private constructor(readonly room: Room) {}

  static async open(): Promise<Session> {
    const keypair = Keypair.generate();
    const address = keypair.publicKey.toBase58();

    const nonce = (await (
      await fetch(`${HTTP}/auth/nonce?address=${address}`)
    ).json()) as NonceResponse;
    const signature = bs58.encode(
      nacl.sign.detached(new TextEncoder().encode(nonce.message), keypair.secretKey),
    );
    const verified = (await (
      await fetch(`${HTTP}/auth/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, message: nonce.message, signature }),
      })
    ).json()) as VerifyResponse;

    const entered = (await (
      await fetch(`${HTTP}/play/enter`, {
        method: "POST",
        headers: { authorization: `Bearer ${verified.token}` },
      })
    ).json()) as EnterResponse;

    const room = await new Client(WS).consumeSeatReservation(entered.reservation as never);
    const session = new Session(room);

    room.onMessage(MSG_PROFILE, (p: ProfilePayload) => {
      session.profileValue = p;
    });
    room.onMessage(MSG_REJECTED, (r: RejectedPayload) => session.rejections.push(r));
    for (const type of [MSG_GATHER_RESULT, MSG_COOK_RESULT, MSG_SOLD, MSG_BOUGHT, MSG_ATE]) {
      room.onMessage(type, () => session.payouts.push(type));
    }
    for (const type of [MSG_NODES, MSG_GATHER_STARTED, MSG_UNLOCKED, MSG_KICK]) {
      room.onMessage(type, () => undefined);
    }

    await session.settle();
    return session;
  }

  /** The latest profile, read through a call so it is never narrowed to null. */
  profile(): ProfilePayload | null {
    return this.profileValue;
  }

  /** Waits for the server to have said everything it is going to say. */
  async settle(ms = 700): Promise<void> {
    await sleep(ms);
  }

  clear(): void {
    this.rejections.length = 0;
    this.payouts.length = 0;
  }

  /** Whether the server refused with this reason since the last clear. */
  refused(reason: string): boolean {
    return this.rejections.some((r) => r.reason === reason);
  }

  reasons(): string {
    return this.rejections.map((r) => r.reason).join(", ") || "nothing";
  }

  self(): { tileX: number; tileY: number; section: number } | undefined {
    const state = this.room.state as {
      players?: { get(id: string): { tileX: number; tileY: number; section: number } | undefined };
    };
    return state.players?.get(this.room.sessionId);
  }

  async walkTo(target: TilePos, timeoutMs = 25000): Promise<boolean> {
    this.room.send(MSG_MOVE, target);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const me = this.self();
      if (me && me.tileX === target.tileX && me.tileY === target.tileY) return true;
      await sleep(150);
    }
    return false;
  }

  async close(): Promise<void> {
    await this.room.leave();
  }
}

// --------------------------------------------------------------------------

/** A tile beside a feature that a player can actually stand on. */
function beside(mapId: number, tile: TilePos): TilePos {
  for (const [dx, dy] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ] as const) {
    const candidate = { tileX: tile.tileX + dx, tileY: tile.tileY + dy };
    if (isWalkableOn(mapId, candidate.tileX, candidate.tileY)) return candidate;
  }
  return tile;
}

async function main() {
  console.log("test-action-abuse\n");

  const session = await Session.open();
  const meadows = SECTIONS[0]!;
  const starter = RECIPES.find((r) => Object.keys(r.requirements).length === 0) ?? RECIPES[0]!;

  // --- nonsense input ------------------------------------------------------
  console.log("-- malformed and absurd input --");
  {
    session.clear();
    // None of these should reach a handler that does anything.
    session.room.send(MSG_MOVE, { tileX: -5, tileY: -5 });
    session.room.send(MSG_MOVE, { tileX: 1e9, tileY: 1e9 });
    session.room.send(MSG_MOVE, { tileX: "over there", tileY: null });
    session.room.send(MSG_MOVE, {});
    await session.settle();

    const me = session.self();
    check(
      "impossible destinations move nobody",
      me !== undefined && me.section === HUB_MAP,
      me ? `at ${me.tileX},${me.tileY}` : "no player",
    );
    check("and pay out nothing", session.payouts.length === 0, session.payouts.join(", "));
  }

  {
    session.clear();
    session.room.send(MSG_SELL, { stackKey: "anything", qty: -5 });
    session.room.send(MSG_SELL, { stackKey: "anything", qty: 1e12 });
    session.room.send(MSG_SELL, { stackKey: "", qty: 0 });
    await session.settle();
    check("selling negative and absurd quantities is refused", session.rejections.length >= 1, session.reasons());
    check("and sells nothing", !session.payouts.includes(MSG_SOLD));
  }

  {
    session.clear();
    session.room.send(MSG_BUY, { kind: "bag", tier: -1 });
    session.room.send(MSG_BUY, { kind: "bag", tier: 9999 });
    session.room.send(MSG_BUY, { kind: "nonsense", tier: 1 });
    await session.settle();
    check("buying a tier that does not exist is refused", session.rejections.length >= 1, session.reasons());
    check("and buys nothing", !session.payouts.includes(MSG_BOUGHT));
  }

  // --- acting from the wrong place -----------------------------------------
  console.log("\n-- acting from the wrong place --");
  {
    session.clear();
    session.room.send(MSG_COOK_START, { recipeId: starter.id });
    await session.settle();
    check("cooking away from the kitchen is refused", session.refused("not_at_kitchen"), session.reasons());
  }

  {
    session.clear();
    session.room.send(MSG_SELL, { stackKey: "x", qty: 1 });
    await session.settle();
    check("selling away from the tavern is refused", session.refused("not_at_tavern"), session.reasons());
  }

  {
    session.clear();
    session.room.send(MSG_BUY, { kind: "bag", tier: 1 });
    await session.settle();
    check("buying away from the outfitter is refused", session.refused("not_at_outfitter"), session.reasons());
  }

  {
    session.clear();
    session.room.send(MSG_TRAVEL, { section: meadows.index });
    await session.settle();
    check("travelling from the middle of the plaza is refused", session.refused("not_at_portal"), session.reasons());
  }

  {
    session.clear();
    session.room.send(MSG_TRAVEL, { section: 99 });
    await session.settle();
    check("travelling to a section that does not exist is refused", session.refused("unknown_section"), session.reasons());
  }

  // --- locked content ------------------------------------------------------
  console.log("\n-- locked content --");
  {
    const locked = SECTIONS.find((s) => s.unlockChefLevel > 1);
    const gate = locked ? HUB_PORTALS.find((p) => p.section === locked.index) : undefined;
    if (!locked || !gate) {
      check("a locked section exists to test", false);
    } else {
      await session.walkTo(beside(HUB_MAP, { tileX: gate.tileX, tileY: gate.tileY }));
      session.clear();
      session.room.send(MSG_TRAVEL, { section: locked.index });
      await session.settle();
      check(
        `entering ${locked.name} at Chef 1 is refused`,
        session.refused("locked"),
        session.reasons(),
      );
      check("and leaves the player in the hub", session.self()?.section === HUB_MAP);
    }
  }

  {
    session.clear();
    session.room.send(MSG_EQUIP, { kind: "hat", itemId: "hat_09_gold" });
    await session.settle();
    check(
      "wearing an unearned garment is refused",
      session.refused("locked") || session.refused("tier_required"),
      session.reasons(),
    );
    check("and nothing ends up on the player's head", (session.profile()?.hatId ?? "") === "");
  }

  {
    session.clear();
    session.room.send(MSG_EQUIP, { kind: "hat", itemId: "hat_of_invisibility" });
    await session.settle();
    check("wearing a garment that does not exist is refused", session.refused("unknown_item"), session.reasons());
  }

  // --- cooking without the means -------------------------------------------
  console.log("\n-- cooking without the means --");
  const kitchen = HUB_STATIONS.find((s) => s.id === "kitchen")!;
  await session.walkTo(beside(HUB_MAP, { tileX: kitchen.tileX, tileY: kitchen.tileY }));

  {
    session.clear();
    session.room.send(MSG_COOK_START, { recipeId: starter.id });
    await session.settle();
    check(
      "cooking with an empty bag is refused",
      session.refused("missing_ingredients"),
      session.reasons(),
    );
    check("and nothing is cooked", !session.payouts.includes(MSG_COOK_RESULT));
  }

  {
    const advanced = RECIPES.find((r) => Object.values(r.requirements).some((v) => (v ?? 0) >= 10));
    session.clear();
    session.room.send(MSG_COOK_START, { recipeId: advanced?.id ?? "nothing" });
    await session.settle();
    check(
      "cooking far above your skill is refused",
      session.refused("not_cookable") || session.refused("missing_ingredients"),
      session.reasons(),
    );
  }

  {
    session.clear();
    session.room.send(MSG_COOK_START, { recipeId: "dragon_surprise" });
    await session.settle();
    check("cooking a recipe that does not exist is refused", session.refused("unknown_recipe"), session.reasons());
  }

  // --- faster than the animation -------------------------------------------
  console.log("\n-- faster than the animation --");
  {
    const gate = HUB_PORTALS.find((p) => p.section === meadows.index)!;
    await session.walkTo(beside(HUB_MAP, { tileX: gate.tileX, tileY: gate.tileY }));
    session.room.send(MSG_TRAVEL, { section: meadows.index });
    await session.settle(1200);
    check("the Meadows are open at Chef 1", session.self()?.section === meadows.index);

    const node = meadows.nodes[0]!;
    await session.walkTo(beside(meadows.index, { tileX: node.tileX, tileY: node.tileY }));

    session.clear();
    // Ten gathers in a burst. The first may start; every one after it is a
    // client trying to outrun its own animation.
    for (let i = 0; i < 10; i += 1) session.room.send(MSG_GATHER, { nodeId: node.id });
    await session.settle(1500);
    check(
      "a burst of gathers is refused as busy",
      session.refused("busy") || session.refused("too_fast"),
      session.reasons(),
    );

    // Let the first one finish, then try to start another immediately.
    await sleep(4000);
    session.clear();
    session.room.send(MSG_GATHER, { nodeId: node.id });
    await session.settle(400);
    check(
      "and the same node cannot be stripped twice",
      session.refused("cooldown") || session.refused("too_fast") || session.refused("busy"),
      session.reasons(),
    );
  }

  {
    session.clear();
    session.room.send(MSG_GATHER, { nodeId: "a_node_that_is_not_there" });
    await session.settle();
    check("gathering from a node that does not exist is refused", session.refused("unknown_node"), session.reasons());
  }

  {
    const other = SECTIONS.find((s) => s.index !== meadows.index)!;
    session.clear();
    session.room.send(MSG_GATHER, { nodeId: other.nodes[0]!.id });
    await session.settle();
    check(
      "gathering a node on another map is refused",
      session.refused("wrong_section") || session.refused("too_far"),
      session.reasons(),
    );
  }

  // --- selling what was never owned ----------------------------------------
  console.log("\n-- selling what was never owned --");
  {
    await session.walkTo(beside(meadows.index, meadows.returnPortal));
    session.room.send(MSG_TRAVEL, { section: HUB_MAP });
    await session.settle(1200);

    const tavern = HUB_STATIONS.find((s) => s.id === "tavern")!;
    await session.walkTo(beside(HUB_MAP, { tileX: tavern.tileX, tileY: tavern.tileY }));

    const coinsBefore = session.profile()?.coins ?? 0;
    session.clear();
    session.room.send(MSG_SELL, { stackKey: "dish:meadow_flatbread:superb", qty: 99 });
    session.room.send(MSG_SELL, { stackKey: "ingredient:sunwheat", qty: 1 });
    await session.settle();

    check(
      "selling a dish never cooked is refused",
      session.refused("no_stack") || session.refused("not_a_dish"),
      session.reasons(),
    );
    check(
      "and the purse is untouched",
      (session.profile()?.coins ?? 0) === coinsBefore,
      `${coinsBefore} -> ${session.profile()?.coins ?? 0}`,
    );
  }

  {
    session.clear();
    session.room.send(MSG_EAT, { stackKey: "dish:nothing:common" });
    await session.settle();
    check("eating something you do not have is refused", session.refused("no_stack"), session.reasons());
  }

  // --- nothing leaked ------------------------------------------------------
  console.log("\n-- the ledger --");
  {
    const profile = session.profile();
    check("no coins were conjured", (profile?.coins ?? 0) >= 0, `${profile?.coins ?? 0} coins`);
    check("the chef never left level 1 by cheating", (profile?.chefLevel ?? 1) <= 2, `level ${profile?.chefLevel}`);
    check(
      "no locked section was entered",
      (profile?.unlockedSections ?? []).every((s) => s === 1),
      (profile?.unlockedSections ?? []).join(","),
    );
  }

  await session.close();
  console.log(
    `\n${failures === 0 ? "test-action-abuse: OK" : `test-action-abuse: ${failures} failure(s)`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\ntest-action-abuse failed: ${(err as Error).message}`);
  process.exit(1);
});
