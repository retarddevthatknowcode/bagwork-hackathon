import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  FEATURE_REQUEST_MIN_LEVEL,
  featureGateFor,
  toFeatureSort,
  toFeatureStatus,
  validateFeatureDraft,
  type FeatureBoardPayload,
  type FeatureRequestView,
} from "@/lib/features/board";
import { levelFromPoints } from "@/lib/profile/points";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * How many requests the board returns.
 *
 * Bounded rather than unbounded, because the board is ordered by `upvotes` and the tail is
 * therefore the *least* interesting part of it — the opposite of a feed, where the tail is
 * merely older. If the board ever outgrows this the answer is a "showing 100 of N" line
 * (the summary already carries N), not a bigger page.
 */
const BOARD_LIMIT = 100;

/** Matches the cap `validateFeatureDraft` enforces, plus a little room for concurrent posts. */
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/features — the board, most upvoted first.
 *
 * **Public on purpose**: reading the board and seeing what the product is working on is not
 * account-gated, the same way the leaderboard is not. `viewer` reports what the *caller* may do,
 * so one payload serves a signed-out visitor, a Level 2 Bagworker and an author — the page never
 * has to guess from a second request whether voting or posting is available.
 *
 * Level is derived from `points` via `levelFromPoints`, never read from the cached `User.level`
 * column. That column is a convenience for sorting and can only ever be as right as the last write
 * to it; on a *permission* check the derivation is the source of truth.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  const sort = toFeatureSort(req.nextUrl.searchParams.get("sort"));

  const [requests, votes, statusCounts] = await Promise.all([
    db.featureRequest.findMany({
      // Secondary key on both orderings: `upvotes` is not unique and Postgres will not guarantee a
      // stable order for ties, so the board could reshuffle between two identical reads.
      orderBy:
        sort === "new"
          ? [{ createdAt: "desc" }, { id: "desc" }]
          : [{ upvotes: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: BOARD_LIMIT,
      include: {
        // `points`, not `level`: the author's badge is derived the same way the viewer's is.
        author: { select: { handle: true, profileNumber: true, points: true } },
      },
    }),
    session
      ? // One query for "what have I voted on", rather than a per-row lookup.
        db.featureVote.findMany({
          where: { userId: session.user.id },
          select: { requestId: true },
        })
      : Promise.resolve([] as { requestId: string }[]),
    // Counted across the whole board rather than the page: the summary describes the board.
    db.featureRequest.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const voted = new Set(votes.map((vote) => vote.requestId));
  const level = session ? levelFromPoints(session.user.points).level : null;
  const gate = featureGateFor(level ?? 1);

  const views: FeatureRequestView[] = requests.map((request) => ({
    id: request.id,
    title: request.title,
    details: request.details,
    upvotes: request.upvotes,
    status: toFeatureStatus(request.status) ?? "OPEN",
    createdAt: request.createdAt.toISOString(),
    author: request.author
      ? {
          handle: request.author.handle,
          profileNumber: request.author.profileNumber,
          level: levelFromPoints(request.author.points).level,
        }
      : null,
    hasVoted: voted.has(request.id),
    isMine: Boolean(session && request.authorId === session.user.id),
  }));

  const countFor = (status: string) =>
    statusCounts.find((row) => row.status === status)?._count._all ?? 0;

  const payload: FeatureBoardPayload = {
    requests: views,
    viewer: {
      level,
      canPost: Boolean(session) && gate.canPost,
      // Signed out gets the gate's own sentence rather than a "sign in" line, because the level
      // requirement is true for them too and the page adds the sign-in call to action itself.
      message: gate.message,
    },
    summary: {
      total: statusCounts.reduce((sum, row) => sum + row._count._all, 0),
      open: countFor("OPEN"),
      planned: countFor("PLANNED"),
      done: countFor("DONE"),
      yourVotes: views.filter((view) => view.hasVoted).length,
    },
  };

  return NextResponse.json(payload, { headers: NO_STORE });
}

/**
 * POST /api/features — file a new request. **Level 4 and above.**
 *
 * The gate is the whole point of this endpoint, so it is the first thing that happens after
 * authentication and it is decided from `points`, not from anything the client sends. The client
 * rendering a locked composer is a courtesy; this is the rule.
 *
 * The author's own vote is deliberately *not* cast here. Auto-upvoting looks generous and makes
 * every new entry start at 1, but it quietly means the number on the card is "votes plus the
 * author" while the number on every other card is just votes — two different quantities in one
 * column. The author can press the same button everyone else does.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in required" },
      { status: 401, headers: NO_STORE },
    );
  }

  const level = levelFromPoints(session.user.points).level;
  const gate = featureGateFor(level);
  if (!gate.canPost) {
    return NextResponse.json(
      { error: gate.message, level, requiredLevel: FEATURE_REQUEST_MIN_LEVEL },
      { status: 403, headers: NO_STORE },
    );
  }

  const body = (await req.json().catch(() => null)) as
    | { title?: unknown; details?: unknown }
    | null;

  const draft = validateFeatureDraft({ title: body?.title, details: body?.details });
  if (!draft.ok) {
    return NextResponse.json(
      { error: "Check the highlighted fields.", errors: draft.errors },
      { status: 400, headers: NO_STORE },
    );
  }

  /*
   * The duplicate guard.
   *
   * Validation alone cannot stop the cheapest spam there is — the same paragraph posted four
   * times because the button felt unresponsive. Comparing the *normalised* title (validation has
   * already trimmed and collapsed it, so "  Add   dark mode " and "Add dark mode" are one string)
   * against the same account's last day of posts catches it with one indexed read, and the reply
   * points at the existing entry so the person can upvote it instead of filing a twin.
   *
   * `authorId` is the leading column of the check, so this is a lookup on one account's records
   * rather than a scan of the board.
   */
  const duplicate = await db.featureRequest.findFirst({
    where: {
      authorId: session.user.id,
      title: draft.value.title,
      createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json(
      {
        error: "You already posted this one — upvote it instead.",
        requestId: duplicate.id,
      },
      { status: 409, headers: NO_STORE },
    );
  }

  const created = await db.featureRequest.create({
    data: {
      authorId: session.user.id,
      title: draft.value.title,
      details: draft.value.details,
      // Set server-side, never read from the body: status is ours to decide.
      status: "OPEN",
      upvotes: 0,
    },
    select: { id: true },
  });

  return NextResponse.json({ request: { id: created.id } }, { status: 201, headers: NO_STORE });
}
