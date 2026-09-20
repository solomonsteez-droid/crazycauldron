/**
 * Where the site's illustrations come from.
 *
 * All of it is the game's own art, served from the same /assets the game
 * loads - not a second set of marketing renders that would drift the first
 * time a hat was redrawn. A picture of the Chef toque on this page is the
 * Chef toque, at 3x nearest-neighbour so the pixels stay pixels.
 *
 * The paintings are the exception: the game's are 4.5 to 6.7 MB each, so the
 * site loads the web-sized copies that scripts/build-site-art.mjs makes.
 */

const GENERATED = "/assets/generated";

export const SPRITES = {
  /** A web-sized painting. `narrow` picks the phone copy. */
  painting(map: string, narrow = false): string {
    return `/assets/site/${map}-${narrow ? "narrow" : "wide"}.jpg`;
  },
  /** Both widths at once, for a `srcset` that lets the browser choose. */
  paintingSrcset(map: string): string {
    return `${SPRITES.painting(map, true)} 720w, ${SPRITES.painting(map, false)} 1440w`;
  },
  hat: (id: string) => `${GENERATED}/hats/${id}.png`,
  companion: (id: string) => `${GENERATED}/companions/${id}.png`,
  dish: (id: string) => `${GENERATED}/dishes/${id}.png`,
  ingredient: (id: string) => `${GENERATED}/ingredients/${id}.png`,
  prop: (id: string) => `${GENERATED}/props/${id}.png`,
  node: (id: string) => `${GENERATED}/nodes/${id}.png`,
  character: (body: string) => `${GENERATED}/characters/${body}.png`,

  /**
   * Where each hat sits on a head, as the alignment workbench left it.
   *
   * The "down" offset, because that is the pose the site draws. Fetched
   * rather than imported so that re-nudging a hat in /dev/align changes the
   * marketing page too, without a rebuild of anything but the art.
   *
   * Two files, merged the way the game merges them: the pipeline's computed
   * placement, and the hand nudges on top. A nudge's y is rows below the
   * body's head top, which is why the manifest is read as well - though on
   * every body this game currently has, that row is 0.
   */
  async hatOffsets(): Promise<Record<string, { x: number; y: number }>> {
    const read = async <T>(name: string): Promise<T | null> => {
      try {
        const res = await fetch(`${GENERATED}/${name}`);
        return res.ok ? ((await res.json()) as T) : null;
      } catch {
        return null;
      }
    };

    type Placements = { hats?: Record<string, { down?: { x: number; y: number } }> };

    const [defaults, overrides, manifest] = await Promise.all([
      read<Placements>("offsets.default.json"),
      read<Placements>("offsets.overrides.json"),
      read<{ bodies?: Record<string, { anchors?: { headTop?: number } }> }>("manifest.json"),
    ]);

    const headTop = manifest?.bodies?.male?.anchors?.headTop ?? 0;
    const out: Record<string, { x: number; y: number }> = {};

    for (const [id, poses] of Object.entries(defaults?.hats ?? {})) {
      if (poses.down) out[id] = poses.down;
    }
    for (const [id, poses] of Object.entries(overrides?.hats ?? {})) {
      if (poses.down) out[id] = { x: poses.down.x, y: poses.down.y + headTop };
    }

    return out;
  },
};

export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CharacterFrames {
  sheet: HTMLImageElement;
  /** The walk-right cycle, in the order the manifest says to play it. */
  walkRight: FrameRect[];
  frameWidth: number;
  frameHeight: number;
}

interface AtlasFile {
  frames: { filename: string; frame: FrameRect }[];
}

interface ManifestFile {
  bodies?: Record<string, { walk?: Record<string, { order?: number[] }> }>;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/**
 * One body's walk cycle, ready to draw.
 *
 * The frame order comes from the manifest rather than being 0-1-2-3: some
 * sheets have two near-duplicate frames and are played as a ping-pong
 * instead, which the sprite pipeline works out and writes down. Reading it
 * here means the chefs on this page walk exactly like the chefs in the game.
 */
export async function characterFrames(body: string): Promise<CharacterFrames | null> {
  const [sheet, atlas, manifest] = await Promise.all([
    loadImage(SPRITES.character(body)),
    fetch(`${GENERATED}/characters/${body}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<AtlasFile>) : null))
      .catch(() => null),
    fetch(`${GENERATED}/manifest.json`)
      .then((r) => (r.ok ? (r.json() as Promise<ManifestFile>) : null))
      .catch(() => null),
  ]);

  if (!sheet || !atlas) return null;

  const byName = new Map(atlas.frames.map((f) => [f.filename, f.frame]));
  const order = manifest?.bodies?.[body]?.walk?.right?.order ?? [0, 1, 2, 3];
  const walkRight = order
    .map((index) => byName.get(`${body}_walk_right_${index}`))
    .filter((rect): rect is FrameRect => rect !== undefined);

  const first = walkRight[0] ?? byName.get(`${body}_idle_down`);
  if (!first || walkRight.length === 0) return null;

  return { sheet, walkRight, frameWidth: first.w, frameHeight: first.h };
}
