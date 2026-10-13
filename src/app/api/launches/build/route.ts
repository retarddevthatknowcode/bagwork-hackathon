import { LAMPORTS_PER_SOL, PublicKey, type Connection } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { discardBagReservation, reserveBagForLaunch } from "@/lib/launch/bag";
import { MAX_DEV_BUY_BPS, launchAvailability } from "@/lib/launch/config";
import { isFetchableImageUrl } from "@/lib/site";
import { campaignPageUrl, absoluteUrl } from "@/lib/site";
import { logApiFailure } from "@/lib/ops/log";
import {
  MAX_TRANSACTION_BYTES,
  buildLaunchPlan,
  estimateLaunchCosts,
  simulateLaunch,
} from "@/lib/launch/instructions";
import { storeTokenMetadata } from "@/lib/launch/metadata";
import { DEV_BUY_CAP_MESSAGE, readLaunchDraft, type LaunchDraft } from "@/lib/launch/wizard";
import { SOLANA_CAIP2 } from "@/lib/privy/config";
import { getServerConnection, isValidSolanaAddress } from "@/lib/solana/connection";
import { isConfiguredTreasury } from "@/lib/solana/treasury";

export const dynamic = "force-dynamic";

/**
 * POST /api/launches/build — the unsigned launch transactions.
 *
 * Plural, because the launch does not fit in one. `create_v2` plus the fee-sharing config plus the
 * share update serialise to well past Solana's 1232-byte packet limit, so a launch is two steps —
 * create, then lock 100% of creator fees — and three when the launcher chose a dev buy, which cannot
 * ride in the create and gets its own step between them. Each step is measured before it is
 * returned; see `buildLaunchPlan`.
 *
 * This is the one route that assembles real value movement: a coin creation, a fee-sharing config,
 * and a permanent 100% share lock. Nothing here signs anything, and nothing here holds a key — the
 * mint is generated in the browser, so the launcher's wallet and their own keypair are the only
 * signatures involved.
 *
 * It refuses to build, with a reason, in every case where the result could not be trusted:
 *
 *   - the flow is not armed on this deployment,
 *   - the draft does not pass the shared authoring rules,
 *   - the dev buy exceeds 10% of supply *on the real bonding-curve quote*,
 *   - the mint has already been launched here,
 *   - a step does not fit in a packet,
 *   - or the create does not simulate.
 *
 * That last one is deliberately a hard stop rather than a warning. A launch that would fail on-chain
 * costs the launcher a fee and a wallet prompt for nothing, and it is far better to say so before
 * they approve it than after.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in required to launch a coin" }, { status: 401 });
  }

  const availability = launchAvailability();
  if (!availability.enabled || !availability.treasury) {
    return NextResponse.json({ error: availability.reason }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = readLaunchDraft(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const draft = parsed.draft;

  /**
   * Which wallet signs, and which mint is being created.
   *
   * Both come from the client because both must sign: the launcher pays and authorises, and
   * `create_v2` requires the fresh mint's own signature. The server never generates or holds either
   * key — it is handed two public addresses and builds instructions for them.
   *
   * The wallet is validated rather than trusted, and falls back to the one on the profile, so a
   * request cannot direct the transaction out of an account the caller does not control.
   */
  const requestedWallet = String(body.wallet ?? "").trim();
  const signer = requestedWallet || session.user.walletAddress || "";
  if (!isValidSolanaAddress(signer)) {
    return NextResponse.json(
      {
        error:
          "Link a Solana wallet to your account first — the launch is paid for from your wallet.",
      },
      { status: 400 },
    );
  }

  /*
   * A Bagwork treasury is never a launcher.
   *
   * The page states this out loud — "Bagwork never launches from the fee treasury", and of the fee
   * treasury, "is never used to launch a coin" — and until now nothing enforced it. A treasury in
   * the launcher slot would put the create, the rent and any dev buy on the wallet that exists only
   * to hold creator fees, which is precisely the mixing the dual-treasury split exists to prevent
   * and the one thing this flow promises cannot happen.
   *
   * Refused here rather than left to the client's own check: the client check is for the person
   * typing, this one is for the guarantee. It also means an operator poking at the flow with a
   * treasury connected gets a clear sentence instead of a wallet prompt for a transaction that
   * spends the wrong wallet's money.
   */
  if (isConfiguredTreasury(signer)) {
    return NextResponse.json(
      {
        error:
          "That is a Bagwork treasury wallet, so it cannot launch a coin. Connect your own wallet — the launch and any dev buy are paid from it, and the treasury only ever receives this coin's fees.",
      },
      { status: 400 },
    );
  }

  const mint = String(body.mint ?? "").trim();
  if (!isValidSolanaAddress(mint)) {
    return NextResponse.json(
      { error: "The mint for this launch is missing or is not a valid address." },
      { status: 400 },
    );
  }

  /*
   * The mint is the launch's identity, so it is checked before anything is built. A mint that already
   * has a launch row here is either a retry or a re-submission of a coin that is already live; both
   * must not produce a second `create_v2`, which would fail on-chain anyway but only after the
   * launcher had approved a wallet prompt.
   */
  const existing = await db.launch.findUnique({ where: { mint }, select: { id: true } });
  if (existing) {
    return NextResponse.json(
      { error: "This mint has already been launched through Bagwork." },
      { status: 409 },
    );
  }

  const treasury = availability.treasury;
  const connection = getServerConnection();

  try {
    return await buildAndRespond({
      draft,
      signer,
      mint,
      treasury,
      connection,
      sessionUserId: session.user.id,
      rawImage: String(body.imageUrl ?? "").slice(0, 300),
    });
  } catch (error) {
    void logApiFailure(req, {
      category: "launch",
      title: "Launch build failed",
      error,
      status: 502,
    });
    console.error("[api/launches/build] failed", error);
    return NextResponse.json(
      {
        error: `Could not build this launch — ${
          error instanceof Error && error.message ? error.message : "unknown error"
        }`,
      },
      { status: 502 },
    );
  }
}

