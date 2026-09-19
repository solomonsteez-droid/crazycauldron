import { ACTION_GRACE_MS } from "@crazycauldron/shared";

/**
 * Per-session rate limiting for the two timed actions.
 *
 * Two rules, both server-side: one action may be in flight at a time, and a new
 * action is refused when it arrives sooner than the previous one's animation
 * minus a small grace. The grace absorbs a dropped frame or a slow round trip;
 * it is nowhere near enough to script a faster loop than the animation allows.
 */
export interface GuardRefusal {
  reason: "busy" | "too_fast";
  message: string;
  /** Epoch ms the session may act again. */
  retryAt: number;
}

export class ActionGuard {
  private inFlight: { action: string; endsAt: number } | null = null;
  private lastStartedAt = 0;
  private lastDurationMs = 0;

  /** Null when the action may proceed, otherwise why it may not. */
  check(now: number): GuardRefusal | null {
    if (this.inFlight && now < this.inFlight.endsAt) {
      return {
        reason: "busy",
        message: `You are still ${this.inFlight.action}.`,
        retryAt: this.inFlight.endsAt,
      };
    }

    const earliest = this.lastStartedAt + this.lastDurationMs - ACTION_GRACE_MS;
    if (this.lastStartedAt > 0 && now < earliest) {
      return { reason: "too_fast", message: "Slow down.", retryAt: earliest };
    }
    return null;
  }

  begin(action: string, durationMs: number, now: number): void {
    this.inFlight = { action, endsAt: now + durationMs };
    this.lastStartedAt = now;
    this.lastDurationMs = durationMs;
  }

  /**
   * Ends a completed action. The spacing rule still applies afterwards, which
   * is what stops a finished gather being followed instantly by another.
   */
  finish(): void {
    this.inFlight = null;
  }

  /**
   * Ends an action that paid out nothing - a cancelled cook, a rejected click.
   *
   * Spacing is recharged to the time actually spent rather than the time the
   * action would have taken. Holding a player out for the full seven seconds of
   * a cook they abandoned punishes a misclick, and there is nothing to abuse:
   * cancelling yields no items, no XP and no coins.
   */
  abandon(now: number): void {
    this.inFlight = null;
    if (this.lastStartedAt > 0) {
      this.lastDurationMs = Math.max(0, now - this.lastStartedAt);
    }
  }

  get busy(): boolean {
    return this.inFlight !== null;
  }
}
