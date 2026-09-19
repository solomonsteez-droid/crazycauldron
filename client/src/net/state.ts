/**
 * Client-side shapes for the replicated room state.
 *
 * Deliberately structural rather than importing the server's schema classes:
 * the SDK decodes state from the reflection data the server sends on join, so
 * the client needs the field names but not the decorated classes - and the
 * server's schema file stays free to import server-only modules.
 *
 * Nothing here carries a callback. Since 0.16 the listeners live on a separate
 * proxy handed out by getStateCallbacks(room) rather than on the decoded
 * objects, which is why these are plain data shapes. The iterator and entries()
 * are declared because that is how the proxy recognises a collection.
 */

export interface MapSchemaLike<T> {
  readonly size: number;
  get(key: string): T | undefined;
  forEach(callback: (value: T, key: string) => void): void;
  entries(): IterableIterator<[string, T]>;
  [Symbol.iterator](): IterableIterator<[string, T]>;
}

export interface PlayerView {
  sessionId: string;
  wallet: string;
  displayName: string;
  tileX: number;
  tileY: number;
  facing: string;
  moving: boolean;
  /** 0 is the hub, 1..3 the gathering sections. */
  section: number;
  chefLevel: number;
  /** "gathering" or "cooking" while the server is timing an action. */
  activity: string;
  body: string;
  hatId: string;
  /** The creature walking with them, or empty. Drawn, never replicated further. */
  companionId: string;
}

/** A hub resident. No wallet and no progress - they are scenery that walks. */
export interface VillagerView {
  id: string;
  name: string;
  tileX: number;
  tileY: number;
  facing: string;
  moving: boolean;
  body: string;
  hatId: string;
}

export interface HubStateView {
  players: MapSchemaLike<PlayerView>;
  villagers: MapSchemaLike<VillagerView>;
}

export interface QueuedPlayerView {
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
