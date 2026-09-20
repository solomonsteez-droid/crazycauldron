/**
 * Two small pure helpers, in their own file so they can be imported without
 * dragging anything else in.
 *
 * They were in data.ts, which fetches - and fetching means importing
 * net/env.ts, which reads `import.meta.env` at module scope and therefore only
 * exists inside a Vite bundle. Keeping these separate is what lets
 * scripts/test-site.ts import the whole page under plain Node and assert on
 * the markup it builds, rather than grepping a minified bundle and hoping.
 */

/**
 * A social handle, or null when there is none.
 *
 * "none" is a real answer in the config and a deliberate one: saying "we have
 * no Telegram" is useful, and silence is what a fake account fills. It is not
 * a link, though, so it is filtered here and spelled out in the copy.
 */
export function handle(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" || trimmed.toLowerCase() === "none" ? null : trimmed;
}

/** An address shortened for display, with the full value kept for copying. */
export function shorten(address: string, keep = 6): string {
  return address.length <= keep * 2 + 3
    ? address
    : `${address.slice(0, keep)}…${address.slice(-keep)}`;
}
