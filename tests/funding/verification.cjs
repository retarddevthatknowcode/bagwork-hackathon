/**
 * On-chain funding verification — the money rules.
 *
 * A bag must not become payable because someone posted a transaction hash at us. These checks
 * decide whether a publisher's transfer really delivered the budget to the Bagwork treasury, so
 * every branch is exercised here rather than trusted by eye: the happy paths, each way a
 * transfer can fall short, and the live behaviour against mainnet.
 *
 * Run it with:
 *
 *   npx tsc src/lib/solana/funding.ts src/lib/solana/connection.ts ^
 *     --outDir tests/funding/.compiled --module commonjs --target es2020 ^
 *     --moduleResolution node --esModuleInterop --skipLibCheck
 *   node tests/funding/verification.cjs
 *
 * The live section reads `.env` and needs `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta`. Without it
 * the app resolves to devnet, where no mainnet transaction exists, so the live checks report
 * "not confirmed yet" instead of the truth.
 */
require('dotenv').config({ quiet: true });
const { checkFundingTransaction, verifyFundingTransfer } = require('./.compiled/funding.js');
const { getAssociatedTokenAddress } = require("@solana/spl-token");
const { PublicKey, Connection, Keypair } = require("@solana/web3.js");

const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC
const OTHER_MINT = "So11111111111111111111111111111111111111112"; // wSOL
const TREASURY = "Dq8DGtjMNxojGctpVduXxAVNbjKd4njjwwYh7nsLonoD";
const PUBLISHER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
// Generated rather than hardcoded: a well-known address is often off-curve (a PDA or the
// incinerator), and deriving a token account for one throws instead of returning an address.
const STRANGER = Keypair.generate().publicKey.toBase58();

