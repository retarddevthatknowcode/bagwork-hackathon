"use client";

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import type {
  Campaign,
  CampaignMember,
  FeeDeposit,
  FeeSummary,
  FeeSyncState,
  Submission,
  LeaderboardEntry,
  Stats,
  Platform,
} from "@/lib/types";

/**
 * Privy credentials for our own API routes.
 *
 * The access token identifies the user; the identity token additionally carries the
 * linked Solana wallet and is verified server-side against the app's JWKS. Everything
 * that touches a session user sends both, matching `/api/profile`.
 */
function useAuthHeaders() {
  const { getAccessToken, identityToken } = useAuth();
  return useCallback(async () => {
    const token = await getAccessToken();
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(identityToken ? { "X-Privy-Identity-Token": identityToken } : {}),
    } as Record<string, string>;
  }, [getAccessToken, identityToken]);
}

/**
 * The marketplace feed.
 *
 * `enabled` exists for callers that only need the data once their UI is open — the ⌘K palette
 * asks for every bag, and it used to ask on every console page whether or not anyone pressed the
 * shortcut. One query per page that nobody opens is ~0.9s of database work competing with the
 * page's own data.
 */
export function useCampaigns(status = "LIVE", options?: { enabled?: boolean }) {
  return useQuery<{ campaigns: Campaign[] }>({
    queryKey: ["campaigns", status],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const res = await fetch(`/api/campaigns?status=${status}`);
      if (!res.ok) {
        /*
         * Surface the server's own reason where there is one.
         *
         * The generic sentence was all this could ever say, which is why the schema drift that
         * blanked the marketplace showed "the dev server log will say why" and nothing more —
         * there was no way to tell a bad request from a broken query without opening a terminal.
         */
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Failed to load campaigns");
      }
      return res.json();
    },
  });
}

export function useCampaign(id: string | null) {
  return useQuery<{
    campaign: Campaign;
    /** Fee Redirect deposits credited to this bag, newest first. Empty unless it is enabled. */
    feeDeposits?: FeeDeposit[];
    /**
     * The same ledger, aggregated over *every* deposit — the panel's numbers.
     *
     * Separate from `feeDeposits` because that list is capped at 25 rows: summing it client-side
     * would report a lifetime total that stops growing on a busy token. Null unless fee redirect
     * is on for this bag.
     */
    feeSummary?: FeeSummary | null;
    /** The last completed fee sweep, or null when none has run on this deployment yet. */
    feeSync?: FeeSyncState | null;
    /**
     * Who joined this bag — membership, not a submission feed.
     *
     * A bag page is readable by anyone, so the payload carries identity only: no post links, no
     * review verdicts and no quality scores. Those stay with the creator (My Submissions) and the
     * publisher (My Bags).
     */
    members: CampaignMember[];
  }>({
    queryKey: ["campaign", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${id}`);
      if (!res.ok) throw new Error("Failed to load campaign");
      return res.json();
    },
  });
}

export function useSubmissions() {
  const { ready, authenticated } = useAuth();
  const authHeaders = useAuthHeaders();
  return useQuery<{ submissions: Submission[] }>({
    queryKey: ["submissions"],
    // Gated on a verified session: firing this anonymously produced a 401 in the
    // browser console and a "We couldn't load this" panel instead of a sign-in prompt.
    enabled: ready && authenticated,
    /*
     * Poll only while something is actually being reviewed.
     *
     * Review runs on the server after the submit response, so the verdict lands seconds later with
     * nobody watching. Without this the row would sit on "pending" until a manual refresh. The
     * interval switches itself off once nothing is pending, so an idle dashboard is silent.
     */
    refetchInterval: (query) => {
      const submissions = query.state.data?.submissions ?? [];
      const inFlight = submissions.some((s) => s.status === "pending" || s.status === "reviewing");
      return inFlight ? 4000 : false;
    },
    queryFn: async () => {
      const res = await fetch(`/api/submissions`, {
        cache: "no-store",
        headers: await authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load submissions");
      return res.json();
    },
  });
}

export function useLeaderboard() {
  return useQuery<{ leaderboard: LeaderboardEntry[] }>({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const res = await fetch(`/api/leaderboard`);
      if (!res.ok) throw new Error("Failed to load leaderboard");
      return res.json();
    },
  });
}

export function useStats() {
  return useQuery<Stats>({
    queryKey: ["stats"],
    queryFn: async () => {
      const res = await fetch(`/api/stats`);
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
  });
}

export function useCreateSubmission() {
  const qc = useQueryClient();
  const authHeaders = useAuthHeaders();
  return useMutation({
    mutationFn: async (data: {
      campaignId: string;
      postUrl: string;
      platform: Platform;
    }) => {
      const res = await fetch(`/api/submissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        const error = new Error(e.error || "Failed to submit") as Error & {
          code?: string;
        };
        // Carried through so the form can offer the right next step — a social-verification
        // rejection needs a link to Profile, not a retry.
        error.code = e.code;
        throw error;
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["submissions"] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["console"] });
    },
  });
}

/**
 * Opts the signed-in creator into a bag, holding a slot without a link yet.
 *
 * Separate from `useCreateSubmission` because the two are genuinely different acts: this one
 * reserves a place, that one supplies the post. Splitting them is what lets My Submissions
 * show "Link pending" as a real state instead of a submission that silently does not exist.
 */
export function useClaimBag() {
  const qc = useQueryClient();
  const authHeaders = useAuthHeaders();
  return useMutation({
    mutationFn: async (data: { campaignId: string; platform?: Platform }) => {
      const res = await fetch(`/api/submissions/claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Could not opt into this bag");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["submissions"] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["console"] });
    },
  });
}

export function useReview() {
  const qc = useQueryClient();
  const authHeaders = useAuthHeaders();
  return useMutation({
    mutationFn: async (data: { submissionId: string }) => {
      const res = await fetch(`/api/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Review failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["submissions"] });
    },
  });
}

/** Shape returned by `GET|POST /api/auth/session`. */
export interface SessionResponse {
  authenticated: boolean;
  user: {
    id: string;
    privyId: string | null;
    handle: string | null;
    walletAddress: string | null;
    /** Where payouts are sent; null until the user sets one. */
    payoutWallet: string | null;
    avatarColor: string;
    trustScore: number;
    totalEarned: number;
    submissions: number;
    approvals: number;
    onboardingCompleted: boolean;
    createdAt: string;
  };
  wallet: { address: string | null; isEmbedded: boolean };
}

/**
 * The Privy → database handshake, exposed as a query so every screen shares one cache
 * entry. Disabled until a verified session exists, so it never fires anonymously.
 */
export function useSession() {
  const { ready, authenticated, getAccessToken, identityToken } = useAuth();
  return useQuery<SessionResponse>({
    queryKey: ["session"],
    enabled: ready && authenticated,
    queryFn: async () => {
      const token = await getAccessToken();
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          // The identity token is what carries the linked Solana wallet; the access
          // token only identifies the user. Both are sent so the server can verify
          // locally and resolve the wallet without trusting the client.
          ...(identityToken ? { "X-Privy-Identity-Token": identityToken } : {}),
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to load session");
      }
      return res.json();
    },
  });
}
