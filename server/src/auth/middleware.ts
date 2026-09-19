import type { NextFunction, Request, Response } from "express";
import type { SessionClaims } from "@crazycauldron/shared";
import { log } from "../logger.js";
import { verifyToken } from "./jwt.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      claims?: SessionClaims;
    }
  }
}

/** Rejects anything without a live session JWT; attaches claims on success. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const claims = verifyToken(req.header("authorization"));
  if (!claims) {
    log.authFailure("invalid_token", { path: req.path });
    return res.status(401).json({ error: "unauthorized", message: "Sign in again to continue." });
  }
  req.claims = claims;
  return next();
}
