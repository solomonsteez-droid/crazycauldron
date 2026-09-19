export type Facing = "n" | "e" | "s" | "w";

export interface TilePos {
  tileX: number;
  tileY: number;
}

/** Client -> server move intent. Only ever a *destination*, never a position. */
export interface MoveIntent extends TilePos {}

/** GET /auth/nonce */
export interface NonceResponse {
  nonce: string;
  /** Pre-rendered SIWS message the wallet should sign, verbatim. */
  message: string;
  issuedAt: string;
  expiresAt: string;
}

/** POST /auth/verify */
export interface VerifyRequest {
  address: string;
  message: string;
  /** base58-encoded Ed25519 signature. */
  signature: string;
}

export interface VerifyResponse {
  token: string;
  wallet: string;
  displayName: string;
  /** UI-amount of $COOK held at verification time (0 when the gate is bypassed). */
  balance: number;
  minHold: number;
}

export interface ApiError {
  error: string;
  message: string;
  /** Present on 403 insufficient-hold responses so the UI can show both numbers. */
  balance?: number;
  minHold?: number;
}

/** POST /matchmake/enter -> a Colyseus seat reservation to consume. */
export interface EnterResponse {
  room: "hub" | "waiting";
  reservation: unknown;
}

/** Payload carried by the session JWT. */
export interface SessionClaims {
  sub: string;
  wallet: string;
  displayName: string;
  iat: number;
  exp: number;
}

/** Tile ids of the placeholder hub map. Index into the generated tileset. */
export enum TileId {
  Grass = 0,
  Path = 1,
}
