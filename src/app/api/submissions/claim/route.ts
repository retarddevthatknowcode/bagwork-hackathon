import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { flywheelWindow, flywheelWindowMessage } from "@/lib/campaigns/flywheel-window";
import { recordMembershipOnJoin } from "@/lib/community/access";
import { mapSubmission } from "@/lib/mappers";
import { syncWeeklyQuestsSafely } from "@/lib/quests/engine";
import { normalizePlatform, normalizePlatforms } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/submissions/claim — opt into a bag and hold a slot.
 *
 * This is the first half of the creator flow: opting in reserves a place in the bag without
 * pretending a post exists yet. The row is created with `status: "claimed"` and no `postUrl`,
 * and the link arrives later through `POST /api/submissions`.
 *
 * Why a claim instead of jumping straight to a submission: the publisher's limits (budget,
 * `maxSubmissions`, `maxPerCreator`) are about *how many creators a bag can carry*. Enforcing
 * them at opt-in is what keeps the slot honest — and it is what lets My Submissions show
 * "Link pending" as a real, actionable state rather than an invisible gap.
 *
 * Idempotent: opting in twice returns the existing claim rather than burning a second slot.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    campaignId?: unknown;
    platform?: unknown;
  } | null;
  const campaignId = String(body?.campaignId ?? "").trim();
  if (!campaignId) {
    return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  }

  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    include: { project: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Bag not found" }, { status: 404 });
  }

  // A bag that is not running cannot take new creators. `DRAFT` counts as not running: an
  // unfunded bag has no money to pay anyone.
  const open = campaign.status === "LIVE" || campaign.status === "FILLING";
  if (!open) {
    return NextResponse.json(
      { error: `This bag is ${campaign.status.toLowerCase()} and is not accepting creators` },
      { status: 400 },
    );
  }

  // Already opted in (or already posted) — hand back the existing row.
  const existing = await db.submission.findFirst({
    where: { campaignId, userId: session.user.id },
    include: { campaign: { include: { project: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    return NextResponse.json({ submission: mapSubmission(existing), alreadyClaimed: true });
  }

  // Opting into your own bag is not a thing: it would let a publisher farm their own
  // budget and pay themselves.
  if (campaign.createdBy === session.user.id) {
    return NextResponse.json(
      { error: "You created this bag, so you cannot claim a slot in it" },
      { status: 400 },
    );
  }

  /*
   * A flywheel bag's window is a money threshold, not a schedule.
   *
   * It opens once trading fees have built the bag's budget to $20 and closes again while the budget
   * is below that — which includes being spent down to nothing. Checked before the slot arithmetic
   * below, because a bag with no fees yet has no slots *and* no window, and "waiting for its first
   * fees" is the honest reason while "full" would send a creator looking for competition.
   *
   * `flywheelWindow` owns the number; `lib/campaigns/flywheel-window.ts` says why it is `budget −
   * spent`.
   */
  if (campaign.feeRedirectEnabled) {
    /*
     * The window is about the money that is *left*, and the row only carries `budget` — the lifetime
     * total raised from fees, which paying a creator does not lower. Settled payouts are the
     * difference, so they are summed here exactly as the campaign payload sums them for `spent`
     * (`CampaignAggregates` in `lib/mappers.ts`: `payoutAmount` of rows with status `paid`), with an
     * aggregate rather than the full list because nothing else needs the rows.
     */
    const settled = await db.submission.aggregate({
      where: { campaignId, status: "paid" },
      _sum: { payoutAmount: true },
    });

    const window = flywheelWindow({
      budget: campaign.budget,
      spent: settled._sum.payoutAmount ?? 0,
    });

    if (!window.open) {
      return NextResponse.json(
        { error: flywheelWindowMessage(window), code: "flywheel_window_closed" },
        { status: 409 },
      );
    }
  }

  // ---- Limits. Checked here because this is the moment a slot is spent. ----
  const claimedSoFar = await db.submission.count({ where: { campaignId } });

  if (campaign.maxSubmissions !== null && claimedSoFar >= campaign.maxSubmissions) {
    return NextResponse.json(
      {
        error: `This bag is limited to ${campaign.maxSubmissions} submission${
          campaign.maxSubmissions === 1 ? "" : "s"
        } and they are all taken`,
      },
      { status: 409 },
    );
  }
  if (campaign.slotsRemaining <= 0) {
    return NextResponse.json(
      {
        /*
         * Every slot for the *current* budget is taken — which is a different sentence from "full",
         * because a flywheel bag refills: the next converted fee credit adds slots, so this state
         * passes on its own without anyone doing anything.
         */
        error: campaign.feeRedirectEnabled
          ? "Every slot in this bag's current budget is taken. New slots appear automatically as more fees convert."
          : "This bag is full",
      },
      { status: 409 },
    );
  }

  const mine = await db.submission.count({
    where: { campaignId, userId: session.user.id },
  });
  if (campaign.maxPerCreator !== null && mine >= campaign.maxPerCreator) {
    return NextResponse.json(
      {
        error: `This bag allows ${campaign.maxPerCreator} submission${
          campaign.maxPerCreator === 1 ? "" : "s"
        } per creator and you have used yours`,
      },
      { status: 409 },
    );
  }

  // The platform is chosen up front so the submission record is complete even before the
  // link exists; the creator can still change it when they paste the URL.
  const offered = normalizePlatforms(campaign.platforms);
  const platform = normalizePlatform(body?.platform) ?? offered[0] ?? "x";

  const claim = await db.submission.create({
    data: {
      campaignId,
      userId: session.user.id,
      // No link yet — that is the whole point of a claim.
      postUrl: null,
      claimedAt: new Date(),
      platform,
      status: "claimed",
      views: 0,
      likes: 0,
      reposts: 0,
      qualityScore: 0,
      authenticityScore: 0,
    },
    include: { campaign: { include: { project: true } } },
  });

  // The slot is spent now and returned only if the claim is withdrawn. Recorded on the user
  // too, so the profile's submission count matches what they actually have.
  await db.$transaction([
    db.campaign.update({
      where: { id: campaignId },
      data: { slotsRemaining: { decrement: 1 } },
    }),
    db.user.update({
      where: { id: session.user.id },
      data: { submissions: { increment: 1 } },
    }),
  ]);

  /**
   * Opting in is what the "Opt-in Starter" quest counts, so the weekly board is brought up to
   * date here rather than waiting for the quests page to be opened.
   *
   * Awaited, not fired and forgotten: a serverless request can be frozen the moment it
   * responds, and a quest that pays 200 points should not depend on that. It cannot fail this
   * route — `syncWeeklyQuestsSafely` logs and swallows, and the claim is already written.
   */
  /**
   * Joining the bag is what makes someone a community member, so the row is written here rather
   * than waiting for them to open the community page.
   *
   * Fired alongside the quest sync and, like it, unable to fail this route — `recordMembershipOnJoin`
   * swallows everything, and the claim is already written. If the publisher has not opened a space
   * yet there is nothing to join, and the first open picks them up instead.
   */
  await recordMembershipOnJoin(campaignId, session.user.id);

  await syncWeeklyQuestsSafely(session.user.id, "bag opt-in");

  return NextResponse.json({ submission: mapSubmission(claim), alreadyClaimed: false });
}
