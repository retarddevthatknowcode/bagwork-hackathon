"use client";

import Link from "next/link";
import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowBigUp,
  ArrowRight,
  CalendarClock,
  Check,
  CircleDot,
  Lightbulb,
  Lock,
  Search,
  Send,
  Sparkles,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/components/auth/auth-provider";
import { ProfileAvatar } from "@/components/console/identity";
import { EmptyState, ErrorState, PageHeader } from "@/components/console/ui";
import { useCreateFeatureRequest, useFeatureBoard, useToggleFeatureVote } from "@/lib/console/hooks";
import { relative } from "@/lib/console/format";
import {
  FEATURE_DETAILS_MAX,
  FEATURE_STATUS_LABELS,
  FEATURE_TITLE_MAX,
  featureLockedBlurb,
  validateFeatureDraft,
  type FeatureDraftErrors,
  type FeatureRequestView,
  type FeatureSort,
  type FeatureStatus,
} from "@/lib/features/board";
import { POINTS_LEVELS_DOCS_HREF } from "@/lib/profile/points";
import { cn } from "@/lib/utils";

/**
 * Feature Requests — the board.
 *
 * A composer on the left, the ranked list on the right. Two decisions worth stating, because they
 * are what stop this being a generic upvote widget:
 *
 *   - **The vote is the loudest thing on a row.** A vertical control carrying the number, not a
 *     small icon beside the title, because that number is the only ordering anyone reads here.
 *   - **The gate is explained, not just enforced.** Below Level 4 the composer becomes a lock, the
 *     level it names, and the routes to fix it — the profile, and the docs that explain how points
 *     are earned. A disabled button with no reason attached is worse than no button.
 *
 * All ordering happens server-side. Search filters the page the server already returned, which is
 * honest at this size (the board is capped at 100 rows) and keeps "most upvoted first" intact while
 * somebody types.
 */

const PAGE_BLURB =
  "Tell us what to build next. Upvote what matters to you — the board is ordered by votes, and posting opens at Level 4.";

/** Tone per status. Follows the console's badge convention: `border-x/30 bg-x/10 text-x`. */
const STATUS_STYLE: Record<FeatureStatus, { className: string; icon: LucideIcon }> = {
  OPEN: { className: "border-brand/35 bg-brand/10 text-brand", icon: CircleDot },
  PLANNED: { className: "border-info/30 bg-info/10 text-info", icon: CalendarClock },
  DONE: { className: "border-success/30 bg-success/10 text-success", icon: Check },
};

/** "12 requests · 8 open · 3 planned · 1 done" — reads the board's own summary, never a recount. */
function summarise(summary?: {
  total: number;
  open: number;
  planned: number;
  done: number;
  yourVotes: number;
}): string {
  if (!summary || summary.total === 0) return "No requests yet";
  const parts = [
    `${summary.total} request${summary.total === 1 ? "" : "s"}`,
    `${summary.open} open`,
    `${summary.planned} planned`,
    `${summary.done} done`,
  ];
  if (summary.yourVotes > 0) parts.push(`you voted on ${summary.yourVotes}`);
  return parts.join(" · ");
}

