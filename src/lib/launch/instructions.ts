import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  PublicKey,
  Transaction,
  type Connection,
  type TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";

import { BASE_FEE_LAMPORTS } from "@/lib/solana/constants";

import { OnlinePumpSdk, PUMP_SDK, getBuyTokenAmountFromSolAmount } from "@pump-fun/pump-sdk";

import { PUMP_TOTAL_SUPPLY_BASE_UNITS, TOTAL_SHARE_BPS } from "./config";
import { DEV_BUY_CAP_MESSAGE, devBuyBps, devBuyWithinCap } from "./wizard";

/**
 * The launch transactions, built against the official pump SDK.
 *
 * Nothing here is hand-rolled. The bonding curve, the fee-sharing program (`PUMP_FEE_PROGRAM_ID`)
 * and every PDA and account list come from `@pump-fun/pump-sdk`, because those layouts are versioned
 * protocol surface that changes under the app — deriving them by hand is how a launch silently routes
 * fees to the wrong place.
 *
 * ## The mechanism, in the order the protocol requires it
 *
 *   1. **`create_v2`** mints the coin and opens its bonding curve, SOL-quoted. The launcher is the
 *      curve's `creator`, which is the address creator fees accrue to.
 *   2. **`create_fee_sharing_config`** opts the coin into shared distribution. It migrates the curve
 *      creator onto a `sharing_config` PDA, which is the account the fee program pays out of.
 *   3. **`update_fee_shares_v2`** sets the final shareholder list — here a single shareholder, the
 *      Bagwork FEE treasury, at exactly 10,000 bps — and **revokes the admin**. That revocation is
 *      the permanent lock: the split can be called exactly once per sharing config, and after it the
 *      authority that could change it is gone. There is no "unlock" instruction to call later, by
 *      anyone, including us.
 *
 * The optional dev buy cannot ride along with anything else: `createV2AndBuyInstructions` bundles
 * `create_v2`, the launcher's token account and a first `buy` into one instruction group, and that
 * group together with the fee-share calls is what overruns the packet limit. So the buy is sent as
 * its own step, between the create and the lock.
 *
 * ## What this module deliberately does not do
 *
 * It does not sign. The mint keypair is generated client-side and never reaches the server, so
 * Bagwork holds no key to anyone's coin. This builds bytes; the launcher's wallet authorises them.
 */

/** Compute headroom for one step. A create, or a buy plus two fee-program calls, is CU-heavy. */
const LAUNCH_COMPUTE_UNIT_LIMIT = 600_000;

/** What a dev buy costs, and how big it is. Both derived from the curve, neither assumed. */
export interface DevBuyQuote {
  /** Lamports the launcher would spend. */
  lamports: number;
  /** Tokens the buy returns, in base units. */
  tokenAmount: bigint;
  /** That amount as basis points of total supply — the number the 10% cap applies to. */
  bps: number;
  /** False when the buy breaches the cap and must not be built. */
  withinCap: boolean;
}

/**
 * Prices a dev buy against the live curve parameters without touching the chain's state.
 *
 * A coin that does not exist yet has no bonding curve, and the SDK is explicit that `null` is the
 * right argument for "a curve about to be created" — it then derives the starting reserves from the
 * `Global` account, which is exactly what the create will use. So this is a real quote, not an
 * approximation of one.
 */
export async function quoteDevBuy({
  connection,
  solLamports,
}: {
  connection: Connection;
  solLamports: number;
}): Promise<DevBuyQuote> {
  const lamports = Math.max(0, Math.floor(solLamports));
  if (lamports === 0) {
    return { lamports: 0, tokenAmount: BigInt(0), bps: 0, withinCap: true };
  }

  const online = new OnlinePumpSdk(connection);
  const [global, feeConfig] = await Promise.all([
    online.fetchGlobal(),
    // A missing fee config is a legitimate state (the program treats it as "no schedule"), so a
    // failure here must not take the whole quote down with it.
    online.fetchFeeConfig().catch(() => null),
  ]);

  const tokenAmount = getBuyTokenAmountFromSolAmount({
    global,
    feeConfig,
    mintSupply: new BN(PUMP_TOTAL_SUPPLY_BASE_UNITS.toString()),
    // `null` = a curve that is about to be created, which is precisely our case.
    bondingCurve: null,
    amount: new BN(lamports),
    quoteMint: NATIVE_MINT,
  });

  const baseUnits = BigInt(tokenAmount.toString());
  return {
    lamports,
    tokenAmount: baseUnits,
    bps: devBuyBps(baseUnits),
    withinCap: devBuyWithinCap(baseUnits),
  };
}

