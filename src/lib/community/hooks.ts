"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/components/auth/auth-provider";

import type {
  CommunityDetailPayload,
  CommunityIndexPayload,
  CommunityMessageDto,
} from "./mappers";

/**
 * A community request that failed, with the status kept.
 *
 * The status matters here in a way it usually does not: a **403** on a community is not an error
 * state, it is the answer — "you have not joined this bag" — and the page renders a join prompt
 * for it rather than a generic failure. `campaignId` comes back on that response so the prompt
 * can name the bag.
 */
export class CommunityApiError extends Error {
  readonly status: number;
  /** Set on a 403: the bag whose membership would grant access. */
  readonly campaignId?: string;
  /** Set on a 404: whether the signed-in user is the one who could open a community here. */
  readonly canCreate: boolean;
  /** Set on a 404: the bag's title, so the page can name it without a second request. */
  readonly campaignTitle?: string;

  constructor(
    message: string,
    status: number,
    details: { campaignId?: string; canCreate?: boolean; campaignTitle?: string } = {},
  ) {
    super(message);
    this.name = "CommunityApiError";
    this.status = status;
    this.campaignId = details.campaignId;
    this.canCreate = details.canCreate === true;
    this.campaignTitle = details.campaignTitle;
  }
}

/**
 * Privy credentials for our own API routes.
 *
 * Same contract as `lib/console/hooks`: the access token identifies the user, the identity token
 * carries the linked wallet. Duplicated rather than imported because those helpers are private to
 * that module, and exporting them would make the console's internals a dependency of this feature.
 */
function useAuthedHeaders() {
  const { getAccessToken, identityToken } = useAuth();

  return useCallback(async (): Promise<Record<string, string>> => {
    const token = await getAccessToken();
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(identityToken ? { "X-Privy-Identity-Token": identityToken } : {}),
    };
  }, [getAccessToken, identityToken]);
}

/** One authed JSON call, throwing `CommunityApiError` so callers can branch on the status. */
async function call<T>(
  url: string,
  headers: Record<string, string>,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { ...headers, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      campaignId?: string | null;
      canCreate?: boolean;
      campaignTitle?: string | null;
    };
    throw new CommunityApiError(body.error || `Request failed (${res.status})`, res.status, {
      campaignId: body.campaignId ?? undefined,
      canCreate: body.canCreate,
      campaignTitle: body.campaignTitle ?? undefined,
    });
  }
  return (await res.json()) as T;
}

/** Every community, flagged with whether the signed-in user can open it. */
export function useCommunityIndex() {
  const authedHeaders = useAuthedHeaders();
  const { ready, authenticated } = useAuth();

  return useQuery<CommunityIndexPayload, CommunityApiError>({
    queryKey: ["community", "index"],
    enabled: ready && authenticated,
    queryFn: async () => call<CommunityIndexPayload>("/api/community", await authedHeaders()),
  });
}

/**
 * One community, by community id **or** campaign id.
 *
 * `retry: false` on purpose: a 403 is a settled answer, and retrying it three times just delays
 * the join prompt while the user waits for a spinner that will never resolve.
 */
export function useCommunity(ref: string | null) {
  const authedHeaders = useAuthedHeaders();
  const { ready, authenticated } = useAuth();

  return useQuery<CommunityDetailPayload, CommunityApiError>({
    queryKey: ["community", ref],
    enabled: ready && authenticated && Boolean(ref),
    retry: false,
    queryFn: async () =>
      call<CommunityDetailPayload>(`/api/community/${ref}`, await authedHeaders()),
  });
}

/** Open a community for a bag the signed-in user published. */
export function useCreateCommunity() {
  const qc = useQueryClient();
  const authedHeaders = useAuthedHeaders();

  return useMutation<
    { community: { id: string } },
    CommunityApiError,
    { campaignId: string; title?: string }
  >({
    mutationFn: async (input) =>
      call<{ community: { id: string } }>("/api/community", await authedHeaders(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community"] });
      qc.invalidateQueries({ queryKey: ["console"] });
    },
  });
}

/** Post an announcement. The server rejects this for anyone but the admin. */
export function usePostCommunityMessage(ref: string) {
  const qc = useQueryClient();
  const authedHeaders = useAuthedHeaders();

  return useMutation<
    { message: CommunityMessageDto },
    CommunityApiError,
    { body: string; imageUrl?: string | null }
  >({
    mutationFn: async (input) =>
      call<{ message: CommunityMessageDto }>(
        `/api/community/${ref}/messages`,
        await authedHeaders(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community", ref] });
      qc.invalidateQueries({ queryKey: ["community", "index"] });
    },
  });
}

/** Pin or unpin a message. Admin only, enforced server-side. */
export function usePinCommunityMessage(ref: string) {
  const qc = useQueryClient();
  const authedHeaders = useAuthedHeaders();

  return useMutation<
    { ok: boolean },
    CommunityApiError,
    { messageId: string; isPinned: boolean }
  >({
    mutationFn: async ({ messageId, isPinned }) =>
      call<{ ok: boolean }>(
        `/api/community/${ref}/messages/${messageId}`,
        await authedHeaders(),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPinned }),
        },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community", ref] }),
  });
}

/** Delete a message — allowed for its author, and for the admin. */
export function useDeleteCommunityMessage(ref: string) {
  const qc = useQueryClient();
  const authedHeaders = useAuthedHeaders();

  return useMutation<{ ok: boolean }, CommunityApiError, { messageId: string }>({
    mutationFn: async ({ messageId }) =>
      call<{ ok: boolean }>(
        `/api/community/${ref}/messages/${messageId}`,
        await authedHeaders(),
        { method: "DELETE" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community", ref] });
      qc.invalidateQueries({ queryKey: ["community", "index"] });
    },
  });
}

