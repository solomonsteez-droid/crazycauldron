/**
 * Uses the committed client build, or makes one - and never guesses which.
 *
 *   node scripts/build-client.mjs --verify    use the committed build, or fail
 *   node scripts/build-client.mjs --build     build it and write the stamp
 *   node scripts/build-client.mjs --explain   print exactly what is hashed
 *
 * The deploy host has 1 GB and bundling the client needs most of it, so
 * client/dist is committed and the host checks it rather than making it. The
 * danger of a committed build is that it goes stale in silence, so it carries
 * a stamp: a hash of every file that can change what the bundle contains.
 *
 * **Why this is a flag and not an environment check.** It used to switch on
 * `NODE_ENV === "production"`, and that is exactly how a deploy of 789ac74
 * ended up running vite on the host and dying. NODE_ENV was never set during
 * the build: it lives in ecosystem.config.js, which pm2 applies to the server
 * process it starts, long after the build has finished. The guard simply never
 * ran, and the fallback was to build.
 *
 * A mode that matters this much cannot be inferred. The caller states it, and
 * the root `build` script - the one the host runs - states `--verify`, which
 * has no path that builds anything. Environment variables are still consulted,
 * but only to refuse: if anything says we are on a host, building is off
 * whatever the flags say.
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
 * moved.
 *
 * `client/public` is in here because vite copies it into dist verbatim. The
 * art is most of what a change to this game actually is - a re-nudged hat
 * offset, a repainted map - and leaving it out meant the one kind of edit that
 * happens most often could not make the stamp move. A stale dist would then
 * verify happily on the host and ship yesterday's art with today's code.
 *
 * `package-lock.json` is deliberately absent. It is committed, so it matches
 * in principle; in practice the host runs an install before the build and an
 * install may rewrite it, which would be a mismatch caused by the installer
 * rather than by anything that changes the bundle. The package.json files are
 * hashed instead: they pin the ranges, and nothing rewrites them.
 */
const WATCHED = [
  ["client", "src"],
  ["client", "public"],
  ["client", "index.html"],
  ["client", "package.json"],
  ["client", "vite.config.ts"],
  ["client", "tsconfig.json"],
  ["shared", "src"],
  ["shared", "package.json"],
  ["tsconfig.base.json"],
];

/**
 * Extensions whose bytes are text, and are normalised before hashing.
 */
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".html",
  ".css",
  ".md",
  ".txt",
]);

/**
 * Extensions whose bytes are hashed as they are, and only under
 * `client/public`.
 *
 * The scope is the point. Everything in that directory is copied into dist
 * verbatim and served, so a picture there is part of what ships and has to
 * count. Everywhere else a binary is a leftover - a screenshot dropped in
 * src, an export nobody deleted - and hashing it would put the number at the
 * mercy of files one machine has and the other does not, which is the failure
 * this whole scheme exists to avoid.
 */
const BINARY_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".mp3", ".ogg", ".wav", ".woff", ".woff2", ".ttf"]);

/** Where a binary counts as source rather than as litter. */
const ASSET_ROOT = "client/public/";

/**
 * Whether a file goes into the hash at all.
 *
 * An allowlist rather than a denylist: a stray file - an editor swap file, a
 * .orig from a merge, a screenshot somebody dropped in src - would otherwise
 * be hashed on the machine that has it and not on the one that does not, and
 * the mismatch would be blamed on line endings for an afternoon.
 */
function hashed(relative) {
  const extension = path.extname(relative).toLowerCase();
  if (TEXT_EXTENSIONS.has(extension)) return true;
  return relative.startsWith(ASSET_ROOT) && BINARY_EXTENSIONS.has(extension);
}

/** Directories never worth walking into. */
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

/**
 * Every hashable file under a path, as POSIX-relative paths.
 *
 * Returned unsorted; the caller sorts the whole set at once. Sorting per
 * directory would be deterministic too, but sorting the complete list by its
 * full path is deterministic *and* obvious, and this is a function whose
 * output has to be identical on two operating systems.
 */
function collect(target, found) {
  const stat = fs.statSync(target, { throwIfNoEntry: false });
  if (!stat) return;

  if (stat.isFile()) {
    const relative = path.relative(ROOT, target).split(path.sep).join("/");
    if (hashed(relative)) found.push(relative);
    return;
  }

  for (const entry of fs.readdirSync(target)) {
    // Dotfiles are tooling, not source, and differ between machines.
    if (entry.startsWith(".")) continue;
    if (SKIP_DIRS.has(entry)) continue;
    collect(path.join(target, entry), found);
  }
}

