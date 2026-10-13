"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Clock,
  Coins,
  Copy,
  Droplets,
  Flame,
  Gauge,
  LineChart as LineChartIcon,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { compactNumber, dateMedium, pct, relative, shortAddress, usd } from "@/lib/console/format";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TOKEN_TIMEFRAME,
  TOKEN_TIMEFRAMES,
  type TokenAnalytics,
  type TokenTimeframe,
} from "@/lib/token/analytics";
import {
  Delta,
  EmptyState,
  InfoRow,
  MetricCard,
  PageHeader,
  SectionCard,
  TokenMark,
} from "../ui";

/**
 * Token Analytics.
 *
 * Everything on this page is derived from one server-built payload (`getTokenAnalytics`), which
 * is the only thing that knows whether $BAG exists yet. This component never invents a number:
 * a `null` metric renders as a dash with a reason underneath, and the chart renders its own empty
 * state until a provider returns a series.
 *
 * That is the whole design — the page has to be worth looking at *before* launch, and it has to
 * become a real dashboard the moment `BAG_TOKEN_MINT` is set, without a redesign.
 */

/** Shown where a number genuinely does not exist yet. Never a zero we cannot stand behind. */
const UNKNOWN = "—";

/**
 * Shown where something is not merely missing but not yet decided: the contract address, the
 * ticker, and every market figure, until the mint exists.
 *
 * Deliberately distinct from `UNKNOWN`. A dash under "Price" says "this page reports a price and
 * has none yet"; "To be announced" says the token itself is not public, which is the true state
 * before launch and the reason none of these numbers can exist at all. The two never share wording,
 * for the same reason `pendingHint` refuses to share its two cases.
 */
const TO_BE_ANNOUNCED = "To be announced";

/**
 * The style for a placeholder that is a phrase rather than a figure.
 *
 * The metric slots are built for numbers — 2xl, tabular, `truncate` — and "To be announced" at that
 * size is a clipped word with an ellipsis, which reads as a layout bug rather than as a placeholder.
 * Smaller and muted, it reads as what it is.
 */
const PLACEHOLDER_VALUE = "text-base font-medium text-muted-foreground";

/** The one reason every market figure is absent before launch, said once instead of five times. */
const TO_BE_ANNOUNCED_HINT = "Awaiting the contract address";

/** Named so the gold reads as one decision rather than a colour repeated in five files. */
const TOKEN_ACCENT = "var(--brand)";

function valueOrDash(value: number | null, format: (n: number) => string) {
  return value == null ? UNKNOWN : format(value);
}

/**
 * Prices are not one shape. A four-figure price is unreadable in full, and a sub-cent price is
 * invisible at two decimals — "$0.00" is not a price. Each range gets the precision that keeps
 * it meaningful.
 */
