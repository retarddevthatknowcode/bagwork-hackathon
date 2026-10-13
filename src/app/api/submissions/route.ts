import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapSubmission } from "@/lib/mappers";
import { flywheelWindow, flywheelWindowMessage } from "@/lib/campaigns/flywheel-window";
import { syncWeeklyQuestsSafely } from "@/lib/quests/engine";
import { normalizePlatform } from "@/lib/types";
import { getSessionUser } from "@/lib/auth/session";
import { verifySubmissionAccount } from "@/lib/social/verify";

/**
 * Submitting a link puts it in the queue and nothing more.
 *
 * Both paths below end at `status: "pending"` with zero scores and no payout, and neither of them
 * reaches the review engine. That is the whole contract now: review is an explicit batch an
 * operator runs from the admin review desk, never a side effect of a creator's request. The
 * background trigger that used to live here (`after(() => reviewSubmission(id))`) is gone — see
 * the note on the create path for what it made impossible to see.
 */

// GET — list submissions for current user
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const rows = await db.submission.findMany({
    where: { userId: session.user.id },
    include: { campaign: { include: { project: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ submissions: rows.map(mapSubmission) });
}

// POST — create a new submission (pending review)
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.campaignId || !body.postUrl || !body.platform) {
    return NextResponse.json(
      { error: "campaignId, postUrl, platform required" },
      { status: 400 }
    );
  }

  const platform = normalizePlatform(body.platform);
  if (!platform) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
  }

  const postUrl = String(body.postUrl).trim();
  if (!/^https?:\/\/\S+\.\S+/.test(postUrl)) {
    return NextResponse.json(
      { error: "postUrl must be a full link starting with https://" },
      { status: 400 }
    );
  }

  /**
   * Anti-fraud gate: the post must have been made by an account this user has verified.
   *
   * Checked here, on the server, before anything is stored — the form reflects this so it never
   * looks like it will work, but the rule lives here so a crafted request cannot skip it.
   */
  const social = verifySubmissionAccount({
    url: postUrl,
    platform,
    socials: session.user.socials,
  });
  if (!social.ok) {
    // 422: the request is well-formed but the content cannot be accepted. `code` lets the form
    // offer the right next step (usually "link the account in your profile").
    return NextResponse.json({ error: social.message, code: social.code }, { status: 422 });
  }

  const campaign = await db.campaign.findUnique({
    where: { id: body.campaignId },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // A closed or full bag must not accept new work. The route previously only checked
  // slots, so an ENDED or DRAFT campaign kept taking submissions.
  const open = campaign.status === "LIVE" || campaign.status === "FILLING";
  if (!open) {
    return NextResponse.json(
      { error: `This bag is ${campaign.status.toLowerCase()} and is not accepting posts` },
      { status: 400 }
    );
  }
  /*
   * One post link, once, across the whole platform.
   *
   * This used to be scoped to the campaign, which left the obvious farming route wide open:
   * submit the same post into ten different bags and collect ten payouts for one piece of
   * content. The database has a unique index on `post_url` too, because this check is a race —
   * two concurrent submissions would both pass it.
   */
  const duplicate = await db.submission.findFirst({
    where: { postUrl },
    select: { id: true, userId: true },
  });
  if (duplicate) {
    return NextResponse.json(
      {
        error:
          duplicate.userId === session.user.id
            ? "You have already submitted this post. A link can only be submitted once."
            : "This post has already been submitted on Bagwork by another bagworker.",
        code: "duplicate_link",
      },
      { status: 409 }
    );
  }

  // If the creator already opted into this bag, this call *fills* that claim rather than
  // creating a second row. The slot was spent at opt-in, so charging another here would
  // silently halve the bag's real capacity — and the creator would see two entries for one post.
  const claim = await db.submission.findFirst({
    where: { campaignId: campaign.id, userId: session.user.id, status: "claimed" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (claim) {
    const filled = await db.submission.update({
      where: { id: claim.id },
      data: {
        postUrl,
        platform,
        status: "pending",
        // The week the *link* arrived, which is not the week the slot was claimed.
        submittedAt: new Date(),
        verifiedHandle: social.handle,
        verifiedPlatform: social.platform,
      },
      include: { campaign: { include: { project: true } } },
    });
    // No slot or counter change: both already moved when the slot was claimed.
    // A validated link is one of the three things a weekly quest counts, so the board is
    // brought up to date now — the same call the claim path makes.
    await syncWeeklyQuestsSafely(session.user.id, "content link submitted");
    // Deliberately no review here: a submitted link lands `pending` and waits for the operator's
    // batch run. See the note above `POST` for why review is no longer automatic.
    return NextResponse.json({ submission: mapSubmission(filled), filledClaim: true });
  }

  /*
   * The flywheel window, checked before a *new* slot is spent.
   *
   * Deliberately below the branch above: a claim that already exists was taken while the window was
   * open, so completing it with a link must not be refused because the budget has since dipped. This
   * point in the route is where a fresh submission would spend a fresh slot, and that is the moment
   * the bag has to be able to pay — the same rule the claim route applies, from the same module.
   */
  if (campaign.feeRedirectEnabled) {
    /*
     * The row carries `budget` — the lifetime total raised from fees, which a payout does not lower —
     * so the money still in the bag is that minus what has settled. Summed the same way the campaign
     * payload sums it for `spent` (`CampaignAggregates` in `lib/mappers.ts`): `payoutAmount` of rows
     * with status `paid`.
     */
    const settled = await db.submission.aggregate({
      where: { campaignId: campaign.id, status: "paid" },
      _sum: { payoutAmount: true },
    });

    const window = flywheelWindow({
      budget: campaign.budget,
      spent: settled._sum.payoutAmount ?? 0,
    });

    if (!window.open) {
      return NextResponse.json(
        { error: flywheelWindowMessage(window), code: "flywheel_window_closed" },
        { status: 422 },
      );
    }
  }

  // Only a brand-new submission spends a slot.
  if (campaign.slotsRemaining <= 0) {
    return NextResponse.json(
      {
        // Same distinction as the claim route: a flywheel bag refills as fees convert, so every slot
        // for the current budget being taken is not the same thing as a fixed bag being full.
        error: campaign.feeRedirectEnabled
          ? "Every slot in this bag's current budget is taken. New slots appear automatically as more fees convert."
          : "Campaign is full",
      },
      { status: 400 },
    );
  }

  /*
   * The bag's own limits are enforced here too, not only at opt-in.
   *
   * Adding a second or third link to a bag goes down this path (there is no open claim left to
   * fill), so without these checks a creator could exceed `maxPerCreator` simply by submitting
   * again rather than by claiming again.
   */
  const takenSoFar = await db.submission.count({ where: { campaignId: campaign.id } });
  if (campaign.maxSubmissions !== null && takenSoFar >= campaign.maxSubmissions) {
    return NextResponse.json(
      {
        error: `This bag is limited to ${campaign.maxSubmissions} submission${
          campaign.maxSubmissions === 1 ? "" : "s"
        } and they are all taken`,
      },
      { status: 409 },
    );
  }
  const mineSoFar = await db.submission.count({
    where: { campaignId: campaign.id, userId: session.user.id },
  });
  if (campaign.maxPerCreator !== null && mineSoFar >= campaign.maxPerCreator) {
    return NextResponse.json(
      {
        error: `This bag allows ${campaign.maxPerCreator} submission${
          campaign.maxPerCreator === 1 ? "" : "s"
        } per creator and you have used yours`,
      },
      { status: 409 },
    );
  }

  // Metrics start at zero and only ever hold what the platform actually reports. This
  // used to write random figures (200–4200 views and derived likes) into the row as if
  // they were real engagement, and those numbers then fed the anti-slop scoring.
  const sub = await db.submission.create({
    data: {
      campaignId: campaign.id,
      userId: session.user.id,
      postUrl,
      platform,
      status: "pending",
      // The moment the link passed validation — the timestamp the "Content Creator" quest
      // counts, and the reason this is not simply `createdAt`.
      submittedAt: new Date(),
      // Proven above: the post's author is an account on this profile.
      verifiedHandle: social.handle,
      verifiedPlatform: social.platform,
      views: 0,
      likes: 0,
      reposts: 0,
      qualityScore: 0,
      authenticityScore: 0,
    },
    include: { campaign: { include: { project: true } } },
  });

  // Slots and the creator's own counter move together, and slots never go negative —
  // two concurrent submissions used to be able to drive `slotsRemaining` below zero.
  await db.$transaction([
    db.campaign.update({
      where: { id: campaign.id },
      data: { slotsRemaining: { decrement: 1 } },
    }),
    db.user.update({
      where: { id: session.user.id },
      data: { submissions: { increment: 1 } },
    }),
  ]);

  // One more validated link counted toward this week's "Content Creator" quest.
  await syncWeeklyQuestsSafely(session.user.id, "content link submitted");

  /*
   * Review is **not** scheduled here.
   *
   * This used to run the engine in the background (`after()`) the moment a link arrived, which
   * made review something that happened *to* a queue nobody was watching: a submission could be
   * approved and paid while the operator's board still said "pending", and there was no single
   * moment where a person decided anything. Review is now an explicit, bounded batch the operator
   * starts from the review desk (`POST /api/admin/review/batch`), and this route's whole job is to
   * put the row in the queue: `status: "pending"`, scores at zero, nothing paid.
   */
  return NextResponse.json({ submission: mapSubmission(sub) });
}
