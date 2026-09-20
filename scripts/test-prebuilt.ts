/**
 * The committed client build, and the check that guards it.
 *
 *   npx tsx scripts/test-prebuilt.ts
 *
 * client/dist is committed because bundling it needs about 1 GB and the deploy
 * host has that in total. Three things therefore have to be true, and not one
 * of them is obvious enough to leave to memory:
 *
 * 1. The host must never bundle. A deploy of 789ac74 did, and died. The guard
 *    switched on NODE_ENV, which pm2 sets on the server process it starts and
 *    which is simply not set while the build runs - so it never fired and the
 *    fallback was to build.
 * 2. The stamp must be the same number on Windows and on Linux, or the check
 *    fails every deploy for a reason nobody can see.
 * 3. The bundle must not name a server. Building it on a developer's machine
 *    puts their .env in scope, and localhost:2567 shipped to production once
 *    already.
 *
 * So this asserts the shape of the scripts rather than only their output: that
 * the root build passes --verify, that --verify has no path that builds, and
 * that the stamp survives the differences between a Windows working tree and a
 * Linux checkout.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const SCRIPT = path.join("scripts", "build-client.mjs");

let failures = 0;
function check(what: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

/** Runs the build script and hands back what it said and what it returned. */
function run(args: string[], env: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  return {
    code: result.status ?? 1,
    out: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

const stamp = () => run(["--stamp-only"]).out.trim();
const explained = () => run(["--explain"]).out;

function main(): void {
  console.log("test-prebuilt\n");

  // --- the scripts say what they mean --------------------------------------
  console.log("-- the host cannot bundle --");
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };

  check(
    "the root build verifies rather than builds",
    pkg.scripts.build?.includes("build-client.mjs --verify") === true,
    pkg.scripts.build,
  );
  check(
    "and never reaches the client workspace",
    pkg.scripts.build?.includes("-w client") === false,
    pkg.scripts.build,
  );
  check(
    "there is a separate script that does build it",
    pkg.scripts["build:client"]?.includes("--build") === true,
    pkg.scripts["build:client"],
  );

  const source = fs.readFileSync(path.join(ROOT, SCRIPT), "utf8");
  check(
    "the mode is a flag, not an environment guess",
    source.includes('argv.includes("--build")'),
  );
  check(
    "and the environment is only ever read to refuse",
    source.includes("COLYSEUS_CLOUD") && source.includes("onDeployHost"),
  );

  // --- what it actually does -----------------------------------------------
  console.log("\n-- and it behaves that way --");
  const verify = run(["--verify"]);
  check(
    "verify accepts the committed build",
    verify.code === 0 && verify.out.includes("using the committed build"),
    verify.out.trim().split("\n")[0],
  );
  check("and bundles nothing", !verify.out.includes("vite"), "no vite in its output");

  for (const [name, env] of [
    ["COLYSEUS_CLOUD", { COLYSEUS_CLOUD: "1" }],
    ["NODE_ENV=production", { NODE_ENV: "production" }],
    ["CI", { CI: "true" }],
  ] as const) {
    /*
     * With a matching stamp there is nothing to build, so --build is a no-op
     * either way. What is checked is that it still takes the "use the
     * committed build" path and never shells out.
     */
    const forced = run(["--build"], env);
    check(
      `--build under ${name} does not bundle`,
      forced.code === 0 && !forced.out.includes("vite"),
      forced.out.trim().split("\n")[0],
    );
  }

  // --- the stamp is the same number everywhere -----------------------------
  console.log("\n-- the stamp is deterministic --");
  const first = stamp();
  check("it is stable between runs", first === stamp(), first);
  check("and it is not empty", /^[0-9a-f]{16}$/.test(first), first);

  /*
   * The differences between a Windows working tree and a Linux checkout of the
   * same commit: line endings, and a byte-order mark. Both are normalised out,
   * and this proves it by writing them in and watching the number hold.
   */
  const probe = path.join(ROOT, "client", "src", "net", "env.ts");
  const original = fs.readFileSync(probe);
  try {
    const text = original.toString("utf8");
    fs.writeFileSync(probe, text.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"), "utf8");
    check("CRLF hashes the same as LF", stamp() === first, stamp());

    fs.writeFileSync(probe, `﻿${text}`, "utf8");
    check("a byte-order mark changes nothing", stamp() === first, stamp());
  } finally {
    fs.writeFileSync(probe, original);
  }
  check("and the probe was put back", fs.readFileSync(probe).equals(original));

  /*
   * The art is hashed too, and as bytes.
   *
   * vite copies client/public into dist verbatim, so a re-nudged hat offset or
   * a repainted map changes what ships without touching a line of code. That
   * is the most common kind of change this game has; if it could not move the
   * stamp, a dist built before it would still verify on the host and yesterday
   * is what players would see.
   *
   * A PNG also must not be put through the line-ending normaliser, which would
   * rewrite 0x0d 0x0a inside the image data and produce a number that means
   * nothing. This checks the number moves and comes back, which it can only do
   * if the bytes are read and restored as bytes.
   */
  console.log("\n-- the art counts as source --");
  check(
    "the offsets are hashed",
    explained().includes("client/public/assets/generated/offsets.json"),
  );
  check(
    "and so are the painted maps",
    explained().includes("client/public/assets/maps/map_hub.png"),
  );

  /*
   * Nothing real is edited to prove it. These probes are new files under
   * client/public, which is exactly what a new piece of art is - and anything
   * that lands there ships, so moving the stamp is the right answer.
   *
   * The pair also proves the bytes are hashed as bytes. A PNG must not go
   * through the line-ending normaliser: if it did, CRLF inside image data
   * would be rewritten to LF and these two different files would hash the
   * same, which is a stamp that cannot tell two pictures apart.
   */
  const probePng = path.join(ROOT, "client", "public", "assets", "generated", "_probe.png");
  try {
    fs.writeFileSync(probePng, Buffer.from([0x0d, 0x0a]));
    const withCrLf = stamp();
    check("a new image moves the stamp", withCrLf !== first, withCrLf);

    fs.writeFileSync(probePng, Buffer.from([0x0a]));
    const withLf = stamp();
    check("and image bytes are not line-ending normalised", withLf !== withCrLf, withLf);
  } finally {
    fs.rmSync(probePng, { force: true });
  }
  check("the stamp comes home once the probe is gone", stamp() === first, stamp());

  /*
   * A file the other machine does not have must not move the number. This is
   * the class of difference that is hardest to find by eye, because both
   * machines look correct on their own.
   */
  const strays = [
    path.join(ROOT, "client", "src", "net", "env.ts.orig"),
    path.join(ROOT, "client", "src", ".DS_Store"),
    path.join(ROOT, "shared", "src", "scratch.png"),
  ];
  try {
    for (const file of strays) fs.writeFileSync(file, "not source");
    check("a stray file is not hashed", stamp() === first, stamp());
  } finally {
    for (const file of strays) fs.rmSync(file, { force: true });
  }

  // --- and what is committed matches ---------------------------------------
  console.log("\n-- the committed build is current --");
  const tracked = spawnSync("git", ["ls-files", "client/dist/.build-stamp"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  check(
    "the stamp is committed",
    tracked.stdout.trim() === "client/dist/.build-stamp",
    tracked.stdout.trim() || "(not tracked)",
  );

  const committed = fs
    .readFileSync(path.join(ROOT, "client", "dist", ".build-stamp"), "utf8")
    .trim();
  check(
    "and it matches the source in this working tree",
    committed === first,
    `committed ${committed}, source ${first}`,
  );

  // --- and it does not carry a server address ------------------------------
  /*
   * The third thing that has to be true about a committed build, and the one
   * that actually took production down.
   *
   * envDir is the repo root, so the .env sitting beside it is read while the
   * bundle is made. On the host that file did not exist and the client fell
   * back to the origin that served it; on a developer's machine it says
   * localhost:2567, and once the build moved there that is what shipped. The
   * deployed client asked a laptop for /auth/nonce and nobody could sign in.
   * The bundle is the only place it is visible, so it is read here.
   */
  console.log("\n-- the bundle asks its own origin --");
  const bundles = fs
    .readdirSync(path.join(ROOT, "client", "dist", "assets"))
    .filter((name) => name.endsWith(".js"));
  check("there are bundles to look at", bundles.length > 0, `${bundles.length} js files`);

  /*
   * "localhost:2567" and nothing looser. The Colyseus SDK carries its own
   * `ws://127.0.0.1:2567` as the default for a client constructed with no
   * endpoint at all - we always pass one, so that literal is unreachable, and
   * a check that flagged it would be a check somebody turns off.
   */
  const offenders: string[] = [];
  for (const name of bundles) {
    const code = fs.readFileSync(path.join(ROOT, "client", "dist", "assets", name), "utf8");
    for (const bad of ["localhost:2567", "0.0.0.0:2567"]) {
      if (code.includes(bad)) offenders.push(`${name} contains ${bad}`);
    }
  }
  check("no built file names a development server", offenders.length === 0, offenders.join("; "));

  /*
   * And the two reasons it cannot come back: the build pins the variables to
   * empty, and in production the client does not consult them at all.
   */
  const viteConfig = fs.readFileSync(path.join(ROOT, "client", "vite.config.ts"), "utf8");
  check(
    "the build pins VITE_SERVER_* to empty",
    viteConfig.includes('"import.meta.env.VITE_SERVER_HTTP_URL"') &&
      viteConfig.includes('"import.meta.env.VITE_SERVER_WS_URL"'),
  );

  const clientEnv = fs.readFileSync(path.join(ROOT, "client", "src", "net", "env.ts"), "utf8");
  check(
    "and production takes the origin unconditionally",
    /httpUrl:\s*import\.meta\.env\.PROD\s*\?\s*sameOriginHttp/.test(clientEnv) &&
      /wsUrl:\s*import\.meta\.env\.PROD\s*\?\s*sameOriginWs/.test(clientEnv),
  );

  console.log(`\ntest-prebuilt: ${failures === 0 ? "OK" : `${failures} FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
