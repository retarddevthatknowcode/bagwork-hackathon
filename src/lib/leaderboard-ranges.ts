/**
 * The leaderboard's range vocabulary.
 *
 * A pure module on purpose: the API (`lib/leaderboard.ts`) and the console board both need
 * these names, and the board is a client component. Keeping them here means the page can
 * import the real list instead of restating it — `lib/leaderboard.ts` imports Prisma, so
 * anything imported from there would drag the database client into the browser bundle.
 */

/** The windows the board can be ranked over. */
export const LEADERBOARD_RANGES = ["daily", "weekly", "monthly", "overall"] as const;

export type LeaderboardRange = (typeof LEADERBOARD_RANGES)[number];

/** The default board: lifetime points. */
export const DEFAULT_LEADERBOARD_RANGE: LeaderboardRange = "overall";

export function isLeaderboardRange(value: unknown): value is LeaderboardRange {
  return (
    typeof value === "string" && LEADERBOARD_RANGES.includes(value as LeaderboardRange)
  );
}

export interface LeaderboardRangeMeta {
  key: LeaderboardRange;
  /** Filter label. */
  label: string;
  /** Reads inside a sentence: "9 settled payouts this week". */
  caption: string;
  /** One line under the filters, describing exactly what is being ranked. */
  description: string;
}

/**
 * Ordered Daily → Weekly → Monthly → Overall, with Overall last *and* the default: the
 * lifetime board is the stable one, and the shorter windows are the ones people come back to
 * check.
 */
export const LEADERBOARD_RANGE_META: readonly LeaderboardRangeMeta[] = [
  {
    key: "daily",
    label: "Daily",
    caption: "today",
    description: "Points earned today, in UTC.",
  },
  {
    key: "weekly",
    label: "Weekly",
    caption: "this week",
    description: "Points earned this week, from Monday (UTC).",
  },
  {
    key: "monthly",
    label: "Monthly",
    caption: "this month",
    description: "Points earned this calendar month (UTC).",
  },
  {
    key: "overall",
    label: "Overall",
    caption: "all time",
    description: "Lifetime points — the ones that never go down.",
  },
];

export function leaderboardRangeMeta(range: LeaderboardRange): LeaderboardRangeMeta {
  return (
    LEADERBOARD_RANGE_META.find((entry) => entry.key === range) ??
    LEADERBOARD_RANGE_META[LEADERBOARD_RANGE_META.length - 1]
  );
}

/**
 * How many rows the console board returns.
 *
 * The podium carries ranks 1–3 and the list underneath continues to 50, so this is the number a
 * person actually scrolls. It replaced a 100-row cap that applied to a board which could only
 * ever hold earners anyway.
 */
export const CONSOLE_LEADERBOARD_LIMIT = 50;

/**
 * Start of the current window, in UTC.
 *
 * UTC rather than the viewer's local midnight: a global board has to agree with itself, and if
 * the boundary moved per browser two people would see different winners for the same day.
 * `weekly` starts on Monday (ISO), `monthly` on the 1st. `overall` has no start.
 */
export function leaderboardWindowStart(
  range: LeaderboardRange,
  now: Date = new Date(),
): Date | null {
  if (range === "overall") return null;

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (range === "daily") return start;

  if (range === "weekly") {
    // getUTCDay: 0 = Sunday. Shift so Monday = 0, then step back to that week's Monday.
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    return start;
  }

  start.setUTCDate(1);
  return start;
}
