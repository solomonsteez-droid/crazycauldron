/**
 * The client's entire view of its configuration. Anything not listed here is,
 * by design, unreachable from the browser: Vite only inlines VITE_-prefixed
 * vars, and RPC_URL / COOK_MINT / JWT_SECRET deliberately lack the prefix.
 */
export const env = {
  httpUrl: import.meta.env.VITE_SERVER_HTTP_URL ?? "http://localhost:2567",
  wsUrl: import.meta.env.VITE_SERVER_WS_URL ?? "ws://localhost:2567",
} as const;
