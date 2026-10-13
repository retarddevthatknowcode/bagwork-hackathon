import { db } from "@/lib/db";
import { isHeliusConfigured, HELIUS_API_KEY } from "@/lib/helius";
import { feeSwapMinUsd, swapToUsdc } from "@/lib/solana/jupiter";
import { getTokenDecimals } from "@/lib/solana/payments";
import { treasuryAddressFor } from "@/lib/solana/treasury";
import { recordFeeSyncRun } from "@/lib/settings/platform";

/**
 * Fee Redirect: turning a token's trading fees into a bag's budget.
 *
 * The loop this closes is the product's whole point:
 *
 *   trading → fees land in the Bagwork wallet → swapped to USDC → bigger content budget
 *          → more content → more attention → more trading
 *
 * Detection is polling rather than a webhook. Helius *enhanced transactions* return already-parsed
 * `tokenTransfers` (mint, amount, from, to), so one request covers a whole page of history instead
 * of fetching and decoding each transaction ourselves — and unlike a webhook it can be run on
 * demand, which is what makes it testable.
 *
 * Every deposit is recorded before anything is swapped. The tokens are real money that has already
 * left the publisher's control, so a deposit we cannot match or convert is still written down.
 *
 * ---- how the wallet this runs against grows --------------------------------------------
 *
 * The FEE wallet is seeded with a small amount of SOL at deployment so the first swap can pay its
 * own network fees. That seed is bootstrap only: it is not a budget, nothing reserves it, and no
 * code path compares the wallet against it. Every deposit this loop converts adds to the wallet and
 * to a bag's budget, and an operator can send more to the FEE address whenever they like — so what
 * is available to swap is simply "whatever has arrived", with no ceiling attached to the seed.
 *
 * The only limit on spending is per bag: a flywheel bag can never spend more than its own budget,
 * nor another bag's fees (`lib/payouts/budget.ts`). Platform spend intentionally has no dollar cap.
 */

/**
 * The swap floor lives in `feeSwapMinUsd()` (`lib/solana/jupiter.ts`), not here.
 *
 * It has to be enforced by the code that signs the transaction — see the note there — and having a
 * second copy of the number in this file is how the two would drift apart. This module only reports
 * what the floor did (`belowMinimum`), so a row's status and the transaction that was or was not
 * sent can never disagree.
 */

export interface IncomingTransfer {
  signature: string;
  mint: string;
  rawAmount: string;
  tokenAmount: number;
  from: string;
  to: string;
  /** When it landed on-chain, from the chain rather than from when we noticed. */
  receivedAt: Date;
}

interface HeliusTokenTransfer {
  mint?: string;
  tokenAmount?: number;
  fromUserAccount?: string;
  toUserAccount?: string;
}

interface HeliusEnhancedTransaction {
  signature?: string;
  timestamp?: number;
  tokenTransfers?: HeliusTokenTransfer[];
}

/**
 * Reads recent token transfers into `wallet` from Helius.
 *
 * Decimal places are not included in the enhanced response, so `tokenAmount` is already the
 * human-readable value and the raw amount is derived from it where needed.
 */
