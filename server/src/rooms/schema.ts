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
  /** Which body sheet to draw. */
  @type("string") body = "male";
  /** Equipped wardrobe items; empty means nothing worn. */
  @type("string") hatId = "";
  @type("string") apronId = "";
}

/**
 * A hub resident. Simulated on the server for the same reason players are:
 * everyone in the room must see Old Marta in the same spot, and a client that
 * invented her position would put her somewhere else on every screen.
 *
 * Deliberately not a Player - villagers have no wallet, no progress and no
 * session, and giving them one would put them in the room count and on the
 * leaderboard.
 */
export class Villager extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("number") tileX = 0;
  @type("number") tileY = 0;
  @type("string") facing: Facing = "s";
  @type("boolean") moving = false;
  @type("string") body = "male";
  @type("string") hatId = "";
  @type("string") apronId = "";
}

export class HubState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  /** Hub-only; the gathering sections are deliberately empty of people. */
  @type({ map: Villager }) villagers = new MapSchema<Villager>();
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
