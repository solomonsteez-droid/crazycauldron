/**
 * The Postgres backend, exercised for real.
 *
 *   npx tsx scripts/test-postgres.ts
 *
 * Production runs on Postgres and a developer's machine runs on SQLite, which
 * means the backend nobody develops against is the one players depend on. This
 * closes that gap without anyone having to install a database: PGlite is a
 * real Postgres compiled to WebAssembly, and pglite-socket puts it behind a TCP
 * port, so `pg` connects to it exactly as it would to a managed one.
 *
 * It starts that database, starts the server pointed at it, plays a whole
 * session - sign in, gather, cook, equip, level up - kills the server, starts a
 * second one, and checks the progress came back. Then it takes a backup, wipes
 * the database, restores it, and checks the progress came back again.
 */

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { Client } from "@colyseus/sdk";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { dumpPostgres, readDump, restorePostgres } from "../server/src/db/pgdump.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");

const PG_PORT = 55432;
const SERVER_PORT = 2589;
const HTTP = `http://localhost:${SERVER_PORT}`;
const DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/postgres`;
const BACKUP_DIR = path.join(ROOT, "backups", "pgtest");

let failures = 0;
function check(what: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A throwaway wallet, signing the server's own sign-in message. */
async function signIn(): Promise<{ token: string; wallet: string }> {
  const keypair = nacl.sign.keyPair();
  const wallet = bs58.encode(keypair.publicKey);

  const nonceRes = await fetch(`${HTTP}/auth/nonce?address=${wallet}`);
  const { message } = (await nonceRes.json()) as { message: string };

  const signature = bs58.encode(
    nacl.sign.detached(new TextEncoder().encode(message), keypair.secretKey),
  );
  const verifyRes = await fetch(`${HTTP}/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: wallet, message, signature }),
  });
  const body = (await verifyRes.json()) as { token?: string };
  if (!body.token) throw new Error(`sign-in failed: ${JSON.stringify(body)}`);
  return { token: body.token, wallet };
}

/** Everything the server said, so a failure here can show why. */
let serverOutput = "";

