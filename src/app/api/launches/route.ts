import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activateLaunchedBag, reserveBagForLaunch } from "@/lib/launch/bag";
import { verifyLaunch } from "@/lib/launch/verify";
import { readLaunchDraft } from "@/lib/launch/wizard";
import { mapCampaign } from "@/lib/mappers";
import { logApiFailure } from "@/lib/ops/log";
import {
  getServerConnection,
  isValidSolanaAddress,
  isValidTxSignature,
  withRpcFallback,
} from "@/lib/solana/connection";

export const dynamic = "force-dynamic";

/**
 * POST /api/launches — record a signed launch, verify it on-chain, and create its bag.
 *
 * This is the gate between "transactions were signed" and "a bag exists". It runs after the wallet
 * broadcasts, and it does exactly one thing that matters: **it does not take the launcher's word for
 * anything**. Two signatures are required — the coin and the fee lock are separate transactions,
 * because together they do not fit in a packet — but the evidence is the chain. Both are read back,
 * and the coin's sharing config is checked to hold 100% of creator fees in the Bagwork FEE treasury,
 * permanently. Only then is a bag created.
 *
 * The order is deliberate. A launch reserves its bag before the launcher signs — the coin's metadata
 * has to name the bag's own page, so the id must exist first — but that reservation is DRAFT, which
 * no listing shows. Nothing a creator can act on appears until the thing that funds it is proven to
 * exist: the bag opens, and appears in the marketplace, only after the sharing config has been read
 * back and checked to hold 100% of creator fees in the Bagwork FEE treasury, permanently.
 *
 * A failed verification leaves the launch row `failed` with the reason on it and the reserved bag
 * still DRAFT — invisible, and never a bag advertising a budget that will not arrive.
 *
 * The two-step launch produces one state worth naming: the coin created and the fee lock failed. The
 * response says so explicitly (`coinCreated`, `feeLockFailed`) rather than collapsing it into
 * "launch failed", because it is recoverable — the lock can be retried against the same coin — and
 * because a launcher looking at a live coin and an error message deserves to know which is true.
 */
export async function POST(req: NextRequest) {
  /*
   * The handler is wrapped, and that is the point.
   *
   * By the time this route runs, the launcher has already signed and paid: the coin exists, the fee
   * lock is on-chain, and there is real money behind it. So an unhandled throw here is not a failed
   * request — it is a *lost launch*. Without this wrapper it became Next's HTML 500, the client's
   * `res.json()` produced nothing, and the wizard showed "Could not verify the launch": no reason,
   * no recovery, and a coin that already existed.
   *
   * Every failure below now leaves as JSON with a reason, and the ones that are worth retrying say
   * so. `retryable` matters because none of these are destructive — this route never re-creates a
   * mint, so running it again is always safe.
   */
  try {
    return await handleLaunchVerification(req);
  } catch (error) {
    await logApiFailure(req, {
      category: "launch",
      title: "Launch verification failed",
      error,
    });
    console.error("[api/launches] verification failed", error);

    return NextResponse.json(
      {
        error:
          "Something went wrong while confirming your launch on-chain. Your coin is safe and no " +
          "second one will be created — retrying finishes the same launch.",
        retryable: true,
      },
      { status: 500 },
    );
  }
}

