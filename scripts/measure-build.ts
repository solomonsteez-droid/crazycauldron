/**
 * How much memory a build actually needs.
 *
 *   npx tsx scripts/measure-build.ts                 the whole root build
 *   npx tsx scripts/measure-build.ts --client        just the client
 *   npx tsx scripts/measure-build.ts --cap 768       under a heap cap
 *
 * The deploy host has 1 GB. Guessing whether a build fits in that is how you
 * find out at deploy time; this measures it here instead, by watching the
 * process tree rather than trusting a single number at the end.
 *
 * Two figures, and they answer different questions. Peak working set is what
 * the host's memory limit is measured against - it includes the code, the
 * buffers and everything the process has touched. Peak heap is what
 * --max-old-space-size caps, and it is the one that produces "JavaScript heap
 * out of memory" when it is exceeded.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");

const args = process.argv.slice(2);
const clientOnly = args.includes("--client");
const capIndex = args.indexOf("--cap");
const cap = capIndex >= 0 ? Number(args[capIndex + 1]) : null;

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

/**
 * Every node process under this shell, summed.
 *
 * A build is a tree - npm spawns npm spawns vite - and the peak that matters
 * is the whole tree at once, because that is what the host is holding.
 */
function sampleWindows(): Promise<{ total: number; largest: number }> {
  return new Promise((resolve) => {
    /*
     * This process is excluded from its own measurement. tsx carries about a
     * hundred megabytes of its own, and counting the tape measure as part of
     * the thing being measured is how a build that fits gets reported as one
     * that does not.
     */
    const child = spawn(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Get-Process node -ErrorAction SilentlyContinue | ` +
          `Where-Object { $_.Id -ne ${process.pid} } | ` +
          "Measure-Object -Property WorkingSet64 -Sum -Maximum | " +
          "ForEach-Object { \"$($_.Sum) $($_.Maximum)\" }",
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );

    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
    child.on("close", () => {
      const [sum, max] = out.trim().split(/\s+/).map(Number);
      resolve({ total: sum || 0, largest: max || 0 });
    });
    child.on("error", () => resolve({ total: 0, largest: 0 }));
  });
}

async function main(): Promise<void> {
  const named = args.find((a) => a.startsWith("--script="))?.slice("--script=".length);
  const script = named ?? (clientOnly ? "build -w client" : "build");
  console.log(`measure-build: npm run ${script}${cap ? ` (heap capped at ${cap} MB)` : ""}\n`);

  const env = { ...process.env };
  if (cap) {
    /*
     * Prepended rather than replaced: the build scripts may set a cap of their
     * own, and the last --max-old-space-size on the line is the one node
     * honours, so this has to come first to be overridden by them - or be the
     * only one, when they set none.
     */
    env.NODE_OPTIONS = `--max-old-space-size=${cap} ${env.NODE_OPTIONS ?? ""}`.trim();
  }

  const startedAt = Date.now();
  const child = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", ...script.split(" ")],
    { cwd: ROOT, shell: process.platform === "win32", env, stdio: ["ignore", "pipe", "pipe"] },
  );

  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));

  let peakTotal = 0;
  let peakLargest = 0;
  let samples = 0;

  const poll = setInterval(() => {
    void sampleWindows().then(({ total, largest }) => {
      samples += 1;
      if (total > peakTotal) peakTotal = total;
      if (largest > peakLargest) peakLargest = largest;
    });
  }, 250);

  const code = await new Promise<number>((resolve) => {
    child.on("close", (exit) => resolve(exit ?? 1));
  });
  clearInterval(poll);

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  const oom = /heap out of memory|Allocation failed/i.test(output);

  console.log(output.split("\n").slice(-12).join("\n"));
  console.log(`\n  exit ${code}${oom ? " - HEAP OUT OF MEMORY" : ""}`);
  console.log(`  took ${seconds}s over ${samples} samples`);
  console.log(`  peak working set, all node processes: ${mb(peakTotal)}`);
  console.log(`  peak working set, largest single one: ${mb(peakLargest)}`);
  if (cap) console.log(`  heap cap in force: ${cap} MB`);

  process.exit(code === 0 && !oom ? 0 : 1);
}

await main();
