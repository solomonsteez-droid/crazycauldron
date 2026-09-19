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
  /**
   * Which map this player is standing on: 0 is the hub, 1..3 the gathering
   * sections. Replicated because everyone needs to know who to draw - a player
   * off in the Deep Forest must not appear in the hub.
   */
  @type("number") section = 0;
  /** Replicated so other players can see a chef's standing at a glance. */
  @type("number") chefLevel = 1;
  /** Non-empty while a gather or cook timer is running, for the busy animation. */
  @type("string") activity = "";
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
