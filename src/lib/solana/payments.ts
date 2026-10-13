import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  getMint,
} from "@solana/spl-token";

import { BASE_FEE_LAMPORTS, WSOL_MINT } from "./constants";
import {
  DEFAULT_COMMITMENT,
  getServerConnection,
  isValidSolanaAddress,
  withRpcFallback,
} from "./connection";

/**
 * Payment primitives.
 *
 * ## Design: build here, sign in the browser
 *
 * Nothing in this module holds or touches a private key. It only *constructs*
 * instructions and transactions. Signing happens client-side through the user's Privy
 * wallet (`useSignAndSendTransaction` from `@privy-io/react-auth/solana` for Solana
 * standard wallets, or the Privy embedded wallet), which is what keeps this app
 * non-custodial: the server can prepare a payout but can never move a user's funds.
 *
 * The intended flow for a payout, once it is implemented:
 *
 *   1. server: validate the submission and amount, build the transaction
 *   2. server: return it (base64) to the client
 *   3. client: sign + send with the creator's wallet
 *   4. client: post the signature back; server records it on `payouts`
 *
 * Everything below is the foundation for step 1.
 */

/** Guard used by every builder, so an invalid address fails loudly and early. */
export function requireValidAddress(address: string, label: string): PublicKey {
  if (!isValidSolanaAddress(address)) {
    throw new Error(`Invalid Solana address for ${label}: ${address || "(empty)"}`);
  }
  return new PublicKey(address);
}

/**
 * A token account can only be owned by an address that is on the ed25519 curve.
 *
 * This matters more than it looks. Spl-token's `getAssociatedTokenAddress` throws
 * `TokenOwnerOffCurveError` for an off-curve owner — and that error carries an **empty
 * message**, so an operator saw "Could not build the transfer on Solana — . Try again."
 * with nothing to act on.
 *
 * It is not a hypothetical: the incinerator address used as the stand-in treasury on the
 * seeded test campaigns (`1nc1nerator…`) is deliberately off-curve precisely so it can
 * never be a real account. Checking here turns an unexplainable failure into a sentence
 * that says which address is wrong and why.
 */
function assertCanOwnTokenAccount(key: PublicKey, label: string): void {
  if (!PublicKey.isOnCurve(key.toBytes())) {
    throw new Error(
      `The ${label} ${key.toBase58()} is an off-curve address, so it cannot hold a token account and no transfer can involve it. Use a normal wallet address.`,
    );
  }
}

export function solToLamports(sol: number): number {
  return Math.round(sol * LAMPORTS_PER_SOL);
}

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

/** Native SOL balance in SOL (not lamports). */
export async function getSolBalance(address: string): Promise<number> {
  const owner = requireValidAddress(address, "wallet");
  // Through the provider chain: a Helius blip used to surface as a failed balance read even though
  // a second provider was configured and perfectly able to answer.
  const lamports = await withRpcFallback(
    (connection) => connection.getBalance(owner, DEFAULT_COMMITMENT),
    { label: "getBalance" },
  );
  return lamportsToSol(lamports);
}

export interface TokenBalance {
  mint: string;
  /** Human-readable amount, scaled by the mint's decimals. */
  amount: number;
  /** Integer amount as a string, to avoid precision loss. */
  rawAmount: string;
  decimals: number;
}

/**
 * SPL token balance for a wallet. Returns a zero balance when the owner has no
 * associated token account yet, which is the normal state before a first payout.
 */
export async function getTokenBalance(
  ownerAddress: string,
  mintAddress: string
): Promise<TokenBalance> {
  const owner = requireValidAddress(ownerAddress, "wallet");
  const mint = requireValidAddress(mintAddress, "mint");

  const ata = await getAssociatedTokenAddress(mint, owner);
  const decimals = await getTokenDecimals(mintAddress);

  /*
   * Through the provider chain, and only a total failure reads as zero.
   *
   * The old `.catch(() => null)` sat directly on the primary connection, so a Helius blip was
   * reported as "this wallet holds nothing" — the wrong answer at exactly the moment someone is
   * checking whether a payout arrived.
   */
  const account = await withRpcFallback(
    (connection) => connection.getTokenAccountBalance(ata, DEFAULT_COMMITMENT),
    { label: "getTokenAccountBalance" },
  ).catch(() => null);

  if (!account) {
    return { mint: mintAddress, amount: 0, rawAmount: "0", decimals };
  }

  return {
    mint: mintAddress,
    // `getTokenAccountBalance` wraps the amount in `value`.
    amount: account.value.uiAmount ?? 0,
    rawAmount: account.value.amount,
    decimals,
  };
}

/** Mint decimals, needed to convert between UI amounts and raw integers. */
export async function getTokenDecimals(mintAddress: string): Promise<number> {
  const mint = requireValidAddress(mintAddress, "mint");
  // Wrapped in the fallback helper: a provider blip here used to abort a payout build.
  const info = await withRpcFallback((connection) =>
    getMint(connection, mint, DEFAULT_COMMITMENT),
  );
  return info.decimals;
}

export interface SolTransferParams {
  from: string;
  to: string;
  lamports: number;
}

/** Builds (does not sign) a native SOL transfer. */
export function buildSolTransfer({ from, to, lamports }: SolTransferParams): Transaction {
  const payer = requireValidAddress(from, "from");
  const recipient = requireValidAddress(to, "to");

  if (!Number.isInteger(lamports) || lamports <= 0) {
    throw new Error(`Transfer amount must be a positive integer of lamports, got ${lamports}`);
  }

  return new Transaction().add(
    SystemProgram.transfer({ fromPubkey: payer, toPubkey: recipient, lamports })
  );
}

