/**
 * What the sprite pipeline produced, and where each garment sits on the body.
 *
 * Three files, with two owners, and the split is the point.
 *
 * `manifest.json` and `offsets.default.json` are written by `npm run sprites`
 * and may be overwritten on any run: they describe what exists and where the
 * pipeline computed each overlay should go.
 *
 * `art/offsets.overrides.json` is written only by the alignment tool at
 * /dev/align, is committed, and the pipeline never touches it. It holds only
 * the values somebody actually changed - per item, per direction - and holds
 * them **against the body's measured rows** rather than as pixels from the
 * corner of the frame. A re-cut that shifts the whole figure moves the rows
 * and the nudges move with them, which is the difference between a re-cut
 * costing nothing and costing an afternoon.
 *
 * The client merges the two at load, per body, so one nudge lands correctly
 * on every figure that wears the item.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface OverlayEntry {
  id: string;
  width: number;
  height: number;
  /** Where the pipeline fitted it, used until the alignment tool overrides it. */
  offset: Vec2;
  /** True when an <id>_back.png was processed for the up direction. */
  back?: boolean;
}

/**
 * How one direction's four walk frames are played.
 *
 * Decided by the pipeline from the finished frames, not here: it measures how
 * different each frame is from the others, and where two of them are the same
 * pose twice it hands back a ping-pong order instead of a loop. The client
 * plays what it is given rather than knowing which sheets are weak.
 */
export interface WalkCycle {
  /** Source frame numbers, in the order they are played. */
  order: number[];
  frameRate: number;
  pingPong: boolean;
  /** Pairs of frames too alike to read as separate poses. */
  duplicates: [number, number][];

  /** Source frames where a foot is planted. The bob and the dust key off these. */
  contact?: number[];
  /** Pixels between the outermost feet, per frame. */
  footSpread?: number[];
  /** How far the feet's centre travels across the cycle, in pixels. */
  footTravel?: number;
  /**
   * True when the feet neither separate nor travel.
   *
   * Three of the eight sheets are: male up travels 0.2px across its whole
   * cycle and female up 0.8px, which is why walking up looked like standing
   * still being slid along the ground. The client does not treat these
   * differently - the procedural bob applies to every direction - but a value
   * that says which sheets are weak is what turns "it looks wrong" into a
   * list of files to redraw.
   */
  strideless?: boolean;
}

/**
 * The rows an overlay hangs from, measured off this body's own front idle
 * frame by the pipeline.
 *
 * A hat is placed from where the head starts; a cloak from where the figure
 * reaches its full width. `centre` is the column the figure sits on, kept for
 * anything that needs to know and not currently used to place anything - the
 * frames are centred by construction, so x is already stable across a re-cut
 * and only y needs anchoring.
 */
export interface BodyAnchors {
  headTop: number;
  shoulders: number;
  centre: number;
}

export interface BodyEntry {
  scale: number;
  frames: string[];
  /** Missing for a body whose walk sheets did not all arrive. */
  walk?: Record<string, WalkCycle>;
  /** Missing for a manifest written before the rows were measured. */
  anchors?: BodyAnchors;
}

/** A companion creature, at the size the pipeline cut it to. */
export interface CompanionEntry {
  id: string;
  width: number;
  height: number;
}

/** Scenery the pipeline cut for one map, with the size each piece came out. */
export interface DecorEntry {
  map: number;
  items: { id: string; width: number; height: number }[];
}

export interface TerrainEntry {
  map: number;
  name: string;
  tint: string;
  /** Row of each tile's widest span - where its diamond actually sits. */
  anchors: number[];
}

export interface Manifest {
  generatedAt: string;
  bodyFrame: { width: number; height: number };
  bodies: Record<string, BodyEntry>;
  hats: OverlayEntry[];
  /** Cut and kept, drawn by nothing: the cloak slot is dormant. */
  cloaks: OverlayEntry[];
  /** Creatures that walk with a player. Empty until art arrives. */
  companions: CompanionEntry[];
  props: string[];
  /** Recipe ids that have a processed dish icon. */
  dishes: string[];
  /** Ingredient ids that have a processed icon. */
  ingredients: string[];
  /** Node archetypes, with the layout each drop turned out to use. */
  nodes: { id: string; layout: string }[];
  terrain: TerrainEntry[];
  decor: DecorEntry[];
  optional: Record<string, string[]>;
}

export type Direction = "down" | "up" | "left" | "right";
export const DIRECTIONS: Direction[] = ["down", "up", "left", "right"];

/**
 * The room replicates a compass facing; the sprite sheet is named by screen
 * direction. They are not the same vocabulary, and casting one to the other -
 * which is what this code used to do - silently asks for frames like
 * "male_walk_s" that do not exist, leaving every character frozen on whatever
 * frame it happened to be showing.
 */
const FACING_TO_DIRECTION: Record<string, Direction> = {
  n: "up",
  e: "right",
  s: "down",
  w: "left",
};

export function directionFor(facing: string): Direction {
  return FACING_TO_DIRECTION[facing] ?? "down";
}

/**
 * The walk animation a movement vector should play.
 *
 * Asked of the vector the character is actually travelling along, in world
 * pixels, rather than of the server's last facing. With eight-direction
 * movement the two can disagree: a patch that carries two steps at once leaves
 * a facing from the second while the tween is still covering both, and the
 * stride ends up pointing the wrong way for a frame.
 */
