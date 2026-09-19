/**
 * The per-connection bundle: a player's persisted progress, their rate-limit
 * guard, and whatever timed action is currently running.
 *
 * Keeping this out of HubRoom lets the room stay a thin message router - it
 * validates, delegates here, and replies.
 */

import type { Client } from "@colyseus/core";
import { gameStore } from "../db/index.js";
import { log } from "../logger.js";
import { ActionGuard } from "./actionGuard.js";
import { PlayerState } from "./state.js";

export interface PendingCook {
  cookId: string;
  recipeId: string;
  /** Set once the prep hold is done (or skipped by auto-prep). */
  prepared: boolean;
  /** Epoch ms the heat bar was sent; the marker position is derived from it. */
  barStartedAt: number;
  durationMs: number;
  speed: number;
  startOffset: number;
  direction: 1 | -1;
  windowCentre: number;
  windowPct: number;
  fineWindowPct: number;
}

export class Session {
  readonly guard = new ActionGuard();
  /** The timer handle for whatever action is running, so leaving can cancel it. */
  timer: NodeJS.Timeout | null = null;
  cook: PendingCook | null = null;

  constructor(
    readonly client: Client,
    readonly state: PlayerState,
  ) {}

  /**
   * Persist. Called after every state-changing action rather than on a timer:
   * a crash between a gather and a save would otherwise hand back ingredients
   * the player already spent.
   */
  save(): void {
    try {
      gameStore.save(this.state.toRecord());
    } catch (err) {
      log.error("game.save_failed", {
        wallet: this.state.wallet,
        message: (err as Error).message,
      });
    }
  }

  clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  dispose(): void {
    this.clearTimer();
    this.cook = null;
  }
}

export function loadSession(client: Client, wallet: string, displayName: string): Session {
  const record = gameStore.load(wallet);
  return new Session(client, new PlayerState(record, displayName));
}
