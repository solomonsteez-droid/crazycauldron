import { MapSchema, Schema, type } from "@colyseus/schema";
import { HUB_SPAWN, type Facing } from "@crazycauldron/shared";

/**
 * Replicated player state. Deliberately thin: tile coordinates only, never
 * pixels, and nothing the client could not already see on screen. The wallet
 * address is public (it is how players identify each other) but the $COOK
 * balance is not replicated - it is gate input, not game state.
 */
export class Player extends Schema {
  @type("string") sessionId = "";
  @type("string") wallet = "";
  @type("string") displayName = "";
  @type("number") tileX = HUB_SPAWN.tileX;
  @type("number") tileY = HUB_SPAWN.tileY;
  /** One of Facing; a plain string because @colyseus/schema has no enums. */
  @type("string") facing: Facing = "s";
  /** True while a route is still being walked, so clients can pick an animation. */
  @type("boolean") moving = false;
}

export class HubState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}

/** The waiting room replicates only the queue length and each player's place. */
export class QueuedPlayer extends Schema {
  @type("string") wallet = "";
  @type("string") displayName = "";
  @type("number") place = 0;
}

export class WaitingState extends Schema {
  @type({ map: QueuedPlayer }) queue = new MapSchema<QueuedPlayer>();
  @type("number") hubPlayers = 0;
  @type("number") globalMax = 0;
}
