/**
 * The one place a colour is defined.
 *
 * Shared rather than client-only because the sprite pipeline quantises
 * generated art against this palette, and the UI, the terrain tints and the
 * particle effects all read from it. A colour that appears twice in the code
 * base is a colour that will eventually disagree with itself.
 *
 * Every entry is a 0xRRGGBB number; `hex()` renders one for CSS or Phaser text.
 */

export const PALETTE = {
  /** Backgrounds and panel furniture. */
  night: 0x14101a,
  shadow: 0x0c0912,
  panel: 0x1d1728,
  border: 0x3a3050,
  parchment: 0xe8d9b0,
  parchmentDark: 0xc9b98d,
  ink: 0xf3e9d2,
  dim: 0x9a8f7a,
  faint: 0x6f6656,

  /** The brand green, used for confirmations and the local player. */
  accent: 0x7ce08a,
  accentBright: 0xb9f7c4,

  /** Section accents, matching sections.json. */
  saffron: 0xf2b53b,
  berry: 0xb5487e,
  skyGlow: 0x63c7e8,

  /** Ground and props. */
  grass: 0x3f6b46,
  grassWarm: 0x5c8a4a,
  path: 0x6b5b45,
  pathLight: 0x8a7658,
  rock: 0x4a4652,
  water: 0x2e5a72,

  /** Feedback. */
  danger: 0xff7a5c,
  warn: 0xf2b53b,
  gold: 0xf7d372,
  silver: 0xc9d2dd,
  bronze: 0xc98a4b,
} as const;

export type PaletteName = keyof typeof PALETTE;

/** "#rrggbb" for CSS and Phaser text styles. */
export function hex(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}

/** Dish quality colours, used by steam, labels and the reveal card. */
export const QUALITY_COLOUR = {
  common: PALETTE.parchment,
  fine: PALETTE.saffron,
  superb: PALETTE.berry,
} as const;

/** Holder tiers, for wardrobe badges. */
export const TIER_COLOUR = {
  bronze: PALETTE.bronze,
  silver: PALETTE.silver,
  gold: PALETTE.gold,
} as const;

/**
 * The colours the sprite pipeline quantises towards.
 *
 * Buildings arrive in a smoother, more painterly style than the characters;
 * snapping them to this ramp plus their own dominant colours is what makes
 * them sit in the same world as the pixel art.
 */
export const QUANTISE_RAMP: readonly number[] = [
  PALETTE.night,
  PALETTE.shadow,
  PALETTE.panel,
  PALETTE.border,
  PALETTE.parchment,
  PALETTE.parchmentDark,
  PALETTE.ink,
  PALETTE.dim,
  PALETTE.faint,
  PALETTE.accent,
  PALETTE.saffron,
  PALETTE.berry,
  PALETTE.skyGlow,
  PALETTE.grass,
  PALETTE.grassWarm,
  PALETTE.path,
  PALETTE.pathLight,
  PALETTE.rock,
  PALETTE.water,
  PALETTE.gold,
  PALETTE.silver,
  PALETTE.bronze,
];

/**
 * Per-section terrain tints, applied to the shared tile packs at load so one
 * set of tiles reads as three different places.
 */
export const SECTION_TINT: Record<number, number> = {
  0: 0xffffff,
  1: 0xfff2d0,
  2: 0x9fb8a8,
  3: 0x9fb4d8,
};
