import { VersionedTransaction } from "@solana/web3.js";

import { getServerConnection, withRpcFallback } from "./connection";
import { treasuryFeeKeypair } from "./treasury";

/**
 * Swapping redirected trading fees into USDC.
 *
 * Jupiter rather than a hand-rolled pool interaction: routing across every Solana DEX is exactly
 * the problem Jupiter exists to solve, and a self-built single-pool swap would give a fresh
 * launchpad token a bad price — or no route at all.
 *
 * The order is deliberate: **quote, then swap, then send**. The quote is where slippage is
 * bounded, and a deposit that cannot be quoted is one we leave untouched rather than sign blindly.
 *
 * ---- who pays for all this --------------------------------------------------------------
 *
 * The FEE wallet, out of whatever it currently holds. That is the coins' accumulated redirected
 * creator fees plus any operator top-up, seeded with a few dollars of SOL at deployment so the
 * first swap can pay its own network fees at all. The seed is bootstrap money, not a ceiling: no
 * code path reserves it, compares the wallet against it, or refuses to spend past it — a swap and
 * its priority fee simply use the live balance.
 *
 * The floor below is about whether a *conversion* is worth its gas. It is deliberately not a limit
 * on what a bag may spend: that is the per-bag budget in `lib/payouts/budget.ts`, and it grows with
 * the fees the bag's coin keeps earning.
 */

/** USDC — the currency every bag budget and payout is denominated in. */
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/**
 * Jupiter's keyless endpoint by default.
 *
 * Overridable so a rate-limited deployment can move to a keyed plan without a code change, which
 * is the only reason this is not a constant.
 */
function jupiterBase(): string {
  return (
    process.env.JUPITER_API_BASE?.trim().replace(/\/$/, "") ?? "https://lite-api.jup.ag/swap/v1"
  );
}

/** Slippage tolerance in basis points. 100 = 1%. */
function slippageBps(): number {
  const configured = Number(process.env.FEE_SWAP_SLIPPAGE_BPS ?? "");
  return Number.isFinite(configured) && configured > 0 ? configured : 100;
}

/** The shipping default priority-fee ceiling, so callers and copy can name one number. */
export const DEFAULT_FEE_SWAP_PRIORITY_LAMPORTS = 2_000_000;

/**
 * The most a fee swap will bid in priority fees, in lamports. **Default 0.002 SOL.**
 *
 * A ceiling, not an amount: Jupiter bids up to it when the chain is congested and less when it is
 * quiet, so a busy moment does not silently fail to land a swap and a calm one does not overpay.
 *
 * It is a ceiling on a *transaction fee* and nothing else. It does not limit what a bag may spend,
 * it is not drawn from a reserve, and it has no relationship to how the wallet was funded — the
 * swap pays this out of whatever the wallet actually holds, which grows as fees arrive.
 *
 * Overridable with `FEE_SWAP_PRIORITY_LAMPORTS` for a deployment that needs to bid harder than the
 * default to land its swaps. Blank or unparseable falls back to the default rather than to zero,
 * for the same reason `feeSwapMinUsd` does: a mistyped variable must not silently remove the guard.
 */
export function feeSwapPriorityLamports(): number {
  const raw = (process.env.FEE_SWAP_PRIORITY_LAMPORTS ?? "").trim();
  if (!raw) return DEFAULT_FEE_SWAP_PRIORITY_LAMPORTS;

  const configured = Number(raw);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_FEE_SWAP_PRIORITY_LAMPORTS;
}

/** The shipping default floor, so callers and copy can name one number. */
export const DEFAULT_FEE_SWAP_MIN_USD = 20;

/**
 * The smallest swap worth sending, in USD. **Default $20.**
 *
 * A Solana swap is not free: the signature costs a base fee, Jupiter's route needs priority fees to
 * land, and a low-value route can carry enough price impact that the round trip is a loss. Swapping
 * a $0.40 fee deposit therefore burns more SOL than it converts — and because a launchpad coin's
 * early creator fees are individually tiny, doing that on every deposit turns a fee stream into a
 * slow leak.
 *
 * So the threshold is a hard floor, and it is enforced in `swapToUsdc` *between the quote and the
 * signed transaction*: below it, nothing is built, nothing is signed and nothing is sent. Below-min
 * deposits are recorded and left untouched, and are re-quoted on a later sync (a quote is free) so a
 * deposit that appreciates past the floor still converts eventually.
 *
 * Overridable with `FEE_SWAP_MIN_USD`; `0` deliberately disables the floor.
 *
 * Blank is treated as unset, not as zero: `Number("")` is `0`, so the obvious spelling of this
 * function reads an *absent* variable as "swap anything" and silently loses the floor. That is the
 * failure this guard exists to prevent, and it is exactly the state a deployment is in when the
 * variable was never configured.
 */
export function feeSwapMinUsd(): number {
  const raw = (process.env.FEE_SWAP_MIN_USD ?? "").trim();
  if (!raw) return DEFAULT_FEE_SWAP_MIN_USD;

  const configured = Number(raw);
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_FEE_SWAP_MIN_USD;
}

