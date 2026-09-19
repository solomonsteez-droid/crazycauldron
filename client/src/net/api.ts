import type {
  ApiError as ApiErrorBody,
  EnterResponse,
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
  const parsed = text ? (JSON.parse(text) as unknown) : {};

  if (!response.ok) {
    const body = parsed as Partial<ApiErrorBody>;
    throw new ApiError(response.status, {
      error: body.error ?? "error",
      message: body.message ?? `Request failed (${response.status}).`,
      balance: body.balance,
      minHold: body.minHold,
    });
  }
  return parsed as T;
}

export function fetchNonce(address: string): Promise<NonceResponse> {
  return request<NonceResponse>(`/auth/nonce?address=${encodeURIComponent(address)}`);
}

export function verifySignature(body: VerifyRequest): Promise<VerifyResponse> {
  return request<VerifyResponse>("/auth/verify", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Asks the server which room to join and for a seat in it. */
export function enterWorld(token: string): Promise<EnterResponse> {
  return request<EnterResponse>("/matchmake/enter", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
}

export interface CapacityResponse {
  hubPlayers: number;
  hubRooms: number;
  globalMax: number;
  hubMax: number;
  full: boolean;
}

export function fetchCapacity(): Promise<CapacityResponse> {
  return request<CapacityResponse>("/matchmake/capacity");
}
