import { NextRequest, NextResponse } from "next/server";
import type { Prisma, User } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { NPC_AVATARS } from "@/lib/profile/avatars";
import { CHARACTER_KEYS, parseCharacter } from "@/lib/profile/character";
import { isValidSolanaAddress } from "@/lib/solana/connection";

/**
 * GET   /api/profile — the signed-in user's profile
 * PATCH /api/profile — update it (also marks onboarding complete)
 *
 * Every field is scoped to the session user resolved from a verified Privy token, so a
 * caller can only ever read or write their own row. Nothing here trusts a user id sent
 * by the client.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Only these fields may be edited by the user themselves. */
const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,24}$/, "Use 3-24 characters: a-z, 0-9 or underscore")
    .optional(),
  bio: z.string().trim().max(280).optional(),
  avatarUrl: z.string().trim().max(500).optional(),
  avatarColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour")
    .optional(),
  /**
   * One of the built-in pixel avatars.
   *
   * Checked against the real list rather than accepted as free text: this value is rendered
   * as an SVG grid, so an unknown id would silently fall back to the first character and the
   * user would think their choice did not save.
   */
  avatarId: z
    .string()
    .trim()
    .refine((value) => NPC_AVATARS.some((avatar) => avatar.id === value), "Unknown avatar")
    .optional(),
  /**
   * The pixel character from the builder.
   *
   * Every field is checked against the real option list and unknown keys are rejected. This
   * value is what gets drawn, so an unchecked string would render as a different character
   * than the one the user built and look like the save silently failed.
   *
   * `points`, `level` and `profileNumber` are deliberately absent: they are derived or
   * permanent, and a user must not be able to post them.
   */
  character: z
    .object({
      skin: z.string().refine((v) => CHARACTER_KEYS.skin.includes(v), "Unknown skin tone"),
      hair: z.string().refine((v) => CHARACTER_KEYS.hair.includes(v), "Unknown hair style"),
      hairColor: z
        .string()
        .refine((v) => CHARACTER_KEYS.hairColor.includes(v), "Unknown hair colour"),
      eyes: z.string().refine((v) => CHARACTER_KEYS.eyes.includes(v), "Unknown eye style"),
      accessory: z
        .string()
        .refine((v) => CHARACTER_KEYS.accessory.includes(v), "Unknown accessory"),
      top: z.string().refine((v) => CHARACTER_KEYS.top.includes(v), "Unknown top"),
      background: z
        .string()
        .refine((v) => CHARACTER_KEYS.background.includes(v), "Unknown background"),
    })
    .strict()
    .optional(),
  /**
   * `socials` is **not** here, and that is the point.
   *
   * It used to be a free-text map, which made the submission gate meaningless: `socials` is what
   * `verifySubmissionAccount` compares a post's author against, so anything typed in became "an
   * account this user has verified" — and an approved link is what gets paid. Handles now arrive only
   * from `POST /api/profile/socials`, which re-reads them from the user's own Privy account
   * Only that route writes them.
   *
   * Zod strips unknown keys, so a stale client that still posts `socials` gets a 200 with the field
   * ignored rather than a save that appears to work and does not.
   */
  interests: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  /**
   * Where payouts go. Null clears it (which stops payouts, so the UI warns). Validated as
   * a real base58 public key: a typo here means money sent to nobody, and Solana transfers
   * to a malformed address are not refundable.
   */
  payoutWallet: z
    .union([
      z.string().trim().refine(isValidSolanaAddress, "That is not a valid Solana address"),
      z.null(),
    ])
    .optional(),
  /** Set true on the final onboarding step. */
  completeOnboarding: z.boolean().optional(),
});

/** Reads a JSON object column into a plain string map, ignoring unexpected shapes. */
function asStringMap(value: Prisma.JsonValue | null | undefined): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string" && entry.length > 0) out[key] = entry;
  }
  return out;
}

function asStringList(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

/** The profile exactly as the client consumes it. */
function serialiseProfile(user: User) {
  return {
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    avatarColor: user.avatarColor,
    avatarId: user.avatarId,
    /** The pixel character, or null for an account that never built one. */
    character: parseCharacter(user.character),
    /** `Bagworker#3578` — permanent, unique, and rendered from this number. */
    profileNumber: user.profileNumber,
    /** Lifetime progression. Level is derived from points; neither is client-writable. */
    points: user.points,
    level: user.level,
    socials: asStringMap(user.socials),
    interests: asStringList(user.interests),
    walletAddress: user.walletAddress,
    payoutWallet: user.payoutWallet,
    trustScore: user.trustScore,
    totalEarned: user.totalEarned,
    submissions: user.submissions,
    approvals: user.approvals,
    onboardingCompleted: user.onboardingCompletedAt !== null,
    joinedAt: user.createdAt,
  };
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE }
    );
  }
  return NextResponse.json(
    { profile: serialiseProfile(session.user) },
    { headers: NO_STORE }
  );
}

export async function PATCH(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = profileUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid profile details",
        issues: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 422, headers: NO_STORE }
    );
  }

  const input = parsed.data;

  /*
   * The character is set once.
   *
   * It was editable in profile settings, which quietly made the avatar a setting rather than
   * part of an identity: the face a Bagworker# is recognised by could be reshaped at any time.
   * Onboarding still writes it, but only while the profile has none. After that the server
   * refuses — removing the control from the drawer is a hint, and this is the rule.
   *
   * An identical value is accepted rather than rejected, so replaying a step that already
   * succeeded does not fail the user for sending what is already stored. Compared field by
   * field rather than as JSON, so key order cannot decide whether someone's character changed.
   */
  if (input.character && session.user.character) {
    const stored = parseCharacter(session.user.character);
    const submitted = input.character as unknown as Record<string, string>;
    const unchanged =
      stored !== null &&
      Object.keys(CHARACTER_KEYS).every(
        (key) => (stored as unknown as Record<string, string>)[key] === submitted[key],
      );

    if (!unchanged) {
      return NextResponse.json(
        {
          error: "Your character is permanent and cannot be changed",
          issues: [
            { field: "character", message: "A character cannot be changed once it is set" },
          ],
        },
        { status: 403, headers: NO_STORE }
      );
    }
  }

  // Handles are public, so they must not collide. Checked here rather than relying on a
  // constraint so the client gets a clear 409 it can show next to the field.
  if (input.handle) {
    const taken = await db.user.findFirst({
      where: { handle: input.handle, NOT: { id: session.user.id } },
      select: { id: true },
    });
    if (taken) {
      return NextResponse.json(
        {
          error: "That handle is already taken",
          issues: [{ field: "handle", message: "Already taken" }],
        },
        { status: 409, headers: NO_STORE }
      );
    }
  }

  const updated = await db.user.update({
    where: { id: session.user.id },
    data: {
      // `undefined` means "leave unchanged" for Prisma, which is what we want for a
      // partial update from any onboarding step.
      displayName: input.displayName,
      handle: input.handle,
      bio: input.bio,
      avatarUrl: input.avatarUrl === "" ? null : input.avatarUrl,
      avatarColor: input.avatarColor,
      avatarId: input.avatarId,
      character: input.character
        ? (input.character as unknown as Prisma.InputJsonValue)
        : undefined,
      payoutWallet: input.payoutWallet,
      interests: input.interests
        ? (input.interests as Prisma.InputJsonValue)
        : undefined,
      onboardingCompletedAt: input.completeOnboarding ? new Date() : undefined,
    },
  });

  return NextResponse.json(
    { profile: serialiseProfile(updated) },
    { headers: NO_STORE }
  );
}
