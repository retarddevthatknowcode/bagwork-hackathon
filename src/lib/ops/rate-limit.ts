/**
 * A small in-process sliding-window limiter.
 *
 * Good enough for a single Node process and explicitly **not** distributed: on Vercel every
 * instance keeps its own counters, so the real ceiling is `limit × instances`. That is
 * acceptable for a bug-report box, where the thing being stopped is an accidental retry loop
 * or a bored script rather than a determined attacker — anything stronger wants Redis, which
 * this deployment does not have.
 *
 * Kept in its own module so the store is module-scoped and shared across requests in a process.
 */

/** key → timestamps (ms) of accepted hits inside the current window. */
const buckets = new Map<string, number[]>();

/** A soft ceiling on the map, so an unlucky spread of IPs cannot grow it without bound. */
const MAX_KEYS = 5_000;

/**
 * Records a hit for `key` and reports whether it is allowed.
 *
 * Returns `false` (denied) once `limit` hits have landed inside `windowMs`; a denied call does
 * not extend the window, so a blocked caller is not punished for trying again.
 */
export function takeToken(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;

  const hits = (buckets.get(key) ?? []).filter((at) => at > cutoff);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }

  hits.push(now);
  buckets.set(key, hits);

  if (buckets.size > MAX_KEYS) {
    // Evict oldest-inserted keys first — `Map` preserves insertion order.
    for (const k of buckets.keys()) {
      buckets.delete(k);
      if (buckets.size <= MAX_KEYS) break;
    }
  }

  return true;
}

/** Best-effort caller identity for the limiter. Behind Vercel the first `x-forwarded-for` hop is it. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
