/**
 * The rollback switch.
 *
 *   npx tsx scripts/test-maintenance.ts
 *
 * Starts its own server. Checks that closing the door closes it - for new
 * arrivals and for anyone holding a reservation from a moment ago - that
 * /health keeps answering while it is shut, that the switch survives a
 * restart, and that without an ADMIN_TOKEN the endpoint that flips it does not
 * exist at all.
 *
 * The last one matters most. An admin endpoint is worth having only if it
 * cannot be reached by anyone who guesses the URL.
 */

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@colyseus/sdk";
import nacl from "tweetnacl";
import bs58 from "bs58";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");

const PORT = 2593;
const HTTP = `http://localhost:${PORT}`;
const WS = `ws://localhost:${PORT}`;
const TOKEN = "test-admin-token-not-a-real-one";
/** A file of its own, so this never touches the developer's database. */
const DB = path.join(ROOT, "data", "maintenance-test.db");

let failures = 0;
function check(what: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let serverOutput = "";

async function startServer(env: Record<string, string> = {}): Promise<ChildProcess> {
  const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", "src/index.ts"], {
    cwd: path.join(ROOT, "server"),
    shell: process.platform === "win32",
    env: {
      ...process.env,
      PORT: String(PORT),
      TEST_BYPASS_HOLD: "true",
      AUTH_RATE_LIMIT: "500",
      NODE_ENV: "development",
      DATABASE_PATH: DB,
      DATABASE_URL: "",
      ADMIN_TOKEN: TOKEN,
      MAINTENANCE: "",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverOutput = "";
  child.stdout?.on("data", (chunk: Buffer) => (serverOutput += chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => (serverOutput += chunk.toString()));

  for (let attempt = 0; attempt < 90; attempt += 1) {
    await sleep(500);
    try {
      if ((await fetch(`${HTTP}/health`)).ok) return child;
    } catch {
      // Not up yet.
    }
  }
  child.kill("SIGKILL");
  throw new Error(`the server never came up:\n${serverOutput.slice(-2000)}`);
}

async function stopServer(child: ChildProcess): Promise<void> {
  // On Windows the handle is a cmd.exe wrapper; killing it alone leaves node
  // holding the port and the next server silently fails to bind.
  if (process.platform === "win32" && child.pid) {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
  } else {
    child.kill("SIGKILL");
  }
  await sleep(1500);
}

async function signIn(): Promise<string> {
  const keypair = nacl.sign.keyPair();
  const wallet = bs58.encode(keypair.publicKey);
  const { message } = (await (await fetch(`${HTTP}/auth/nonce?address=${wallet}`)).json()) as {
    message: string;
  };
  const signature = bs58.encode(
    nacl.sign.detached(new TextEncoder().encode(message), keypair.secretKey),
  );
  const body = (await (
    await fetch(`${HTTP}/auth/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: wallet, message, signature }),
    })
  ).json()) as { token?: string };
  if (!body.token) throw new Error(`sign-in failed: ${JSON.stringify(body)}`);
  return body.token;
}

function enter(token: string): Promise<Response> {
  return fetch(`${HTTP}/play/enter`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  });
}

function flip(on: boolean, token = TOKEN): Promise<Response> {
  return fetch(`${HTTP}/admin/maintenance`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ on }),
  });
}

/** The cached flag is two seconds old at most; wait it out. */
const settle = () => sleep(2500);

async function main(): Promise<void> {
  console.log("test-maintenance\n");
  const fs = await import("node:fs");
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${DB}${suffix}`, { force: true });

  let server: ChildProcess | null = null;
  try {
    server = await startServer();

    console.log("-- the door is open --");
    const player = await signIn();
    const openEntry = await enter(player);
    check("a player can enter", openEntry.ok, String(openEntry.status));

    const openConfig = (await (await fetch(`${HTTP}/public/config`)).json()) as {
      maintenance: boolean;
    };
    check("and the public config says so", openConfig.maintenance === false);

    console.log("\n-- who may flip it --");
    const noToken = await fetch(`${HTTP}/admin/maintenance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ on: true }),
    });
    check("no token is refused", noToken.status === 401, String(noToken.status));

    const wrongToken = await flip(true, "not-the-token-at-all-no-really");
    check("the wrong token is refused", wrongToken.status === 401, String(wrongToken.status));

    const nearMiss = await flip(true, `${TOKEN}x`);
    check("and a near miss is refused", nearMiss.status === 401, String(nearMiss.status));

    const nonsense = await fetch(`${HTTP}/admin/maintenance`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ on: "yes please" }),
    });
    check("a body that is not a boolean is refused", nonsense.status === 400);

    // --- closing -----------------------------------------------------------
    console.log("\n-- closed --");
    /*
     * A reservation taken before the door shuts. Redeeming it is the gap a
     * check on /play/enter alone would leave open.
     */
    const early = (await (await enter(await signIn())).json()) as { reservation: unknown };

    const closed = await flip(true);
    check("the switch flips", closed.ok, String(closed.status));

    const health = await fetch(`${HTTP}/health`);
    check("/health is still up", health.ok, String(health.status));

    const shutEntry = await enter(player);
    const shutBody = (await shutEntry.json()) as { error: string; message: string };
    check("entry is closed", shutEntry.status === 503, String(shutEntry.status));
    check("with a reason a client can act on", shutBody.error === "maintenance", shutBody.error);
    check(
      "and a message that blames nobody",
      /closed for a few minutes/i.test(shutBody.message),
      shutBody.message,
    );

    let stale = "";
    try {
      const room = await new Client(WS).consumeSeatReservation(early.reservation as never);
      await room.leave(true);
      stale = "let in";
    } catch (err) {
      stale = (err as Error).message;
    }
    check("a reservation from before the switch is refused too", stale !== "let in", stale);

    const shutConfig = (await (await fetch(`${HTTP}/public/config`)).json()) as {
      maintenance: boolean;
    };
    check("the public config says it is closed", shutConfig.maintenance === true);

    // --- across a restart --------------------------------------------------
    console.log("\n-- and it stays closed --");
    await stopServer(server);
    // MAINTENANCE is not set in the environment: only the stored flag can
    // keep the door shut across this restart.
    server = await startServer();

    const afterRestart = await enter(await signIn());
    check(
      "a restart does not quietly reopen it",
      afterRestart.status === 503,
      String(afterRestart.status),
    );

    console.log("\n-- open again --");
    const reopened = await flip(false);
    check("the switch flips back", reopened.ok, String(reopened.status));
    await settle();

    const backIn = await enter(await signIn());
    check("and players can enter", backIn.ok, String(backIn.status));

    // --- MAINTENANCE=true at boot ------------------------------------------
    console.log("\n-- closed from the environment --");
    await stopServer(server);
    for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${DB}${suffix}`, { force: true });
    server = await startServer({ MAINTENANCE: "true" });

    const bootClosed = await enter(await signIn());
    check(
      "MAINTENANCE=true closes the door at boot",
      bootClosed.status === 503,
      String(bootClosed.status),
    );
    check("and /health is still up", (await fetch(`${HTTP}/health`)).ok);

    // --- no token, no endpoint ---------------------------------------------
    console.log("\n-- without an ADMIN_TOKEN --");
    await stopServer(server);
    for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${DB}${suffix}`, { force: true });
    server = await startServer({ ADMIN_TOKEN: "" });

    const gone = await flip(true);
    check("the endpoint does not exist", gone.status === 404, String(gone.status));
    const goneEmpty = await flip(true, "");
    check("not even with an empty token", goneEmpty.status === 404, String(goneEmpty.status));
    check("and the hub is open", (await enter(await signIn())).ok);
  } catch (err) {
    console.error("\n-- the server said --");
    console.error(serverOutput.slice(-3000));
    throw err;
  } finally {
    if (server) await stopServer(server);
    const fs = await import("node:fs");
    for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${DB}${suffix}`, { force: true });
  }

  console.log(`\ntest-maintenance: ${failures === 0 ? "OK" : `${failures} FAILED`}`);
  if (failures > 0) process.exit(1);
}

await main();
