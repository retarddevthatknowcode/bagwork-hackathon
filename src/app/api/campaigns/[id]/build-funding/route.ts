import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getMint,
} from "@solana/spl-token";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { KNOWN_TOKENS } from "@/lib/campaigns/authoring";
import { SOLANA_CAIP2, USDC_DECIMALS, USDC_MINT } from "@/lib/privy/config";
import {
  getServerConnection,
  isValidSolanaAddress,
  withRpcFallback,
} from "@/lib/solana/connection";
import { WSOL_MINT } from "@/lib/solana/constants";
import { getTokenBalance } from "@/lib/solana/payments";
import {
  isConfiguredTreasury,
  treasuryAddressFor,
  treasuryKindFor,
} from "@/lib/solana/treasury";

export const dynamic = "force-dynamic";

/**
 * The USDC mints this app treats as dollars.
 *
 * The canonical mint for the active cluster, plus the mainnet one — which are the same address on
 * mainnet and differ on devnet. A bag priced in "USDC" whose mint is anything else is not priced in
 * dollars, and every amount the UI shows it would be a lie about.
 */
const USDC_MINTS = new Set([KNOWN_TOKENS.USDC.mint, USDC_MINT]);

/**
 * POST /api/campaigns/[id]/build-funding — the unsigned transfer that funds a bag.
 *
 * The publisher signs this with their own wallet to move the full budget into the Bagwork
 * treasury. Nothing here signs anything, and nothing here decides where the money goes: the
 * destination is read from the campaign, which was pinned to the treasury at creation. A
 * client cannot redirect its own deposit.
 *
 * Built server-side rather than in the browser for the same reason payouts are: the SPL
 * associate-token-account derivation, the decimals and the rent-exempt check all have to
 * agree with what the payout path will later expect, and that agreement is only guaranteed
 * if one place computes it.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id } = await params;

  const campaign = await db.campaign.findUnique({
    where: { id },
    include: { project: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Bag not found" }, { status: 404 });
  }
  if (campaign.createdBy !== session.user.id) {
    return NextResponse.json(
      { error: "Only the publisher who created this bag can fund it" },
      { status: 403 },
    );
  }
  if (campaign.status !== "DRAFT") {
    return NextResponse.json(
      { error: `This bag is already ${campaign.status.toLowerCase()}` },
      { status: 409 },
    );
  }

  const { tokenMint, tokenSymbol, tokenName } = campaign.project;

  /**
   * Which wallet will sign.
   *
   * The client tells us which of its connected wallets it is about to use, because a Privy session
   * can hold more than one (an embedded wallet and Phantom, say) and the profile only records one of
   * them. Building from the wallet that will actually sign is what stops the transaction being
   * rejected after the user has already approved it in their wallet UI.
   *
   * Safe because only this bag's creator can reach here, so a publisher can only ever direct a
   * transfer out of a wallet they control. It is recorded on the campaign, and `POST /fund` then
   * requires exactly this wallet as the signer.
   */
  const requestedWallet = String(
    ((await req.json().catch(() => ({}))) as { wallet?: string }).wallet ?? "",
  ).trim();
  const signer = requestedWallet || session.user.walletAddress || "";
  if (!isValidSolanaAddress(signer)) {
    return NextResponse.json(
      {
        error:
          "Link a Solana wallet to your account first — the budget is transferred from your own wallet.",
      },
      { status: 400 },
    );
  }

  const from = new PublicKey(signer);

  /*
   * The treasury can never be the publisher.
   *
   * `isConfiguredTreasury` is the same guard the launch flow applies to a coin's dev wallet, and it
   * is here for the same reason: a Bagwork treasury sitting in the funding slot is not a cosmetic
   * mix-up, it is the wallet holding every other bag's money being used to fund one. The keys are
   * server-side only, so this is not a route to a treasury signing anything — but a deposit *from*
   * a treasury address would corrupt the accounting, crediting one pooled wallet's outflow to a
   * single bag's budget, and it can never be a legitimate publisher action.
   */
  if (isConfiguredTreasury(signer)) {
    return NextResponse.json(
      {
        error:
          "That wallet is a Bagwork treasury and cannot fund a bag. Connect the publisher's own wallet.",
      },
      { status: 403 },
    );
  }

  /*
   * The destination is re-derived, not read back.
   *
   * A fixed-budget bag's money belongs in the FIXED treasury, and the address it was pinned to at
   * creation has to still be that address. Checking it here means a deployment whose treasury env
   * moved refuses the transfer *before* the publisher is asked to approve anything, rather than
   * accepting a deposit into a wallet this app will never pay out of. `POST /fund` and the Alchemy
   * webhook re-check the same thing when the money arrives; this is the earliest of the three.
   */
  const treasuryKind = treasuryKindFor(campaign);
  const pinnedTreasury = treasuryAddressFor(treasuryKind);
  if (!pinnedTreasury || pinnedTreasury !== campaign.treasury) {
    return NextResponse.json(
      {
        error:
          "The Bagwork treasury changed after this bag was created, so its budget cannot be sent. Contact support.",
      },
      { status: 409 },
    );
  }
  /*
   * Native SOL is transferred as SOL, not wrapped SOL.
   *
   * A wallet holds SOL; requiring wSOL would mean every publisher had to wrap it first, which is why
   * a SOL budget could never be funded. The treasury receives lamports, and since both lamports and
   * wSOL base units are 9-decimal, the amount counts against the budget identically.
   */
  const isNativeSol = tokenMint === WSOL_MINT;

  try {
    const treasury = new PublicKey(campaign.treasury);

    // Read decimals from the mint rather than trusting the stored column: this is the last chance to
    // catch a mismatch, and a wrong exponent here means sending 10,000× too much.
    const decimals = isNativeSol
      ? 9
      : (await withRpcFallback((conn) => getMint(conn, new PublicKey(tokenMint)))).decimals;

    const budget = Number(campaign.budget);
    if (!Number.isFinite(budget) || budget <= 0) {
      return NextResponse.json(
        { error: "This bag's budget is not a positive amount" },
        { status: 422 },
      );
    }

    /*
     * A USDC bag has to actually be priced in USDC.
     *
     * `readToken` maps the USDC kind to a known mint, so this can only trip on a row written some
     * other way — a hand-edited campaign, or a `NEXT_PUBLIC_USDC_MINT` pointed at a stand-in token.
     * It is worth refusing because every figure the publisher has just been shown is denominated in
     * dollars: the budget, the slot count, the per-post ceiling and the $5 minimum. Sending a
     * different token would fund the bag with an amount of something that is not the amount it
     * advertises, and the six decimals every one of those figures is scaled by would be wrong too.
     */
    if (!isNativeSol && tokenSymbol.toUpperCase() === "USDC") {
      if (!USDC_MINTS.has(tokenMint)) {
        return NextResponse.json(
          {
            error:
              "This bag is priced in USDC but its token is not USDC, so its budget cannot be sent. Contact support.",
          },
          { status: 422 },
        );
      }
      if (decimals !== USDC_DECIMALS) {
        return NextResponse.json(
          {
            error: `This bag is priced in USDC but its mint reports ${decimals} decimals instead of ${USDC_DECIMALS}, so every amount would be wrong. Contact support.`,
          },
          { status: 422 },
        );
      }
    }

    const transaction = new Transaction();

    if (isNativeSol) {
      const lamports = BigInt(Math.round(budget * 1e9));
      if (lamports <= BigInt(0)) {
        return NextResponse.json(
          { error: "This bag's budget rounds to zero lamports" },
          { status: 422 },
        );
      }
      transaction.add(
        SystemProgram.transfer({ fromPubkey: from, toPubkey: treasury, lamports }),
      );
    } else {
      const mint = new PublicKey(tokenMint);
      const raw = BigInt(Math.round(budget * 10 ** decimals));
      if (raw <= BigInt(0)) {
        return NextResponse.json(
          { error: "This bag's budget rounds to zero in raw units" },
          { status: 422 },
        );
      }

      const source = await getAssociatedTokenAddress(mint, from);
      const destination = await getAssociatedTokenAddress(mint, treasury);

      /*
       * The sender's token account must already exist.
       *
       * A transfer out of a non-existent account fails on-chain with an opaque error *after* the
       * wallet prompt — the worst possible timeline. Checking here turns it into "this wallet holds
       * no USDC", before anything is signed.
       */
      const sourceInfo = await withRpcFallback((conn) =>
        conn.getAccountInfo(source, "confirmed"),
      );
      if (!sourceInfo) {
        return NextResponse.json(
          {
            error: `This wallet holds no ${tokenSymbol}. Add ${tokenSymbol} to ${signer.slice(0, 4)}…${signer.slice(-4)} and try again.`,
          },
          { status: 422 },
        );
      }

      /*
       * And it has to hold enough.
       *
       * The account existing is not the same as the budget being payable: a wallet with $1 against
       * a $5 bag used to get all the way through the wallet prompt and then fail on-chain with a
       * program error nobody can read, which reads as "the transfer button is broken" rather than
       * "this wallet is short". Comparing the balance here turns it into a sentence with the
       * shortfall in it, before anything is signed and before any fee is paid.
       */
      const held = await getTokenBalance(signer, tokenMint);
      if (held.amount + 1e-9 < budget) {
        const shortfall = Number((budget - held.amount).toFixed(6));
        return NextResponse.json(
          {
            error: `This wallet holds ${held.amount} ${tokenSymbol} and the budget is ${budget} ${tokenSymbol}. Add ${shortfall} more to ${signer.slice(0, 4)}…${signer.slice(-4)} and try again.`,
          },
          { status: 422 },
        );
      }

      // The treasury's token account may not exist yet. Creating it is the sender's cost (a few
      // thousand lamports) and is required, otherwise the transfer has nowhere to land.
      const destinationInfo = await withRpcFallback((conn) =>
        conn.getAccountInfo(destination, "confirmed"),
      );
      if (!destinationInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(from, destination, treasury, mint),
        );
      }

      // `transferChecked` carries the mint and decimals, so a mismatch fails on-chain instead of
      // moving the wrong amount out of the publisher's wallet.
      transaction.add(
        createTransferCheckedInstruction(source, mint, destination, from, raw, decimals),
      );
    }

    const { blockhash } = await withRpcFallback((conn) => conn.getLatestBlockhash("confirmed"));
    transaction.feePayer = from;
    transaction.recentBlockhash = blockhash;

    await db.campaign.update({
      where: { id: campaign.id },
      data: { fundingWallet: signer },
    });

    return NextResponse.json({
      transaction: Buffer.from(
        transaction.serialize({ requireAllSignatures: false, verifySignatures: false }),
      ).toString("base64"),
      /** The wallet that must sign — the only one that can authorise this transfer. */
      from: signer,
      /**
       * The CAIP-2 chain this was built for. Returned rather than derived on the client, so the
       * wallet is always asked to sign for the cluster the blockhash came from — deriving it in two
       * places is how a transaction gets offered to the wrong network.
       */
      chain: SOLANA_CAIP2,
      kind: isNativeSol ? "sol" : "spl",
      amount: budget,
      decimals,
      symbol: tokenSymbol,
      name: tokenName ?? campaign.project.name,
      mint: tokenMint,
      treasury: campaign.treasury,
    });
  } catch (error) {
    // A build failure is the operator's problem to diagnose, so the reason is surfaced
    // rather than flattened into a generic 500.
    console.error("[api/campaigns/build-funding] failed", error);
    return NextResponse.json(
      {
        error: `Could not build the transfer — ${
          error instanceof Error && error.message ? error.message : "unknown RPC error"
        }`,
      },
      { status: 502 },
    );
  }
}
