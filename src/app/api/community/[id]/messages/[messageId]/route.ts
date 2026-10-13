import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { resolveCommunityAccess } from "@/lib/community/access";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/community/[id]/messages/[messageId] — pin or unpin. **Admin only.**
 *
 * Pinning is editorial, so it is the admin's alone: a member who could pin could put their own
 * words at the top of someone else's announcement board.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id, messageId } = await params;
  const access = await resolveCommunityAccess(id, session.user.id);

  if (access.status === "not_found") {
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }
  if (access.status === "forbidden") {
    return NextResponse.json(
      { error: "Join this bag to enter its community", campaignId: access.campaignId },
      { status: 403 },
    );
  }
  if (!access.context.isAdmin) {
    return NextResponse.json({ error: "Only the campaign admin can pin messages" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { isPinned?: unknown } | null;
  if (typeof body?.isPinned !== "boolean") {
    return NextResponse.json({ error: "isPinned must be true or false" }, { status: 422 });
  }

  // Scoped to the community as well as the id: a message from another bag's community must not be
  // reachable through this route just because the caller guesses its id.
  const updated = await db.communityMessage.updateMany({
    where: { id: messageId, communityId: access.context.community.id },
    data: { isPinned: body.isPinned },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, isPinned: body.isPinned });
}

/**
 * DELETE /api/community/[id]/messages/[messageId] — remove an announcement.
 *
 * Allowed for the admin, and for whoever wrote it. The admin case matters because the person who
 * posted an announcement may leave; without it a bag could keep a post nobody can retract.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id, messageId } = await params;
  const access = await resolveCommunityAccess(id, session.user.id);

  if (access.status === "not_found") {
    return NextResponse.json({ error: "Community not found" }, { status: 404 });
  }
  if (access.status === "forbidden") {
    return NextResponse.json(
      { error: "Join this bag to enter its community", campaignId: access.campaignId },
      { status: 403 },
    );
  }

  const message = await db.communityMessage.findFirst({
    where: { id: messageId, communityId: access.context.community.id },
    select: { id: true, senderId: true },
  });
  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const mayDelete =
    access.context.isAdmin || (message.senderId !== null && message.senderId === session.user.id);
  if (!mayDelete) {
    return NextResponse.json({ error: "You cannot delete this message" }, { status: 403 });
  }

  await db.communityMessage.delete({ where: { id: message.id } });
  return NextResponse.json({ ok: true });
}
