/**
 * Community payloads.
 *
 * These types are shared by the routes that produce them and the pages that consume them, so a
 * field can never be renamed on one side only. Everything here is derived from the community
 * tables plus the campaign the community belongs to — nothing is invented.
 */
import type { Prisma } from "@prisma/client";

import { parseCharacter, type CharacterConfig } from "@/lib/profile/character";

import type { CommunityRole } from "./access";

/** Someone in a community, shaped for `ProfileAvatar` + a name line. */
export interface CommunityPerson {
  id: string;
  name: string;
  handle: string | null;
  profileNumber: number | null;
  character: CharacterConfig | null;
  avatarId: string | null;
}

export interface CommunityMessageDto {
  id: string;
  body: string;
  imageUrl: string | null;
  linkUrl: string | null;
  isPinned: boolean;
  createdAt: string;
  /** Null when the account that posted it has since been deleted. The message stays. */
  sender: CommunityPerson | null;
  /** Whether the requester may delete this one: their own message, or any if they are admin. */
  canDelete: boolean;
}

export interface CommunityMemberDto extends CommunityPerson {
  role: CommunityRole;
  joinedAt: string;
}

export interface CommunityListItem {
  id: string;
  campaignId: string;
  title: string;
  campaignTitle: string;
  tokenSymbol: string;
  tokenColor: string;
  campaignStatus: string;
  memberCount: number;
  messageCount: number;
  /** Null when this community is not open to the requester. */
  role: CommunityRole | null;
  canOpen: boolean;
}

export interface CommunityIndexPayload {
  communities: CommunityListItem[];
  /** Bags the requester has opted into — the thing that unlocks a community. */
  joinedBags: number;
}

export interface CommunityDetailPayload {
  community: { id: string; campaignId: string; title: string; createdAt: string };
  campaign: {
    id: string;
    title: string;
    status: string;
    tokenSymbol: string;
    tokenColor: string;
    endsAt: string;
    budget: number;
  };
  role: CommunityRole;
  isAdmin: boolean;
  /** How many people can open this space (the admin included). */
  memberCount: number;
  members: CommunityMemberDto[];
  messages: CommunityMessageDto[];
}

/** The fields every person-shaped row must carry. One select, used by every community query. */
export const COMMUNITY_PERSON_SELECT = {
  id: true,
  displayName: true,
  handle: true,
  profileNumber: true,
  character: true,
  avatarId: true,
} as const;

/** The shape `COMMUNITY_PERSON_SELECT` returns. */
export interface CommunityPersonRow {
  id: string;
  displayName: string | null;
  handle: string | null;
  profileNumber: number | null;
  character: Prisma.JsonValue | null;
  avatarId: string | null;
}

/**
 * A display name with a guaranteed fallback chain: chosen name, then handle, then the permanent
 * Bagworker number. A person in a community is never rendered as "Unknown".
 */
export function toCommunityPerson(row: CommunityPersonRow): CommunityPerson {
  const name =
    row.displayName?.trim() ||
    (row.handle ? `@${row.handle}` : null) ||
    (row.profileNumber ? `Bagworker#${row.profileNumber}` : "Bagworker");

  return {
    id: row.id,
    name,
    handle: row.handle,
    profileNumber: row.profileNumber,
    // Validated rather than cast: this is a Json column, so it may hold anything at all.
    character: parseCharacter(row.character),
    avatarId: row.avatarId,
  };
}

/** A message, plus whether the person asking is allowed to delete it. */
export function mapCommunityMessage(
  row: {
    id: string;
    body: string;
    imageUrl: string | null;
    linkUrl: string | null;
    isPinned: boolean;
    createdAt: Date;
    senderId: string | null;
    sender: CommunityPersonRow | null;
  },
  viewer: { id: string; isAdmin: boolean },
): CommunityMessageDto {
  return {
    id: row.id,
    body: row.body,
    imageUrl: row.imageUrl,
    linkUrl: row.linkUrl,
    isPinned: row.isPinned,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    sender: row.sender ? toCommunityPerson(row.sender) : null,
    canDelete: viewer.isAdmin || (row.senderId !== null && row.senderId === viewer.id),
  };
}

/**
 * The first URL in a message, if there is one.
 *
 * Stored on the row rather than re-scanned on every render, and deliberately restricted to
 * http(s): a `javascript:` or `data:` URL pasted into an announcement must not become a link the
 * whole community is invited to click.
 */
export function extractLink(body: string): string | null {
  const match = body.match(/https?:\/\/[^\s<>()"']+/i);
  if (!match) return null;
  const candidate = match[0].replace(/[.,;:!?]+$/, "");
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
