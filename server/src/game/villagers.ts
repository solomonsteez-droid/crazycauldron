/**
 * The people who already live in the hub.
 *
 * They exist for one reason: an empty plaza reads as a lobby, and a plaza with
 * someone crossing it reads as a town. So they are decoration - but decoration
 * that every client has to agree on, which is why the walking happens here and
 * not in the browser. A client that invented Old Marta's route would put her in
 * a different place on every screen.
 *
 * They hold nothing, earn nothing and are counted nowhere. The room's player
 * count, the leaderboard and the token gate never see them.
 */

import { MapSchema } from "@colyseus/schema";
import {
  AMBIENCE,
  HUB_MAP,
  MAP_SIZE,
  facingFor,
  findPath,
  isWalkableOn,
  seededRandom,
  type TilePos,
  type VillagerDef,
} from "@crazycauldron/shared";
import { Villager } from "../rooms/schema.js";

const SETTINGS = AMBIENCE.villagers;

interface Walk {
  route: TilePos[];
  /** Server time this villager stops loitering and picks a new destination. */
  restUntil: number;
}

export class VillagerCrowd {
  private readonly walks = new Map<string, Walk>();
  private readonly random: () => number;

  constructor(
    private readonly villagers: MapSchema<Villager>,
    seed: number,
  ) {
    this.random = seededRandom(seed);
  }

  /** How often step() expects to be called. */
  static get stepMs(): number {
    return SETTINGS.stepMs;
  }

  get count(): number {
    return this.villagers.size;
  }

  /**
   * Fills the hub with six to eight residents, drawn from the roster in a
   * shuffled order so no two rooms open with the same faces in the same spots.
   */
  populate(now: number): void {
    const span = Math.max(0, SETTINGS.max - SETTINGS.min);
    const wanted = Math.min(
      SETTINGS.roster.length,
      SETTINGS.min + Math.floor(this.random() * (span + 1)),
    );

    for (const def of this.shuffled(SETTINGS.roster).slice(0, wanted)) {
      const at = this.randomWalkableTile();
      if (!at) continue;

      const villager = new Villager();
      villager.id = def.id;
      villager.name = def.name;
      villager.tileX = at.tileX;
      villager.tileY = at.tileY;
      villager.body = def.body;
      villager.hatId = def.hat;
      villager.apronId = def.apron;

      this.villagers.set(def.id, villager);
      this.walks.set(def.id, { route: [], restUntil: now + this.restMs() });
    }
  }

  /**
   * One tile of progress for everyone on the move, and a new destination for
   * anyone who has finished loitering.
   *
   * Villagers path with exactly the rule players do, so they never end up
   * standing inside the cauldron or outside the border. They do not reserve
   * tiles: two of them may share one, which is far less strange than a villager
   * jammed against a player who parked on their route.
   */
  step(now: number): void {
    for (const [id, villager] of this.villagers) {
      const walk = this.walks.get(id);
      if (!walk) continue;

      const next = walk.route.shift();
      if (!next) {
        villager.moving = false;
        if (now >= walk.restUntil) {
          walk.route = this.strollFrom(villager);
          walk.restUntil = now + this.restMs();
        }
        continue;
      }

      villager.facing = facingFor(
        { tileX: villager.tileX, tileY: villager.tileY },
        next,
        villager.facing,
      );
      villager.tileX = next.tileX;
      villager.tileY = next.tileY;
      villager.moving = walk.route.length > 0;
    }
  }

  /** A greeting line, chosen from the roster rather than written here. */
  static lineFor(id: string, pick: number): string {
    const def = SETTINGS.roster.find((v) => v.id === id);
    if (!def || def.lines.length === 0) return "";
    return def.lines[Math.abs(pick) % def.lines.length] ?? "";
  }

  static definition(id: string): VillagerDef | undefined {
    return SETTINGS.roster.find((v) => v.id === id);
  }

  // --- internals ----------------------------------------------------------

  private restMs(): number {
    const { pauseMsMin, pauseMsMax } = SETTINGS;
    return pauseMsMin + this.random() * Math.max(0, pauseMsMax - pauseMsMin);
  }

  private shuffled<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
  }

  private randomWalkableTile(): TilePos | null {
    // Bounded rather than exhaustive: the hub is mostly walkable, so a handful
    // of tries always lands, and a hypothetical sealed map ends the search
    // instead of spinning.
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const tileX = Math.floor(this.random() * MAP_SIZE);
      const tileY = Math.floor(this.random() * MAP_SIZE);
      if (isWalkableOn(HUB_MAP, tileX, tileY)) return { tileX, tileY };
    }
    return null;
  }

  /** A short walk to somewhere nearby, or nothing if the dice pick a wall. */
  private strollFrom(villager: Villager): TilePos[] {
    const { strollTilesMin, strollTilesMax } = SETTINGS;
    const reach = strollTilesMin + Math.floor(this.random() * (strollTilesMax - strollTilesMin + 1));

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const dx = Math.round((this.random() * 2 - 1) * reach);
      const dy = Math.round((this.random() * 2 - 1) * reach);
      const target = { tileX: villager.tileX + dx, tileY: villager.tileY + dy };
      if (!isWalkableOn(HUB_MAP, target.tileX, target.tileY)) continue;

      const route = findPath({ tileX: villager.tileX, tileY: villager.tileY }, target, (x, y) =>
        isWalkableOn(HUB_MAP, x, y),
      );
      if (route.length > 0) return route;
    }
    return [];
  }
}
