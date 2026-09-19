/**
 * Builds the client, or confirms the committed build is the right one.
 *
 * The deploy host has 1 GB. Bundling the client peaks near all of it once npm,
 * tsc and vite are counted together, and a deploy has already been killed for
 * it; building only shared and server peaks at about 325 MB. So the built
 * client is committed, and in production this checks it rather than making it.
 *
 * The obvious danger of a committed build is that it goes stale - somebody
 * changes the client, deploys, and the old bundle ships in silence. So the
 * build writes a stamp: a hash of every file that can change what the bundle
 * contains. In production a stamp that does not match is a failed deploy with
 * the command to fix it, which is the one outcome nobody can miss.
 *
 * Anywhere else - a developer's machine, `npm run build` by hand - this just
 * builds the client as it always did.
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const DIST = path.join(ROOT, "client", "dist");
const STAMP = path.join(DIST, ".build-stamp");

/**
 * Everything that can change the bundle.
 *
 * The client's own source and config, and shared - which is compiled into the
 * bundle, so a change there changes the client even though no client file
 * moved. Not node_modules: a dependency change comes with a package-lock
 * change, which is in the list.
 */
const WATCHED = [
  ["client", "src"],
  ["client", "index.html"],
  ["client", "package.json"],
  ["client", "vite.config.ts"],
  ["client", "tsconfig.json"],
  ["shared", "src"],
  ["package-lock.json"],
];

/** Every file under a path, sorted, so the hash does not depend on disk order. */
function walk(target) {
  const stat = fs.statSync(target, { throwIfNoEntry: false });
  if (!stat) return [];
  if (stat.isFile()) return [target];

  return fs
    .readdirSync(target)
    .sort()
    .flatMap((name) => walk(path.join(target, name)));
}

function stampOf() {
  const hash = createHash("sha256");
  for (const parts of WATCHED) {
    for (const file of walk(path.join(ROOT, ...parts))) {
      // The path goes in as well as the bytes, so a rename is a change.
      hash.update(path.relative(ROOT, file).replace(/\\/g, "/"));

      /*
       * Line endings are normalised out, and this is the whole reason the
       * stamp works at all. These files are committed with LF and checked
       * out with CRLF on Windows, so the same commit would hash
       * differently on the machine that builds the client and the Linux
       * host that checks it - and every deploy would fail with a mismatch
       * nobody could explain. Everything watched is text; there is nothing
       * here to corrupt by doing it.
       */
      hash.update(fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n"));
    }
  }
  return hash.digest("hex").slice(0, 16);
}

function buildClient() {
  const result = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "build", "-w", "client"],
    { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const wanted = stampOf();

// A way to ask what the stamp would be, without building anything.
if (process.argv.includes("--stamp-only")) {
  console.log(wanted);
  process.exit(0);
}
const prebuilt = fs.existsSync(path.join(DIST, "index.html"));
const committed = fs.existsSync(STAMP) ? fs.readFileSync(STAMP, "utf8").trim() : null;

if (process.env.NODE_ENV === "production" && prebuilt) {
  if (committed === wanted) {
    console.log(`client: using the committed build (${wanted}) - nothing to do`);
    process.exit(0);
  }

  /*
   * Failing here rather than building. Building is what runs out of memory on
   * this host, and a deploy that dies halfway through a bundle is a worse
   * outcome than one that stops immediately and says what to run.
   */
  console.error(
    [
      "",
      "client/dist does not match the source it was built from.",
      committed
        ? `  committed build: ${committed}`
        : "  committed build: no stamp - it was built before this check existed",
      `  this source:     ${wanted}`,
      "",
      "The client is committed rather than built here, because building it",
      "needs about 1 GB and this host has that in total. Rebuild and commit it:",
      "",
      "  npm run build -w client",
      "  git add client/dist && git commit -m 'client: rebuild'",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

buildClient();
fs.writeFileSync(STAMP, `${wanted}\n`);
console.log(`client: built and stamped ${wanted}`);
