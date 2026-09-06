/**
 * Simple in-memory token-bucket rate limiter.
 * Per-process, no persistence — adequate for single-instance Node and best-effort on Vercel.
 * For Vercel production at scale, replace with Upstash/KV or Postgres-backed limiter.
 * API: isRateLimited(key, limit, windowMs) -> { limited, retryAfter }
 */

const buckets = new Map(); // key -> { count, resetAt }

export function isRateLimited(key, limit, windowMs) {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now >= entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, retryAfter: 0 };
  }
  if (entry.count < limit) {
    entry.count += 1;
    return { limited: false, retryAfter: 0 };
  }
  return { limited: true, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
}

// Exposed for tests: clear and inspect
export function _clearBuckets() {
  buckets.clear();
}

export function _getBucket(key) {
  return buckets.get(key) || null;
}

// Periodic cleanup of expired buckets (avoid unbounded growth)
let _cleanupTimer = null;
export function _startCleanup(intervalMs = 5 * 60 * 1000) {
  if (_cleanupTimer) return;
  _cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
  }, intervalMs);
  if (_cleanupTimer.unref) _cleanupTimer.unref();
}
_startCleanup();
