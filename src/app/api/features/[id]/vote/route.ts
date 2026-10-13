import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * POST /api/features/[id]/vote — upvote a request, or take the vote back.
 *
 * Every signed-in account may vote, at any level: the gate on this board is about *posting*, and
 * the whole point of "you can still upvote until Level 4" is that participation is the reward
 * ladder, not the price of entry. Signing in is the only requirement, because the vote has to
 * belong to somebody — that is what makes one-per-person enforceable.
 *
 * `voted` is optional. Omitting it means "flip it", which is what the button does; sending
 * `true`/`false` explicitly means the caller is reconciling state it already has, and is the
 * difference between a toggle that double-taps into the wrong place and one that cannot.
 *
 * The tally and the vote row are written in one transaction. The unique index on
 * `(request_id, user_id)` is the actual rule — this route's read-then-write is only the fast path,
 * and the `P2002` below is the path for two taps arriving at once.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401, headers: NO_STORE });
  }

  const { id } = await params;
  const userId = session.user.id;

  const body = (await req.json().catch(() => null)) as { voted?: unknown } | null;

  const request = await db.featureRequest.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404, headers: NO_STORE });
  }

  const existing = await db.featureVote.findUnique({
    where: { requestId_userId: { requestId: id, userId } },
    select: { id: true },
  });

  const wanted = typeof body?.voted === "boolean" ? body.voted : !existing;

  if (wanted && !existing) {
    try {
      await db.$transaction([
        db.featureVote.create({ data: { requestId: id, userId } }),
        db.featureRequest.update({ where: { id }, data: { upvotes: { increment: 1 } } }),
      ]);
    } catch (error) {
      /*
       * A double-tap landed here twice and the unique index refused the second insert. That is the
       * outcome we wanted, so it is swallowed — but only that one. Anything else is a real failure
       * and must not be reported to the client as a successful vote.
       */
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }
    }
  } else if (!wanted && existing) {
    /*
     * `deleteMany` rather than `delete`: the row was read above and could have been removed by
     * another tab in between, and a missing row is the state we are asking for anyway. `delete`
     * would throw on that race for no benefit.
     */
    await db.$transaction([
      db.featureVote.deleteMany({ where: { requestId: id, userId } }),
      db.featureRequest.update({ where: { id }, data: { upvotes: { decrement: 1 } } }),
    ]);
  }

  /*
   * The tally is read back rather than computed from what we just did.
   *
   * `upvotes` is a denormalised count, so returning our own arithmetic would let a client display
   * a number that no longer matches the column if two accounts voted at the same moment. Reading
   * it back is one indexed lookup on the primary key and makes the card on screen and the board on
   * the next load agree by construction.
   */
  const updated = await db.featureRequest.findUnique({
    where: { id },
    select: { upvotes: true },
  });

  return NextResponse.json(
    { id, upvotes: Math.max(0, updated?.upvotes ?? 0), hasVoted: wanted },
    { headers: NO_STORE },
  );
}

/**
 * The board is cached by nothing and the vote count is read live, so a client that wants a fresh
 * tally can just re-post the state it believes. Exposed as GET as well because "what is the count"
 * is a read, and answering a read with a 405 invites clients to work around it.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionUser();

  const request = await db.featureRequest.findUnique({
    where: { id },
    select: { upvotes: true },
  });
  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404, headers: NO_STORE });
  }

  const hasVoted = session
    ? Boolean(
        await db.featureVote.findUnique({
          where: { requestId_userId: { requestId: id, userId: session.user.id } },
          select: { id: true },
        }),
      )
    : false;

  return NextResponse.json(
    { id, upvotes: request.upvotes, hasVoted },
    { headers: NO_STORE },
  );
}
