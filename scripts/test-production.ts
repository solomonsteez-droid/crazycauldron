/**
 * What NODE_ENV=production actually changes.
 *
 *   npx tsx scripts/test-production.ts
 *
 * Every safeguard here is the kind that is believed rather than checked: the
 * gate bypass "obviously" cannot be on in production, the dev command
 * "obviously" is not registered. So each one is started as its own server
 * process with its own environment, on its own port, against a throwaway
 * database, and made to prove it.
 *
 * Two halves. The refusals: seven configurations that must not boot at all,
 * each for a named reason. And the live check: a correctly configured
 * production server, which must boot, must refuse the cheat command, and must
 * refuse a browser origin it was not told about.
 */

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@solana/web3.js";
import { Client, type Room } from "@colyseus/sdk";
import bs58 from "bs58";
import nacl from "tweetnacl";
import {
  MSG_DEV,
  MSG_KICK,
  MSG_NODES,
  MSG_PROFILE,
  MSG_REJECTED,
  MSG_UNLOCKED,
  type EnterResponse,
  type NonceResponse,
  type ProfilePayload,
  type VerifyResponse,
} from "@crazycauldron/shared";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const PORT = Number(process.env.PROD_TEST_PORT ?? 2601);
const HTTP = `http://localhost:${PORT}`;
const WS = `ws://localhost:${PORT}`;
const DB = path.join(ROOT, "data", "production-test.db");

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A production environment that is correct in every respect. */
const GOOD: Record<string, string> = {
  NODE_ENV: "production",
  PORT: String(PORT),
  DATABASE_PATH: DB,
  JWT_SECRET: "a-real-secret-that-is-comfortably-longer-than-thirty-two-characters",
  CORS_ORIGIN: "https://play.crazycauldron.example",
  SIWS_DOMAIN: "play.crazycauldron.example",
  SIWS_URI: "https://play.crazycauldron.example",
  RPC_URL: "https://api.mainnet-beta.solana.com",
  COOK_MINT: "So11111111111111111111111111111111111111112",
  TEST_BYPASS_HOLD: "false",
  AUTH_RATE_LIMIT: "10000",
  LOG_DIR: path.join(ROOT, "data", "production-test-logs"),
  BACKUP_DIR: path.join(ROOT, "data", "production-test-backups"),
};

interface Boot {
  started: boolean;
  output: string;
  child: ChildProcess;
}

/**
 * Starts a server with an environment and reports whether it came up.
 *
 * The environment is replaced rather than merged: inheriting the developer's
 * own .env is exactly how a "production" test ends up quietly running in
 * development.
 */
async function boot(env: Record<string, string>, waitMs = 30000): Promise<Boot> {
  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["tsx", "src/index.ts"],
    {
      cwd: path.join(ROOT, "server"),
      shell: process.platform === "win32",
      env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));

  let exited = false;
  child.on("exit", () => (exited = true));

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (exited) return { started: false, output, child };
    try {
      const response = await fetch(`${HTTP}/health`);
      if (response.ok) return { started: true, output, child };
    } catch {
      // Not listening yet.
    }
    await sleep(400);
  }
  return { started: false, output, child };
}

async function kill(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
  } else {
    child.kill("SIGKILL");
  }
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      await fetch(`${HTTP}/health`);
    } catch {
      return;
    }
    await sleep(300);
  }
}

/** One configuration that must be refused, and the words that must explain it. */
async function mustRefuse(label: string, patch: Record<string, string>, expect: string) {
  const result = await boot({ ...GOOD, ...patch }, 20000);
  await kill(result.child);

  const explained = result.output.toLowerCase().includes(expect.toLowerCase());
  check(
    label,
    !result.started && explained,
    result.started
      ? "it started anyway"
      : explained
        ? ""
        : `refused, but did not mention "${expect}": ${result.output.slice(-200).replace(/\s+/g, " ")}`,
  );
}

