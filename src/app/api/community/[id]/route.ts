import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { resolveCommunityAccess } from "@/lib/community/access";
import {
  COMMUNITY_PERSON_SELECT,
  mapCommunityMessage,
  toCommunityPerson,
  type CommunityDetailPayload,
  type CommunityMemberDto,
} from "@/lib/community/mappers";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/community/[id] — one community, its announcements and its members.
 *
 * `[id]` accepts a community id **or** a campaign id. A bag page links to its community using the
 * campaign it already has, and asking which of the two a URL holds here means no caller ever has
 * to know whether the publisher has opened a space yet.
 *
 * Reading is what triggers membership recording: opening the page is the moment we know someone
 * is actually in. Access itself is decided by `resolveCommunityAccess`, which accepts anyone with
 * a submission on the bag whether or not a membership row exists yet.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id } = await params;
  const access = await resolveCommunityAccess(id, session.user.id);

  if (access.status === "not_found") {
    /*
     * Nothing at this address yet — which is two different situations, and the page needs to tell
     * them apart. A community id that resolves to nothing is simply missing. A *campaign* id with
     * no community means the publisher has not opened one, and only they can.
     *
     * `canCreate` is decided here, from ownership of the row, so the create form is never shown to
     * somebody the POST route would answer with a 403.
     */
    const bag = await db.campaign.findUnique({
      where: { id },
      select: { id: true, title: true, createdBy: true },
    });

    return NextResponse.json(
      {
        error: bag ? "No community yet" : "Community not found",
        campaignId: bag?.id ?? null,
        campaignTitle: bag?.title ?? null,
        canCreate: Boolean(bag && bag.createdBy === session.user.id),
      },
      { status: 404 },
    );
  }
  if (access.status === "forbidden") {
    // The campaign id is included so the page can name the bag to join rather than saying "no".
    return NextResponse.json(
      { error: "Join this bag to enter its community", campaignId: access.campaignId },
      { status: 403 },
    );
  }

  const { community, campaign, role, isAdmin: admin } = access.context;
  const viewer = { id: session.user.id, isAdmin: admin };

  const [messages, members, memberCount] = await Promise.all([
    db.communityMessage.findMany({
      where: { communityId: community.id },
      include: { sender: { select: COMMUNITY_PERSON_SELECT } },
      // Newest first: the feed reads top-down from the present, and pinned messages are lifted
      // out into their own block by the page rather than by a second query.
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.communityMember.findMany({
      where: { communityId: community.id },
      include: { user: { select: COMMUNITY_PERSON_SELECT } },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      take: 500,
    }),
    db.communityMember.count({ where: { communityId: community.id } }),
  ]);

  const memberDtos: CommunityMemberDto[] = members.map((member) => ({
    ...toCommunityPerson(member.user),
    role: member.role as CommunityMemberDto["role"],
    joinedAt:
      member.joinedAt instanceof Date
        ? member.joinedAt.toISOString()
        : String(member.joinedAt),
  }));

  const payload: CommunityDetailPayload = {
    community: {
      id: community.id,
      campaignId: community.campaignId,
      title: community.title,
      createdAt:
        community.createdAt instanceof Date
          ? community.createdAt.toISOString()
          : String(community.createdAt),
    },
    campaign: {
      id: campaign.id,
      title: campaign.title,
      status: campaign.status,
      tokenSymbol: campaign.project.tokenSymbol,
      tokenColor: campaign.project.tokenColor,
      endsAt:
        campaign.endsAt instanceof Date ? campaign.endsAt.toISOString() : String(campaign.endsAt),
      budget: campaign.budget,
    },
    role,
    isAdmin: admin,
    memberCount,
    members: memberDtos,
    messages: messages.map((message) => mapCommunityMessage(message, viewer)),
  };

  return NextResponse.json(payload);
}
