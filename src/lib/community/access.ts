/**
 * Community access — the one place the rules live.
 *
 * Three rules, and this module is the only thing that decides them:
 *
 *   1. The publisher who funded the bag is the ADMIN. Nobody else ever is.
 *   2. A bagworker is a MEMBER once they have a submission on the campaign. `CommunityMember`
 *      records that, but it is not what grants it — the submission is. A row that was never
 *      written (a claim made before the community existed, say) must not lock anyone out.
 *   3. Everyone else is refused, including a signed-in user who simply has not joined the bag.
 *
 * Enforced at the route, on every read and every write. The client's role label is a rendering
 * of this answer, never the source of it.
 */
import type { Campaign, Community, Project } from "@prisma/client";

import { db } from "@/lib/db";

export type CommunityRole = "ADMIN" | "MEMBER";

/**
 * A community with everything its pages need. The project is included because the header shows
 * the token's symbol and colour, and doing that lookup a second time per request would be a
 * needless round-trip.
 */
export type CommunityWithCampaign = Community & {
  campaign: Campaign & { project: Project };
};

export interface CommunityContext {
  /** Carries `campaign.project`, which the community header needs for the token mark. */
  community: CommunityWithCampaign;
  campaign: CommunityWithCampaign["campaign"];
  role: CommunityRole;
  isAdmin: boolean;
}

/**
 * Finds a community from either identifier it can legitimately be addressed by.
 *
 * A community id comes from the sidebar and from the index page; a *campaign* id comes from a
 * bag page, which has the campaign to hand and nothing else. Accepting both here means no
 * surface needs a second lookup, or a client-side map of which bags have a space yet — and it is
 * why `/dashboard/community/<bag id>` works before the community has even been created.
 */
export async function findCommunity(ref: string): Promise<CommunityWithCampaign | null> {
  const byId = await db.community.findUnique({
    where: { id: ref },
    include: { campaign: { include: { project: true } } },
  });
  if (byId) return byId;

  return db.community.findUnique({
    where: { campaignId: ref },
    include: { campaign: { include: { project: true } } },
  });
}

/** Is this user the publisher who funded the bag? The whole basis of admin. */
export function isPublisher(campaign: Campaign, userId: string): boolean {
  return Boolean(campaign.createdBy) && campaign.createdBy === userId;
}

/** Opting into a bag — a claim or a post — is what makes someone a member. */
export async function hasJoinedBag(campaignId: string, userId: string): Promise<boolean> {
  const mine = await db.submission.findFirst({
    where: { campaignId, userId },
    select: { id: true },
  });
  return mine !== null;
}

export type CommunityAccess =
  | { status: "not_found" }
  | { status: "forbidden"; campaignId: string }
  | { status: "ok"; context: CommunityContext };

/**
 * The gate every community route calls.
 *
 * `forbidden` carries the campaign id so the client can say *which* bag to join, rather than a
 * bare "no access" that leaves someone guessing.
 */
export async function resolveCommunityAccess(
  ref: string,
  userId: string,
): Promise<CommunityAccess> {
  const community = await findCommunity(ref);
  if (!community) return { status: "not_found" };

  const { campaign } = community;
  const admin = isPublisher(campaign, userId);
  const allowed = admin || (await hasJoinedBag(campaign.id, userId));
  if (!allowed) return { status: "forbidden", campaignId: campaign.id };

  const role: CommunityRole = admin ? "ADMIN" : "MEMBER";
  await recordMembership(community.id, userId, role);

  return { status: "ok", context: { community, campaign, role, isAdmin: admin } };
}

/**
 * Records that someone is in. Idempotent, and deliberately unable to fail the caller.
 *
 * This is a write inside a read path, which is normally worth avoiding — but it is a single
 * upsert on a unique pair, it is what keeps the member count honest, and it is never what grants
 * access. A failure to write it must not deny a real member, so the error is swallowed.
 */
export async function recordMembership(
  communityId: string,
  userId: string,
  role: CommunityRole,
): Promise<void> {
  try {
    await db.communityMember.upsert({
      where: { communityId_userId: { communityId, userId } },
      create: { communityId, userId, role },
      // Never demote an admin: this is also called from the member path, which must not be able
      // to overwrite an ADMIN row with MEMBER.
      update: role === "ADMIN" ? { role: "ADMIN" } : {},
    });
  } catch {
    // Counting is not permission.
  }
}

/**
 * Called when a bagworker opts into a bag.
 *
 * So the count moves straight away instead of waiting for that person to open the community.
 * Silently does nothing when the publisher has not created a space yet — those bagworkers are
 * picked up by `resolveCommunityAccess` the first time they look.
 */
export async function recordMembershipOnJoin(
  campaignId: string,
  userId: string,
): Promise<void> {
  try {
    const community = await db.community.findUnique({
      where: { campaignId },
      select: { id: true },
    });
    if (!community) return;
    await recordMembership(community.id, userId, "MEMBER");
  } catch {
    // Opting into a bag must never fail because a community row could not be written.
  }
}
