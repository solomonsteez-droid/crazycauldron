import { defineConfig, type Plugin } from "vite";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const GENERATED = path.join(here, "public", "assets", "generated");
const AREA_MAPS = path.join(repoRoot, "shared", "src", "content", "maps");
const OFFSETS = path.join(GENERATED, "offsets.json");

/** Reads a JSON request body, with a ceiling so a bad client cannot fill memory. */
function readJson(req: { on: (event: string, cb: (chunk: Buffer) => void) => void }): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) return reject(new Error("body too large"));
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(err);
      }
    });
  });
}

/** Overlay and area ids are file names; anything else is refused. */
const SAFE_ID = /^[a-z0-9_]+$/;

/**
 * The alignment workbench at /dev/align.
 *
 * Only ever registered by the dev server, and the page is excluded from the
 * production build, so neither the route nor the endpoint that writes to disk
 * can exist in a deployed bundle.
 */
function devAlign(): Plugin {
  return {
    name: "crazycauldron-dev-align",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];

        // Tidy URLs for the workbenches; Vite still serves the real files.
        if (url === "/dev/align" || url === "/dev/align/") {
          req.url = "/dev-align.html";
          return next();
        }
        if (url === "/dev/mapedit" || url === "/dev/mapedit/") {
          req.url = "/dev-mapedit.html";
          return next();
        }

        if (url === "/dev/offsets" && req.method === "POST") {
          const chunks: Buffer[] = [];
          req.on("data", (chunk: Buffer) => chunks.push(chunk));
          req.on("end", () => {
            try {
              const body = Buffer.concat(chunks).toString("utf8");
              JSON.parse(body); // Refuse to write anything that is not JSON.
              fs.mkdirSync(path.dirname(OFFSETS), { recursive: true });
              fs.writeFileSync(OFFSETS, `${body}\n`);
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true, wrote: path.relative(repoRoot, OFFSETS) }));
            } catch (err) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: (err as Error).message }));
            }
          });
          return undefined;
        }

        /*
         * The eraser writes the cleaned overlay straight back to generated/.
         * Automatic extraction cannot get these drops perfectly clean - they
         * are three different compositions, not one figure re-dressed - so the
         * last few pixels are removed by hand and this is where they land.
         */
        if (url === "/dev/overlay" && req.method === "POST") {
          void (async () => {
            try {
              const body = (await readJson(req)) as { kind?: string; id?: string; png?: string };
              const kind = body.kind === "hats" || body.kind === "cloaks" ? body.kind : null;
              const id = String(body.id ?? "");
              const png = String(body.png ?? "");
              if (!kind || !SAFE_ID.test(id)) throw new Error("bad kind or id");
              if (!png.startsWith("data:image/png;base64,")) throw new Error("not a PNG data url");

              const file = path.join(GENERATED, kind, `${id}.png`);
              fs.mkdirSync(path.dirname(file), { recursive: true });
              fs.writeFileSync(file, Buffer.from(png.split(",")[1] ?? "", "base64"));
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true, wrote: path.relative(repoRoot, file) }));
            } catch (err) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: (err as Error).message }));
            }
          })();
          return undefined;
        }

        // Re-cut one item from its source drop, undoing any hand erasing.
        if (url === "/dev/recut" && req.method === "POST") {
          void (async () => {
            try {
              const body = (await readJson(req)) as { id?: string };
              const id = String(body.id ?? "");
              if (!SAFE_ID.test(id)) throw new Error("bad id");

              const child = spawn(
                process.platform === "win32" ? "npx.cmd" : "npx",
                ["tsx", "scripts/process-sprites.ts", `--only=${id}`],
                { cwd: repoRoot, shell: false },
              );
              let output = "";
              child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
              child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
              child.on("close", (code) => {
                res.statusCode = code === 0 ? 200 : 500;
                res.end(JSON.stringify({ ok: code === 0, output: output.slice(-2000) }));
              });
            } catch (err) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: (err as Error).message }));
            }
          })();
          return undefined;
        }

        /*
         * The map editor's save. It writes the same file the generator writes,
         * which is the point: a hand correction and a generated pass are the
         * same artefact, and re-running the generator overwrites the
         * correction - which the file says at the top of itself.
         */
        if (url === "/dev/area" && req.method === "POST") {
          void (async () => {
            try {
              const area = (await readJson(req)) as { id?: unknown; cols?: unknown; rows?: unknown; walkable?: unknown };
              const id = String(area.id ?? "");
              if (!SAFE_ID.test(id)) throw new Error("bad area id");
              if (!Array.isArray(area.walkable) || area.walkable.length !== area.rows) {
                throw new Error("the walkable mask is the wrong height");
              }
              for (const row of area.walkable as unknown[]) {
                if (typeof row !== "string" || row.length !== area.cols) {
                  throw new Error("the walkable mask is the wrong width");
                }
              }

              const file = path.join(AREA_MAPS, `${id}.json`);
              if (!fs.existsSync(file)) throw new Error(`no such area: ${id}`);
              fs.writeFileSync(file, `${JSON.stringify(area, null, 2)}\n`);

              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true, wrote: path.relative(repoRoot, file) }));
            } catch (err) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: (err as Error).message }));
            }
          })();
          return undefined;
        }

        // The same checks the server runs at startup, against what is on
        // screen - so a mistake is caught here rather than by a failed boot.
        if (url === "/dev/area/check" && req.method === "POST") {
          void (async () => {
            try {
              const area = await readJson(req);
              const child = spawn(
                process.platform === "win32" ? "npx.cmd" : "npx",
                ["tsx", "scripts/check-area.ts"],
                { cwd: repoRoot, shell: process.platform === "win32" },
              );
              child.stdin.write(JSON.stringify(area));
              child.stdin.end();

              let output = "";
              child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
              child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
              child.on("close", () => {
                const problems = output.split("\n").map((l) => l.trim()).filter(Boolean);
                res.statusCode = 200;
                res.end(JSON.stringify({ ok: true, problems: problems.filter((p) => p !== "OK") }));
              });
            } catch (err) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: (err as Error).message }));
            }
          })();
          return undefined;
        }

        return next();
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  // One .env at the repo root feeds both workspaces. Only VITE_-prefixed vars
  // reach the bundle, which is why every secret in .env.example lacks that
  // prefix - RPC_URL and JWT_SECRET must never ship to a browser.
  envDir: repoRoot,

  /*
   * The build command decides what a production build is, not a file.
   *
   * That same shared .env carries NODE_ENV for the server, and Vite reads a
   * NODE_ENV found in an env file as the user's chosen mode. With
   * NODE_ENV=development in it - which is correct, for the server, on a
   * developer's machine - "npm run build" produced a bundle where
   * import.meta.env.DEV was true, so the dev console and the cheat helper
   * shipped. Pinning both flags to the command removes the coupling: serve is
   * development, build is production, whatever any .env says.
   */
  define: {
    "import.meta.env.DEV": JSON.stringify(command === "serve"),
    "import.meta.env.PROD": JSON.stringify(command === "build"),

    /*
     * A production build never carries a server address.
     *
     * This is not belt and braces; it is a bug that shipped. The client build
     * is made on a developer's machine now and committed, and `envDir` points
     * at the repo root, where every developer's .env says
     * VITE_SERVER_HTTP_URL=http://localhost:2567 - correct for them, and
     * catastrophic once it is baked into the bundle the world loads. The
     * deployed client called localhost for /auth and /play and could not sign
     * anybody in.
     *
     * While the host did the building there was no .env there and the
     * same-origin fallback applied. Moving the build is what exposed it, so
     * the fix belongs at the build: in production these are empty, whatever
     * any .env says, and net/env.ts falls through to the origin that served
     * the page. Under `serve` they are left alone, because the dev client on
     * :5173 genuinely does need to be told where :2567 is.
     */
    ...(command === "build"
      ? {
          "import.meta.env.VITE_SERVER_HTTP_URL": '""',
          "import.meta.env.VITE_SERVER_WS_URL": '""',
        }
      : {}),
  },

  plugins: [devAlign()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",

    /*
     * No source map in production, and the reason is the deploy host rather
     * than taste.
     *
     * The map was 11.6 MB against a 1.8 MB bundle, and building it took the
     * client build to a 1.9 GB peak - on a box with 1 GB. Rollup holds the
     * whole mapping in memory while it renders, so this single line is most
     * of the difference between a build that fits and one that is killed.
     * `npm run build -w client -- --sourcemap` still produces one when
     * something needs debugging against the built bundle.
     */
    sourcemap: false,

    /*
     * Never inline an asset into the JavaScript.
     *
     * Vite base64s anything under 4 KB by default, which costs a third more
     * bytes than the file and puts them in the bundle, where they are parsed
     * on every load instead of cached as a file. Nothing here imports an
     * image anyway - everything the game draws is fetched by URL from
     * /assets - so this is a guard against the first one that does.
     */
    assetsInlineLimit: 0,

    // Phaser alone is ~1.2MB; warning about it on every build is just noise.
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      // Only the game ships. dev-align.html is deliberately not an input.
      input: path.join(here, "index.html"),
    },
  },
}));
