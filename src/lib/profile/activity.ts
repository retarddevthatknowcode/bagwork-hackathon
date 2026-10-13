import { db } from "@/lib/db";

/**
 * The contribution calendar's data.
 *
 * Shared by the two endpoints that need it — `GET /api/profile/activity` (the calendar itself) and
 * `GET /api/profile/[handle]` (the stat cards beside it) — because two implementations of "how many
 * contributions" would eventually disagree, and the number under the calendar contradicting the
 * number in the card above it is worse than either being slightly wrong.
 *
 * One contribution = one submission activity, counted per event rather than per row. Opting into a
 * bag (`claimedAt`), delivering the post link (`submittedAt`) and being approved (`approvedAt`) each
 * add one, so a day with two claims and an approval is three. Those are exactly the three moments
 * the schema records, and `createdAt`/`updatedAt` are deliberately absent: a claim's `createdAt`
 * doubles its `claimedAt`, and `updatedAt` moves on any write.
 *
 * What this returns is counts per day and nothing else — no submission content, no campaign, no
 * moderation state. That is what makes it safe to ask for on someone else's profile.
 */

/** 12 months. 365 cells including today, which is what the calendar renders. */
export const ACTIVITY_WINDOW_DAYS = 365;

const DAY_MS = 86_400_000;

export interface ActivityDay {
  /** Local midnight, `YYYY-MM-DDT00:00:00` — see the note in `collectProfileActivity`. */
  date: string;
  count: number;
}

export interface ProfileActivityWindow {
  window: { days: number; from: string; to: string };
  /** Only the days that have activity; the calendar fills every other cell as empty. */
  days: ActivityDay[];
  total: number;
  activeDays: number;
}

/**
 * The caller's UTC offset in minutes, as `Date.prototype.getTimezoneOffset()` reports it
 * (UTC − local: Berlin is −120 in summer, New York is +300).
 *
 * Contributions belong to the day the creator had, not the day the server happens to be in.
 * Bucketing in UTC would file everything a Berliner does after 22:00 under tomorrow, and
 * everything a New Yorker does before 05:00 under yesterday, so the browser sends its own
 * offset. Clamped to ±14h because an unvalidated offset would shift the whole window.
 */
export function parseActivityOffset(raw: string | null): number {
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(value)) return 0;
  return Math.max(-14 * 60, Math.min(14 * 60, value));
}

/**
 * The local day an instant belongs to, as `YYYY-MM-DD`: shift the instant by the offset and read
 * the UTC fields of the result, which turns "what the clock on the wall said" into something
 * sortable.
 */
function dayKey(instant: Date, offsetMinutes: number): string {
  return new Date(instant.getTime() - offsetMinutes * 60_000).toISOString().slice(0, 10);
}

/**
 * One Bagworker's contribution counts over the last 12 months.
 *
 * The window is built in the caller's timezone: take "now" as the wall clock they are looking at,
 * floor it to their midnight, and step back 364 days. Both ends are then converted back to real
 * instants (the same shift, reversed) for the database filter, so a row that is one day old for the
 * viewer is not missed because the server wrote it after its own midnight.
 */
export async function collectProfileActivity(
  userId: string,
  offsetMinutes: number,
): Promise<ProfileActivityWindow> {
  const shiftedNow = new Date(Date.now() - offsetMinutes * 60_000);
  const lastDay = new Date(
    Date.UTC(shiftedNow.getUTCFullYear(), shiftedNow.getUTCMonth(), shiftedNow.getUTCDate()),
  );
  const firstDay = new Date(lastDay.getTime() - (ACTIVITY_WINDOW_DAYS - 1) * DAY_MS);
  const since = new Date(firstDay.getTime() + offsetMinutes * 60_000);

  const firstKey = firstDay.toISOString().slice(0, 10);
  const lastKey = lastDay.toISOString().slice(0, 10);

  const rows = await db.submission.findMany({
    where: {
      userId,
      OR: [
        { claimedAt: { gte: since } },
        { submittedAt: { gte: since } },
        { approvedAt: { gte: since } },
      ],
    },
    select: { claimedAt: true, submittedAt: true, approvedAt: true },
  });

  const counts = new Map<string, number>();
  let total = 0;

  for (const row of rows) {
    for (const instant of [row.claimedAt, row.submittedAt, row.approvedAt]) {
      if (!instant) continue;
      const key = dayKey(instant, offsetMinutes);
      // The database filter is on the window, but an event can still land outside the caller's
      // local days at either end of it.
      if (key < firstKey || key > lastKey) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total += 1;
    }
  }

  const days = [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, count]) => ({
      /*
       * Local midnight, spelled out, and deliberately **without** a trailing `Z`.
       *
       * The calendar parses these with `new Date(value)` and keys each cell by its own local
       * midnight, so a date-only string ("2025-10-01") would be read as UTC midnight and land on
       * the previous or next local day for anyone far enough from Greenwich. A timezone-less
       * date-time is parsed as local time by every JS runtime, which is the same instant the grid
       * uses for that cell.
       */
      date: `${date}T00:00:00`,
      count,
    }));

  return {
    window: { days: ACTIVITY_WINDOW_DAYS, from: firstKey, to: lastKey },
    days,
    total,
    activeDays: counts.size,
  };
}
