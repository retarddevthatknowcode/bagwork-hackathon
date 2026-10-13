import { db } from "@/lib/db";
import { WSOL_MINT } from "@/lib/solana/constants";
import { BAG_TOKEN_MINT } from "@/lib/solana/burn";
import { configuredTreasuryAddresses, treasuryAddressFor } from "@/lib/solana/treasury";
import { activateCampaignFromTransfer } from "@/lib/campaigns/activation";

/**
 * The treasury ledger.
 *
 * Everything that arrives at (or leaves) the Bagwork treasury is recorded here, whatever it turns
 * out to be, and only then matched to a purpose. The order matters: detection and classification
 * are separate steps, because a deposit that no bag wants is still money that already moved, and a
 * row we never wrote is a row nobody can reconcile later.
 *
 * Three things can happen to an inbound transfer:
 *
 *   1. **It funds a bag.** A DRAFT campaign whose treasury, mint, amount and signing wallet all
 *      line up is activated through `activateCampaignFromTransfer` — the same function the
 *      publisher-facing fund route uses, so the two paths cannot disagree about what "funded" means.
 *   2. **It is fee-redirect income.** The mint belongs to a bag with Fee Redirect switched on, so it
 *      is written into the existing `FeeDeposit` swap queue. The Jupiter pipeline that already
 *      converts deposits and grows a bag's budget picks it up from there — nothing about that is
 *      reimplemented here.
 *   3. **It is neither.** Recorded as `unmatched` with the reason, and surfaced in the admin
 *      console. Never dropped.
 *
 * Idempotency is structural rather than best-effort: `eventKey` is `<signature>:<transferIndex>` and
 * unique, so a replayed webhook cannot insert a second row, and a row already at a terminal status
 * is not processed again unless an operator explicitly replays it.
 */

export type InboundKind = "funding" | "fee_redirect" | "buyback" | "burn" | "unmatched";
export type InboundStatus = "pending" | "matched" | "credited" | "ignored";

/** The stable identity of one transfer inside one transaction. */
export function transferEventKey(signature: string, transferIndex: number): string {
  return `${signature}:${transferIndex}`;
}

/** A transfer, normalised out of whatever shape a webhook or an RPC walk produced. */
export interface NormalizedTransfer {
  signature: string;
  transferIndex: number;
  direction: "in" | "out";
  assetType: "native" | "spl";
  /** SPL mint, or the wrapped-SOL mint for a native transfer (this app's own convention). */
  mint: string;
  symbol: string;
  decimals: number;
  /** Base units, as a string so nothing is lost. */
  rawAmount: string;
  /** Human-readable amount. */
  amount: number;
  fromAddress: string;
  toAddress: string;
  watchAddress: string;
  blockTime: Date | null;
  source: "webhook" | "rpc";
  /** The payload this was parsed from, for the parser-fix trail. */
  raw?: unknown;
}

export interface InboundProcessResult {
  eventId: string;
  eventKey: string;
  signature: string;
  kind: InboundKind;
  status: InboundStatus;
  note: string;
  campaignId: string | null;
  feeDepositId: string | null;
  /** True when the row already existed (a replay), so nothing was processed again. */
  duplicate: boolean;
}

/* --------------------------------------------------------------- parsing */

/**
 * Reads a raw amount in whatever form a provider handed it over.
 *
 * Alchemy publishes base-unit amounts in several shapes depending on chain and transfer type — a
 * decimal string, a number, or a `0x…` hex quantity. Guessing wrong records a deposit as a
 * different size than it was, so each form is handled explicitly and anything unrecognised returns
 * `null` rather than a plausible-looking zero.
 */
export function parseRawAmount(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? BigInt(Math.trunc(value)) : null;
  }
  if (typeof value !== "string") return null;

  const text = value.trim();
  if (!text) return null;
  try {
    if (/^0x[0-9a-f]+$/i.test(text)) return BigInt(text);
    if (/^\d+$/.test(text)) return BigInt(text);
  } catch {
    return null;
  }
  return null;
}

