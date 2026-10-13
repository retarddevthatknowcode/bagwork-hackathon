/**
 * Token Analytics — the data behind `/dashboard/token`.
 *
 * The page has to be honest about three different states, and this module is where that
 * distinction lives so the UI never has to guess:
 *
 *   1. **Pre-launch** — no `BAG_TOKEN_MINT`. There is no contract address, so there is no price,
 *      no market cap and nothing burned. The page says "Launching Soon" and shows structure.
 *   2. **Live, feed pending** — a mint exists but a data provider has not been wired or has not
 *      answered. The mint is real and shown; the market numbers are `null`, never `0`.
 *   3. **Live, with data** — everything filled in from the providers below.
 *
 * The whole point of the `null`-based typing is that a zero and an unknown are different claims.
 * A card reading "$0 market cap" for a token that launched ten minutes ago is a lie; an em dash
 * with "feed connecting" is the truth. Nothing in this file invents a number, and no fallback
 * series is synthesised — the chart renders what a provider returns, or its own empty state.
 *
 * Everything here runs on the server: it reads a non-public env var, and the providers will hold
 * API keys. The page passes the finished, plain-object payload down to the client component, so
 * no provider code or key can reach the browser.
 */
import {
  BAG_TOKEN_MINT,
  BURN_SHARE_BPS,
  PLATFORM_FEE_BPS,
  TREASURY_SHARE_BPS,
  calculateFeeSplit,
  isBagBurnConfigured,
} from "@/lib/solana/burn";
import { getTreasuryActivity, type TreasuryActivity } from "@/lib/treasury/history";

/** Timeframes the chart offers. Order is display order. */
export const TOKEN_TIMEFRAMES = ["1H", "24H", "7D", "30D"] as const;

export type TokenTimeframe = (typeof TOKEN_TIMEFRAMES)[number];

export const DEFAULT_TOKEN_TIMEFRAME: TokenTimeframe = "24H";

/** One point on the price chart. `t` is an ISO timestamp so it survives JSON. */
export interface TokenPricePoint {
  t: string;
  price: number;
}

export interface TokenMarketSnapshot {
  /** USD price of one $BAG. */
  price: number | null;
  marketCap: number | null;
  /** USD traded in the last 24 hours. */
  volume24h: number | null;
  /** USD sitting in the liquidity pool. */
  liquidity: number | null;
  holders: number | null;
  /** When the provider was read, or null when it never answered. */
  updatedAt: string | null;
}

/** One settled buyback-and-burn. */
export interface TokenBuybackRow {
  id: string;
  /** ISO date the buyback was executed and the tokens burned. */
  at: string;
  /** USD spent buying $BAG on the open market. */
  spentUsd: number;
  /** $BAG burned in the same transaction. */
  burned: number;
  /** Solana transaction signature, when one exists. */
  signature: string | null;
}

export interface TokenHolderRow {
  address: string;
  /** Anything known about the holder (a label, an exchange, "liquidity pool"). */
  label: string | null;
  amount: number;
  /** Share of supply, 0-100. */
  pct: number;
}

export interface TokenBuybackSummary {
  totalSpentUsd: number | null;
  totalBurned: number | null;
  lastBuybackAt: string | null;
  lastBurnAt: string | null;
  history: TokenBuybackRow[];
}

