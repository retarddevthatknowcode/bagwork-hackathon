import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { mapCampaign, rateTypeFor } from "@/lib/mappers";
import { isValidSolanaAddress } from "@/lib/solana/connection";
import { normalizePlatforms, type Campaign } from "@/lib/types";
import {
  CONTENT_TYPES,
  MIN_BUDGET,
  budgetIsSane,
  normaliseBannerUrl,
  num,
  readOptionalInt,
  readToken,
  resolveCeiling,
} from "@/lib/campaigns/authoring";
import { treasuryAddressFor } from "@/lib/solana/treasury";

export const dynamic = "force-dynamic";

/**
 * Shared cache for the public marketplace feed.
 *
 * The feed is the same for every visitor, and it is read on arrival by both the landing page and
 * the console. Thirty seconds of edge cache turns a ~0.9s database round-trip into an instant
 * response for everyone behind it, and `stale-while-revalidate` means the refresh happens behind
 * a visitor who never waits for it. Nothing user-specific is ever served under this header — the
 * publisher's own view (`?mine=1`) is session-scoped and stays `no-store`.
 */
const PUBLIC_FEED_CACHE = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
} as const;

/*
 * Token, budget, payment-model and banner validation live in `@/lib/campaigns/authoring` —
 * the same functions the admin portal's create/edit routes use, so the two paths cannot drift
 * apart on what a valid bag is.
 */

/**
 * Paid-submission totals per campaign, in one query.
 *
 * `fundedAmount` is the escrow commitment (the whole budget at creation), so the UI's
 * "spent" and "remaining" figures have to come from settled payouts instead. Grouping
 * here keeps the list endpoint to two round-trips regardless of campaign count.
 */
async function paidTotals(campaignIds: string[]): Promise<Map<string, number>> {
  if (campaignIds.length === 0) return new Map();
  const rows = await db.submission.groupBy({
    by: ["campaignId"],
    where: { campaignId: { in: campaignIds }, status: "paid" },
    _sum: { payoutAmount: true },
  });
  return new Map(
    rows.map((row) => [row.campaignId, row._sum.payoutAmount ?? 0]),
  );
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  /**
   * Only the states a creator is meant to browse are honoured.
   *
   * `DRAFT` (no money behind it) and `PAUSED` (deliberately not advertised) are not among them,
   * and the default is `LIVE`. Anything else — those two, or a typo — falls back to `LIVE`
   * instead of being passed through into the query, so the status parameter can never be used
   * to enumerate bags that are not on the marketplace.
   */
  const PUBLIC_STATUSES = ["LIVE", "FILLING", "ENDED"];
  const requested = (params.get("status") || "LIVE").toUpperCase();
  const status =
    requested === "ALL" || PUBLIC_STATUSES.includes(requested) ? requested : "LIVE";
  const limit = Number(params.get("limit") || "50");
  const mine = params.get("mine") === "1" || params.get("mine") === "true";

  // "My Bags" is a publisher view, so it only ever returns the caller's own campaigns and
  // requires a verified session. Every other query stays public (the marketplace feed).
  if (params.get("mine") === "1" || params.get("mine") === "true") {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    return NextResponse.json(await publisherBags(session.user.id, status));
  }

  try {
    return await marketplaceFeed(status, limit);
  } catch (error) {
    /*
     * A failed feed is logged in full and reported generically.
     *
     * The detail stays server-side on purpose: this route is public and unauthenticated, and a raw
     * Prisma message can name columns, tables and hosts. What the caller gets is enough to tell
     * "your request was wrong" from "our side is down", which is the part that changes what they
     * should do next.
     *
     * Deliberately NOT downgraded to `200 { campaigns: [] }`. An empty list is a factual claim that
     * there are no bags; returning it for a database failure would have shown "0 of 0 bags" over a
     * marketplace that still had five campaigns in it — which is exactly the confusion this
     * incident was, and worse, because it hides the fault instead of reporting it.
     */
    console.error("[api/campaigns] marketplace feed failed", error);
    return NextResponse.json(
      {
        error:
          "The bag feed could not be loaded. This is a server-side problem, not your request.",
      },
      { status: 503 },
    );
  }
}

/**
 * The public marketplace feed.
 *
 * Split out of `GET` so the entire read — including the row mapping, which is where a schema drift
 * surfaces — sits inside one try/catch. Before this, a database error escaped as a framework 500
 * with an HTML body, and the console could only render a generic "We couldn't load this".
 */
