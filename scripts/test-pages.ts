/**
 * The routes and the endpoints behind the site, against a running server.
 *
 *   npx tsx scripts/test-pages.ts        (against a running server)
 *
 * What the pages *say* is checked by scripts/test-site.ts, which renders them
 * under Node. This is the other half: that the server answers each path with
 * the right one of the two documents, that the endpoints they read return what
 * they promise, and that neither leaks anything.
 *
 * The one it watches hardest is /public/config, because that is where the
 * contract address a player copies comes from. It must carry the address, and
 * it must carry nothing else - a secret served to every visitor is a secret no
 * longer.
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

/**
 * One of the two built bundles, whatever Vite named it this time.
 *
 * "index" is the marketing site and the two legal pages; "play" is the game.
 * They are separate files now, so a check has to say which one it means - the
 * login panel's links are in the game's and the fee wording is in the site's,
 * and a check that did not say would quietly stop checking anything.
 */
function bundle(which: "index" | "play" = "index"): string {
  if (!fs.existsSync(BUNDLE_DIR)) return "";
  const file = fs
    .readdirSync(BUNDLE_DIR)
    .find((name) => name.startsWith(`${which}-`) && name.endsWith(".js"));
  return file ? fs.readFileSync(path.join(BUNDLE_DIR, file), "utf8") : "";
}

async function main(): Promise<void> {
  console.log(`test-pages against ${HTTP}\n`);

  // --- routing -------------------------------------------------------------
  console.log("-- the server answers every page --");

  /*
   * Two documents, and which one each path gets.
   *
   * The site and the game are separate bundles now: the game's is 1.8 MB
   * because Phaser is most of it, and the front page must not carry it. So
   * only /play may answer with play.html, and a path that quietly drifted into
   * the game's document would cost every visitor the whole renderer.
   */
  const sitePaths = ["/", "/whitepaper", "/docs", "/roadmap", "/official", "/rules"];
  for (const page of [...sitePaths, "/play"]) {
    const res = await fetch(`${HTTP}${page}`);
    const type = res.headers.get("content-type") ?? "";
    const body = await res.text();
    const isGame = /src="\/assets\/play-[^"]+\.js"/.test(body);
    const wantsGame = page === "/play";

    check(
      `${page} is served`,
      res.ok && type.includes("text/html"),
      `${res.status} ${type}`,
    );
    check(
      `${page} is the ${wantsGame ? "game" : "site"}`,
      isGame === wantsGame,
      isGame ? "play.html" : "index.html",
    );
  }

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
  check(
    "and it says whether the address may be published",
    typeof (cfg as { showMint?: unknown }).showMint === "boolean",
    String((cfg as { showMint?: unknown }).showMint),
  );

  // --- the live counters ---------------------------------------------------
  console.log("\n-- /stats --");
  const statsRes = await fetch(`${HTTP}/stats`);
  const statsType = statsRes.headers.get("content-type") ?? "";
  check(
    "it answers with JSON, not the app shell",
    statsRes.ok && statsType.includes("application/json"),
    `${statsRes.status} ${statsType}`,
  );

  const stats = (await statsRes.json()) as Record<string, unknown>;
  for (const key of ["playersOnline", "chefsRegistered", "dishesCooked", "superbsToday"]) {
    check(
      `${key} is a number`,
      typeof stats[key] === "number" && Number.isFinite(stats[key] as number),
      String(stats[key]),
    );
  }
  check(
    "and it carries nothing else",
    Object.keys(stats).length === 4,
    Object.keys(stats).join(", "),
  );

  /*
   * A public counter endpoint is a place a wallet could end up by accident,
   * so it is checked for one the way /public/config is checked for secrets.
   */
  const statsRaw = JSON.stringify(stats);
  check(
    "no wallet-shaped string anywhere in it",
    !/[1-9A-HJ-NP-Za-km-z]{32,44}/.test(statsRaw),
  );
  check(
    "it is cached rather than counted per visitor",
    (statsRes.headers.get("cache-control") ?? "").includes("max-age="),
    statsRes.headers.get("cache-control") ?? "(none)",
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
    check(
      "it knows the page paths",
      ["/official", "/rules", "/roadmap", "/whitepaper", "/play"].every((p) => built.includes(p)),
    );
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
     * The fee model, and the sentence that has to travel with it.
     *
     * $COOK takes standard pump.fun creator fees; they go to the treasury and
     * pay for the game. Saying where they go is fine. Saying it alone is not,
     * because a reader who wants to hear "and some comes back to me" will, so
     * "nothing is paid out to holders" is asserted as its own requirement
     * rather than trusted to be implied.
     *
     * The page said the opposite for a while - Holder Rewards, trading fees
     * distributed to holders in SOL - which is why the forbidden list below
     * has the affirmative phrasings in it by name.
     */
    check(
      "the fees are described as pump.fun creator fees",
      /creator fees/i.test(built) && /pump\.fun/i.test(built),
    );
    check(
      "received by the team at the treasury wallet",
      /treasury wallet/i.test(built) && /received by the team/i.test(built),
    );
    check(
      "and spent on the servers and the game",
      /fund the servers and the development/i.test(built) &&
        /run the servers and build the game/i.test(built),
    );
    check(
      "with nothing paid out to holders, said outright",
      /nothing is paid out to holders/i.test(built),
    );

    /*
     * And no trace of the model it replaced. These run against the whole
     * bundle, so a stale string anywhere - a page, a tooltip, a comment that
     * survived minification - fails rather than ships.
     *
     * Each pattern needs an affirmative subject, so that the approved sentence
     * "Nothing is paid out to holders" cannot trip the check that exists to
     * enforce it.
     */
    for (const forbidden of [
      /holder rewards/i,
      /fees?\b[^.]{0,60}(?<!nothing )(?:are|is) (?:paid|distributed|shared|split)(?: out)? to holders/i,
      /distribut\w*[^.]{0,60}to holders/i,
      /(?:pays|paid|distributed) to holders in SOL/i,
      /holders (?:receive|earn|get) (?:a )?(?:share|cut|part)/i,
    ]) {
      check(`no fee is promised to holders: ${forbidden.source}`, !forbidden.test(built));
    }

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
    /*
     * The login panel's links are in the game's bundle now, not this one. The
     * split moved the pages out from under the login card, and a check that
     * followed them here would have stopped checking the panel at all.
     */
    const game = bundle("play");
    check("there is a built game too", game.length > 0);
    check("the login panel links to the pages", /cc-links/.test(game));
    check(
      "and the site's own footer does as well",
      ["/official", "/rules", "/whitepaper", "/roadmap"].every((page) =>
        built.includes(`"${page}"`),
      ),
    );
  }

  console.log(`\ntest-pages: ${failures === 0 ? "OK" : `${failures} FAILED`}`);
  if (failures > 0) process.exit(1);
}

await main();
