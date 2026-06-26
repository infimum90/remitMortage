import rateLimit from "express-rate-limit";

/**
 * Strict rate limiter for wallet-verification challenge and verify-ownership
 * endpoints: 10 requests per minute per IP.
 *
 * These endpoints trigger cryptographic operations and on-chain lookups, so
 * they require tighter protection than general verification queries.
 */
export const verificationChallengeRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const retryAfter = Math.ceil(60);
    res.status(429).json({
      error: "Too many requests",
      retryAfter,
      statusCode: 429,
    });
  },
});
