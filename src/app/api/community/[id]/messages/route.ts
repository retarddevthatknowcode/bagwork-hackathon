import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { resolveCommunityAccess } from "@/lib/community/access";
import {
  COMMUNITY_PERSON_SELECT,
  extractLink,
  mapCommunityMessage,
} from "@/lib/community/mappers";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Long enough for a real brief, short enough that a message stays a message. */
const MAX_BODY = 2_000;

/** Only images that came back from our own upload route are accepted. */
const UPLOAD_PREFIX = "/api/uploads/banner/";

/**
 * POST /api/community/[id]/messages — post an announcement. **Admin only.**
 *
 * This is the rule the whole feature rests on: members read, the publisher posts. It is checked
 * here against the campaign's owner rather than against anything the client sent, and the member
 * UI having no composer is a consequence of this check, not a substitute for it.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id } = await params;
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
    return NextResponse.json(
      { error: "Only the campaign admin can post in this community" },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    body?: unknown;
    imageUrl?: unknown;
  } | null;

  const text = String(body?.body ?? "").trim();
  if (text.length > MAX_BODY) {
    return NextResponse.json(
      { error: `Announcements are limited to ${MAX_BODY} characters` },
      { status: 422 },
    );
  }

  /*
   * The image must be one of ours.
   *
   * The upload route already checked the type and the container signature and stored the bytes;
   * accepting an arbitrary URL here would let an admin point the whole community at a third-party
   * host (and, worse, at a `javascript:` payload in a link preview). A same-origin path is the
   * only thing that ever gets through.
   */
  const rawImage = body?.imageUrl === null || body?.imageUrl === undefined
    ? null
    : String(body.imageUrl).trim();
  if (rawImage && !rawImage.startsWith(UPLOAD_PREFIX)) {
    return NextResponse.json({ error: "That image cannot be used here" }, { status: 422 });
  }
  if (rawImage && rawImage.length > 300) {
    return NextResponse.json({ error: "That image cannot be used here" }, { status: 422 });
  }

  // An announcement has to say or show something.
  if (!text && !rawImage) {
    return NextResponse.json({ error: "Write something or attach an image" }, { status: 422 });
  }

  const message = await db.communityMessage.create({
    data: {
      communityId: access.context.community.id,
      senderId: session.user.id,
      body: text,
      imageUrl: rawImage,
      linkUrl: extractLink(text),
    },
    include: { sender: { select: COMMUNITY_PERSON_SELECT } },
  });

  return NextResponse.json(
    {
      message: mapCommunityMessage(message, { id: session.user.id, isAdmin: true }),
    },
    { status: 201 },
  );
}