function formatPrice(value: number) {
  if (value >= 1000) return usd(value, { compact: true });
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toPrecision(3)}`;
}

const priceChartConfig = {
  price: { label: "$BAG price", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Axis labels: clock times for the intraday frames, dates for the longer ones. */
function pointLabel(iso: string, timeframe: TokenTimeframe) {
  const date = new Date(iso);
  if (timeframe === "1H" || timeframe === "24H") {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Why a placeholder metric is a placeholder. The two states are different claims — "there is no
 * token yet" and "there is a token, the feed has not answered" — so they never share wording.
 */
function pendingHint(live: boolean) {
  return live ? "Feed connecting" : "Unlocks at launch";
}

/**
 * The golden status badge.
 *
 * `--brand` is the console's gold and is not used for status anywhere else, so one badge in this
 * colour reads as the page's single most important fact.
 */
function LaunchingSoonBadge() {
  return (
    <Badge variant="outline" className="gap-1.5 border-brand/40 bg-brand/10 text-brand">
      <Sparkles aria-hidden="true" className="size-3" />
      Launching Soon
    </Badge>
  );
}

/** One labelled fact in the identity strip. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

/**
 * Who this page is about, above the numbers.
 *
 * The mark, the ticker and the tagline in one line, plus the three facts someone arrives asking
 * for: what chain, what standard, and whether there is an address yet.
 */
function TokenIdentityCard({ token }: { token: TokenAnalytics }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-wrap items-start gap-4 p-4 sm:gap-5 sm:p-5">
        <TokenMark symbol={token.symbol} color={TOKEN_ACCENT} className="size-12 text-base" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {/* The ticker is the other thing that cannot be stated before the mint exists. */}
            <h2 className="title-display text-xl text-foreground">
              {token.live ? `$${token.symbol}` : TO_BE_ANNOUNCED}
            </h2>
            <span className="text-sm text-muted-foreground">{token.name}</span>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {token.tagline}
          </p>
        </div>
        <dl className="grid w-full grid-cols-2 gap-x-6 gap-y-3 sm:w-auto sm:grid-cols-3">
          <Fact label="Chain" value="Solana" />
          <Fact label="Standard" value="SPL token" />
          <Fact label="Contract" value={token.live ? "Live" : TO_BE_ANNOUNCED} />
        </dl>
      </CardContent>
    </Card>
  );
}

/**
 * The five numbers a token page is judged on.
 *
 * Pre-launch every one of them says "To be announced" with the reason underneath, which is the
 * honest answer: the page shows what it will measure rather than guessing at numbers. The grid
 * steps 1 → 2 → 3 → 5 so the row never leaves a lonely card on its own line.
 */
function TokenStats({ token }: { token: TokenAnalytics }) {
  const { market } = token;
  /*
   * The hint under each card. "Feed connecting" is the right thing to say while a value is
   * missing — and the wrong thing to say directly underneath a live price, which is what it said
   * the moment these numbers started arriving. Once the provider has answered, the cards say where
   * the numbers come from instead of implying they have not turned up.
   */
  const hasMarket = market.price !== null || market.marketCap !== null || market.volume24h !== null;
  const hint = hasMarket ? "Live · DexScreener" : pendingHint(token.live);
  const money = (n: number) => usd(n, { compact: true });

  /*
   * The two states, told apart once for all five cards. Before launch there is nothing to measure,
   * so each slot says so; once the mint exists a slot goes back to being a number — or a dash, if
   * the feed has not answered yet.
   */
  const beforeLaunch = !token.live;
  const value = (n: number | null, format: (n: number) => string) =>
    beforeLaunch ? TO_BE_ANNOUNCED : valueOrDash(n, format);
  const metricHint = beforeLaunch ? TO_BE_ANNOUNCED_HINT : hint;
  const valueClass = beforeLaunch ? PLACEHOLDER_VALUE : undefined;

  return (
    <section
      aria-label="Token metrics"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
    >
      <MetricCard
        label="Price"
        value={value(market.price, formatPrice)}
        hint={metricHint}
        valueClassName={valueClass}
        icon={TrendingUp}
      />
      <MetricCard
        label="Market cap"
        value={value(market.marketCap, money)}
        hint={metricHint}
        valueClassName={valueClass}
        icon={Gauge}
      />
      <MetricCard
        label="24h volume"
        value={value(market.volume24h, money)}
        hint={metricHint}
        valueClassName={valueClass}
        icon={Activity}
      />
      <MetricCard
        label="Liquidity"
        value={value(market.liquidity, money)}
        hint={metricHint}
        valueClassName={valueClass}
        icon={Droplets}
      />
      <MetricCard
        label="Holders"
        value={value(market.holders, (n) => compactNumber(n))}
        /*
         * Pre-launch there is no feed to blame, so the card states the real reason. With a mint,
         * this feed still does not publish a holder count, so this one card says so rather than
         * borrowing the "live" wording the four provider-backed cards above it use — an em dash
         * under "Live · DexScreener" would read as though the number existed and was zero.
         */
        hint={
          beforeLaunch
            ? metricHint
            : market.holders === null
              ? "Not published by this feed"
              : "Live · DexScreener"
        }
        valueClassName={valueClass}
        icon={Users}
      />
    </section>
  );
}

/**
 * The price chart.
 *
 * The timeframe tabs are real state and the series comes straight from the payload, so nothing
 * here changes when a provider starts returning points. Until then it renders a deliberately
 * empty panel — a dashed baseline and an explanation — rather than a decorative curve, because a
 * fake line on a price chart is the one thing a reader would take as fact.
 */
function PriceChartCard({ token }: { token: TokenAnalytics }) {
  const [timeframe, setTimeframe] = useState<TokenTimeframe>(DEFAULT_TOKEN_TIMEFRAME);
  const points = token.series[timeframe] ?? [];

  const data = useMemo(
    () => points.map((point) => ({ label: pointLabel(point.t, timeframe), price: point.price })),
    [points, timeframe],
  );

  // One point is not a chart: a single dot cannot show a trend, so it reads as empty instead.
  const hasChart = data.length > 1;
  const latest = data.length > 0 ? data[data.length - 1].price : null;
  const first = data.length > 0 ? data[0].price : null;
  const change =
    first != null && latest != null && first > 0 ? ((latest - first) / first) * 100 : null;

  return (
    <SectionCard
      title="Price"
      description={hasChart ? `$${token.symbol} against USD` : "Historical price, live from launch"}
      action={
        <Tabs value={timeframe} onValueChange={(value) => setTimeframe(value as TokenTimeframe)}>
          <TabsList>
            {TOKEN_TIMEFRAMES.map((frame) => (
              <TabsTrigger key={frame} value={frame}>
                {frame}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
      contentClassName="px-2 py-2 sm:px-3"
    >
      {hasChart ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3 px-2 pb-3 pt-1 sm:px-3">
            <div className="space-y-0.5">
              <p className="text-2xl font-semibold tabular-nums text-foreground">
                {latest == null ? UNKNOWN : formatPrice(latest)}
              </p>
              <p className="text-xs text-muted-foreground">
                {token.market.updatedAt
                  ? `Updated ${relative(token.market.updatedAt)}`
                  : `$${token.symbol} · ${timeframe}`}
              </p>
            </div>
            {change == null ? null : <Delta value={change} label={`over ${timeframe}`} />}
          </div>

          <ChartContainer
            config={priceChartConfig}
            className="aspect-auto h-[260px] w-full sm:h-[320px]"
          >
            <AreaChart
              data={data}
              accessibilityLayer
              margin={{ left: 4, right: 12, top: 8, bottom: 0 }}
            >
              <defs>
                <linearGradient id="bag-price-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-price)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-price)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={28}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={64}
                domain={["auto", "auto"]}
                tickFormatter={(value: number) => formatPrice(value)}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
              <Area
                dataKey="price"
                type="monotone"
                stroke="var(--color-price)"
                strokeWidth={2}
                fill="url(#bag-price-fill)"
              />
            </AreaChart>
          </ChartContainer>
        </>
      ) : (
        <div className="relative flex min-h-[260px] items-center justify-center sm:min-h-[320px]">
          {/* A baseline, not a curve: this says "provisional axis", never "here is the price". */}
          <div
            aria-hidden="true"
            className="absolute inset-x-6 top-1/2 border-t border-dashed border-border/70"
          />
          <EmptyState
            icon={LineChartIcon}
            title={token.live ? "Price feed connecting" : "Price history unlocks at launch"}
            description={
              token.live
                ? "The contract address is live. Price, volume and liquidity appear here as soon as the market data feed answers."
                : `There is no $${token.symbol} contract address yet, so there is no price to plot. This chart fills in from the first trade.`
            }
            className="relative border-0 bg-transparent"
          />
        </div>
      )}
    </SectionCard>
  );
}

/**
 * The buyback-and-burn loop and its ledger.
 *
 * Totals are dashes until a buyback has actually settled: "0 burned" and "nothing burned yet" are
 * different statements, and only the second one is true today. The fee split beside the table is
 * real — it is computed from the same constants the payout path uses — so the section explains the
 * mechanism properly even while its history is empty.
 */
function BuybackSection({ token }: { token: TokenAnalytics }) {
  const { buyback } = token;
  const hint = pendingHint(token.live);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <section
          aria-label="Buyback and burn totals"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <MetricCard
            label="Total bought back"
            value={valueOrDash(buyback.totalSpentUsd, (n) => usd(n, { cents: true }))}
            hint={hint}
            icon={Coins}
          />
          <MetricCard
            label="Total burned"
            value={valueOrDash(buyback.totalBurned, (n) => `${compactNumber(n)} ${token.symbol}`)}
            hint={hint}
            icon={Flame}
          />
          <MetricCard
            label="Last buyback"
            value={buyback.lastBuybackAt ? dateMedium(buyback.lastBuybackAt) : UNKNOWN}
            hint={buyback.lastBuybackAt ? relative(buyback.lastBuybackAt) : hint}
            icon={Clock}
          />
          <MetricCard
            label="Last burn"
            value={buyback.lastBurnAt ? dateMedium(buyback.lastBurnAt) : UNKNOWN}
            hint={buyback.lastBurnAt ? relative(buyback.lastBurnAt) : hint}
            icon={Clock}
          />
        </section>

        <BuybackHistoryCard token={token} />
      </div>

      <FeeLoopCard token={token} />
    </div>
  );
}

/**
 * The ledger.
 *
 * Rendered as a real table with real headers even while it is empty, so the shape of the record is
 * visible before the first row exists — and so there is nothing to restructure when the data
 * arrives. The empty row explains what will fill it rather than saying "no data".
 */
function BuybackHistoryCard({ token }: { token: TokenAnalytics }) {
  const rows = token.buyback.history;

  return (
    <SectionCard
      title="Buyback & Burn History"
      description="Every settled buyback, newest first"
      action={
        <span className="text-xs tabular-nums text-muted-foreground">
          {rows.length} record{rows.length === 1 ? "" : "s"}
        </span>
      }
      contentClassName="px-0 py-0"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Spent</TableHead>
            <TableHead className="text-right">Burned</TableHead>
            <TableHead className="text-right">Transaction</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={4}
                className="whitespace-normal px-4 py-10 text-center text-sm leading-relaxed text-muted-foreground sm:px-5"
              >
                {token.live
                  ? "No buybacks settled yet. The ledger fills in from the first one."
                  : `The first buyback runs once $${token.symbol} is live and a campaign payout settles — 2.5% of that fee buys the token to burn.`}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-sm text-foreground">
                  {dateMedium(row.at)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-foreground">
                  {usd(row.spentUsd, { cents: true })}
                </TableCell>
                <TableCell className="text-right tabular-nums text-brand">
                  {compactNumber(row.burned)}{" "}
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {token.symbol}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {row.signature ? (
                    <a
                      href={`https://solscan.io/tx/${row.signature}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      title="View on Solscan"
                    >
                      {shortAddress(row.signature, 4)}
                      <ArrowUpRight aria-hidden="true" className="size-3" />
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">{UNKNOWN}</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

