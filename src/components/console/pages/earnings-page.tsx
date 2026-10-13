"use client";

import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Copy,
  DollarSign,
  Download,
  Flame,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { shortAddress, usd } from "@/lib/console/format";
import { useConsolePayouts } from "@/lib/console/hooks";
import { useAuth } from "@/components/auth/auth-provider";
import { SOLANA_CLUSTER } from "@/lib/privy/config";
import { PlatformChip } from "../platform-icons";
import {
  EmptyState,
  ErrorState,
  MetricCard,
  MetricSkeleton,
  PageHeader,
  SectionCard,
  SignInRequired,
  TableSkeleton,
  TokenMark,
} from "../ui";

export function Earnings() {
  const { ready, authenticated, login } = useAuth();
  const { data, isLoading, isError, refetch } = useConsolePayouts();
  const [copiedTx, setCopiedTx] = useState<string | null>(null);

  const summary = data?.summary;
  const payouts = data?.payouts ?? [];
  const monthly = data?.monthly ?? [];

  const sparklinePoints = monthly.map((m) => m.value);
  const maxMonth = Math.max(1, ...monthly.map((m) => m.value));

  async function copyTx(tx: string) {
    try {
      await navigator.clipboard.writeText(tx);
      setCopiedTx(tx);
      toast.success("Transaction signature copied");
      setTimeout(() => setCopiedTx(null), 2000);
    } catch {
      toast.error("Failed to copy transaction");
    }
  }

  function exportCsv() {
    if (!payouts.length) return;
    const header = "Date,Bag,Token,Platform,Amount (USDC),Status,TxSignature\n";
    const body = payouts
      .map(
        (p) =>
          `"${p.createdAt}","${p.campaignTitle}","${p.tokenSymbol}","${p.platform}",${p.amount},"${p.status}","${p.txSignature}"`,
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `bagwork-earnings-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Earnings exported to CSV");
  }

  if (ready && !authenticated) {
    return (
      <SignInRequired
        title="Sign in to see your earnings"
        description="Payout history is private and tied to your wallet — sign in to see settled transfers."
        onConnect={login}
      />
    );
  }

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Finance"
        title="Earnings & Payouts"
        description="On-chain USDC settlements across all completed bag campaigns."
        actions={
          payouts.length ? (
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              className="gap-1.5"
            >
              <Download aria-hidden="true" className="size-4" />
              Export CSV
            </Button>
          ) : undefined
        }
      />

      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {isLoading ? (
          <MetricSkeleton count={4} />
        ) : (
          <section
            aria-label="Earnings metrics"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            <MetricCard
              label="Total earned"
              value={usd(summary?.total ?? 0, { compact: true })}
              hint={
                summary?.last30
                  ? `${usd(summary.last30)} settled in the last 30 days`
                  : `${summary?.count ?? 0} settled transactions`
              }
              icon={DollarSign}
              spark={sparklinePoints}
              sparkLabel="Six-month payout trend"
            />
            <MetricCard
              label="This month"
              value={usd(summary?.thisMonth ?? 0, { cents: true })}
              hint="Calendar month to date"
              icon={Calendar}
            />
            <MetricCard
              label="Average payout"
              value={usd(summary?.avg ?? 0, { cents: true })}
              hint="Per approved submission"
              icon={TrendingUp}
            />
            <MetricCard
              label="Largest bag payout"
              value={usd(summary?.largest ?? 0, { cents: true })}
              hint="Highest single payout"
              icon={Flame}
            />
          </section>
        )}

        {monthly.length > 0 && !isLoading ? (
          <SectionCard
            title="6-Month Payout Trend"
            description="Historical USDC payouts settled across past months"
            action={
              <span className="text-xs text-muted-foreground tabular-nums">
                All payouts settle on Solana{" "}
                {SOLANA_CLUSTER === "mainnet-beta" ? "mainnet" : "devnet"}
              </span>
            }
          >
            <div className="grid grid-cols-6 items-end gap-2 pt-6 sm:gap-4">
              {monthly.map((m) => {
                const pct = Math.max(6, Math.round((m.value / maxMonth) * 100));
                return (
                  <div
                    key={m.label}
                    className="group flex flex-col items-center gap-2"
                  >
                    <div className="text-[11px] font-medium tabular-nums text-muted-foreground transition-colors group-hover:text-foreground">
                      {m.value > 0 ? usd(m.value, { compact: true }) : "$0"}
                    </div>
                    <div className="flex h-28 w-full max-w-[3.5rem] items-end rounded-t-md bg-secondary/40 p-1">
                      <div
                        style={{ height: `${pct}%` }}
                        className="w-full rounded-[3px] bg-brand/80 transition-all duration-300 group-hover:bg-brand"
                      />
                    </div>
                    <div className="text-xs font-medium text-foreground">
                      {m.label}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {m.count} post{m.count === 1 ? "" : "s"}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        ) : null}

        <section aria-labelledby="history-heading" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2
              id="history-heading"
              className="text-base font-semibold text-foreground"
            >
              Settlement History
            </h2>
            <span className="text-xs text-muted-foreground">
              {payouts.length} record{payouts.length === 1 ? "" : "s"}
            </span>
          </div>

          {isLoading ? (
            <Card className="gap-0 py-0">
              <CardContent className="p-4 sm:p-5">
                <TableSkeleton rows={6} />
              </CardContent>
            </Card>
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : payouts.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No payouts settled yet"
              description="Pick a bag from the directory, submit quality content, and once approved your payout lands directly on-chain."
              action={
                <Button asChild>
                  <Link href="/dashboard">Browse open bags</Link>
                </Button>
              }
            />
          ) : (
            <Card className="gap-0 overflow-hidden py-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">Bag</TableHead>
                    <TableHead scope="col">Platform</TableHead>
                    <TableHead scope="col">Amount</TableHead>
                    <TableHead scope="col">Date</TableHead>
                    <TableHead scope="col">Status</TableHead>
                    <TableHead scope="col" className="text-right">
                      Transaction
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-[16rem]">
                        <div className="flex items-center gap-2.5">
                          <TokenMark
                            symbol={p.tokenSymbol}
                            color={p.tokenColor || "#eab308"}
                            className="size-8 text-[10px]"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {p.campaignTitle}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {p.projectName} · {p.tokenSymbol}
                            </span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <PlatformChip platform={p.platform} />
                      </TableCell>
                      <TableCell className="font-semibold tabular-nums text-brand">
                        +{usd(p.amount, { cents: true })}
                        <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                          {p.token}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {new Date(p.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                          <CheckCircle2 aria-hidden="true" className="size-3" />
                          Settled
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => copyTx(p.txSignature)}
                            className="inline-flex h-7 items-center gap-1 rounded border border-border/60 bg-secondary/50 px-2 font-mono text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                            title="Copy full transaction signature"
                          >
                            <Copy aria-hidden="true" className="size-3" />
                            {shortAddress(p.txSignature, 4)}
                          </button>
                          <a
                            href={p.explorerUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex size-7 items-center justify-center rounded border border-border/60 bg-secondary/50 text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                            title="View on Solscan"
                          >
                            <ArrowUpRight
                              aria-hidden="true"
                              className="size-3.5"
                            />
                            <span className="sr-only">View on Solscan</span>
                          </a>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
