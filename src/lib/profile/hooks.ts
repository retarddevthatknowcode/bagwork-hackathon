"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import type { CharacterConfig } from "./character";

/**
 * The user's profile, read from and written to Supabase through `/api/profile`.
 *
 * This replaces the previous approach of keeping profile fields in localStorage with a
 * hardcoded default (which showed a stranger's handle to new users and lost everything
 * on a new device). Because it is database-backed and keyed by the Privy identity, the
 * same wallet always resolves to the same profile.
 */

export interface Profile {
  id: string;
  handle: string | null;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  avatarColor: string;
  /** One of `NPC_AVATARS`. Null until the user picks a character. */
  avatarId: string | null;
  /** The pixel character built in onboarding. Null for accounts that predate the builder. */
  character: CharacterConfig | null;
  /** `Bagworker#3578` — permanent, unique, and shown wherever the identity is. */
  profileNumber: number | null;
  /** Lifetime points: 33 per $1 of approved, settled earnings. Never decreases. */
  points: number;
  /** Derived from `points` by `levelFromPoints`. Status only — nothing is gated by it. */
  level: number;
  socials: Record<string, string>;
  interests: string[];
  walletAddress: string | null;
  /** Where payouts are sent. Independent of `walletAddress`; null means "not paid yet". */
  payoutWallet: string | null;
  trustScore: number;
  totalEarned: number;
  submissions: number;
  approvals: number;
  onboardingCompleted: boolean;
  joinedAt: string;
}

export interface ProfileUpdate {
  displayName?: string;
  handle?: string;
  bio?: string;
  avatarUrl?: string;
  avatarColor?: string;
  /** One of the built-in pixel avatars. */
  avatarId?: string;
  /** The pixel character from the builder. Sent whole, never partially. */
  character?: CharacterConfig;
  /**
   * Deliberately absent: `socials` is **not** client-writable.
   *
   * It is what `verifySubmissionAccount` reads to decide whether a link was written by this person,
   * and an approved link is what gets paid. A field anyone can post would let someone type another
   * account's handle and be paid for its work, so a handle only ever arrives from
   * `POST /api/profile/socials` — which re-reads the handle from the user's own Privy account. See
   * `storeVerifiedSocial` below.
   */
  interests?: string[];
  /** Null clears it; a string must be a valid Solana address. */
  payoutWallet?: string | null;
  completeOnboarding?: boolean;
}

/** Validation problems returned by the API, keyed by field for inline display. */
export type ProfileIssues = { field: string; message: string }[];