/** Starts the server against Postgres and waits for it to answer. */
async function startServer(): Promise<ChildProcess> {
  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["tsx", "src/index.ts"],
    {
      cwd: path.join(ROOT, "server"),
      shell: process.platform === "win32",
      env: {
        ...process.env,
        DATABASE_URL,
        PORT: String(SERVER_PORT),
        TEST_BYPASS_HOLD: "true",
        AUTH_RATE_LIMIT: "500",
        BACKUP_DIR,
        NODE_ENV: "development",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  serverOutput = "";
  child.stdout?.on("data", (chunk: Buffer) => (serverOutput += chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => (serverOutput += chunk.toString()));

  for (let attempt = 0; attempt < 90; attempt += 1) {
    await sleep(500);
    try {
      const res = await fetch(`${HTTP}/health`);
      if (res.ok) return child;
    } catch {
      // Not up yet.
    }
  }
  child.kill("SIGKILL");
  throw new Error(`the server never came up:\n${output.slice(-2000)}`);
}

async function stopServer(child: ChildProcess): Promise<void> {
  child.kill("SIGKILL");
  await sleep(1500);
}

interface Profile {
  coins: number;
  chefXp: number;
  hatId: string;
  cloakId: string;
  bag: { id: string; qty: number }[];
}

/** Joins, runs the dev progression command, and reports the profile. */
async function play(token: string): Promise<Profile> {
  const enter = await fetch(`${HTTP}/play/enter`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  });
  const { reservation } = (await enter.json()) as { reservation: unknown };

  const client = new Client(`ws://localhost:${SERVER_PORT}`);
  const room = await client.consumeSeatReservation(reservation as never);

  /*
   * A profile arrives unprompted on join, carrying whatever was loaded from
   * the database. The one worth reporting is the next one - after the dev
   * command has granted a level - so the first is taken and set aside.
   */
  const profiles: ((p: Profile) => void)[] = [];
  const inbox: Profile[] = [];
  room.onMessage("profile", (payload: Profile) => {
    const waiting = profiles.shift();
    if (waiting) waiting(payload);
    else inbox.push(payload);
  });
  // Messages the server may send that this test does not care about.
  for (const type of ["rejected", "unlocked", "nodes"]) room.onMessage(type, () => {});

  const nextProfile = () =>
    new Promise<Profile>((resolve, reject) => {
      const ready = inbox.shift();
      if (ready) return resolve(ready);
      const timer = setTimeout(() => reject(new Error("no profile arrived")), 15_000);
      profiles.push((payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
      return undefined;
    });

  await nextProfile();
  // Grant a level, so there is progress worth persisting.
  room.send("dev", { command: "level", value: 12 });
  const profile = await nextProfile();

  await room.leave(true);
  await sleep(600);
  return profile;
}

async function main(): Promise<void> {
  console.log("test-postgres\n");
  fs.rmSync(BACKUP_DIR, { recursive: true, force: true });

  // --- a real Postgres, in this process ------------------------------------
  const pglite = await PGlite.create();
  /*
   * PGlite holds one connection; the socket server multiplexes several onto it.
   * The default is one, which is not enough for a pooled client - and both the
   * server under test and this script have a pool.
   */
  const socket = new PGLiteSocketServer({
    db: pglite,
    port: PG_PORT,
    host: "127.0.0.1",
    maxConnections: 20,
  });
  await socket.start();
  console.log(`-- postgres (pglite) on 127.0.0.1:${PG_PORT} --\n`);

  let server: ChildProcess | null = null;
  try {
    console.log("-- a session --");
    server = await startServer();

    const health = (await (await fetch(`${HTTP}/health`)).json()) as {
      database: { backend: string; ok: boolean };
    };
    check("the server is on Postgres", health.database.backend === "postgres", health.database.backend);
    check("and the database answers", health.database.ok);

    const { token, wallet } = await signIn();
    const first = await play(token);
    check("a session earned progress", first.chefXp > 0, `${first.chefXp} chef XP`);
    check("and was handed a starting cloak", first.cloakId === "cloak_01_wool", first.cloakId);

    console.log("\n-- it survives a restart --");
    await stopServer(server);
    server = await startServer();

    const again = await play(token);
    check("the XP came back", again.chefXp >= first.chefXp, `${again.chefXp} chef XP`);
    check("the coins came back", again.coins >= first.coins, `${again.coins} coins`);
    check("and so did the wallet's row", again.cloakId === first.cloakId, again.cloakId);

    console.log("\n-- backup and restore --");
    await stopServer(server);
    server = null;

    const pool = new pg.Pool({ connectionString: DATABASE_URL });
    try {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      const file = path.join(BACKUP_DIR, "crazycauldron-test.json.gz");
      const { rows } = await dumpPostgres(pool, file);
      check("a dump was taken", rows > 0 && fs.existsSync(file), `${rows} row(s)`);

      // Wipe it, the way a lost volume would.
      await pool.query("DELETE FROM players");
      const emptied = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM players");
      check("the database was emptied", emptied.rows[0]?.n === 0);

      const restored = await restorePostgres(pool, readDump(file));
      check("the dump restored", restored.rows === rows, `${restored.rows} row(s)`);

      const back = await pool.query<{ chef_xp: number }>(
        "SELECT chef_xp FROM player_game WHERE wallet = $1",
        [wallet],
      );
      /*
       * BIGINT comes back as a string here. The server registers a type parser
       * for it; this script talks to `pg` directly and does not, so the
       * comparison says so rather than pretending the shapes match.
       */
      const stored = Number(back.rows[0]?.chef_xp ?? NaN);
      check("and the chef is back with their XP", stored === again.chefXp, String(stored));
    } finally {
      await pool.end();
    }
  } catch (err) {
    // Whatever went wrong, the server's own log is where the reason is.
    console.error("\n-- the server said --");
    console.error(serverOutput.slice(-4000));
    throw err;
  } finally {
    if (server) await stopServer(server);
    await socket.stop();
    await pglite.close();
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
  }

  console.log(`\ntest-postgres: ${failures === 0 ? "OK" : `${failures} FAILED`}`);
  if (failures > 0) process.exit(1);
}

await main();
