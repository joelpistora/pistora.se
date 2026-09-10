/**
 * A tiny in-memory failed-login limiter. Per app instance (not module-global),
 * so tests don't bleed into each other. Keyed by email — enough friction to make
 * online password guessing impractical for a closed user set. Not a substitute
 * for real rate limiting at the edge (Phase 5).
 */
export interface LoginThrottle {
  /** Seconds the caller must wait, or 0 if a login attempt is allowed now. */
  retryAfter(key: string, now: number): number;
  recordFailure(key: string, now: number): void;
  reset(key: string): void;
}

export function createLoginThrottle(
  opts: { max?: number; windowMs?: number } = {},
): LoginThrottle {
  const max = opts.max ?? 5;
  const windowMs = opts.windowMs ?? 15 * 60_000;
  const failures = new Map<string, number[]>();

  function recent(key: string, now: number): number[] {
    const list = (failures.get(key) ?? []).filter((t) => t > now - windowMs);
    if (list.length) failures.set(key, list);
    else failures.delete(key);
    return list;
  }

  return {
    retryAfter(key, now) {
      const list = recent(key, now);
      if (list.length < max) return 0;
      return Math.max(1, Math.ceil((list[0]! + windowMs - now) / 1000));
    },
    recordFailure(key, now) {
      const list = recent(key, now);
      list.push(now);
      failures.set(key, list);
    },
    reset(key) {
      failures.delete(key);
    },
  };
}
