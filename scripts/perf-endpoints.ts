/**
 * Times the hot endpoints so a slow page can be attributed to a route rather than to a hunch.
 *
 * Local:      `bun run perf:endpoints`
 * Production: `PERF_BASE=https://bagwork-eta.vercel.app bun run perf:endpoints`
 *
 * `min` is the honest number — with a warm connection it shows the floor — and a `min` that scales
 * with the number of sequential statements in a route is the signature to look for. That is how the
 * campaigns feed was found making two round-trips (2207ms) where one (1194ms) does, and how the
 * marketing aggregates were confirmed to be single-round-trip and therefore worth caching instead.
 */

export {};

const BASE = process.env.PERF_BASE ?? "http://localhost:3400";

const ENDPOINTS = [
  "/api/treasury", // no DB at all → the overhead floor
  "/api/stats",
  "/api/campaigns?status=ALL",
  "/api/campaigns?status=LIVE",
  "/api/leaderboard",
  "/api/console/notifications",
  "/api/profile",
];

const runs = Number(process.env.RUNS ?? 3);

for (const path of ENDPOINTS) {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    const res = await fetch(BASE + path).catch(() => null);
    const ms = Math.round(performance.now() - start);
    if (res) await res.text();
    times.push(ms);
  }
  const min = Math.min(...times);
  const max = Math.max(...times);
  console.log(
    `${String(min).padStart(5)}ms min  ${String(max).padStart(5)}ms max   ${path.padEnd(34)} ${times.join(", ")}`,
  );
}