/** The files that go into the stamp, in one stable order. */
function hashedFiles() {
  const found = [];
  for (const parts of WATCHED) collect(path.join(ROOT, ...parts), found);
  // Plain code-unit order: the same on every platform and every locale.
  return found.sort();
}

/**
 * One file's contribution, normalised so the same commit hashes the same
 * everywhere.
 *
 * Two things differ between a Windows working tree and a Linux checkout of the
 * identical commit, and both are removed here: line endings, because git
 * checks these files out as CRLF on Windows and LF on Linux, and a leading
 * byte-order mark, which some editors add and others do not.
 *
 * Binary files get neither treatment - their bytes are the same on both
 * machines already, and "normalising" a PNG would corrupt it into a number
 * that means nothing.
 */
function normalise(file) {
  const bytes = fs.readFileSync(path.join(ROOT, file));
  if (!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) return bytes;

  let text = bytes.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text.replace(/\r\n/g, "\n");
}

function stampOf() {
  const hash = createHash("sha256");
  for (const file of hashedFiles()) {
    // The path as well as the bytes, so a rename is a change.
    hash.update(file);
    hash.update("\0");
    hash.update(normalise(file));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

/**
 * The same walk, printed.
 *
 * When a stamp does disagree between two machines, this is how to find out
 * why in one step: run it on both and diff. A file present on one side, or one
 * whose digest differs, is named rather than guessed at.
 */
function explain() {
  const files = hashedFiles();
  for (const file of files) {
    const digest = createHash("sha256").update(normalise(file)).digest("hex").slice(0, 12);
    console.log(`${digest}  ${file}`);
  }
  console.log(`\n${files.length} files -> ${stampOf()}`);
}

function buildClient() {
  const result = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "build", "-w", "client"],
    { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/**
 * Signals that we are on a deploy host rather than somebody's machine.
 *
 * Only ever used to refuse. Any one of these being present turns building off,
 * even if the caller asked for it - the failure mode of building here is a
 * killed deploy, and the failure mode of refusing is a clear message.
 */
function onDeployHost() {
  return (
    process.env.COLYSEUS_CLOUD !== undefined ||
    process.env.NODE_ENV === "production" ||
    process.env.CI === "true"
  );
}

const argv = process.argv.slice(2);
const wanted = stampOf();

if (argv.includes("--stamp-only")) {
  console.log(wanted);
  process.exit(0);
}
if (argv.includes("--explain")) {
  explain();
  process.exit(0);
}

const prebuilt = fs.existsSync(path.join(DIST, "index.html"));
const committed = fs.existsSync(STAMP) ? fs.readFileSync(STAMP, "utf8").trim() : null;
const mayBuild = argv.includes("--build") && !onDeployHost();

if (prebuilt && committed === wanted) {
  console.log(`client: using the committed build (${wanted}) - nothing to do`);
  process.exit(0);
}

if (mayBuild) {
  buildClient();
  fs.writeFileSync(STAMP, `${wanted}\n`);
  console.log(`client: built and stamped ${wanted}`);
  process.exit(0);
}

/*
 * Everything from here is a refusal, and it is deliberate.
 *
 * Building is what runs out of memory on this host. A deploy that stops now
 * with the command to fix it is a better outcome than one that dies halfway
 * through a bundle and leaves somebody reading a heap trace.
 */
const reason = !prebuilt
  ? "client/dist is missing - the built client should be committed."
  : "client/dist does not match the source it was built from.";

console.error(
  [
    "",
    reason,
    committed
      ? `  committed build: ${committed}`
      : "  committed build: no stamp",
    `  this source:     ${wanted}`,
    "",
    "The client is committed rather than built here: bundling it needs about",
    "1 GB and this host has that in total. Rebuild it on a machine that can,",
    "and commit the result:",
    "",
    "  npm run build:client",
    "  git add client/dist && git commit -m 'client: rebuild'",
    "",
    "If the two stamps disagree on machines you believe are identical, run",
    "`node scripts/build-client.mjs --explain` on each and diff the output.",
    "",
  ].join("\n"),
);
process.exit(1);
