import { createHmac } from "node:crypto";
import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "@workspace/db";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

// Local development can use a memory store. In serverless production, use the
// shared PostgreSQL atomic counter so different function instances cooperate.
const localLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: MAX_ATTEMPTS,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const databaseLimiter: RequestHandler = (req, res, next) => {
  void (async () => {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      res.status(503).json({ error: "Sistem autentikasi tidak tersedia." });
      return;
    }
    const address = req.ip || req.socket.remoteAddress || "unknown";
    const hashedKey = createHmac("sha256", secret)
      .update(`${req.baseUrl}|${address}`).digest("hex");
    const windowStart = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
    const { rows } = await pool.query<{ hits: number }>(
      `INSERT INTO erp_auth_rate_limit (key_hash, window_start, hits)
       VALUES ($1, $2, 1)
       ON CONFLICT (key_hash, window_start)
       DO UPDATE SET hits = erp_auth_rate_limit.hits + 1
       RETURNING hits`,
      [hashedKey, windowStart],
    );
    const hits = Number(rows[0]?.hits ?? 1);
    res.setHeader("RateLimit-Limit", String(MAX_ATTEMPTS));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, MAX_ATTEMPTS - hits)));
    res.setHeader("RateLimit-Reset", String(Math.ceil((windowStart + WINDOW_MS) / 1000)));
    if (hits > MAX_ATTEMPTS) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((windowStart + WINDOW_MS - Date.now()) / 1000))));
      res.status(429).json({ error: "Terlalu banyak percobaan. Silakan coba lagi beberapa menit lagi." });
      return;
    }
    next();
  })().catch((error: unknown) => {
    // Fail closed on authentication endpoints when the rate limit store is down.
    req.log?.error({ err: error }, "Shared auth rate limiting failed");
    res.status(503).json({ error: "Proteksi autentikasi sementara tidak tersedia." });
  });
};

export const sharedAuthRateLimit: RequestHandler =
  process.env.NODE_ENV === "production" ? databaseLimiter : localLimiter;
