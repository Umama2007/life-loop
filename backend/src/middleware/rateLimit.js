const { Redis } = require("@upstash/redis");

let redis = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
} else if (process.env.NODE_ENV === "production") {
  console.error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN in production environment. Serverless rate limiting requires Upstash Redis.");
  process.exit(1);
} else {
  console.warn("Warning: Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN. Rate limiting is falling back to an in-memory map, which does not work properly across serverless functions.");
}

const localBuckets = new Map();

function rateLimit({ windowMs, max, message }) {
  return async (req, res, next) => {
    const key = `rl:${req.ip}:${req.baseUrl}${req.path}`;
    const windowSeconds = Math.ceil(windowMs / 1000);

    if (redis) {
      try {
        const count = await redis.incr(key);
        if (count === 1) {
          await redis.expire(key, windowSeconds);
        }
        
        if (count > max) {
          const ttl = await redis.ttl(key);
          res.set("Retry-After", ttl > 0 ? ttl.toString() : windowSeconds.toString());
          return res.status(429).json({
            success: false,
            error: "RATE_LIMITED",
            message: message || "Too many requests. Please wait a moment and try again.",
          });
        }
        return next();
      } catch (err) {
        console.error("Redis rate limiting error:", err);
        // Fail open if Redis is down so we don't break the whole app
        return next();
      }
    }

    // In-memory fallback
    const now = Date.now();
    const bucket = localBuckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    localBuckets.set(key, bucket);

    if (bucket.count > max) {
      res.set("Retry-After", Math.ceil((bucket.resetAt - now) / 1000).toString());
      return res.status(429).json({
        success: false,
        error: "RATE_LIMITED",
        message: message || "Too many requests. Please wait a moment and try again.",
      });
    }

    next();
  };
}

// Periodically clear out stale buckets so memory doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of localBuckets) {
    if (now > bucket.resetAt) localBuckets.delete(key);
  }
}, 5 * 60 * 1000).unref();

module.exports = { rateLimit };
