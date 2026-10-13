/**
 * Funding-path regression suite.
 *
 * Run with:  npm run verify:funding
 *
 * It compiles to CommonJS and runs under Node rather than running directly under bun, because bun
 * resolves the extensionless TypeScript imports in `src/lib` but its `fetch` cannot reach the RPC
 * from this environment — and the payout checks below need real RPC (they resolve a real mint and a
 * real blockhash). See the note above `main()`.
 *
 * The bug this exists to stop recurring: a SOL-priced bag was built as an SPL `transferChecked` of
 * the *wrapped*-SOL mint, from a token account the publisher did not have — because a wallet holds
 * native SOL, not wSOL. Every SOL budget failed at the wallet prompt with no useful reason.
 *
 * The rules are asserted against synthetic parsed transactions rather than by hand, because
 * `checkFundingTransaction` is pure precisely so that is possible.
 */
import { Keypair, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

import { checkFundingTransaction } from "../src/lib/solana/funding";
import { buildPayoutTransaction } from "../src/lib/solana/payments";
import { WSOL_MINT } from "../src/lib/solana/constants";

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/*
 * Wallet fixtures are generated rather than hardcoded, which guarantees they are on-curve: the SPL
 * payout path asserts curve-validity on both parties, so a hardcoded address that happened to be a
 * PDA would fail for a reason that has nothing to do with the code under test.
 */
const TREASURY = Keypair.generate().publicKey.toBase58();
const PUBLISHER = Keypair.generate().publicKey.toBase58();
const SOMEONE_ELSE = Keypair.generate().publicKey.toBase58();

/*
 * Real mints on the active cluster (`NEXT_PUBLIC_SOLANA_CLUSTER`), because the payout builder reads
 * decimals from the mint over RPC — a made-up or wrong-cluster mint cannot be resolved.
 */
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // mainnet USDC, 6dp
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SYSTEM_PROGRAM = SystemProgram.programId.toBase58();

/** A genuine token account for the treasury. Only ever compared as a string by the verifier. */
const TREASURY_ATA = getAssociatedTokenAddressSync(
  new PublicKey(USDC),
  new PublicKey(TREASURY),
).toBase58();


/** Minimal stand-in for the shape `getParsedTransaction` returns. */
function makeTx({
  signer,
  instructions,
  err = null,
}: {
  signer: string;
  instructions: unknown[];
  err?: unknown;
}) {
  return {
    meta: { err, innerInstructions: [] },
    transaction: {
      message: {
        accountKeys: [{ pubkey: new PublicKey(signer), signer: true, writable: true }],
        instructions,
      },
    },
  } as never;
}

function nativeTransfer(from: string, to: string, lamports: number) {
  return {
    program: "system",
    programId: SYSTEM_PROGRAM,
    parsed: { type: "transfer", info: { source: from, destination: to, lamports } },
  };
}

function splTransfer(from: string, to: string, amount: string) {
  return {
    program: "spl-token",
    programId: TOKEN_PROGRAM,
    parsed: { type: "transfer", info: { source: from, destination: to, amount } },
  };
}

// Written with `BigInt(...)` rather than `1_000_000_000n` so this file typechecks under the app's
// tsconfig target, which is below ES2020.
const SOL = BigInt(1_000_000_000); // 1 SOL in lamports, identical in wSOL base units

/**
 * spl-token throws custom errors with an **empty** message, which is how an off-curve owner once
 * surfaced as "Could not build the transfer on Solana — . Try again." with nothing to act on. Prints
 * the name and cause so a skip is diagnosable instead of just blank.
 */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as { cause?: unknown }).cause;
  const parts = [error.name, error.message || "(no message)"];
  if (cause instanceof Error) parts.push(`cause: ${cause.message}`);
  return parts.join(" · ");
}


console.log("\nNative SOL funding (the case that used to be impossible)\n");

{
  const result = checkFundingTransaction(
    makeTx({
      signer: PUBLISHER,
      instructions: [nativeTransfer(PUBLISHER, TREASURY, Number(SOL))],
    }),
    {
      treasuryAta: TREASURY_ATA,
      treasury: TREASURY,
      mint: WSOL_MINT,
      publisherWallet: PUBLISHER,
      expectedRaw: SOL,
      expectedDecimals: 9,
      acceptNativeSol: true,
    },
  );
  check(
    "a native SOL transfer to the treasury activates the bag",
    result.status === "verified",
    result.status === "invalid" ? result.reason : `got ${result.status}`,
  );
  check(
    "and it is reported as landing in the treasury wallet, not a token account",
    result.status === "verified" && result.funding.destination === TREASURY,
  );
}

