/**
 * What the server is actually doing, in numbers.
 *
 * Written for the load test, which otherwise can only measure the outside of
 * the box: it can time its own requests but it cannot see whether the
 * simulation loop is keeping up, and "it felt fine at 600 clients" is not a
 * result. So the room loop times itself, every inbound message is counted, and
 * CPU and memory are sampled from the process.
 *
 * Deliberately in-process and unbounded in nothing: the tick samples live in a
 * ring buffer, so a server left running for a week costs the same as one that
 * started a minute ago.
 */

import os from "node:os";

/** How many tick samples to keep. At one tick per 180ms this is ~6 minutes. */
const TICK_SAMPLES = 2000;

const ticks = new Float64Array(TICK_SAMPLES);
let tickCount = 0;
let tickAt = 0;
let slowTicks = 0;

/** Messages handled, by type, since start. */
const messages = new Map<string, number>();
let messageTotal = 0;

const startedAt = Date.now();
let lastCpu = process.cpuUsage();
let lastCpuAt = process.hrtime.bigint();
let peakCpuPercent = 0;
let peakRssBytes = 0;

/**
 * Records how long one simulation step took.
 *
 * A step that runs longer than its own interval means the room is behind, and
 * that is the number that matters at 600 clients - not the average, which
 * stays flat right up until it does not.
 */
export function recordTick(durationMs: number, intervalMs: number): void {
  ticks[tickAt] = durationMs;
  tickAt = (tickAt + 1) % TICK_SAMPLES;
  tickCount += 1;
  if (durationMs > intervalMs) slowTicks += 1;
}

export function recordMessage(type: string): void {
  messages.set(type, (messages.get(type) ?? 0) + 1);
  messageTotal += 1;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

/**
 * CPU use, as a percentage of one core, sampled on its own timer.
 *
 * Node's game loop is single-threaded, so "percent of one core" is the number
 * that says whether there is headroom; percent of the whole machine reads as
 * comfortable on a 16-core box that is in fact saturated.
 *
 * On a timer rather than computed per reader, because a delta is consumed when
 * it is measured: two things polling /health would each see roughly half the
 * work, and a curl between two load-test samples made the next one read zero.
 */
const CPU_SAMPLE_MS = 2000;
let cpuPercentValue = 0;

const cpuTimer = setInterval(() => {
  const now = process.hrtime.bigint();
  const usage = process.cpuUsage(lastCpu);
  const elapsedMicros = Number(now - lastCpuAt) / 1000;

  lastCpu = process.cpuUsage();
  lastCpuAt = now;

  if (elapsedMicros > 0) {
    cpuPercentValue = ((usage.user + usage.system) / elapsedMicros) * 100;
    peakCpuPercent = Math.max(peakCpuPercent, cpuPercentValue);
  }
}, CPU_SAMPLE_MS);
cpuTimer.unref();

function cpuPercent(): number {
  return cpuPercentValue;
}

export interface Snapshot {
  uptimeSeconds: number;
  cpuPercentOfCore: number;
  peakCpuPercentOfCore: number;
  cores: number;
  rssMb: number;
  peakRssMb: number;
  heapUsedMb: number;
  tick: { count: number; p50Ms: number; p95Ms: number; maxMs: number; slow: number };
  messages: { total: number; perSecond: number; byType: Record<string, number> };
}

/** Everything /health and the load test want, sampled now. */
export function snapshot(): Snapshot {
  const cpu = cpuPercent();
  const memory = process.memoryUsage();
  peakRssBytes = Math.max(peakRssBytes, memory.rss);

  const filled = Math.min(tickCount, TICK_SAMPLES);
  const samples = Array.from({ length: filled }, (_, i) => ticks[i] ?? 0);
  const uptimeSeconds = (Date.now() - startedAt) / 1000;
  const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;

  return {
    uptimeSeconds: Math.round(uptimeSeconds),
    cpuPercentOfCore: Math.round(cpu * 10) / 10,
    peakCpuPercentOfCore: Math.round(peakCpuPercent * 10) / 10,
    cores: os.cpus().length,
    rssMb: mb(memory.rss),
    peakRssMb: mb(peakRssBytes),
    heapUsedMb: mb(memory.heapUsed),
    tick: {
      count: tickCount,
      p50Ms: Math.round(percentile(samples, 50) * 100) / 100,
      p95Ms: Math.round(percentile(samples, 95) * 100) / 100,
      maxMs: Math.round(Math.max(0, ...samples) * 100) / 100,
      slow: slowTicks,
    },
    messages: {
      total: messageTotal,
      perSecond: Math.round((messageTotal / Math.max(1, uptimeSeconds)) * 10) / 10,
      byType: Object.fromEntries([...messages.entries()].sort((a, b) => b[1] - a[1])),
    },
  };
}
