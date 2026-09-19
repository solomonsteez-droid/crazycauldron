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
 * came from. Saying so rather than reading it from a build-time variable means
 * a deployment cannot be built pointing at the wrong host, and a preview
 * deployment works without being rebuilt for its own URL.
 *
 * A VITE_SERVER_* var still wins where one is set - a split deployment, or a
 * developer pointing a local client at a staging server.
 */
const origin = typeof window === "undefined" ? "" : window.location.origin;
const sameOriginHttp = origin;
const sameOriginWs = origin.replace(/^http/, "ws");

const DEV_HTTP = "http://localhost:2567";
const DEV_WS = "ws://localhost:2567";

export const env = {
  httpUrl:
    fromEnv(import.meta.env.VITE_SERVER_HTTP_URL) ??
    (import.meta.env.PROD ? sameOriginHttp : DEV_HTTP),
  wsUrl:
    fromEnv(import.meta.env.VITE_SERVER_WS_URL) ??
    (import.meta.env.PROD ? sameOriginWs : DEV_WS),
} as const;