export async function fetchIncomingTransfers(
  wallet: string,
  limit = 100,
): Promise<IncomingTransfer[]> {
  if (!isHeliusConfigured) {
    throw new Error(
      "Fee detection needs HELIUS_API_KEY — without it there is no way to read the fee wallet's history.",
    );
  }

  const url = new URL(`https://api.helius.xyz/v0/addresses/${wallet}/transactions`);
  url.searchParams.set("api-key", HELIUS_API_KEY);
  url.searchParams.set("limit", String(Math.min(limit, 100)));

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Helius history request failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }

  const transactions = (await res.json()) as HeliusEnhancedTransaction[];
  const out: IncomingTransfer[] = [];

  /*
   * Raw units need the mint's real decimals. Helius reports only human-readable amounts, and the
   * old code multiplied by 1e9 unconditionally — which overstated a 6-decimal token's deposit by
   * 1000× and made its swap fail on "insufficient funds" every single time. Decimals are read once
   * per mint per pass; a mint whose decimals cannot be read at all falls back to 9, which is the
   * old behaviour rather than a new way to lose the deposit.
   */
  const decimalsByMint = new Map<string, number>();

  for (const transaction of transactions) {
    const signature = transaction.signature;
    if (!signature) continue;
    const receivedAt = transaction.timestamp
      ? new Date(transaction.timestamp * 1000)
      : new Date();

    for (const transfer of transaction.tokenTransfers ?? []) {
      // Only what actually arrived: a fee redirect is an inbound transfer, not our own swap.
      if (!transfer.mint || !transfer.toUserAccount) continue;
      if (transfer.toUserAccount !== wallet) continue;
      const tokenAmount = Number(transfer.tokenAmount ?? 0);
      if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) continue;

      let decimals = decimalsByMint.get(transfer.mint);
      if (decimals === undefined) {
        decimals = await getTokenDecimals(transfer.mint).catch(() => 9);
        decimalsByMint.set(transfer.mint, decimals);
      }

      out.push({
        signature,
        mint: transfer.mint,
        rawAmount: String(Math.round(tokenAmount * 10 ** decimals)),
        tokenAmount,
        from: transfer.fromUserAccount ?? "",
        to: transfer.toUserAccount,
        receivedAt,
      });
    }
  }

  return out;
}

/**
 * The bag a given mint's fees belong to.
 *
 * Only bags that explicitly turned Fee Redirect on are eligible, and the oldest wins when a token
 * funds more than one — a deterministic choice, so a deposit is never split or credited twice. An
 * unmatched deposit is kept rather than dropped: the tokens are already ours, and a bag can be set
 * up for that mint later.
 */
export async function resolveCampaignForMint(mint: string) {
  const candidates = await db.campaign.findMany({
    where: {
      feeRedirectEnabled: true,
      feeMint: mint,
      status: { in: ["LIVE", "FILLING"] },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, maxPayout: true },
  });
  return candidates[0] ?? null;
}

export interface FeeSyncReport {
  scanned: number;
  recorded: number;
  alreadySeen: number;
  swapped: number;
  creditedUsdc: number;
  noRoute: number;
  belowMinimum: number;
  unmatched: number;
  failed: number;
  errors: string[];
  /** The swap floor this pass applied, in USD. Reported so the cron's own output states it. */
  swapFloorUsd: number;
}


/**
 * Deposit statuses a later sync should attempt again. See `recordAndProcess`.
 *
 * `failed` is excluded on purpose — see the comment there.
 */
const RETRYABLE_DEPOSIT_STATUSES: readonly string[] = [
  "received",
  "matched",
  "unmatched",
  "no_route",
  "below_minimum",
];

/**
 * Records a deposit and converts it, returning what happened.
 *
 * Two-phase on purpose. The row is written first, so a crash between detection and swap leaves
 * evidence rather than losing the deposit; only then is the swap attempted.
 */
async function recordAndProcess(transfer: IncomingTransfer, report: FeeSyncReport) {
  const existing = await db.feeDeposit.findUnique({
    where: { signature: transfer.signature },
    select: { id: true, status: true, campaignId: true, mint: true },
  });
  if (existing) {
    report.alreadySeen++;
    /*
     * A row that already exists is not necessarily a finished one.
     *
     * The Alchemy webhook records deposits as they land (status `received`) but cannot swap them,
     * and a deposit can sit in `no_route` or `below_minimum` until liquidity or value arrives. The
     * old code returned here unconditionally, which stranded every webhook-recorded deposit in
     * `received` forever and made "retried on a later sync" a comment rather than a behaviour.
     * `failed` is deliberately *not* retried: a swap that threw may have settled on-chain after
     * the error, and re-swapping could spend tokens twice. Everything else gets its attempt here.
     */
    if (RETRYABLE_DEPOSIT_STATUSES.includes(existing.status)) {
      let campaignId = existing.campaignId;
      if (!campaignId) {
        // Arrived before any bag was set up for this mint — match it now that one exists.
        const campaign = await resolveCampaignForMint(existing.mint);
        campaignId = campaign?.id ?? null;
        if (campaignId) {
          await db.feeDeposit.update({
            where: { id: existing.id },
            data: { campaignId, status: "matched" },
          });
        }
      }
      if (campaignId) {
        await swapAndCredit(existing.id, report);
      }
    }
    return;
  }

  const campaign = await resolveCampaignForMint(transfer.mint);

  let depositId: string;
  try {
    const created = await db.feeDeposit.create({
      data: {
        signature: transfer.signature,
        campaignId: campaign?.id ?? null,
        mint: transfer.mint,
        rawAmount: transfer.rawAmount,
        tokenAmount: transfer.tokenAmount,
        fromAddress: transfer.from,
        toAddress: transfer.to,
        status: campaign ? "matched" : "unmatched",
        receivedAt: transfer.receivedAt,
      },
      select: { id: true },
    });
    depositId = created.id;
    report.recorded++;
    if (!campaign) {
      report.unmatched++;
      return;
    }
  } catch {
    // A unique-constraint failure here means another sync created the row between the read and
    // the write. That is the index doing its job, not an error worth surfacing.
    report.alreadySeen++;
    return;
  }

  await swapAndCredit(depositId, report);
}

