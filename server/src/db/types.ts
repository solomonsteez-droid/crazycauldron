export interface PlayerRecord {
  wallet: string;
  displayName: string;
  createdAt: string;
  lastSeenAt: string;
}

/**
 * The only surface the rest of the server uses to reach storage. Swapping
 * SQLite for Postgres means adding one more implementation of this, nothing
 * else changes.
 */
export interface PlayerRepository {
  findByWallet(wallet: string): PlayerRecord | null;
  /** Insert on first verified login, otherwise bump lastSeenAt. Returns the row. */
  upsertOnLogin(wallet: string, defaultDisplayName: string): PlayerRecord;
  touchLastSeen(wallet: string): void;
}
