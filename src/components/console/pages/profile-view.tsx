"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowUpRight,
  Ban,
  Check,
  Clock3,
  Coins,
  ExternalLink,
  Flame,
  Hammer,
  Loader2,
  Settings,
  Star,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/components/auth/auth-provider";
/*
  Settings are a page now (`/dashboard/settings`), not a drawer. The gear in this header links
  there, and the sheet this file used to mount is deleted.
*/
import { BagworkerTag, ProfileAvatar, formatPoints } from "@/components/console/identity";
import { LevelRing } from "@/components/shared/level-ring";
import { EmptyState, PageHeader } from "@/components/console/ui";
import { PlatformIcon } from "@/components/console/platform-icons";
import { RankBadgeRail } from "@/components/console/rank-badges";
import { SubmissionStatusBadge } from "@/components/console/status-badge";
import { dateMedium, relative, usd } from "@/lib/console/format";
import { useProfile, useProfileActivity, type Profile } from "@/lib/profile/hooks";
import { levelFromPoints } from "@/lib/profile/points";
import { truncateAddress } from "@/lib/privy/config";
import { useSubmissions } from "@/lib/queries";
import type { Submission } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Your Bagworker profile.
 *
 * A *view*, not a form. Identity, the numbers that describe the work, the four states that work
 * can be in, and the activity behind it — that is the whole page. Everything editable moved into
 * the settings drawer behind the gear, which is what let this file stop being a form with a page
 * built around it and become a layout that can be read top to bottom in one pass.
 *
 * Every number here is derived from data that already exists: the profile endpoint (points,
 * level, `Bagworker#`, totals) and the submissions the account actually made. Nothing is
 * estimated, and nothing is invented for the look of it.
 */

/** The calendar keys its cells to the browser's timezone, so it is mounted, never server-rendered. */
const ProfileActivity = dynamic(
  () => import("@/components/console/profile-activity").then((m) => m.ProfileActivity),
  { ssr: false, loading: () => <Skeleton className="h-[196px] w-full rounded-xl" /> },
);

/**
 * The four tabs, mapped to the real statuses rather than to invented copy.
 *
 * `claimed` (a slot held with no link yet) is deliberately absent: it is a prompt to act, not a
 * review state, and it now lives in the "Needs a link" footer on the settled rows instead of
 * being a fifth tab nobody reads.
 */
type TabKey = "pending" | "approved" | "paid" | "rejected";

const TAB_COPY: Record<
  TabKey,
  { label: string; empty: string; emptyHint: string; icon: typeof Clock3 }
> = {
  pending: {
    label: "Pending review",
    empty: "Nothing in review",
    emptyHint:
      "A link you submit is scored automatically, and it will sit here until the verdict lands.",
    icon: Clock3,
  },
  approved: {
    label: "Pending payout",
    empty: "No payout owed",
    emptyHint: "Approved work waiting to be paid shows up here with the amount it earned.",
    icon: Coins,
  },
  paid: {
    label: "Paid",
    empty: "Nothing paid yet",
    emptyHint: "Payouts that have settled on-chain to your wallet are listed here.",
    icon: Coins,
  },
  rejected: {
    label: "Rejected",
    empty: "Nothing rejected",
    emptyHint:
      "Work that failed the brief or the authenticity checks is kept here, with the reason why.",
    icon: Ban,
  },
};

/** Which tabs a record belongs to. `pending` and `reviewing` are the same answer to a creator. */
function tabFor(status: Submission["status"]): TabKey | null {
  if (status === "pending" || status === "reviewing") return "pending";
  if (status === "approved") return "approved";
  if (status === "paid") return "paid";
  if (status === "rejected") return "rejected";
  return null; // `claimed` — a slot, not a review state.
}

/** One number. Small, labelled, and never longer than the value it describes. */
function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "brand";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate text-lg font-semibold leading-tight tabular-nums",
          tone === "brand" ? "text-brand" : "text-foreground",
        )}
      >
        {value}
      </p>
      {/*
        Always rendered, and given a fixed line box.

        This is what actually holds the row together: `Points` has no hint of its own, so an
        empty line here is the difference between five labels sharing one baseline and four of
        them floating up to meet it.
      */}
      <p className="mt-1 min-h-4 truncate text-[11px] leading-4 text-muted-foreground">
        {hint ?? ""}
      </p>
    </div>
  );
}

