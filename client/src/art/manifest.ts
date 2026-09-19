/**
 * What the sprite pipeline produced, and where each garment sits on the body.
 *
 * Two files, with different owners. manifest.json is written by
 * `npm run sprites` and describes what exists; offsets.json is written by the
 * alignment tool at /dev/align and records the hand-nudged placement. The
 * manifest carries a computed default for every overlay, so the game looks
 * right before anyone has opened the tool and better afterwards.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface OverlayEntry {
  id: string;
  width: number;
  height: number;
  /** The pipeline's guess, used until the alignment tool overrides it. */
  offset: Vec2;
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
  bodies: Record<string, { scale: number; frames: string[] }>;
  hats: OverlayEntry[];
  aprons: OverlayEntry[];
  props: string[];
  /** Recipe ids that have a processed dish icon. */
  dishes: string[];
  /** Ingredient ids that have a processed icon. */
  ingredients: string[];
  /** Node archetypes, with the layout each drop turned out to use. */
  nodes: { id: string; layout: string }[];
  terrain: TerrainEntry[];
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

export type OffsetsFile = Record<"hats" | "aprons", Record<string, ItemOffsets>>;

const EMPTY_MANIFEST: Manifest = {
  generatedAt: "",
  bodyFrame: { width: 32, height: 48 },
  bodies: {},
  hats: [],
  aprons: [],
  props: [],
  dishes: [],
  ingredients: [],
  nodes: [],
  terrain: [],
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

let cached: { manifest: Manifest; offsets: OffsetsFile } | null = null;

/** Loads both files once per tab. */
export async function loadArt(): Promise<{ manifest: Manifest; offsets: OffsetsFile }> {
  if (cached) return cached;
  const [manifest, offsets] = await Promise.all([
    fetchJson<Manifest>(`${GENERATED}/manifest.json`, EMPTY_MANIFEST),
    fetchJson<OffsetsFile>(`${GENERATED}/offsets.json`, { hats: {}, aprons: {} }),
  ]);
  cached = { manifest, offsets };
  return cached;
}

/** Forgets the cache, so the alignment tool sees its own saves. */
export function invalidateArt(): void {
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
  kind: "hats" | "aprons",
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