export function FeatureRequests() {
  const { ready, authenticated, login } = useAuth();
  const [sort, setSort] = React.useState<FeatureSort>("top");
  const [query, setQuery] = React.useState("");
  const { data, isLoading, isError, isFetching, refetch } = useFeatureBoard(sort);

  const requests = data?.requests ?? [];
  const viewer = data?.viewer;

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? requests.filter(
        (request) =>
          request.title.toLowerCase().includes(needle) ||
          request.details.toLowerCase().includes(needle),
      )
    : requests;

  if (isLoading) {
    return (
      <>
        <PageHeader eyebrow="Product" title="Feature Requests" description={PAGE_BLURB} />
        <BoardSkeleton />
      </>
    );
  }

  if (isError) {
    return (
      <>
        <PageHeader eyebrow="Product" title="Feature Requests" description={PAGE_BLURB} />
        <div className="p-4 sm:p-6 lg:p-8">
          <ErrorState
            title="The board did not load"
            description="The request failed. Retry — the board is a single read, so this is almost always momentary."
            onRetry={() => void refetch()}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Product"
        title="Feature Requests"
        description={PAGE_BLURB}
        actions={
          viewer?.level ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
              <Sparkles aria-hidden="true" className="size-3.5 text-brand" />
              You are Level{" "}
              <span className="font-semibold tabular-nums text-foreground">{viewer.level}</span>
            </span>
          ) : null
        }
      />

      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] lg:items-start lg:gap-8 lg:p-8">
        <Composer
          ready={ready}
          authenticated={authenticated}
          canPost={Boolean(viewer?.canPost)}
          message={viewer?.message ?? null}
          onSignIn={login}
        />

        <section aria-labelledby="feature-board-heading" className="min-w-0 space-y-4">
          <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 id="feature-board-heading" className="text-sm font-semibold text-foreground">
                All requests
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{summarise(data?.summary)}</p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search requests"
                  aria-label="Search feature requests"
                  className="h-8 w-full pl-8 text-xs sm:w-52"
                />
              </div>

              <ToggleGroup
                type="single"
                value={sort}
                onValueChange={(value) => {
                  // Radix returns "" when the active item is pressed again — keep the sort.
                  if (value) setSort(value as FeatureSort);
                }}
                variant="outline"
                size="sm"
                className="shrink-0"
                aria-label="Sort the board"
              >
                <ToggleGroupItem value="top" aria-label="Sort by most upvoted">
                  Top
                </ToggleGroupItem>
                <ToggleGroupItem value="new" aria-label="Sort by newest">
                  New
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {visible.length === 0 ? (
            <BoardEmptyState
              filtered={Boolean(needle)}
              onClear={() => setQuery("")}
              canPost={Boolean(viewer?.canPost)}
            />
          ) : (
            <ul
              aria-busy={isFetching}
              className={cn(
                "space-y-2.5 transition-opacity duration-200",
                isFetching && "opacity-60",
              )}
            >
              {visible.map((request, index) => (
                <FeatureRow
                  key={request.id}
                  request={request}
                  index={index}
                  signedIn={ready && authenticated}
                  onSignIn={login}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------- composer */

/**
 * The composer.
 *
 * Four states, ordered by what the person can do about them: still reading the session, not signed
 * in, signed in but below Level 4, and open for business. Each is a real card in the same slot, so
 * the column does not jump between states — the page reads the same either way.
 */
function Composer({
  ready,
  authenticated,
  canPost,
  message,
  onSignIn,
}: {
  ready: boolean;
  authenticated: boolean;
  canPost: boolean;
  message: string | null;
  onSignIn: () => void;
}) {
  const create = useCreateFeatureRequest();
  const [title, setTitle] = React.useState("");
  const [details, setDetails] = React.useState("");
  const [errors, setErrors] = React.useState<FeatureDraftErrors>({});

  if (!ready) {
    return (
      <Card className="gap-0 py-0 lg:sticky lg:top-20">
        <CardContent className="space-y-3 p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-9 w-32" />
        </CardContent>
      </Card>
    );
  }

  if (!authenticated) {
    return (
      <ComposerShell
        icon={Wallet}
        heading="Sign in to vote"
        body="The board is open to read. Upvoting needs an account, so that a vote belongs to somebody — which is what makes one-per-person possible."
      >
        <Button onClick={onSignIn} className="w-full gap-1.5">
          <Wallet aria-hidden="true" className="size-4" />
          Sign in
        </Button>
      </ComposerShell>
    );
  }

  if (!canPost) {
    return (
      <ComposerShell
        icon={Lock}
        heading={message ?? "Posting is locked"}
        body={featureLockedBlurb()}
      >
        <div className="flex flex-col gap-2">
          <Button asChild variant="outline" className="w-full gap-1.5">
            <Link href="/dashboard/profile">
              View your level
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>
          </Button>
          {/* The docs section that explains how points are earned — not a dead "learn more". */}
          <Button asChild variant="ghost" size="sm" className="w-full text-xs">
            <Link href={POINTS_LEVELS_DOCS_HREF}>How points and levels work</Link>
          </Button>
        </div>
      </ComposerShell>
    );
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Validated with the same function the route uses, so the two cannot disagree about what is
    // acceptable. The server check remains the rule; this is only the fast feedback.
    const draft = validateFeatureDraft({ title, details });
    if (!draft.ok) {
      setErrors(draft.errors);
      return;
    }
    setErrors({});
    create.mutate(draft.value, {
      onSuccess: () => {
        setTitle("");
        setDetails("");
        toast.success("Feature request posted", {
          description: "It is on the board — upvote it so it climbs.",
        });
      },
      onError: (error) => {
        // Field problems go under their inputs; everything else — the 409 duplicate, a 403 from a
        // stale level — is a toast, because there is no field to attach it to.
        setErrors(error.errors ?? {});
        toast.error(error.message);
      },
    });
  }

  return (
    <Card className="gap-0 py-0 lg:sticky lg:top-20">
      <CardContent className="p-4">
        <h2 className="text-sm font-semibold text-foreground">Post a request</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          One idea per request. Say what it is and what it would fix.
        </p>

        <form onSubmit={onSubmit} className="mt-4 space-y-3" noValidate>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="feature-title" className="text-xs font-medium text-foreground">
                Title
              </label>
              <span
                className={cn(
                  "text-[10px] tabular-nums",
                  title.length > FEATURE_TITLE_MAX ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {title.length}/{FEATURE_TITLE_MAX}
              </span>
            </div>
            <Input
              id="feature-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Dark mode for the console"
              maxLength={FEATURE_TITLE_MAX}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? "feature-title-error" : undefined}
              className="h-9"
            />
            {errors.title ? (
              <p id="feature-title-error" className="text-[11px] text-destructive">
                {errors.title}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="feature-details" className="text-xs font-medium text-foreground">
                Details
              </label>
              <span
                className={cn(
                  "text-[10px] tabular-nums",
                  details.length > FEATURE_DETAILS_MAX
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {details.length}/{FEATURE_DETAILS_MAX}
              </span>
            </div>
            <Textarea
              id="feature-details"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="What problem does this solve, and who does it help?"
              rows={5}
              maxLength={FEATURE_DETAILS_MAX}
              aria-invalid={Boolean(errors.details)}
              aria-describedby={errors.details ? "feature-details-error" : undefined}
              className="resize-y text-sm"
            />
            {errors.details ? (
              <p id="feature-details-error" className="text-[11px] text-destructive">
                {errors.details}
              </p>
            ) : null}
          </div>

          <Button type="submit" disabled={create.isPending} className="w-full gap-1.5">
            <Send aria-hidden="true" className="size-3.5" />
            {create.isPending ? "Posting…" : "Submit Feature"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** The shared frame for the two locked states, so they read as one component in two moods. */
function ComposerShell({
  icon: Icon,
  heading,
  body,
  children,
}: {
  icon: LucideIcon;
  heading: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 py-0 lg:sticky lg:top-20">
      <CardContent className="p-4">
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted/40"
        >
          <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
        </span>
        <h2 className="mt-3 text-sm font-semibold text-foreground">{heading}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
        <div className="mt-4">{children}</div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------------------ a row */

/**
 * One request.
 *
 * The row is not itself a link. There is nowhere for it to go — a request has no detail page — and
 * a card that looks clickable but is not is worse than one that plainly is not. The measure of the
 * row is the vote control, which is deliberately the largest interactive target on it.
 *
 * The author's avatar, handle, level and the age of the post are all secondary and all present,
 * because on a board where anyone can post, "who asked for this" is part of reading it.
 */
function FeatureRow({
  request,
  index,
  signedIn,
  onSignIn,
}: {
  request: FeatureRequestView;
  index: number;
  signedIn: boolean;
  onSignIn: () => void;
}) {
  const vote = useToggleFeatureVote();
  const reducedMotion = useReducedMotion();
  // Scoped to this row: another row's in-flight vote must not disable this button.
  const pending = vote.isPending && vote.variables?.id === request.id;

  const author = request.author;
  const authorName = author
    ? author.handle
      ? `@${author.handle}`
      : `Bagworker#${author.profileNumber}`
    : "Removed account";

  return (
    <motion.li
      layout={!reducedMotion}
      initial={reducedMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.025, 0.3) }}
      className="list-none"
    >
      <article className="group flex gap-3 rounded-xl border border-border/70 bg-card/40 p-3 transition-colors hover:border-border sm:gap-4 sm:p-4">
        <button
          type="button"
          onClick={() => {
            // Voting is the one thing that needs an account, so pressing it signed-out starts the
            // sign-in rather than doing nothing.
            if (!signedIn) {
              onSignIn();
              return;
            }
            vote.mutate({ id: request.id, voted: !request.hasVoted });
          }}
          disabled={pending}
          aria-pressed={request.hasVoted}
          aria-label={
            request.hasVoted
              ? `Remove your upvote from ${request.title} — ${request.upvotes} upvotes`
              : `Upvote ${request.title} — ${request.upvotes} upvotes`
          }
          className={cn(
            "flex w-12 shrink-0 flex-col items-center justify-center gap-0.5 self-start rounded-lg border py-1.5 text-xs font-semibold tabular-nums transition-colors",
            "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
            request.hasVoted
              ? "border-brand/50 bg-brand/10 text-brand"
              : "border-border bg-muted/30 text-muted-foreground hover:border-brand/40 hover:bg-muted/50 hover:text-foreground",
            pending && "opacity-60",
          )}
        >
          <ArrowBigUp
            aria-hidden="true"
            className={cn("size-4", request.hasVoted && "fill-current")}
          />
          <span>{request.upvotes}</span>
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
            <h3 className="title-display min-w-0 text-[0.95rem] leading-snug text-foreground">
              {request.title}
            </h3>
            <StatusChip status={request.status} />
          </div>

          {/* Not clamped: details are capped at 600 characters, so a full one is a short
              paragraph and hiding the end of it behind a "read more" would be a lie. */}
          <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
            {request.details}
          </p>

          <footer className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-0.5 text-[11px] text-muted-foreground">
            <ProfileAvatar profileNumber={author?.profileNumber} className="size-5 rounded-md" />
            <span className="font-medium text-foreground/80">{authorName}</span>
            {author ? <span className="tabular-nums">Lv {author.level}</span> : null}
            <span aria-hidden="true" className="text-muted-foreground/40">
              ·
            </span>
            <time dateTime={request.createdAt}>{relative(request.createdAt)}</time>
            {request.isMine ? (
              <span className="rounded border border-border bg-muted/40 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide">
                Yours
              </span>
            ) : null}
          </footer>
        </div>
      </article>
    </motion.li>
  );
}

/** Status as icon + word. Never colour alone — the shape carries the meaning, the tone supports it. */
function StatusChip({ status }: { status: FeatureStatus }) {
  const { className, icon: Icon } = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3" />
      {FEATURE_STATUS_LABELS[status]}
    </span>
  );
}

/* ------------------------------------------------------------------- empty + skeleton */

/**
 * The empty state, in its two flavours.
 *
 * "Nothing matches that" and "nothing has been asked for yet" are different situations with
 * different next actions, so they are different messages. It also adapts to the viewer: if they can
 * post, the empty board is an invitation, and the composer is already sitting beside it.
 */
function BoardEmptyState({
  filtered,
  onClear,
  canPost,
}: {
  filtered: boolean;
  onClear: () => void;
  canPost: boolean;
}) {
  if (filtered) {
    return (
      <EmptyState
        icon={Search}
        title="Nothing matches that"
        description="No request on the board contains that text. Try a shorter word, or clear the search to see everything."
        action={
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear search
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={Lightbulb}
      title="The board is empty"
      description={
        canPost
          ? "Nobody has asked for anything yet. The first request here is also the first thing anyone can upvote — and the composer is right beside this."
          : "Nobody has asked for anything yet. When someone posts an idea it appears here, ordered by how many people want it."
      }
    />
  );
}

/** Shaped like the real page — the composer, then rows — so nothing shifts when the data lands. */
function BoardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading feature requests"
      className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] lg:items-start lg:gap-8 lg:p-8"
    >
      <Card className="gap-0 py-0">
        <CardContent className="space-y-3 p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-9 w-32" />
        </CardContent>
      </Card>

      <div className="space-y-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex gap-3 rounded-xl border border-border/70 bg-card/40 p-3 sm:gap-4 sm:p-4"
          >
            <Skeleton className="h-11 w-12 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}