export interface TokenAnalytics {
  /** Ticker as displayed, without the `$`. */
  symbol: string;
  /** Full token name. */
  name: string;
  /** One-line description under the page title. */
  tagline: string;
  /** The contract address, or null while the token is pre-launch. */
  mint: string | null;
  /**
   * True once a mint is configured. This is the switch the page keys off — not a hardcoded
   * flag — so setting `BAG_TOKEN_MINT` in the environment is the entire launch procedure.
   */
  live: boolean;
  market: TokenMarketSnapshot;
  series: Record<TokenTimeframe, TokenPricePoint[]>;
  buyback: TokenBuybackSummary;
  holders: TokenHolderRow[];
  /** Explorer / charting links. Null until there is a mint to point them at. */
  links: { dexscreener: string; solscan: string } | null;
  /** The published platform fee split, in basis points. */
  feeSplit: { platformFeeBps: number; treasuryBps: number; burnBps: number };
  /**
   * A worked example of the split, computed with the same function the payout path uses —
   * so the page can never drift from what the code actually charges.
   */
  feeExample: { grossUsd: number; platformFee: number; treasury: number; burn: number };
  /**
   * What the treasury has actually been doing: recent transfers, deposits waiting to be swapped,
   * and $BAG held for burning.
   *
   * Read through the provider chain from `lib/treasury/history.ts`, which caches the result for a
   * short window. It is part of the page's payload because the alternative — a client-side fetch —
   * would mean the page renders a spinner for data that is already available on the server.
   */
  treasury: TreasuryActivity;
}

/**
 * How much gross volume the worked example on the page uses. A round number a reader can
 * check in their head against the percentages above it.
 */
const FEE_EXAMPLE_GROSS_USD = 1_000;

/** The empty market snapshot. Every field `null` — unknown, not zero. */
function emptyMarket(): TokenMarketSnapshot {
  return {
    price: null,
    marketCap: null,
    volume24h: null,
    liquidity: null,
    holders: null,
    updatedAt: null,
  };
}

/** A timeframe map with no points. */
function emptySeries(): Record<TokenTimeframe, TokenPricePoint[]> {
  return { "1H": [], "24H": [], "7D": [], "30D": [] };
}

/* ------------------------------------------------------------- providers */

/**
 * Market data, read from DexScreener.
 *
 * This used to return `null` unconditionally, with a note explaining that $BAG had no contract
 * address yet, so there was nothing to fetch. There is an address now, so the note is gone and the
 * read is real.
 *
 * Two things shape the implementation:
 *
 *   - **The deepest pair wins.** One mint can trade in several pools — the token this page is
 *     currently pointed at has both a `pumpswap` and a `meteora` pair — and the thin pool's price is
 *     technically true and practically noise. Pairs are ranked by `liquidity.usd`.
 *   - **Nothing here invents a number.** Every field is `null` unless the provider returned a finite
 *     one, so a partial response degrades a single card instead of blanking the page, and a failed
 *     request leaves the page in "feed connecting" rather than showing a zero it cannot defend.
 *
 * Responses are cached for a minute. The public endpoint is rate limited, this route renders on
 * demand, and a market cap sixty seconds old is not a lie.
 */
const MARKET_CACHE_TTL_MS = 60_000;

interface DexPair {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string; symbol?: string };
  quoteToken?: { address?: string; symbol?: string };
  priceUsd?: string;
  fdv?: number;
  marketCap?: number;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
}

const marketCache = new Map<string, { at: number; pair: DexPair | null }>();

/**
 * The pool to read this token's price from, or null when nothing answers.
 *
 * Two filters, and the first one is the important one:
 *
 *   1. **The mint must be the pool's base token.** DexScreener's token endpoint returns every pool
 *      that mentions the mint, including pools where it is only the *quote* asset — and `priceUsd`
 *      on those describes the *other* token. Ranking by liquidity alone picked a pool where this mint
 *      was only the quote asset, and its `priceUsd` of $43.32 was roughly 6,400× the real figure for a
 *      token that actually
 *      trades near $0.0067. That is precisely the kind of fabricated number this page exists to
 *      avoid, so a pool that quotes the mint is not a candidate at all.
 *   2. **Then the deepest pool wins.** The token trades in over a dozen pools; the thin ones report
 *      prices that are true and useless. `liquidity.usd` decides, which favours the pool least
 *      likely to be moved by a single trade.
 */