export interface LaunchInstructionParams {
  connection: Connection;
  /** The launcher's wallet: the curve's creator, the fee-sharing authority, and the fee payer. */
  launcher: PublicKey;
  /** The coin's mint. Generated and signed client-side; this module only ever sees the address. */
  mint: PublicKey;
  name: string;
  symbol: string;
  /** The metadata JSON URI the coin is pointed at. */
  uri: string;
  /** Lamports for the optional dev buy. 0 skips it entirely. */
  devBuyLamports: number;
  /** The FEE treasury that receives 100% of the coin's creator fees. */
  treasury: PublicKey;
}

/**
 * A launch is **two transactions**, and the size limit is why.
 *
 * One atomic transaction was the original design and it does not fit. `create_v2` + the fee-sharing
 * config + the share update come to well over Solana's 1232-byte packet limit — the measured build
 * was 1329 bytes, and the wallet refused it before it ever reached the chain, with a message
 * ("Transaction too large: 1329 > 1232") that names the symptom and not the cause.
 *
 * It cannot be squeezed in either. The account lists are protocol-supplied and long, and the two
 * halves genuinely belong to different moments: the coin must exist on-chain before its
 * `sharing_config` PDA can be created, let alone written to.
 *
 * So the launch is split at the seam the protocol already has:
 *
 *   **Tx1 — create.** `create_v2` mints the coin and opens its bonding curve, plus the launcher's
 *   token account and first `buy` when there is a dev buy. The launcher is the curve's `creator`,
 *   which is the address creator fees accrue to.
 *
 *   **Tx2 — lock.** `create_fee_sharing_config` then `update_fee_shares_v2`, which sets a single
 *   shareholder — the Bagwork FEE treasury at exactly 10,000 bps — and **revokes the admin**. That
 *   revocation is the permanent lock: the split can be written once per sharing config, and after it
 *   the authority that could change it is gone. There is no "unlock" instruction, for anyone.
 *
 * The cost is a second wallet prompt, which is why the UI names both steps out loud. The benefit is
 * that Tx2 can be retried on its own: if the coin is created and the lock fails, the coin is simply
 * unlocked until a retry lands, and nothing has been claimed that is not yet true — the bag is only
 * built once the chain confirms the lock.
 *
 * Both halves are measured against `MAX_TRANSACTION_BYTES` before they are returned. That check is a
 * refusal, never a raised ceiling: a limit lifted in a constant here would still be enforced by the
 * chain, only with a worse error and after a wallet prompt.
 *
 * ## The fee window between create and lock
 *
 * Between the create landing and the lock being applied there is a gap in which the coin's creator
 * fees still pay the launcher's own wallet rather than the FEE treasury — pump routes fees to the
 * curve creator until the sharing config is written. That gap cannot be closed to zero: the lock is
 * a separate transaction because the two do not fit together, and the sharing config is a PDA of the
 * mint that cannot exist before the coin does.
 *
 * It is minimised rather than ignored: the two steps are signed back to back and the lock is built
 * against the same blockhash, so the window is seconds — normally the time of one wallet approval.
 * Measured on a real launch the coin had not traded before the lock landed. The cost of getting it
 * wrong is bounded anyway: fees accrued pre-lock go to the launcher, who is the person funding the
 * bag, never to someone else.
 */

/**
 * The Solana packet limit for a transaction. A build past this cannot be sent at all.
 *
 * Deliberately the protocol's real number rather than a house value with headroom. Raising it would
 * not make a larger transaction send; it would move the failure to the wallet, where the message is
 * about a byte count rather than about the thing that actually needs to change.
 */
export const MAX_TRANSACTION_BYTES = 1232;

/**
 * Tx1 — create the coin: mint, metadata and bonding curve.
 *
 * Deliberately **create only**. The dev buy used to ride along via `createV2AndBuyInstructions`, and
 * that is most of what made the single transaction too big: the create's instruction data carries
 * the name, symbol and metadata URI, so its size tracks the draft rather than being fixed, and a
 * hosted metadata URI plus a buy pushed it past the packet limit on its own.
 *
 * Nothing here needs the program's `global` account — the create is derived from the mint and the
 * launcher's addresses — so a plain launch makes no curve read at all.
 */
export async function buildCreateInstructions({
  launcher,
  mint,
  name,
  symbol,
  uri,
}: LaunchInstructionParams): Promise<TransactionInstruction[]> {
  return [
    await PUMP_SDK.createV2Instruction({
      mint,
      name,
      symbol,
      uri,
      creator: launcher,
      user: launcher,
      mayhemMode: false,
    }),
  ];
}

