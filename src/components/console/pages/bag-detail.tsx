"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Coins,
  Gem,
  Globe2,
  Hourglass,
  Loader2,
  MessagesSquare,
  Package,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { countdownLabel, dateMedium, shortAddress, usd } from "@/lib/console/format";
import { flywheelWindow, flywheelWindowMessage } from "@/lib/campaigns/flywheel-window";
import {
  useCampaign,
  useClaimBag,
  useSession,
  useSubmissions,
} from "@/lib/queries";
import type { CampaignMember, Platform } from "@/lib/types";
import { BAG_TYPE_SHORT, bagTypeOf } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BagBanner, rateLabel, remainingOf } from "../bag-card";
import { BudgetBar } from "../budget-bar";
import { EditBagDialog } from "../edit-bag-dialog";
import { FeeRedirectBadge } from "../fee-redirect-panel";
import { FeeTransparencyPanel } from "../fee-transparency-panel";
import { FlywheelBagHero } from "../flywheel-panel";
import { AddContentLinkForm } from "./bag-submission-view";
import { PlatformIcon, PlatformIconRow, platformLabel } from "../platform-icons";
import { BagStatusBadge, SubmissionStatusBadge } from "../status-badge";
import { ProfileAvatar } from "../identity";
import {
  EmptyState,
  ErrorState,
  InfoRow,
  MetricCard,
  MetricSkeleton,
  PageHeader,
  SectionCard,
  TableSkeleton,
  TokenMark,
} from "../ui";

interface CreateSubmissionResponse {
  submission: { id: string };
}

interface ReviewResponse {
  submission: { id: string; reviewNote: string | null; status: string };
  approved: boolean;
  qualityScore: number;
  authenticityScore: number;
  payoutAmount: number;
}

