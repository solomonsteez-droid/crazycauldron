/**
 * The day a tally belongs to.
 *
 * UTC, and deliberately not the server's local time. On Colyseus Cloud the
 * processes are in whatever region the deployment landed in, a restart can
 * move them, and "today" changing meaning between two processes would split a
 * day's count in half. UTC is the same everywhere and needs no configuration.
 */
export function utcDay(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}