/** Reads a decimals field that may arrive as a number, a decimal string or hex. */
export function parseDecimals(value: unknown, fallback = 9): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const text = value.trim();
    if (/^\d+$/.test(text)) return Number(text);
    if (/^0x[0-9a-f]+$/i.test(text)) return Number(BigInt(text));
  }
  return fallback;
}

/** First present, non-empty trimmed string among the candidates. */
function pickString(sources: unknown[]): string | null {
  for (const source of sources) {
    if (typeof source === "string") {
      const value = source.trim();
      if (value) return value;
    }
  }
  return null;
}

/**
 * One entry of an Alchemy `event.activity` array — or an equivalent token/native transfer object —
 * turned into a `NormalizedTransfer`, or `null` when it is not an inbound transfer we care about.
 *
 * Deliberately forgiving about field names. Alchemy's Solana support is new, and the key set varies
 * between transfer categories, so this accepts the documented names plus the obvious synonyms
 * rather than assuming one shape. Anything it cannot read is still stored verbatim by the caller,
 * which is what makes a parser fix checkable against a real payload instead of a guess.
 */
/** True for a Prisma unique-constraint violation, checked structurally to avoid importing the client. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export interface ParsedWebhook {
  /** Alchemy's own event id (`whevt_…`), kept for support tickets. */
  eventId: string | null;
  webhookType: string | null;
  network: string | null;
  transfers: NormalizedTransfer[];
  /** Entries that were present but could not be read as a transfer. */
  unreadable: number;
}

/**
 * Pulls every readable transfer out of an Alchemy webhook body.
 *
 * Accepts the documented `ADDRESS_ACTIVITY` shape (`event.activity[]`) and the token/native
 * transfer arrays that show up on the same payloads, because Alchemy's Solana support is new and
 * the exact container has moved between releases. A body this cannot read is not a failure — the
 * webhook route stores the raw payload first, so an unrecognised shape is recoverable, and the
 * admin panel shows exactly what arrived.
 */
export function parseAlchemyWebhook(
  payload: unknown,
  watchAddress: string | string[],
): ParsedWebhook {
  const root = (payload ?? {}) as Record<string, unknown>;
  const event = (root.event ?? {}) as Record<string, unknown>;

  const eventId = pickString([root.id, root.eventId, event.id]);
  const webhookType = pickString([root.type, root.webhookType, event.type]);
  const network = pickString([event.network, root.network]);

  const candidates: unknown[] = [
    event.activity,
    root.activity,
    event.tokenTransfers,
    event.nativeTransfers,
    event.transfers,
    root.transfers,
  ];

  const entries: unknown[] = [];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) entries.push(...candidate);
  }

  // A payload that is itself a single transfer (or an array of them) rather than a wrapper object.
  if (entries.length === 0) {
    if (Array.isArray(root)) entries.push(...root);
    else if (Object.keys(event).length > 0) entries.push(event);
    else if (Object.keys(root).length > 0) entries.push(root);
  }

  /*
   * Both Bagwork treasuries are watched now, so a delivery can carry activity for either wallet.
   * Each entry is attributed to the first wallet it actually involves — direction is decided
   * against that wallet inside `normalizeTransfer`, which is also what stops a fee deposit that
   * landed in the fixed wallet from being read as income for a fee bag.
   */
  const watches = Array.isArray(watchAddress) ? watchAddress : [watchAddress];

  const transfers: NormalizedTransfer[] = [];
  let unreadable = 0;

  entries.forEach((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      unreadable += 1;
      return;
    }
    const normalized = watches
      .map((watch) =>
        normalizeTransfer(entry as Record<string, unknown>, watch, {
          transferIndex: index,
          source: "webhook",
          raw: entry,
        }),
      )
      .find((result) => result !== null);
    if (normalized) transfers.push(normalized);
    else unreadable += 1;
  });

  return { eventId, webhookType, network, transfers, unreadable };
}

/** Statuses that mean "this row is done". Only an explicit operator replay reopens them. */
const TERMINAL_STATUSES: readonly string[] = ["matched", "credited", "ignored"];

