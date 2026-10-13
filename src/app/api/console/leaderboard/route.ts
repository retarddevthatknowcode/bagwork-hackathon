import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { rankedLeaderboard } from "@/lib/leaderboard";
import {
  DEFAULT_LEADERBOARD_RANGE,
  isLeaderboardRange,
  leaderboardWindowStart,
  type LeaderboardRange,
} from "@/lib/leaderboard-ranges";
import { parseCharacter } from "@/lib/profile/character";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET /api/console/leaderboard?range=overall|daily|weekly|monthly
 *
 * The console board, ranked purely on Points. `overall` (the default) is lifetime points;
 * the others are the points earned inside the current UTC day / ISO week / month.
 *
 * Not a replacement for `GET /api/leaderboard`, which serves the marketing page from the
 * denormalised `leaderboards` table — that table ranks by earnings, has no time dimension
 * and holds no identity, so it cannot answer any of these four questions.
 *
 * Public, like the rest of the marketplace reads: a leaderboard nobody can see until they
 * sign in is not a leaderboard. A verified session is only used to mark `isYou` on the
 * viewer's own row, so the response is identical for signed-out visitors apart from that.
 */
export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("range");
  const range: LeaderboardRange = isLeaderboardRange(requested)
    ? requested
    : DEFAULT_LEADERBOARD_RANGE;

  // Never trusted from the client: the viewer is whoever the Privy token says, or nobody.
  const session = await getSessionUser().catch(() => null);
  const viewerId = session?.user.id ?? null;

  const { entries, total } = await rankedLeaderboard(range, viewerId);
  const since = leaderboardWindowStart(range);

  return NextResponse.json(
    {
      range,
      /** ISO start of the window, or null for `overall`. */
      since: since?.toISOString() ?? null,
      /** How many Bagworkers are ranked in this window — may exceed `entries.length`. */
      total,
      entries: entries.map((entry) => ({
        ...entry,
        // The JSON column is opaque to the client; hand it the choice set it draws.
        character: parseCharacter(entry.character),
      })),
    },
    { headers: NO_STORE },
  );
}