/**
 * The dev buy, on its own: the launcher's token account plus the first buy.
 *
 * This is the middle step when a launcher chooses a dev buy, and it exists because the create could
 * not carry it. `createV2AndBuyInstructions` is still what builds it — the instruction group is
 * sliced off the front (index 0 is the create, which Tx1 already sends) rather than reconstructed by
 * hand, so the buy is exactly the one the SDK would have produced: same derived curve creator, same
 * slippage, same accounts.
 *
 * The cap is re-checked here on the real curve quote, even though the route already refused an
 * over-large draft. Two checks on purpose: the route's is a form validation the user sees, this one
 * is on the number actually being signed. A dev buy that breaches the cap must never reach a wallet
 * prompt.
 */
export async function buildDevBuyInstructions({
  connection,
  launcher,
  mint,
  name,
  symbol,
  uri,
  devBuyLamports,
}: LaunchInstructionParams): Promise<TransactionInstruction[]> {
  if (devBuyLamports <= 0) return [];

  const global = await new OnlinePumpSdk(connection).fetchGlobal();
  const quote = await quoteDevBuy({ connection, solLamports: devBuyLamports });
  if (!quote.withinCap) throw new Error(DEV_BUY_CAP_MESSAGE);

  const withCreate = await PUMP_SDK.createV2AndBuyInstructions({
    global,
    mint,
    name,
    symbol,
    uri,
    creator: launcher,
    user: launcher,
    amount: new BN(quote.tokenAmount.toString()),
    solAmount: new BN(devBuyLamports),
    mayhemMode: false,
  });

  /*
   * `[create_v2, create_ata, buy]` — the create is dropped, because Tx1 already sends it and sending
   * it twice would fail on-chain (the mint already exists). What remains is the token account and the
   * buy.
   */
  return withCreate.slice(1);
}

/** The three addresses the fee-lock step needs. Narrower than a full launch, because it is also
 * built on its own when a lock has to be retried against a coin that already exists. */
export interface FeeShareParams {
  launcher: PublicKey;
  mint: PublicKey;
  treasury: PublicKey;
}

/**
 * Tx2 — opt the coin into shared distribution, then lock 100% of its creator fees.
 *
 * Both fee-program calls live in one transaction rather than one each: the config write is small,
 * and separating them would cost the launcher a third wallet prompt for no gain. Together they are a
 * fraction of Tx1's size.
 *
 * Must not be sent before Tx1 is confirmed — the sharing config this creates is a PDA of the mint,
 * so it cannot exist until the coin does.
 */
export async function buildFeeShareInstructions({
  launcher,
  mint,
  treasury,
}: FeeShareParams): Promise<TransactionInstruction[]> {
  const instructions: TransactionInstruction[] = [];

  // `pool: null` because the coin is ungraduated at this instant — it has no AMM pool yet, and the
  // program migrates the pool's `coin_creator` itself if the coin graduates later.
  instructions.push(await PUMP_SDK.createFeeSharingConfig({ creator: launcher, mint, pool: null }));

  /*
   * One shareholder at exactly 10,000 bps. The program requires the split to total 100% and allows
   * the call only once, revoking the admin as it applies it — so this instruction *is* the permanent
   * lock, and there is nothing to call afterwards to undo it.
   *
   * `currentShareholders` is `[launcher]` because that is what the config just created holds: the
   * curve's creator, which is the launcher. The write replaces the list, and naming the current
   * entries is how the program is told what it is replacing.
   */
  instructions.push(
    await PUMP_SDK.updateFeeSharesV2({
      authority: launcher,
      mint,
      currentShareholders: [launcher],
      newShareholders: [{ address: treasury, shareBps: TOTAL_SHARE_BPS }],
      quoteMint: NATIVE_MINT,
      quoteTokenProgram: TOKEN_PROGRAM_ID,
    }),
  );

  return instructions;
}

/** One transaction the launcher signs, in order. */
export interface LaunchStep {
  /**
   * What this step does. The UI names these — "Create coin", "Buy dev allocation", "Lock fees" — and
   * the order is load-bearing, so it is explicit data rather than an array position.
   */
  kind: "create" | "devBuy" | "feeShare";
  transaction: Transaction;
  /** Serialised size in bytes. Guaranteed ≤ `MAX_TRANSACTION_BYTES`. */
  bytes: number;
}

/** The launch, as the ordered transactions a wallet is asked to sign. */
export interface LaunchPlan {
  steps: LaunchStep[];
}

/**
 * Assembles one legacy transaction and measures it.
 *
 * Serialised without requiring signatures so the empty signature slots are present in the bytes the
 * launcher's wallet receives — including the mint's place in the create step, which the client fills
 * with the keypair it generated. That the mint must sign is a property of `create_v2`, not a choice
 * made here.
 */