async function marketplaceFeed(status: string, limit: number) {
  /*
   * Both reads go out together.
   *
   * Against the remote pooler one statement costs ~0.9s of round-trip, so awaiting the paid
   * totals *after* the campaign rows added a whole second to every marketplace and explore
   * request — this endpoint measured 2.2s and was the slowest in the app.
   *
   * They are independent because the totals are grouped across every campaign rather than
   * filtered by the ids just read; the map below simply ignores rows it did not ask for. That is
   * one row per campaign with any settled payout, so the result set stays small.
   */
  const [rows, paidRows] = await Promise.all([
    db.campaign.findMany({
      // DRAFT bags are unfinished: created but not yet funded, so they have no money behind
      // them and must never appear in the marketplace. PAUSED bags are stopped on purpose and
      // are not advertised while they are stopped (they keep their page and their budget, so a
      // creator who already joined still sees them in My Submissions). `status=ALL` is not a
      // licence to expose either, which is why this is an explicit list rather than
      // "everything except DRAFT".
      where:
        status === "ALL"
          ? { status: { notIn: ["DRAFT", "PAUSED"] } }
          : { status },
      include: {
        project: true,
        _count: { select: { submissions: true } },
      },
      orderBy: { fundedAmount: "desc" },
      take: Math.min(Number.isFinite(limit) ? limit : 50, 100),
    }),
    db.submission.groupBy({
      by: ["campaignId"],
      where: { status: "paid" },
      _sum: { payoutAmount: true },
    }),
  ]);

  const spentByCampaign = new Map(
    paidRows.map((row) => [row.campaignId, row._sum.payoutAmount ?? 0]),
  );

  const campaigns = rows.map((row) =>
    mapCampaign(row, {
      submissionsCount: row._count.submissions,
      spent: spentByCampaign.get(row.id) ?? 0,
    }),
  );

  // The marketplace feed is identical for everyone, so it is worth a short shared cache: the
  // landing page and the console both read it on arrival, and `stale-while-revalidate` means a
  // visitor never waits for the refresh. `?status=` is part of the cache key, so each tab keeps
  // its own entry.
  return NextResponse.json({ campaigns }, { headers: PUBLIC_FEED_CACHE });
}

/**
 * Rows for the publisher's own bags, plus the summary a publisher actually needs:
 * how much of the budget is committed, paid out, still available, and how much work is
 * waiting on review or on a payout.
 *
 * Counts come from two aggregate queries rather than a per-bag include, so the cost does
 * not grow with the number of submissions per bag.
 */
