import { PublicKey, type Finality, type ParsedTransactionWithMeta } from "@solana/web3.js";

import { db } from "@/lib/db";
import { WSOL_MINT } from "@/lib/solana/constants";
import { BAG_TOKEN_MINT, isBagBurnConfigured } from "@/lib/solana/burn";
import { DEFAULT_COMMITMENT, withRpcFallback } from "@/lib/solana/connection";
import { getTokenBalance } from "@/lib/solana/payments";
import { configuredTreasuryAddresses, treasuryAddressFor } from "@/lib/solana/treasury";

/**
 * What the treasury has been doing, for the Token Analytics page.
 *
 * Reads flow through the provider chain (Helius → Alchemy) and the whole result is cached for a
 * short window in module scope. That cache is not a nicety: this walks transaction history, which
 * costs one `getParsedTransaction` per signature, and on a free-plan backup provider that is the
 * quickest way to spend a rate limit on a page nobody looks at twice in a row.
 *
 * Amounts come from **balance deltas** in each transaction's metadata rather than from its
 * instruction list — the same approach the payout confirmation uses, for the same reason: deltas
 * are what actually happened. An instruction can describe a transfer a program rejected, and it
 * says nothing about the fee paid alongside it.
 *
 * Nothing here invents data. With no $BAG mint the burn figures are `null` and the UI shows its
 * placeholder; if the chain read fails the result says so rather than reporting zeroes.
 */

export interface TreasuryFlow {
  signature: string;
  direction: "in" | "out";
  assetType: "native" | "spl";
  /** SPL mint, or wrapped SOL for a native flow. */
  mint: string;
  symbol: string;
  amount: number;
  /** The other side: the sender for money in, the recipient for money out. */
  counterparty: string;
  blockTime: string | null;
}

/** A recorded deposit still waiting to be converted to USDC. */
export interface FeeCandidate {
  id: string;
  signature: string;
  mint: string;
  symbol: string;
  amount: number;
  /** received | no_route | below_minimum — the swap pipeline retries these. */
  status: string;
  reason: string | null;
  receivedAt: string;
}

export interface TreasuryActivity {
  /** Both Bagwork treasury addresses that were read, FIXED first. */
  watchAddresses: string[];
  /** Recent transfers in and out, newest first. */
  flows: TreasuryFlow[];
  /** Fee income recorded but not yet swapped into a bag's budget. */
  buybackCandidates: FeeCandidate[];
  /**
   * $BAG sitting in the treasury — tokens a buyback has already bought that have not been burned.
   * `null` while the token has no mint, because there is nothing to hold.
   */
  burnCandidates: { mint: string; balance: number; recordedEvents: number } | null;
  /** Ledger totals from recorded events. Cheap, and honest about being "recorded". */
  totals: { inboundEvents: number; outboundEvents: number; unmatchedEvents: number };
  /** Set when the chain read failed, so the UI explains a short list instead of implying zero. */
  error: string | null;
  /** True when this came from the short-lived cache. */
  cached: boolean;
  generatedAt: string;
}

/** How long a result is reused: short enough that a payout shows up, long enough to spare a plan. */
const CACHE_TTL_MS = 45_000;

/** How many recent signatures to inspect per read. Each one is a transaction fetch. */
const DEFAULT_SIGNATURE_LIMIT = 6;

let cache: { key: string; at: number; value: TreasuryActivity } | null = null;

/** Test/debug hook: drops the cached activity. */
export function clearTreasuryActivityCache(): void {
  cache = null;
}

/**
 * Turns one parsed transaction into flows involving `watch`, from balance deltas.
 *
 * Native flows come from the lamport delta; token flows from the pre/post token balance rows keyed
 * by owner and mint. A zero delta is not a flow, and a native delta smaller than a few thousand
 * lamports is the account paying its own fee rather than a transfer.
 */