/**
 * What the split actually is.
 *
 * Every figure here is derived: the percentages come from the same basis-point constants the payout
 * path charges against, and the worked example comes from `calculateFeeSplit` — the identical
 * function that runs when a payout settles. That is deliberate, because a marketing number that
 * drifts from the charged number is worse than no number.
 */
function FeeLoopCard({ token }: { token: TokenAnalytics }) {
  const { feeSplit, feeExample } = token;

  return (
    <SectionCard
      title="How the loop works"
      description="Taken from every campaign fee"
      className="lg:sticky lg:top-20 lg:self-start"
    >
      <dl className="divide-y divide-border/60">
        <InfoRow
          label="Platform fee"
          value={`${feeSplit.platformFeeBps / 100}%`}
          hint="Charged on each payout"
        />
        <InfoRow label="To the treasury" value={`${feeSplit.treasuryBps / 100}%`} />
        <InfoRow
          label="To buyback & burn"
          value={`${feeSplit.burnBps / 100}%`}
          hint={`Buys $${token.symbol}, then burns it`}
        />
      </dl>

      <Separator className="my-4" />

      <p className="text-xs leading-relaxed text-muted-foreground">
        On {usd(feeExample.grossUsd)} of campaign fees,{" "}
        <span className="text-foreground">{usd(feeExample.platformFee, { cents: true })}</span> is
        charged: {usd(feeExample.treasury, { cents: true })} to the treasury and{" "}
        <span className="text-brand">{usd(feeExample.burn, { cents: true })}</span> spent buying
        back and burning ${token.symbol}.
      </p>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Burns happen on-chain and reduce total supply permanently, so every settlement is
        verifiable against the mint rather than taken on trust.
      </p>
    </SectionCard>
  );
}