export function useProfile() {
  const { ready, authenticated, getAccessToken, identityToken, walletAddress } = useAuth();

  return useQuery<{ profile: Profile }>({
    // The wallet is part of the key on purpose. On a brand-new signup the identity
    // token (which carries the linked Solana wallet) can arrive a beat after the
    // session, so the first sync writes a user row with `walletAddress: null` and
    // nothing re-fetched it — that user stayed wallet-less for good. Keying on the
    // address makes the profile re-sync the moment the wallet becomes known.
    queryKey: ["profile", walletAddress, Boolean(identityToken)],
    // Never run before a verified session exists, so it cannot 401 on first paint.
    enabled: ready && authenticated,
    queryFn: async () => {
      const token = await getAccessToken();
      const res = await fetch("/api/profile", {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(identityToken ? { "X-Privy-Identity-Token": identityToken } : {}),
        },
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Could not load your profile");
      return res.json();
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { getAccessToken, identityToken } = useAuth();

  return useMutation<{ profile: Profile }, Error & { issues?: ProfileIssues }, ProfileUpdate>({
    mutationFn: async (input) => {
      const token = await getAccessToken();
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(identityToken ? { "X-Privy-Identity-Token": identityToken } : {}),
        },
        body: JSON.stringify(input),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        const error = new Error(
          body.error ?? "Could not save your profile"
        ) as Error & { issues?: ProfileIssues };
        error.issues = body.issues;
        throw error;
      }

      return body;
    },
    onSuccess: (data) => {
      // Seed every cached profile variant (the key includes the wallet address), then
      // let the session query refresh its own copy.
      queryClient.setQueriesData({ queryKey: ["profile"] }, data);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });
}

/**
 * Writes a fresh `socials` map into every cached profile variant.
 *
 * The socials endpoint returns only the map (the rest of the profile did not change), so the cached
 * copy is patched in place rather than replaced with a second, partial payload. A refetch follows so
 * the server stays the authority on what is stored.
 */
export function seedSocials(queryClient: QueryClient, socials: Record<string, string>) {
  queryClient.setQueriesData<{ profile: Profile }>({ queryKey: ["profile"] }, (cached) =>
    cached?.profile ? { ...cached, profile: { ...cached.profile, socials } } : cached,
  );
  queryClient.invalidateQueries({ queryKey: ["profile"] });
}

/** Error carrying the endpoint's failure code, so a caller can branch on it as well as display it. */
export interface SocialMutationError extends Error {
  code?: string;
}

async function readSocialResponse(res: Response, fallback: string) {
  const body = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    const error = new Error(
      typeof body.error === "string" && body.error ? body.error : fallback,
    ) as SocialMutationError;
    if (typeof body.code === "string") error.code = body.code;
    throw error;
  }
  return body as { socials: Record<string, string> };
}

/**
 * Stores a handle Privy has just proven for the signed-in account.
 *
 * A plain function rather than a mutation, because the link completes inside Privy's `onSuccess`
 * callback — which fires on whichever page the provider returned the browser to, and is the only place
 * that knows a link actually finished. It sends the *signup* session (`Authorization` and the identity
 * token, as every other authenticated call does) and the handle in the body; the server re-reads that
 * handle from the user's own Privy account before storing it, so nothing a client types can get in.
 */
export async function storeVerifiedSocial(input: {
  platform: string;
  handle: string;
  accessToken: string | null;
  identityToken: string | null;
}): Promise<{ socials: Record<string, string> }> {
  const res = await fetch("/api/profile/socials", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(input.accessToken ? { Authorization: `Bearer ${input.accessToken}` } : {}),
      ...(input.identityToken ? { "X-Privy-Identity-Token": input.identityToken } : {}),
    },
    body: JSON.stringify({ platform: input.platform, handle: input.handle }),
  });
  return readSocialResponse(res, "Could not store that account");
}

/** Removes one verified handle, so a wrong account can be taken back off a profile. */
export function useRemoveSocial() {
  const queryClient = useQueryClient();
  const { getAccessToken, identityToken } = useAuth();

  return useMutation<{ socials: Record<string, string> }, SocialMutationError, string>({
    mutationFn: async (platform) => {
      const token = await getAccessToken();
      const res = await fetch(`/api/profile/socials?platform=${encodeURIComponent(platform)}`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(identityToken ? { "X-Privy-Identity-Token": identityToken } : {}),
        },
        cache: "no-store",
      });
      return readSocialResponse(res, "Could not remove that account");
    },
    onSuccess: (data) => seedSocials(queryClient, data.socials),
  });
}

/** One day of the contribution calendar. `date` is local midnight, `YYYY-MM-DDT00:00:00`. */
export interface ProfileActivityDay {
  date: string;
  count: number;
}

export interface ProfileActivity {
  user: { handle: string | null; profileNumber: number | null };
  window: { days: number; from: string; to: string };
  /** Only the days that have activity; the calendar fills every other cell as empty. */
  days: ProfileActivityDay[];
  total: number;
  activeDays: number;
}

/**
 * The contribution calendar for a profile: the signed-in user by default, or any Bagworker
 * by handle / `Bagworker#number`.
 *
 * The identifier is optional on purpose. The profile page passes nothing and gets its own
 * calendar; the moment a profile is opened for someone else (a Bagworker link in the
 * leaderboard, a shared URL) the same widget passes that person's handle, and nothing else
 * about the request changes. One contribution = one submission activity — opt-in, post link
 * or approval — which the endpoint counts per event.
 */
