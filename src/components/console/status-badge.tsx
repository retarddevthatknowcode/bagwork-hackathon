"use client";

import {
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Loader2,
  PauseCircle,
  Radio,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "info" | "destructive" | "muted";

const TONE_CLASS: Record<StatusTone, string> = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  info: "border-info/30 bg-info/10 text-info",
  destructive: "border-destructive/40 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted/50 text-muted-foreground",
};

export const SUBMISSION_STATUS: Record<
  string,
  { label: string; tone: StatusTone; icon: LucideIcon; help: string; spin?: boolean }
> = {
  pending: {
    label: "Pending review",
    tone: "warning",
    // A wheel rather than an hourglass: review runs automatically now, so the honest signal for a
    // queued submission is "working on it" rather than "waiting around".
    icon: Loader2,
    spin: true,
    help: "Submitted and being scored automatically. Nothing has decided this yet.",
  },
  claimed: {
    label: "Link pending",
    tone: "muted",
    icon: CircleDashed,
    help: "You have a slot in this bag. Submit your post link to send it for review.",
  },
  reviewing: {
    label: "In review",
    tone: "info",
    icon: Loader2,
    spin: true,
    help: "Being scored for copy quality and audience authenticity.",
  },
  approved: {
    label: "Approved · payout due",
    tone: "success",
    icon: CheckCircle2,
    help: "Passed review. The payout is sent automatically from the bag's treasury.",
  },
  paid: {
    label: "Paid",
    tone: "success",
    icon: CheckCircle2,
    help: "USDC settled to your wallet on-chain.",
  },
  rejected: {
    label: "Rejected",
    tone: "destructive",
    icon: Ban,
    help: "Failed the brief or the authenticity checks.",
  },
};

export const BAG_STATUS: Record<
  string,
  { label: string; tone: StatusTone; icon: LucideIcon; help: string }
> = {
  LIVE: {
    label: "Live",
    tone: "success",
    icon: Radio,
    help: "Open for submissions and paying out.",
  },
  FILLING: {
    label: "Filling fast",
    tone: "warning",
    icon: Clock3,
    help: "Nearly at its slot or budget cap.",
  },
  ENDED: {
    label: "Ended",
    tone: "muted",
    icon: PauseCircle,
    help: "No longer accepting posts.",
  },
  PAUSED: {
    label: "Paused",
    tone: "muted",
    icon: PauseCircle,
    help: "Temporarily not accepting posts. It may reopen.",
  },
  DRAFT: {
    label: "Draft",
    tone: "muted",
    icon: CircleDashed,
    help: "Not published yet.",
  },
};

function Chip({
  meta,
  tone,
  pulse,
  className,
}: {
  meta: { label: string; tone: StatusTone; icon: LucideIcon; help: string; spin?: boolean };
  tone?: StatusTone;
  pulse?: boolean;
  className?: string;
}) {
  const Icon = meta.icon;
  const resolved = tone ?? meta.tone;
  return (
    <Badge
      variant="outline"
      title={meta.help}
      className={cn("gap-1.5 font-medium", TONE_CLASS[resolved], className)}
    >
      <Icon
        aria-hidden="true"
        className={cn("size-3", pulse && meta.spin && "animate-spin [animation-duration:1.4s]")}
      />
      {meta.label}
    </Badge>
  );
}

export function SubmissionStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const meta = SUBMISSION_STATUS[status] ?? SUBMISSION_STATUS.pending;
  return <Chip meta={meta} pulse className={className} />;
}

export function BagStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const meta = BAG_STATUS[status] ?? BAG_STATUS.DRAFT;
  return <Chip meta={meta} className={className} />;
}

/** Rank tiers shown on the profile header. */
export function RankBadge({
  rank,
  badge,
  className,
}: {
  rank: number | null;
  badge: string | null;
  className?: string;
}) {
  if (!rank) {
    return (
      <Badge variant="outline" className={cn("gap-1.5", TONE_CLASS.muted, className)}>
        <CircleDashed aria-hidden="true" className="size-3" />
        Unranked
      </Badge>
    );
  }
  const tier = badge ?? (rank <= 3 ? "DIAMOND" : rank <= 6 ? "PLATINUM" : "GOLD");
  return (
    <Badge variant="outline" className={cn("gap-1.5", TONE_CLASS.info, className)}>
      <span className="font-semibold tabular-nums">#{rank}</span>
      <span className="text-muted-foreground">·</span>
      <span className="capitalize">{tier.toLowerCase()}</span>
    </Badge>
  );
}
