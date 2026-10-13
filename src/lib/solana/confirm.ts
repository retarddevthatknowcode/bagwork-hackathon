import type { ParsedTransactionWithMeta } from "@solana/web3.js";

import { WSOL_MINT } from "./constants";
import {
  getSignatureStatusesChecked,
  withRpcFallback,
  type SignatureStatusSummary,
} from "./connection";
import { configuredTreasuryAddresses } from "./treasury";

/**
 * Confirming that a payout actually happened.
 *
 * A signature proves a transaction exists. It does not prove the transaction succeeded, that it
 * paid *this* creator, that it paid the right amount, or that it paid the right token — so a payout
 * is only recorded after those four things have been read off the chain.
 *
 * The checks are made against **balance deltas** in the transaction metadata rather than against the
 * instruction list, because deltas are what actually happened: instructions can include a transfer
 * the program rejected or a later instruction reversed, and they say nothing about fees. Concretely:
 *
 *   - the recipient's balance (lamports, or this exact mint for their token account) went **up** by
 *     at least the payout amount;
 *   - the treasury's corresponding balance went **down**, which is what stops a stranger's transfer
 *     to the creator being filed as our payout.
 *
 * Runs on the provider chain, so a Helius blip is answered by Alchemy rather than reported as an
 * unconfirmed payout.
 */

export type PayoutConfirmation =
  | { status: "confirmed"; received: number; slot: number | null }
  /** Not visible yet, or still in flight. Retryable. */
  | { status: "pending"; reason: string }
  /** On-chain and it does not pay this creator what this payout promised. Never retryable. */
  | { status: "failed"; reason: string };

/** Float tolerance for comparing token amounts, which arrive as JS numbers. */
const AMOUNT_EPSILON = 1e-9;

function isNativeMint(mint: string): boolean {
  return mint === WSOL_MINT;
}

/** Lamport delta for one address inside a parsed transaction, or null when it is not in the keys. */
function lamportDelta(transaction: ParsedTransactionWithMeta, address: string): number | null {
  const keys = transaction.transaction.message.accountKeys;
  const index = keys.findIndex((key) => key.pubkey.toBase58() === address);
  if (index < 0) return null;

  const meta = transaction.meta;
  if (!meta) return null;

  const before = meta.preBalances[index];
  const after = meta.postBalances[index];
  if (typeof before !== "number" || typeof after !== "number") return null;
  return after - before;
}

/**
 * Token delta for one owner and mint, summed across the account indices in the metadata.
 *
 * An owner can hold more than one account for the same mint, and a transaction can touch several,
 * so the deltas are summed rather than picked.
 */
function tokenDelta(
  transaction: ParsedTransactionWithMeta,
  owner: string,
  mint: string,
): number | null {
  const meta = transaction.meta;
  if (!meta?.preTokenBalances || !meta.postTokenBalances) return null;
  const pre = meta.preTokenBalances;
  const post = meta.postTokenBalances;

  const amountIn = (
    rows: NonNullable<ParsedTransactionWithMeta["meta"]>["preTokenBalances"],
    index: number,
  ): number => {
    const row = rows?.find(
      (entry) => entry.accountIndex === index && entry.owner === owner && entry.mint === mint,
    );
    return row?.uiTokenAmount?.uiAmount ?? 0;
  };

  const indices = new Set<number>();
  for (const row of pre) {
    if (row.owner === owner && row.mint === mint) indices.add(row.accountIndex);
  }
  for (const row of post) {
    if (row.owner === owner && row.mint === mint) indices.add(row.accountIndex);
  }
  if (indices.size === 0) return null;

  let delta = 0;
  for (const index of indices) {
    delta += amountIn(post, index) - amountIn(pre, index);
  }
  return delta;
}

/**
 * Confirms a payout transfer from the chain.
 *
 * `pending` and `failed` are deliberately different answers: a transaction that is still confirming
 * should be retried, and one that landed but paid the wrong thing never should.
 */
