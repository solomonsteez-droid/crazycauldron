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

/** Viewport widths at which the zoom steps down, narrowest first. */
export const ZOOM_BREAKPOINTS = [
  { maxWidth: 600, zoom: 1.5 },
  { maxWidth: 900, zoom: 2 },
] as const;

export const DESKTOP_ZOOM = 3;

/**
 * Camera zoom for a viewport width.
 *
 * 3x on desktop, 2x under 900px, 1.5x on phone-width screens. Whole numbers
 * keep the painting landing on exact pixel multiples; 1.5 is the one
 * deliberate exception, because at phone width a 3x view leaves almost no map
 * on screen. A half step still lands cell edges on whole pixels - a cell is
 * 24px, and 24 * 1.5 is 36 - and the scroll position is rounded separately by
 * the scene.
 */
export function zoomForViewport(viewportWidth: number): number {
  for (const step of ZOOM_BREAKPOINTS) {
    if (viewportWidth < step.maxWidth) return step.zoom;
  }
  return DESKTOP_ZOOM;
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
): CameraPlan {
  const zoom = zoomForViewport(viewportWidth);
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