/**
 * Swaps one deposit and credits the bag it belongs to.
 *
 * The credit only happens after a confirmed swap, so a bag's budget can never be inflated by a
 * swap that did not settle. The trade-off is the safe direction: if the process dies after a swap
 * settles but before the credit is written, the USDC is in the wallet and the row still reads
 * unswapped — a reconciliation can find that, whereas an over-credited bag would silently promise
 * money that is not there.
 */
export async function swapAndCredit(depositId: string, report: FeeSyncReport) {
  const deposit = await db.feeDeposit.findUnique({ where: { id: depositId } });
  if (!deposit || deposit.status === "swapped" || !deposit.campaignId) return;

  // Claim it. `count === 0` means another run already picked it up.
  const claimed = await db.feeDeposit.updateMany({
    where: { id: depositId, status: { not: "swapping" } },
    data: { status: "swapping" },
  });
  if (claimed.count === 0) return;

  const campaign = await db.campaign.findUnique({
    where: { id: deposit.campaignId },
    select: { id: true, maxPayout: true },
  });
  if (!campaign) {
    await db.feeDeposit.update({
      where: { id: depositId },
      data: { status: "unmatched", swapError: "The bag for this mint no longer exists" },
    });
    report.unmatched++;
    return;
  }

  let result: Awaited<ReturnType<typeof swapToUsdc>>;
  try {
    result = await swapToUsdc({ inputMint: deposit.mint, rawAmount: deposit.rawAmount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Swap failed";
    await db.feeDeposit.update({
      where: { id: depositId },
      data: { status: "failed", swapError: message.slice(0, 500) },
    });
    report.failed++;
    report.errors.push(`${deposit.mint}: ${message}`);
    return;
  }

  if ("noRoute" in result) {
    // No pool yet. The tokens stay in the fee wallet and this row is retried on a later sync,
    // which is right for a token whose liquidity has not launched.
    await db.feeDeposit.update({
      where: { id: depositId },
      data: { status: "no_route", swapError: "No swap route to USDC yet" },
    });
    report.noRoute++;
    return;
  }

  /*
   * Under the floor. `swapToUsdc` decides this between the quote and the signed transaction, so by
   * the time we get here nothing has been sent — and this branch is the record, not the fix.
   *
   * The deposit stays in the fee wallet and the row stays retryable, because a retry only costs a
   * quote: a deposit that appreciates past the floor converts on a later pass, and one that never
   * does costs nothing at all. That is the difference between "accumulate and convert when it is
   * worth it" and the previous behaviour, which converted first and checked the value afterwards.
   */
  if ("belowMinimum" in result) {
    const reason =
      `below minimum swap threshold — worth about $${result.outUsdc.toFixed(2)}, floor is ` +
      `$${result.minUsd}. Left unswapped; no transaction was sent.`;
    console.warn(`[fees] ${deposit.mint}: ${reason}`);
    await db.feeDeposit.update({
      where: { id: depositId },
      data: {
        status: "below_minimum",
        swapError: reason,
        /*
         * The quote, kept. The floor was applied to a real Jupiter price, and throwing that away left
         * the UI able to say only "some tokens are waiting" — never "$12.40 is waiting, and $7.60 more
         * triggers the swap". Re-quoted on every pass, so an appreciating token updates the figure.
         */
        estimatedUsdc: result.outUsdc,
      },
    });
    report.belowMinimum++;
    return;
  }

  await db.feeDeposit.update({
    where: { id: depositId },
    data: {
      status: "swapped",
      usdcAmount: result.outUsdc,
      swapSignature: result.signature,
      swappedAt: new Date(),
      swapError: null,
      // The estimate has become a fact, so it does not linger as a second, stale figure.
      estimatedUsdc: null,
    },
  });

  // The budget grows by exactly the USDC that arrived, and slots grow with it — so the bag can
  // carry more creators rather than paying the same ones less.
  const extraSlots =
    campaign.maxPayout > 0 ? Math.floor(result.outUsdc / campaign.maxPayout) : 0;

  await db.campaign.update({
    where: { id: campaign.id },
    data: {
      budget: { increment: result.outUsdc },
      fundedAmount: { increment: result.outUsdc },
      feeRaisedUsdc: { increment: result.outUsdc },
      slotsRemaining: { increment: extraSlots },
    },
  });

  report.swapped++;
  report.creditedUsdc += result.outUsdc;
}

/**
 * Runs one full pass: detect new transfers, record them, swap and credit.
 *
 * Safe to run repeatedly — the unique `signature` index and the status guard make a second pass
 * over the same window a no-op, which is what allows a frequent cron schedule without
 * double-crediting anything.
 *
 * The pass is also recorded (`platform_settings.fee_sync`) so the bag page can say when fees were
 * last looked for. Recording is best-effort and happens *after* the work, so a bookshelf write can
 * never fail a sync that already moved money.
 */
export async function syncFees(limit = 50): Promise<FeeSyncReport> {
  const report = await runSync(limit);

  await recordFeeSyncRun({
    scanned: report.scanned,
    swapped: report.swapped,
    creditedUsdc: Math.round(report.creditedUsdc * 100) / 100,
    belowMinimum: report.belowMinimum,
    floorUsd: report.swapFloorUsd,
    errors: report.errors.slice(0, 5),
  }).catch((error) => {
    console.error("[fees] could not record the sync run", error);
  });

  return report;
}

async function runSync(limit = 50): Promise<FeeSyncReport> {
  const report: FeeSyncReport = {
    scanned: 0,
    recorded: 0,
    alreadySeen: 0,
    swapped: 0,
    creditedUsdc: 0,
    noRoute: 0,
    belowMinimum: 0,
    unmatched: 0,
    failed: 0,
    errors: [],
    // $20 unless the deployment overrode it. Below this a swap costs more than it converts, so the
    // deposit is recorded and left in the wallet instead of being spent into pennies.
    swapFloorUsd: feeSwapMinUsd(),
  };

  // The FEE treasury only. Fees routed to the fixed wallet are the fixed wallet's business —
  // reading its history here would let a publisher's stray deposit become flywheel income.
  const wallet = treasuryAddressFor("FEE");
  if (!wallet) {
    report.errors.push(
      "The Bagwork fee wallet is not configured (TREASURY_FEE_PRIVATE_KEY), so fee detection did not run.",
    );
    return report;
  }

  // Only mints a bag has opted in for are worth swapping. Without this, every airdrop and stray
  // transfer into the wallet would create rows nobody asked for.
  const configured = await db.campaign.findMany({
    where: { feeRedirectEnabled: true, feeMint: { not: null } },
    select: { feeMint: true },
    distinct: ["feeMint"],
  });
  const mints = new Set(configured.map((row) => row.feeMint).filter(Boolean) as string[]);

  const transfers = await fetchIncomingTransfers(wallet, limit);
  // A deposit for a mint no bag has claimed yet is still recorded (as `unmatched`) so nothing that
  // already arrived is invisible; it just is not swapped until a bag exists for it.
  const relevant = mints.size > 0
    ? transfers.filter((transfer) => mints.has(transfer.mint))
    : transfers;
  report.scanned = relevant.length;

  for (const transfer of relevant) {
    await recordAndProcess(transfer, report);
  }

  return report;
}

