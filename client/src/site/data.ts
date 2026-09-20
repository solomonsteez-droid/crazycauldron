/**
 * What the site asks the server for.
 *
 * Two things, both public and both read at request time rather than compiled
 * in: the configuration a launch changes (the contract address above all), and
 * the live counters.
 *
 * Every field has a fallback and nothing here throws. A marketing page whose
 * hero is blank because a counter endpoint was slow is worse than one that
 * quietly shows a dash, and the page has to render on a phone on a train.
 */

import { env } from "../net/env.js";

export interface SiteConfig {
  domain: string;
  cookMint: string;
  /** False until the real mint exists; the page then says so instead. */
  showMint: boolean;
  treasuryWallet: string;
  minHold: number;
  social: { x: string; telegram: string };
  shopEnabled: boolean;
}

export interface SiteStats {
  playersOnline: number;
  chefsRegistered: number;
  dishesCooked: number;
  superbsToday: number;
}

export const CONFIG_FALLBACK: SiteConfig = {
  domain: "crazycauldron.art",
  cookMint: "",
  showMint: false,
  treasuryWallet: "",
  minHold: 2000,
  social: { x: "none", telegram: "none" },
  shopEnabled: false,
};

async function getJson<T>(path: string, timeoutMs = 6000): Promise<T | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetch(`${env.httpUrl}${path}`, { signal: abort.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function siteConfig(): Promise<SiteConfig> {
  const got = await getJson<Partial<SiteConfig>>("/public/config");
  if (!got) return CONFIG_FALLBACK;
  return {
    ...CONFIG_FALLBACK,
    ...got,
    social: { ...CONFIG_FALLBACK.social, ...(got.social ?? {}) },
  };
}

/** Null when the endpoint is unreachable, which the counters render as a dash. */
export async function siteStats(): Promise<SiteStats | null> {
  return getJson<SiteStats>("/stats", 4000);
}

/**
 * A social handle, or null when there is none.
 *
 * "none" is a real answer in the config and a deliberate one: saying "we have
 * no Telegram" is useful, and silence is what a fake account fills. It is not
 * a link, though, so it is filtered here and spelled out in the copy.
 */
export function handle(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" || trimmed.toLowerCase() === "none" ? null : trimmed;
}

/** An address shortened for display, with the full value kept for copying. */
export function shorten(address: string, keep = 6): string {
  return address.length <= keep * 2 + 3
    ? address
    : `${address.slice(0, keep)}…${address.slice(-keep)}`;
}
