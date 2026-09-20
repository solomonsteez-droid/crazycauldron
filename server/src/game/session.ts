/**
 * The per-connection bundle: a player's persisted progress, their rate-limit
 * guard, and whatever timed action is currently running.
 *
 * Keeping this out of HubRoom lets the room stay a thin message router - it
 * validates, delegates here, and replies.
 */

import type { Client } from "@colyseus/core";
import type { HeatWindows } from "@crazycauldron/shared";
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
  /** The bands, already clamped; see heatWindows in shared. */
  windows: HeatWindows;
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
   * Writes still owed to the database, in the order they were asked for.
   *
   * Saves are fired off rather than waited on, so two can be in flight at
   * once - and against Postgres the second could then land before the first,
   * writing an older state over a newer one. Chaining them costs nothing on
   * SQLite, where each finishes before the next is asked for, and on Postgres
   * it is the difference between a correct save and a lost gather.
   */
  private writes: Promise<void> = Promise.resolve();

  /**
   * Persist. Called after every state-changing action rather than on a timer:
   * a crash between a gather and a save would otherwise hand back ingredients
   * the player already spent.
   *
   * The snapshot is taken now, synchronously, so what is queued is the state
   * as it was when the action finished rather than whatever it has become by
   * the time the write runs.
   */
  save(): void {
    const record = this.state.toRecord();
    this.writes = this.writes
      .then(() => gameStore.save(record))
      .catch((err: unknown) => {
        log.error("game.save_failed", {
          wallet: this.state.wallet,
          message: (err as Error).message,
        });
      });
  }

  /** Waits for anything still owed. Used when a room is shutting down. */
  async flush(): Promise<void> {
    await this.writes;
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

export async function loadSession(
  client: Client,
  wallet: string,
  displayName: string,
): Promise<Session> {
  const record = await gameStore.load(wallet);
  return new Session(client, new PlayerState(record, displayName));
}