function assemble(
  blockhash: string,
  feePayer: PublicKey,
  instructions: TransactionInstruction[],
): { transaction: Transaction; bytes: number } {
  const transaction = new Transaction();
  /*
   * Explicit budget. A create plus the curve work is well past the default 200k units, and an
   * overrun fails the transaction rather than slowing it. The limit is a cap and not a charge —
   * units that are not consumed are not paid for — so headroom here is free and a short budget
   * costs a failed launch.
   */
  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: LAUNCH_COMPUTE_UNIT_LIMIT }));
  transaction.add(...instructions);
  transaction.feePayer = feePayer;
  transaction.recentBlockhash = blockhash;

  return {
    transaction,
    bytes: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).length,
  };
}

/** What each step is called when a size refusal has to name it. */
const STEP_LABELS: Record<LaunchStep["kind"], string> = {
  create: "create the coin",
  devBuy: "buy the dev allocation",
  feeShare: "lock the creator fees",
};

/**
 * Builds the launch as the ordered steps a wallet signs, each measured against the packet limit.
 *
 * **Two steps, or three when there is a dev buy.** A plain launch is create → lock fees. A dev buy
 * cannot ride in the create (see `buildCreateInstructions`) and cannot ride in the fee lock either
 * without pushing that one near the limit, so it becomes its own step between them. The launcher
 * signs one prompt per step; the UI names each one, because a second prompt with no explanation
 * reads as a bug.
 *
 * Every step is measured and a build that does not fit **throws** rather than being trimmed or
 * allowed through. There is no optional instruction here, so a step that does not fit means the
 * split has to change, and saying so with the byte count is the only useful outcome — shipping an
 * oversized transaction anyway is what produced the wallet-level "Transaction too large" this
 * replaced.
 *
 * One blockhash is fetched here and put on every step, because they are assembled together. It is
 * **not** what the wallet ends up signing: a Solana blockhash is good for about a minute and a launch
 * takes several wallet approvals, so the client replaces it on each step with a fresh one
 * (`GET /api/launches/blockhash`) immediately before that step's signature. Building every step in
 * one pass and refreshing the expiry per signature is what keeps the step count down to the two or
 * three it can actually be while never signing against a dead blockhash.
 */
export async function buildLaunchPlan(params: LaunchInstructionParams): Promise<LaunchPlan> {
  const [createIx, devBuyIx, feeShareIx] = await Promise.all([
    buildCreateInstructions(params),
    buildDevBuyInstructions(params),
    buildFeeShareInstructions(params),
  ]);

  const specs: Array<{ kind: LaunchStep["kind"]; instructions: TransactionInstruction[] }> = [
    { kind: "create", instructions: createIx },
  ];
  // Only present when the launcher chose a dev buy. `buildDevBuyInstructions` returns nothing for a
  // launch without one, so the step simply is not there rather than being empty.
  if (devBuyIx.length > 0) specs.push({ kind: "devBuy", instructions: devBuyIx });
  specs.push({ kind: "feeShare", instructions: feeShareIx });

  const { blockhash } = await params.connection.getLatestBlockhash("confirmed");

  return {
    steps: specs.map((spec) => {
      const built = assemble(blockhash, params.launcher, spec.instructions);
      assertFits(built.bytes, spec.kind);
      return { kind: spec.kind, transaction: built.transaction, bytes: built.bytes };
    }),
  };
}

/** Throws with the measured size when a step cannot be sent. */
function assertFits(bytes: number, kind: LaunchStep["kind"]): void {
  if (bytes <= MAX_TRANSACTION_BYTES) return;
  throw new Error(
    `The transaction to ${STEP_LABELS[kind]} is ${bytes} bytes, which is over Solana's ` +
      `${MAX_TRANSACTION_BYTES}-byte limit, so it could not be sent. This needs a code change — ` +
      `the launch has to be split further.`,
  );
}

/**
 * The fee-lock step on its own, for a launch whose coin already exists.
 *
 * This exists because the lock is **retryable**. If the coin was created and the share write failed
 * — a rejected prompt, a stale blockhash, a dropped transaction — the fix is to send this one
 * transaction again, not to rebuild the launch, which would ask `create_v2` to mint a coin that is
 * already on-chain and fail. Size-checked like every other step, because a retry path that can ship
 * an oversized transaction would have exactly the bug this whole module was fixed for.
 */