export interface QuoteResult {
  /** The quote object Jupiter expects back when building the swap. */
  quote: Record<string, unknown>;
  /** Raw input units the quote will actually swap (Jupiter may round to a pool tick). */
  inAmount: string;
  /** Raw USDC units expected out. */
  outAmount: string;
  /** Human-readable USDC out, at 6 decimals. */
  outUsdc: number;
  priceImpactPct: number;
}

/**
 * Quotes a swap into USDC.
 *
 * Returns null when there is no route — a brand-new token with no liquidity yet, which is a real
 * and temporary state rather than an error worth failing the whole sync over.
 */
export async function quoteToUsdc({
  inputMint,
  rawAmount,
}: {
  inputMint: string;
  rawAmount: string;
}): Promise<QuoteResult | null> {
  const url = new URL(`${jupiterBase()}/quote`);
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", USDC_MINT);
  url.searchParams.set("amount", rawAmount);
  url.searchParams.set("slippageBps", String(slippageBps()));
  url.searchParams.set("restrictIntermediateTokens", "true");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    // A 400 "no route" is the common, expected case for a token with no pool yet.
    if (res.status === 400 || res.status === 422) return null;
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Jupiter quote failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }

  const quote = (await res.json()) as Record<string, unknown>;
  const outAmount = String(quote.outAmount ?? "0");

  return {
    quote,
    inAmount: String(quote.inAmount ?? rawAmount),
    outAmount,
    outUsdc: Number(outAmount) / 1e6,
    priceImpactPct: Number(quote.priceImpactPct ?? 0),
  };
}

export interface SwapResult {
  signature: string;
  /** Raw USDC received, taken from the quote that was executed. */
  outAmount: string;
  outUsdc: number;
}

/**
 * Executes a quoted swap from the Bagwork fee wallet.
 *
 * Signs with the FEE treasury key, which *is* the fee wallet — the same key that later pays flywheel
 * creators out of the swapped USDC, so there is no intermediate transfer and no second failure mode.
 * Never the fixed treasury's key: swapping publisher budgets into a flywheel is the one mixing the
 * dual-treasury split exists to prevent.
 *
 * Three outcomes, and the order they are decided in is the whole point:
 *
 *   1. **no route** — the quote 400s, which is a normal state for a token with no pool yet.
 *   2. **below minimum** — the quote succeeded but is worth less than `feeSwapMinUsd()`. Returned
 *      *before* `/swap` is called, so no transaction is built, signed or sent. This used to be
 *      checked by the caller *after* this function had already broadcast, which meant every
 *      sub-dollar fee deposit paid a real signature fee to convert into pennies.
 *   3. **swapped** — quoted, built, signed, sent and confirmed.
 *
 * Nothing is signed until a quote exists, so an unroutable token can never burn a fee on a
 * transaction that was always going to fail.
 */
export async function swapToUsdc({
  inputMint,
  rawAmount,
  minUsd,
}: {
  inputMint: string;
  rawAmount: string;
  /** Floor override, for a caller that knows better than the deployment default. */
  minUsd?: number;
}): Promise<SwapResult | { noRoute: true } | { belowMinimum: true; outUsdc: number; minUsd: number }> {
  const keypair = treasuryFeeKeypair();
  if (!keypair) {
    throw new Error(
      "The Bagwork fee wallet is not configured, so fees cannot be swapped. Set TREASURY_FEE_PRIVATE_KEY.",
    );
  }

  const quoted = await quoteToUsdc({ inputMint, rawAmount });
  if (!quoted) return { noRoute: true };

  const minimum = minUsd ?? feeSwapMinUsd();
  if (quoted.outUsdc < minimum) {
    // The floor, applied where it can actually save money: nothing below this is signed.
    return { belowMinimum: true, outUsdc: quoted.outUsdc, minUsd: minimum };
  }

  const res = await fetch(`${jupiterBase()}/swap`, {

    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quoted.quote,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          // A ceiling the swap bids up to under congestion — not a fixed amount, and not a budget.
          maxLamports: feeSwapPriorityLamports(),
          priorityLevel: "medium",
        },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Jupiter swap failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }

  const { swapTransaction } = (await res.json()) as { swapTransaction?: string };
  if (!swapTransaction) throw new Error("Jupiter returned no swap transaction");

  const transaction = VersionedTransaction.deserialize(
    new Uint8Array(Buffer.from(swapTransaction, "base64")),
  );
  transaction.sign([keypair]);

  const connection = getServerConnection();
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  // Confirmed before the USDC is treated as received. The budget is only increased once the swap
  // settled, so a swap that failed on-chain can never inflate a bag.
  const latest = await withRpcFallback((conn) => conn.getLatestBlockhash("confirmed"));
  const confirmation = await connection.confirmTransaction(
    { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
    "confirmed",
  );
  if (confirmation.value.err) {
    throw new Error(
      `Swap transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`,
    );
  }

  return { signature, outAmount: quoted.outAmount, outUsdc: quoted.outUsdc };
}

/** True when the fee wallet can pay for its own transactions. */
export function isFeeWalletConfigured(): boolean {
  return treasuryFeeKeypair() !== null;
}

