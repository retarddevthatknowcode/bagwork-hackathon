import { Transaction } from "@solana/web3.js";

import { db } from "@/lib/db";
import { recomputeLeaderboard } from "@/lib/leaderboard";
import {
  campaignBudgetSnapshot,
  releaseCampaignBudget,
  reserveCampaignBudget,
} from "@/lib/payouts/budget";
import { USDC_MINT } from "@/lib/privy/config";
import { creditPayoutRewardsSafely } from "@/lib/profile/rewards";
import { calculateFeeSplit } from "@/lib/solana/burn";
import { WSOL_MINT } from "@/lib/solana/constants";
import { getServerConnection, getSolanaBalanceLamports, withRpcFallback } from "@/lib/solana/connection";
import { confirmPayoutTransfer } from "@/lib/solana/confirm";
import {
  buildPayoutTransaction,
  getTokenBalance,
} from "@/lib/solana/payments";
import { resolvePayoutDestination } from "@/lib/solana/payout-destination";
import {
  treasuryAddressFor,
  treasuryKeypairFor,
  treasuryKindFor,
  type TreasuryKind,
} from "@/lib/solana/treasury";

/**
 * Automatic payouts: the server signs, from the right treasury.
 *
 * The old path asked the publisher's browser to sign a transfer whose source and fee payer were the
 * Bagwork treasury — impossible unless the publisher somehow held the platform's key, which is why
 * it never worked in practice. Payouts are a server obligation now: the moment a submission is
 * approved, this module picks the wallet by campaign type (FIXED for a self-funded bag, FEE for a
 * flywheel), checks it can actually pay, builds, signs, sends, verifies on-chain, and only then
 * marks the submission paid.
 *
 * Privy stays exactly where it belongs: user login, and the publisher's *funding* signature — the
 * one transfer that is genuinely theirs. Nothing here ever reaches a client.
 *
 * The three answers, and what each means for the submission:
 *
 *   - **paid** — confirmed on-chain; a Payout row exists, points and the leaderboard moved.
 *   - **pending** — the transfer is in flight or the chain was unreadable. The submission stays
 *     `approved` with its broadcast signature recorded, and the next pass *confirms* rather than
 *     re-sending, so nothing is ever paid twice.
 *   - **blocked** — a real reason this cannot be paid yet (treasury key unset, wallet migrated,
 *     not enough SOL or token). The submission stays `approved`, the reason is surfaced to the
 *     caller and logged, and the daily sweep retries once the operator tops the wallet up.
 */

export type PayoutSettleOutcome =
  | {
      status: "paid";
      submissionId: string;
      signature: string;
      amount: number;
      fee: number;
      kind: TreasuryKind;
    }
  /** Retryable: in flight, or the chain could not be read. Never re-sends a broadcast transfer. */
  | { status: "pending"; submissionId: string; reason: string }
  /** Not payable as things stand. Stays `approved`; the reason says what to fix. */
  | { status: "blocked"; submissionId: string; reason: string };

/**
 * In-flight guard, per server instance. The cron sweep and an approval can race on the same
 * submission; the Payout row's unique `submissionId` is the durable backstop, this keeps the
 * common case from even building two transactions.
 */
const inFlight = new Set<string>();

/**
 * SOL a treasury needs before an SPL payout is worth attempting: the network fee plus the
 * recipient's token-account rent if they do not hold the token yet, with headroom.
 *
 * This is a rent-and-gas check, not a budget. It answers exactly one question — "can this wallet
 * pay for the transaction it is about to sign?" — and it is not a reserve, is not held back from
 * spend, and bears no relation to whatever balance a fresh deployment happened to be seeded with.
 * How much a wallet holds *above* this line is the wallet's own business, and that balance grows
 * with the fees its coins keep earning.
 *
 * The only limit on a payout is the paying bag's own budget (`lib/payouts/budget.ts`), which scales
 * with those fees. There is no platform-wide spend cap and no seed-derived ceiling anywhere.
 */
const MIN_SPL_GAS_LAMPORTS = 3_000_000;