let pass = 0;
let fail = 0;
function check(name, condition, detail) {
  if (condition) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

const key = (addr) => ({ pubkey: { toBase58: () => addr }, signer: false });
const signerKey = (addr) => ({ pubkey: { toBase58: () => addr }, signer: true });

function fakeTx({ signer = PUBLISHER, instructions = [], inner = [], err = null }) {
  return {
    meta: {
      err,
      innerInstructions: inner.length ? [{ index: 0, instructions: inner }] : [],
    },
    transaction: {
      message: { accountKeys: [signerKey(signer), key(TREASURY)], instructions },
    },
  };
}

const checked = (destination, amount, mint = MINT, decimals = 6) => ({
  parsed: {
    type: "transferChecked",
    info: { destination, mint, tokenAmount: { amount: String(amount), decimals } },
  },
});

const bare = (destination, amount) => ({
  parsed: { type: "transfer", info: { destination, amount: String(amount) } },
});

(async () => {
  const treasuryAta = (
    await getAssociatedTokenAddress(new PublicKey(MINT), new PublicKey(TREASURY))
  ).toBase58();
  const strangerAta = (
    await getAssociatedTokenAddress(new PublicKey(MINT), new PublicKey(STRANGER))
  ).toBase58();

  // 2500 USDC, at 6 decimals.
  const BUDGET_RAW = 2500n * 10n ** 6n;
  const params = {
    treasuryAta,
    mint: MINT,
    publisherWallet: PUBLISHER,
    expectedRaw: BUDGET_RAW,
    expectedDecimals: 6,
  };
  const run = (tx) => checkFundingTransaction(tx, params);

  console.log("\n--- accepted: genuine funding transfers ---");

  let r = run(fakeTx({ instructions: [checked(treasuryAta, BUDGET_RAW)] }));
  check("exact budget to the treasury ATA -> verified", r.status === "verified", r.reason);
  check(
    "  reports the received amount",
    r.status === "verified" && r.funding.received === 2500,
    r.status === "verified" ? String(r.funding.received) : r.reason,
  );

  r = run(fakeTx({ instructions: [checked(treasuryAta, BUDGET_RAW + 5_000_000n)] }));
  check("overpaid -> verified", r.status === "verified", r.reason);
  check(
    "  reports what actually arrived, not the budget",
    r.status === "verified" && r.funding.received === 2505,
    r.status === "verified" ? String(r.funding.received) : "",
  );

  r = run(fakeTx({ inner: [checked(treasuryAta, BUDGET_RAW)] }));
  check(
    "routed through a program (inner instruction) -> verified",
    r.status === "verified",
    r.reason,
  );

  r = run(fakeTx({ instructions: [bare(treasuryAta, BUDGET_RAW)] }));
  check("bare transfer to the treasury ATA -> verified", r.status === "verified", r.reason);

  r = run(
    fakeTx({
      instructions: [
        checked(treasuryAta, BUDGET_RAW / 2n),
        checked(treasuryAta, BUDGET_RAW / 2n),
      ],
    }),
  );
  check("two transfers summing to the budget -> verified", r.status === "verified", r.reason);

  console.log("\n--- refused: transfers that do not fund the bag ---");

  r = run(fakeTx({ instructions: [checked(treasuryAta, BUDGET_RAW - 1_000_000n)] }));
  check("one dollar short -> invalid", r.status === "invalid", r.status);
  check(
    "  says how much arrived",
    r.status === "invalid" && r.reason.includes("Only 2499"),
    r.status === "invalid" ? r.reason : "",
  );

  r = run(fakeTx({ instructions: [checked(strangerAta, BUDGET_RAW)] }));
  check("sent to someone else's account -> invalid", r.status === "invalid", r.status);
  check(
    "  says it did not reach the treasury",
    r.status === "invalid" && r.reason.includes("Bagwork treasury"),
    r.status === "invalid" ? r.reason : "",
  );

  r = run(fakeTx({ instructions: [checked(treasuryAta, BUDGET_RAW, OTHER_MINT, 9)] }));
  check("wrong mint -> invalid", r.status === "invalid", r.status);

  r = run(fakeTx({ instructions: [checked(treasuryAta, BUDGET_RAW, MINT, 9)] }));
  check("wrong decimals -> invalid", r.status === "invalid", r.status);
  check(
    "  explains the decimals mismatch",
    r.status === "invalid" && r.reason.includes("decimals"),
    r.status === "invalid" ? r.reason : "",
  );

  r = run(fakeTx({ instructions: [{ parsed: { type: "swap", info: {} } }] }));
  check("no transfer at all -> invalid", r.status === "invalid", r.status);

  r = run(fakeTx({ instructions: [bare(strangerAta, BUDGET_RAW)] }));
  check("bare transfer to the wrong account -> invalid", r.status === "invalid", r.status);

  r = run(
    fakeTx({
      err: { InstructionError: [0, "Custom"] },
      instructions: [checked(treasuryAta, BUDGET_RAW)],
    }),
  );
  check("transaction failed on-chain -> invalid", r.status === "invalid", r.status);
  check(
    "  says no money moved",
    r.status === "invalid" && r.reason.includes("no money moved"),
    r.status === "invalid" ? r.reason : "",
  );

  r = run(fakeTx({ signer: STRANGER, instructions: [checked(treasuryAta, BUDGET_RAW)] }));
  check("signed by a stranger -> invalid", r.status === "invalid", r.status);
  check(
    "  names the wrong signer",
    r.status === "invalid" && r.reason.includes(STRANGER),
    r.status === "invalid" ? r.reason : "",
  );

  console.log("\n--- live mainnet RPC ---");
  const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

  let live = await verifyFundingTransfer({
    signature: "A".repeat(88),
    mint: MINT,
    treasury: TREASURY,
    publisherWallet: PUBLISHER,
    expectedRaw: BUDGET_RAW,
    expectedDecimals: 6,
  });
  check(
    "unknown signature -> pending (retryable, not a failure)",
    live.status === "pending",
    `${live.status}: ${live.reason}`,
  );

  const recent = await connection.getSignaturesForAddress(new PublicKey(MINT), { limit: 25 });
  if (recent.length > 0) {
    const settled = recent.filter((s) => !s.err); let realSig = null; for (let i = settled.length - 1; i >= 0 && !realSig; i--) { const probe = await connection.getParsedTransaction(settled[i].signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }); if (probe) realSig = settled[i].signature; } if (!realSig) throw new Error("no visible transaction to probe");
    live = await verifyFundingTransfer({
      signature: realSig,
      mint: MINT,
      treasury: TREASURY,
      publisherWallet: PUBLISHER,
      expectedRaw: BUDGET_RAW,
      expectedDecimals: 6,
    });
    check(
      `a real, unrelated mainnet tx (${realSig.slice(0, 8)}...) -> invalid, never verified`,
      live.status === "invalid",
      `${live.status}: ${live.reason}`,
    );
    console.log(`       (reason: ${live.reason})`);
  } else {
    console.log("  skip  real-tx check (no signatures returned)");
  }

  console.log(`\nPASS ${pass} / FAIL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((error) => {
  console.error("harness error:", error);
  process.exit(2);
});

