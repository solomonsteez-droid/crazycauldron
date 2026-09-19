import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "..", "..");

// Root .env, so client and server read the same file.
loadEnv({ path: path.join(REPO_ROOT, ".env") });

function str(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required env var ${name}. Copy .env.example to .env.`);
  }
  return value;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`Env var ${name} must be a number, got "${raw}"`);
  return parsed;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw.toLowerCase() === "true" || raw === "1";
}

const nodeEnv = str("NODE_ENV", "development");
const isProduction = nodeEnv === "production";
const testBypassHold = bool("TEST_BYPASS_HOLD", false);

// Hard stop: the dev-only gate bypass must never be reachable in production.
if (isProduction && testBypassHold) {
  throw new Error(
    "Refusing to start: TEST_BYPASS_HOLD=true with NODE_ENV=production. " +
      "The token gate bypass is a development-only switch.",
  );
}

const databasePath = str("DATABASE_PATH", "./data/crazycauldron.db");

export const config = {
  nodeEnv,
  isProduction,
  port: num("PORT", 2567),
  corsOrigins: str("CORS_ORIGIN", "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  jwtSecret: str("JWT_SECRET"),
  siwsDomain: str("SIWS_DOMAIN", "localhost:5173"),
  siwsUri: str("SIWS_URI", "http://localhost:5173"),

  /** Server-only. Must never be serialised into a client payload. */
  rpcUrl: str("RPC_URL", "https://api.devnet.solana.com"),
  cookMint: str("COOK_MINT"),
  minHold: num("MIN_HOLD", 2000),
  testBypassHold,

  databasePath: path.isAbsolute(databasePath) ? databasePath : path.join(REPO_ROOT, databasePath),

  hubMaxPlayers: num("HUB_MAX_PLAYERS", 30),
  globalMaxPlayers: num("GLOBAL_MAX_PLAYERS", 300),
} as const;

if (config.testBypassHold) {
  console.warn(
    "[config] TEST_BYPASS_HOLD=true - the $COOK balance check is DISABLED. Development only.",
  );
}