async function publisherBags(createdBy: string, statusFilter: string) {
  const rows = await db.campaign.findMany({
    where: { createdBy, ...(statusFilter === "ALL" ? {} : { status: statusFilter }) },
    // The community id travels with the bag so My Bags can label its button "Open community"
    // or "Create community" without a second request per row.
    include: { project: true, community: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const ids = rows.map((row) => row.id);

  // Two aggregate queries rather than a per-bag include, so the cost does not grow with
  // the number of submissions per bag. Kept as separate statements (not a conditional
  // `Promise.all`) so each result keeps its own concrete type.
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

  /**
   * Distinct creators per bag.
   *
   * Distinct on `(campaignId, userId)` rather than counting submissions, because "how many
   * bagworkers joined" is a different question from "how many posts came in" — one creator
   * with three posts is one person, and a publisher reading this wants to know how many
   * people turned up.
   */
  const creatorRows = ids.length
    ? await db.submission.findMany({
        where: { campaignId: { in: ids }, userId: { not: null } },
        select: { campaignId: true, userId: true },
        distinct: ["campaignId", "userId"],
      })
    : [];

  const creatorsByCampaign = new Map<string, number>();
  for (const entry of creatorRows) {
    creatorsByCampaign.set(
      entry.campaignId,
      (creatorsByCampaign.get(entry.campaignId) ?? 0) + 1,
    );
  }

  const submitted = new Map<string, number>();
  const awaitingReview = new Map<string, number>();
  const awaitingPayout = new Map<string, number>();
  // The outcomes a publisher actually tracks. `claimed` is counted apart from `pending`:
  // a slot with no link is not work waiting on a decision, it is work waiting on a creator.
  const awaitingLink = new Map<string, number>();
  const approved = new Map<string, number>();
  const rejected = new Map<string, number>();

  const bump = (map: Map<string, number>, id: string, by: number) =>
    map.set(id, (map.get(id) ?? 0) + by);

  for (const entry of statusCounts) {
    const { campaignId, status } = entry;
    const count = entry._count._all;
    bump(submitted, campaignId, count);

    if (status === "claimed") bump(awaitingLink, campaignId, count);
    if (status === "pending" || status === "reviewing") bump(awaitingReview, campaignId, count);
    // `paid` is an approved outcome too, so it belongs in the approved column — otherwise a
    // fully settled bag would read "0 approved" next to "12 paid".
    if (status === "approved" || status === "paid") bump(approved, campaignId, count);
    if (status === "rejected") bump(rejected, campaignId, count);
    if (status === "approved") bump(awaitingPayout, campaignId, count);
  }

  const paidOf = new Map(
    paidByCampaign.map((entry) => [entry.campaignId, entry._sum.payoutAmount ?? 0]),
  );

  const bags = rows.map((row) => {
    const submissionsCount = submitted.get(row.id) ?? 0;
    return {
      campaign: mapCampaign(row, {
        submissionsCount,
        spent: paidOf.get(row.id) ?? 0,
      }),
      submissionsCount,
      creators: creatorsByCampaign.get(row.id) ?? 0,
      awaitingLink: awaitingLink.get(row.id) ?? 0,
      awaitingReview: awaitingReview.get(row.id) ?? 0,
      awaitingPayout: awaitingPayout.get(row.id) ?? 0,
      approved: approved.get(row.id) ?? 0,
      rejected: rejected.get(row.id) ?? 0,
      /** Null until the publisher opens a community for this bag. */
      communityId: row.community?.id ?? null,
    };
  });

  const summary = {
    bags: bags.length,
    live: bags.filter(
      (b) => b.campaign.status === "LIVE" || b.campaign.status === "FILLING",
    ).length,
    ended: bags.filter((b) => b.campaign.status === "ENDED").length,
    budgetCommitted: round2(bags.reduce((sum, b) => sum + b.campaign.fundedAmount, 0)),
    paidOut: round2(bags.reduce((sum, b) => sum + b.campaign.spent, 0)),
    remaining: round2(bags.reduce((sum, b) => sum + b.campaign.remaining, 0)),
    submissions: bags.reduce((sum, b) => sum + b.submissionsCount, 0),
    creators: bags.reduce((sum, b) => sum + b.creators, 0),
    awaitingReview: bags.reduce((sum, b) => sum + b.awaitingReview, 0),
    awaitingPayout: bags.reduce((sum, b) => sum + b.awaitingPayout, 0),
  };

  return { bags, summary };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * POST /api/campaigns — create and fund a bag.
 *
 * The creator funds the budget up-front, so `fundedAmount` starts at the full
 * budget, the bag goes LIVE immediately, and slots are derived from how many
 * payouts the budget can cover. On-chain funding is simulated the same way
 * payouts are (a realistic signature + explorer link).
 */
export async function POST(req: NextRequest) {
  // Funding a bag is a publisher action, so it requires a verified session. The route
  // previously accepted anonymous writes, which let anyone create campaigns (and, with
  // a made-up signature, mark them funded).
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in required to create a bag" },
      { status: 401 },
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ---- Step 1: basics & content -------------------------------------------------------
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const projectName = String(body.projectName ?? "").trim();
  const platforms = normalizePlatforms(body.platforms);
  const bannerUrl = normaliseBannerUrl(body.bannerUrl);
  // Content type is not part of the new three-step form, so it defaults to the product's
  // primary use case. The review engine explains what each value means.
  const contentType = String(body.contentType ?? "PROMO").toUpperCase();

  // ---- Step 2: budget, token & limits -------------------------------------------------
  const token = readToken(body.token);
  // Rejected up front rather than collected with the field errors: an unusable token is not
  // a form-field typo, and nothing below can be evaluated without its decimals.
  if (!token.ok) {
    return NextResponse.json({ error: token.error }, { status: 400 });
  }
  const chain = String(body.chain ?? "solana").toLowerCase();
  const paymentModel = String(body.paymentModel ?? "").toUpperCase();
  const budget = Number(body.budget);
  const fixedFee = body.fixedFee === undefined ? null : Number(body.fixedFee);
  const ratePer1k = body.ratePer1k === undefined ? 0 : Number(body.ratePer1k);
  const maxPayout = body.maxPayout === undefined ? null : Number(body.maxPayout);
  const days = Number(body.durationDays ?? 14);
  const maxSubmissions = readOptionalInt(body.maxSubmissions);
  const maxPerCreator = readOptionalInt(body.maxPerCreator);

  // ---- Fee Redirect -------------------------------------------------------------------
  const feeRedirectEnabled = Boolean(body.feeRedirectEnabled);
  const feeRedirectPct = body.feeRedirectPct === undefined ? null : Number(body.feeRedirectPct);
  // Defaults to the budget token's mint: the common case is "route this token's fees into its own
  // bag". A team can point at a different mint when their launchpad fees arrive in another token.
  const feeMintRaw = String(body.feeMint ?? "").trim();
  const feeMint = feeRedirectEnabled ? feeMintRaw || token.mint : null;

  const errors: string[] = [];
  if (title.length < 4) errors.push("Bag title must be at least 4 characters");
  if (description.length < 20)
    errors.push("Campaign brief must be at least 20 characters");
  if (platforms.length === 0) errors.push("Select at least one platform");
  if (!CONTENT_TYPES.includes(contentType)) errors.push("contentType is invalid");
  if (chain !== "solana")
    errors.push(`Chain "${chain}" is not supported yet — only Solana is live`);
  /*
   * A flywheel bag may start at zero — that is the whole point of it: the budget arrives as fees
   * rather than as a transfer. Its check is therefore "not negative", while the fixed minimum
   * still guards the money a publisher is about to send.
   */
  const startsEmpty = feeRedirectEnabled && budget === 0;
  if (startsEmpty) {
    if (budget < 0) errors.push("Budget cannot be negative");
  } else if (!budgetIsSane(budget, token.kind))
    errors.push(
      token.kind === "CUSTOM"
        ? "Budget must be greater than zero"
        : `Budget must be at least ${MIN_BUDGET[token.kind]} ${token.symbol}`,
    );
  if (!["FIXED", "RPM", "HYBRID"].includes(paymentModel))
    errors.push("paymentModel must be FIXED, RPM or HYBRID");

  // The per-post ceiling is what stops one viral post eating a whole bag. For FIXED it *is*
  // the fee; for RPM/HYBRID it is a cap, so an absent one would let a single post drain the
  // budget and break the slot maths.
  const perPostCeiling = resolveCeiling(paymentModel, fixedFee, maxPayout, ratePer1k);
  if (!num(perPostCeiling) || perPostCeiling <= 0)
    errors.push("Set a payout amount (or a per-post cap) greater than zero");
  // Comparing a ceiling to a budget only means something when the budget has money in it: a
  // flywheel bag's first dollars arrive *after* this point, as fees.
  else if (!startsEmpty && perPostCeiling > budget)
    errors.push("Payout per post cannot exceed the total budget");
  if ((paymentModel === "RPM" || paymentModel === "HYBRID") && !(ratePer1k > 0))
    errors.push("Set a reward per 1,000 views greater than zero");
  if (paymentModel === "HYBRID" && !(fixedFee && fixedFee > 0))
    errors.push("Hybrid needs a flat fee per post as well as the per-1K rate");
  if (!Number.isFinite(days) || days < 3 || days > 90)
    errors.push("Duration must be between 3 and 90 days");
  if (maxSubmissions !== null && maxSubmissions < 1)
    errors.push("Max submissions must be at least 1");
  if (maxPerCreator !== null && maxPerCreator < 1)
    errors.push("Max per creator must be at least 1");
  if (maxSubmissions !== null && maxPerCreator !== null && maxPerCreator > maxSubmissions)
    errors.push("Max per creator cannot exceed max submissions");

  if (feeRedirectEnabled) {
    if (!feeMint || !isValidSolanaAddress(feeMint)) {
      errors.push("Fee Redirect needs a valid token mint");
    }
    if (feeRedirectPct !== null && (!(feeRedirectPct > 0) || feeRedirectPct > 100)) {
      errors.push("Fee Redirect percentage must be between 1 and 100");
    }
  }

  /*
   * Money lands in a Bagwork treasury, never the publisher's own wallet — and *which* one is the
   * whole point of the dual split: a fixed-budget bag's transfer must reach the FIXED treasury,
   * while a Fee Redirect bag pins the FEE treasury so its fee routing instructions show the
   * address the fee loop actually watches. The address is read from the server so a client cannot
   * fund a bag into an account of its choosing, and the kind is persisted next to it so the pair
   * never drifts.
   */
  const treasuryKind = feeRedirectEnabled ? "FEE" : "FIXED";
  const treasury = treasuryAddressFor(feeRedirectEnabled ? "FEE" : "FIXED");
  if (!treasury) {
    return NextResponse.json(
      {
        error:
          treasuryKind === "FEE"
            ? "Flywheel campaigns are paused: the fee-redirect treasury is not configured. Set TREASURY_FEE_PRIVATE_KEY and redeploy."
            : "Creating bags is paused: the fixed-budget treasury is not configured. Set TREASURY_FIXED_PRIVATE_KEY (or the legacy TREASURY_PRIVATE_KEY) and redeploy.",
      },
      { status: 503 },
    );
  }

  if (errors.length) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
  }

  // ---- Persist ------------------------------------------------------------------------
  /*
   * One Project row per token **within one publisher's bags** — never across owners.
   *
   * This used to be `findFirst({ tokenMint })`: a single row shared by every bag on that mint. A
   * Project carries *identity* — name, symbol, colour, logo — so matching on the mint alone meant a
   * publisher's brand-new bag adopted whatever row that mint already had, and the row that happened
   * to be there was a seeded demo project. The card then read the demo's ticker because the bag had
   * borrowed a stranger's identity, not because anything defaulted. (Those demo rows are gone now —
   * see `scripts/remove-demo-bags.ts` — but the scoping below is what makes the bug impossible
   * rather than merely absent.) Scoped to the creator's own bags, a row is reused only where the
   * metadata is genuinely theirs: the first bag on a token creates it, a second reuses it.
   */
  let project = await db.project.findFirst({
    where: {
      tokenMint: token.mint,
      campaigns: { some: { createdBy: session.user.id } },
    },
  });
  if (!project) {
    project = await db.project.create({
      data: {
        name: projectName || token.name,
        tokenSymbol: token.symbol,
        tokenColor: String(body.tokenColor ?? "#eab308"),
        tokenMint: token.mint,
        tokenName: token.name,
        tokenDecimals: token.decimals,
        tokenLogoUrl: token.logoUrl,
        tokenKind: token.kind,
        // Pinned for the same reason as on the campaign: this bag's budget is sent here,
        // so the address must not move afterwards.
        treasury,
      },
    });
  }

  const endsAt = new Date(Date.now() + days * 86_400_000);
  // How many creators the budget can pay. Capped so a rounding error cannot produce a
  // 10,000-slot bag on a small budget.
  //
  // Zero rather than one for a flywheel bag that starts empty: `Math.max(1, ...)` would hand a bag
  // with no money in it a claimable place, and the fee sync increments this counter alongside the
  // budget — slots arrive *with* the money, never before it.
  const slots = startsEmpty
    ? 0
    : Math.max(1, Math.min(2000, Math.floor(budget / perPostCeiling)));

  const campaign = await db.campaign.create({
    data: {
      createdBy: session.user.id,
      projectId: project.id,
      title,
      description,
      contentType,
      // `rateType` stays in sync with `paymentModel` because the review engine and the
      // payout maths both read it. `rateTypeFor` is the single place that mapping lives.
      rateType: rateTypeFor(paymentModel as Campaign["paymentModel"]),
      ratePer1k: paymentModel === "FIXED" ? 0 : ratePer1k,
      maxPayout: perPostCeiling,
      fixedFee: paymentModel === "HYBRID" ? fixedFee : null,
      budget,
      // The bag is NOT funded yet. `fundedAmount` is set by
      // `POST /api/campaigns/[id]/fund` once the publisher's transfer is confirmed, so a
      // draft can never look like a bag that can pay creators.
      fundedAmount: 0,
      bannerUrl,
      chain,
      paymentModel,
      maxSubmissions,
      maxPerCreator,
      treasury,
      // Pinned beside `treasury` so payouts and fee detection never have to guess which wallet
      // holds this bag's money — see `treasuryKindFor`.
      treasuryKind,
      holderGate: Boolean(body.holderGate),
      holderMin: Number(body.holderMin ?? 0) || 0,
      // Fee Redirect: fees routed here grow this bag's budget once converted.
      feeRedirectEnabled,
      feeRedirectPct,
      feeMint,
      platforms,
      geo: ["GLOBAL"],
      status: "DRAFT",
      slotsRemaining: slots,
      endsAt,
    },
    include: { project: true },
  });

  return NextResponse.json(
    {
      campaign: mapCampaign(campaign, { submissionsCount: 0, spent: 0 }),
      // Step 3 needs exactly this: how much to send, where to send it, and in what.
      funding: {
        amount: budget,
        symbol: token.symbol,
        decimals: token.decimals,
        mint: token.mint,
        treasury,
        slots,
      },
    },
    { status: 201 },
  );
}
