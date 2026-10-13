import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { USDC_MINT } from "@/lib/privy/config";
import { rateTypeFor } from "@/lib/mappers";

import { TOTAL_SHARE_BPS } from "./config";
import type { LaunchDraft } from "./wizard";

/** The shape `mapCampaign` needs: a campaign row with its project loaded. */
export type CampaignWithProject = Prisma.CampaignGetPayload<{ include: { project: true } }>;

/**
 * Turning a verified launch into the content bag it was launched for.
 *
 * This is the "auto-create the Flywheel Campaign" step, and the reason it runs *after* on-chain
 * verification rather than before: a bag is a promise that creators will be paid out of a coin's
 * trading fees, so it may not exist until the chain has confirmed those fees are actually locked
 * here. Creating it optimistically would mean a bag could sit in the marketplace advertising a
 * growing budget that will never arrive.
 *
 * The bag starts at zero on purpose. `budget`, `fundedAmount` and `slotsRemaining` are all 0: no
 * money exists yet, and no claimable slot exists until fees fund one. The fee sync raises all three
 * as deposits convert — the same path a manually-created Fee Redirect bag uses, so the two cannot
 * drift apart in how a flywheel pays out.
 */

/** Every launched bag is an RPM bag: pay per 1,000 views, capped per post. */
const LAUNCH_PAYMENT_MODEL = "RPM";
/** pump coins are minted with 6 decimals; the wizard never lets a launcher change that. */
const PUMP_TOKEN_DECIMALS = 6;

export interface ReserveBagForLaunchParams {
  /** The user who launched, taken from the session rather than the request body. */
  launcherUserId: string;
  /** The new coin's mint, generated client-side. An address, not a key — the server holds none. */
  mint: string;
  /** The FEE treasury 100% of creator fees will be locked to. */
  treasury: string;
  draft: LaunchDraft;
}

export interface ActivateLaunchedBagParams {
  /** The bag reserved for this launch. */
  campaignId: string;
  /** Checked against the row, so only the launcher can promote their own bag. */
  launcherUserId: string;
  /**
   * The share the chain says the treasury holds — read off the sharing config, not assumed to be 100.
   *
   * Stored rather than asserted, for the same reason the verification reads it at all: a bag whose
   * advertised funding rests on a number nobody checked is the failure this whole path exists to
   * prevent.
   */
  feeRedirectPct: number;
}

/**
 * Reserves the bag a launch is about to create, **before anything is signed**.
 *
 * It runs first for one structural reason: the coin's metadata has to point at this bag's own page,
 * and the bag's id is what makes that URL unique. The id cannot be invented by the client (two
 * launchers must not be able to collide, and the client is not trusted), and it cannot be added
 * afterwards — the URI is embedded in `create_v2`, and the document it names is immutable once the
 * coin exists. So the row comes first and the metadata is built from it.
 *
 * The bag is **DRAFT**, not LIVE, because nothing about it is confirmed yet: the launcher has not
 * even been asked to sign. DRAFT is the existing "created but not funded" state, already excluded
 * from every listing, so a launch that is abandoned or fails leaves an invisible row rather than a
 * fake live one. `activateLaunchedBag` promotes it once the chain confirms the fee lock.
 *
 * It starts at zero on purpose. `budget`, `fundedAmount` and `slotsRemaining` are all 0: no money
 * exists yet, and no claimable slot exists until fees fund one. The fee sync raises all three as
 * deposits convert — the same path a manually-created Fee Redirect bag uses, so the two cannot drift
 * apart in how a flywheel pays out.
 */
