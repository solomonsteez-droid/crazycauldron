/**
 * Client-side shapes for the replicated room state.
 *
 * Deliberately structural rather than importing the server's schema classes:
 * colyseus.js decodes state from the reflection data the server sends on join,
 * so the client needs the field names but not the decorated classes - and the
 * server's schema file stays free to import server-only modules.
 */

export interface MapSchemaLike<T> {
  readonly size: number;
  get(key: string): T | undefined;
  forEach(callback: (value: T, key: string) => void): void;
  onAdd(callback: (value: T, key: string) => void, triggerAll?: boolean): void;
  onRemove(callback: (value: T, key: string) => void): void;
}

/** Anything decoded from a Schema exposes onChange. */
export interface Watchable {
  onChange(callback: () => void): void;
}

export interface PlayerView extends Watchable {
  sessionId: string;
  wallet: string;
  displayName: string;
  tileX: number;
  tileY: number;
  facing: string;
  moving: boolean;
}

export interface HubStateView {
  players: MapSchemaLike<PlayerView>;
}

export interface QueuedPlayerView extends Watchable {
  wallet: string;
  displayName: string;
  place: number;
}

export interface WaitingStateView {
  queue: MapSchemaLike<QueuedPlayerView>;
  hubPlayers: number;
  globalMax: number;
}

/** Payload of the server's MSG_QUEUE message. */
export interface QueueUpdate {
  place: number;
  waiting: number;
}

/** Payload of the server's MSG_KICK message. */
export interface KickNotice {
  reason: string;
}
