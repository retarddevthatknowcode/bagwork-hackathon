import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { isAdmin } from "../../login/route";
import { rateTypeFor } from "@/lib/mappers";
import { readAuthoring, slotsFor } from "@/lib/campaigns/authoring";
import type { Campaign } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The statuses an operator may set. Kept in step with `POST /api/admin/campaigns`.
 *
 * `FILLING` is derived, never chosen: a bag is FILLING because its slots ran out.
 */
const ADMIN_STATUSES = ["DRAFT", "LIVE", "PAUSED", "ENDED"];

/**
 * Present in a PATCH body means "this is a full edit from the form", not a status action.
 *
 * The console's edit form submits the whole bag every time, so authoring fields are validated
 * as a set — that is what stops a partial body from silently blanking the fields it omits.
 * Pause/resume/end send `{ status }` alone and skip this path entirely.
 */
const AUTHORING_KEYS = [
  "title",
  "description",
  "projectName",
  "platforms",
  "bannerUrl",
  "contentType",
  "chain",
  "token",
  "paymentModel",
  "budget",
  "ratePer1k",
  "fixedFee",
  "maxPayout",
  "maxSubmissions",
  "maxPerCreator",
  "endsAt",
  "durationDays",
];

/*
 * Field validation, end-date resolution and the slot formula all come from
 * `@/lib/campaigns/authoring` — the same functions `POST /api/admin/campaigns` uses, which is
 * what keeps an edit from accepting something a create would have rejected.
 */

