"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";

import { adminGet } from "./api";
import { ErrorNote, Kpi, Loading, money, Panel, Pill } from "./ui";

interface Overview {
  metrics: {
    users: number;
    usersWithWallet: number;
    creators: number;
    publishers: number;
    newUsersThisWeek: number;
    campaigns: number;
    liveCampaigns: number;
    endedCampaigns: number;
    campaignsWithoutOwner: number;
    totalBudget: number;
    openBudget: number;
    submissions: number;
    pending: number;
    reviewing: number;
    approved: number;
    rejected: number;
    paid: number;
    awaitingReview: number;
    awaitingPayoutCount: number;
    awaitingPayoutTotal: number;
    payouts: number;
    totalPaid: number;
    feesCollected: number;
    avgPayout: number;
    largestPayout: number;
    paidLast7Days: number;
    totalViews: number;
    rankedCreators: number;
  };
}

export function AdminOverview() {
  const [data, setData] = React.useState<Overview | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setError(null);
    adminGet<Overview>("/api/admin/overview")
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  React.useEffect(load, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading label="Loading platform metrics…" />;

  const m = data.metrics;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#333] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/60 hover:border-[#E8924C]/40 hover:text-[#E8924C]"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total users" value={m.users} hint={`${m.newUsersThisWeek} new this week`} />
        <Kpi label="Creators" value={m.creators} hint={`${m.usersWithWallet} with a wallet`} />
        <Kpi label="Publishers" value={m.publishers} hint={`${m.campaignsWithoutOwner} bags unowned`} />
        <Kpi label="Ranked creators" value={m.rankedCreators} hint="On the leaderboard" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Campaigns" value={m.campaigns} hint={`${m.liveCampaigns} live · ${m.endedCampaigns} ended`} />
        <Kpi label="Budget committed" value={money(m.totalBudget, true)} />
        <Kpi label="Still open" value={money(m.openBudget, true)} tone="accent" />
        <Kpi label="Total views tracked" value={m.totalViews.toLocaleString()} />
      </div>

      <Panel title="Submissions" subtitle="Every post, by review state">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Kpi label="Total" value={m.submissions} />
          <Kpi label="Awaiting review" value={m.awaitingReview} tone={m.awaitingReview ? "warn" : "default"} hint={`${m.pending} pending · ${m.reviewing} reviewing`} />
          <Kpi label="Approved" value={m.approved} tone="accent" />
          <Kpi label="Rejected" value={m.rejected} tone="bad" />
          <Kpi label="Paid" value={m.paid} tone="good" />
          <Kpi
            label="Awaiting payout"
            value={m.awaitingPayoutCount}
            tone={m.awaitingPayoutCount ? "warn" : "default"}
            hint={money(m.awaitingPayoutTotal, true)}
          />
        </div>
        {m.awaitingPayoutCount > 0 ? (
          <p className="mt-3">
            <Pill tone="warn">
              {m.awaitingPayoutCount} approved submission
              {m.awaitingPayoutCount === 1 ? "" : "s"} still unpaid — open the Pay creators tab
            </Pill>
          </p>
        ) : null}
      </Panel>

      <Panel title="Money" subtitle="Settled payouts and the 5% platform fee">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi label="Paid to creators" value={money(m.totalPaid, true)} tone="good" />
          <Kpi label="Fees collected" value={money(m.feesCollected, true)} tone="accent" hint="2.5% treasury + 2.5% $BAG burn" />
          <Kpi label="Payouts settled" value={m.payouts} />
          <Kpi label="Average payout" value={money(m.avgPayout, true)} />
          <Kpi label="Last 7 days" value={money(m.paidLast7Days, true)} />
        </div>
      </Panel>
    </div>
  );
}
