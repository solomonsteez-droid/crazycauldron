import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

export default defineConfig({
  // One .env at the repo root feeds both workspaces. Only VITE_-prefixed vars
  // reach the bundle, which is why every secret in .env.example lacks that
  // prefix - RPC_URL and JWT_SECRET must never ship to a browser.
  envDir: repoRoot,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    // Phaser alone is ~1.2MB; warning about it on every build is just noise.
    chunkSizeWarningLimit: 2000,
  },
});