export function BagDetail({ id }: { id: string }) {
  const { authenticated, login } = useAuth();
  const { data: session } = useSession();
  const { data, isLoading, isError, refetch } = useCampaign(id);
  const claimBag = useClaimBag();
  const { data: mine } = useSubmissions();

  const campaign = data?.campaign;
  /**
   * Which of the two products this is.
   *
   * It decides how the page opens: a flywheel bag leads with the coin (round PFP, ticker, CA), a
   * fixed-budget bag with its banner when its publisher uploaded one. Same page, two identities —
   * because a coin and a campaign are genuinely different things to look at.
   */
  const isFlywheel = campaign?.kind === "FLYWHEEL";
  /**
   * Who is in this bag.
   *
   * Not a list of submissions. The API no longer sends anyone's posts, verdicts or scores to this
   * page — a bag is public, so all it may say about a creator is that they joined.
   */
  const members: CampaignMember[] = data?.members ?? [];
  const eligible = campaign?.platforms ?? [];
  const busy = claimBag.isPending;

  // Publisher context: this viewer funded the bag, so they see the publisher lens rather
  // than (only) the creator one. Ownership is resolved server-side; this is display only.
  const isOwner = Boolean(
    campaign?.createdBy && session?.user.id && campaign.createdBy === session.user.id,
  );

  /**
   * This viewer's own records for this bag.
   *
   * `claimed` means they opted in and still owe a link; anything with a `postUrl` is live content.
   * All of them are kept, because a bagworker can post several pieces into one bag and the rail
   * has to reflect that rather than showing only the first.
   */
  const myRecords = (mine?.submissions ?? []).filter((entry) => entry.campaignId === id);
  const myLinks = myRecords.filter((entry) => entry.postUrl);
  const myClaim = myRecords.some((entry) => entry.status === "claimed");
  const myEarned = myRecords.reduce((sum, entry) => sum + (entry.payoutAmount ?? 0), 0);

  const remaining = campaign ? remainingOf(campaign) : 0;
  const full = (campaign?.slotsRemaining ?? 0) <= 0;
  const open = campaign?.status === "LIVE" || campaign?.status === "FILLING";

  /*
   * The flywheel opt-in window — `null` for a fixed-budget bag, whose money was proven up front so
   * its `status` already tells the whole story.
   *
   * A flywheel bag's budget arrives from trading fees, so "open to creators" has to be a money
   * question rather than a schedule: it is open while the bag holds $20 of fee budget and closed
   * below that, including when it has been spent. `lib/campaigns/flywheel-window.ts` owns the number
   * and the API refuses on exactly the same rule, so this line and the server can never disagree.
   */
  const flywheel = isFlywheel && campaign ? flywheelWindow(campaign) : null;
  const windowClosed = flywheel !== null && !flywheel.open;

  if (isLoading) {
    return (
      <div className="pb-16">
        <PageHeader
          eyebrow="Live bag"
          title="Loading this bag…"
          description="Fetching the brief, escrow balance and current payout rate."
        />
        <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <MetricSkeleton count={4} />
          <TableSkeleton rows={5} />
        </div>
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <div className="pb-16">
        <PageHeader
          eyebrow="Live bag"
          title="Bag unavailable"
          description="This bag may have been paused, removed, or the link is wrong."
        />
        <div className="mx-auto w-full max-w-[1500px] space-y-4 px-4 py-6 sm:px-6 lg:px-8">
          <ErrorState onRetry={() => refetch()} />
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to all bags</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-16">
      <PageHeader
        /*
         * The bag's funding type, not a content category. It used to read "CATWIFBAG · promo bag",
         * naming a taxonomy nobody picked and that tells a visitor nothing — what to make is in the
         * brief below, written by the person who wants it.
         */
        eyebrow={`${campaign.token.symbol} · ${BAG_TYPE_SHORT[bagTypeOf(campaign)]}`}
        title={campaign.title}
        description="Read the brief, post the content, then paste the link. Every post is scored for quality and authenticity before it pays."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/*
              The board, for the two groups who have one: the publisher who owns the bag, and the
              Bagworkers who joined it. Everyone else sees no button — entry is refused, so
              offering it would only lead to a locked door.
            */}
            {isOwner || myRecords.length > 0 ? (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href={`/dashboard/community/${campaign.id}`}>
                  <MessagesSquare aria-hidden="true" className="size-4" />
                  Community
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link href="/dashboard">
                <ArrowLeft aria-hidden="true" className="size-4" />
                All bags
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Hero */}
        {isFlywheel ? (
          /* A coin's page opens with the coin — the banner layout belongs to campaign artwork. */
          <Card className="gap-0 overflow-hidden py-0">
            <CardContent className="p-5 sm:p-6">
              <FlywheelBagHero campaign={campaign!} isOwner={isOwner} />
            </CardContent>
          </Card>
        ) : (
          <Card className="gap-0 overflow-hidden py-0">
            <BagBanner campaign={campaign!} className="h-28" />
            <CardContent className="space-y-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3.5">
                <TokenMark
                  symbol={campaign.token.symbol}
                  color={campaign.token.color}
                  className="size-11 text-xs"
                />
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="title-display text-lg text-foreground sm:text-xl">
                      {campaign.title}
                    </h2>
                    <BagStatusBadge status={campaign.status} />
              {campaign.feeRedirectEnabled ? <FeeRedirectBadge /> : null}
                    {isOwner ? (
                      <Badge
                        variant="outline"
                        className="gap-1 border-brand/40 bg-brand/10 px-1.5 py-0 text-[10px] font-medium text-brand"
                        title="You funded this bag — manage it from My Bags"
                      >
                        <Package aria-hidden="true" className="size-2.5" />
                        Your bag
                      </Badge>
                    ) : null}
                    {campaign.holderGate ? (
                      <Badge
                        variant="outline"
                        className="gap-1 border-border bg-muted/40 px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
                      >
                        <Gem aria-hidden="true" className="size-2.5" />
                        Holders only
                      </Badge>
                    ) : null}
                  </div>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    {campaign.token.name}
                    <span aria-hidden="true">·</span>
                    <span className="font-medium tracking-wide text-foreground">
                      {campaign.token.symbol}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">
                      mint {shortAddress(campaign.token.mint, 4)}
                    </span>
                  </p>
                </div>
              </div>
              <PlatformIconRow
                platforms={campaign.platforms}
                tileClassName="size-7"
              />
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">
              {campaign.description}
            </p>
          </CardContent>
        </Card>
        )}

        {/* Key numbers */}
        <section
          aria-label="Bag economics"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <MetricCard
            label={isFlywheel ? "Budget from fees" : "Left in escrow"}
            value={usd(remaining)}
            hint={
              isFlywheel
                ? `${usd(campaign.spent)} paid · ${usd(campaign.feeRaisedUsdc)} raised from fees`
                : `${usd(campaign.spent)} paid out of ${usd(campaign.budget)}`
            }
            icon={Coins}
          />
          <MetricCard
            label="You earn"
            value={rateLabel(campaign)}
            hint={
              campaign.rateType === "DYNAMIC"
                ? `Capped at ${usd(campaign.maxPayout)} per post`
                : "Flat payout per approved post"
            }
            icon={Sparkles}
          />
          <MetricCard
            label="Slots remaining"
            value={`${campaign.slotsRemaining}`}
            hint={`${campaign.submissionsCount} submissions so far`}
            icon={Users}
          />
          <MetricCard
            label="Closes"
            value={countdownLabel(campaign.endsAt)}
            hint={`Ends ${dateMedium(campaign.endsAt)}`}
            icon={Hourglass}
          />
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          {/* The brief + what other creators are shipping */}
          <div className="space-y-6">
            <SectionCard
              title="The brief"
              description="Everything the anti-slop engine checks before a payout is released"
              action={isOwner ? <EditBagDialog campaign={campaign} /> : undefined}
            >
              <dl className="divide-y divide-border/60">
                <InfoRow
                  label="Payout model"
                  value={
                    campaign.rateType === "DYNAMIC"
                      ? `${usd(campaign.ratePer1k)} per 1,000 views`
                      : "Fixed per approved post"
                  }
                />
                <InfoRow
                  label="Max per post"
                  value={usd(campaign.maxPayout)}
                  hint="Virality is capped so one post can't drain the bag"
                />
                <InfoRow
                  label="Eligible platforms"
                  value={
                    <PlatformIconRow
                      platforms={campaign.platforms}
                      tileClassName="size-6"
                    />
                  }
                />
                <InfoRow
                  label="Regions"
                  value={campaign.geo.length ? campaign.geo.join(", ") : "Global"}
                />
                <InfoRow
                  label="Holder gate"
                  value={
                    campaign.holderGate
                      ? `≥ ${campaign.holderMin.toLocaleString()} ${campaign.token.symbol}`
                      : "Open to everyone"
                  }
                />
              </dl>

              <div className="mt-4 rounded-lg border border-border/60 bg-secondary/30 p-4">
                <BudgetBar
                  spent={campaign.spent}
                  total={campaign.budget}
                  size="md"
                  hint={`${usd(remaining)} still available to creators`}
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Who's in this bag"
              description={
                members.length > 0
                  ? `${members.length} Bagworker${members.length === 1 ? "" : "s"} joined this campaign`
                  : "Bagworkers who joined this campaign"
              }
            >
              {members.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="Nobody has joined yet"
                  description={
                    windowClosed
                      ? "A flywheel bag opens to creators once its trading fees have built the budget to at least $20 — until then there are no slots to claim, and nothing to do but wait for the coin to trade."
                      : "Be the first in. Early posts on a fresh bag get reviewed fastest and set the tone."
                  }
                />
              ) : (
                <>
                  <ul className="grid list-none gap-x-4 gap-y-3 p-0 sm:grid-cols-2">
                    {members.map((member) => (
                      <li
                        key={member.id}
                        className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-secondary/20 px-3 py-2.5"
                      >
                        <ProfileAvatar
                          character={member.character}
                          avatarId={member.avatarId}
                          profileNumber={member.profileNumber}
                          className="size-9 shrink-0 rounded-md border border-border/60"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {member.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Joined {dateMedium(member.joinedAt)}
                          </p>
                        </div>
                        {/* "Posted" means they sent a link. Nothing about how it was reviewed. */}
                        {member.active ? (
                          <Badge
                            variant="outline"
                            className="shrink-0 border-brand/40 bg-brand/10 px-1.5 py-0 text-[10px] font-medium text-brand"
                          >
                            Posted
                          </Badge>
                        ) : null}
                      </li>
                    ))}
                  </ul>

                  {/*
                    Said out loud, because an empty-looking list of names invites the question.
                    This is the whole of what a public bag page knows about someone who joined it.
                  */}
                  <p className="mt-3.5 text-[11px] leading-relaxed text-muted-foreground">
                    Posts are private. This shows who is in the campaign — each creator&apos;s links,
                    scores and review results stay on their own submissions.
                  </p>
                </>
              )}
            </SectionCard>

            {/*
              Where the money is, first — and only that. This column used to carry three panels
              describing the same fee loop from three angles: this one, a "Coin & payouts" section
              restating what the hero above already shows, and a "Live fee-funded budget" explainer.
              A visitor read the same story three times before reaching the deposit list, and the
              explainers said nothing a number did not. One panel of figures is the whole answer.
            */}
            {isFlywheel ? (
              <FeeTransparencyPanel
                campaign={campaign}
                summary={data?.feeSummary ?? null}
                sync={data?.feeSync ?? null}
              />
            ) : null}
          </div>

          {/* The action rail: submit → scored → claim */}
          <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
            <SectionCard
              title="Submit your post"
              description="Paste the live link — it is scored the moment you submit"
            >
              {!open ? (
                <p className="rounded-lg border border-warning/30 bg-warning/5 p-3.5 text-xs text-warning">
                  This bag is {campaign.status.toLowerCase()} and is no longer
                  accepting new posts.
                </p>
              ) : !authenticated ? (
                // Without this the only feedback was a "Sign in required" toast, which
                // told the visitor nothing about how to sign in.
                <div className="space-y-3">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Submissions are tied to your wallet so the payout can reach you.
                    Sign in to claim a slot in this bag.
                  </p>
                  <Button onClick={login} className="w-full gap-1.5">
                    <Wallet aria-hidden="true" className="size-4" />
                    Sign in to submit
                  </Button>
                </div>
              ) : isOwner ? (
                <p className="rounded-lg border border-border bg-muted/30 p-3.5 text-xs text-muted-foreground">
                  You funded this bag, so you cannot claim a slot in it. Creator
                  submissions show up under this bag in My Bags.
                </p>
              ) : myRecords.length > 0 ? (
                // Already in the bag: no second claim, and no reason to leave the page. The full
                // link manager lives on its own route, and new links can be added right here.
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <SubmissionStatusBadge
                      status={
                        myClaim && myLinks.length === 0
                          ? "claimed"
                          : (myLinks[0]?.status ?? "pending")
                      }
                    />
                    <span className="text-xs text-muted-foreground">
                      {myLinks.length === 0
                        ? "You hold a slot in this bag"
                        : `${myLinks.length} link${myLinks.length === 1 ? "" : "s"} submitted`}
                    </span>
                    {myEarned > 0 ? (
                      <span className="ml-auto text-xs font-semibold tabular-nums text-success">
                        {usd(myEarned, { cents: true })} earned
                      </span>
                    ) : null}
                  </div>

                  <AddContentLinkForm campaign={campaign} existingLinks={myLinks.length} />

                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/dashboard/submissions/${campaign.id}`}>
                      Manage your links
                    </Link>
                  </Button>
                </div>
              ) : (
                // Step one: opt in. The slot is what the limits are about, so it is taken here
                // and the link comes next.
                <div className="space-y-3">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Opting in holds a slot. You then post on{" "}
                    {eligible.map((entry) => platformLabel(entry)).join(" or ")} and paste the
                    link here for review.
                  </p>

                  {/*
                    The one thing a creator needs to know before clicking, and the thing the page used
                    to leave out: a flywheel bag may be live and still have no window, because its
                    budget comes from fees and there may be none yet. Stated with the current numbers
                    rather than as a rule, so "wait" has an amount attached to it.
                  */}
                  {flywheel ? (
                    <p
                      className={cn(
                        "rounded-lg border px-3 py-2.5 text-xs leading-relaxed",
                        flywheel.open
                          ? "border-brand/30 bg-brand/5 text-foreground"
                          : "border-warning/30 bg-warning/5 text-warning",
                      )}
                    >
                      {flywheelWindowMessage(flywheel)}
                    </p>
                  ) : null}

                  <Button
                    className="w-full gap-1.5"
                    disabled={busy || full || windowClosed}
                    onClick={() => {
                      claimBag.mutate(
                        { campaignId: campaign.id },
                        {
                          onSuccess: () =>
                            toast.success("You are in", {
                              description:
                                "Post your content, then paste the link here to send it for review.",
                            }),
                          onError: (error: Error) => toast.error(error.message),
                        },
                      );
                    }}
                  >
                    {claimBag.isPending ? (
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    ) : (
                      <Plus aria-hidden="true" className="size-4" />
                    )}
                    {claimBag.isPending
                      ? "Claiming your slot…"
                      : windowClosed && flywheel
                        ? `Opt-ins open at ${usd(flywheel.minimumUsd)} in fees`
                        : "Opt into this bag"}
                  </Button>
                  {full && !windowClosed ? (
                    <p className="text-xs text-warning">
                      {isFlywheel
                        ? "Every slot for the current budget is taken. New slots appear automatically as more fees convert."
                        : "Every slot is taken — the budget would need topping up."}
                    </p>
                  ) : null}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="How this bag pays"
              description="Rules the engine applies to every submission"
            >
              <ul className="space-y-3.5">
                <li className="flex gap-3">
                  <Coins
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {campaign.rateType === "DYNAMIC" ? (
                      <>
                        Pays{" "}
                        <span className="font-medium text-foreground">
                          {usd(campaign.ratePer1k)} per 1,000 verified views
                        </span>
                        , capped at {usd(campaign.maxPayout)} per post.
                      </>
                    ) : (
                      <>
                        Pays a{" "}
                        <span className="font-medium text-foreground">
                          flat fee up to {usd(campaign.maxPayout)}
                        </span>{" "}
                        per approved post, scaled by quality score.
                      </>
                    )}
                  </p>
                </li>
                <li className="flex gap-3">
                  <ShieldCheck
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    A post is approved at{" "}
                    <span className="font-medium text-foreground">
                      quality ≥ 55
                    </span>{" "}
                    and{" "}
                    <span className="font-medium text-foreground">
                      authenticity ≥ 50
                    </span>
                    . Bot-inflated reach fails the authenticity gate.
                  </p>
                </li>
                <li className="flex gap-3">
                  <Globe2
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Eligible on{" "}
                    <span className="font-medium text-foreground">
                      {campaign.platforms
                        .map((entry) => platformLabel(entry))
                        .join(", ")}
                    </span>
                    {campaign.geo.length
                      ? ` · ${campaign.geo.join(", ")}`
                      : " · worldwide"}
                    .
                  </p>
                </li>
                {campaign.holderGate ? (
                  <li className="flex gap-3">
                    <Gem
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Holder gate: hold at least{" "}
                      <span className="font-medium text-foreground">
                        {campaign.holderMin.toLocaleString()}{" "}
                        {campaign.token.symbol}
                      </span>{" "}
                      to submit.
                    </p>
                  </li>
                ) : null}
                <li className="flex gap-3">
                  <Wallet
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Payouts settle in{" "}
                    <span className="font-medium text-foreground">USDC</span>{" "}
                    straight to your wallet — {usd(remaining)} still funded in
                    escrow for this bag.
                  </p>
                </li>
              </ul>
            </SectionCard>

          </div>

        </div>

      </div>
    </div>
  );
}

