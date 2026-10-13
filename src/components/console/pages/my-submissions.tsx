"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Ban,
  CircleDashed,
  Clock3,
  Coins,
  Loader2,
  Plus,
  Send,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/components/auth/auth-provider";
import { dateMedium, relative, usd } from "@/lib/console/format";
import { useSubmissions } from "@/lib/queries";
import {
  groupByBag,
  type BagGroup,
  type SubmissionsBucket,
} from "@/lib/submissions";
import type { Submission } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PlatformIcon } from "../platform-icons";
import { PostPreviewLink } from "../post-preview";
import { SubmissionStatusBadge } from "../status-badge";
import {
  CardGridSkeleton,
  EmptyState,
  ErrorState,
  MetricCard,
  PageHeader,
  SignInRequired,
} from "../ui";

/**
 * My Submissions, grouped by bag.
 *
 * One card per bag rather than one row per link. The underlying records are still one per link —
 * which is what review and payout operate on — so nothing about scoring or paying changed; this
 * is presentation. The grouping rules live in `lib/submissions.ts` so they can be tested.
 */

type TabKey = "all" | "action" | "pending" | "approved" | "paid" | "rejected";

const BUCKET_COPY: Record<
  SubmissionsBucket,
  { label: string; tone: "info" | "warning" | "success" | "destructive"; icon: typeof Clock3; help: string }
> = {
  action: {
    label: "Link pending",
    tone: "info",
    icon: CircleDashed,
    help: "You hold a slot in this bag — add a content link to send it for review.",
  },
  pending: {
    label: "Pending review",
    tone: "warning",
    icon: Clock3,
    help: "Waiting on the anti-slop review to score this content. Nothing has decided it yet.",
  },
  approved: {
    label: "Approved · payout due",
    tone: "success",
    icon: Coins,
    help: "Passed review. The payout is sent automatically — nothing is waiting on the publisher.",
  },
  paid: {
    label: "Paid",
    tone: "success",
    icon: Coins,
    help: "Settled on-chain. The USDC is in your wallet.",
  },
  rejected: {
    label: "Rejected",
    tone: "destructive",
    icon: Ban,
    help: "Failed the brief or the authenticity checks.",
  },
};

const EMPTY_COPY: Record<TabKey, { title: string; description: string }> = {
  all: {
    title: "No submissions yet",
    description:
      "Open a bag, opt in, and paste your first content link. You can add as many links as you like.",
  },
  action: {
    title: "Nothing waiting on you",
    description: "Bags where you hold a slot but have not posted yet would appear here.",
  },
  pending: {
    title: "Nothing in review",
    description: "Content waiting on a review verdict will show up here.",
  },
  paid: {
    title: "Nothing paid yet",
    description: "Payouts that have settled on-chain will be listed here.",
  },
  approved: {
    title: "No approved content yet",
    description: "Once a post passes review it appears here with the payout it earned.",
  },
  rejected: {
    title: "Nothing rejected",
    description: "Content that fails the brief or the authenticity checks lands here.",
  },
};

/**
 * One bag, with every link in it.
 *
 * The whole card links to the full-page view rather than opening a drawer: the page is where a
 * creator adds more links and reads verdicts, and a side panel that closes on the next click was
 * the wrong container for that.
 */
