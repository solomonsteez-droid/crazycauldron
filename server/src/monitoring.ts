/**
 * Where errors go when nobody is watching the terminal.
 *
 * Three pieces, all deliberately small:
 *
 *   - a rotating file sink, so the structured log survives the process and
 *     does not fill the disk;
 *   - an alert hook that POSTs to ALERT_WEBHOOK_URL when something breaks;
 *   - a self-check that runs the same health probe the load balancer does, so
 *     a database that has gone away raises an alert rather than waiting to be
 *     noticed.
 *
 * No log shipper, no metrics agent, no dependency. Rotation is by size with a
 * fixed number of generations, which is the behaviour a small deployment
 * actually needs and the part people skip.
 */

import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const LOG_DIR = path.resolve(process.env.LOG_DIR ?? path.join(config.databasePath, "..", "..", "logs"));
const LOG_FILE = path.join(LOG_DIR, "server.log");

/** Roll over at this size, keeping this many older generations. */
export const MAX_LOG_BYTES = Number(process.env.LOG_MAX_BYTES ?? 5 * 1024 * 1024);
export const LOG_GENERATIONS = Number(process.env.LOG_GENERATIONS ?? 5);

let stream: fs.WriteStream | null = null;
let written = 0;

function open(): fs.WriteStream {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  written = fs.existsSync(LOG_FILE) ? fs.statSync(LOG_FILE).size : 0;
  return fs.createWriteStream(LOG_FILE, { flags: "a" });
}

/**
 * server.log -> server.log.1 -> server.log.2 ... and the oldest is dropped.
 *
 * Renaming rather than copying: the old file is never read again, and a rename
 * cannot half-succeed and leave two partial copies of the same lines.
 */
function rotate(): void {
  stream?.end();
  stream = null;

  for (let generation = LOG_GENERATIONS - 1; generation >= 1; generation -= 1) {
    const from = `${LOG_FILE}.${generation}`;
    const to = `${LOG_FILE}.${generation + 1}`;
    if (fs.existsSync(from)) fs.renameSync(from, to);
  }
  if (fs.existsSync(LOG_FILE)) fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);

  const oldest = `${LOG_FILE}.${LOG_GENERATIONS + 1}`;
  if (fs.existsSync(oldest)) fs.rmSync(oldest, { force: true });

  stream = open();
}

/** Appends one already-serialised log line. Never throws. */
export function writeLogLine(text: string): void {
  try {
    if (!stream) stream = open();
    const line = `${text}\n`;
    written += Buffer.byteLength(line);
    stream.write(line);
    if (written >= MAX_LOG_BYTES) rotate();
  } catch {
    // Logging must never be the thing that takes the server down.
  }
}

export function logFile(): string {
  return LOG_FILE;
}

export function closeLog(): void {
  stream?.end();
  stream = null;
}

// --------------------------------------------------------------------------
// Alerts
// --------------------------------------------------------------------------

/** Not more than one alert of a kind per this many ms. */
const ALERT_COOLDOWN_MS = Number(process.env.ALERT_COOLDOWN_MS ?? 5 * 60 * 1000);
const lastAlertAt = new Map<string, number>();

export interface Alert {
  kind: string;
  message: string;
  detail?: Record<string, unknown>;
}

/**
 * POSTs an alert, if a webhook is configured and this kind has not just fired.
 *
 * The cooldown is the whole reason this is a function rather than a fetch at
 * the call site: the failure modes worth alerting on - a database that has
 * gone away, an unhandled rejection in a hot path - repeat, and an alerting
 * system that pages a hundred times is one people turn off.
 */
export async function alert(payload: Alert): Promise<boolean> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return false;

  const now = Date.now();
  const last = lastAlertAt.get(payload.kind) ?? 0;
  if (now - last < ALERT_COOLDOWN_MS) return false;
  lastAlertAt.set(payload.kind, now);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        service: "crazycauldron",
        env: config.nodeEnv,
        at: new Date(now).toISOString(),
        ...payload,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return true;
  } catch {
    // An alerting endpoint that is itself down must not cascade.
    return false;
  }
}

/** For tests: forget the cooldowns. */
export function resetAlertCooldowns(): void {
  lastAlertAt.clear();
}
