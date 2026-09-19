import { ROOM_HUB, ROOM_WAITING } from "@crazycauldron/shared";
import type {
  ApiError as ApiErrorBody,
  EnterResponse,
  LeaderboardPayload,
  NonceResponse,
  VerifyRequest,
  VerifyResponse,
} from "@crazycauldron/shared";
import { env } from "./env.js";

/** A non-2xx response from the game server, carrying the server's own wording. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message);
    this.name = "ApiError";
  }

  /** True when the wallet is genuine but holds too little $COOK. */
  get isInsufficientHold(): boolean {
    return this.status === 403 && this.body.error === "insufficient_hold";
  }
}

/** Narrows a 2xx body to the shape the caller is about to destructure. */
type Validator<T> = (body: unknown) => body is T;

/** A short, safe excerpt of a body for an error a human has to diagnose. */
function preview(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "(empty response)";
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
}

async function request<T>(path: string, init?: RequestInit, isValid?: Validator<T>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${env.httpUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, {
      error: "network_error",
      message: "Could not reach the cauldron. Is the server running?",
    });
  }

  const text = await response.text();
  let parsed: unknown = {};
  try {
    if (text) parsed = JSON.parse(text) as unknown;
  } catch {
    // A proxy or crash can answer with HTML. Report the status, not a parse
    // error the player can do nothing with.
    throw new ApiError(response.status, {
      error: "bad_response",
      message: `The server answered unexpectedly (${response.status}).`,
    });
  }

  if (!response.ok) {
    const body = parsed as Partial<ApiErrorBody>;
    throw new ApiError(response.status, {
      error: body.error ?? "error",
      message: body.message ?? `Request failed (${response.status}).`,
      balance: body.balance,
      minHold: body.minHold,
    });
  }

  // A 2xx with the wrong shape is still a failure. Without this the mismatch
  // surfaces much later as "Cannot read properties of undefined" somewhere deep
  // in a scene, naming neither the endpoint nor what actually came back.
  if (isValid && !isValid(parsed)) {
    throw new ApiError(response.status, {
      error: "bad_response",
      message: `${path} answered ${response.status} with an unexpected body: ${preview(text)}`,
    });
  }
  return parsed as T;
}

function isRecord(body: unknown): body is Record<string, unknown> {
  return typeof body === "object" && body !== null && !Array.isArray(body);
}

function isNonceResponse(body: unknown): body is NonceResponse {
  return isRecord(body) && typeof body.nonce === "string" && typeof body.message === "string";
}

function isVerifyResponse(body: unknown): body is VerifyResponse {
  return isRecord(body) && typeof body.token === "string" && typeof body.wallet === "string";
}

function isEnterResponse(body: unknown): body is EnterResponse {
  return (
    isRecord(body) &&
    (body.room === ROOM_HUB || body.room === ROOM_WAITING) &&
    // The SDK reads the room off the reservation, so an absent one crashes
    // inside the library rather than here.
    isRecord(body.reservation)
  );
}

function isCapacityResponse(body: unknown): body is CapacityResponse {
  return (
    isRecord(body) &&
    typeof body.hubPlayers === "number" &&
    typeof body.globalMax === "number" &&
    typeof body.full === "boolean"
  );
}

export function fetchNonce(address: string): Promise<NonceResponse> {
  return request<NonceResponse>(
    `/auth/nonce?address=${encodeURIComponent(address)}`,
    undefined,
    isNonceResponse,
  );
}

export function verifySignature(body: VerifyRequest): Promise<VerifyResponse> {
  return request<VerifyResponse>(
    "/auth/verify",
    { method: "POST", body: JSON.stringify(body) },
    isVerifyResponse,
  );
}

/**
 * Asks the server which room to join and for a seat in it.
 *
 * Mounted under /play, not /matchmake: Colyseus claims every URL containing
 * that substring on the same http server.
 */
export function enterWorld(token: string): Promise<EnterResponse> {
  return request<EnterResponse>(
    "/play/enter",
    { method: "POST", headers: { authorization: `Bearer ${token}` } },
    isEnterResponse,
  );
}

export interface CapacityResponse {
  hubPlayers: number;
  hubRooms: number;
  globalMax: number;
  hubMax: number;
  full: boolean;
}

export function fetchCapacity(): Promise<CapacityResponse> {
  return request<CapacityResponse>("/play/capacity", undefined, isCapacityResponse);
}

function isLeaderboard(body: unknown): body is LeaderboardPayload {
  return isRecord(body) && Array.isArray(body.rows);
}

/** Top 20 chefs. Polled rather than pushed: it changes slowly and is public. */
export function fetchLeaderboard(): Promise<LeaderboardPayload> {
  return request<LeaderboardPayload>("/play/leaderboard", undefined, isLeaderboard);
}