async function handleLaunchVerification(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const launchId = String(body.launchId ?? "").trim();
  const signature = String(body.signature ?? "").trim();
  const feeShareSignature = String(body.feeShareSignature ?? "").trim();
  if (!launchId) {
    return NextResponse.json({ error: "launchId is required" }, { status: 400 });
  }
  if (!isValidTxSignature(signature)) {
    // Without a real signature there is nothing to verify, and a launch may not be marked verified
    // on the strength of a request body.
    return NextResponse.json(
      { error: "The coin-creation transaction signature is required." },
      { status: 400 },
    );
  }
  if (!isValidTxSignature(feeShareSignature)) {
    /*
     * Two signatures because the launch is two transactions. A missing second one means the fee lock
     * was never sent, and a coin whose fees are not locked cannot become a bag — the whole promise of
     * the bag is that its budget comes from those fees.
     */
    return NextResponse.json(
      {
        error:
          "The fee-lock transaction has not been sent, so there is nothing to verify. The coin step " +
          "may have completed — retry the fee lock.",
      },
      { status: 400 },
    );
  }

  const launch = await db.launch.findUnique({
    where: { id: launchId },
    select: {
      id: true,
      mint: true,
      status: true,
      bagId: true,
      treasury: true,
      feeShareBps: true,
      adminRevoked: true,
      launcherUserId: true,
    },
  });
  if (!launch) {
    return NextResponse.json({ error: "Launch not found" }, { status: 404 });
  }
  // Only the launcher may complete their own launch — and only against the treasury this deployment
  // locked to, never one supplied by the request.
  if (launch.launcherUserId && launch.launcherUserId !== session.user.id) {
    return NextResponse.json({ error: "This launch belongs to another account" }, { status: 403 });
  }

  /*
   * Already done — answer with the same success, not by doing it again.
   *
   * The wizard polls this route, and a response can be lost after the work was committed (a dropped
   * connection, a tab closed a second too early). Everything below re-derives state from a chain that
   * has not changed, and the bag is already LIVE, so the only correct answer is the one the first
   * call would have given. This is what makes the route safe to retry by hand as well.
   */
  if (launch.status === "verified" && launch.bagId) {
    const existing = await db.campaign.findUniqueOrThrow({
      where: { id: launch.bagId },
      include: { project: true },
    });
    return NextResponse.json({
      launchId: launch.id,
      mint: launch.mint,
      campaign: mapCampaign(existing, { submissionsCount: 0, spent: 0 }),
      feeLock: {
        treasury: launch.treasury,
        shareBps: launch.feeShareBps,
        adminRevoked: launch.adminRevoked,
      },
      alreadyVerified: true,
    });
  }

  // Re-validated on the way out as well as the way in: the bag's rules are user input, and they are
  // being turned into a public campaign, so they go through the same authoring rules a hand-made bag
  // does rather than being trusted because the client sent them twice.
  const parsed = readLaunchDraft(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const draft = parsed.draft;

  /**
   * Confirm the transaction actually landed before reading anything off the chain.
   *
   * Two reasons this comes first. It separates *"not confirmed yet"* — a few seconds of normal lag
   * after broadcast, which the caller must retry — from a genuine failure, which it must not. And it
   * refuses to treat a reverted transaction as a launch: a transaction that failed on-chain leaves
   * no sharing config, so the check below would catch it anyway, but with a message about fees rather
   * than the truth, which is that the launch transaction itself failed.
   */
  /*
   * Both transactions are read off the chain, in order, because the two ways this can be half-done
   * need different answers. A create that has not confirmed is a launch still in progress. A create
   * that landed while the fee lock did not is a coin that exists with its creator fees unlocked — a
   * real, recoverable state the launcher has to be told about plainly, and one that must never be
   * turned into a bag.
   */
  const created = await chainOutcome(signature);
  if (created === "pending") {
    return NextResponse.json(
      {
        error:
          "The coin transaction has not confirmed yet. It is on its way — this will finish on its own.",
        // The wizard polls on this, exactly as the fixed-budget funding flow does.
        retryable: true,
      },
      { status: 409 },
    );
  }

  if (created === "failed") {
    await db.launch.update({
      where: { id: launch.id },
      data: {
        status: "failed",
        error: "The coin-creation transaction failed on-chain.",
        signature,
      },
    });
    return NextResponse.json(
      { error: "The coin-creation transaction failed on-chain, so no coin was created." },
      { status: 422 },
    );
  }

  const locked = await chainOutcome(feeShareSignature);
  if (locked === "pending") {
    return NextResponse.json(
      {
        error:
          "The coin was created, but the fee-lock transaction has not confirmed yet. It is on its " +
          "way — this will finish on its own.",
        retryable: true,
      },
      { status: 409 },
    );
  }

  if (locked === "failed") {
    /*
     * The half-done launch, stated as what it is.
     *
     * The coin exists and trades, but its creator fees still accrue to the launcher's own wallet
     * rather than to Bagwork, because the share write never landed. No bag is created — one built
     * here would advertise a fee-funded budget while receiving nothing, which is a lie told to every
     * creator who works for it.
     *
     * Nothing is lost either, and that is what the message has to convey: the sharing config was
     * either never created or is still editable, so the lock can be retried against the same coin
     * rather than stranding it. `coinCreated` and `feeLockFailed` are separate flags so the wizard can
     * put up the retry affordance instead of the generic error it shows for a build that never made a
     * coin at all.
     */
    await db.launch.update({
      where: { id: launch.id },
      data: {
        status: "failed",
        error:
          "The coin was created, but locking its creator fees failed on-chain, so its fees are not " +
          "routed to Bagwork yet.",
        signature,
      },
    });
    return NextResponse.json(
      {
        error:
          `Your coin was created, but the fee lock did not go through, so it is not earning this bag ` +
          `anything yet. Nothing is lost — the coin is live and its fees are still unlocked, so the ` +
          `lock can be retried. Finish the launch to try again.`,
        coinCreated: true,
        feeLockFailed: true,
      },
      { status: 422 },
    );
  }

  /*
   * The dev buy is checked, not assumed.
   *
   * A wallet handing back a signature means the transaction was *sent*, and `commitment: "confirmed"`
   * means it was seen on-chain — neither means it succeeded. A buy that reverted (most often simply
   * not enough SOL for the buy on top of the create and its rent) would otherwise be reported as a
   * complete launch, with the launcher believing they now hold some of their own coin.
   *
   * A warning rather than a failure: the bag is funded by the coin's fees, so a missing dev buy does
   * not make the launch wrong — but it is money the launcher expected to spend and did not, so it is
   * said out loud rather than left for them to discover in their wallet.
   */
  const devBuySignature = String(body.devBuySignature ?? "").trim();
  const devBuyFailed =
    isValidTxSignature(devBuySignature) && (await chainOutcome(devBuySignature)) === "failed";

  /*
   * The treasury this coin was locked to — taken from the launch row, not from the environment.
   *
   * The row pins `treasury` when the launch is built, precisely so the record of what the shares were
   * set to cannot drift from the wallet that receives them. Comparing the chain against the
   * *current* deployment address instead meant a correctly locked coin was rejected the moment that
   * address changed or differed between deployments — a real, fully-locked launch reported as
   * "fees are locked to <address>, not to the Bagwork fee treasury" when it was locked to exactly
   * the treasury its own record names. (A bag whose pinned treasury is no longer the deployment's
   * live one is a separate problem, and `settle.ts` already refuses to pay out of it until the
   * wallet is migrated.)
   */
  const expectedTreasury = launch.treasury;
  if (!isValidSolanaAddress(expectedTreasury)) {
    return NextResponse.json(
      { error: "This launch has no treasury recorded, so its fee lock cannot be checked." },
      { status: 503 },
    );
  }

  const connection = getServerConnection();
  const verification = await verifyLaunch({
    connection,
    mint: launch.mint,
    treasury: expectedTreasury,
  });

  if (!verification.ok) {
    /*
     * A chain that could not be read is not a failed launch.
     *
     * This is the one refusal that is worth retrying rather than acting on: the coin may be
     * perfectly locked and the RPC simply unreachable. Telling the launcher their launch failed
     * because a provider had a bad minute is how a good coin ends up abandoned.
     */
    if (verification.transient) {
      return NextResponse.json({ error: verification.error, retryable: true }, { status: 503 });
    }

    await db.launch.update({
      where: { id: launch.id },
      data: {
        status: "failed",
        error: verification.error,
        signature,
        feeShareBps: verification.feeShareBps,
        adminRevoked: verification.adminRevoked,
      },
    });
    return NextResponse.json({ error: verification.error }, { status: 422 });
  }

  /*
   * The bag already exists: it was reserved before the launcher signed anything, because its page
   * had to be named in the coin's metadata. So this step opens it rather than creating it — LIVE,
   * with the share the chain has just reported.
   *
   * The `bagId === null` branch covers a launch row written before reservations existed and still
   * `pending` when this deployed. It reserves and opens in one pass, so an in-flight launch is not
   * stranded by the change.
   */
  const reservedBagId =
    launch.bagId ??
    (
      await reserveBagForLaunch({
        launcherUserId: session.user.id,
        mint: launch.mint,
        treasury: expectedTreasury,
        draft,
      })
    ).id;

  const campaign = await activateLaunchedBag({
    campaignId: reservedBagId,
    launcherUserId: session.user.id,
    // 100% — the same number just read off the chain, stored rather than asserted.
    feeRedirectPct: verification.feeShareBps / 100,
  });

  await db.launch.update({
    where: { id: launch.id },
    data: {
      status: "verified",
      error: null,
      signature,
      bagId: campaign.id,
      feeShareBps: verification.feeShareBps,
      adminRevoked: verification.adminRevoked,
      verifiedAt: new Date(),
    },
  });

  return NextResponse.json({
    launchId: launch.id,
    mint: launch.mint,
    /*
     * Where the bag is. Returned explicitly as well as inside `campaign`, so the client never has to
     * derive the destination from a nested object — a launch that succeeded must be able to redirect
     * even if the mapping of the campaign changes underneath it.
     */
    campaignId: campaign.id,
    redirectUrl: `/dashboard/bags/${campaign.id}`,
    // Surfaced so the wizard can say so. See the note where it is computed.
    ...(devBuyFailed ? { devBuyFailed: true } : {}),
    campaign: mapCampaign(campaign, { submissionsCount: 0, spent: 0 }),
    feeLock: {
      treasury: expectedTreasury,
      shareBps: verification.feeShareBps,
      adminRevoked: verification.adminRevoked,
    },
  });
}

/**
 * Where a signature is, in the three states that need different answers.
 *
 * `withRpcFallback` throws when every provider fails, and a thrown read is not evidence of anything —
 * so it flattens to `pending`, which asks the caller to look again rather than to declare a failure.
 * Reading a not-yet-visible transaction is the normal case seconds after a broadcast, which is why
 * `pending` is the only state the wizard retries.
 */
async function chainOutcome(signature: string): Promise<"pending" | "confirmed" | "failed"> {
  const transaction = await withRpcFallback((conn) =>
    conn.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    }),
  ).catch(() => null);

  if (!transaction) return "pending";
  return transaction.meta?.err ? "failed" : "confirmed";
}
