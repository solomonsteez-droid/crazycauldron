/** Values both the client and the server must agree on. */

export const ROOM_HUB = "hub";
export const ROOM_WAITING = "waiting";

/** Isometric diamond tile footprint, in pixels. */
export const TILE_WIDTH = 32;
export const TILE_HEIGHT = 16;

/** Placeholder hub map is square. */
export const MAP_SIZE = 24;

/** State patch rate, ms. */
export const PATCH_RATE_MS = 100;

/** Server movement simulation step: one tile per this many ms. */
export const MOVE_STEP_MS = 180;

/** Longest path (in tiles) the server will accept for a single move intent. */
export const MAX_PATH_TILES = 64;

/** Nonce / sign-in message validity window, ms. */
export const NONCE_TTL_MS = 5 * 60 * 1000;

/** Issued JWT lifetime, seconds. */
export const JWT_TTL_SECONDS = 60 * 60;

/** Token balance cache lifetime + periodic re-check interval, ms. */
export const BALANCE_CACHE_TTL_MS = 30 * 60 * 1000;

/** Auth rate limit: requests per window, per IP. */
export const AUTH_RATE_LIMIT = 10;
export const AUTH_RATE_WINDOW_MS = 60 * 1000;

/** Client -> server message names. */
export const MSG_MOVE = "move";
/** Server -> client message names. */
export const MSG_ADMIT = "admit";
export const MSG_QUEUE = "queue";
export const MSG_KICK = "kick";

/** Reason codes sent with MSG_KICK / join errors so the UI can explain itself. */
export const KICK_INSUFFICIENT_HOLD = "insufficient_hold";
export const KICK_AUTH_EXPIRED = "auth_expired";
