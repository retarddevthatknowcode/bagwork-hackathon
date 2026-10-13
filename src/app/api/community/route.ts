import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import {
  isPublisher,
  recordMembership,
  type CommunityRole,
} from "@/lib/community/access";
import type { CommunityIndexPayload, CommunityListItem } from "@/lib/community/mappers";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/community — every community, flagged with whether the requester can open it.
 *
 * The index needs the whole list, not only the ones that are open: "there is a community on a
 * bag you have not joined" is the answer that tells someone what to do next. `canOpen` is
 * decided from the same rules the chat page enforces, so the index can never disagree with the
 * door on the community itself.
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const [communities, joined] = await Promise.all([
    db.community.findMany({
      include: {
        campaign: { include: { project: true } },
        _count: { select: { members: true, messages: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    // One row per bag the requester has opted into. Their memberships, in one query rather than
    // one per community.
    db.submission.findMany({
      where: { userId: session.user.id },
      select: { campaignId: true },
      distinct: ["campaignId"],
    }),
  ]);

  const joinedCampaignIds = new Set(joined.map((row) => row.campaignId));

  const list: CommunityListItem[] = communities.map((community) => {
    const admin = isPublisher(community.campaign, session.user.id);
    const canOpen = admin || joinedCampaignIds.has(community.campaignId);
    const role: CommunityRole | null = !canOpen ? null : admin ? "ADMIN" : "MEMBER";
    return {
      id: community.id,
      campaignId: community.campaignId,
      title: community.title,
      campaignTitle: community.campaign.title,
      tokenSymbol: community.campaign.project.tokenSymbol,
      tokenColor: community.campaign.project.tokenColor,
      campaignStatus: community.campaign.status,
      memberCount: community._count.members,
      messageCount: community._count.messages,
      role,
      canOpen,
    };
  });

  const payload: CommunityIndexPayload = {
    communities: list,
    joinedBags: joinedCampaignIds.size,
  };
  return NextResponse.json(payload);
}

/**
 * POST /api/community — open a community for a bag.
 *
 * The publisher who funded the bag, and nobody else. One per bag: enforced by the check below
 * *and* by the unique index, because two concurrent taps must not open two spaces.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    // There is no operator path here either: a community belongs to the account that funded the
    // bag, so an unauthenticated caller has nothing to prove.
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    campaignId?: unknown;
    title?: unknown;
  } | null;
  const campaignId = String(body?.campaignId ?? "").trim();
  if (!campaignId) {
    return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  }

  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, title: true, createdBy: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Bag not found" }, { status: 404 });
  }

  /*
   * Exactly one rule, and it is ownership of the campaign.
   *
   * Not "a member": a Bagworker who joined this bag can read its community but must never be able
   * to open one — the board belongs to whoever funded the bag. Not an operator, and not an
   * account that merely has a submission here.
   *
   * Checked against `createdBy` on the row rather than anything the client sends, so the UI
   * hiding the create form is a convenience and never the permission.
   */
  if (campaign.createdBy !== session.user.id) {
    return NextResponse.json(
      { error: "Only the publisher of this bag can open its community" },
      { status: 403 },
    );
  }

  const existing = await db.community.findUnique({
    where: { campaignId },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "This bag already has a community", communityId: existing.id },
      { status: 409 },
    );
  }

  // Defaults to the bag's own name — a publisher opening a space should not have to invent one.
  const title = String(body?.title ?? "").trim().slice(0, 80) || campaign.title;

  try {
    const community = await db.community.create({
      data: { campaignId, createdByUserId: session.user.id, title },
      select: { id: true, campaignId: true, title: true },
    });

    // Recorded so the member list has its admin in it from the first open.
    if (session) await recordMembership(community.id, session.user.id, "ADMIN");

    return NextResponse.json({ community }, { status: 201 });
  } catch {
    // Lost a race: the unique index refused, so hand back the row that won.
    const winner = await db.community.findUnique({
      where: { campaignId },
      select: { id: true },
    });
    if (winner) {
      return NextResponse.json(
        { error: "This bag already has a community", communityId: winner.id },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Could not open the community" }, { status: 500 });
  }
}
