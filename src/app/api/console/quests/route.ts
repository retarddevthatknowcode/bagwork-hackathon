import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { syncWeeklyQuests } from "@/lib/quests/engine";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET /api/console/quests — this Bagworker's weekly quests, up to date.
 *
 * The response is the board *after* it has been reconciled, so reading it is what keeps progress
 * live: `syncWeeklyQuests` recomputes every metric from submissions and payouts, writes anything
 * that moved, and pays any completion that has not been paid yet. Nothing here trusts the client,
 * and there is no body to POST — quests are earned by working, not by asking.
 *
 * Session-scoped rather than public: quests are a Bagworker's own weekly work, and there is no
 * reason for one account to be able to read another's progress. The board itself (who earned
 * what) is already public on the leaderboard.
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in required" },
      { status: 401, headers: NO_STORE },
    );
  }

  try {
    const board = await syncWeeklyQuests(session.user.id);
    return NextResponse.json(board, { headers: NO_STORE });
  } catch (error) {
    console.error("[api/console/quests] could not build the quest board", error);
    return NextResponse.json(
      { error: "Could not load your quests" },
      { status: 500, headers: NO_STORE },
    );
  }
}
