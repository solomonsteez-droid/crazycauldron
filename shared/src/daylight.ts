/**
 * Where the world is in its twenty minute day.
 *
 * Pure arithmetic over the stops in ambience.json, kept out of the renderer so
 * it can be asserted without a browser: that the loop joins up at midnight,
 * that the stops run forwards, and that nothing ever gets dark enough to hide
 * what is standing on the ground.
 *
 * The result is a tint, and a tint only ever multiplies the ground. Characters,
 * labels, nodes and the HUD keep the colours they were authored in.
 */

import { AMBIENCE } from "./content/index.js";

const CYCLE_MS = Math.max(1, AMBIENCE.dayNight.cycleMinutes) * 60_000;

export const DAY_CYCLE_MS = CYCLE_MS;

/** 0 at dawn, approaching 1 as it comes back round. */
export function dayPhase(now: number): number {
  return (((now % CYCLE_MS) + CYCLE_MS) % CYCLE_MS) / CYCLE_MS;
}

/** The name the current phase was authored under, for the HUD. */
export function dayLabel(now: number): string {
  const t = dayPhase(now);
  const stops = AMBIENCE.dayNight.stops;
  let label = stops[0]?.label ?? "";
  for (const stop of stops) {
    if (t >= stop.at) label = stop.label;
  }
  return label;
}

function parseHex(value: string): number {
  return Number.parseInt(value.replace("#", ""), 16) & 0xffffff;
}

/**
 * The ground colour for a moment in the day.
 *
 * Linear between the authored stops, in straight RGB. A perceptual blend would
 * be more correct and completely invisible at this amplitude - every stop is
 * pale, because the point is a change of mood rather than a dimmer switch.
 */
export function dayTint(now: number): number {
  const stops = AMBIENCE.dayNight.stops;
  if (stops.length === 0) return 0xffffff;

  const t = dayPhase(now);
  let from = stops[0]!;
  let to = stops[stops.length - 1]!;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    if (t >= a.at && t <= b.at) {
      from = a;
      to = b;
      break;
    }
  }

  const span = to.at - from.at;
  const mix = span <= 0 ? 0 : (t - from.at) / span;
  const a = parseHex(from.tint);
  const b = parseHex(to.tint);

  const channel = (shift: number) => {
    const x = (a >> shift) & 0xff;
    const y = (b >> shift) & 0xff;
    return Math.round(x + (y - x) * mix) & 0xff;
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Multiplies a map's own colour by the time of day. */
export function mixTint(base: number, day: number): number {
  const channel = (shift: number) =>
    Math.round((((base >> shift) & 0xff) * ((day >> shift) & 0xff)) / 255) & 0xff;
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** The darkest channel any stop reaches, as a fraction. Guards readability. */
export function darkestStop(): number {
  let darkest = 1;
  for (const stop of AMBIENCE.dayNight.stops) {
    const colour = parseHex(stop.tint);
    for (const shift of [16, 8, 0]) darkest = Math.min(darkest, ((colour >> shift) & 0xff) / 255);
  }
  return darkest;
}