export async function reserveBagForLaunch({
  launcherUserId,
  mint,
  treasury,
  draft,
}: ReserveBagForLaunchParams): Promise<CampaignWithProject> {
  // One Project row per mint, shared with the launcher's own bags on the same token. Scoped to this
  // launcher on purpose: a Project carries identity (name, symbol, colour, logo), so adopting one by
  // mint alone would let a launch inherit a name it never had — see the note in `api/campaigns`.
  // The mint's own metadata is authoritative for the symbol, not what the form said.
  let project = await db.project.findFirst({
    where: {
      tokenMint: mint,
      campaigns: { some: { createdBy: launcherUserId } },
    },
  });
  if (!project) {
    project = await db.project.create({
      data: {
        name: draft.name,
        tokenSymbol: draft.symbol,
        tokenColor: "#eab308",
        tokenMint: mint,
        tokenName: draft.name,
        tokenDecimals: PUMP_TOKEN_DECIMALS,
        tokenLogoUrl: draft.imageUrl,
        tokenKind: "CUSTOM",
        treasury,
      },
    });
  }

  const endsAt = new Date(Date.now() + draft.durationDays * 86_400_000);

  return db.campaign.create({
    data: {
      createdBy: launcherUserId,
      projectId: project.id,
      title: draft.title,
      description: draft.brief,
      contentType: "PROMO",
      // `rateType` is derived from `paymentModel` through the one function that owns that mapping, so
      // a launched bag is priced by exactly the same code as a hand-made one.
      rateType: rateTypeFor(LAUNCH_PAYMENT_MODEL),
      paymentModel: LAUNCH_PAYMENT_MODEL,
      ratePer1k: draft.ratePer1k,
      // The per-post ceiling is what stops one viral post eating a bag — and for a flywheel it is
      // also the unit the slot count is derived from as fees arrive.
      maxPayout: draft.maxPayout,
      fixedFee: null,
      budget: 0,
      fundedAmount: 0,
      bannerUrl: draft.imageUrl,
      chain: "solana",
      maxSubmissions: draft.maxSubmissions,
      maxPerCreator: draft.maxPerCreator,
      treasury,
      // Pinned beside the address, so payouts and fee detection never have to guess which wallet
      // holds this bag's money.
      treasuryKind: "FEE",
      holderGate: false,
      holderMin: 0,
      /*
       * On from the moment the bag exists, not at activation.
       *
       * This is the flag `syncFees` selects on (`feeRedirectEnabled: true` + a `feeMint`), so a bag
       * without it would never have its coin's deposits matched, swapped or credited — the fee loop
       * would be silently switched off for exactly the bags that depend on it. It was dropped from
       * this create by mistake and a real launch shipped with it `false`; `activateLaunchedBag`
       * now also sets it, so a bag reserved before that fix heals when it is opened.
       */
      feeRedirectEnabled: true,
      /*
       * The intended share — every Bagwork launch locks 100% — written now so the row is complete,
       * and rewritten by `activateLaunchedBag` with the number the chain actually reports. It is
       * never shown in this state: the bag is DRAFT and invisible until the lock is verified.
       */
      feeRedirectPct: TOTAL_SHARE_BPS / 100,
      // The launched mint: this is what fee deposits are matched on.
      feeMint: mint,
      /*
       * Payouts follow the money, not the coin's name.
       *
       * This bag's budget is USDC — the fee loop swaps the coin's fees into USDC *before* crediting
       * them (`lib/fees/sync.ts`) — so USDC is the mint the treasury actually holds for creator
       * pays. Without this the payout path would ask the treasury for the launched coin, which the
       * swap has already sold, and every payout would block on "holds 0 COIN".
       *
       * `feeMint` above stays the launched coin (deposits are matched on it), and the `Project`
       * keeps the coin's symbol, name and artwork too, because the marketplace card renders the
       * project's identity as the coin's face.
       */
      payoutMint: USDC_MINT,
      platforms: draft.platforms,
      geo: ["GLOBAL"],
      /*
       * DRAFT, not LIVE.
       *
       * This row is written before the launcher has been asked to sign anything, so nothing about it
       * is confirmed. A bag claiming to be live here would be advertising a budget from fees that are
       * not locked and may never arrive — the one thing the marketplace must never show. DRAFT is the
       * existing "created but not funded" state: excluded from every listing, so an abandoned or
       * failed launch leaves an invisible row rather than a fake one. `activateLaunchedBag` promotes
       * it once the chain confirms the lock.
       */
      status: "DRAFT",
      // Zero until fees fund a claimable slot — see the module comment.
      slotsRemaining: 0,
      // The coin's own face, so the marketplace card and the bag header show the token rather than
      // a generic wash.
      kind: "FLYWHEEL",
      tokenImageUrl: draft.imageUrl,
      tokenSymbol: draft.symbol,
      endsAt,
    },
    // Loaded because every caller maps this row into the public marketplace shape, which reads the
    // project's token metadata.
    include: { project: true },
  });
}

/**
 * Removes a reserved bag that no launch reached.
 *
 * Only safe **before anything has been signed**, which is exactly where the build route calls it:
 * once a transaction exists the bag is the record of a coin that may be on-chain, and deleting it
 * would destroy the only trace. In the build path nothing has been handed to a wallet yet, so a
 * failure means the reservation is simply undone.
 *
 * Best-effort throughout. This runs on a failure path that is already returning an error to the
 * launcher, and a cleanup that threw would replace a useful message with a worse one.
 */
export async function discardBagReservation(bag: CampaignWithProject): Promise<void> {
  // The launch row first: it points at the bag, so deleting the bag first would trip the foreign key.
  await db.launch.deleteMany({ where: { bagId: bag.id } }).catch(() => {});
  await db.campaign.delete({ where: { id: bag.id } }).catch(() => {});

  /*
   * The Project is shared identity rather than this launch's own row — a launcher's second bag on
   * the same mint reuses it — so it is only removed when this reservation left it with nothing.
   */
  const remaining = await db.campaign
    .count({ where: { projectId: bag.projectId } })
    .catch(() => 1);
  if (remaining === 0) {
    await db.project.delete({ where: { id: bag.projectId } }).catch(() => {});
  }
}

/**
 * Promotes a reserved bag to LIVE, once the chain has confirmed its fees are locked.
 *
 * The second half of the reservation. The row existed before the coin did, so the only things that
 * change here are the ones the chain has now proven: the bag opens, and the share it advertises
 * becomes the share the sharing config actually reports rather than the 100% it was created with.
 *
 * Idempotent, because the caller is a verify-and-record path that may legitimately be retried — a
 * client polling after broadcast, or an operator re-running verification on a launch whose response
 * was lost. Writing LIVE twice is the same as writing it once.
 */
export async function activateLaunchedBag({
  campaignId,
  launcherUserId,
  feeRedirectPct,
}: ActivateLaunchedBagParams): Promise<CampaignWithProject> {
  const bag = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, createdBy: true },
  });
  if (!bag) {
    throw new Error("The bag reserved for this launch no longer exists.");
  }
  /*
   * Only the launcher can open their own bag. The id came from the launch row, which is already
   * scoped to this user, but checking here means a bug upstream cannot open someone else's bag.
   */
  if (bag.createdBy && bag.createdBy !== launcherUserId) {
    throw new Error("That bag belongs to another account.");
  }

  return db.campaign.update({
    where: { id: campaignId },
    data: {
      status: "LIVE",
      /*
       * Re-asserted here, not just at reservation.
       *
       * A bag reserved before this flag was fixed at creation is sitting there with fee redirect
       * switched off, and a bag that is OPEN but not collecting its coin's fees is worse than one
       * that is still closed — it advertises a budget that will never grow. Activation is the moment
       * the bag becomes visible, so it is the right place to guarantee the loop is on.
       */
      feeRedirectEnabled: true,
      // The verified share, replacing the intended one written at reservation.
      feeRedirectPct,
    },
    include: { project: true },
  });
}