export interface TokenTransferParams {
  from: string;
  to: string;
  mint: string;
  /** UI amount (e.g. 12.5 tokens) — converted to raw units with the mint's decimals. */
  amount: number;
}

/** Builds (does not sign) an SPL token transfer between two wallets. */
export async function buildTokenTransfer({
  from,
  to,
  mint,
  amount,
}: TokenTransferParams): Promise<TransactionInstruction> {
  const owner = requireValidAddress(from, "from");
  const recipient = requireValidAddress(to, "to");
  const mintKey = requireValidAddress(mint, "mint");

  const decimals = await getTokenDecimals(mint);
  const raw = Math.round(amount * 10 ** decimals);

  if (!Number.isFinite(raw) || raw <= 0) {
    throw new Error(`Transfer amount must be positive, got ${amount}`);
  }

  // Transfers move between associated token accounts, so both sides are derived here.
  const source = await getAssociatedTokenAddress(mintKey, owner);
  const destination = await getAssociatedTokenAddress(mintKey, recipient);

  return createTransferInstruction(source, destination, owner, raw);
}

export interface PayoutTransactionRequest {
  /** Wallet that holds the budget and pays the creator. Signs and pays the fee. */
  treasury: string;
  /** Creator's wallet. */
  recipient: string;
  /** SPL token mint, e.g. USDC. */
  mint: string;
  /** Human-readable amount (e.g. 42.5 USDC) — converted with the mint's decimals. */
  amount: number;
}

export interface PayoutTransaction {
  /** Unsigned, serialized transaction, base64 — ready for the signer to deserialize. */
  transaction: string;
  /** The wallet that must sign (the treasury) and its required SOL fee budget. */
  feePayer: string;
  /** Lamports the fee payer needs on top of the transfer, so the UI can warn early. */
  estimatedFeeLamports: number;
  /** Raw integer token amount, as sent on-chain. */
  rawAmount: string;
  decimals: number;
  mint: string;
}

/**
 * Builds an unsigned SPL transfer for a creator payout.
 *
 * Three details matter here, and all three are why this is not just
 * `createTransferInstruction`:
 *
 *   1. **The fee payer is the treasury.** The creator never signs, so the treasury must
 *      also own the transaction fee — the UI surfaces the required SOL up front rather
 *      than letting the wallet fail at signing time.
 *   2. **The recipient's token account may not exist.** A creator who has never received
 *      this token has no associated token account, and a bare transfer would fail. An
 *      *idempotent* ATA creation instruction is prepended, which is a no-op when the
 *      account is already there.
 *   3. **A fresh blockhash is required**, fetched from the server connection, so the
 *      transaction is broadcastable the moment it is signed.
 *
 * Nothing here signs. The signed transaction travels from the publisher's Privy wallet,
 * which is what keeps Bagwork non-custodial.
 */
export async function buildPayoutTransaction({
  treasury,
  recipient,
  mint,
  amount,
}: PayoutTransactionRequest): Promise<PayoutTransaction> {
  const treasuryKey = requireValidAddress(treasury, "treasury");
  const recipientKey = requireValidAddress(recipient, "creator wallet");
  const mintKey = requireValidAddress(mint, "mint");

  // Both sides of an SPL transfer own an associated token account, so both must be
  // curve-valid. Checked before anything is fetched, so the failure is instant and named.
  //
  // A native SOL payout involves no token accounts at all, so only the treasury is checked — it
  // has to be on-curve because it signs, whereas lamports can be sent to any address.
  assertCanOwnTokenAccount(treasuryKey, "treasury address");
  const isNative = mint === WSOL_MINT;
  if (!isNative) {
    assertCanOwnTokenAccount(recipientKey, "creator wallet address");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Payout amount must be positive, got ${amount}`);
  }

  const connection = getServerConnection();
  const decimals = await getTokenDecimals(mint);
  const raw = Math.round(amount * 10 ** decimals);

  if (!Number.isFinite(raw) || raw <= 0) {
    throw new Error(
      `Payout of ${amount} is smaller than one base unit of a ${decimals}-decimal token`,
    );
  }

  const { blockhash } = await withRpcFallback((connection) =>
    connection.getLatestBlockhash(DEFAULT_COMMITMENT),
  );

  /*
   * A SOL-priced bag is funded with plain lamports and stays as plain lamports, so its payout is a
   * system transfer.
   *
   * The alternative — wrapping to wSOL on the way in — would mean the treasury had to hold a token
   * account for a token nobody asked for, and every creator would need one too before they could be
   * paid. Paying natively keeps the round trip symmetric: what the publisher sent is what the
   * creator receives. `raw` is already in base units and wSOL is 9-decimal, so the lamport amount
   * is directly correct with no conversion.
   */
  const transaction = new Transaction();
  if (isNative) {
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: treasuryKey,
        toPubkey: recipientKey,
        lamports: raw,
      }),
    );
  } else {
    const source = await getAssociatedTokenAddress(mintKey, treasuryKey);
    const destination = await getAssociatedTokenAddress(mintKey, recipientKey);
    transaction.add(
      // No-op when the creator already holds this token.
      createAssociatedTokenAccountIdempotentInstruction(
        treasuryKey, // payer for the new account's rent
        destination,
        recipientKey,
        mintKey,
      ),
      createTransferInstruction(source, destination, treasuryKey, raw),
    );
  }

  transaction.feePayer = treasuryKey;
  transaction.recentBlockhash = blockhash;

  return {
    transaction: transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64"),
    feePayer: treasury,
    estimatedFeeLamports: BASE_FEE_LAMPORTS,
    rawAmount: String(raw),
    decimals,
    mint,
  };
}
