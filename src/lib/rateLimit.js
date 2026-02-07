const STORE_KEY = '__mobilityRateLimitStore';

function getStore() {
  if (!globalThis[STORE_KEY]) {
    globalThis[STORE_KEY] = new Map();
  }
  return globalThis[STORE_KEY];
}

export function getRequestIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;

  return request.ip || 'unknown';
}

export function rateLimit(key, { windowMs, max }) {
  const store = getStore();
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: Math.max(0, max - 1),
      resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)),
    };
  }

  if (entry.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  entry.count += 1;
  store.set(key, entry);

  return {
    allowed: true,
    remaining: Math.max(0, max - entry.count),
    resetAt: entry.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}
