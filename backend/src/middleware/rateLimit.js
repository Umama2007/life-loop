// A small, dependency-free rate limiter. LifeLoop is designed to run as a
// single local process for one person, so an in-memory counter is enough —
// no Redis or external store needed. Buckets are keyed by IP + route name.

const buckets = new Map();

function rateLimit({ windowMs, max, message }) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    buckets.set(key, bucket);

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
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref();

module.exports = { rateLimit };
