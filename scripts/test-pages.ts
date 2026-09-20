/**
 * The three pages that are not the game.
 *
 *   npx tsx scripts/test-pages.ts        (against a running server)
 *
 * Checked at the two levels that can be checked without a browser: that the
 * server answers every page path with the app shell and the roadmap file with
 * markdown, and that the built bundle actually contains the pages - a route
 * that resolves to a bundle without the code in it is a blank screen.
 *
 * The one thing it watches hardest is /public/config, because that is where
 * the contract address a player copies comes from. It must carry the address,
 * and it must carry nothing else - a secret served to every visitor is a
 * secret no longer.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const HTTP = process.env.SERVER_URL ?? "http://localhost:2567";
const BUNDLE_DIR = path.join(ROOT, "client", "dist", "assets");

let failures = 0;
function check(what: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

/** The built bundle, whatever Vite named it this time. */
function bundle(): string {
  if (!fs.existsSync(BUNDLE_DIR)) return "";
  const file = fs
    .readdirSync(BUNDLE_DIR)
    .find((name) => name.startsWith("index-") && name.endsWith(".js"));
  return file ? fs.readFileSync(path.join(BUNDLE_DIR, file), "utf8") : "";
}

async function main(): Promise<void> {
  console.log(`test-pages against ${HTTP}\n`);

  // --- routing -------------------------------------------------------------
  console.log("-- the server answers every page --");
  for (const page of ["/official", "/rules", "/roadmap"]) {
    const res = await fetch(`${HTTP}${page}`);
    const type = res.headers.get("content-type") ?? "";
    check(`${page} is the app shell`, res.ok && type.includes("text/html"), `${res.status} ${type}`);
  }

  const md = await fetch(`${HTTP}/roadmap.md`);
  const roadmap = await md.text();
  check("the roadmap file is served", md.ok, String(md.status));
  check(
    "and it is the roadmap",
    roadmap.includes("# CrazyCauldron Roadmap"),
    `${roadmap.length} bytes`,
  );
  check(
    "which says it is a plan, not a promise",
    /plan, not a promise/i.test(roadmap),
  );

  // A missing asset must 404 rather than quietly becoming a page of HTML.
  const missing = await fetch(`${HTTP}/assets/generated/nope.png`);
  check("a missing asset is still a 404", missing.status === 404, String(missing.status));

  // --- the public config ---------------------------------------------------
  console.log("\n-- what the pages are told --");
  const res = await fetch(`${HTTP}/public/config`);
  const raw = await res.text();
  const cfg = JSON.parse(raw) as {
    domain: string;
    cookMint: string;
    minHold: number;
    social: { x: string; telegram: string };
  };

  check("the config is served", res.ok, String(res.status));
  check("it names the domain", cfg.domain === "crazycauldron.art", cfg.domain);
  check("it carries the $COOK contract address", cfg.cookMint.length > 30, cfg.cookMint);
  check("and the minimum hold", cfg.minHold > 0, String(cfg.minHold));
  check(
    "the socials say none, rather than nothing",
    cfg.social.x === "none" && cfg.social.telegram === "none",
    `${cfg.social.x} / ${cfg.social.telegram}`,
  );

  /*
   * Everything above is public by design. Anything below would not be, and
   * this endpoint is reachable by anyone who can load the page.
   */
  for (const secret of [
    process.env.JWT_SECRET,
    process.env.RPC_URL,
    process.env.DATABASE_URL,
    process.env.ADMIN_TOKEN,
  ]) {
    if (!secret || secret.length < 8) continue;
    check(`it does not leak ${secret.slice(0, 6)}...`, !raw.includes(secret));
  }
  check(
    "and names no secret-shaped key at all",
    !/secret|password|private|jwt|rpc/i.test(raw),
    raw.slice(0, 120),
  );

  // --- what /health says -----------------------------------------------------
  console.log("\n-- what /health gives away --");
  const healthRes = await fetch(`${HTTP}/health`);
  const healthRaw = await healthRes.text();
  const health = JSON.parse(healthRaw) as { database: Record<string, unknown> };

  check("it answers", healthRes.ok, String(healthRes.status));
  check(
    "the database block is exactly four fields",
    ["backend", "ok", "players", "sizeBytes"].every((k) => k in health.database) &&
      Object.keys(health.database).length === 4,
    Object.keys(health.database).join(", "),
  );

  /*
   * /health is unauthenticated - it has to be, a load balancer polls it - so
   * everything in it is public. It used to carry the connection string with
   * the password taken out, which still names the host and the user.
   */
  for (const forbidden of ["postgres://", "postgresql://", "@", "://", ".db", "password"]) {
    check(`no "${forbidden}" anywhere in it`, !JSON.stringify(health).includes(forbidden));
  }
  for (const secret of [process.env.DATABASE_URL, process.env.DATABASE_PATH]) {
    if (!secret || secret.length < 6) continue;
    check(`and nothing of ${secret.slice(0, 8)}...`, !healthRaw.includes(secret));
  }

  // --- the bundle ----------------------------------------------------------
  console.log("\n-- the built client carries them --");
  const built = bundle();
  check("there is a built bundle", built.length > 0, "run npm run build -w client if this fails");
  if (built) {
    check("it knows the page paths", ["/official", "/rules", "/roadmap"].every((p) => built.includes(p)));
    check(
      "the official page warns about fake contract addresses",
      /Any other contract address is a different token/.test(built),
    );
    check(
      "the rules say none of it is financial advice",
      /Nothing on this site is financial advice/i.test(built),
    );
    check(
      "that $COOK is a community token, not an investment",
      /community token/i.test(built) && /not an investment/i.test(built),
    );
    check("and promise nothing about price or rewards", /no promise about its price/i.test(built));

    /*
     * The fee model, and the three things that have to travel with it.
     *
     * $COOK uses pump.fun's Holder Rewards, which pays trading fees to holders
     * in SOL. Saying so is fine; saying it without the next two sentences is
     * not. That it is pump.fun's mechanism rather than the game's, and that
     * nothing about it is promised, is what keeps a description of a feature
     * from reading as a claim about income.
     */
    check(
      "the fees are described as Holder Rewards, paid to holders",
      /holder rewards/i.test(built) && /distribut\w* to holders in SOL/i.test(built),
    );
    check(
      "as pump.fun's mechanism and not the game's",
      /pump\.fun's (?:system|mechanism)/i.test(built) &&
        /(?:does not operate it|game does not operate)/i.test(built),
    );
    check(
      "with no guarantee attached",
      /cannot guarantee/i.test(built),
    );
    check(
      "and the team funding the servers",
      /funded by the team/i.test(built),
    );

    /*
     * The disclaimer stays exactly as it was. A token can have a fee mechanism
     * and still promise nothing, and these are the sentences that say so.
     */
    for (const required of [
      /no promise about its price/i,
      /no promise of rewards, income, airdrops or returns of any kind/i,
      /Nothing on this site is financial advice/i,
    ]) {
      check(`the disclaimer still says ${required.source}`, required.test(built));
    }

    // Wording that would turn a described mechanism into a promise.
    for (const forbidden of [
      /guaranteed (?:rewards?|income|returns?|payouts?)/i,
      /passive income/i,
      /you will (?:earn|receive|be paid)/i,
      /earn(?:ing)?s? (?:just )?(?:by|from) holding/i,
    ]) {
      check(`the bundle never says ${forbidden.source}`, !forbidden.test(built));
    }
    check("and that there are no cash prizes", /no cash prizes/i.test(built));
    check(
      "and that items are tied to the wallet",
      /belong to the wallet/i.test(built),
    );
    check("the login panel links to them", /cc-links/.test(built));
  }

  console.log(`\ntest-pages: ${failures === 0 ? "OK" : `${failures} FAILED`}`);
  if (failures > 0) process.exit(1);
}

await main();