/**
 * GET /api/admin/campaigns/[id] — one bag plus its admin edit history.
 *
 * Opened on demand when an operator expands a row. The list already carries the editable
 * fields, so this is mostly for the history: why is this bag's budget different from what was
 * funded, and when did it get paused?
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const campaign = await db.campaign.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          name: true,
          tokenSymbol: true,
          tokenMint: true,
          tokenKind: true,
          treasury: true,
        },
      },
      creator: { select: { id: true, handle: true, walletAddress: true } },
      _count: { select: { submissions: true } },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const spent = await db.submission.aggregate({
    where: { campaignId: id, status: "paid" },
    _sum: { payoutAmount: true },
  });

  const history = await db.campaignAdminChange.findMany({
    where: { campaignId: id },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return NextResponse.json(
    {
      campaign: {
        id: campaign.id,
        title: campaign.title,
        status: campaign.status,
        description: campaign.description,
        bannerUrl: campaign.bannerUrl,
        contentType: campaign.contentType,
        rateType: campaign.rateType,
        paymentModel: campaign.paymentModel,
        ratePer1k: campaign.ratePer1k,
        maxPayout: campaign.maxPayout,
        fixedFee: campaign.fixedFee,
        budget: campaign.budget,
        fundedAmount: campaign.fundedAmount,
        spent: Math.round((spent._sum.payoutAmount ?? 0) * 100) / 100,
        remaining: Math.round(
          Math.max(0, campaign.budget - (spent._sum.payoutAmount ?? 0)) * 100,
        ) / 100,
        slotsRemaining: campaign.slotsRemaining,
        maxSubmissions: campaign.maxSubmissions,
        maxPerCreator: campaign.maxPerCreator,
        platforms: campaign.platforms,
        endsAt: campaign.endsAt.toISOString(),
        createdAt: campaign.createdAt.toISOString(),
        projectName: campaign.project.name,
        tokenSymbol: campaign.project.tokenSymbol,
        tokenMint: campaign.project.tokenMint,
        tokenKind: campaign.project.tokenKind,
        treasury: campaign.project.treasury,
        createdByAdmin: campaign.createdByAdmin,
        submissions: campaign._count.submissions,
        owner: campaign.creator
          ? {
              id: campaign.creator.id,
              handle: campaign.creator.handle,
              wallet: campaign.creator.walletAddress,
            }
          : null,
      },
      history: history.map((h) => ({
        id: h.id,
        action: h.action,
        changes: h.changes,
        createdAt: h.createdAt.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * PATCH /api/admin/campaigns/[id] — edit a bag that is already running, or stop/start it.
 *
 * Two shapes of request, and the body decides which:
 *
 *  - **Full edit** (any of `AUTHORING_KEYS` present): every authoring field is validated exactly
 *    as it was at creation. This works on publisher-funded bags too — rates and limits sometimes
 *    do have to be corrected after launch, and a corrected rate beats a wrong payout.
 *  - **Status action** (`{ status }` alone): pause, resume/publish or end.
 *
 * Every accepted change is appended to the bag's audit trail with its before/after values. Two
 * knock-on effects are handled here rather than left to the caller:
 *
 *  - Changing the budget or the rate settings recomputes `slotsRemaining` from the submissions
 *    already on the bag, so raising a budget actually buys capacity and lowering one cannot
 *    leave more slots than there is money behind.
 *  - Publishing an operator-created bag sets `fundedAmount` to its budget: for those bags the
 *    budget *is* the funding. A publisher's bag is never touched this way, because its
 *    `fundedAmount` records a real on-chain transfer.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const existing = await db.campaign.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          tokenMint: true,
          tokenSymbol: true,
          tokenName: true,
          tokenKind: true,
          tokenDecimals: true,
          tokenLogoUrl: true,
        },
      },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const fullEdit = AUTHORING_KEYS.some((key) => key in body);

  const requestedStatus =
    body.status === undefined ? null : String(body.status).toUpperCase();
  if (requestedStatus && !ADMIN_STATUSES.includes(requestedStatus)) {
    return NextResponse.json(
      { error: "Status must be DRAFT, LIVE, PAUSED or ENDED" },
      { status: 400 },
    );
  }
  if (!fullEdit && !requestedStatus) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  /** Stored as display strings: the trail is read by a human, not diffed by a machine. */
  const changes: Record<string, { from: string | null; to: string | null }> = {};
  /** Arrays (platforms) compare by value, so an unchanged save does not log a change. */
  const same = (a: unknown, b: unknown) =>
    a === b ||
    (Array.isArray(a) && Array.isArray(b) && JSON.stringify(a) === JSON.stringify(b));
  const describe = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    return typeof value === "string" ? value : String(value);
  };
  const note = (field: string, from: unknown, to: unknown) => {
    if (!same(from, to)) changes[field] = { from: describe(from), to: describe(to) };
  };

  // ---- Full edit -------------------------------------------------------------------------
  if (fullEdit) {
    // The token is fixed at creation: re-pointing a bag at another mint would make the budget it
    // holds unpayable. The row's own project supplies it, so `readAuthoring` still validates
    // everything else against the same rules it used at creation.
    const read = readAuthoring({
      ...body,
      token: {
        kind: existing.project.tokenKind,
        mint: existing.project.tokenMint,
        symbol: existing.project.tokenSymbol,
        name: existing.project.tokenName ?? existing.project.tokenSymbol,
        decimals: existing.project.tokenDecimals,
        logoUrl: existing.project.tokenLogoUrl,
      },
    });
    if (!read.ok) {
      return NextResponse.json({ error: read.error }, { status: 400 });
    }

    patch.title = read.title;
    note("title", existing.title, read.title);
    patch.description = read.description;
    note("description", existing.description, read.description);
    patch.bannerUrl = read.bannerUrl;
    note("bannerUrl", existing.bannerUrl, read.bannerUrl);
    patch.contentType = read.contentType;
    note("contentType", existing.contentType, read.contentType);
    patch.platforms = read.platforms;
    note("platforms", existing.platforms, read.platforms);

    patch.paymentModel = read.paymentModel;
    note("paymentModel", existing.paymentModel, read.paymentModel);
    patch.rateType = rateTypeFor(read.paymentModel as Campaign["paymentModel"]);
    patch.ratePer1k = read.paymentModel === "FIXED" ? 0 : read.ratePer1k;
    note("ratePer1k", existing.ratePer1k, patch.ratePer1k);
    patch.maxPayout = read.perPostCeiling;
    note("maxPayout", existing.maxPayout, read.perPostCeiling);
    patch.fixedFee = read.paymentModel === "HYBRID" ? read.fixedFee : null;
    note("fixedFee", existing.fixedFee, patch.fixedFee);

    patch.budget = read.budget;
    note("budget", existing.budget, read.budget);
    patch.maxSubmissions = read.maxSubmissions;
    note("maxSubmissions", existing.maxSubmissions, read.maxSubmissions);
    patch.maxPerCreator = read.maxPerCreator;
    note("maxPerCreator", existing.maxPerCreator, read.maxPerCreator);
    patch.endsAt = read.endsAt;
    note("endsAt", existing.endsAt.toISOString(), read.endsAt.toISOString());

    // Slots are recomputed from what is already on the bag rather than reset, so a budget
    // correction buys or removes capacity without silently dropping someone's slot.
    if (read.budget !== existing.budget || read.perPostCeiling !== existing.maxPayout) {
      const claimed = await db.submission.count({ where: { campaignId: id } });
      const slots = Math.max(0, slotsFor(read.budget, read.perPostCeiling) - claimed);
      patch.slotsRemaining = slots;
      note("slotsRemaining", existing.slotsRemaining, slots);
    }

    // A project is shared by every bag priced in that token, so its name only moves when the
    // operator actually typed a different one.
    if (read.projectName && read.projectName !== existing.project.name) {
      await db.project.update({
        where: { id: existing.project.id },
        data: { name: read.projectName },
      });
      note("projectName", existing.project.name, read.projectName);
    }
  }

  // ---- Status ----------------------------------------------------------------------------
  if (requestedStatus && requestedStatus !== existing.status) {
    // A bag that comes back with no slots left is FILLING, not LIVE: "running but full" is the
    // honest state, and it keeps the claim button off until someone else's slot frees up.
    const slots = (patch.slotsRemaining as number | undefined) ?? existing.slotsRemaining;
    const resolved = requestedStatus === "LIVE" && slots <= 0 ? "FILLING" : requestedStatus;
    patch.status = resolved;
    changes.status = { from: existing.status, to: resolved };

    // An operator-created bag is funded by definition — its budget was set by hand, so there is
    // no transfer to wait for. A publisher's `fundedAmount` records a real transfer and is left
    // exactly as it is.
    if (
      existing.createdByAdmin &&
      resolved !== "DRAFT" &&
      existing.fundedAmount < existing.budget
    ) {
      patch.fundedAmount = existing.budget;
      note("fundedAmount", existing.fundedAmount, existing.budget);
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const campaign = await db.campaign.update({
    where: { id },
    data: patch,
    select: {
      id: true,
      title: true,
      status: true,
      budget: true,
      fundedAmount: true,
      slotsRemaining: true,
      endsAt: true,
    },
  });

  // PAUSE / RESUME / PUBLISH / END are the entries worth scanning for; anything else is a plain
  // field edit.
  const action =
    changes.status === undefined
      ? "UPDATE"
      : changes.status.to === "PAUSED"
        ? "PAUSE"
        : changes.status.to === "ENDED"
          ? "END"
          : existing.status === "PAUSED"
            ? "RESUME"
            : "PUBLISH";

  await db.campaignAdminChange.create({
    data: { campaignId: id, action, changes },
  });

  const history = await db.campaignAdminChange.findMany({
    where: { campaignId: id },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return NextResponse.json(
    {
      campaign: {
        ...campaign,
        endsAt: campaign.endsAt.toISOString(),
        createdByAdmin: existing.createdByAdmin,
      },
      action,
      changed: Object.keys(changes),
      history: history.map((h) => ({
        id: h.id,
        action: h.action,
        changes: h.changes,
        createdAt: h.createdAt.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}