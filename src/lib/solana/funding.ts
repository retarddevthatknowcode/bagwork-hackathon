import { getAssociatedTokenAddress } from "@solana/spl-token";
import { PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";

import { withRpcFallback } from "./connection";

/**
 * Verifying that a bag's budget actually arrived.
 *
 * A transaction signature on its own proves nothing — it only says *some* transaction exists
 * with that hash. Marking a campaign LIVE on the strength of a client-supplied string is how a
 * bag goes live with no money behind it, and every creator who then posts into it is working
 * for a payout that cannot happen. So the whole transaction is fetched and checked against what
 * the campaign promised, before anything is flipped to LIVE.
 *
 * What is checked, and why each matters:
 *
 *   1. The transaction exists and is confirmed at `confirmed` (not `finalized`: a few seconds
 *      versus ~13, matching the commitment the payout path already uses).
 *   2. It did not fail. A reverted transaction is still a real signature, so `meta.err` being
 *      set is a failure even though the hash is genuine.
 *   3. Tokens landed in **the treasury's associated token account for this campaign's exact
 *      mint**. The destination is derived from the campaign's own `treasury` and `tokenMint`
 *      columns rather than read out of the transaction, so a transfer to any other address — or
 *      of any other token — cannot satisfy it.
 *   4. At least the full budget arrived. A partial transfer funds a bag that runs dry
 *      mid-campaign, so it is rejected with the amount that actually landed.
 *   5. The publisher's own wallet signed it. Without this, anyone could attach a stranger's
 *      transfer to their own draft bag.
 */

export interface VerifiedFunding {
  /** Raw token units received (before `10^decimals`). */
  receivedRaw: bigint;
  /** Human-readable amount received. */
  received: number;
  /** Where the tokens landed — the treasury's ATA. */
  destination: string;
  /** The wallet that signed the transfer. */
  signer: string;
}

export type FundingCheck =
  | { status: "verified"; funding: VerifiedFunding }
  /** Not visible yet: broadcast to confirmation is not instant. Retryable. */
  | { status: "pending"; reason: string }
  /** On-chain and it does not satisfy the campaign. Never retryable. */
  | { status: "invalid"; reason: string };

interface ParsedInstruction {
  parsed?: unknown;
}

interface InstructionInfo {
  type?: string;
  info?: Record<string, unknown>;
}

/**
 * Reads an SPL token transfer out of a parsed instruction, in either the `transfer` or
 * `transferChecked` form. Returns null for anything else.
 */
function readTransfer(instruction: ParsedInstruction): {
  destination: string;
  amountRaw: bigint;
  mint: string | null;
  decimals: number | null;
} | null {
  const parsed = instruction.parsed as InstructionInfo | undefined;
  if (!parsed || typeof parsed !== "object" || !parsed.type || !parsed.info) return null;
  if (parsed.type !== "transfer" && parsed.type !== "transferChecked") return null;

  const info = parsed.info;
  const destination = typeof info.destination === "string" ? info.destination : null;
  if (!destination) return null;

  if (parsed.type === "transferChecked") {
    const tokenAmount = info.tokenAmount as
      | { amount?: string; decimals?: number }
      | undefined;
    const amount = tokenAmount?.amount;
    if (typeof amount !== "string") return null;
    return {
      destination,
      amountRaw: BigInt(amount),
      mint: typeof info.mint === "string" ? info.mint : null,
      decimals: typeof tokenAmount?.decimals === "number" ? tokenAmount.decimals : null,
    };
  }

  const amount = info.amount;
  if (typeof amount !== "string") return null;
  // A bare `transfer` carries no mint, so the caller can only trust it because the destination
  // account was derived from the campaign's mint.
  return { destination, amountRaw: BigInt(amount), mint: null, decimals: null };
}

/**
 * Fetches a transaction, asking both providers before concluding it is not there.
 *
 * `withRpcFallback` only retries on a *thrown* error, but `getParsedTransaction` returns
 * `null` when a node cannot see a transaction — and that `null` is ambiguous: it means either
 * "this does not exist" or "this node has not indexed it yet". For a transfer we are checking
 * seconds after it was sent, the second case is common, so a `null` from Helius is checked
 * against the public endpoint before we call it missing. That way `pending` only ever means
 * "neither node can see it", which is the honest thing to tell a publisher.
 *
 * Retries too: `signAndSendTransaction` resolves on broadcast, so the first lookup after
 * clicking "transfer" usually misses.
 */
async function fetchTransaction(signature: string) {
  const options = {
    commitment: "confirmed" as const,
    maxSupportedTransactionVersion: 0,
  };

  const once = async () => {
    /*
     * Walks the whole provider chain (Helius → Alchemy → public), treating a `null` as "ask the
     * next one" rather than as an answer. That is why this is not a plain connection call: a node
     * that has not indexed the transaction yet returns null, which is indistinguishable from "it
     * does not exist", and the difference between those two is the difference between telling a
     * publisher "give it a moment" and telling them their money is gone.
     *
     * A throw from every provider propagates the primary's error, which the caller turns into
     * "could not reach Solana" — a different message with a different retry story from "pending".
     */
    return withRpcFallback((connection) => connection.getParsedTransaction(signature, options), {
      label: "getParsedTransaction",
      accept: (found) => found !== null,
    });
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    const found = await once();
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return null;
}

/**
 * Fetches and checks a funding transfer.
 *
 * Callers must treat `pending` as retryable and `invalid` as final — that distinction is what
 * stops the UI from telling someone to try again when retrying can never help.
 */
export interface FundingCheckParams {
  /** The treasury's associated token account for `mint`. Derived by the caller. */
  treasuryAta: string;
  /** The treasury wallet itself — where a native SOL transfer lands. */
  treasury: string;
  mint: string;
  publisherWallet: string;
  expectedRaw: bigint;
  expectedDecimals: number;
  /**
   * True when the bag is priced in SOL, so a plain lamport transfer counts.
   *
   * A wallet holds SOL rather than wrapped SOL, so a SOL budget arrives as a native transfer. Both
   * lamports and wSOL base units are 9-decimal, so the two are directly comparable and can simply be
   * summed — which is also why this must be false for every other mint: USDC lamports would
   * otherwise be counted as USDC.
   */
  acceptNativeSol?: boolean;
}

/** The system program's address, which is what a plain lamport transfer comes from. */
const SYSTEM_PROGRAM = "11111111111111111111111111111111";

/**
 * Reads a native lamport transfer, which is a different instruction shape to an SPL transfer: the
 * amount is `lamports` and it is indistinguishable from an SPL `transfer` by `type` alone, so the
 * program is what identifies it.
 */
function readNativeTransfer(instruction: ParsedInstruction): {
  destination: string;
  lamports: bigint;
} | null {
  const parsed = instruction.parsed as InstructionInfo | undefined;
  const programId = (instruction as { programId?: { toBase58?: () => string } }).programId;
  const program =
    (instruction as { program?: string }).program ??
    (programId?.toBase58 ? programId.toBase58() : null);

  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.type !== "transfer") return null;
  if (program !== "system" && program !== SYSTEM_PROGRAM) return null;

  const info = parsed.info;
  const destination = typeof info?.destination === "string" ? info.destination : null;
  const lamports = info?.lamports;
  // `lamports` is a number in a parsed system transfer, unlike SPL's string `amount`.
  if (!destination || typeof lamports !== "number") return null;
  return { destination, lamports: BigInt(Math.round(lamports)) };
}

/**
 * The actual checks, as a pure function over an already-fetched transaction.
 *
 * Split out from the RPC call so the money rules can be tested exhaustively against synthetic
 * transactions. Every branch below decides whether a bag becomes payable, which is not
 * something to be comfortable with verifying by hand.
 */
export function checkFundingTransaction(
  transaction: ParsedTransactionWithMeta,
  {
    treasuryAta,
    treasury,
    mint,
    publisherWallet,
    expectedRaw,
    expectedDecimals,
    acceptNativeSol = false,
  }: FundingCheckParams,
): FundingCheck {
  if (transaction.meta?.err) {
    return {
      status: "invalid",
      reason: "That transaction failed on-chain, so no money moved. Send the transfer again.",
    };
  }

  const message = transaction.transaction.message;
  const accountKeys = message.accountKeys as unknown as {
    pubkey: PublicKey;
    signer: boolean;
  }[];

  const signer = accountKeys.find((key) => key.signer)?.pubkey.toBase58() ?? null;
  if (!signer || signer !== publisherWallet) {
    return {
      status: "invalid",
      reason: `That transfer was signed by ${
        signer ?? "an unknown wallet"
      }, not by the wallet on your account. Fund the bag from your own wallet.`,
    };
  }

  // Top-level *and* inner instructions: a wallet or aggregator can route the transfer through
  // another program, in which case it only appears as an inner instruction.
  const instructions: ParsedInstruction[] = [
    ...(message.instructions as unknown as ParsedInstruction[]),
    ...((transaction.meta?.innerInstructions ?? []) as unknown as {
      instructions: ParsedInstruction[];
    }[]).flatMap((group) => group.instructions),
  ];

  let receivedRaw = BigInt(0);
  let receivedNative = false;
  for (const instruction of instructions) {
    // Native lamports, when this bag is priced in SOL.
    if (acceptNativeSol) {
      const native = readNativeTransfer(instruction);
      if (native && native.destination === treasury) {
        receivedRaw += native.lamports;
        receivedNative = true;
        continue;
      }
    }

    const transfer = readTransfer(instruction);
    if (!transfer) continue;
    // The destination is the treasury's ATA for this campaign's mint. Deriving it above is what
    // makes a bare `transfer` (which carries no mint) safe to accept.
    if (transfer.destination !== treasuryAta) continue;
    if (transfer.mint !== null && transfer.mint !== mint) continue;
    if (transfer.decimals !== null && transfer.decimals !== expectedDecimals) {
      return {
        status: "invalid",
        reason: `That transfer used ${transfer.decimals} decimals but this bag's token has ${expectedDecimals}. The mismatch would make every payout wrong, so it was refused.`,
      };
    }
    receivedRaw += transfer.amountRaw;
  }

  if (receivedRaw <= BigInt(0)) {
    return {
      status: "invalid",
      reason:
        "That transaction did not send this bag's token to the Bagwork treasury. Check you sent it to the address shown in step 3.",
    };
  }

  if (receivedRaw < expectedRaw) {
    const got = Number(receivedRaw) / 10 ** expectedDecimals;
    const want = Number(expectedRaw) / 10 ** expectedDecimals;
    return {
      status: "invalid",
      reason: `Only ${got} of the ${want} budget arrived, so the bag was not activated. Send the shortfall and try again.`,
    };
  }

  return {
    status: "verified",
    funding: {
      receivedRaw,
      received: Number(receivedRaw) / 10 ** expectedDecimals,
      // Native SOL lands in the treasury wallet; a token transfer lands in its token account.
      destination: receivedNative ? treasury : treasuryAta,
      signer,
    },
  };
}


/**
 * Fetches a funding transfer and checks it.
 *
 * The only thing this adds over `checkFundingTransaction` is the RPC call and the mapping of
 * "cannot see it yet" to `pending` rather than a failure. Callers must treat `pending` as
 * retryable and `invalid` as final; that distinction is what stops the UI from telling someone
 * to try again when retrying can never help.
 */
export async function verifyFundingTransfer({
  signature,
  mint,
  treasury,
  publisherWallet,
  expectedRaw,
  expectedDecimals,
  acceptNativeSol = false,
}: {
  signature: string;
  /** SPL mint the campaign is denominated in. */
  mint: string;
  /** The campaign's pinned Bagwork treasury. */
  treasury: string;
  /** The wallet that must be the signer. */
  publisherWallet: string;
  /** Raw units required: budget × 10^decimals. */
  expectedRaw: bigint;
  expectedDecimals: number;
  /** True when the bag is priced in SOL, so a native lamport transfer is valid. */
  acceptNativeSol?: boolean;
}): Promise<FundingCheck> {
  let treasuryAta: string;
  try {
    treasuryAta = (
      await getAssociatedTokenAddress(new PublicKey(mint), new PublicKey(treasury))
    ).toBase58();
  } catch {
    return {
      status: "invalid",
      reason: "This bag's token or treasury address is not a valid Solana address",
    };
  }

  let transaction: ParsedTransactionWithMeta | null;
  try {
    transaction = await fetchTransaction(signature);
  } catch (error) {
    // An RPC failure says nothing about the transfer, so it must not be reported as an invalid
    // funding attempt — that would tell a publisher their money is lost when it is not.
    return {
      status: "pending",
      reason: `Could not reach Solana to verify the transfer — ${
        error instanceof Error && error.message ? error.message : "unknown RPC error"
      }`,
    };
  }

  if (!transaction) {
    return {
      status: "pending",
      reason: "That transaction is not confirmed yet. It usually takes a few seconds.",
    };
  }

  return checkFundingTransaction(transaction, {
    treasuryAta,
    treasury,
    mint,
    publisherWallet,
    expectedRaw,
    expectedDecimals,
    acceptNativeSol,
  });
}