export function directionForVector(dx: number, dy: number, fallback: Direction): Direction {
  if (dx === 0 && dy === 0) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

export interface ItemOffsets {
  down: Vec2;
  up: Vec2;
  left: Vec2;
  right: Vec2;
  /**
   * Mirror the art horizontally for the left view.
   *
   * The drops only contain a front-facing garment, so the side views reuse it.
   * A symmetric hat flips cleanly; anything with a brim on one side does not,
   * which is why this is a per-item flag rather than a global rule.
   */
  flip: boolean;
}

export type OffsetsFile = Record<"hats" | "cloaks", Record<string, ItemOffsets>>;

/**
 * One item's hand nudges: only the directions somebody changed.
 *
 * `y` is rows below the anchor for the item's kind, so it survives a re-cut.
 * `x` is the column in the frame, unchanged, because the pipeline centres
 * every figure horizontally and there is nothing there to drift.
 */
export interface ItemOverride {
  down?: Vec2;
  up?: Vec2;
  left?: Vec2;
  right?: Vec2;
  flip?: boolean;
}

export type OverridesFile = Record<"hats" | "cloaks", Record<string, ItemOverride>>;

/** Everything the placement of a garment depends on. */
export interface Art {
  manifest: Manifest;
  defaults: OffsetsFile;
  overrides: OverridesFile;
}

/** The row a kind of overlay hangs from, on a given body. */
export function anchorRow(manifest: Manifest, body: string, kind: "hats" | "cloaks"): number {
  const anchors = manifest.bodies[body]?.anchors;
  if (!anchors) return 0;
  return kind === "hats" ? anchors.headTop : anchors.shoulders;
}

/**
 * The generated default and the hand nudges, resolved into absolute placement
 * for one body.
 *
 * Memoised per art *and* per body: it is read on every frame that places a
 * garment, and the answer only changes when the art is reloaded. Keyed by the
 * art object rather than by the body alone, because the body's name is not
 * enough to identify an answer - the alignment tool holds a second, edited
 * copy of the same bodies, and a cache that could not tell them apart would
 * hand the game the tool's unsaved work.
 */
const resolved = new WeakMap<Art, Map<string, OffsetsFile>>();

export function resolveOffsets(art: Art, body: string): OffsetsFile {
  let byBody = resolved.get(art);
  if (!byBody) {
    byBody = new Map<string, OffsetsFile>();
    resolved.set(art, byBody);
  }

  const hit = byBody.get(body);
  if (hit) return hit;

  const out: OffsetsFile = { hats: {}, cloaks: {} };

  for (const kind of ["hats", "cloaks"] as const) {
    const row = anchorRow(art.manifest, body, kind);
    const ids = new Set([
      ...Object.keys(art.defaults[kind] ?? {}),
      ...Object.keys(art.overrides[kind] ?? {}),
    ]);

    for (const id of ids) {
      const base =
        art.defaults[kind]?.[id] ??
        defaultOffsets(art.manifest[kind]?.find((entry) => entry.id === id));
      const nudged = art.overrides[kind]?.[id];

      const item: ItemOffsets = {
        down: { ...base.down },
        up: { ...base.up },
        left: { ...base.left },
        right: { ...base.right },
        flip: nudged?.flip ?? base.flip,
      };

      for (const direction of DIRECTIONS) {
        const over = nudged?.[direction];
        if (over) item[direction] = { x: over.x, y: over.y + row };
      }

      out[kind][id] = item;
    }
  }

  byBody.set(body, out);
  return out;
}

/** Turns an absolute placement back into an override, for the alignment tool. */
export function toOverride(
  manifest: Manifest,
  body: string,
  kind: "hats" | "cloaks",
  point: Vec2,
): Vec2 {
  return { x: point.x, y: point.y - anchorRow(manifest, body, kind) };
}

const EMPTY_MANIFEST: Manifest = {
  generatedAt: "",
  bodyFrame: { width: 32, height: 48 },
  bodies: {},
  hats: [],
  cloaks: [],
  companions: [],
  props: [],
  dishes: [],
  ingredients: [],
  nodes: [],
  terrain: [],
  decor: [],
  optional: {},
};

export const GENERATED = "/assets/generated";

async function fetchJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    // Neither file is required to exist - the game falls back to placeholders.
    return fallback;
  }
}

let cached: Art | null = null;

/** Loads both files once per tab. */
export async function loadArt(): Promise<Art> {
  if (cached) return cached;
  const [manifest, defaults, overrides] = await Promise.all([
    fetchJson<Manifest>(`${GENERATED}/manifest.json`, EMPTY_MANIFEST),
    fetchJson<OffsetsFile>(`${GENERATED}/offsets.default.json`, { hats: {}, cloaks: {} }),
    fetchJson<OverridesFile>(`${GENERATED}/offsets.overrides.json`, { hats: {}, cloaks: {} }),
  ]);
  cached = { manifest, defaults, overrides };
  return cached;
}

/** Forgets the cache, so the alignment tool sees its own saves. */
export function invalidateArt(): void {
  // The resolved placements hang off the art object, so dropping it drops
  // them: a WeakMap has nothing to clear.
  cached = null;
}

export function defaultOffsets(entry: OverlayEntry | undefined): ItemOffsets {
  const base = entry?.offset ?? { x: 0, y: 0 };
  return {
    down: { ...base },
    up: { ...base },
    left: { ...base },
    right: { ...base },
    flip: true,
  };
}

/**
 * The placement for one garment in one direction.
 *
 * Right is drawn from the left offset mirrored, unless the tool saved a
 * separate one - the two views are the same art seen from either side.
 */
export function offsetFor(
  offsets: OffsetsFile,
  kind: "hats" | "cloaks",
  id: string,
  direction: Direction,
  fallback: ItemOffsets,
): { offset: Vec2; flipX: boolean } {
  const saved = offsets[kind]?.[id] ?? fallback;
  const flip = saved.flip !== false;

  if (direction === "right" && flip) {
    return { offset: saved.right ?? saved.left, flipX: true };
  }
  return { offset: saved[direction] ?? saved.down, flipX: false };
}
