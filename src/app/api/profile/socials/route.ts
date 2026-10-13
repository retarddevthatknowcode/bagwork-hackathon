import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { getPrivyServer } from "@/lib/auth/privy-server";
import {
  PRIVY_SOCIAL_ACCOUNT_TYPE,
  SOCIAL_VERIFY_PLATFORMS,
  isSocialVerifyPlatform,
  normalizeSocialHandle,
} from "@/lib/privy/config";
import { verifiedAccounts } from "@/lib/social/verify";

/**
 * POST   /api/profile/socials  — store a handle Privy has proven for this account
 * DELETE /api/profile/socials  — remove one stored handle
 *
 * The **only** write path for `User.socials`.
 *
 * `socials` is not decoration: `verifySubmissionAccount` reads it to decide whether a submitted link
 * was written by this person, and an approved link is what gets paid. So the handle cannot be taken on
 * trust — a free-text field would let someone type `elonmusk`, submit @elonmusk's post, and be paid
 * for work they did not do.
 *
 * What makes it trustworthy: the handle is checked against **the signed-in user's own Privy account**.
 * Linking runs on the signup app (`useLinkAccount` in `components/auth/auth-provider.tsx`), so the
 * account Privy reports for this user *is* the proof — the client says which platform it just linked,
 * and this route re-reads that platform's handle from Privy and stores it only when the two agree. A
 * client can claim a platform, therefore, but not a handle.
 *
 * There used to be a second Privy app whose token stood as the proof instead. It was removed: two
 * Privy providers on one origin share a session, so the second app could sign people out.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Writes the map back and returns it as the client reads it. */
async function writeSocials(userId: string, socials: Record<string, string>) {
  const updated = await db.user.update({
    where: { id: userId },
    data: { socials: socials as Prisma.InputJsonValue },
    select: { socials: true },
  });
  return verifiedAccounts(updated.socials);
}

/** The handle Privy holds for one platform on this user, or null when there is none. */
function linkedHandle(
  linkedAccounts: readonly unknown[],
  platform: keyof typeof PRIVY_SOCIAL_ACCOUNT_TYPE,
): string | null {
  const wanted = PRIVY_SOCIAL_ACCOUNT_TYPE[platform];
  for (const account of linkedAccounts) {
    if (!account || typeof account !== "object") continue;
    const type = "type" in account && typeof account.type === "string" ? account.type : "";
    if (type !== wanted) continue;
    const username =
      "username" in account && typeof account.username === "string" ? account.username : "";
    const handle = normalizeSocialHandle(username);
    if (handle) return handle;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const body = (await request.json().catch(() => null)) as
    | { platform?: unknown; handle?: unknown }
    | null;
  const platform = body?.platform;
  const handle = typeof body?.handle === "string" ? normalizeSocialHandle(body.handle) : "";

  if (!isSocialVerifyPlatform(platform)) {
    return NextResponse.json(
      { error: `Specify one of: ${SOCIAL_VERIFY_PLATFORMS.join(", ")}`, code: "unknown_platform" },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!handle) {
    return NextResponse.json(
      { error: "That account came back without a handle.", code: "no_handle" },
      { status: 400, headers: NO_STORE },
    );
  }

  const privy = getPrivyServer();
  if (!privy) {
    return NextResponse.json({ error: "auth_not_configured" }, { status: 503, headers: NO_STORE });
  }

  // Every session carries the Privy DID the user was created with; without one there is nothing to
  // read the linked accounts from, and nowhere sensible to store a handle.
  const privyId = session.user.privyId;
  if (!privyId) {
    return NextResponse.json(
      { error: "This account has no Privy identity to verify against.", code: "no_privy_identity" },
      { status: 409, headers: NO_STORE },
    );
  }

  let privyUser;
  try {
    privyUser = await privy.users()._get(privyId);
  } catch (error) {
    console.error("[api/profile/socials] could not read the Privy account", {
      error: error instanceof Error ? error.message : error,
    });
    return NextResponse.json(
      {
        error: "Privy could not be asked which accounts you have. Try again in a moment.",
        code: "lookup_failed",
      },
      { status: 502, headers: NO_STORE },
    );
  }

  const proven = linkedHandle(privyUser.linked_accounts ?? [], platform);
  if (!proven) {
    return NextResponse.json(
      {
        error: `No ${platform} account is linked to your Bagwork account yet. Link it first, then save it.`,
        code: "not_linked",
      },
      { status: 403, headers: NO_STORE },
    );
  }
  if (proven !== handle) {
    return NextResponse.json(
      {
        error: "That is not the account linked to your Bagwork account. Link the one you meant to prove.",
        code: "handle_mismatch",
      },
      { status: 409, headers: NO_STORE },
    );
  }

  /*
   * Merge, never replace.
   *
   * Verification happens one provider at a time, so a replace would wipe the other platforms every
   * time a second one was stored. Merging also leaves a handle this route cannot speak for exactly
   * where it was rather than deleting profile data.
   */
  const socials = { ...verifiedAccounts(session.user.socials), [platform]: proven };

  return NextResponse.json(
    { socials: await writeSocials(session.user.id, socials), verified: { [platform]: proven } },
    { headers: NO_STORE },
  );
}

export async function DELETE(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const platform = new URL(request.url).searchParams.get("platform");
  if (!isSocialVerifyPlatform(platform)) {
    return NextResponse.json(
      {
        error: `Specify one of: ${SOCIAL_VERIFY_PLATFORMS.join(", ")}`,
        code: "unknown_platform",
      },
      { status: 400, headers: NO_STORE },
    );
  }

  const socials = verifiedAccounts(session.user.socials);

  // Removing something that is not there is a no-op, not an error: the goal state is reached either
  // way, and a 404 would make the button look broken to someone who already removed it elsewhere.
  if (!(platform in socials)) {
    return NextResponse.json({ socials, removed: false }, { headers: NO_STORE });
  }

  delete socials[platform];

  return NextResponse.json(
    { socials: await writeSocials(session.user.id, socials), removed: true },
    { headers: NO_STORE },
  );
}
