import { PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import { createBurnInstruction, getAssociatedTokenAddress } from "@solana/spl-token";

import { getServerConnection, isValidSolanaAddress } from "./connection";

/**
 * $BAG buyback-and-burn primitives, plus the platform fee split.
 *
 * The split mirrors what the product documents say, so the maths lives in one place and
 * can be asserted in tests rather than re-derived in a route:
 *
 *   every campaign pays a 5% platform fee
 *     -> 2.5% to the platform treasury
 *     -> 2.5% used to buy $BAG on the open market and burn it
 *
 * As with `payments.ts`, nothing here signs: it builds instructions for the client to
 * sign with the user's Privy wallet.
 */

/** 5.00% platform fee, expressed in basis points (1 bps = 0.01%). */
export const PLATFORM_FEE_BPS = 500;

/** 2.50% of gross to the treasury. */
export const TREASURY_SHARE_BPS = 250;

/** 2.50% of gross to the buyback-and-burn. */
export const BURN_SHARE_BPS = 250;

export const BPS_DENOMINATOR = 10_000;

/**
 * Addresses that are known NOT to be $BAG: throwaway mints used to exercise the token surfaces
 * (Token Analytics, the buyback ledger) against a real address before launch.
 *
 * They are refused here rather than filtered wherever they are displayed, because "this is $BAG" is
 * a claim every consumer makes from this one value — the analytics page, the fee ledger, the inbound
 * fee matcher and the burn flow itself. A stand-in reaching any of them means the product is calling
 * a stranger's token its own, and the honest answer to a stand-in is "no token yet", which is exactly
 * what an empty mint already means everywhere downstream.
 *
 * The real $BAG mint must never be listed here. A future test mint goes in this set, not in the
 * environment.
 */
const STAND_IN_MINTS = new Set<string>(["9aqmJjCnnMQv42TXLk921ceUkN35nea2QP969n1caqjj"]);

/**
 * The configured mint, with any known stand-in resolved to empty.
 *
 * Warns once at module load when a stand-in is configured, because silently ignoring a value
 * somebody set in a dashboard is how a misconfiguration survives a launch: the app would look
 * correctly pre-launch while the environment still claimed otherwise.
 */
function resolveBagTokenMint(): string {
  const configured = (process.env.BAG_TOKEN_MINT ?? "").trim();
  if (!STAND_IN_MINTS.has(configured)) return configured;

  console.warn(
    "[bagwork] BAG_TOKEN_MINT is set to a known stand-in mint, not $BAG, and is being ignored. " +
      "Clear it in the environment to run pre-launch, or set the real $BAG mint.",
  );
  return "";
}

/**
 * $BAG mint address. Read from the environment rather than hardcoded — inventing a mint
 * would mean burning the wrong token, and the app is expected to run on devnet before
 * mainnet.
 */
export const BAG_TOKEN_MINT = resolveBagTokenMint();

/** True once a real $BAG mint is configured; burn flows stay disabled until then. */
export function isBagBurnConfigured(): boolean {
  return isValidSolanaAddress(BAG_TOKEN_MINT);
}

export interface FeeSplit {
  /** Gross amount being charged (any unit — token amount or lamports). */
  gross: number;
  /** Total platform fee (5%). */
  platformFee: number;
  /** Portion routed to the treasury (2.5%). */
  treasury: number;
  /** Portion used for the buyback-and-burn (2.5%). */
  burn: number;
  /** What the creator keeps after the fee. */
  net: number;
}

/** Rounds to whole cents — the unit the database stores and the UI shows. */
function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Splits a gross amount into fee, treasury, burn and net.
 *
 * Rounded to **cents**, not floored to whole units. The original floored each part, which
 * silently destroyed fees on small payouts: a $42.50 payout was charged $2.00 instead of
 * $2.13, and anything under $20 rounded to a **zero** platform fee — the smaller the
 * creator's payout, the larger the share of the fee the platform simply never collected.
 *
 * `burn` is derived by subtraction from the fee rather than computed independently, so
 * `treasury + burn === platformFee` exactly and no cent is ever created or lost. On an odd
 * number of cents (a $42.50 payout → $2.13 fee) the extra cent goes to the burn, which is
 * the side that benefits the token rather than the operator.
 * `net` is derived the same way, so the parts always add back up to the gross.
 */
export function calculateFeeSplit(gross: number): FeeSplit {
  if (!Number.isFinite(gross) || gross < 0) {
    throw new Error(`Fee split requires a non-negative amount, got ${gross}`);
  }

  const platformFee = toCents((gross * PLATFORM_FEE_BPS) / BPS_DENOMINATOR);
  const treasury = toCents((gross * TREASURY_SHARE_BPS) / BPS_DENOMINATOR);
  const burn = toCents(platformFee - treasury);

  return { gross, platformFee, treasury, burn, net: toCents(gross - platformFee) };
}

export interface BurnParams {
  /** Wallet holding the $BAG being burned (the platform treasury or a buyback account). */
  owner: string;
  /** UI amount of $BAG to burn (e.g. 1500.5). */
  amount: number;
  /** Optional mint override; defaults to the configured $BAG mint. */
  mint?: string;
}

/**
 * Builds (does not sign) a burn instruction for $BAG.
 *
 * Burning reduces the token account's balance and the mint's total supply, so this is
 * irreversible by design — the caller is responsible for confirming the amount.
 */
export async function buildBagBurnInstruction({
  owner,
  amount,
  mint = BAG_TOKEN_MINT,
}: BurnParams): Promise<TransactionInstruction> {
  if (!isBagBurnConfigured() && !mint) {
    throw new Error(
      "BAG_TOKEN_MINT is not configured — set it in .env.local before burning $BAG."
    );
  }
  if (!isValidSolanaAddress(mint)) {
    throw new Error(`Invalid $BAG mint address: ${mint || "(empty)"}`);
  }
  if (!isValidSolanaAddress(owner)) {
    throw new Error(`Invalid burn owner address: ${owner || "(empty)"}`);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Burn amount must be positive, got ${amount}`);
  }

  const mintKey = new PublicKey(mint);
  const ownerKey = new PublicKey(owner);

  // Burn instructions operate on the owner's associated token account.
  const account = await getAssociatedTokenAddress(mintKey, ownerKey);

  return createBurnInstruction(account, mintKey, ownerKey, amount);
}

/** Wraps {@link buildBagBurnInstruction} in a transaction, ready for the client to sign. */
export async function buildBagBurnTransaction(params: BurnParams): Promise<Transaction> {
  return new Transaction().add(await buildBagBurnInstruction(params));
}

/**
 * What the buyback step should purchase: the platform's share of a campaign's fee,
 * denominated in the campaign's own currency and intended to be swapped for $BAG.
 *
 * Kept as a pure function so the routing/buyback layer can be added later without
 * touching the fee maths.
 */
export function calculateBuybackAmount(gross: number): number {
  return calculateFeeSplit(gross).burn;
}

/** Sanity check used by `${getServerConnection}` consumers: does the RPC answer? */
export async function isBurnReady(): Promise<boolean> {
  if (!isBagBurnConfigured()) return false;
  try {
    await getServerConnection().getSlot();
    return true;
  } catch {
    return false;
  }
}
