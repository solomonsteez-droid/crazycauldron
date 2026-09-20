/**
 * The committed client build, and the check that guards it.
 *
 *   npx tsx scripts/test-prebuilt.ts
 *
 * client/dist is committed because bundling it needs about 1 GB and the deploy
 * host has that in total. Two things therefore have to be true, and neither is
 * obvious enough to leave to memory:
 *
 * 1. The host must never bundle. A deploy of 789ac74 did, and died. The guard
 *    switched on NODE_ENV, which pm2 sets on the server process it starts and
 *    which is simply not set while the build runs - so it never fired and the
 *    fallback was to build.
 * 2. The stamp must be the same number on Windows and on Linux, or the check
 *    fails every deploy for a reason nobody can see.
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

  console.log(`\ntest-prebuilt: ${failures === 0 ? "OK" : `${failures} FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
