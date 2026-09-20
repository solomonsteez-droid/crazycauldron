/**
 * Where garments sit, and the two files that decide it.
 *
 *   npx tsx scripts/test-offsets.ts
 *
 * The complaint this exists for: hand alignment kept getting reset. One file
 * held both the pipeline's computed guess and somebody's hand nudges, so a
 * re-cut either overwrote the nudges or left them measured against a body
 * that had moved underneath them - and either way an afternoon at /dev/align
 * had to be done again.
 *
 * So there are two files with two owners, and this checks the boundary holds:
 * that the pipeline writes only its own, that the tool writes only the other,
 * that the overrides carry nothing but what somebody changed, and that they
 * are expressed against a measured row so a re-cut moves them rather than
 * invalidating them.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOffsets, type Art, type Manifest } from "../client/src/art/manifest.js";
import type { OffsetsFile, OverridesFile } from "../client/src/art/manifest.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const GENERATED = path.join(ROOT, "client", "public", "assets", "generated");
const OVERRIDES = path.join(ROOT, "art", "offsets.overrides.json");

const DIRECTIONS = ["down", "up", "left", "right"] as const;

let failures = 0;
function check(what: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function main(): void {
  console.log("test-offsets\n");

  const manifest = readJson<Manifest>(path.join(GENERATED, "manifest.json"), {} as Manifest);
  const defaults = readJson<OffsetsFile>(path.join(GENERATED, "offsets.default.json"), {
    hats: {},
    cloaks: {},
  });
  const overrides = readJson<OverridesFile>(OVERRIDES, { hats: {}, cloaks: {} });
  const mirror = readJson<OverridesFile>(path.join(GENERATED, "offsets.overrides.json"), {
    hats: {},
    cloaks: {},
  });

  // --- the two files, and who owns each ------------------------------------
  console.log("-- two files, two owners --");
  check(
    "the pipeline writes a defaults file",
    fs.existsSync(path.join(GENERATED, "offsets.default.json")),
  );
  check("the hand nudges live in art/, beside the drawings", fs.existsSync(OVERRIDES));
  check(
    "the single combined file is gone",
    !fs.existsSync(path.join(GENERATED, "offsets.json")),
    "generated/offsets.json",
  );

  const pipeline = fs.readFileSync(path.join(ROOT, "scripts", "process-sprites.ts"), "utf8");
  check(
    "and the pipeline only ever reads the overrides",
    pipeline.includes("OVERRIDES_SOURCE") &&
      !/writeFileSync\(\s*OVERRIDES_SOURCE/.test(pipeline),
  );
  check(
    "it names any item whose default drifted, rather than changing it",
    pipeline.includes("reportDefaultDrift") && pipeline.includes("The override is untouched."),
  );

  const tool = fs.readFileSync(path.join(ROOT, "client", "src", "dev", "align.ts"), "utf8");
  check(
    "the alignment tool posts only the overrides",
    tool.includes('"/dev/overrides"') && !tool.includes('"/dev/offsets"'),
  );

  const mirrored = JSON.stringify(mirror) === JSON.stringify(overrides);
  check("the browser's copy matches the authored one", mirrored, "run npm run sprites if not");

  // --- the defaults cover everything ---------------------------------------
  console.log("\n-- the generated half --");
  for (const kind of ["hats", "cloaks"] as const) {
    const items = manifest[kind] ?? [];
    check(
      `every ${kind.slice(0, -1)} has a computed placement`,
      items.every((item) => defaults[kind]?.[item.id] !== undefined),
      `${items.length} item(s)`,
    );
  }

  console.log("\n-- the measured rows --");
  for (const [body, entry] of Object.entries(manifest.bodies ?? {})) {
    const anchors = entry.anchors;
    check(
      `${body} has a head-top and a shoulder row`,
      anchors !== undefined &&
        Number.isFinite(anchors.headTop) &&
        Number.isFinite(anchors.shoulders),
      anchors ? `head ${anchors.headTop}, shoulders ${anchors.shoulders}, centre ${anchors.centre}` : "none",
    );
    check(
      `  and ${body}'s shoulders are below its head`,
      (anchors?.shoulders ?? 0) > (anchors?.headTop ?? 0),
    );
  }

  // --- the hand-tuned half --------------------------------------------------
  console.log("\n-- the authored half --");
  let values = 0;
  let items = 0;
  for (const kind of ["hats", "cloaks"] as const) {
    for (const [id, item] of Object.entries(overrides[kind] ?? {})) {
      items += 1;
      const listed = DIRECTIONS.filter((direction) => item[direction] !== undefined);
      values += listed.length;

      check(
        `${id} carries only the directions somebody changed`,
        listed.length > 0 && listed.length <= DIRECTIONS.length,
        listed.join(", "),
      );
      check(
        `  and ${id} is a placement the pipeline would not have chosen`,
        listed.some((direction) => {
          const was = defaults[kind]?.[id]?.[direction];
          const now = item[direction]!;
          return !was || was.x !== now.x || was.y !== now.y;
        }),
        "otherwise it is an override that overrides nothing",
      );
    }
  }
  console.log(`  ${values} hand-tuned value(s) across ${items} item(s)`);

  // --- the merge ------------------------------------------------------------
  console.log("\n-- merging the two --");
  const art: Art = { manifest, defaults, overrides };

  for (const body of Object.keys(manifest.bodies ?? {})) {
    const merged = resolveOffsets(art, body);
    const row = manifest.bodies[body]?.anchors?.headTop ?? 0;

    check(
      `${body}: a nudged direction lands where the nudge says`,
      Object.entries(overrides.hats ?? {}).every(([id, item]) =>
        DIRECTIONS.every((direction) => {
          const nudge = item[direction];
          if (!nudge) return true;
          const got = merged.hats[id]?.[direction];
          return got?.x === nudge.x && got?.y === nudge.y + row;
        }),
      ),
      `anchored to row ${row}`,
    );

    check(
      `${body}: a direction nobody touched keeps the computed placement`,
      Object.entries(defaults.hats ?? {}).every(([id, item]) =>
        DIRECTIONS.every((direction) => {
          if (overrides.hats?.[id]?.[direction]) return true;
          const got = merged.hats[id]?.[direction];
          return got?.x === item[direction].x && got?.y === item[direction].y;
        }),
      ),
    );
  }

  /*
   * The property the whole design exists for, proved on a body whose head top
   * is not where it is today. Every real body currently starts its head on
   * row 0 - the pipeline crops each frame tight and scales it to fill - so a
   * re-cut that changed that is exactly the case no real data can exercise.
   */
  console.log("\n-- and a re-cut that moves the figure --");
  const SHIFT = 5;
  const recut: Art = {
    ...art,
    manifest: {
      ...manifest,
      bodies: {
        ...manifest.bodies,
        male: {
          ...manifest.bodies.male!,
          anchors: {
            headTop: (manifest.bodies.male?.anchors?.headTop ?? 0) + SHIFT,
            shoulders: (manifest.bodies.male?.anchors?.shoulders ?? 6) + SHIFT,
            centre: manifest.bodies.male?.anchors?.centre ?? 16,
          },
        },
      },
    },
  };

  const before = resolveOffsets(art, "male");
  const after = resolveOffsets(recut, "male");

  const nudgedId = Object.keys(overrides.hats ?? {})[0];
  check("there is a nudged hat to test with", nudgedId !== undefined, nudgedId ?? "none");

  if (nudgedId) {
    const was = before.hats[nudgedId]?.down;
    const now = after.hats[nudgedId]?.down;
    check(
      `a nudge follows the head ${SHIFT}px down the frame`,
      was !== undefined && now !== undefined && now.y === was.y + SHIFT && now.x === was.x,
      `${was?.x},${was?.y} -> ${now?.x},${now?.y}`,
    );

    /*
     * And the default does not, which is the whole difference. The pipeline
     * rewrites its own file on a re-cut, so its numbers are already correct
     * for the new body; the override is a statement about the head, and the
     * head is where it moved to.
     */
    const untouched = Object.keys(defaults.hats ?? {}).find(
      (id) => overrides.hats?.[id]?.up === undefined,
    );
    if (untouched) {
      check(
        "while a direction nobody touched stays where the pipeline put it",
        after.hats[untouched]?.up.y === defaults.hats[untouched]?.up.y,
      );
    }
  }

  check(
    "resolving the same art twice hands back the same object",
    resolveOffsets(recut, "male") === after,
  );
  check(
    "and a different art is resolved separately",
    resolveOffsets(art, "male") !== after,
  );

  console.log(`\ntest-offsets: ${failures === 0 ? "OK" : `${failures} FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