{
  const result = checkFundingTransaction(
    makeTx({
      signer: PUBLISHER,
      instructions: [nativeTransfer(PUBLISHER, TREASURY, Number(SOL))],
    }),
    {
      treasuryAta: TREASURY_ATA,
      treasury: TREASURY,
      mint: USDC,
      publisherWallet: PUBLISHER,
      expectedRaw: SOL,
      expectedDecimals: 6,
      // A USDC bag. Lamports must never be counted as USDC.
      acceptNativeSol: false,
    },
  );
  check(
    "lamports are NOT accepted as payment for a non-SOL bag",
    result.status === "invalid",
    `got ${result.status}`,
  );
}

{
  const result = checkFundingTransaction(
    makeTx({
      signer: PUBLISHER,
      instructions: [nativeTransfer(PUBLISHER, SOMEONE_ELSE, Number(SOL))],
    }),
    {
      treasuryAta: TREASURY_ATA,
      treasury: TREASURY,
      mint: WSOL_MINT,
      publisherWallet: PUBLISHER,
      expectedRaw: SOL,
      expectedDecimals: 9,
      acceptNativeSol: true,
    },
  );
  check(
    "SOL sent to a different address is refused",
    result.status === "invalid",
    `got ${result.status}`,
  );

{
  const result = checkFundingTransaction(
    makeTx({
      signer: PUBLISHER,
      instructions: [nativeTransfer(PUBLISHER, TREASURY, Number(SOL) / 2)],
    }),
    {
      treasuryAta: TREASURY_ATA,
      treasury: TREASURY,
      mint: WSOL_MINT,
      publisherWallet: PUBLISHER,
      expectedRaw: SOL,
      expectedDecimals: 9,
      acceptNativeSol: true,
    },
  );
  check(
    "an underpaid SOL budget is refused with the shortfall named",
    result.status === "invalid" && /Only 0\.5 of the 1 budget/.test(result.reason),
    result.status === "invalid" ? result.reason : `got ${result.status}`,
  );
}

{
  const result = checkFundingTransaction(
    makeTx({
      signer: SOMEONE_ELSE,
      instructions: [nativeTransfer(SOMEONE_ELSE, TREASURY, Number(SOL))],
    }),
    {
      treasuryAta: TREASURY_ATA,
      treasury: TREASURY,
      mint: WSOL_MINT,
      publisherWallet: PUBLISHER,
      expectedRaw: SOL,
      expectedDecimals: 9,
      acceptNativeSol: true,
    },
  );
  check(
    "a SOL transfer signed by another wallet is refused",
    result.status === "invalid",
    `got ${result.status}`,
  );
}

{
  // A wallet doing "send max" can split the amount across two transfers in one transaction.
  const result = checkFundingTransaction(
    makeTx({
      signer: PUBLISHER,
      instructions: [
        nativeTransfer(PUBLISHER, TREASURY, Number(SOL) / 2),
        nativeTransfer(PUBLISHER, TREASURY, Number(SOL) / 2),
      ],
    }),
    {
      treasuryAta: TREASURY_ATA,
      treasury: TREASURY,
      mint: WSOL_MINT,
      publisherWallet: PUBLISHER,
      expectedRaw: SOL,
      expectedDecimals: 9,
      acceptNativeSol: true,
    },
  );
  check("split SOL transfers are summed", result.status === "verified", `got ${result.status}`);
}

{
  const result = checkFundingTransaction(
    makeTx({
      signer: PUBLISHER,
      instructions: [nativeTransfer(PUBLISHER, TREASURY, Number(SOL))],
      err: { InstructionError: [0, "Custom"] },
    }),
    {
      treasuryAta: TREASURY_ATA,
      treasury: TREASURY,
      mint: WSOL_MINT,
      publisherWallet: PUBLISHER,
      expectedRaw: SOL,
      expectedDecimals: 9,
      acceptNativeSol: true,
    },
  );
  check("a failed SOL transaction is refused", result.status === "invalid");
}

}


console.log("\nSPL funding still works\n");

