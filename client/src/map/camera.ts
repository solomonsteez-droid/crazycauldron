/**
 * Camera maths, kept pure so it can be checked without a browser.
 *
 * Nothing here touches Phaser. The scene feeds in the viewport size and gets
 * back the zoom, the world bounds and whether the map is small enough to be
 * centred rather than followed - which is the part that is easy to get subtly
 * wrong and hard to see in a screenshot.
 */

import { HUB_MAP, worldBoundsOf } from "@crazycauldron/shared";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The world rectangle a painting occupies.
 *
 * The painting starts at the origin and is drawn at exactly the world size the
 * area file states, so the bounds are the image and nothing else - there is no
 * longer a diamond lattice spilling half a tile past the edge columns.
 */
export function boundsOf(mapId: number): Rect {
  const world = worldBoundsOf(mapId);
  return { x: 0, y: 0, width: world.width, height: world.height };
}

/** The hub's rectangle, which is what the tests and the defaults want. */
export const MAP_WORLD_BOUNDS: Rect = boundsOf(HUB_MAP);

/** Viewport widths at which the starting zoom steps down, narrowest first. */
export const ZOOM_BREAKPOINTS = [
  { maxWidth: 600, zoom: 1.5 },
  { maxWidth: 900, zoom: 1.75 },
] as const;

export const DESKTOP_ZOOM = 2;

/**
 * The zoom a player lands on, before they touch anything.
 *
 * 2x on desktop and 1.5x on a phone. It was 3x, which framed a character
 * beautifully and showed almost none of the map around them - and the map is a
 * painting, so a view that crops it to a courtyard is throwing away the thing
 * the game is made of. The player can still go back to 3x, and where they put
 * it is remembered.
 */
export function zoomForViewport(viewportWidth: number): number {
  for (const step of ZOOM_BREAKPOINTS) {
    if (viewportWidth < step.maxWidth) return step.zoom;
  }
  return DESKTOP_ZOOM;
}

/**
 * The zooms a player may stop at.
 *
 * Steps rather than a continuum, and these steps rather than any others: a
 * cell is 24 world pixels, and every value here multiplies it to a whole
 * number - 30, 36, 48, 60, 72, 84, 96. A zoom that does not lands the cell
 * grid on fractions of a device pixel, and the whole map shimmers as the
 * camera follows a walking character.
 *
 * Pinching is continuous while the fingers are down and settles onto the
 * nearest of these when they lift.
 */
export const ZOOM_STEPS = [1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4] as const;

export const ZOOM_MIN: number = ZOOM_STEPS[0];
export const ZOOM_MAX: number = ZOOM_STEPS[ZOOM_STEPS.length - 1] ?? 4;

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** The nearest zoom a player may stop at. */
export function snapZoom(zoom: number): number {
  const wanted = clampZoom(zoom);
  return ZOOM_STEPS.reduce((best, step) =>
    Math.abs(step - wanted) < Math.abs(best - wanted) ? step : best,
  );
}

/**
 * One step in or out from wherever the camera is now.
 *
 * From the *snapped* position rather than the exact one, so a wheel click
 * after a pinch moves a whole step instead of settling the pinch.
 */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const from = snapZoom(zoom);
  const index = ZOOM_STEPS.indexOf(from as (typeof ZOOM_STEPS)[number]);
  const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, index + direction))];
  return next ?? from;
}

/**
 * Where the camera has to scroll so that a point stays under the cursor.
 *
 * Zooming about the centre of the screen is the easy version and the wrong
 * one: a player points at the thing they want a closer look at, and the
 * thing they are pointing at is what should not move. The world point under
 * the cursor is held fixed and the scroll is solved for.
 *
 * Returns the unclamped scroll; the caller hands it to a camera that is
 * already bounded, which is what keeps the edge of the map off the screen.
 */
export function scrollToHold(
  worldPoint: { x: number; y: number },
  screenPoint: { x: number; y: number },
  zoom: number,
): { x: number; y: number } {
  return {
    x: worldPoint.x - screenPoint.x / zoom,
    y: worldPoint.y - screenPoint.y / zoom,
  };
}

/**
 * A remembered zoom, or null if there is nothing usable stored.
 *
 * Split from the storage itself so it can be tested: localStorage is a
 * browser, and this is arithmetic. Anything unparseable, out of range or
 * simply absent comes back as null and the viewport decides instead.
 */
export function parseStoredZoom(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return snapZoom(value);
}

export interface CameraPlan {
  zoom: number;
  bounds: Rect;
  /** How much world the camera can see at this zoom, in world units. */
  view: { width: number; height: number };
  /** True when the map is not wide / tall enough to fill the view. */
  fitsX: boolean;
  fitsY: boolean;
  fitsEntirely: boolean;
  /** Centre of the map, for the case where there is nothing to scroll to. */
  centre: { x: number; y: number };
}

/**
 * Works out how the camera should be set up for a viewport.
 *
 * When the map is larger than the view the camera follows the player and is
 * clamped to `bounds`, so no empty space appears past the edges. When the map
 * is smaller on an axis there is nothing to scroll along it, and the map is
 * centred instead.
 */
export function planCamera(
  viewportWidth: number,
  viewportHeight: number,
  bounds: Rect = MAP_WORLD_BOUNDS,
  /** What the player chose, if they have chosen. Otherwise the viewport decides. */
  chosenZoom: number | null = null,
): CameraPlan {
  const zoom = chosenZoom === null ? zoomForViewport(viewportWidth) : clampZoom(chosenZoom);
  const view = { width: viewportWidth / zoom, height: viewportHeight / zoom };

  const fitsX = bounds.width <= view.width;
  const fitsY = bounds.height <= view.height;

  return {
    zoom,
    bounds,
    view,
    fitsX,
    fitsY,
    fitsEntirely: fitsX && fitsY,
    centre: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
  };
}

/**
 * How far the camera may scroll on each axis before it would show past the map.
 * Returned for the tests; Phaser does its own clamping from the same bounds.
 */
export function scrollRange(plan: CameraPlan): { minX: number; maxX: number; minY: number; maxY: number } {
  const { bounds, view } = plan;
  return {
    minX: bounds.x,
    maxX: Math.max(bounds.x, bounds.x + bounds.width - view.width),
    minY: bounds.y,
    maxY: Math.max(bounds.y, bounds.y + bounds.height - view.height),
  };
}

/**
 * On-screen height for world-space text labels, in CSS pixels.
 *
 * Labels live in the world so they sit above the right tile, which means the
 * camera zoom would otherwise blow them up with everything else. The scene
 * counter-scales them by 1/zoom so a name reads the same size at 1.5x and 3x.
 */
export const LABEL_SCREEN_PX = 11;
export const SMALL_LABEL_SCREEN_PX = 9;

/** Scale that cancels the camera zoom, so a label renders at its own size. */
export function labelScale(zoom: number): number {
  return 1 / zoom;
}
