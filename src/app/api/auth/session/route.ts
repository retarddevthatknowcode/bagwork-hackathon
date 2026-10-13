import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { isServerAuthConfigured } from "@/lib/auth/privy-server";

/**
 * GET | POST /api/auth/session
 *
 * The front door between the browser session and the database. Called by the client
 * after login; returns the freshly-synced `User` row.
 *
 * Status contract:
 *   200 — authenticated, `user` is the database row
 *   401 — no valid Privy credentials on the request
 *   503 — Privy credentials are missing from the environment (deployment problem)
 *   500 — credentials were valid but the sync failed (database problem)
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

async function respond() {
  if (!isServerAuthConfigured()) {
    return NextResponse.json(
      { authenticated: false, error: "auth_not_configured" },
      { status: 503, headers: NO_STORE }
    );
  }

  try {
    const session = await getSessionUser();

    if (!session) {
      return NextResponse.json(
        { authenticated: false, error: "unauthenticated" },
        { status: 401, headers: NO_STORE }
      );
    }

    const { user, identity } = session;

    return NextResponse.json(
      {
        authenticated: true,
        user: {
          id: user.id,
          privyId: user.privyId,
          handle: user.handle,
          walletAddress: user.walletAddress,
          avatarColor: user.avatarColor,
          payoutWallet: user.payoutWallet,
          trustScore: user.trustScore,
          totalEarned: user.totalEarned,
          submissions: user.submissions,
          approvals: user.approvals,
          onboardingCompleted: user.onboardingCompletedAt !== null,
          createdAt: user.createdAt,
        },
        wallet: {
          address: identity.walletAddress,
          isEmbedded: identity.isEmbeddedWallet,
        },
      },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    console.error("[api/auth/session] failed to sync session user", error);
    return NextResponse.json(
      { authenticated: false, error: "session_sync_failed" },
      { status: 500, headers: NO_STORE }
    );
  }
}

export async function GET() {
  return respond();
}

export async function POST() {
  return respond();
}
