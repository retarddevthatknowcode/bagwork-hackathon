"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  Loader2,
  Plus,
  Send,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { compactNumber, dateMedium, relative, usd } from "@/lib/console/format";
import { useProfile } from "@/lib/profile/hooks";
import { sortLinks } from "@/lib/submissions";
import { verifiedAccounts } from "@/lib/social/verify";
import {
  useCampaign,
  useCreateSubmission,
  useSubmissions,
} from "@/lib/queries";
import type { Campaign, Platform, Submission } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PlatformChip, PlatformIcon, platformLabel } from "../platform-icons";
import { PostPreviewLink } from "../post-preview";
import { BagStatusBadge, SubmissionStatusBadge } from "../status-badge";
import { EmptyState, ErrorState, PageHeader, SectionCard, TokenMark } from "../ui";

/**
 * Adds a content link to a bag.
 *
 * Deliberately stays on screen after a successful submit and clears only the URL field, because
 * a bagworker posting several pieces into one bag should not have to re-open anything between
 * links. Adding a second link goes through the same endpoint as the first: the API fills an open
 * opt-in claim if there is one and otherwise creates a new link record.
 */
export function AddContentLinkForm({
  campaign,
  existingLinks = 0,
  className,
  onAdded,
}: {
  campaign: Campaign;
  existingLinks?: number;
  className?: string;
  onAdded?: () => void;
}) {
  const createSubmission = useCreateSubmission();
  const { data: profile } = useProfile();

  /**
   * The accounts this creator has connected.
   *
   * Read from the profile rather than sent with the submission: the server re-derives them from
   * the session, so this is only ever used to show the rule and narrow the picker — never to
   * grant permission.
   */
  const accounts = verifiedAccounts(profile?.profile.socials);
  const verifiedList = (Object.entries(accounts) as [Platform, string][]).filter(
    ([entry]) => (campaign.platforms ?? []).includes(entry),
  );
  const hasNoAccounts = Object.keys(accounts).length === 0;

  // Only the intersection is offered: a platform the bag does not accept, or that has no verified
  // account behind it, could never produce an accepted submission.
  const submittable = (campaign.platforms ?? []).filter((entry) => accounts[entry]);
  const eligible = submittable.length > 0 ? submittable : (campaign.platforms ?? []);

  const [platform, setPlatform] = React.useState<Platform | "">("");
  const [postUrl, setPostUrl] = React.useState("");
  const [rejection, setRejection] = React.useState<{ message: string; code?: string } | null>(
    null,
  );
  const chosen: Platform = (platform || eligible[0] || "x") as Platform;

  const url = postUrl.trim();
  const urlValid = /^https?:\/\/\S+\.\S+/.test(url);
  const open = campaign.status === "LIVE" || campaign.status === "FILLING";
  const full = campaign.slotsRemaining <= 0;
  const busy = createSubmission.isPending;
  const blocked = hasNoAccounts || submittable.length === 0;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setRejection(null);
    if (!urlValid) {
      toast.error("Paste the full link, starting with https://");
      return;
    }
    createSubmission.mutate(
      { campaignId: campaign.id, postUrl: url, platform: chosen },
      {
        onSuccess: () => {
          /*
           * Review is triggered by the server after this response — not from here.
           *
           * The browser used to call the review endpoint itself, which meant a creator's own tab ran
           * the scoring and (while the model was missing) approved its own post. The link is saved
           * now; the verdict arrives on its own, and the row shows a pending wheel until it does.
           */
          setPostUrl("");
          onAdded?.();
          toast.info("Sent for review", {
            description:
              "We are reading the post and scoring it against this bag's brief. The verdict appears below in a few seconds.",
          });
        },
        onError: (error: Error & { code?: string }) => {
          // Kept on screen as well as toasted: a rejection explains what to do next, and a toast
          // disappears before a link to the right page can be followed.
          setRejection({ message: error.message, code: error.code });
          toast.error("Not submitted", { description: error.message });
        },
      },
    );
  }

  if (!open) {
    return (
      <p className={cn("rounded-lg border border-warning/30 bg-warning/5 p-3.5 text-xs text-warning", className)}>
        This bag is {campaign.status.toLowerCase()} and is not accepting new content.
      </p>
    );
  }

  // Blocked before a link is even typed: without a verified account, no link could be accepted,
  // so the useful thing is the reason and the way to fix it.
  if (hasNoAccounts) {
    return (
      <div className={cn("space-y-3", className)}>
        <p className="rounded-lg border border-warning/30 bg-warning/5 p-3.5 text-xs leading-relaxed text-warning">
          Verify a social account before submitting. Bagwork only accepts content posted from an
          account you have verified — it is how we stop someone claiming work that is not theirs.
        </p>
        <Button asChild className="w-full gap-1.5">
          <Link href="/dashboard/settings">
            <UserRound aria-hidden="true" className="size-4" />
            Verify an account in Settings
          </Link>
        </Button>
      </div>
    );
  }

  if (submittable.length === 0) {
    return (
      <div className={cn("space-y-3", className)}>
        <p className="rounded-lg border border-warning/30 bg-warning/5 p-3.5 text-xs leading-relaxed text-warning">
          This bag accepts {eligible.map((entry) => platformLabel(entry)).join(", ")}, but none of
          those match a verified account on your profile. Verify one of them in Settings to submit
          here.
        </p>
        <Button asChild className="w-full gap-1.5">
          <Link href="/dashboard/settings">
            <UserRound aria-hidden="true" className="size-4" />
            Go to Settings
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={cn("space-y-4", className)}>
      {/* What will be accepted, stated before the field rather than after a rejection. */}
      <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-3">
        <p className="text-[11px] font-medium text-foreground">Posting as</p>
        <div className="flex flex-wrap gap-1.5">
          {verifiedList.map(([entry, handle]) => (
            <Badge
              key={entry}
              variant="outline"
              className="gap-1.5 border-success/30 bg-success/10 font-normal text-success"
            >
              <PlatformIcon platform={entry} className="size-3" />
              @{handle} · {platformLabel(entry)}
            </Badge>
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Only content posted from these accounts is accepted. Everything else is rejected before
          review.
        </p>
      </div>

      {rejection ? (
        <div
          role="alert"
          className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3.5"
        >
          <p className="text-xs leading-relaxed text-destructive">{rejection.message}</p>
          {rejection.code !== "duplicate_link" && rejection.code !== "unverifiable_link" ? (
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link href="/dashboard/profile">
                <UserRound aria-hidden="true" className="size-3.5" />
                Go to Profile
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <div className="space-y-2">
          <Label htmlFor="link-platform">Platform</Label>
          <Select value={chosen} onValueChange={(value) => setPlatform(value as Platform)}>
            <SelectTrigger id="link-platform" className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {eligible.map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {platformLabel(entry)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="link-url">Content link</Label>
          <Input
            id="link-url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://x.com/you/status/…"
            value={postUrl}
            onChange={(event) => setPostUrl(event.target.value)}
            aria-invalid={postUrl.length > 0 && !urlValid}
            disabled={busy}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          One link per post. Add as many as you like — each is scored and paid on its own.
        </p>
        <Button type="submit" className="gap-1.5" disabled={busy || !urlValid || full || blocked}>
          {busy ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : existingLinks > 0 ? (
            <Plus aria-hidden="true" className="size-4" />
          ) : (
            <Send aria-hidden="true" className="size-4" />
          )}
          {busy
            ? "Scoring…"
            : existingLinks > 0
              ? "Add another link"
              : "Submit content link"}
        </Button>
      </div>
    </form>
  );
}

/** One content link, with everything the creator needs to judge it. */
function LinkRow({ link }: { link: Submission }) {
  const analyzing = link.status === "pending" || link.status === "reviewing";

  return (
    <li className="space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-secondary/40 text-muted-foreground">
            <PlatformIcon platform={link.platform} className="size-4" />
          </span>
          <div className="min-w-0 space-y-1">
            {link.postUrl ? (
              <PostPreviewLink
                url={link.postUrl}
                className="flex items-start gap-1.5 rounded-sm text-sm font-medium break-all text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {link.postUrl.replace(/^https?:\/\//, "")}
                <ArrowUpRight aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              </PostPreviewLink>
            ) : (
              <p className="text-sm font-medium text-muted-foreground">No content link yet</p>
            )}
            <p className="text-xs text-muted-foreground">
              {platformLabel(link.platform)} · added {dateMedium(link.createdAt)} (
              {relative(link.createdAt)})
              {link.verifiedHandle ? ` · verified as @${link.verifiedHandle}` : ""}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <SubmissionStatusBadge status={link.status} />
        </div>
      </div>

      {/*
        The pending state is explained, not just badged. Review runs on its own now, so the only
        thing a creator needs to know is that the post is being read — and that nothing is waiting on
        them. `role="status"` announces it once, without stealing focus.
      */}
      {analyzing ? (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          Analyzing submission — reading the post and scoring it against this bag&apos;s brief.
        </p>
      ) : null}

      {link.status === "claimed" ? (
        <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          This slot is yours — add a content link above to send it for review.
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <LinkStat label="Views" value={compactNumber(link.views)} icon={Eye} />
          <LinkStat label="Quality" value={`${link.qualityScore}/100`} />
          <LinkStat label="Authenticity" value={`${link.authenticityScore}/100`} />
          <LinkStat
            label="Payout"
            value={link.payoutAmount ? usd(link.payoutAmount, { cents: true }) : "—"}
          />
        </dl>
      )}

      {link.reviewNote ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{link.reviewNote}</p>
      ) : null}

      {link.txSignature ? (
        <p className="inline-flex items-center gap-1 text-xs text-success">
          <CheckCircle2 aria-hidden="true" className="size-3.5" />
          Paid on-chain
        </p>
      ) : null}
    </li>
  );
}

function LinkStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof Eye;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {Icon ? <Icon aria-hidden="true" className="size-3" /> : null}
        {label}
      </dt>
      <dd className="text-sm font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}


/**
 * The full-page view of one bagworker's participation in one bag.
 *
 * A real page rather than a side panel: this is where a creator manages several links across
 * several visits, and a drawer that closes on navigation loses that context.
 */
export function BagSubmissionView({ campaignId }: { campaignId: string }) {
  const { data, isLoading, isError, refetch } = useCampaign(campaignId);
  const { data: mine } = useSubmissions();

  const campaign = data?.campaign;
  const links = sortLinks(
    (mine?.submissions ?? []).filter((entry) => entry.campaignId === campaignId),
  );
  const withLinks = links.filter((entry) => entry.postUrl);
  const earned = links.reduce((sum, entry) => sum + (entry.payoutAmount ?? 0), 0);

  if (isError && !campaign) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading || !campaign) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-[900px] items-center justify-center px-4">
        <Loader2 aria-hidden="true" className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="My submission"
        title={campaign.title}
        description={campaign.description}
        actions={
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/dashboard/submissions">
              <ArrowLeft aria-hidden="true" className="size-4" />
              All submissions
            </Link>
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-[900px] space-y-5 px-4 py-6 sm:px-6">
        <SectionCard title="This bag" contentClassName="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <TokenMark
              symbol={campaign.token.symbol}
              color={campaign.token.color}
              className="size-8"
            />
            <BagStatusBadge status={campaign.status} />
            <Badge variant="outline" className="border-border bg-muted/40 font-normal">
              {campaign.token.symbol}
            </Badge>
            <Button asChild size="sm" variant="ghost" className="ml-auto gap-1.5">
              <Link href={`/dashboard/bags/${campaign.id}`}>Open bag</Link>
            </Button>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <LinkStat label="Your links" value={String(withLinks.length)} />
            <LinkStat label="Earned" value={usd(earned, { cents: true })} />
            <LinkStat label="Budget left" value={usd(campaign.remaining)} />
            <LinkStat label="Slots left" value={String(Math.max(0, campaign.slotsRemaining))} />
          </dl>
        </SectionCard>

        <SectionCard
          title={withLinks.length > 0 ? "Add another link" : "Submit your content"}
          description="Each link is reviewed and paid on its own, and you can add more at any time."
          contentClassName="space-y-4"
        >
          <AddContentLinkForm campaign={campaign} existingLinks={withLinks.length} />
        </SectionCard>

        <SectionCard
          title="Your content links"
          description={
            links.length === 0
              ? undefined
              : `${links.length} link${links.length === 1 ? "" : "s"} in this bag`
          }
          contentClassName="p-0"
        >
          {links.length === 0 ? (
            <EmptyState
              icon={Send}
              title="Nothing submitted yet"
              description="Paste your first post link above and it will be scored straight away."
            />
          ) : (
            <ul className="divide-y divide-border/60">
              {links.map((link) => (
                <LinkRow key={link.id} link={link} />
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