export function BagSubmissionCard({ group }: { group: BagGroup }) {
  const meta = BUCKET_COPY[group.bucket];
  const BucketIcon = meta.icon;
  const href = `/dashboard/submissions/${group.campaignId}`;

  return (
    <Card className="gap-0 overflow-hidden py-0 transition-colors duration-200 hover:border-foreground/20">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "gap-1 font-normal",
                  meta.tone === "info" && "border-info/30 bg-info/10 text-info",
                  meta.tone === "warning" && "border-warning/30 bg-warning/10 text-warning",
                  meta.tone === "success" && "border-success/30 bg-success/10 text-success",
                  meta.tone === "destructive" &&
                    "border-destructive/40 bg-destructive/10 text-destructive",
                )}
              >
                <BucketIcon aria-hidden="true" className="size-3" />
                {meta.label}
              </Badge>
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {group.tokenSymbol}
              </span>
            </div>

            <Link
              href={href}
              className="block truncate text-sm font-semibold text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {group.campaignTitle}
            </Link>

            <p className="text-xs text-muted-foreground">
              {group.links.length === 0
                ? "No content links yet"
                : `${group.links.length} content link${group.links.length === 1 ? "" : "s"}`}{" "}
              · updated {relative(group.latest)}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {group.earned > 0 ? (
              <span className="text-sm font-semibold tabular-nums text-success">
                {usd(group.earned, { cents: true })}
              </span>
            ) : null}
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link href={href}>
                Open
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>

        {group.records.length > 0 ? (
          <ul className="divide-y divide-border/60 rounded-xl border border-border">
            {group.records.map((record) => (
              <li key={record.id} className="space-y-1.5 px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <PlatformIcon platform={record.platform} className="size-3.5 shrink-0 text-muted-foreground" />
                    {record.postUrl ? (
                      <PostPreviewLink
                        url={record.postUrl}
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex min-w-0 items-center gap-1 rounded-sm text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <span className="truncate">{record.postUrl.replace(/^https?:\/\//, "")}</span>
                        <ArrowUpRight aria-hidden="true" className="size-3 shrink-0" />
                      </PostPreviewLink>
                    ) : (
                      <span className="text-xs text-muted-foreground">Link not added yet</span>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {dateMedium(record.createdAt)}
                    </span>
                    {record.payoutAmount ? (
                      <span className="text-xs font-medium tabular-nums text-foreground">
                        {usd(record.payoutAmount, { cents: true })}
                      </span>
                    ) : null}
                    <SubmissionStatusBadge status={record.status} />
                  </div>
                </div>

                {/* Review runs on its own after the link is saved, so the creator is told the post is
                    being read rather than left wondering why nothing has moved. */}
                {record.status === "pending" || record.status === "reviewing" ? (
                  <p
                    role="status"
                    className="flex items-center gap-2 text-[11px] text-muted-foreground"
                  >
                    <Loader2 aria-hidden="true" className="size-3 animate-spin" />
                    Analyzing submission — reading your post and scoring it against the brief.
                  </p>
                ) : null}

                {/* The reason a submission was decided the way it was, shown on the card rather than
                    only behind a click. A pending submission carries a note too when review could
                    not read the post, and that reason matters most of all — it is the difference
                    between "still working" and "nobody can score this". */}
                {record.reviewNote ? (
                  <p
                    className={cn(
                      "rounded-md border px-2 py-1.5 text-[11px] leading-relaxed",
                      record.status === "rejected"
                        ? "border-destructive/30 bg-destructive/5 text-destructive"
                        : "border-border bg-muted/30 text-muted-foreground",
                    )}
                  >
                    {record.reviewNote}
                  </p>
                ) : null}

                {/* The account this link was proven to come from, kept visible as an audit line. */}
                {record.verifiedHandle ? (
                  <p className="text-[11px] text-muted-foreground">
                    Verified as @{record.verifiedHandle}
                    {record.verifiedPlatform ? ` on ${record.verifiedPlatform === "x" ? "X" : record.verifiedPlatform}` : ""}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        <p className="text-[11px] text-muted-foreground">{meta.help}</p>
      </CardContent>
    </Card>
  );
}


export function MySubmissions() {
  const { ready, authenticated, login } = useAuth();
  const { data, isLoading, isError, refetch } = useSubmissions();
  const [tab, setTab] = React.useState<TabKey>("all");

  const submissions = data?.submissions ?? [];
  const groups = React.useMemo(() => groupByBag(submissions), [submissions]);

  const counts = React.useMemo(
    () => ({
      all: groups.length,
      action: groups.filter((g) => g.bucket === "action").length,
      pending: groups.filter((g) => g.bucket === "pending").length,
      approved: groups.filter((g) => g.bucket === "approved").length,
      paid: groups.filter((g) => g.bucket === "paid").length,
      rejected: groups.filter((g) => g.bucket === "rejected").length,
    }),
    [groups],
  );

  /*
   * The pipeline, counted per link rather than per bag — review and payout happen to links.
   *
   * `paidUsd` counts **paid** only. The old figure summed `payoutAmount` across every submission,
   * approved-but-unsettled included, under a hint that read "Settled to your wallet" — so a creator
   * was shown money that had not been sent yet. What is approved but unpaid is now its own number
   * rather than being quietly added to what has actually been earned.
   */
  const pendingReview = submissions.filter(
    (s) => s.status === "pending" || s.status === "reviewing",
  ).length;
  const pendingPayout = submissions.filter((s) => s.status === "approved").length;
  const paidCount = submissions.filter((s) => s.status === "paid").length;
  const rejectedCount = submissions.filter((s) => s.status === "rejected").length;
  const usdFor = (status: string) =>
    submissions
      .filter((s) => s.status === status)
      .reduce((sum, s) => sum + (s.payoutAmount ?? 0), 0);

  const rows = tab === "all" ? groups : groups.filter((g) => g.bucket === tab);

  if (ready && !authenticated) {
    return (
      <SignInRequired
        title="Sign in to see your submissions"
        description="Submissions are tied to the wallet that will be paid, so the same wallet always brings them back."
        onConnect={login}
      />
    );
  }

  if (isError && !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Bagworker"
        title="My Submissions"
        description="Every bag you have opted into, and every content link you have posted for it."
      />

      <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <section aria-label="Submission summary">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Pending review"
              value={String(pendingReview)}
              hint="Not scored yet — nothing has decided these"
              icon={Clock3}
            />
            <MetricCard
              label="Pending payout"
              value={String(pendingPayout)}
              hint={`${usd(usdFor("approved"), { cents: true })} approved, not settled yet`}
              icon={Wallet}
            />
            <MetricCard
              label="Paid"
              value={String(paidCount)}
              hint={`${usd(usdFor("paid"), { cents: true })} settled to your wallet`}
              icon={Coins}
            />
            <MetricCard
              label="Rejected"
              value={String(rejectedCount)}
              hint="Not accepted for these bags"
              icon={Ban}
            />
          </div>
        </section>

        {groups.length > 0 ? (
          <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
            <TabsList>
              <TabsTrigger value="all">All · {counts.all}</TabsTrigger>
              <TabsTrigger value="action">Action needed · {counts.action}</TabsTrigger>
              <TabsTrigger value="pending">Pending review · {counts.pending}</TabsTrigger>
              <TabsTrigger value="approved">Pending payout · {counts.approved}</TabsTrigger>
              <TabsTrigger value="paid">Paid · {counts.paid}</TabsTrigger>
              <TabsTrigger value="rejected">Rejected · {counts.rejected}</TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}

        {isLoading ? (
          <CardGridSkeleton count={4} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Send}
            title={EMPTY_COPY[tab].title}
            description={EMPTY_COPY[tab].description}
            action={
              <Button asChild>
                <Link href="/dashboard">Explore bags</Link>
              </Button>
            }
          />
        ) : (
          <ul className="grid list-none gap-4 p-0">
            {rows.map((group) => (
              <li key={group.campaignId}>
                <BagSubmissionCard group={group} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default MySubmissions;

