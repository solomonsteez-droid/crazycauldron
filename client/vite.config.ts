import { defineConfig, type Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const OFFSETS = path.join(here, "public", "assets", "generated", "offsets.json");

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

        // A tidy URL for the workbench; Vite still serves the real file.
        if (url === "/dev/align" || url === "/dev/align/") {
          req.url = "/dev-align.html";
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

        return next();
      });
    },
  };
}

export default defineConfig({
  // One .env at the repo root feeds both workspaces. Only VITE_-prefixed vars
  // reach the bundle, which is why every secret in .env.example lacks that
  // prefix - RPC_URL and JWT_SECRET must never ship to a browser.
  envDir: repoRoot,
  plugins: [devAlign()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    // Phaser alone is ~1.2MB; warning about it on every build is just noise.
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      // Only the game ships. dev-align.html is deliberately not an input.
      input: path.join(here, "index.html"),
    },
  },
});