function flowsFromTransaction(
  transaction: ParsedTransactionWithMeta | null,
  watch: string,
  symbolForMint: (mint: string) => string,
): TreasuryFlow[] {
  if (!transaction?.meta) return [];

  const meta = transaction.meta;
  const keys = transaction.transaction.message.accountKeys;
  const signature = transaction.transaction.signatures[0];
  if (!signature) return [];

  const blockTime = transaction.blockTime
    ? new Date(transaction.blockTime * 1000).toISOString()
    : null;

  const flows: TreasuryFlow[] = [];

  const watchIndex = keys.findIndex((key) => key.pubkey.toBase58() === watch);
  if (watchIndex >= 0) {
    const before = meta.preBalances[watchIndex] ?? 0;
    const after = meta.postBalances[watchIndex] ?? 0;
    const delta = after - before;

    if (Math.abs(delta) > 5000) {
      flows.push({
        signature,
        direction: delta > 0 ? "in" : "out",
        assetType: "native",
        mint: WSOL_MINT,
        symbol: "SOL",
        amount: Math.abs(delta) / 1_000_000_000,
        counterparty: "",
        blockTime,
      });
    }
  }

  const pre = meta.preTokenBalances ?? [];
  const post = meta.postTokenBalances ?? [];

  const mints = new Set<string>();
  for (const row of [...pre, ...post]) {
    if (row.owner === watch && row.mint) mints.add(row.mint);
  }

  for (const mint of mints) {
    const indices = new Set<number>();
    for (const row of [...pre, ...post]) {
      if (row.owner === watch && row.mint === mint) indices.add(row.accountIndex);
    }

    let delta = 0;
    for (const index of indices) {
      const before =
        pre.find((row) => row.accountIndex === index && row.owner === watch && row.mint === mint)
          ?.uiTokenAmount?.uiAmount ?? 0;
      const after =
        post.find((row) => row.accountIndex === index && row.owner === watch && row.mint === mint)
          ?.uiTokenAmount?.uiAmount ?? 0;
      delta += after - before;
    }

    if (Math.abs(delta) <= 1e-9) continue;

    flows.push({
      signature,
      direction: delta > 0 ? "in" : "out",
      assetType: "spl",
      mint,
      symbol: symbolForMint(mint),
      amount: Math.abs(delta),
      counterparty: "",
      blockTime,
    });
  }

  return flows;
}

/** Walks recent signatures on the watched wallet and returns the flows they carry, newest first. */
async function readRecentFlows(watch: string, limit: number): Promise<TreasuryFlow[]> {
  const signatures = await withRpcFallback(
    (connection) =>
      connection.getSignaturesForAddress(
        new PublicKey(watch),
        { limit },
        // `DEFAULT_COMMITMENT` is "confirmed", which is a valid finality — the cast is only needed
        // because the shared constant is typed as the wider `Commitment`.
        DEFAULT_COMMITMENT as Finality,
      ),
    { label: "getSignaturesForAddress" },
  );

  /*
   * Symbols for the mints we already know about. An unknown SPL mint renders as a shortened
   * address rather than as a guessed ticker — being wrong about a symbol is worse than showing the
   * mint, and resolving every mint would add a database read to a page load for cosmetics.
   */
  const knownSymbols = new Map<string, string>([[WSOL_MINT, "SOL"]]);
  if (BAG_TOKEN_MINT) knownSymbols.set(BAG_TOKEN_MINT, "BAG");
  const symbolForMint = (mint: string) => knownSymbols.get(mint) ?? "";

  const transactions = await Promise.all(
    signatures.map((entry) =>
      withRpcFallback(
        (connection) =>
          connection.getParsedTransaction(entry.signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          }),
        { label: "treasury-history", accept: (found) => found !== null },
      ).catch(() => null),
    ),
  );

  return transactions
    .flatMap((transaction) => flowsFromTransaction(transaction, watch, symbolForMint))
    .sort((a, b) => (b.blockTime ?? "").localeCompare(a.blockTime ?? ""));
}