async function readBestPair(mint: string): Promise<DexPair | null> {
  const cached = marketCache.get(mint);
  if (cached && Date.now() - cached.at < MARKET_CACHE_TTL_MS) return cached.pair;

  let pair: DexPair | null = null;
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (res.ok) {
      const body = (await res.json()) as { pairs?: DexPair[] };
      const owned = (body.pairs ?? []).filter(
        (p) =>
          (!p.chainId || p.chainId === "solana") &&
          p.baseToken?.address === mint &&
          (p.liquidity?.usd ?? 0) > 0,
      );
      pair = owned.length
        ? owned.reduce((best, p) => ((p.liquidity?.usd ?? 0) > (best.liquidity?.usd ?? 0) ? p : best))
        : null;
    }
  } catch {
    // An unreachable provider is not a zero, and it is not an error the page should die on.
    pair = null;
  }

  marketCache.set(mint, { at: Date.now(), pair });
  return pair;
}

/** A number, or null. The guard that keeps `NaN` and `undefined` off the page. */
function finite(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : null;
}

async function readMarketSnapshot(mint: string): Promise<TokenMarketSnapshot | null> {
  const pair = await readBestPair(mint);
  if (!pair) return null;

  const price = finite(pair.priceUsd);
  const marketCap = finite(pair.marketCap) ?? finite(pair.fdv);

  /*
   * `holders` is left null on purpose: this provider does not publish a holder count, and deriving
   * one from a different number would be a fabricated figure on a page whose whole point is not to
   * fabricate. The Holders card keeps its own empty state.
   */
  return {
    price,
    marketCap,
    volume24h: finite(pair.volume?.h24),
    liquidity: finite(pair.liquidity?.usd),
    holders: null,
    updatedAt: price === null && marketCap === null ? null : new Date().toISOString(),
  };
}

/**
 * Price history, from GeckoTerminal's keyless OHLC endpoint for the same pool.
 *
 * One request per timeframe, all four in flight together. A timeframe whose request fails — or
 * returns nothing — contributes an empty array, which renders as that timeframe's empty state. The
 * chart never draws a line it was not given, and a single point is still not a chart.
 */
const OHLC_WINDOWS: Record<TokenTimeframe, { timeframe: string; aggregate: number; limit: number }> = {
  "1H": { timeframe: "minute", aggregate: 1, limit: 60 },
  "24H": { timeframe: "hour", aggregate: 1, limit: 24 },
  "7D": { timeframe: "hour", aggregate: 4, limit: 42 },
  "30D": { timeframe: "day", aggregate: 1, limit: 30 },
};

async function readPriceSeries(mint: string): Promise<Record<TokenTimeframe, TokenPricePoint[]>> {
  const pair = await readBestPair(mint);
  if (!pair?.pairAddress) return emptySeries();

  const entries = await Promise.all(
    TOKEN_TIMEFRAMES.map(async (tf) => {
      const { timeframe, aggregate, limit } = OHLC_WINDOWS[tf];
      try {
        const res = await fetch(
          `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pair.pairAddress}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}`,
          { signal: AbortSignal.timeout(8000), cache: "no-store" },
        );
        if (!res.ok) return [tf, [] as TokenPricePoint[]] as const;

        const body = (await res.json()) as {
          data?: { attributes?: { ohlcv_list?: [number, number, number, number, number, number][] } };
        };
        // [unixSeconds, open, high, low, close, volume] — the close is the point that joins up.
        const points = (body.data?.attributes?.ohlcv_list ?? [])
          .map(([seconds, , , , close]) => ({ t: new Date(seconds * 1000).toISOString(), price: close }))
          .filter((point) => Number.isFinite(point.price))
          .sort((a, b) => a.t.localeCompare(b.t));
        return [tf, points] as const;
      } catch {
        return [tf, [] as TokenPricePoint[]] as const;
      }
    }),
  );

  return Object.fromEntries(entries) as Record<TokenTimeframe, TokenPricePoint[]>;
}


/**
 * The single seam for buyback-and-burn history.
 *
 * Buybacks are executed on-chain by the platform, so the record of them is a set of transactions
 * (and, once it exists, a table). Until either exists this returns an empty history with `null`
 * totals, and the section states plainly that nothing has been bought back yet rather than
 * showing a reassuring zero it cannot substantiate.
 */
