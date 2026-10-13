import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { normaliseBannerUrl } from "@/lib/campaigns/authoring";
import { mapCampaign, mapFeeDeposit } from "@/lib/mappers";
import { parseCharacter } from "@/lib/profile/character";
import { feeSwapMinUsd } from "@/lib/solana/jupiter";
import { getFeeSyncState } from "@/lib/settings/platform";
import type { CampaignMember } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const row = await db.campaign.findUnique({
    where: { id },
    include: {
      project: true,
      _count: { select: { submissions: true } },
      // Bounded: settled payouts are the only rows "spent" is derived from.
      submissions: {
        where: { status: "paid" },
        select: { payoutAmount: true },
      },
    },
  });
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const spent = row.submissions.reduce(
    (sum, entry) => sum + (entry.payoutAmount ?? 0),
    0,
  );
  const campaign = mapCampaign(row, {
    submissionsCount: row._count.submissions,
    spent,
  });

  /**
   * Who joined this bag — not what everyone posted into it.
   *
   * This used to return the six most recent submissions with their status, views and quality
   * score, which made a public bag page into a scoreboard of other people's work: a visitor could
   * read every creator's review verdict, including the rejections, and their scores. That is
   * between the creator and the campaign.
   *
   * So the shape changed rather than the rendering. The payload no longer contains a submission
   * at all — no links, no verdicts, no scores — and the page shows membership instead. Detail
   * stays where it belongs: the creator's own My Submissions, and the publisher's My Bags.
   */
  const joined = await db.submission.findMany({
    where: { campaignId: id, userId: { not: null } },
    select: {
      userId: true,
      // A claim is the honest "joined at"; `createdAt` covers rows that predate claims.
      claimedAt: true,
      createdAt: true,
      // Read only to answer "have they shipped anything yet?", never returned.
      postUrl: true,
      user: {
        select: {
          handle: true,
          displayName: true,
          profileNumber: true,
          character: true,
          avatarId: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  /**
   * Collapsed to one row per person.
   *
   * Someone with three posts into the same bag is one member who joined once, so the earliest
   * claim wins and any post marks them active. `active` is a fact about the creator's own work
   * and reveals nothing about how that work was reviewed.
   */
  const membersById = new Map<string, CampaignMember>();
  for (const entry of joined) {
    if (!entry.userId || !entry.user) continue;

    const joinedAt = (entry.claimedAt ?? entry.createdAt).toISOString();
    const existing = membersById.get(entry.userId);
    if (!existing) {
      const { user } = entry;
      membersById.set(entry.userId, {
        id: entry.userId,
        // The same fallback chain the rest of the console uses, so nobody is rendered blank.
        name:
          user.displayName?.trim() ||
          (user.handle ? `@${user.handle}` : null) ||
          (user.profileNumber ? `Bagworker#${user.profileNumber}` : "Bagworker"),
        handle: user.handle,
        profileNumber: user.profileNumber,
        character: parseCharacter(user.character),
        avatarId: user.avatarId,
        joinedAt,
        active: Boolean(entry.postUrl),
      });
      continue;
    }

    if (joinedAt < existing.joinedAt) existing.joinedAt = joinedAt;
    if (entry.postUrl) existing.active = true;
  }

  // Newest joiners first: a bag's page is mostly read while it is filling up.
  const members = [...membersById.values()].sort((a, b) => (a.joinedAt < b.joinedAt ? 1 : -1));

  /**
   * Fee Redirect history.
   *
   * Every deposit is returned, including the ones that could not be converted — a fee row that
   * says "no route yet" is information the publisher needs, not noise to hide. Bounded so a busy
   * token's history cannot bloat this response.
   */
  const feeDeposits = row.feeRedirectEnabled
    ? await db.feeDeposit.findMany({
        where: { campaignId: id },
        orderBy: { receivedAt: "desc" },
        take: 25,
      })
    : [];

  /**
   * The fee ledger, aggregated — the numbers the transparency panel shows.
   *
   * Computed here rather than in the client because `feeDeposits` above is capped at 25 rows: a busy
   * token would otherwise report a lifetime total that silently stopped growing. Two grouped queries
   * cover everything: one sums per status, one takes the newest stamps.
   *
   * Every figure is a real column. `waitingUsdc` is null rather than 0 when no waiting deposit has
   * ever been priced — "we do not know what this is worth" and "it is worth nothing" are different
   * answers, and the panel prints "—" for the first one.
   */
  const [perStatus, stamps] = row.feeRedirectEnabled
    ? await Promise.all([
        db.feeDeposit.groupBy({
          by: ["status"],
          where: { campaignId: id },
          _count: { _all: true },
          _sum: { usdcAmount: true, estimatedUsdc: true, tokenAmount: true },
        }),
        db.feeDeposit.aggregate({
          where: { campaignId: id },
          _max: { receivedAt: true, swappedAt: true },
        }),
      ])
    : [[], { _max: { receivedAt: null, swappedAt: null } }];

  const stats = new Map(perStatus.map((group) => [group.status, group]));
  const sumOf = (statuses: string[], field: "usdcAmount" | "estimatedUsdc" | "tokenAmount") =>
    statuses.reduce((total, status) => total + (stats.get(status)?._sum[field] ?? 0), 0);
  const countOf = (statuses: string[]) =>
    statuses.reduce((total, status) => total + (stats.get(status)?._count._all ?? 0), 0);

  /** Deposits that have arrived and not yet been converted — whatever the reason. */
  const WAITING_STATUSES = ["received", "matched", "swapping", "no_route", "below_minimum"];
  const waitingCount = countOf(WAITING_STATUSES);
  const waitingPriced = countOf(
    WAITING_STATUSES.filter((status) => (stats.get(status)?._sum.estimatedUsdc ?? 0) > 0),
  );

  const feeSummary = row.feeRedirectEnabled
    ? {
        /** Lifetime deposits attributed to this bag. */
        deposits: perStatus.reduce((total, group) => total + group._count._all, 0),
        swappedUsdc: Math.round(sumOf(["swapped"], "usdcAmount") * 100) / 100,
        swappedCount: countOf(["swapped"]),
        lastSwapAt: stamps._max.swappedAt?.toISOString() ?? null,
        /** Tokens sitting in the fee wallet right now. */
        waitingTokens: sumOf(WAITING_STATUSES, "tokenAmount"),
        waitingCount,
        /** Null when nothing waiting has a quote — see the note above. */
        waitingUsdc: waitingPriced > 0 ? Math.round(sumOf(WAITING_STATUSES, "estimatedUsdc") * 100) / 100 : null,
        waitingPriced,
        belowFloorCount: countOf(["below_minimum"]),
        noRouteCount: countOf(["no_route"]),
        failedCount: countOf(["failed"]),
        lastDepositAt: stamps._max.receivedAt?.toISOString() ?? null,
        /** The floor the local sweeps apply, so the panel can explain a wait. */
        floorUsd: feeSwapMinUsd(),
      }
    : null;

  return NextResponse.json({
    campaign,
    feeDeposits: feeDeposits.map(mapFeeDeposit),
    feeSummary,
    /** When the fee sweep last ran at all — null until one has. */
    feeSync: row.feeRedirectEnabled ? await getFeeSyncState() : null,
    members,
  });
}

/**
 * PATCH /api/campaigns/[id] — publisher actions on a bag they own.
 *
 * Three shapes, and the body decides which:
 *
 *   - `{ status: "ENDED" }` — close the bag. Stops new submissions immediately
 *     (`POST /api/submissions` already refuses a closed bag).
 *   - `{ publish: true }` — open a Fee Redirect bag, which has no transfer to wait for. Refused for
 *     every other kind, which is what keeps a fixed-budget bag from going LIVE without its deposit.
 *   - `{ description?, bannerUrl? }` — edit the brief and the artwork.
 *
 * The budget is deliberately not one of them, in any shape. A bag's budget is backed by USDC that
 * has already moved into the treasury, so raising the number in a column would advertise money the
 * wallet does not hold — and every creator posting into it would be working toward a payout that
 * cannot happen. Increasing a budget is a second real transfer, which is a flow of its own.
 * `budget` and `fundedAmount` are refused loudly rather than ignored, so a client that tries it
 * gets an explanation instead of a silent no-op.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const status = String(body?.status ?? "").toUpperCase();
  /**
   * Publishing is the flywheel bag's only way in.
   *
   * A fixed-budget bag proves a transfer arrived before it goes LIVE, because that proof is the
   * promise a creator is relying on. A Fee Redirect bag has no transfer to prove — its budget
   * arrives as fees and grows as the token trades — so its lifecycle call is this one instead.
   */
  const publish = body?.publish === true;
  /**
   * The metadata shape, recognised by either field being present.
   *
   * `undefined` means "leave it alone" and `null` means "clear it", which is why this is keyed on
   * presence rather than on truthiness: `{ description: "…" }` must not wipe the artwork, and
   * `{ bannerUrl: null }` must not blank the brief.
   */
  const editingMetadata = body?.description !== undefined || body?.bannerUrl !== undefined;

  if (!publish && !editingMetadata && status !== "ENDED") {
    return NextResponse.json(
      {
        error:
          "Accepted: status ENDED (closing), publish: true, or description/bannerUrl (editing). The budget cannot be changed here.",
      },
      { status: 400 },
    );
  }

  const existing = await db.campaign.findUnique({
    where: { id },
    select: { id: true, createdBy: true, status: true, feeRedirectEnabled: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.createdBy !== session.user.id) {
    return NextResponse.json(
      {
        error: publish
          ? "Only the publisher who owns this campaign can publish it"
          : editingMetadata
            ? "Only the publisher who owns this campaign can edit it"
            : "Only the publisher who funded this bag can close it",
      },
      { status: 403 },
    );
  }

  /*
   * Editing the brief and the artwork — the two things a publisher genuinely learns after launch
   * ("this is the audience I actually wanted", "here is a better banner") and the two that touch no
   * money. Allowed at any status: none of it changes what the bag promises a creator.
   *
   * `normaliseBannerUrl` is the same function the create path uses, so a value that could not be
   * set at creation cannot be smuggled in here — it is rendered into an `<img src>` on every card in
   * the marketplace, so only an http(s) URL or one of our own uploaded paths survives.
   */
  if (editingMetadata) {
    if (body?.budget !== undefined || body?.fundedAmount !== undefined) {
      return NextResponse.json(
        {
          error:
            "A bag's budget cannot be edited — it is backed by USDC already transferred to the Bagwork treasury. Fund a top-up transfer instead.",
        },
        { status: 400 },
      );
    }

    const patch: { description?: string; bannerUrl?: string | null } = {};

    if (body?.description !== undefined) {
      const description = String(body.description ?? "").trim();
      // The same floor the create path enforces, so an edit cannot leave a bag less described
      // than a new one is allowed to be.
      if (description.length < 20) {
        return NextResponse.json(
          { error: "The brief must be at least 20 characters" },
          { status: 400 },
        );
      }
      patch.description = description;
    }

    if (body?.bannerUrl !== undefined) {
      patch.bannerUrl = normaliseBannerUrl(body.bannerUrl);
    }

    const updated = await db.campaign.update({
      where: { id },
      data: patch,
      include: {
        project: true,
        _count: { select: { submissions: true } },
        submissions: { where: { status: "paid" }, select: { payoutAmount: true } },
      },
    });
    const spent = updated.submissions.reduce(
      (sum, entry) => sum + (entry.payoutAmount ?? 0),
      0,
    );

    return NextResponse.json({
      campaign: mapCampaign(updated, {
        submissionsCount: updated._count.submissions,
        spent,
      }),
    });
  }

  if (publish) {
    if (existing.status !== "DRAFT") {
      return NextResponse.json(
        { error: `This campaign is already ${existing.status.toLowerCase()}` },
        { status: 409 },
      );
    }

    /*
     * The only gate is that this campaign actually is one.
     *
     * Without it, publishing would be a way for a fixed-budget bag to go LIVE without the funding
     * transfer it is supposed to be waiting for — and a creator cannot distinguish the two from
     * Explore. Requiring `feeRedirectEnabled` is what keeps the two lifecycles separate.
     */
    if (!existing.feeRedirectEnabled) {
      return NextResponse.json(
        {
          error:
            "Only a Fee Redirect campaign can be published without funding — a fixed-budget bag opens when its transfer is confirmed",
        },
        { status: 400 },
      );
    }

    const opened = await db.campaign.update({
      where: { id },
      data: { status: "LIVE" },
      include: {
        project: true,
        _count: { select: { submissions: true } },
        submissions: { where: { status: "paid" }, select: { payoutAmount: true } },
      },
    });
    const openSpent = opened.submissions.reduce((sum, entry) => sum + (entry.payoutAmount ?? 0), 0);

    return NextResponse.json({
      campaign: mapCampaign(opened, {
        submissionsCount: opened._count.submissions,
        spent: openSpent,
      }),
    });
  }

  if (existing.status === "ENDED") {
    return NextResponse.json({ error: "This bag is already closed" }, { status: 409 });
  }

  const updated = await db.campaign.update({
    where: { id },
    data: { status: "ENDED" },
    include: {
      project: true,
      _count: { select: { submissions: true } },
      submissions: { where: { status: "paid" }, select: { payoutAmount: true } },
    },
  });

  // Same derivation as GET: money spent is the sum of settled payouts, never
  // `budget - fundedAmount`.
  const spent = updated.submissions.reduce(
    (sum, entry) => sum + (entry.payoutAmount ?? 0),
    0,
  );

  return NextResponse.json({
    campaign: mapCampaign(updated, {
      submissionsCount: updated._count.submissions,
      spent,
    }),
  });
}
