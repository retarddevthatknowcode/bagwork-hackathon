import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdmin } from "../login/route";
import { normalizePlatforms } from "@/lib/types";
import { mapCampaign, rateTypeFor } from "@/lib/mappers";
import { treasuryAddressFor } from "@/lib/solana/treasury";
import {
  MAX_DURATION_DAYS,
  readAuthoring,
  slotsFor,
} from "@/lib/campaigns/authoring";
import type { Campaign } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The statuses an operator may set directly.
 *
 * `FILLING` is absent on purpose: it is derived when a bag runs out of slots, never chosen.
 * `PAUSED` is the operator stop — the bag keeps its budget, its slots and its page, but every
 * claim/submission route only accepts `LIVE`/`FILLING`, so a paused bag takes no work and it
 * drops out of the marketplace feed until it is resumed.
 */
const ADMIN_STATUSES = ["DRAFT", "LIVE", "PAUSED", "ENDED"];

/**
 * GET /api/admin/campaigns — every bag, with its owner, spend and submission counts.
 *
 * `?status=` filters to one status (or `ALL`), `?q=` is a case-insensitive match on the bag
 * title, the project name or the owner's handle — the three things an operator searches by
 * when a publisher writes in about "the one with the X bag".
 */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const status = (params.get("status") ?? "").toUpperCase();
  const q = (params.get("q") ?? "").trim();

  const rows = await db.campaign.findMany({
    // `ALL` (or no filter) means everything, drafts and paused bags included: this is the
    // operator view, so hiding rows would be the wrong default. The public feed applies the
    // opposite rule.
    where: {
      ...(status && status !== "ALL" ? { status } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { project: { name: { contains: q, mode: "insensitive" as const } } },
              { creator: { handle: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      project: { select: { name: true, tokenSymbol: true, tokenColor: true, tokenMint: true, tokenKind: true, treasury: true } },
      creator: { select: { id: true, handle: true, walletAddress: true } },
      _count: { select: { submissions: true } },
    },
  });

  const ids = rows.map((r) => r.id);

  // Separate statements rather than a conditional `Promise.all`, so each result keeps its
  // own concrete type instead of collapsing into `any[][]`.
  const statusCounts = ids.length
    ? await db.submission.groupBy({
        by: ["campaignId", "status"],
        where: { campaignId: { in: ids } },
        _count: { _all: true },
      })
    : [];

  const paidByCampaign = ids.length
    ? await db.submission.groupBy({
        by: ["campaignId"],
        where: { campaignId: { in: ids }, status: "paid" },
        _sum: { payoutAmount: true },
      })
    : [];

  const awaiting = new Map<string, number>();
  for (const entry of statusCounts) {
    if (entry.status === "pending" || entry.status === "reviewing") {
      awaiting.set(
        entry.campaignId,
        (awaiting.get(entry.campaignId) ?? 0) + entry._count._all,
      );
    }
  }
  const paidOf = new Map<string, number>(
    paidByCampaign.map((e) => [e.campaignId, e._sum.payoutAmount ?? 0]),
  );

  return NextResponse.json(
    {
      campaigns: rows.map((c) => {
        const spent = paidOf.get(c.id) ?? 0;
        return {
          id: c.id,
          title: c.title,
          status: c.status,
          contentType: c.contentType,
          rateType: c.rateType,
          ratePer1k: c.ratePer1k,
          maxPayout: c.maxPayout,
          budget: c.budget,
          fundedAmount: c.fundedAmount,
          spent: Math.round(spent * 100) / 100,
          remaining: Math.round(Math.max(0, c.budget - spent) * 100) / 100,
          slotsRemaining: c.slotsRemaining,
          platforms: normalizePlatforms(c.platforms),
          endsAt: c.endsAt.toISOString(),
          createdAt: c.createdAt.toISOString(),
          // Editable fields, echoed so the edit form can open without a second request.
          description: c.description,
          bannerUrl: c.bannerUrl,
          chain: c.chain,
          paymentModel: c.paymentModel,
          fixedFee: c.fixedFee,
          maxSubmissions: c.maxSubmissions,
          maxPerCreator: c.maxPerCreator,
          // Internal provenance. Safe here — this route is behind `isAdmin` and the value is
          // never mapped into a public campaign payload.
          createdByAdmin: c.createdByAdmin,
          projectName: c.project.name,
          tokenSymbol: c.project.tokenSymbol,
          tokenMint: c.project.tokenMint,
          tokenKind: c.project.tokenKind,
          treasury: c.project.treasury,
          owner: c.creator
            ? { id: c.creator.id, handle: c.creator.handle, wallet: c.creator.walletAddress }
            : null,
          submissions: c._count.submissions,
          awaitingReview: awaiting.get(c.id) ?? 0,
        };
      }),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/*
 * End-date resolution, the slot formula and the shared authoring reader all live in
 * `@/lib/campaigns/authoring`, so this route and `[id]` validate a bag identically.
 */

/* The slot formula and the authoring reader are imported — see the note above. */

/**
 * POST /api/admin/campaigns — create a bag from the operator console.
 *
 * Same rules as the publisher flow, because both go through `@/lib/campaigns/authoring`.
 * Three deliberate differences:
 *
 *  1. `createdBy` stays null — nobody funded it, so there is no publisher to attribute it to.
 *     `createdByAdmin` records the provenance instead, and never leaves the admin API.
 *  2. The budget is set directly: `fundedAmount` equals `budget`, so there is no transfer to
 *     wait for. That is what lets an operator publish a bag LIVE in the same request.
 *  3. The status is the operator's call rather than always `DRAFT`.
 *
 * From that point on it is an ordinary bag: the same cards, the same detail page, the same
 * claim and submission flow, and nothing anywhere that says who created it.
 */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const status = String(body.status ?? "DRAFT").toUpperCase();
  if (!ADMIN_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: "Status must be DRAFT, LIVE, PAUSED or ENDED" },
      { status: 400 },
    );
  }

  const read = readAuthoring(body);
  if (!read.ok) {
    return NextResponse.json({ error: read.error }, { status: 400 });
  }

  // Money lands in the FIXED Bagwork treasury — operator-created bags are fixed-budget bags whose
  // budget was set directly, and they pay out of the same wallet the publisher flow pins to a bag.
  // A fee-redirect bag cannot be created here, so there is no kind to choose.
  const treasury = treasuryAddressFor("FIXED");
  if (!treasury) {
    return NextResponse.json(
      {
        error:
          "Creating bags is paused: the fixed-budget treasury is not configured. Set TREASURY_FIXED_PRIVATE_KEY (or the legacy TREASURY_PRIVATE_KEY) and redeploy.",
      },
      { status: 503 },
    );
  }

  /*
   * One Project row per token, reused across the operator's *own* bags — and never adopted from
   * somebody else's. Matching on the mint alone was how a hand-made bag ended up wearing a seed
   * project's name and colour: the row already existed, so it was used as-is. Scoping the lookup to
   * campaigns this portal created keeps the reuse where it is meaningful and stops the borrowing.
   */
  let project = await db.project.findFirst({
    where: {
      tokenMint: read.token.mint,
      campaigns: { some: { createdByAdmin: true } },
    },
  });
  if (!project) {
    project = await db.project.create({
      data: {
        name: read.projectName || read.token.name,
        tokenSymbol: read.token.symbol,
        tokenColor: String(body.tokenColor ?? "#bdfe00"),
        tokenMint: read.token.mint,
        tokenName: read.token.name,
        tokenDecimals: read.token.decimals,
        tokenLogoUrl: read.token.logoUrl,
        tokenKind: read.token.kind,
        treasury,
      },
    });
  }

  // A published operator bag is paid for by definition — the budget was set here, so there is
  // no transfer to wait for. A DRAFT one stays unfunded until it is published, so a draft can
  // never look like a bag that can pay out.
  const fundedAmount = status === "DRAFT" ? 0 : read.budget;

  const campaign = await db.campaign.create({
    data: {
      createdBy: null,
      createdByAdmin: true,
      projectId: project.id,
      title: read.title,
      description: read.description,
      contentType: read.contentType,
      // Derived, never taken from the form: the review engine and the payout maths both read
      // `rateType`, and `rateTypeFor` is the single place that mapping lives.
      rateType: rateTypeFor(read.paymentModel as Campaign["paymentModel"]),
      ratePer1k: read.paymentModel === "FIXED" ? 0 : read.ratePer1k,
      maxPayout: read.perPostCeiling,
      fixedFee: read.paymentModel === "HYBRID" ? read.fixedFee : null,
      budget: read.budget,
      fundedAmount,
      bannerUrl: read.bannerUrl,
      chain: read.chain,
      paymentModel: read.paymentModel,
      maxSubmissions: read.maxSubmissions,
      maxPerCreator: read.maxPerCreator,
      treasury,
      // Operator bags are fixed-budget bags by definition — see the treasury lookup above.
      treasuryKind: "FIXED",
      platforms: read.platforms,
      geo: ["GLOBAL"],
      status,
      slotsRemaining: slotsFor(read.budget, read.perPostCeiling),
      endsAt: read.endsAt,
    },
    select: {
      id: true,
      title: true,
      status: true,
      budget: true,
      fundedAmount: true,
      slotsRemaining: true,
    },
  });

  // The first entry in the bag's edit history, so the trail covers creation too.
  await db.campaignAdminChange.create({
    data: {
      campaignId: campaign.id,
      action: "CREATE",
      changes: {
        status: { from: null, to: status },
        budget: { from: null, to: read.budget },
        fundedAmount: { from: null, to: fundedAmount },
      },
    },
  });

  return NextResponse.json(
    {
      campaign: {
        ...campaign,
        projectName: project.name,
        tokenSymbol: project.tokenSymbol,
        // Echoed for the console only — see the field's note in the schema.
        createdByAdmin: true,
      },
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