export function useProfileActivity(identifier?: string | number | null) {
  const { ready, authenticated, getAccessToken, identityToken } = useAuth();

  /*
   * Read on render rather than in an effect: it only changes if the visitor crosses a
   * timezone boundary mid-session, and it is part of the query key so the days stay aligned
   * with the cells the calendar builds in the browser's own timezone.
   */
  const timezoneOffset = new Date().getTimezoneOffset();

  return useQuery<ProfileActivity>({
    queryKey: ["profile-activity", identifier ?? "me", timezoneOffset],
    // Own profile: the same gate `useProfile` uses, so it cannot 401 on first paint.
    // Someone else's: public, so it can load immediately.
    enabled: identifier != null || (ready && authenticated),
    // A calendar is read on arrival. A contribution that lands while the page is open shows
    // up on the next visit instead of costing a request every focus.
    staleTime: 60_000,
    queryFn: async () => {
      const params = new URLSearchParams({ tz: String(timezoneOffset) });
      if (identifier != null) params.set("user", String(identifier));

      const token = identifier == null ? await getAccessToken() : null;
      const res = await fetch(`/api/profile/activity?${params.toString()}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(identifier == null && identityToken
            ? { "X-Privy-Identity-Token": identityToken }
            : {}),
        },
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Could not load activity");
      return res.json();
    },
  });
}

/**
 * Another Bagworker's public profile, as `GET /api/profile/[handle]` returns it.
 *
 * Everything here is safe to show a stranger: identity, progression and aggregate totals. There is
 * deliberately no submission, campaign or moderation field — the payload cannot carry one.
 */
export interface PublicProfile {
  handle: string | null;
  displayName: string | null;
  bio: string | null;
  profileNumber: number | null;
  level: number;
  points: number;
  avatarUrl: string | null;
  avatarColor: string;
  avatarId: string | null;
  character: CharacterConfig | null;
  /** Lifetime approved earnings. */
  earned: number;
  /** USDC settled to them, and how many payouts that took. */
  paidUsdc: number;
  payoutCount: number;
  /** Links submitted, and how many of those were approved. Counts only, never the work. */
  submissions: number;
  approvals: number;
  /** Contributions and distinct active days in the last 12 months. */
  contributions: number;
  activeDays: number;
  joinedAt: string;
}

/** A 404 from the profile endpoint, so a view can say "no such Bagworker" instead of "error". */
export interface PublicProfileError extends Error {
  notFound?: boolean;
}

/**
 * One Bagworker's public profile, by handle or `Bagworker#number`.
 *
 * The timezone offset is part of the request and the query key for the same reason it is on the
 * contribution calendar: the totals and the cells beneath them have to be counted in the reader's
 * days, or the two disagree with each other.
 */
export function usePublicProfile(identifier: string | number | null | undefined) {
  const { ready, authenticated, getAccessToken, identityToken } = useAuth();
  const timezoneOffset = new Date().getTimezoneOffset();

  return useQuery<{ profile: PublicProfile; isYou: boolean }>({
    queryKey: ["public-profile", String(identifier ?? ""), timezoneOffset],
    // Same gate as the rest of the console: nothing runs before a verified session exists.
    enabled: Boolean(identifier) && ready && authenticated,
    staleTime: 60_000,
    // A missing Bagworker is not a transient failure — retrying a 404 only delays the empty state.
    retry: false,
    queryFn: async () => {
      const token = await getAccessToken();
      const res = await fetch(
        `/api/profile/${encodeURIComponent(String(identifier))}?tz=${timezoneOffset}`,
        {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(identityToken ? { "X-Privy-Identity-Token": identityToken } : {}),
          },
          cache: "no-store",
        },
      );

      if (res.status === 404) {
        const error = new Error("No such Bagworker") as PublicProfileError;
        error.notFound = true;
        throw error;
      }
      if (!res.ok) throw new Error("Could not load this profile");

      return res.json();
    },
  });
}
