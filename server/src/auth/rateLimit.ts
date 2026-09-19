import type { NextFunction, Request, Response } from "express";
import { AUTH_RATE_LIMIT, AUTH_RATE_WINDOW_MS } from "@crazycauldron/shared";
import { log } from "../logger.js";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

/** Fixed-window limiter, in-process. Good enough for a single-node skeleton. */
export function rateLimit(limit = AUTH_RATE_LIMIT, windowMs = AUTH_RATE_WINDOW_MS) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const ip = clientIp(req);
    const bucket = buckets.get(ip);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > limit) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      log.authFailure("rate_limited", { ip, path: req.path, count: bucket.count });
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: "rate_limited",
        message: `Too many requests. Try again in ${retryAfter}s.`,
      });
    }
    return next();
  };
}

// Keep the map from growing without bound on a long-lived process.
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(ip);
}, AUTH_RATE_WINDOW_MS).unref();