export function ProfileView() {
  const { ready, authenticated, login } = useAuth();
  const { data, isLoading } = useProfile();
  const { data: activity } = useProfileActivity();
  const { data: submissions } = useSubmissions();

  const [tab, setTab] = React.useState<TabKey>("pending");

  const profile = data?.profile;
  const records = submissions?.submissions ?? [];

  const counts = React.useMemo(() => {
    const tally: Record<TabKey, number> = { pending: 0, approved: 0, paid: 0, rejected: 0 };
    for (const record of records) {
      const key = tabFor(record.status);
      if (key) tally[key] += 1;
    }
    return tally;
  }, [records]);

  const rows = React.useMemo(
    () =>
      records
        .filter((record) => tabFor(record.status) === tab)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [records, tab],
  );

  /** Approved but not yet settled — the reason the "Pending payout" tab has work in it. */
  const owed = React.useMemo(
    () =>
      records
        .filter((record) => record.status === "approved")
        .reduce((sum, record) => sum + (record.payoutAmount ?? 0), 0),
    [records],
  );

  /** Slots held with no link yet: the one thing only the creator can fix. */
  const awaitingLink = React.useMemo(
    () => records.filter((record) => !record.postUrl).length,
    [records],
  );

  // The profile is keyed to a wallet, so an anonymous visitor gets a real explanation and a way
  // in rather than a spinner that never resolves.
  if (ready && !authenticated) {
    return (
      <div className="mx-auto flex min-h-[50svh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <Wallet aria-hidden="true" className="size-8 text-muted-foreground" />
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-foreground">Sign in to see your profile</h1>
          <p className="text-sm text-muted-foreground">
            Your profile lives with your wallet, so the same wallet always brings back the same
            profile.
          </p>
        </div>
        <Button onClick={login} className="gap-1.5">
          <Wallet aria-hidden="true" className="size-4" />
          Sign in
        </Button>
      </div>
    );
  }

  if (isLoading || !profile) {
    return (
      <div
        role="status"
        aria-label="Loading profile"
        className="flex min-h-[40svh] items-center justify-center"
      >
        <Loader2 aria-hidden="true" className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <ProfileBody
      profile={profile}
      counts={counts}
      rows={rows}
      owed={owed}
      awaitingLink={awaitingLink}
      totalContributions={activity?.total ?? null}
      activeDays={activity?.activeDays ?? null}
      tab={tab}
      onTabChange={setTab}
    />
  );
}

/**
 * The page once the profile has loaded.
 *
 * Split from the fetching component so the whole layout is one expression taking plain data —
 * which is what makes the empty and populated states the same code path rather than two.
 */
function ProfileBody({
  profile,
  counts,
  rows,
  owed,
  awaitingLink,
  totalContributions,
  activeDays,
  tab,
  onTabChange,
}: {
  profile: Profile;
  counts: Record<TabKey, number>;
  rows: Submission[];
  owed: number;
  awaitingLink: number;
  totalContributions: number | null;
  activeDays: number | null;
  tab: TabKey;
  onTabChange: (tab: TabKey) => void;
}) {
  const handle = profile.handle ?? null;
  const name = profile.displayName?.trim() || (handle ? `@${handle}` : "Unnamed creator");
  const progress = levelFromPoints(profile.points);

  /**
   * Approval rate, only when there is a decision to divide by.
   *
   * The denominator is approvals plus rejections, so a creator with nothing decided yet is shown
   * "—" rather than "0%" — a number that reads as failure instead of as an absence of data.
   */
  const decided = counts.approved + counts.paid + counts.rejected;
  const approvalRate =
    decided > 0 ? Math.round(((counts.approved + counts.paid) / decided) * 100) : null;

  const joined = new Date(profile.joinedAt).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });

  return (
    <div className="pb-16">
      {/* ---------------------------------------------------------------- header */}
      <PageHeader
        eyebrow="Bagworker"
        title={name}
        description={
          handle
            ? `@${handle}`
            : "No handle set yet — add one in settings so projects can find you."
        }
        actions={
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href="/dashboard/settings">
              <Settings aria-hidden="true" className="size-4" />
              <span className="hidden sm:inline">Settings</span>
              <span className="sr-only sm:hidden">Account settings</span>
            </a>
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-[1200px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <Card className="gap-0 py-0">
          <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:gap-8">
            {/* Identity, left. */}
            <div className="flex min-w-0 items-center gap-4">
              <ProfileAvatar
                character={profile.character}
                avatarId={profile.avatarId}
                profileNumber={profile.profileNumber}
                className="size-16 shrink-0 rounded-xl border border-border sm:size-20"
              />
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <BagworkerTag number={profile.profileNumber} />
                  {profile.onboardingCompleted ? null : (
                    <Badge
                      variant="outline"
                      className="border-warning/40 bg-warning/10 font-normal text-warning"
                    >
                      Setup incomplete
                    </Badge>
                  )}
                </div>
                <p className="truncate text-lg font-semibold text-foreground">
                  {profile.displayName?.trim() || name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {handle ? `@${handle}` : "no handle set"} · joined {joined}
                </p>
                {profile.bio ? (
                  <p className="line-clamp-2 max-w-prose text-xs leading-relaxed text-muted-foreground">
                    {profile.bio}
                  </p>
                ) : null}
                {handle ? (
                  <Link
                    href={`/dashboard/profile/${handle}`}
                    className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    View public profile
                    <ArrowUpRight aria-hidden="true" className="size-3" />
                  </Link>
                ) : null}
              </div>
            </div>

            {/*
              The numbers, right — one horizontal system.

              The ring used to sit beside a *second* copy of the same fact ("Level" / "2" /
              "to go"), which is what made this row read as misaligned: two different shapes for
              one number, and a three-line block next to a two-line one. The ring now carries the
              level on its own, and every column below is the same three-line rhythm — label,
              value, hint — so the labels sit on one baseline across the whole row.
            */}
            <div className="grid grow grid-cols-2 gap-x-5 gap-y-6 lg:grid-cols-[auto_repeat(4,minmax(0,1fr))] lg:items-center lg:gap-x-8">
              {/* Level. The ring *is* the value; the caption under it is the same "next step"
                  line its neighbours carry, so it reads as a peer rather than an ornament. */}
              <div className="col-span-2 flex flex-col items-center lg:col-span-1">
                <LevelRing level={progress.level} progress={progress.progress} size={64} />
                <p className="mt-2 text-center text-[11px] leading-4 tabular-nums text-muted-foreground">
                  {progress.isMaxLevel
                    ? "Top level reached"
                    : `${formatPoints(progress.pointsToNextLevel)} to Level ${progress.level + 1}`}
                </p>
              </div>

              <Stat
                label="Points"
                value={formatPoints(profile.points)}
                hint="33 points per $1 earned"
                tone="brand"
              />
              <Stat
                label="Submissions"
                value={String(profile.submissions)}
                hint={
                  profile.approvals > 0 ? `${profile.approvals} approved` : "Nothing approved yet"
                }
              />
              <Stat
                label="Approval rate"
                value={approvalRate === null ? "—" : `${approvalRate}%`}
                hint={decided === 0 ? "Nothing decided yet" : `${decided} decided`}
              />
              <Stat
                label="Total earned"
                value={usd(profile.totalEarned, { cents: true })}
                hint={
                  owed > 0 ? `${usd(owed, { cents: true })} in flight` : "Settled to your wallet"
                }
              />
            </div>
          </div>

          {/* Compact secondary strip: the two things a creator checks most often. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Hammer aria-hidden="true" className="size-3.5" />
              {totalContributions === null ? (
                <Skeleton className="h-3 w-24" />
              ) : (
                <>
                  <span className="font-medium text-foreground tabular-nums">
                    {totalContributions}
                  </span>{" "}
                  contribution{totalContributions === 1 ? "" : "s"} in 12 months
                </>
              )}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Flame aria-hidden="true" className="size-3.5" />
              {activeDays === null ? (
                <Skeleton className="h-3 w-20" />
              ) : (
                <>
                  <span className="font-medium text-foreground tabular-nums">{activeDays}</span>{" "}
                  active day{activeDays === 1 ? "" : "s"}
                </>
              )}
            </span>
            {awaitingLink > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-warning">
                <Star aria-hidden="true" className="size-3.5" />
                {awaitingLink} slot{awaitingLink === 1 ? "" : "s"} waiting on a link
              </span>
            ) : null}
            {profile.walletAddress ? (
              <span className="ml-auto inline-flex items-center gap-1.5">
                <Wallet aria-hidden="true" className="size-3.5" />
                <span className="font-mono">{truncateAddress(profile.walletAddress)}</span>
              </span>
            ) : null}
          </div>
        </Card>

        {/* The rank ladder. Sits directly under the identity card because it is the same story,
            told as a progression rather than as a single number. */}
        <RankBadgeRail level={progress.level} points={profile.points} />

        {/* Two columns on wide screens: activity calendar beside the work list. */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <Card className="p-5">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Contributions</h2>
                <p className="text-xs text-muted-foreground">
                  {totalContributions === null
                    ? "Loading your last 12 months…"
                    : `${totalContributions} submission${totalContributions === 1 ? "" : "s"} in the last 12 months`}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Flame aria-hidden="true" className="size-3.5" />
                {activeDays === null ? "—" : `${activeDays} active day${activeDays === 1 ? "" : "s"}`}
              </span>
            </div>
            <ProfileActivity />
          </Card>

          {/* The work list. Tabs are the four real states, so nothing is duplicated between them. */}
          <Card className="gap-0 py-0">
            <Tabs
              value={tab}
              onValueChange={(value) => onTabChange(value as TabKey)}
              className="gap-0"
            >
              <div className="border-b border-border/60 px-3 pt-3">
                <TabsList className="h-auto w-full justify-start gap-1 bg-transparent p-0">
                  {(Object.keys(TAB_COPY) as TabKey[]).map((key) => {
                    const copy = TAB_COPY[key];
                    const Icon = copy.icon;
                    const count = counts[key];
                    return (
                      <TabsTrigger
                        key={key}
                        value={key}
                        className="gap-1.5 rounded-md border border-transparent px-2.5 py-1.5 text-xs data-[state=active]:border-border data-[state=active]:bg-muted data-[state=active]:text-foreground"
                      >
                        <Icon aria-hidden="true" className="size-3.5" />
                        <span className="hidden sm:inline">{copy.label}</span>
                        <span className="sm:hidden">{copy.label.split(" ")[0]}</span>
                        {count > 0 ? (
                          <span className="rounded-full bg-muted-foreground/15 px-1.5 text-[10px] tabular-nums">
                            {count}
                          </span>
                        ) : null}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>

              <div className="max-h-[520px] overflow-y-auto">
                {rows.length === 0 ? (
                  <EmptyState
                    icon={TAB_COPY[tab].icon}
                    title={TAB_COPY[tab].empty}
                    description={TAB_COPY[tab].emptyHint}
                    className="border-0"
                  />
                ) : (
                  <ul className="divide-y divide-border/60">
                    {rows.map((record) => (
                      <SubmissionRow key={record.id} record={record} />
                    ))}
                  </ul>
                )}
              </div>
            </Tabs>
          </Card>
        </div>
      </div>

    </div>
  );
}

/**
 * One row in the work list.
 *
 * The row answers four questions in order — which bag, which platform, what it earned, and where it
 * stands — because that is the order a creator scans for. A rejection carries the reviewer's reason,
 * since "rejected" on its own is not something anyone can act on, and a claimed row with no link
 * carries the one action that unsticks it.
 */
function SubmissionRow({ record }: { record: Submission }) {
  const needsLink = !record.postUrl;
  const engagement = record.views + record.likes + record.reposts;

  return (
    <li className="flex flex-col gap-2.5 px-4 py-3.5 transition-colors hover:bg-muted/30 motion-reduce:transition-none">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground">
            <PlatformIcon platform={record.platform} className="size-3.5" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="truncate text-sm font-medium text-foreground">{record.campaignTitle}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span className="font-mono">{record.tokenSymbol}</span>
              <span aria-hidden="true">·</span>
              <span title={dateMedium(record.createdAt)}>{relative(record.createdAt)}</span>
              {engagement > 0 ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    {record.views.toLocaleString()} view{record.views === 1 ? "" : "s"}
                  </span>
                </>
              ) : null}
              {record.verifiedHandle ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Check aria-hidden="true" className="size-3 text-success" />
                    verified @{record.verifiedHandle}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <SubmissionStatusBadge status={record.status} />
          {record.payoutAmount != null ? (
            <span className="text-sm font-semibold tabular-nums text-brand">
              {usd(record.payoutAmount, { cents: true })}
            </span>
          ) : null}
        </div>
      </div>

      {needsLink ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5">
          <span className="text-[11px] text-warning">
            Slot claimed — no link submitted yet.
          </span>
          <Button asChild size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px] text-warning hover:text-warning">
            <Link href="/dashboard/campaigns">
              Find work
              <ArrowUpRight aria-hidden="true" className="size-3" />
            </Link>
          </Button>
        </div>
      ) : null}

      {record.reviewNote && record.status === "rejected" ? (
        <p className="rounded-md border border-destructive/25 bg-destructive/5 px-2.5 py-1.5 text-[11px] leading-relaxed text-destructive">
          {record.reviewNote}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
        {record.postUrl ? (
          <a
            href={record.postUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 rounded-sm underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ExternalLink aria-hidden="true" className="size-3" />
            Your post
          </a>
        ) : null}

        {record.txSignature ? (
          <a
            href={`https://solscan.io/tx/${record.txSignature}`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 rounded-sm underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ExternalLink aria-hidden="true" className="size-3" />
            Receipt
          </a>
        ) : null}

        {record.status === "approved" ? (
          <span className="inline-flex items-center gap-1">
            <Coins aria-hidden="true" className="size-3" />
            Payout queued — settles automatically
          </span>
        ) : null}

        {record.qualityScore > 0 ? (
          <span className="ml-auto tabular-nums">
            Quality {Math.round(record.qualityScore)} · Authenticity{" "}
            {Math.round(record.authenticityScore)}
          </span>
        ) : null}
      </div>
    </li>
  );
}