async function main() {
  console.log("test-production\n");

  for (const file of [DB, `${DB}-wal`, `${DB}-shm`]) fs.rmSync(file, { force: true });

  // --- configurations that must not boot -----------------------------------
  console.log("-- refusals --");
  await mustRefuse(
    "the token gate bypass is refused",
    { TEST_BYPASS_HOLD: "true" },
    "TEST_BYPASS_HOLD",
  );
  await mustRefuse("a short signing key is refused", { JWT_SECRET: "too-short" }, "JWT_SECRET");
  await mustRefuse(
    "the example signing key is refused",
    { JWT_SECRET: "dev-only-change-me-to-a-long-random-string-padding-padding" },
    "example value",
  );
  await mustRefuse("a missing CORS origin is refused", { CORS_ORIGIN: "" }, "CORS_ORIGIN");
  await mustRefuse(
    "a localhost CORS origin is refused",
    { CORS_ORIGIN: "http://localhost:5173" },
    "local origin",
  );
  await mustRefuse('a wildcard CORS origin is refused', { CORS_ORIGIN: "*" }, "name the origins");
  await mustRefuse(
    "a localhost signing domain is refused",
    { SIWS_DOMAIN: "localhost:5173" },
    "SIWS_DOMAIN",
  );
  await mustRefuse("a devnet RPC endpoint is refused", { RPC_URL: "https://api.devnet.solana.com" }, "devnet");
  await mustRefuse("an unset mint is refused", { COOK_MINT: "" }, "COOK_MINT");

  // --- a correct production server ------------------------------------------
  console.log("\n-- a correctly configured production server --");
  const server = await boot(GOOD);
  if (!server.started) {
    check("it starts", false, server.output.slice(-400).replace(/\s+/g, " "));
    await kill(server.child);
    console.log(`\ntest-production: ${failures + 1} failure(s)`);
    process.exit(1);
  }
  check("it starts", true);

  try {
    check(
      "and says it is in production",
      server.output.includes('"env":"production"'),
    );
    check(
      "the cheat handler is never registered",
      !server.output.includes("dev.commands_enabled"),
      "it is registered only when NODE_ENV is not production",
    );
    check(
      "and the layout was checked before anything was served",
      server.output.includes("layout.ok"),
    );

    const health = (await (await fetch(`${HTTP}/health`)).json()) as {
      ok: boolean;
      database: { ok: boolean };
    };
    check("health answers", health.ok && health.database.ok);

    // --- CORS ---------------------------------------------------------------
    const allowed = await fetch(`${HTTP}/health`, {
      headers: { origin: GOOD.CORS_ORIGIN as string },
    });
    check("a named origin is allowed", allowed.ok, `${allowed.status}`);

    const refused = await fetch(`${HTTP}/health`, {
      headers: { origin: "https://not-our-site.example" },
    });
    check(
      "an origin nobody named is refused",
      refused.status >= 400,
      `${refused.status}`,
    );

    // --- the gate is on ------------------------------------------------------
    const keypair = Keypair.generate();
    const address = keypair.publicKey.toBase58();
    const nonce = (await (
      await fetch(`${HTTP}/auth/nonce?address=${address}`)
    ).json()) as NonceResponse;
    const signature = bs58.encode(
      nacl.sign.detached(new TextEncoder().encode(nonce.message), keypair.secretKey),
    );
    const verify = await fetch(`${HTTP}/auth/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, message: nonce.message, signature }),
    });

    /*
     * A generated wallet holds no $COOK and the RPC endpoint here is real but
     * the mint is a placeholder, so either answer proves the same thing: the
     * gate ran. What must not happen is a 200.
     */
    check(
      "a wallet holding nothing is turned away at the gate",
      verify.status === 403 || verify.status === 503,
      `${verify.status} ${(await verify.text()).slice(0, 80)}`,
    );

    // --- and if a session did exist, the cheat would be dropped --------------
    console.log("\n-- the cheat command --");
    {
      /*
       * Proving the negative needs a seat, and the gate refuses every wallet
       * this test can make. So the server is restarted with the gate bypassed
       * and NODE_ENV still production... which it refuses, by design. The
       * check that remains is the one that matters and it is structural: the
       * handler is registered inside "if (!config.isProduction)", the log line
       * that accompanies it never appeared above, and Colyseus drops a message
       * whose type has no handler before any game code runs.
       */
      const source = fs.readFileSync(
        path.join(ROOT, "server", "src", "rooms", "HubRoom.ts"),
        "utf8",
      );
      const guarded = /if \(!config\.isProduction\) \{[\s\S]{0,400}?MSG_DEV/.test(source);
      check("the handler is registered only outside production", guarded);
      check(
        "and the client half is compiled out of the bundle",
        fs
          .readFileSync(path.join(ROOT, "client", "src", "scenes", "HubScene.ts"), "utf8")
          .includes("if (!import.meta.env.DEV) return;"),
      );

      const bundle = path.join(ROOT, "client", "dist");
      if (fs.existsSync(bundle)) {
        const js = fs
          .readdirSync(path.join(bundle, "assets"))
          .filter((f) => f.endsWith(".js"))
          .map((f) => fs.readFileSync(path.join(bundle, "assets", f), "utf8"))
          .join("");
        check(
          "the built bundle carries no dev console",
          !js.includes("cc.level(n) sets Chef Level"),
          "run npm run build first if this is stale",
        );
      } else {
        console.log("  skip  the built bundle - run npm run build to include this check");
      }
    }
  } finally {
    await kill(server.child);
    for (const file of [DB, `${DB}-wal`, `${DB}-shm`]) fs.rmSync(file, { force: true });
    fs.rmSync(GOOD.LOG_DIR as string, { recursive: true, force: true });
    fs.rmSync(GOOD.BACKUP_DIR as string, { recursive: true, force: true });
  }

  console.log(
    `\n${failures === 0 ? "test-production: OK" : `test-production: ${failures} failure(s)`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\ntest-production failed: ${(err as Error).message}`);
  process.exit(1);
});