export async function buildFeeShareTransaction(
  params: FeeShareParams & { connection: Connection },
): Promise<{ transaction: Transaction; bytes: number }> {
  const instructions = await buildFeeShareInstructions(params);
  const { blockhash } = await params.connection.getLatestBlockhash("confirmed");
  const built = assemble(blockhash, params.launcher, instructions);
  assertFits(built.bytes, "feeShare");
  return built;
}

/**
 * Simulates the launch before the user is asked to sign it.
 *
 * Best-effort by design. A simulation needs the fee payer to be funded and the blockhash to still be
 * current, so a failure here is often about the *environment* rather than the transaction; reporting
 * that as "your launch is broken" would be worse than letting the wallet try. The caller decides
 * what to do with a negative result — the route surfaces it as a warning, not a hard stop.
 */
export async function simulateLaunch(
  connection: Connection,
  transaction: Transaction,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const simulation = await connection.simulateTransaction(transaction);
    if (!simulation.value.err) return { ok: true, error: null };

    const logs = simulation.value.logs ?? [];
    // The last program log is almost always the reason; the raw error object is not readable.
    const lastLog = logs.filter((line) => line.includes("Error")).slice(-1)[0];
    return {
      ok: false,
      error: lastLog ?? JSON.stringify(simulation.value.err),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Simulation could not be run",
    };
  }
}

/** SPL mint / token-account sizes, for the rent-exempt minimums a launch pays. */
const MINT_ACCOUNT_BYTES = 82;
const TOKEN_ACCOUNT_BYTES = 165;

/** What a launch costs, split into the parts a launcher can actually reason about. */
export interface LaunchCostEstimate {
  /**
   * Signatures × the base fee.
   *
   * Every step is a separate transaction and each pays its own base fee: the create is signed by the
   * launcher *and* the new mint (two signatures), the fee lock by the launcher alone (one), and the
   * dev buy by the launcher alone (one) when it is present. So three without a dev buy, four with.
   */
  networkFeeLamports: number;
  /** Rent for the mint's account, at the chain's current rent-exempt minimum. */
  mintRentLamports: number;
  /** Rent for the launcher's token account. Zero when there is no dev buy. */
  tokenAccountRentLamports: number;
  /** The dev buy itself, straight from the curve quote. Zero when skipped. */
  devBuyLamports: number;
  /** The dev buy as basis points of total supply. */
  devBuyBps: number;
  /** The dev buy's size in tokens, as a decimal string (base units are too big for a JS number). */
  devBuyTokenAmount: string;
  /** False when the dev buy breaches the 10% cap and must be reduced. */
  withinCap: boolean;
  /** Everything above, summed. */
  totalLamports: number;
  /**
   * What this estimate deliberately leaves out.
   *
   * The launchpad creates the bonding curve, its vaults and the token metadata, and charges their
   * rent plus its own creation fee. Those amounts live in the launchpad's program and would have to
   * be simulated to be stated exactly, so they are described rather than guessed at — a made-up
   * figure here would be worse than none, because the launcher is being asked to approve a spend.
   */
  excludedNote: string;
}

/**
 * Prices a launch before it is built.
 *
 * Network fee and rent are computed from the chain's own current values rather than hard-coded, and
 * the dev buy comes from the bonding-curve quote — so the numbers the launcher is shown are the
 * numbers they are about to sign for.
 */
export async function estimateLaunchCosts({
  connection,
  solLamports,
}: {
  connection: Connection;
  solLamports: number;
}): Promise<LaunchCostEstimate> {
  const quote = await quoteDevBuy({ connection, solLamports });

  const [mintRentLamports, tokenAccountRentLamports] = await Promise.all([
    connection.getMinimumBalanceForRentExemption(MINT_ACCOUNT_BYTES).catch(() => 0),
    quote.lamports > 0
      ? connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_BYTES).catch(() => 0)
      : Promise.resolve(0),
  ]);

  /*
   * One transaction per step, each paying its own base fee — see the field comment. The mint adds a
   * signature to the create only, which is why a dev buy (an extra step, and so an extra signature)
   * moves this by one.
   */
  const signatures = quote.lamports > 0 ? 4 : 3;
  const networkFeeLamports = BASE_FEE_LAMPORTS * signatures;

  return {
    networkFeeLamports,
    mintRentLamports,
    tokenAccountRentLamports,
    devBuyLamports: quote.lamports,
    devBuyBps: quote.bps,
    devBuyTokenAmount: quote.tokenAmount.toString(),
    withinCap: quote.withinCap,
    totalLamports:
      networkFeeLamports + mintRentLamports + tokenAccountRentLamports + quote.lamports,
    excludedNote:
      "The launchpad also creates the bonding curve and token metadata and charges their rent and " +
      "its own creation fee, on top of this estimate.",
  };
}


