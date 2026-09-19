/**
 * Kill the server mid-session and check nothing was lost.
 *
 *   npx tsx scripts/test-persistence.ts
 *
 * Runs its own server on its own port against its own throwaway database, so
 * it neither needs nor disturbs a development server. A wallet plays for a
 * while - gathers, cooks, sells, wears a hat, unlocks the Meadows - and then
 * the process is killed with SIGKILL. Not asked to stop: killed, with no
 * chance to flush anything. The server is started again and the same wallet
 * signs back in, and everything it had must still be there.
 *
 * SIGKILL rather than SIGTERM on purpose. A graceful shutdown proves the
 * shutdown handler works; only a hard kill proves the writes had already
 * landed, which is the actual claim being made about the saves.
 */

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@solana/web3.js";
import { Client, type Room } from "colyseus.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import {
  HUB_MAP,
  approachTo,
  areaNode,
  zoneById,
  MSG_ATE,
  MSG_BOUGHT,
  MSG_COOK_PREP,
  MSG_COOK_PREPARED,
  MSG_COOK_RESULT,
  MSG_COOK_START,
  MSG_COOK_STOP,
  MSG_EQUIP,
  MSG_GATHER,
  MSG_GATHER_RESULT,
  MSG_GATHER_STARTED,
  MSG_HEAT_BAR,
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
  type CookPreparedPayload,
  type EnterResponse,
  type HeatBarPayload,
  type NonceResponse,
  type ProfilePayload,
  type TilePos,
  type VerifyResponse,
} from "@crazycauldron/shared";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const PORT = Number(process.env.PERSIST_PORT ?? 2599);
const HTTP = `http://localhost:${PORT}`;
const WS = `ws://localhost:${PORT}`;
const DB = path.join(ROOT, "data", "persistence-test.db");

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --------------------------------------------------------------------------
// The server under test
// --------------------------------------------------------------------------

let server: ChildProcess | null = null;