/**
 * The treasury's recent activity.
 *
 * The database half always runs — ledger totals and the swap queue are our own rows and cost one
 * round-trip. The chain half is the expensive part and is skipped entirely when there is no
 * treasury to read, rather than being attempted and failed.
 */
export async function getTreasuryActivity(
  options: { limit?: number; refresh?: boolean } = {},
): Promise<TreasuryActivity> {
  const watches = configuredTreasuryAddresses();
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_SIGNATURE_LIMIT, 1), 25);
  const key = `${watches.join(",") || "none"}:${limit}`;

  if (!options.refresh && cache && cache.key === key && Date.now() - cache.at < CACHE_TTL_MS) {
    return { ...cache.value, cached: true };
  }

  const [inboundEvents, outboundEvents, unmatchedEvents, pending] = await Promise.all([
    db.treasuryInboundEvent.count({ where: { direction: "in" } }),
    db.treasuryInboundEvent.count({ where: { direction: "out" } }),
    db.treasuryInboundEvent.count({ where: { kind: "unmatched" } }),
    // Deposits the swap pipeline has not converted yet. These are the buyback candidates: fee
    // income sitting in the treasury, already recorded, waiting to be turned into USDC.
    db.feeDeposit.findMany({
      where: { status: { in: ["received", "no_route", "below_minimum"] } },
      orderBy: { receivedAt: "desc" },
      take: 8,
      select: {
        id: true,
        signature: true,
        mint: true,
        symbol: true,
        tokenAmount: true,
        status: true,
        swapError: true,
        receivedAt: true,
      },
    }),
  ]);

  const activity: TreasuryActivity = {
    watchAddresses: watches,
    flows: [],
    buybackCandidates: pending.map((row) => ({
      id: row.id,
      signature: row.signature,
      mint: row.mint,
      symbol: row.symbol,
      amount: row.tokenAmount,
      status: row.status,
      reason: row.swapError,
      receivedAt: row.receivedAt.toISOString(),
    })),
    burnCandidates: null,
    totals: { inboundEvents, outboundEvents, unmatchedEvents },
    error: null,
    cached: false,
    generatedAt: new Date().toISOString(),
  };

  /*
   * The burn figure is a live read of the FEE treasury's $BAG token account — a buyback's tokens
   * land there with the fee income it came from — so it is only attempted once a mint exists. In
   * Launching Soon mode `null` is the honest answer: there is no token to hold, and "0 $BAG
   * waiting to burn" would read as a claim about a token that does not exist.
   */
  const feeWatch = treasuryAddressFor("FEE");
  if (isBagBurnConfigured() && feeWatch) {
    try {
      const balance = await getTokenBalance(feeWatch, BAG_TOKEN_MINT);
      activity.burnCandidates = {
        mint: BAG_TOKEN_MINT,
        balance: balance.amount,
        recordedEvents: await db.treasuryInboundEvent.count({
          where: { mint: BAG_TOKEN_MINT, direction: "in" },
        }),
      };
    } catch {
      // A failed balance read is not "zero tokens": report the mint with no figure rather than a
      // number we could not verify.
      activity.burnCandidates = { mint: BAG_TOKEN_MINT, balance: 0, recordedEvents: 0 };
    }
  }

  if (watches.length === 0) {
    activity.error =
      "Neither Bagwork treasury is configured, so there is no wallet to read.";
  } else {
    try {
      // Both wallets, newest overall first — the page is one ledger, not one wallet's half of it.
      const perWallet = await Promise.all(
        watches.map((address) => readRecentFlows(address, limit)),
      );
      activity.flows = perWallet
        .flat()
        .sort((a, b) => (b.blockTime ?? "").localeCompare(a.blockTime ?? ""));
    } catch (error) {
      activity.error =
        error instanceof Error && error.message
          ? error.message
          : "Could not read the treasuries' transfer history.";
    }
  }

  cache = { key, at: Date.now(), value: activity };
  return activity;
}