function short(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * What a payout is denominated in, for records and reasons.
 *
 * A flywheel bag's budget is credited in USDC by the fee loop, so USDC is what it pays — whatever
 * coin the bag is named after. `payoutMint` is where that is recorded, and this is the one place
 * the label is derived from it, so a record and its reason can never disagree.
 */
function payoutSymbol(campaign: {
  payoutMint: string | null;
  project: { tokenSymbol: string };
}): string {
  return campaign.payoutMint === USDC_MINT ? "USDC" : campaign.project.tokenSymbol;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

/**
 * Verifies a broadcast transfer and, only once the chain agrees, writes the payout.
 *
 * Called both right after sending and on a later pass for a submission that already carries a
 * `txSignature` — which is why it never sends anything itself.
 */
async function confirmAndRecord(
  sub: {
    id: string;
    userId: string | null;
    reviewNote: string | null;
    campaign: {
      id: string;
      payoutMint: string | null;
      project: { tokenSymbol: string };
    };
  },
  kind: TreasuryKind,
  signature: string,
  recipient: string,
  mint: string,
  amount: number,
  source: string,
): Promise<PayoutSettleOutcome> {
  const confirmation = await confirmPayoutTransfer({
    signature,
    recipient,
    mint,
    amount,
    // The wallet the funds must have left: this campaign's own treasury, not just any of them.
    source,
  });

  if (confirmation.status === "pending") {
    // Still in flight. The signature is already recorded on the submission, so the next pass
    // confirms rather than re-sending — that is the whole double-pay protection.
    return { status: "pending", submissionId: sub.id, reason: confirmation.reason };
  }

  if (confirmation.status === "failed") {
    // The transfer reverted, so no money moved: hand the budget reservation back, and clear the
    // recorded signature so a later pass may build and send a fresh one.
    await releaseCampaignBudget(sub.campaign.id, amount);
    await db.submission
      .update({ where: { id: sub.id }, data: { txSignature: null } })
      .catch(() => {});
    return {
      status: "blocked",
      submissionId: sub.id,
      reason: `The payout transfer failed on-chain (${confirmation.reason}) The submission stays approved and will be retried.`,
    };
  }

  // Documented split: 5% platform fee, recorded (and deducted nowhere on-chain — the creator
  // receives the gross, the fee is bookkeeping against the treasury's own funds).
  const fee = calculateFeeSplit(amount).platformFee;

  try {
    await db.payout.create({
      data: {
        submissionId: sub.id,
        userId: sub.userId,
        amount,
        token: payoutSymbol(sub.campaign),
        txSignature: signature,
        status: "confirmed",
        // Only written after the chain check above, so this timestamp is a verified one.
        confirmedAt: new Date(),
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Another pass won the race and recorded this payout. Nothing double-paid — the unique
      // index is the durable backstop behind the in-flight guard.
      return {
        status: "blocked",
        submissionId: sub.id,
        reason: "A payout is already recorded for this submission.",
      };
    }
    throw error;
  }

  await db.submission.update({
    where: { id: sub.id },
    data: {
      status: "paid",
      txSignature: signature,
      feeAmount: fee,
      reviewNote: `${sub.reviewNote ?? ""} Paid automatically from the ${kind} treasury.`.trim(),
    },
  });

  // Creator totals, points and the ranking table — the same calls the manual payout path made,
  // so nothing about a creator's profile depends on who pressed the button.
  if (sub.userId) {
    await creditPayoutRewardsSafely(sub.userId, amount, `payout for submission ${sub.id}`);
  }
  const rankedCreators = await recomputeLeaderboard().catch(() => 0);

  console.info("[payouts/settle] paid", {
    submissionId: sub.id,
    kind,
    amount,
    signature,
    rankedCreators,
  });

  return { status: "paid", submissionId: sub.id, signature, amount, fee, kind };
}

/**
 * Pays one approved submission from its campaign's own treasury.
 *
 * Everything that can go wrong has a named answer rather than an exception: the caller (review
 * engine, admin console, cron sweep) puts the outcome straight into its response or report, and a
 * payout that is not sent yet never stops the approval itself from being recorded.
 */
export async function settleApprovedSubmission(
  submissionId: string,
  initiatedBy: "review" | "admin" | "cron",
): Promise<PayoutSettleOutcome> {
  if (inFlight.has(submissionId)) {
    return {
      status: "pending",
      submissionId,
      reason: "Another payout attempt for this submission is already running.",
    };
  }
  inFlight.add(submissionId);

  let broadcast: string | null = null;

  /*
   * The budget reservation this attempt holds, if any.
   *
   * Every path that is known not to have moved money hands it back — in the `catch` below for a
   * failure before broadcast, and inside `confirmAndRecord` for a transfer the chain says reverted.
   * Once a transfer is on the wire the reservation stays standing, because the money may well have
   * left; under-counting the spend is recoverable, over-paying a bag is not.
   */
  let reservation: { campaignId: string; amount: number } | null = null;

  try {
    const sub = await db.submission.findUnique({
      where: { id: submissionId },
      include: {
        campaign: { include: { project: { select: { tokenMint: true, tokenSymbol: true } } } },
        user: { select: { walletAddress: true, payoutWallet: true } },
      },
    });
    if (!sub) {
      return { status: "blocked", submissionId, reason: "Submission not found." };
    }
    if (sub.status === "paid") {
      return { status: "blocked", submissionId, reason: "This submission is already paid." };
    }
    if (sub.status !== "approved") {
      return {
        status: "blocked",
        submissionId,
        reason: `Submission is ${sub.status}, not approved — nothing to pay.`,
      };
    }

    const amount = sub.payoutAmount ?? 0;
    if (amount <= 0) {
      return {
        status: "blocked",
        submissionId,
        reason: "No payout amount has been computed for this submission.",
      };
    }

    const already = await db.payout.findUnique({
      where: { submissionId: sub.id },
      select: { id: true },
    });
    if (already) {
      return {
        status: "blocked",
        submissionId,
        reason: "A payout is already recorded for this submission.",
      };
    }

    // ---- which wallet pays: the campaign's own treasury --------------------------------
    const kind = treasuryKindFor(sub.campaign);
    const keypair = treasuryKeypairFor(kind);
    const source = treasuryAddressFor(kind);
    const keyEnv = kind === "FEE" ? "TREASURY_FEE_PRIVATE_KEY" : "TREASURY_FIXED_PRIVATE_KEY";
    if (!keypair || !source) {
      return {
        status: "blocked",
        submissionId,
        reason: `The ${kind} treasury key is not configured (${keyEnv}), so this payout cannot be signed. Set it in the deployment env and it pays on the next pass.`,
      };
    }
    if (sub.campaign.treasury !== source) {
      return {
        status: "blocked",
        submissionId,
        reason: `This bag pins treasury ${short(sub.campaign.treasury)} but the ${kind} treasury is now ${short(source)} — the wallet holding its funds must be migrated before payouts can be automatic.`,
      };
    }

    const recipient = resolvePayoutDestination(sub.user);
    if (!recipient) {
      return {
        status: "blocked",
        submissionId,
        reason: "The creator has no Solana wallet linked, so there is nowhere to send this payout.",
      };
    }

    /*
     * ---- what this bag pays in ---------------------------------------------------------
     *
     * Not necessarily the project's own token. A launched flywheel bag keeps its coin's identity
     * on the Project (its symbol and name are what the marketplace card renders), while its budget
     * is USDC — the fee loop swaps the coin's fees into USDC before crediting them. Paying in the
     * coin would ask a treasury that no longer holds it for money it does not have, which is
     * exactly the "holds 0 COIN" block this resolves.
     */
    const mint = sub.campaign.payoutMint ?? sub.campaign.project.tokenMint;

    /*
     * A transfer this submission already broadcast but never recorded: confirm it, never re-send.
     * This is what makes a crash between send and record safe rather than a double payment.
     *
     * Deliberately *before* the reservation: an already-broadcast transfer was reserved by the
     * attempt that sent it, and reserving again would charge the bag twice for one payout.
     */
    if (sub.txSignature) {
      return await confirmAndRecord(sub, kind, sub.txSignature, recipient, mint, amount, source);
    }

    /*
     * ---- can this bag afford it? --------------------------------------------------------
     *
     * The business limit, and the whole point of this guard. Every flywheel bag's fees land in one
     * shared FEE treasury, so the wallet's balance proves only that a transfer *could* be signed —
     * it says nothing about whose money it is. `reserveCampaignBudget` is a single conditional
     * UPDATE, so two payouts racing for the same bag cannot both pass; it is the only thing
     * standing between this bag's spending and the next bag's fees.
     */
    const reserved = await reserveCampaignBudget(sub.campaign.id, amount);
    if (!reserved) {
      const snapshot = await campaignBudgetSnapshot(sub.campaign.id);
      const remaining = (snapshot?.remaining ?? 0).toFixed(2);
      const budget = (snapshot?.budget ?? 0).toFixed(2);
      return {
        status: "blocked",
        submissionId,
        reason:
          `This bag is out of budget: $${remaining} of its $${budget} is unspent and this payout ` +
          `is $${amount.toFixed(2)}. A bag pays only from its own budget — the FEE wallet is shared ` +
          `by every flywheel bag, so another bag's fees cannot cover this one. Top this bag up or ` +
          `lower the payout, and it settles on the next pass.`,
      };
    }
    reservation = { campaignId: sub.campaign.id, amount };

    const native = mint === WSOL_MINT;

    // ---- can the wallet actually pay? ----------------------------------------------
    const lamports = await getSolanaBalanceLamports(source).catch(() => null);
    if (lamports === null) {
      return {
        status: "pending",
        submissionId,
        reason: "Could not read the treasury's SOL balance — the payout will be retried.",
      };
    }
    const neededLamports = native ? Math.round(amount * 1e9) + 5_000 : MIN_SPL_GAS_LAMPORTS;
    if (lamports < neededLamports) {
      // Nothing was signed, so the reservation goes back before the reason is reported.
      await releaseCampaignBudget(sub.campaign.id, amount);
      return {
        status: "blocked",
        submissionId,
        reason: `The ${kind} treasury ${short(source)} needs about ${(neededLamports / 1e9).toFixed(4)} SOL ${native ? "to send this payout" : "for transfer fees"} — send SOL to it and this pays out on the next pass.`,
      };
    }

    if (!native) {
      const balance = await getTokenBalance(source, mint).catch(() => null);
      if (balance === null) {
        return {
          status: "pending",
          submissionId,
          reason: "Could not read the treasury's token balance — the payout will be retried.",
        };
      }
      if (balance.amount + 1e-9 < amount) {
        // Nothing was signed, so the reservation goes back before the reason is reported.
        await releaseCampaignBudget(sub.campaign.id, amount);
        return {
          status: "blocked",
          submissionId,
          reason: `The ${kind} treasury holds ${balance.amount} ${payoutSymbol(sub.campaign)} but this payout is ${amount} — top it up and it pays out on the next pass.`,
        };
      }
    }

    // ---- build, sign, send (server-side, with the treasury's own key) --------------
    const built = await buildPayoutTransaction({ treasury: source, recipient, mint, amount });
    const transaction = Transaction.from(Buffer.from(built.transaction, "base64"));
    transaction.sign(keypair);

    const connection = getServerConnection();
    broadcast = await withRpcFallback((conn) =>
      conn.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      }),
    );

    // Recorded the instant the transfer is broadcast: if the process dies before confirmation,
    // the next pass confirms this signature instead of paying a second time.
    await db.submission.update({
      where: { id: sub.id },
      data: { txSignature: broadcast },
    });

    return await confirmAndRecord(sub, kind, broadcast, recipient, mint, amount, source);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "The automatic payout attempt failed";

    // Nothing was broadcast, so nothing moved: give the bag its budget back.
    if (reservation && !broadcast) {
      await releaseCampaignBudget(reservation.campaignId, reservation.amount);
    }

    /*
     * If a transfer was broadcast, the one thing this must not allow is a later pass re-sending
     * it: the signature is written to the submission again here, so the next attempt confirms
     * rather than double-pays.
     */
    if (broadcast) {
      try {
        await db.submission.update({
          where: { id: submissionId },
          data: { txSignature: broadcast },
        });
      } catch {
        // Nothing more can be persisted here; the log below is the operator's lead.
      }
    }

    console.error(`[payouts/settle] attempt failed (initiated by ${initiatedBy})`, {
      submissionId,
      broadcast,
      reason,
    });

    return { status: "pending", submissionId, reason };
  } finally {
    inFlight.delete(submissionId);
  }
}

/**
 * The sweep: every approved submission with an amount due, oldest first.
 *
 * Attempted in sequence on purpose — parallel sends would race the in-flight guard for nothing
 * (the guard is per instance) and would hammer the RPC with confirmations. Blocked rows return
 * fast; they are re-attempted on the next run rather than skipped silently.
 */
export async function settleDuePayouts(limit = 25): Promise<{
  attempted: number;
  paid: number;
  pending: number;
  blocked: number;
  reasons: { submissionId: string; reason: string }[];
}> {
  const due = await db.submission.findMany({
    where: { status: "approved", payoutAmount: { not: null } },
    orderBy: [{ approvedAt: "asc" }, { createdAt: "asc" }],
    take: Math.min(Math.max(limit, 1), 100),
    select: { id: true },
  });

  const report: {
    attempted: number;
    paid: number;
    pending: number;
    blocked: number;
    reasons: { submissionId: string; reason: string }[];
  } = { attempted: due.length, paid: 0, pending: 0, blocked: 0, reasons: [] };

  for (const row of due) {
    const outcome = await settleApprovedSubmission(row.id, "cron");
    if (outcome.status === "paid") report.paid++;
    if (outcome.status === "pending") {
      report.pending++;
      report.reasons.push({ submissionId: row.id, reason: outcome.reason });
    }
    if (outcome.status === "blocked") {
      report.blocked++;
      report.reasons.push({ submissionId: row.id, reason: outcome.reason });
    }
  }

  return report;
}


