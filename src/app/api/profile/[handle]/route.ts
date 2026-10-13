import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { collectProfileActivity, parseActivityOffset } from "@/lib/profile/activity";
import { resolveBagworker } from "@/lib/profile/lookup";
import { parseCharacter } from "@/lib/profile/character";

/**
 * GET /api/profile/[handle] — another Bagworker's public profile.
 *
 * Public here means *readable by other signed-in Bagworkers*, not editable and not complete. What
 * comes back is the identity and the reputation — level, points, contributions, totals — and
 * nothing about the work behind it: no submissions list, no bag opt-ins or campaign detail, no
 * moderation state, no review queue, and no wallet of any kind. The payout wallet is the one field
 * the profile page promises never leaves its owner's own screen, and this endpoint does not have it
 * to give.
 *
 * `[handle]` accepts a handle or a `Bagworker#number`, matching the contribution calendar, so
 * whichever of the two a leaderboard row happens to carry makes a valid link.
 *
 * A session is required. The calendar endpoint next door is deliberately anonymous (it exposes a
 * count per day and nothing else); this one carries earnings and a join date, so it stays behind
 * the same sign-in as the rest of the console.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * The complete set of columns this endpoint may read.
 *
 * An allow-list rather than a full row with fields deleted: adding a column to `User` later then
 * cannot leak it here by accident, because the failure mode of `select *` is silent.
 */
const PUBLIC_FIELDS = {
  id: true,
  handle: true,
  displayName: true,
  bio: true,
  avatarUrl: true,
  avatarColor: true,
  avatarId: true,
  character: true,
  profileNumber: true,
  points: true,
  level: true,
  totalEarned: true,
  submissions: true,
  approvals: true,
  createdAt: true,
} as const;

/** A failed or reverted transfer is not money paid out. */
const NOT_FAILED: { notIn: string[] } = { notIn: ["failed", "reverted"] };

/** Money to cents: `4.000000000001` in a JSON body reads as a bug. */
function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401, headers: NO_STORE });
  }

  const { handle } = await params;
  const target = await resolveBagworker(decodeURIComponent(handle));
  if (!target) {
    return NextResponse.json({ error: "No such Bagworker" }, { status: 404, headers: NO_STORE });
  }

  const [user, paid, payoutCount, activity] = await Promise.all([
    db.user.findUnique({ where: { id: target.id }, select: PUBLIC_FIELDS }),
    db.payout.aggregate({
      // USDC is the currency campaigns settle in; other tokens are not added to it, because a sum
      // of two different assets is not a number anyone can act on.
      where: {
        userId: target.id,
        token: { equals: "USDC", mode: "insensitive" },
        status: NOT_FAILED,
      },
      _sum: { amount: true },
    }),
    db.payout.count({ where: { userId: target.id, status: NOT_FAILED } }),
    collectProfileActivity(target.id, parseActivityOffset(request.nextUrl.searchParams.get("tz"))),
  ]);

  if (!user) {
    return NextResponse.json({ error: "No such Bagworker" }, { status: 404, headers: NO_STORE });
  }

  return NextResponse.json(
    {
      profile: {
        handle: user.handle,
        displayName: user.displayName,
        bio: user.bio,
        profileNumber: user.profileNumber,
        level: user.level,
        points: user.points,
        avatarUrl: user.avatarUrl,
        avatarColor: user.avatarColor,
        avatarId: user.avatarId,
        character: parseCharacter(user.character),
        /** Lifetime approved earnings — the same figure the owner sees on their own profile. */
        earned: toCents(user.totalEarned),
        /** USDC actually settled to them, and how many payouts that was. */
        paidUsdc: toCents(paid._sum?.amount ?? 0),
        payoutCount,
        submissions: user.submissions,
        approvals: user.approvals,
        contributions: activity.total,
        activeDays: activity.activeDays,
        joinedAt: user.createdAt,
      },
      /** Lets the page send the owner to their editable profile rather than a read-only copy. */
      isYou: user.id === session.user.id,
    },
    { headers: NO_STORE },
  );
}