type InboundRow = Awaited<ReturnType<typeof db.treasuryInboundEvent.findUniqueOrThrow>>;

/** Writes the outcome onto the row and hands it back. */
async function finish(
  event: InboundRow,
  kind: InboundKind,
  status: InboundStatus,
  note: string,
  campaignId: string | null,
  feeDepositId: string | null,
): Promise<InboundProcessResult> {
  await db.treasuryInboundEvent.update({
    where: { id: event.id },
    data: { kind, status, note, campaignId, feeDepositId, processedAt: new Date() },
  });

  console.info("[treasury] inbound transfer classified", {
    signature: event.signature,
    mint: event.mint,
    amount: event.amount,
    kind,
    status,
  });

  return {
    eventId: event.id,
    eventKey: event.eventKey,
    signature: event.signature,
    kind,
    status,
    note,
    campaignId,
    feeDepositId,
    duplicate: false,
  };
}

/**
 * Looks for a draft bag this transfer could have funded, and activates it.
 *
 * The database query is only a *filter* — status, treasury, mint and a budget the transfer could
 * cover — because the authoritative check is `activateCampaignFromTransfer`, which fetches the
 * transaction and verifies the destination, the amount and the signing wallet. Something that
 * passes the filter but fails verification leaves the event `pending` rather than `matched`, which
 * is what stops a near miss (a partial transfer, a transfer from the wrong wallet) being written
 * down as funding.
 */