async function startServer(label: string): Promise<void> {
  /*
   * Started from the server workspace, exactly as "npm run dev" does.
   *
   * Running "tsx server/src/index.ts" from the repo root instead picks up the
   * root tsconfig, which does not set experimentalDecorators - and the Colyseus
   * schema decorators then fail at import time with an error that has nothing
   * to do with what is being tested.
   */
  server = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["tsx", "src/index.ts"],
    {
      cwd: path.join(ROOT, "server"),
      // Windows refuses to spawn a .cmd directly since Node 20; the shell is
      // what resolves it. taskkill /T below then takes the whole tree.
      shell: process.platform === "win32",
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: String(PORT),
        DATABASE_PATH: DB,
        TEST_BYPASS_HOLD: "true",
        AUTH_RATE_LIMIT: "10000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let output = "";
  server.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
  server.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));

  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${HTTP}/health`);
      if (response.ok) {
        console.log(`  (${label} on :${PORT})`);
        return;
      }
    } catch {
      // Not listening yet.
    }
    await sleep(400);
  }
  throw new Error(`server did not come up:\n${output.slice(-1500)}`);
}

/** SIGKILL. No shutdown hook runs, so only writes already on disk survive. */
async function killServer(): Promise<void> {
  if (!server) return;
  const child = server;
  server = null;

  if (process.platform === "win32") {
    // Node's SIGKILL on Windows does not reach the grandchild npx spawned.
    spawn("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
  } else {
    child.kill("SIGKILL");
  }

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      await fetch(`${HTTP}/health`);
    } catch {
      return;
    }
    await sleep(300);
  }
  throw new Error("server would not die");
}

// --------------------------------------------------------------------------
// A player
// --------------------------------------------------------------------------

interface Seat {
  room: Room;
  profile: () => ProfilePayload | null;
  prepared: () => CookPreparedPayload | null;
  heatBar: () => HeatBarPayload | null;
  self: () => { tileX: number; tileY: number; section: number } | undefined;
  reset: () => void;
}

async function seat(keypair: Keypair): Promise<Seat> {
  const address = keypair.publicKey.toBase58();
  const nonce = (await (await fetch(`${HTTP}/auth/nonce?address=${address}`)).json()) as NonceResponse;
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
  const latest = {
    profile: null as ProfilePayload | null,
    prepared: null as CookPreparedPayload | null,
    heatBar: null as HeatBarPayload | null,
  };

  room.onMessage(MSG_PROFILE, (p: ProfilePayload) => {
    latest.profile = p;
  });
  room.onMessage(MSG_COOK_PREPARED, (p: CookPreparedPayload) => {
    latest.prepared = p;
  });
  room.onMessage(MSG_HEAT_BAR, (p: HeatBarPayload) => {
    latest.heatBar = p;
  });
  for (const type of [
    MSG_NODES,
    MSG_GATHER_STARTED,
    MSG_GATHER_RESULT,
    MSG_COOK_RESULT,
    MSG_SOLD,
    MSG_BOUGHT,
    MSG_ATE,
    MSG_UNLOCKED,
    MSG_REJECTED,
    MSG_KICK,
  ]) {
    room.onMessage(type, () => undefined);
  }

  await sleep(700);
  return {
    room,
    profile: () => latest.profile,
    prepared: () => latest.prepared,
    heatBar: () => latest.heatBar,
    self: () => {
      const state = room.state as {
        players?: { get(id: string): { tileX: number; tileY: number; section: number } | undefined };
      };
      return state.players?.get(room.sessionId);
    },
    reset: () => {
      latest.prepared = null;
      latest.heatBar = null;
    },
  };
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

/** Where a seated player is standing. */
function tileOf(seat: Seat): TilePos {
  const me = seat.self();
  return me ? { tileX: me.tileX, tileY: me.tileY } : { tileX: 0, tileY: 0 };
}

/** Polls until something becomes true, or gives up. */
async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(200);
  }
  return false;
}

async function walkTo(s: Seat, target: TilePos, timeoutMs = 25000): Promise<boolean> {
  s.room.send(MSG_MOVE, target);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const me = s.self();
    if (me && me.tileX === target.tileX && me.tileY === target.tileY) return true;
    await sleep(150);
  }
  return false;
}

// --------------------------------------------------------------------------

async function main() {
  console.log("test-persistence\n");

  fs.rmSync(DB, { force: true });
  fs.rmSync(`${DB}-wal`, { force: true });
  fs.rmSync(`${DB}-shm`, { force: true });

  const keypair = Keypair.generate();
  const meadows = SECTIONS[0]!;
  const starter = RECIPES.find((r) => Object.keys(r.requirements).length === 0) ?? RECIPES[0]!;

  // --- play ----------------------------------------------------------------
  console.log("-- a session --");
  await startServer("first run");
  let before: ProfilePayload;
  {
    const player = await seat(keypair);
    check("a fresh wallet starts at Chef 1", player.profile()?.chefLevel === 1);

    // Out to the Meadows, which is also the section unlock being recorded.
    await walkTo(player, approachZone(HUB_MAP, `portal_${meadows.index}`, tileOf(player))!);
    player.room.send(MSG_TRAVEL, { section: meadows.index });
    await waitFor(() => player.self()?.section === meadows.index, 10000);
    check("it reaches the Meadows", player.self()?.section === meadows.index);

    /*
     * Enough of each ingredient for one flatbread, taken from a different node
     * each time. A node goes on cooldown the moment it is stripped, so
     * returning to the same one would mean waiting a minute per unit for
     * nothing - the point of the exercise is what is on disk, not the timers.
     *
     * Every step waits for the server to say it happened rather than for a
     * number of milliseconds. A fixed sleep passes on an idle machine and
     * fails on a busy one, which is the worst kind of test: it does not report
     * a bug, it reports the load average.
     */
    const carrying = (id: string) =>
      player.profile()?.inventory.find((i) => i.kind === "ingredient" && i.id === id)?.qty ?? 0;

    for (const need of starter.ingredients) {
      const nodes = meadows.nodes.filter((n) => n.ingredient === need.id);
      if (nodes.length === 0) continue;

      for (let attempt = 0; attempt < need.qty * 3 && carrying(need.id) < need.qty; attempt += 1) {
        const node = nodes[attempt % nodes.length]!;
        const arrived = await walkTo(
          player,
          besideNode(meadows.index, node.id)!,
        );
        if (!arrived) continue;

        const before = carrying(need.id);
        player.room.send(MSG_GATHER, { nodeId: node.id });
        // The gather animation is three seconds at level 1; the payout and the
        // profile that carries it follow.
        await waitFor(() => carrying(need.id) > before, 12000);
      }

      check(
        `it gathered ${need.qty} ${need.id}`,
        carrying(need.id) >= need.qty,
        `${carrying(need.id)} of ${need.qty}`,
      );
    }

    // Home, and cook.
    await walkTo(player, approachZone(meadows.index, "portal_hub", tileOf(player))!);
    player.room.send(MSG_TRAVEL, { section: HUB_MAP });
    await waitFor(() => player.self()?.section === HUB_MAP, 10000);
    check("it comes home", player.self()?.section === HUB_MAP);

    await walkTo(player, approachZone(HUB_MAP, "kitchen", tileOf(player))!);

    player.reset();
    player.room.send(MSG_COOK_START, { recipeId: starter.id });
    await sleep(700);
    const prep = player.prepared();
    if (prep && !prep.autoPrep) {
      await sleep(prep.prepMs);
      player.room.send(MSG_COOK_PREP, { cookId: prep.cookId });
      await sleep(500);
    }
    const bar = player.heatBar();
    if (bar) {
      const at = bar.durationMs / 2;
      await sleep(at);
      player.room.send(MSG_COOK_STOP, { cookId: bar.cookId, elapsedMs: Math.round(at) });
      /*
       * Wait for the dish, not for a guess at how long it takes.
       *
       * Stopping the bar early does not end the cook early - the server
       * resolves it on its own clock - and the result and the profile that
       * follows are two separate messages. A fixed sleep either races them or
       * makes the test slow for everybody.
       */
      await waitFor(
        () => (player.profile()?.inventory ?? []).some((i) => i.kind === "dish"),
        15000,
      );
    }
    const dishes = player.profile()?.inventory.filter((s) => s.kind === "dish") ?? [];
    check("it cooked a dish", dishes.length > 0, dishes.map((s) => s.id).join(", "));

    // Sell one, which is the coins.
    await walkTo(player, approachZone(HUB_MAP, "tavern", tileOf(player))!);
    const dish = player.profile()?.inventory.find((s) => s.kind === "dish");
    if (dish) {
      const before = player.profile()?.coins ?? 0;
      player.room.send(MSG_SELL, { stackKey: dish.key, qty: 1 });
      await waitFor(() => (player.profile()?.coins ?? 0) > before, 8000);
    }

    // And wear whatever cooking earned.
    const earned = player.profile()?.wardrobe.find((w) => w.unlocked && w.kind === "hat");
    if (earned) {
      player.room.send(MSG_EQUIP, { kind: "hat", itemId: earned.id });
      await waitFor(() => player.profile()?.hatId === earned.id, 8000);
    }

    const snapshot = player.profile();
    if (!snapshot) throw new Error("no profile to compare against");
    before = snapshot;

    console.log(
      `  before the kill: ${before.coins} coins, chef ${before.chefLevel} (${before.chefXp} xp), ` +
        `${before.inventory.length} stack(s), hat "${before.hatId}", ` +
        `sections ${before.unlockedSections.join(",")}`,
    );
    check("there is something worth losing", before.chefXp > 0 || before.coins > 0);
  }

  // --- kill ----------------------------------------------------------------
  console.log("\n-- SIGKILL, mid-session --");
  await killServer();
  check("the server is gone", true);

  // --- and back ------------------------------------------------------------
  console.log("\n-- after the restart --");
  await startServer("second run");
  {
    const player = await seat(keypair);
    const after = player.profile();
    if (!after) throw new Error("no profile after restart");

    console.log(
      `  after: ${after.coins} coins, chef ${after.chefLevel} (${after.chefXp} xp), ` +
        `${after.inventory.length} stack(s), hat "${after.hatId}", ` +
        `sections ${after.unlockedSections.join(",")}`,
    );

    check("coins survived", after.coins === before.coins, `${before.coins} -> ${after.coins}`);
    check("chef XP survived", after.chefXp === before.chefXp, `${before.chefXp} -> ${after.chefXp}`);
    check(
      "chef level survived",
      after.chefLevel === before.chefLevel,
      `${before.chefLevel} -> ${after.chefLevel}`,
    );
    check(
      "every skill survived",
      before.skills.every(
        (s) => after.skills.find((a) => a.id === s.id)?.xp === s.xp,
      ),
      after.skills.map((s) => `${s.id} ${s.xp}`).join(", "),
    );
    check(
      "the bag survived",
      after.inventory.length === before.inventory.length &&
        before.inventory.every(
          (s) => after.inventory.find((a) => a.key === s.key)?.qty === s.qty,
        ),
      `${before.inventory.length} -> ${after.inventory.length} stack(s)`,
    );
    check(
      "unlocked sections survived",
      before.unlockedSections.every((s) => after.unlockedSections.includes(s)),
      `${before.unlockedSections.join(",")} -> ${after.unlockedSections.join(",")}`,
    );
    check(
      "earned wardrobe survived",
      before.wardrobe
        .filter((w) => w.unlocked)
        .every((w) => after.wardrobe.find((a) => a.id === w.id)?.unlocked === true),
    );
    check("what it was wearing survived", after.hatId === before.hatId, `"${after.hatId}"`);
    check(
      "the codex survived",
      before.codex.length === after.codex.length,
      `${before.codex.length} -> ${after.codex.length} recipe(s)`,
    );

    await player.room.leave();
  }

  await killServer();
  fs.rmSync(DB, { force: true });
  fs.rmSync(`${DB}-wal`, { force: true });
  fs.rmSync(`${DB}-shm`, { force: true });

  console.log(
    `\n${failures === 0 ? "test-persistence: OK" : `test-persistence: ${failures} failure(s)`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(`\ntest-persistence failed: ${(err as Error).message}`);
  await killServer().catch(() => undefined);
  process.exit(1);
});