interface BuildAndRespondParams {
  draft: LaunchDraft;
  signer: string;
  mint: string;
  treasury: string;
  connection: Connection;
  sessionUserId: string;
  /**
   * The image value exactly as the request carried it, before the draft reader touched it.
   *
   * Only used for the refusal log. When the reader drops a value, "missing image" in the logs cannot
   * distinguish a client that sent nothing from one that sent something this app would not accept —
   * and that ambiguity is what made this bug take several attempts to place.
   */
  rawImage: string;
}

/**
 * The build itself, split out so the route's guard clauses stay readable.
 *
 * The order below is the point of the function:
 *
 *   1. price the launch and refuse an over-large dev buy, *before* anything exists,
 *   2. host the metadata, because the URI is an input to the instruction,
 *   3. record the launch, so the mint is reserved and an abandoned launch still leaves a trace,
 *   4. build, then simulate — and refuse to offer anything that does not simulate.
 */
async function buildAndRespond({
  draft,
  signer,
  mint,
  treasury,
  connection,
  sessionUserId,
  rawImage,
}: BuildAndRespondParams) {
  const costs = await estimateLaunchCosts({
    connection,
    solLamports: Math.round(draft.devBuySol * LAMPORTS_PER_SOL),
  });

  if (costs.devBuyLamports > 0 && !costs.withinCap) {
    return NextResponse.json({ error: DEV_BUY_CAP_MESSAGE }, { status: 422 });
  }

  /*
   * ---- the artwork is required, and has to be reachable ------------------------------------
   *
   * Checked here, *before* anything is reserved, so a launch that cannot be finished never creates
   * a DRAFT bag. It is required rather than optional because the image goes into the coin's
   * metadata, which is written on-chain and can never be corrected: a coin launched without one
   * shows the pump placeholder in every wallet for its whole life. The one real launch so far
   * shipped exactly that way.
   */
  if (!draft.imageUrl) {
    /*
     * Logged with the raw value, because this refusal was opaque for a whole session: the wizard
     * showed a picture and the server said there was none, and nothing in the logs separated "the
     * client sent nothing" from "the client sent something the draft reader would not accept".
     */
    console.warn("[api/launches/build] no usable image on the draft", {
      received: rawImage || "(absent)",
    });
    return NextResponse.json(
      {
        error:
          "Add a token image before launching. It becomes the coin's picture in every wallet and " +
          "pump, and it cannot be changed afterwards.",
      },
      { status: 422 },
    );
  }

  const imageUrl = draft.imageUrl.startsWith("/")
    ? absoluteUrl(draft.imageUrl)
    : draft.imageUrl;
  if (!isFetchableImageUrl(imageUrl)) {
    console.warn("[api/launches/build] image is not publicly fetchable", {
      received: rawImage || "(absent)",
      absolutised: imageUrl,
    });
    return NextResponse.json(
      {
        error:
          `That image (${imageUrl}) cannot be fetched from outside this app, so wallets would show ` +
          `nothing. Upload it again.`,
      },
      { status: 422 },
    );
  }

  /*
   * ---- reserve this launch's bag, before anything is signed ---------------------------------
   *
   * The coin's metadata has to name this bag's own page, and the id is what makes that URL unique —
   * so the row is written first and the metadata is built from it. It is left DRAFT: nothing is
   * confirmed yet, and it opens only once the chain says the fees are locked.
   *
   * Everything below this line can fail, and none of it should leave a reservation behind, so the
   * rest of the build sits inside a `try`. Nothing has been signed at this stage — the client has not
   * even been handed a transaction — which is what makes tidying up exact rather than optimistic.
   */
  const bag = await reserveBagForLaunch({
    launcherUserId: sessionUserId,
    mint,
    treasury,
    draft,
  });
  const campaignUrl = campaignPageUrl(bag.id);

  try {
    const metadata = await storeTokenMetadata({
      userId: sessionUserId,
      draft,
      website: campaignUrl,
    });

    const launch = await db.launch.create({
      data: {
        mint,
        name: draft.name,
        symbol: draft.symbol,
        imageUrl: draft.imageUrl,
        description: draft.description,
        metadataUri: metadata.url,
        launcherUserId: sessionUserId,
        launcherWallet: signer,
        status: "pending",
        devBuyLamports: BigInt(costs.devBuyLamports),
        devBuyBps: costs.devBuyBps,
        treasury,
        // Pinned to the bag reserved above, so verification has nothing to look up or guess at.
        bagId: bag.id,
      },
      select: { id: true },
    });

    const plan = await buildLaunchPlan({
      connection,
      launcher: new PublicKey(signer),
      mint: new PublicKey(mint),
      name: draft.name,
      symbol: draft.symbol,
      uri: metadata.url,
      devBuyLamports: costs.devBuyLamports,
      treasury: new PublicKey(treasury),
    });

  /*
   * Only the create step is simulated.
   *
   * The later steps cannot be: their accounts are PDAs the create is about to bring into being, so a
   * pre-flight would fail for a reason that says nothing about whether the launch is good. Their
   * correctness is established the way it actually matters — `verifyLaunch` reads the sharing config
   * back off the chain before any bag is created, and refuses the launch unless the lock is exactly
   * 100% to the treasury.
   */
    const createStep = plan.steps.find((step) => step.kind === "create");
    if (!createStep) {
      await discardBagReservation(bag);
      return NextResponse.json(
        { error: "The launch could not be built: the create step is missing." },
        { status: 500 },
      );
    }

    const simulation = await simulateLaunch(connection, createStep.transaction);
    if (!simulation.ok) {
      /*
       * Refused, not warned about. The reservation goes back with the refusal: the launcher was never
       * asked to sign this, so there is nothing to remember and nothing on-chain needing a bag.
       * Showing a wallet prompt for a transaction the chain has already said it will reject is the
       * one outcome this route exists to prevent.
       */
      await discardBagReservation(bag);
      return NextResponse.json(
        {
          error:
            `This launch would fail on-chain, so it was not offered for signing: ${
              simulation.error ?? "the simulation returned an error"
            }`,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      launchId: launch.id,
      /*
       * The bag reserved for this launch, and its page. `campaignUrl` is the same string written into
       * the coin's metadata as `website`, returned so the form can show the launcher exactly where
       * their coin will point — before they sign, which is the only moment it could still surprise
       * them.
       */
      campaignId: bag.id,
      campaignUrl,
      /**
       * The steps, in order, each handed to the wallet as the exact bytes the server produced —
       * serialised with `verifySignatures: false` so the empty signature slots are present for the
       * wallet to fill, including the mint's place in the create step, which the client fills with
       * the keypair it generated.
       *
       * Always two steps for a plain launch (create, then lock fees) and three when the launcher
       * chose a dev buy (create, dev buy, lock fees). `buildLaunchPlan` has already measured every
       * step against the packet limit and refused anything that would not fit; the sizes are returned
       * so the constraint is visible to whoever is debugging, rather than only enforced.
       */
      steps: plan.steps.map((step) => ({
        kind: step.kind,
        bytes: step.bytes,
        transaction: Buffer.from(
          step.transaction.serialize({ requireAllSignatures: false, verifySignatures: false }),
        ).toString("base64"),
      })),
      maxStepBytes: MAX_TRANSACTION_BYTES,
      from: signer,
      mint,
      treasury,
      metadataUri: metadata.url,
      /** The cluster the blockhash came from, so the wallet is asked to sign for the right one. */
      chain: SOLANA_CAIP2,
      costs,
      maxDevBuyBps: MAX_DEV_BUY_BPS,
    });
  } catch (error) {
    /*
     * Nothing was signed, so the reservation is undone rather than left as a DRAFT bag nobody will
     * ever reach — and the original error is rethrown, because the reason the build failed is the
     * useful part and a cleanup must never replace it.
     */
    await discardBagReservation(bag);
    throw error;
  }
}