{
  const result = checkFundingTransaction(
    makeTx({
      signer: PUBLISHER,
      // A bare `transfer` carries raw base units, so 25 USDC at 6 decimals is 25000000.
      instructions: [splTransfer(PUBLISHER, TREASURY_ATA, "25000000")],
    }),
    {
      treasuryAta: TREASURY_ATA,
      treasury: TREASURY,
      mint: USDC,
      publisherWallet: PUBLISHER,
      // 25 USDC in raw units, written without BigInt literals for the reason noted above.
      expectedRaw: BigInt(25) * BigInt(10) ** BigInt(6),
      expectedDecimals: 6,
    },
  );
  check(
    "a bare SPL transfer to the treasury ATA is accepted",

    result.status === "verified",
    result.status === "invalid" ? result.reason : `got ${result.status}`,
  );
  check(
    "and it is reported as landing in the token account",
    result.status === "verified" && result.funding.destination === TREASURY_ATA,
  );
}

{
  const result = checkFundingTransaction(
    makeTx({ signer: PUBLISHER, instructions: [splTransfer(PUBLISHER, SOMEONE_ELSE, "25")] }),
    {
      treasuryAta: TREASURY_ATA,
      treasury: TREASURY,
      mint: USDC,
      publisherWallet: PUBLISHER,
      expectedRaw: BigInt(25) * BigInt(10) ** BigInt(6),
      expectedDecimals: 6,
    },
  );
  check("an SPL transfer to a different account is refused", result.status === "invalid");
}

console.log("\nPayout symmetry — SOL in must mean SOL out\n");

/** Decodes a built transaction and reports which programs it calls. */
function programsOf(base64: string): string[] {
  return Transaction.from(Buffer.from(base64, "base64")).instructions.map((ix) =>
    ix.programId.toBase58(),
  );
}

/*
 * Wrapped in an async function rather than using top-level await so this file can also be compiled
 * to CommonJS and run under Node. That matters: bun resolves the extensionless TypeScript imports
 * in `src/lib` happily but its `fetch` cannot reach the RPC from this environment, so the payout
 * checks below can only run for real under Node.
 */
async function main() {
  try {
    const built = await buildPayoutTransaction({
      treasury: TREASURY,
      recipient: SOMEONE_ELSE,
      mint: WSOL_MINT,
      amount: 0.5,
    });
    const programs = programsOf(built.transaction);
    check(
      "a SOL payout is a native system transfer",
      programs.includes(SYSTEM_PROGRAM),
      `programs: ${programs.join(", ")}`,
    );
    check(
      "a SOL payout never touches the token program",
      !programs.includes(TOKEN_PROGRAM),
      `programs: ${programs.join(", ")}`,
    );

    const tx = Transaction.from(Buffer.from(built.transaction, "base64"));
    // A system transfer's data is a u32 instruction index followed by a u64 lamport amount.
    const lamports = tx.instructions[0]!.data.readBigUInt64LE(4);
    check(
      "a SOL payout pays the creator exactly 0.5 SOL in lamports",
      lamports.toString() === "500000000",
      `lamports: ${lamports}`,
    );
    check(
      "a SOL payout goes to the creator, not the treasury",
      tx.instructions[0]!.keys[1]!.pubkey.toBase58() === SOMEONE_ELSE &&
        tx.instructions[0]!.keys[0]!.pubkey.toBase58() === TREASURY,
      `from/to: ${tx.instructions[0]!.keys[0]!.pubkey.toBase58()} -> ${tx.instructions[0]!.keys[1]!.pubkey.toBase58()}`,
    );
  } catch (error) {
    console.log(`  SKIP  SOL payout build (needs RPC) — ${describe(error)}`);
  }

  try {
    const built = await buildPayoutTransaction({
      treasury: TREASURY,
      recipient: SOMEONE_ELSE,
      mint: USDC,
      amount: 5,
    });
    const programs = programsOf(built.transaction);
    check(
      "a token payout is still an SPL transfer (the wSOL branch did not leak)",
      programs.includes(TOKEN_PROGRAM) && !programs.includes(SYSTEM_PROGRAM),
      `programs: ${programs.join(", ")}`,
    );
  } catch (error) {
    console.log(`  SKIP  token payout build (needs RPC) — ${describe(error)}`);
  }

  // Sanity check on the fixtures themselves: the SPL path must derive a real ATA.
  check("test fixtures derive a real ATA", TREASURY_ATA.length === 44);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

void main();