export async function confirmPayoutTransfer({
  signature,
  recipient,
  mint,
  amount,
  source,
}: {
  signature: string;
  /** The creator's wallet (native payouts) or the token account owner (SPL payouts). */
  recipient: string;
  /** The mint paid, or wrapped SOL for a native payout. */
  mint: string;
  /** Human-readable amount the payout promised. */
  amount: number;
  /**
   * The wallet the funds must have left. The automatic payout path knows it (the campaign's own
   * treasury); manual-record paths omit it and accept either Bagwork treasury, which is what an
   * operator paying by hand needs.
   */
  source?: string;
}): Promise<PayoutConfirmation> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { status: "failed", reason: `Payout amount must be positive, got ${amount}` };
  }

  /*
   * Status first: it is one cheap call, and it separates "not there yet" from "there and reverted"
   * without fetching a full payload.
   *
   * A failure here must never reach the caller as an exception. The payout routes write nothing
   * until a payout is confirmed, so an unhandled throw does not corrupt anything — but it does turn
   * a provider blip into an unexplained 500, and a 500 tells a creator "the app is broken" when the
   * truth is "try again in a moment". That is the distinction the two branches below draw: a
   * malformed request is deterministic and final, anything else may be transient.
   */
  let status: SignatureStatusSummary | undefined;
  try {
    [status] = await getSignatureStatusesChecked([signature], "payout-status");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/invalid param|wrongsize|invalid signature|bad request/i.test(message)) {
      return {
        status: "failed",
        reason: `That is not a usable Solana transaction signature (${message}).`,
      };
    }
    return {
      status: "pending",
      reason: `Could not reach Solana to confirm the transfer — ${message}`,
    };
  }

  if (!status || !status.found) {
    return {
      status: "pending",
      reason: "That transaction is not visible on-chain yet. It usually takes a few seconds.",
    };
  }

  if (status.failed) {
    return {
      status: "failed",
      reason: `The transaction failed on-chain, so nothing was paid: ${JSON.stringify(status.error)}`,
    };
  }

  if (!status.confirmed) {
    return {
      status: "pending",
      reason: "That transaction is in flight and has not reached confirmed yet.",
    };
  }

  // Same rule as above: a provider failure here is "we could not check", never "the payout failed".
  let transaction: ParsedTransactionWithMeta | null = null;
  try {
    transaction = await withRpcFallback(
      (connection) =>
        connection.getParsedTransaction(signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        }),
      { label: "payout-confirm", accept: (found) => found !== null },
    );
  } catch (error) {
    return {
      status: "pending",
      reason: `Could not read the transaction to confirm it — ${
        error instanceof Error ? error.message : "unknown RPC error"
      }`,
    };
  }

  if (!transaction) {
    return {
      status: "pending",
      reason:
        "The transaction is confirmed but its details are not readable from any provider yet.",
    };
  }

  // Belt and braces: the status said it succeeded, and the payload carries the same verdict.
  if (transaction.meta?.err) {
    return {
      status: "failed",
      reason: `The transaction reverted on-chain: ${JSON.stringify(transaction.meta.err)}`,
    };
  }

  const native = isNativeMint(mint);
  const received = native
    ? lamportDelta(transaction, recipient)
    : tokenDelta(transaction, recipient, mint);

  if (received === null) {
    return {
      status: "failed",
      reason: native
        ? "That transaction does not involve the creator's wallet, so it is not their payout."
        : `That transaction does not move ${mint} for the creator's wallet, so it is not their payout.`,
    };
  }

  if (received <= AMOUNT_EPSILON) {
    return {
      status: "failed",
      reason: `The creator's balance did not increase (${received}), so nothing was paid to them.`,
    };
  }

  if (received + AMOUNT_EPSILON < amount) {
    return {
      status: "failed",
      reason: `Only ${received} of the ${amount} payout reached the creator, so it was not recorded as settled.`,
    };
  }

  /*
   * The money must have come from a Bagwork treasury.
   *
   * Without this, anyone could send a creator an unrelated transfer, hand us its signature, and the
   * submission would be marked paid without the treasury ever paying it. A native payout must show
   * the treasury's lamports falling; an SPL payout its token balance for this mint falling. Either
   * wallet satisfies the check when no `source` was named — a manual record made from the wrong
   * one of the two treasuries is still a real Bagwork payout.
   */
  const sources = source ? [source] : configuredTreasuryAddresses();
  if (sources.length > 0) {
    const fromATreasury = sources.some((treasury) => {
      const treasuryDelta = native
        ? lamportDelta(transaction, treasury)
        : tokenDelta(transaction, treasury, mint);
      return treasuryDelta !== null && treasuryDelta < 0;
    });

    if (!fromATreasury) {
      return {
        status: "failed",
        reason: native
          ? "That transaction did not send SOL from a Bagwork treasury, so it is not a payout."
          : "That transaction did not send this token from a Bagwork treasury, so it is not a payout.",
      };
    }
  }

  return { status: "confirmed", received, slot: status.slot };
}