export interface PlayerRecord {
  wallet: string;
  displayName: string;
  createdAt: string;
  lastSeenAt: string;
}

/**
 * The only surface the rest of the server uses to reach storage.
 *
 * Every method returns a promise even though the SQLite implementation could
 * answer on the spot. Postgres cannot, and one of the two backends having a
 * different shape would mean every caller knowing which one it was talking to.
 */
export interface PlayerRepository {
  findByWallet(wallet: string): Promise<PlayerRecord | null>;
  /** Insert on first verified login, otherwise bump lastSeenAt. Returns the row. */
  upsertOnLogin(wallet: string, defaultDisplayName: string): Promise<PlayerRecord>;
  touchLastSeen(wallet: string): Promise<void>;
}
