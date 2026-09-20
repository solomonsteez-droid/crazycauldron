/**
 * The client's entire view of its configuration. Anything not listed here is,
 * by design, unreachable from the browser: Vite only inlines VITE_-prefixed
 * vars, and RPC_URL / COOK_MINT / JWT_SECRET deliberately lack the prefix.
 */

/** Treats an unset var and an empty one the same way, because a .env does. */
function fromEnv(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/*
 * In production the server hosts this page, so the server is wherever the page
 * came from - always, with nothing able to say otherwise.
 *
 * "Always" is the part that was learned the hard way. This used to let a
 * VITE_SERVER_* var win wherever one was set, which was fine while the host
 * built the bundle and had no .env. Once the build moved onto a developer's
 * machine, the repo-root .env - which says localhost:2567, correctly, for them
 * - was baked into the bundle the world downloads, and the deployed client
 * tried to sign players in against a laptop. So in a production build the
 * question is not asked: same origin, from the address bar. A preview URL then
 * works without a rebuild too, which is the same property from the other side.
 *
 * vite.config.ts pins both vars to empty for `build` as well. Either one alone
 * fixes it; both mean the strings are not in the bundle at all, which is
 * something a test can assert.
 *
 * A split deployment - client and server on different hosts - is a code change
 * here, and deliberately so. It is rare, and it is not worth a switch that
 * points production at a laptop when somebody forgets.
 */
const origin = typeof window === "undefined" ? "" : window.location.origin;
const sameOriginHttp = origin;
const sameOriginWs = origin.replace(/^http/, "ws");

/* Where the dev client on :5173 finds the dev server. Overridable, and folded
 * out of a production bundle entirely. */
const DEV_HTTP = "http://localhost:2567";
const DEV_WS = "ws://localhost:2567";

export const env = {
  httpUrl: import.meta.env.PROD
    ? sameOriginHttp
    : fromEnv(import.meta.env.VITE_SERVER_HTTP_URL) ?? DEV_HTTP,
  wsUrl: import.meta.env.PROD
    ? sameOriginWs
    : fromEnv(import.meta.env.VITE_SERVER_WS_URL) ?? DEV_WS,
} as const;
