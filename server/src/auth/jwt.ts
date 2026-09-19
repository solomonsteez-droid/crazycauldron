import jwt from "jsonwebtoken";
import { JWT_TTL_SECONDS, type SessionClaims } from "@crazycauldron/shared";
import { config } from "../config.js";

export function issueToken(wallet: string, displayName: string): string {
  return jwt.sign({ wallet, displayName }, config.jwtSecret, {
    subject: wallet,
    expiresIn: JWT_TTL_SECONDS,
    algorithm: "HS256",
  });
}

/** Returns the claims, or null for anything that does not verify cleanly. */
export function verifyToken(token: string | undefined | null): SessionClaims | null {
  if (!token) return null;
  const raw = token.startsWith("Bearer ") ? token.slice(7) : token;
  try {
    const claims = jwt.verify(raw, config.jwtSecret, { algorithms: ["HS256"] });
    if (typeof claims === "string") return null;
    const { sub, wallet, displayName, iat, exp } = claims as Record<string, unknown>;
    if (typeof sub !== "string" || typeof wallet !== "string") return null;
    return {
      sub,
      wallet,
      displayName: typeof displayName === "string" ? displayName : sub,
      iat: Number(iat),
      exp: Number(exp),
    };
  } catch {
    return null;
  }
}
