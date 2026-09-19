/**
 * Every setting the server reads is written down.
 *
 *   npx tsx scripts/test-config-docs.ts
 *
 * Documentation rots the moment somebody adds a variable and forgets the file
 * that lists them. This reads the source instead of trusting anybody: every
 * environment variable the server reads has to appear in .env.example and in
 * DEPLOY.md, or this fails and names it.
 *
 * Only the server. The test scripts have knobs of their own - which port to
 * start a throwaway server on, which URL to aim at - and those are plumbing
 * for whoever is running the suite, not settings for whoever is deploying.
 *
 * It runs the other way too. A variable documented but never read is either a
 * rename nobody finished or an instruction that does nothing, and both are
 * worse than no line at all.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");

let failures = 0;
function check(what: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

/**
 * Names the platform sets, not us.
 *
 * Colyseus Cloud provides the first five and pm2 the sixth; documenting them
 * as things to configure would be telling somebody to set a variable they do
 * not control. NODE_ENV is in .env.example but is read everywhere, and the
 * two TEST_ ones exist only for the suite.
 */
const PROVIDED = new Set([
  "COLYSEUS_CLOUD",
  "REDIS_URI",
  "SUBDOMAIN",
  "SERVER_NAME",
  "NODE_APP_INSTANCE",
  "PORT",
  "NODE_ENV",
  "SERVER_URL",
]);

/** Every .ts file under a directory. */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      out.push(...sources(full));
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * The variables a file reads.
 *
 * Three shapes: process.env.NAME, process.env["NAME"], and the str/num/bool
 * helpers in config.ts that take the name as their first argument.
 */
function variablesIn(source: string): Set<string> {
  const found = new Set<string>();
  const patterns = [
    /process\.env\.([A-Z][A-Z0-9_]*)/g,
    /process\.env\["([A-Z][A-Z0-9_]*)"\]/g,
    /\b(?:str|num|bool)\("([A-Z][A-Z0-9_]*)"/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.add(match[1]!);
  }
  return found;
}

function main(): void {
  console.log("test-config-docs\n");

  const envExample = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
  const deploy = fs.readFileSync(path.join(ROOT, "DEPLOY.md"), "utf8");

  const used = new Set<string>();
  const where = new Map<string, string>();

  for (const file of sources(path.join(ROOT, "server", "src"))) {
    for (const name of variablesIn(fs.readFileSync(file, "utf8"))) {
      if (PROVIDED.has(name)) continue;
      used.add(name);
      if (!where.has(name)) where.set(name, path.relative(ROOT, file));
    }
  }

  /*
   * The client's half, which is a different mechanism: Vite inlines
   * import.meta.env.VITE_* at build time and nothing else, which is exactly
   * why every secret above deliberately lacks that prefix. They are still
   * settings somebody deploying has to know about, so they count here too.
   */
  for (const file of sources(path.join(ROOT, "client", "src"))) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]*)/g)) {
      used.add(match[1]!);
      if (!where.has(match[1]!)) where.set(match[1]!, path.relative(ROOT, file));
    }
  }

  console.log(`-- ${used.size} settings the code reads --`);

  const missingFromEnv: string[] = [];
  const missingFromDeploy: string[] = [];
  for (const name of [...used].sort()) {
    // A commented-out line in .env.example still counts: some settings are
    // deliberately absent by default and shown as an example of the shape.
    if (!new RegExp(`^#?\\s*${name}=`, "m").test(envExample)) missingFromEnv.push(name);
    if (!deploy.includes(name)) missingFromDeploy.push(name);
  }

  check(
    "every one is in .env.example",
    missingFromEnv.length === 0,
    missingFromEnv.map((n) => `${n} (${where.get(n)})`).join(", "),
  );
  check(
    "and every one is in DEPLOY.md",
    missingFromDeploy.length === 0,
    missingFromDeploy.map((n) => `${n} (${where.get(n)})`).join(", "),
  );

  // --- the other direction --------------------------------------------------
  console.log("\n-- and nothing is documented that does not exist --");
  const documented = [...envExample.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]!);
  const orphaned = documented.filter((name) => !used.has(name) && !PROVIDED.has(name));
  check("no setting in .env.example is unread", orphaned.length === 0, orphaned.join(", "));

  // --- the things launch depends on being written down ----------------------
  console.log("\n-- the launch checklist --");
  for (const [what, needle] of [
    ["the deploy command", "npx @colyseus/cloud deploy"],
    ["the treasury wallet", "CTjcrsrKUTbEbm91XbL1BToD3cUEJcjxNvyeuW2nd8LU"],
    ["the domain to point at it", "crazycauldron.art"],
    ["how to flip the rollback switch", "/admin/maintenance"],
    ["what to check after the first deploy", "database.backend"],
    ["that the shop ships switched off", "SHOP_ENABLED=false"],
  ] as const) {
    check(`DEPLOY.md gives ${what}`, deploy.includes(needle));
  }

  console.log(`\ntest-config-docs: ${failures === 0 ? "OK" : `${failures} FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
