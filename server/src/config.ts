import { AUTH_RATE_LIMIT, AUTH_RATE_WINDOW_MS } from "@crazycauldron/shared";
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

/*
 * Production refuses to start rather than starting badly.
 *
 * Every one of these is a setting that is exactly right for a laptop and
 * exactly wrong on the internet, and every one of them is the kind of thing
 * that gets noticed after the fact. A server that will not boot is a bad
 * afternoon; a server that boots with the token gate disabled and the
 * development signing key is a different sort of day.
 */
const refusals: string[] = [];

if (isProduction) {
  if (testBypassHold) {
    refusals.push(
      "TEST_BYPASS_HOLD=true - the token gate bypass is a development-only switch",
    );
  }

  const secret = process.env.JWT_SECRET ?? "";
  if (secret.length < 32) {
    refusals.push("JWT_SECRET is shorter than 32 characters");
  }
  if (secret.includes("dev-only") || secret.includes("change-me")) {
    refusals.push("JWT_SECRET is still the example value from .env.example");
  }

  const origins = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    refusals.push("CORS_ORIGIN is not set - every browser origin would be refused");
  }
  if (origins.some((o) => o.includes("localhost") || o.includes("127.0.0.1"))) {
    refusals.push(`CORS_ORIGIN still allows a local origin (${origins.join(", ")})`);
  }
  if (origins.includes("*")) {
    refusals.push('CORS_ORIGIN is "*" - name the origins that may call this server');
  }

  if ((process.env.SIWS_DOMAIN ?? "").includes("localhost")) {
    refusals.push("SIWS_DOMAIN is localhost - wallets would be asked to sign for the wrong site");
  }
  if ((process.env.RPC_URL ?? "").includes("devnet")) {
    refusals.push("RPC_URL points at devnet - balances would be checked on the wrong chain");
  }
  if (!process.env.COOK_MINT) {
    refusals.push("COOK_MINT is not set");
  }
}

if (refusals.length > 0) {
  throw new Error(
    `Refusing to start with NODE_ENV=production:\n  - ${refusals.join("\n  - ")}\n` +
      "See DEPLOY.md.",
  );
}

const databasePath = str("DATABASE_PATH", "./data/crazycauldron.db");

/*
 * Which database, decided by whether a Postgres URL was given.
 *
 * Nothing else chooses. A deployment that sets DATABASE_URL is on Postgres; a
 * developer's machine, which sets nothing, is on the SQLite file. There is no
 * third setting to get wrong and no way to be on one while configured for the
 * other.
 */
const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";

export const config = {
  nodeEnv,
  isProduction,
  port: num("PORT", 2567),
  corsOrigins: str("CORS_ORIGIN", "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  /**
   * Overridable so a load test can run many sign-ins from one IP without
   * editing source. Leave it at the default in production.
   */
  authRateLimit: num("AUTH_RATE_LIMIT", AUTH_RATE_LIMIT),
  authRateWindowMs: num("AUTH_RATE_WINDOW_MS", AUTH_RATE_WINDOW_MS),

  jwtSecret: str("JWT_SECRET"),
  siwsDomain: str("SIWS_DOMAIN", "localhost:5173"),
  siwsUri: str("SIWS_URI", "http://localhost:5173"),

  /** Server-only. Must never be serialised into a client payload. */
  rpcUrl: str("RPC_URL", "https://api.devnet.solana.com"),
  cookMint: str("COOK_MINT"),
  minHold: num("MIN_HOLD", 2000),
  testBypassHold,

  databasePath: path.isAbsolute(databasePath) ? databasePath : path.join(REPO_ROOT, databasePath),
  /** Empty means SQLite. Anything else is a Postgres connection string. */
  databaseUrl,

  hubMaxPlayers: num("HUB_MAX_PLAYERS", 30),
  globalMaxPlayers: num("GLOBAL_MAX_PLAYERS", 300),
} as const;

if (config.testBypassHold) {
  console.warn(
    "[config] TEST_BYPASS_HOLD=true - the $COOK balance check is DISABLED. Development only.",
  );
}
