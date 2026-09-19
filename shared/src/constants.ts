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
export const MSG_TRAVEL = "travel";
export const MSG_GATHER = "gather";
export const MSG_COOK_START = "cook_start";
export const MSG_COOK_PREP = "cook_prep";
export const MSG_COOK_STOP = "cook_stop";
export const MSG_COOK_CANCEL = "cook_cancel";
export const MSG_SELL = "sell";
export const MSG_EAT = "eat";
export const MSG_BUY = "buy";

/** Server -> client message names. */
export const MSG_ADMIT = "admit";
export const MSG_QUEUE = "queue";
export const MSG_KICK = "kick";
export const MSG_PROFILE = "profile";
export const MSG_NODES = "nodes";
export const MSG_GATHER_STARTED = "gather_started";
export const MSG_GATHER_RESULT = "gather_result";
export const MSG_COOK_PREPARED = "cook_prepared";
export const MSG_HEAT_BAR = "heat_bar";
export const MSG_COOK_RESULT = "cook_result";
export const MSG_SOLD = "sold";
export const MSG_ATE = "ate";
export const MSG_BOUGHT = "bought";
export const MSG_REJECTED = "rejected";

/**
 * Anti-abuse. One action may be in flight per session, and a new action is
 * refused if it arrives sooner than the previous one's animation minus this
 * grace - enough to absorb a slow frame, not enough to script a faster loop.
 */
export const ACTION_GRACE_MS = 200;

/**
 * How far the client's reported click time may differ from the server's own
 * measurement before the click is thrown away as implausible.
 */
export const MAX_CLICK_LATENCY_MS = 1500;

/** How often the client refetches the leaderboard. */
export const LEADERBOARD_POLL_MS = 60 * 1000;
export const LEADERBOARD_SIZE = 20;

/** Reason codes sent with MSG_KICK / join errors so the UI can explain itself. */
export const KICK_INSUFFICIENT_HOLD = "insufficient_hold";
export const KICK_AUTH_EXPIRED = "auth_expired";
