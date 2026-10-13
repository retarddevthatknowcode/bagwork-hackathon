"use client";

import { CheckCircle2, MessagesSquare } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { countdownLabel, dateMedium, usd } from "@/lib/console/format";
import type { MyBagRow } from "@/lib/console/hooks";
import { BAG_TYPE_SHORT, bagTypeOf } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BudgetBar } from "../budget-bar";
import { PlatformIconRow } from "../platform-icons";
import { BagStatusBadge } from "../status-badge";
import { TokenMark } from "../ui";

/** One publisher-owned bag: identity, money, progress, and the actions available. */
export function PublisherBagRow({
  row,
  onClose,
  busy,
}: {
  row: MyBagRow;
  onClose: () => void;
  busy: boolean;
}) {
  const { campaign } = row;
  const isOpen = campaign.status === "LIVE" || campaign.status === "FILLING";

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <TokenMark
              symbol={campaign.token.symbol}
              color={campaign.token.color}
              className="size-9"
            />
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <BagStatusBadge status={campaign.status} />
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {BAG_TYPE_SHORT[bagTypeOf(campaign)]} · {campaign.token.symbol}
                </span>
              </div>
              <Link
                href={`/dashboard/bags/${campaign.id}`}
                className="block truncate text-sm font-semibold text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {campaign.title}
              </Link>
              <p className="text-xs text-muted-foreground">
                {countdownLabel(campaign.endsAt)} · ends {dateMedium(campaign.endsAt)}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <PlatformIconRow platforms={campaign.platforms} />
            {/* Labelled from the payload: "Create community" until the publisher opens one, then
                "Community". Either way it links to a real page — the campaign id resolves to the
                community once it exists, so the link cannot go stale. */}
            <Button
              asChild
              size="sm"
              variant={row.communityId ? "default" : "outline"}
              className="gap-1.5"
            >
              <Link href={`/dashboard/community/${row.communityId ?? campaign.id}`}>
                <MessagesSquare aria-hidden="true" className="size-3.5" />
                {row.communityId ? "Community" : "Create community"}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/dashboard/bags/${campaign.id}`}>Open bag</Link>
            </Button>
            {isOpen ? (
              <Button
                size="sm"
                variant="outline"
                onClick={onClose}
                disabled={busy}
                className="text-destructive hover:text-destructive"
              >
                Close
              </Button>
            ) : null}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Budget" value={usd(campaign.budget)} />
          <Stat label="Paid out" value={usd(campaign.spent)} />
          <Stat label="Still available" value={usd(campaign.remaining)} />
          <Stat label="Slots left" value={String(Math.max(0, campaign.slotsRemaining))} />
        </dl>

        {/*
          Who turned up and what happened to their work. "Bagworkers" is the distinct creator
          count, not the submission count — one creator with three posts is still one person,
          and that is the number a publisher is actually buying.
        */}
        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-foreground">
              {row.creators === 0
                ? "No bagworkers yet"
                : `${row.creators} bagworker${row.creators === 1 ? "" : "s"} joined`}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {row.submissionsCount} submission{row.submissionsCount === 1 ? "" : "s"}
            </p>
          </div>

          <dl className="grid grid-cols-3 gap-2">
            <Stat label="Approved" value={String(row.approved)} tone="success" />
            <Stat label="Pending" value={String(row.awaitingReview)} tone="warning" />
            <Stat label="Rejected" value={String(row.rejected)} tone="destructive" />
          </dl>

          <dl className="grid grid-cols-2 gap-2 border-t border-border/60 pt-2.5">
            <Stat label="Paid out so far" value={usd(campaign.spent)} />
            <Stat label="Remaining budget" value={usd(campaign.remaining)} />
          </dl>

          {row.awaitingLink > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {row.awaitingLink} slot{row.awaitingLink === 1 ? "" : "s"} claimed — waiting on
              the creator to send a link.
            </p>
          ) : null}
        </div>

        {/* Budget / paid out / still available are already listed in the grid above, so the
            row states the percentage and leaves the amounts to the tooltip. */}
        <BudgetBar spent={campaign.spent} total={campaign.budget} amounts={false} />

        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3 text-xs">
          <Badge variant="outline" className="border-border bg-muted/40 font-normal">
            {row.submissionsCount} submission{row.submissionsCount === 1 ? "" : "s"}
          </Badge>
          {row.awaitingReview > 0 ? (
            <Badge
              variant="outline"
              className="border-warning/30 bg-warning/10 font-normal text-warning"
            >
              {row.awaitingReview} in review
            </Badge>
          ) : null}
          {row.awaitingPayout > 0 ? (
            <Badge
              variant="outline"
              className="border-info/30 bg-info/10 font-normal text-info"
            >
              {row.awaitingPayout} awaiting payout
            </Badge>
          ) : null}
          {row.submissionsCount === 0 && isOpen ? (
            <span className="text-muted-foreground">
              No creators have posted into this bag yet.
            </span>
          ) : null}
          {!isOpen ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <CheckCircle2 aria-hidden="true" className="size-3.5" />
              Closed to new submissions
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning" | "destructive";
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-sm font-semibold tabular-nums text-foreground",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "destructive" && "text-destructive",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
