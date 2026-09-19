/**
 * Validates one area, read from stdin.
 *
 *   echo '<area json>' | npx tsx scripts/check-area.ts
 *
 * The map editor calls this so a correction can be checked before it is saved,
 * against exactly the rules the server enforces at startup. It is a separate
 * process because the rules live in shared/, which the Vite dev server has no
 * business importing and running.
 */

import { validateLayout, type LayoutProblem } from "@crazycauldron/shared";

const chunks: Buffer[] = [];
process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
process.stdin.on("end", () => {
  let problems: LayoutProblem[] = [];
  try {
    const area = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { map?: number };
    if (typeof area.map !== "number") throw new Error("that is not an area");
    problems = validateLayout(area.map);
  } catch (err) {
    console.log(`could not read the area: ${(err as Error).message}`);
    process.exit(0);
  }

  if (problems.length === 0) console.log("OK");
  else for (const problem of problems) console.log(problem.message);
});
