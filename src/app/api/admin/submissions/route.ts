import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isAdmin } from "../login/route";

/**
 * A `YYYY-MM-DD` (or full ISO) query value as a Date, or undefined when it is absent or junk.
 *
 * `endOfDay` extends a bare date to its last millisecond, so `to=2026-10-05` includes everything
 * submitted *on* the 5th rather than only whatever happened at its midnight instant — which is the
 * off-by-one that makes an operator think a day of submissions is missing.
 */
function parseDate(value: string | null, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const bare = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(bare && endOfDay ? `${value}T23:59:59.999Z` : value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// GET /api/admin/submissions — every submission with its creator, campaign and scores.
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const filter = params.get("status");
  // `ai_analyzed` is not a status this app writes; the console's "awaiting decision" tab
  // used to ask for it and always came back empty.
  const awaiting = { in: ["pending", "reviewing", "ai_analyzed"] };
  let where: Prisma.SubmissionWhereInput;
  if (!filter || filter === "ai_analyzed" || filter === "awaiting") {
    where = { status: awaiting };
  } else if (filter === "ALL") {
    where = {};
  } else {
    where = { status: filter };
  }

  // The review desk's two extra filters, both optional and both narrowing the same query.
  const campaignId = params.get("campaignId");
  if (campaignId) where = { ...where, campaignId };

  /*
   * Date range over "when the link arrived".
   *
   * That is `submittedAt` when the row has it and `createdAt` otherwise — a claim created on Monday
   * and filled on Friday submitted on Friday, and a filter that used `createdAt` alone would put an
   * old claim inside the wrong week. Expressed as the pair rather than a COALESCE because Prisma
   * cannot order a query by one column and filter on another's fallback; the second clause is the
   * legacy/claimed rows, matched on their creation instead.
   */
  const from = parseDate(params.get("from"));
  const to = parseDate(params.get("to"), true);
  if (from || to) {
    const stamp = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    where = { ...where, OR: [{ submittedAt: stamp }, { submittedAt: null, createdAt: stamp }] };
  }

  const rows = await db.submission.findMany({
    where,
    include: {
      campaign: { include: { project: true } },
      user: { select: { id: true, handle: true, walletAddress: true, trustScore: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });


  const formatted = rows.map((s) => {
    const ai = (s.aiAnalysis ?? {}) as { verdict?: unknown };
    return {
      id: s.id,
      postUrl: s.postUrl,
      platform: s.platform,
      status: s.status,
      campaignId: s.campaignId,
      campaignTitle: s.campaign.title,
      tokenSymbol: s.campaign.project.tokenSymbol,
      tokenMint: s.campaign.project.tokenMint,
      treasury: s.campaign.project.treasury,
      rateType: s.campaign.rateType,
      ratePer1k: s.campaign.ratePer1k,
      maxPayout: s.campaign.maxPayout,
      views: s.views,
      likes: s.likes,
      reposts: s.reposts,
      // Real columns, exposed under the names the admin UI already uses. `payoutAmount`
      // holds the final figure and `reviewNote` holds the decision note.
      aiQuality: s.qualityScore,
      aiAuthenticity: s.authenticityScore,
      aiVerdict: typeof ai.verdict === "string" ? ai.verdict : null,
      // Authenticity is the inverse of spam risk, so no extra column is needed.
      aiSpamRisk: 100 - s.authenticityScore,
      aiReason: s.reviewNote,
      payoutAmount: s.payoutAmount,
      feeAmount: s.feeAmount,
      reviewNote: s.reviewNote,
      txSignature: s.txSignature,
      creator: s.user
        ? {
            id: s.user.id,
            handle: s.user.handle,
            wallet: s.user.walletAddress,
            trustScore: s.user.trustScore,
          }
        : null,
      // Repeated at the top level because the board shows it directly on a row, and a nested
      // optional read for a column that is already here is noise at every call site.
      creatorId: s.userId,
      createdAt: s.createdAt.toISOString(),
      /**
       * When the *link* arrived — the timestamp the desk labels "submitted".
       *
       * `createdAt` is the row's birth, which for a filled claim is the day the slot was taken, so
       * showing it as the submission time would order the queue by the wrong moment.
       */
      submittedAt: (s.submittedAt ?? s.createdAt).toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  });

  // Counts across the whole table, not just this page, so the tabs are truthful.
  const [pending, reviewing, approved, rejected, paid, total] = await Promise.all([
    db.submission.count({ where: { status: "pending" } }),
    db.submission.count({ where: { status: "reviewing" } }),
    db.submission.count({ where: { status: "approved" } }),
    db.submission.count({ where: { status: "rejected" } }),
    db.submission.count({ where: { status: "paid" } }),
    db.submission.count(),
  ]);

  /*
   * The campaign filter's options: only bags that have submissions, with how many.
   *
   * Built here rather than in the client so the dropdown can never offer a bag with an empty
   * result set — "I picked this bag and got nothing" is indistinguishable from a broken filter.
   */
  const [bagsWithWork, perBag] = await Promise.all([
    db.campaign.findMany({
      where: { submissions: { some: {} } },
      select: { id: true, title: true, project: { select: { tokenSymbol: true } } },
      orderBy: { title: "asc" },
    }),
    db.submission.groupBy({ by: ["campaignId"], _count: { _all: true } }),
  ]);
  const countByBag = new Map(perBag.map((row) => [row.campaignId, row._count._all]));
  const campaignOptions = bagsWithWork.map((bag) => ({
    id: bag.id,
    title: bag.title,
    tokenSymbol: bag.project.tokenSymbol,
    submissions: countByBag.get(bag.id) ?? 0,
  }));

  return NextResponse.json(
    {
      submissions: formatted,
      campaignOptions,
      stats: {
        pending,
        reviewing,
        approved,
        rejected,
        paid,
        total,
        awaitingReview: pending + reviewing,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