/**
 * The contract address.
 *
 * This block is the one part of the page that becomes fully real the moment a mint is set: the
 * string, the copy button and both outbound links are all keyed off it. While it is unset they are
 * visibly disabled with a stated reason — the honest version of "coming soon", and better than a
 * button that looks live and does nothing.
 */
function ContractCard({ token }: { token: TokenAnalytics }) {
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    if (!token.mint) return;
    try {
      await navigator.clipboard.writeText(token.mint);
      setCopied(true);
      toast.success("Contract address copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy the address");
    }
  }

  const soonTitle = "Unlocks when the contract address is published";

  return (
    <SectionCard
      title="Contract address"
      description={
        token.live
          ? `The official ${token.symbol} mint on Solana`
          : `Published the moment $${token.symbol} goes live`
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/40 px-3 py-2.5">
          <span
            className={cn(
              "min-w-0 flex-1 truncate font-mono text-xs",
              token.mint ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {token.mint ?? TO_BE_ANNOUNCED}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={!token.live}
            onClick={copyAddress}
            className="shrink-0 gap-1.5"
            title={token.live ? "Copy the contract address" : soonTitle}
          >
            <Copy aria-hidden="true" className="size-3.5" />
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {token.links ? (
            <>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href={token.links.dexscreener} target="_blank" rel="noreferrer noopener">
                  DexScreener
                  <ArrowUpRight aria-hidden="true" className="size-3.5" />
                </a>
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href={token.links.solscan} target="_blank" rel="noreferrer noopener">
                  Solscan
                  <ArrowUpRight aria-hidden="true" className="size-3.5" />
                </a>
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled
                className="gap-1.5"
                title={soonTitle}
              >
                DexScreener
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                  Soon
                </Badge>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled
                className="gap-1.5"
                title={soonTitle}
              >
                Solscan
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                  Soon
                </Badge>
              </Button>
            </>
          )}
        </div>

        {token.live ? null : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            There is no address to publish yet, and this page will not show one it cannot verify.
            When the mint is deployed it appears here and both buttons turn on.
          </p>
        )}
      </div>
    </SectionCard>
  );
}

/**
 * The wallet distribution.
 *
 * A distribution is a claim about a set of wallets, so it is only shown when an indexer has
 * actually produced one. Until then the table keeps its headers and one explanatory row, which
 * shows the shape of the data without asserting anything about it.
 */
function HoldersCard({ token }: { token: TokenAnalytics }) {
  const rows = token.holders;

  return (
    <SectionCard
      title="Top holders"
      description={
        token.live ? "Largest wallets by balance" : "Wallet distribution, published at launch"
      }
      action={
        <span className="text-xs tabular-nums text-muted-foreground">
          {rows.length} wallet{rows.length === 1 ? "" : "s"}
        </span>
      }
      contentClassName="px-0 py-0"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Wallet</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead className="text-right">Share</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={3}
                className="whitespace-normal px-4 py-10 text-center text-sm leading-relaxed text-muted-foreground sm:px-5"
              >
                {token.live
                  ? "Holder data appears once the indexer has seen the first transfers."
                  : `Distribution publishes with $${token.symbol} — there are no holders before there is a token.`}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((holder) => (
              <TableRow key={holder.address}>
                <TableCell>
                  <span className="flex flex-col gap-0.5">
                    <span className="font-mono text-xs text-foreground">
                      {shortAddress(holder.address, 6, 6)}
                    </span>
                    {holder.label ? (
                      <span className="text-[11px] text-muted-foreground">{holder.label}</span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums text-foreground">
                  {compactNumber(holder.amount)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {pct(holder.pct, 2)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

/**
 * What the treasury has actually been doing.
 *
 * Two sources on purpose. The chain read (through the provider chain — Helius, then Alchemy) is what
 * makes this real: it lists transfers whether or not a webhook ever arrived. The recorded swap queue
 * is what makes it complete, because a deposit sitting unconverted has no on-chain trace that says
 * "waiting to be swapped" — that fact only exists in our own rows.
 */
function TreasuryFlowsCard({ token }: { token: TokenAnalytics }) {
  const { treasury } = token;
  const flows = treasury.flows;

  return (
    <SectionCard
      title="Treasury flows"
      description={
        token.live
          ? "Recent transfers in and out of the Bagwork treasury"
          : "Live from the first deposit"
      }
      className="lg:col-span-2"
      action={
        <span className="text-xs tabular-nums text-muted-foreground">
          {treasury.cached ? "cached · " : ""}
          {treasury.totals.inboundEvents} in · {treasury.totals.outboundEvents} out
        </span>
      }
      contentClassName="px-0 py-0"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Direction</TableHead>
            <TableHead>Asset</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {flows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={4}
                className="whitespace-normal px-4 py-10 text-center text-sm leading-relaxed text-muted-foreground sm:px-5"
              >
                {treasury.error
                  ? `Could not read the treasury's transfer history: ${treasury.error}`
                  : token.live
                    ? "No treasury transfers recorded yet."
                    : "Nothing has moved through the treasury yet. Deposits appear here the moment a bag is funded."}
              </TableCell>
            </TableRow>
          ) : (
            flows.slice(0, 8).map((flow) => (
              <TableRow key={`${flow.signature}-${flow.mint}-${flow.direction}`}>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      flow.direction === "in"
                        ? "border-success/40 bg-success/10 text-success"
                        : "border-border bg-secondary/40 text-muted-foreground"
                    }
                  >
                    {flow.direction === "in" ? "In" : "Out"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-foreground">
                  {flow.symbol || shortAddress(flow.mint, 4, 4)}
                  <span className="ml-1.5 text-[11px] text-muted-foreground">
                    {flow.assetType === "native" ? "native" : "SPL"}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums text-foreground">
                  {compactNumber(flow.amount)}
                  {flow.symbol ? (
                    <span className="ml-1 text-[11px] text-muted-foreground">{flow.symbol}</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {flow.blockTime ? relative(flow.blockTime) : UNKNOWN}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

/**
 * The queue: fee income already in the treasury that the swap pipeline has not converted yet, and
 * the $BAG a buyback has already bought but not burned.
 *
 * The first half is our own recorded state — a deposit with `status: received | no_route |
 * below_minimum` is one the pipeline will retry. The second half is a live balance read, and is
 * `null` before there is a mint, which is why it renders as a placeholder rather than a zero.
 */
function BuybackQueueCard({ token }: { token: TokenAnalytics }) {
  const { treasury } = token;
  const candidates = treasury.buybackCandidates;
  const burn = treasury.burnCandidates;

  return (
    <SectionCard title="Buyback queue" description="Fee income waiting to be converted">
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Awaiting swap</p>

          {candidates.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {token.live
                ? "Nothing waiting — every recorded deposit has been converted."
                : "No fee income recorded yet. Deposits for a bag's fee mint are queued here and swapped to USDC automatically."}
            </p>
          ) : (
            <ul className="space-y-2">
              {candidates.map((candidate) => (
                <li
                  key={candidate.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">
                      {compactNumber(candidate.amount)}{" "}
                      {candidate.symbol || shortAddress(candidate.mint, 4, 4)}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {candidate.reason ?? `Status: ${candidate.status}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {relative(candidate.receivedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Separator />

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Held for burning</p>
          <p className="text-2xl font-semibold tabular-nums text-foreground">
            {burn ? compactNumber(burn.balance) : UNKNOWN}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {burn
              ? `${token.symbol} sitting in the treasury from ${burn.recordedEvents} recorded buyback${
                  burn.recordedEvents === 1 ? "" : "s"
                }.`
              : `Nothing can be burned until $${token.symbol} has a contract address.`}
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

/**
 * `/dashboard/token`.
 *
 * The payload arrives fully built from the server, so this component has no loading state of its
 * own — the console shell's skeleton covers the route transition, and by the time this renders
 * there is nothing left to wait for. Nothing here re-derives a number; it formats what it was
 * given and keeps the two states (pre-launch, live) visually distinct.
 */
export function TokenAnalyticsPage({ token }: { token: TokenAnalytics }) {
  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Token"
        title="Token Analytics"
        description={
          token.live
            ? `Live market, buyback and burn data for $${token.symbol}.`
            : `$${token.symbol} is not live yet. This is the dashboard it will report into — the fee loop, the buyback-and-burn ledger and the market metrics, wired and waiting for a contract address.`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!token.live && <LaunchingSoonBadge />}
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href="/docs">
                Fee redirect docs
                <ArrowUpRight aria-hidden="true" className="size-3.5" />
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <TokenIdentityCard token={token} />
        <TokenStats token={token} />
        <PriceChartCard token={token} />
        <BuybackSection token={token} />

        <div className="grid gap-6 lg:grid-cols-3">
          <TreasuryFlowsCard token={token} />
          <BuybackQueueCard token={token} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <ContractCard token={token} />
          <div className="lg:col-span-2">
            <HoldersCard token={token} />
          </div>
        </div>
      </div>
    </div>
  );
}