async function readBuybackSummary(mint: string): Promise<TokenBuybackSummary> {
  void mint;
  return {
    totalSpentUsd: null,
    totalBurned: null,
    lastBuybackAt: null,
    lastBurnAt: null,
    history: [],
  };
}

/**
 * The single seam for the holder distribution.
 *
 * A distribution is a claim about a wallet set, so it comes from a real indexer (or not at all).
 * An empty list renders as "publishes at launch".
 */
async function readTopHolders(mint: string): Promise<TokenHolderRow[]> {
  void mint;
  return [];
}

/* --------------------------------------------------------------- payload */

/** The static identity of the token. Kept here so the page and its metadata agree. */
export const TOKEN_IDENTITY = {
  symbol: "BAG",
  name: "Bagwork",
  tagline:
    "The token behind the fee loop: a slice of every campaign fee buys $BAG on the open market and burns it.",
} as const;

/**
 * Builds everything `/dashboard/token` renders.
 *
 * The only branch that matters: no valid mint means pre-launch, and pre-launch means every
 * provider is skipped entirely. That is not an optimisation — asking a DEX for the price of a
 * token that does not exist is how placeholder numbers get into a UI.
 */
export async function getTokenAnalytics(): Promise<TokenAnalytics> {
  /*
   * One switch, and it is the environment: `BAG_TOKEN_MINT` decides both `live` and the address.
   * A known stand-in mint already resolves to empty in `lib/solana/burn.ts`, so a test contract
   * cannot arrive here as $BAG and flip the page into its live state.
   */
  const live = isBagBurnConfigured();
  const mint = live ? BAG_TOKEN_MINT : null;
  const example = calculateFeeSplit(FEE_EXAMPLE_GROSS_USD);

  /*
   * The treasury ledger is independent of the mint — fee deposits and recorded events exist before
   * the token does — so it is read in both states, and concurrently with the other providers.
   *
   * A failure here must not take the page down. `getTreasuryActivity` already reports chain failures
   * in its own `error` field; this catch covers the database failing too, and produces the same
   * empty shape so the page renders its placeholder instead of a 500.
   */
  const treasury = getTreasuryActivity().catch(
    (error): TreasuryActivity => ({
      watchAddresses: [],
      flows: [],
      buybackCandidates: [],
      burnCandidates: null,
      totals: { inboundEvents: 0, outboundEvents: 0, unmatchedEvents: 0 },
      error:
        error instanceof Error && error.message
          ? error.message
          : "Treasury activity is unavailable right now.",
      cached: false,
      generatedAt: new Date().toISOString(),
    }),
  );

  const base = {
    symbol: TOKEN_IDENTITY.symbol,
    name: TOKEN_IDENTITY.name,
    tagline: TOKEN_IDENTITY.tagline,
    mint,
    live,
    feeSplit: {
      platformFeeBps: PLATFORM_FEE_BPS,
      treasuryBps: TREASURY_SHARE_BPS,
      burnBps: BURN_SHARE_BPS,
    },
    feeExample: {
      grossUsd: FEE_EXAMPLE_GROSS_USD,
      platformFee: example.platformFee,
      treasury: example.treasury,
      burn: example.burn,
    },
  };

  if (!mint) {
    return {
      ...base,
      market: emptyMarket(),
      series: emptySeries(),
      buyback: await readBuybackSummary(""),
      holders: [],
      links: null,
      treasury: await treasury,
    };
  }

  // Independent providers, so they go out together rather than one after the other.
  const [market, series, buyback, holders, treasuryActivity] = await Promise.all([
    readMarketSnapshot(mint),
    readPriceSeries(mint),
    readBuybackSummary(mint),
    readTopHolders(mint),
    treasury,
  ]);

  return {
    ...base,
    market: market ?? emptyMarket(),
    series,
    buyback,
    holders,
    treasury: treasuryActivity,
    links: {
      dexscreener: `https://dexscreener.com/solana/${mint}`,
      solscan: `https://solscan.io/token/${mint}`,
    },
  };
}