async function tryMatchFunding(event: InboundRow): Promise<{
  status: InboundStatus;
  note: string;
  campaignId: string | null;
} | null> {
  const candidates = await db.campaign.findMany({
    where: {
      status: "DRAFT",
      treasury: event.watchAddress,
      project: { tokenMint: event.mint },
      /*
       * A Fee Redirect bag is opened by publishing, never by a transfer — if one were matchable
       * here, a stray fee deposit could flip an unpublished flywheel to LIVE. Fixed bags only.
       */
      feeRedirectEnabled: false,
      // A bag promising more than arrived cannot be satisfied by it. The epsilon absorbs float
      // storage of the budget without letting a real shortfall through.
      budget: { lte: event.amount + 1e-9 },
    },
    include: {
      project: true,
      creator: { select: { walletAddress: true, payoutWallet: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 5,
  });

  if (candidates.length === 0) return null;

  let sawInvalid = false;

  for (const campaign of candidates) {
    const outcome = await activateCampaignFromTransfer({
      campaign,
      signature: event.signature,
    });

    if (outcome.status === "activated") {
      return {
        status: "matched",
        campaignId: campaign.id,
        note: `Funded "${campaign.title}" — ${outcome.received} ${campaign.project.tokenSymbol} from ${outcome.signer}.`,
      };
    }

    if (outcome.status === "pending") {
      // The bag is the right one but the chain has not confirmed it yet, so the event stays pending
      // and a later delivery (or an operator replay) settles it. Not a failure.
      return { status: "pending", campaignId: campaign.id, note: outcome.reason };
    }

    sawInvalid = true;
  }

  return {
    status: "pending",
    campaignId: null,
    note: sawInvalid
      ? "A draft bag matches this mint and treasury, but this transfer does not satisfy it — check the amount and the sending wallet."
      : "A draft bag matches this mint, but the transfer could not be verified.",
  };
}

/**
 * Attaches the transfer to the Fee Redirect swap queue, or recognises it as a buyback.
 *
 * Deliberately narrow: only mints a bag has opted into are converted, using the same test
 * `syncFees` uses, so a stray airdrop cannot create work for the swap pipeline. Everything else
 * falls through to `unmatched`, where it is visible and harmless instead of silently acted on.
 */
async function tryAttachFeeDeposit(event: InboundRow): Promise<{
  kind: InboundKind;
  status: InboundStatus;
  note: string;
  campaignId: string | null;
  feeDepositId: string | null;
} | null> {
  /*
   * The wallet rule that keeps the two streams apart: only the FEE treasury's inbound transfers
   * can become fee income. A fee token that arrives at the fixed treasury falls through to
   * `unmatched` — recorded, visible to an operator, never converted — because crediting it would
   * mean paying flywheel creators out of publisher budgets.
   */
  const feeWallet = treasuryAddressFor("FEE");
  if (!feeWallet || event.watchAddress !== feeWallet) {
    return null;
  }

  // $BAG arriving in the treasury is the *result* of a buyback, so it is a burn candidate rather
  // than income to convert.
  const isBagToken = BAG_TOKEN_MINT.length > 0 && event.mint === BAG_TOKEN_MINT;

  /*
   * The same rule `syncFees` applies (`lib/fees/sync.ts`) — including the status filter.
   *
   * The filter matters at least as much here. The webhook *creates* the deposit row already matched
   * to a bag, and the poll sync then swaps and credits whatever it finds in the queue regardless of
   * the bag's status — so without this, a token traded after its bag ended would keep growing a
   * budget nobody can spend. A closed bag's deposits fall through to `unmatched`, where they are
   * visible and harmless.
   */
  const campaign = await db.campaign.findFirst({
    where: {
      feeRedirectEnabled: true,
      feeMint: event.mint,
      status: { in: ["LIVE", "FILLING"] },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true },
  });

  if (!campaign) {
    if (isBagToken) {
      return {
        kind: "buyback",
        status: "matched",
        note: "Bought-back $BAG held in the treasury: a burn candidate, waiting on the burn step.",
        campaignId: null,
        feeDepositId: null,
      };
    }
    return null;
  }

  // Already queued (a replay, or `syncFees` got there first): attach without writing a second row.
  const queueRow = () =>
    db.feeDeposit
      .findUnique({ where: { signature: event.signature }, select: { id: true } })
      .then((row) => ({
        kind: "fee_redirect" as const,
        status: "credited" as const,
        note: `Already in the fee swap queue for "${campaign.title}".`,
        campaignId: campaign.id,
        feeDepositId: row?.id ?? null,
      }));

  const existing = await db.feeDeposit.findUnique({
    where: { signature: event.signature },
    select: { id: true },
  });
  if (existing) return queueRow();

  try {
    const deposit = await db.feeDeposit.create({
      data: {
        signature: event.signature,
        campaignId: campaign.id,
        mint: event.mint,
        symbol: event.symbol,
        decimals: event.decimals,
        rawAmount: event.rawAmount,
        tokenAmount: event.amount,
        fromAddress: event.fromAddress,
        toAddress: event.toAddress,
        status: "received",
        receivedAt: event.blockTime ?? new Date(),
      },
      select: { id: true },
    });

    return {
      kind: "fee_redirect",
      status: "credited",
      note: `Queued for swap into "${campaign.title}"'s budget.`,
      campaignId: campaign.id,
      feeDepositId: deposit.id,
    };
  } catch (error) {
    // A concurrent sync won the race — the queue row exists, which is the outcome we wanted.
    if (!isUniqueViolation(error)) throw error;
    return queueRow();
  }
}

/**
 * Classifies one ledger row and acts on it.
 *
 * Order matters: funding first (a publisher's budget is the most specific match), then the fee
 * swap queue, then nothing. Every branch writes its outcome *and its reason* onto the row, so
 * "why did this deposit not do anything" is answerable from the database rather than from logs.
 */
export async function processInboundEvent(
  eventId: string,
  options: { force?: boolean } = {},
): Promise<InboundProcessResult> {
  const event = await db.treasuryInboundEvent.findUnique({ where: { id: eventId } });
  if (!event) throw new Error(`Treasury event ${eventId} not found`);

  if (!options.force && TERMINAL_STATUSES.includes(event.status)) {
    return {
      eventId: event.id,
      eventKey: event.eventKey,
      signature: event.signature,
      kind: event.kind as InboundKind,
      status: event.status as InboundStatus,
      note: event.note ?? "Already processed",
      campaignId: event.campaignId,
      feeDepositId: event.feeDepositId,
      duplicate: true,
    };
  }

  // Outbound transfers are payouts, swaps and burns: real ledger entries, never income for a bag.
  if (event.direction !== "in") {
    return finish(
      event,
      "unmatched",
      "ignored",
      "Outbound transfer — recorded for the ledger only.",
      null,
      null,
    );
  }

  const funding = await tryMatchFunding(event);
  if (funding) {
    return finish(event, "funding", funding.status, funding.note, funding.campaignId, null);
  }

  const fee = await tryAttachFeeDeposit(event);
  if (fee) {
    return finish(event, fee.kind, fee.status, fee.note, fee.campaignId, fee.feeDepositId);
  }

  return finish(
    event,
    "unmatched",
    "ignored",
    "Nothing is waiting for this mint yet — recorded so it can be matched or converted later.",
    null,
    null,
  );
}

export interface WebhookReport {
  /** The addresses that were watched — both Bagwork treasuries, in FIXED-then-FEE order. */
  watchAddresses: string[];
  eventId: string | null;
  webhookType: string | null;
  network: string | null;
  transfersSeen: number;
  /** Entries present in the payload that could not be read as transfers. */
  unreadable: number;
  recorded: number;
  duplicates: number;
  results: InboundProcessResult[];
}

/**
 * The whole webhook path: parse → record → classify.
 *
 * Every transfer is recorded before any of them is acted on, so a failure in the classifying step
 * still leaves the ledger complete and the rows replayable.
 */
export async function processAlchemyWebhook(payload: unknown): Promise<WebhookReport> {
  const watchAddresses = configuredTreasuryAddresses();
  if (watchAddresses.length === 0) {
    // Without a treasury there is nothing to watch, and inventing a match target would be worse
    // than refusing the delivery outright.
    throw new Error(
      "Neither Bagwork treasury is configured (TREASURY_FIXED_PRIVATE_KEY / TREASURY_FEE_PRIVATE_KEY), so treasury transfers cannot be attributed to a wallet.",
    );
  }

  const parsed = parseAlchemyWebhook(payload, watchAddresses);

  const report: WebhookReport = {
    watchAddresses,
    eventId: parsed.eventId,
    webhookType: parsed.webhookType,
    network: parsed.network,
    transfersSeen: parsed.transfers.length,
    unreadable: parsed.unreadable,
    recorded: 0,
    duplicates: 0,
    results: [],
  };

  for (const transfer of parsed.transfers) {
    const { inserted, id } = await recordInboundTransfer(transfer);
    if (inserted) report.recorded += 1;
    else report.duplicates += 1;

    /*
     * A duplicate of a finished row is a no-op. A duplicate of a *pending* row is retried, which is
     * how an event that was waiting on confirmation is settled by a later delivery rather than
     * needing an operator.
     */
    report.results.push(await processInboundEvent(id));
  }

  return report;
}

/**
 * Writes a transfer to the ledger, once.
 *
 * A unique violation on `eventKey` is the *expected* path for a replayed webhook, not an error: the
 * provider retries on any non-2xx, so a duplicate delivery is normal traffic. The existing row is
 * returned with `inserted: false` and the caller skips processing it.
 */
export async function recordInboundTransfer(
  transfer: NormalizedTransfer,
): Promise<{ inserted: boolean; id: string }> {
  const eventKey = transferEventKey(transfer.signature, transfer.transferIndex);

  try {
    const created = await db.treasuryInboundEvent.create({
      data: {
        eventKey,
        signature: transfer.signature,
        transferIndex: transfer.transferIndex,
        direction: transfer.direction,
        assetType: transfer.assetType,
        mint: transfer.mint,
        symbol: transfer.symbol,
        decimals: transfer.decimals,
        rawAmount: transfer.rawAmount,
        amount: transfer.amount,
        fromAddress: transfer.fromAddress,
        toAddress: transfer.toAddress,
        watchAddress: transfer.watchAddress,
        source: transfer.source,
        blockTime: transfer.blockTime,
        raw: (transfer.raw ?? undefined) as never,
        status: "pending",
      },
      select: { id: true },
    });
    return { inserted: true, id: created.id };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await db.treasuryInboundEvent.findUnique({
      where: { eventKey },
      select: { id: true },
    });
    if (!existing) throw error;
    return { inserted: false, id: existing.id };
  }
}
/**
 * One entry of an Alchemy `event.activity` array — or an equivalent token/native transfer object —
 * turned into a `NormalizedTransfer`, or `null` when it is not a transfer we care about.
 *
 * Deliberately forgiving about field names. Alchemy's Solana support is new and the key set varies
 * between transfer categories, so this accepts the documented names plus the obvious synonyms
 * rather than assuming one shape. Anything it cannot read is stored verbatim by the caller anyway,
 * which is what makes a parser fix checkable against a real payload instead of a guess.
 */
export function normalizeTransfer(
  entry: Record<string, unknown>,
  watchAddress: string,
  options: { transferIndex: number; source: "webhook" | "rpc"; raw?: unknown },
): NormalizedTransfer | null {
  // A re-orged transfer is not a transfer.
  if (entry.removed === true) return null;

  const signature = pickString([
    entry.hash,
    entry.signature,
    entry.transactionSignature,
    entry.txSignature,
  ]);
  if (!signature) return null;

  const fromAddress = pickString([
    entry.fromAddress,
    entry.fromUserAccount,
    entry.from,
    entry.source,
  ]);
  const toAddress = pickString([
    entry.toAddress,
    entry.toUserAccount,
    entry.to,
    entry.destination,
  ]);

  const asset = pickString([entry.asset, entry.symbol, entry.tokenSymbol]);
  const contract = (entry.rawContract ?? entry.contract ?? {}) as Record<string, unknown>;
  const mint = pickString([
    entry.mint,
    entry.tokenAddress,
    entry.contractAddress,
    contract.address,
  ]);

  /*
   * A native transfer has no contract address. It is modelled as wrapped SOL because that is what
   * the rest of the app does: the campaign funding check compares against `WSOL_MINT` to decide
   * whether a bag is SOL-priced, so one representation keeps every downstream check simple.
   */
  const isNative =
    !mint && (asset === null || asset.toUpperCase() === "SOL" || asset.toUpperCase() === "WSOL");

  const resolvedMint = isNative ? WSOL_MINT : mint;
  if (!resolvedMint) return null;

  const decimals = isNative ? 9 : parseDecimals(contract.decimal ?? entry.decimals, 9);

  const rawRead = parseRawAmount(
    contract.rawValue ?? entry.rawValue ?? entry.rawAmount ?? entry.amount,
  );
  const humanRead =
    typeof entry.value === "number"
      ? entry.value
      : typeof entry.value === "string" && /^-?\d+(\.\d+)?$/.test(entry.value.trim())
        ? Number(entry.value)
        : null;

  const rawAmount =
    rawRead ?? (humanRead === null ? null : BigInt(Math.round(humanRead * 10 ** decimals)));
  if (rawAmount === null) return null;

  const amount = humanRead ?? Number(rawAmount) / 10 ** decimals;

  /*
   * Direction comes from the watch address, never from a field: a provider's notion of "from" is
   * relative to whoever it was asked about, and getting that backwards would file a payout as
   * income.
   */
  const outgoing = fromAddress === watchAddress;
  const incoming = toAddress === watchAddress;
  if (!outgoing && !incoming) return null;

  const blockRaw = entry.blockTime ?? entry.blockTimestamp ?? entry.timestamp;
  const blockTime =
    typeof blockRaw === "number"
      ? new Date(blockRaw > 1e12 ? blockRaw : blockRaw * 1000)
      : typeof blockRaw === "string" && !Number.isNaN(Date.parse(blockRaw))
        ? new Date(blockRaw)
        : null;

  return {
    signature,
    transferIndex: options.transferIndex,
    direction: outgoing && !incoming ? "out" : "in",
    assetType: isNative ? "native" : "spl",
    mint: resolvedMint,
    symbol: asset ?? (isNative ? "SOL" : ""),
    decimals,
    rawAmount: rawAmount.toString(),
    amount,
    fromAddress: fromAddress ?? "",
    toAddress: toAddress ?? "",
    watchAddress,
    blockTime,
    source: options.source,
    raw: options.raw ?? entry,
  };
}