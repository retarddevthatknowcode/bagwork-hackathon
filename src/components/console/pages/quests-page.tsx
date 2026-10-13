"use client";

import Link from "next/link";
import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  Check,
  Compass,
  Gift,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/auth/auth-provider";
import { ErrorState, EmptyState, PageHeader, SignInRequired } from "@/components/console/ui";
import { useConsoleQuests, type QuestProgressView } from "@/lib/console/hooks";
import { formatPoints } from "@/lib/profile/points";
import { QUESTS_DOCS_HREF, questProgressSentence } from "@/lib/quests/weekly";
import { cn } from "@/lib/utils";

/**
 * Weekly Quests.
 *
 * Three goals, one reward each, reset every Monday. The page exists to make earned progress
 * obvious at a glance: what is done, what is left, and exactly what the next action is.
 *
 * Two deliberate choices:
 *
 *   - **The rule is on the page.** Every card says what it counts and where the counting comes
 *     from ("links that passed submission validation this week"), because a progress bar nobody
 *     trusts is worse than no progress bar at all.
 *   - **Nothing is asked of the client.** There is no "claim" button and no counter to update —
 *     reading the page is what reconciles progress, and the server pays the 200 points itself.
 *     That is why the only interactive things here are links to the work.
 */
export function Quests() {
  const { ready, authenticated, login } = useAuth();
  const { data, isLoading, isError, refetch } = useConsoleQuests();

  /**
   * A completion that lands while the page is open gets a toast.
   *
   * The first response is not an announcement — it is just the page loading — so the slugs seen
   * on mount are recorded silently and only *new* completions are celebrated. That keeps the
   * reward feeling like something that just happened, not a notification replayed on every visit.
   */
  const celebrated = React.useRef<Set<string> | null>(null);

  React.useEffect(() => {
    if (!data?.quests) return;
    const completed = data.quests.filter((quest) => quest.status === "completed");

    if (celebrated.current === null) {
      celebrated.current = new Set(completed.map((quest) => quest.slug));
      return;
    }

    for (const quest of completed) {
      if (celebrated.current.has(quest.slug)) continue;
      celebrated.current.add(quest.slug);
      toast.success(`${quest.title} complete`, {
        description: `+${formatPoints(quest.pointsAwarded || quest.reward)} points added to your profile.`,
      });
    }
  }, [data?.quests]);

  if (ready && !authenticated) {
    return (
      <SignInRequired
        title="Weekly quests are for Bagworkers"
        description="Quests track real work — opting into bags, publishing content, earning verified views. Sign in to see this week's progress."
        onConnect={login}
      />
    );
  }

  const quests = data?.quests ?? [];
  const summary = data?.summary;

  return (
    <>
      <PageHeader
        eyebrow="Rewards"
        title="Weekly Quests"
        description="Three goals, 200 points each, reset every Monday at 00:00 UTC. Progress only counts verified work, and completes itself the moment that work is real."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={QUESTS_DOCS_HREF}>
              <BookOpen aria-hidden="true" className="size-3.5" />
              How quests work
            </Link>
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {isError ? (
          <ErrorState
            title="We couldn't load your quests"
            description="The quest board request failed. Retry — progress is recomputed from your submissions, so nothing is lost."
            onRetry={() => void refetch()}
          />
        ) : isLoading || !data || !summary ? (
          <QuestsSkeleton />
        ) : quests.length === 0 ? (
          <EmptyState
            icon={Gift}
            title="No quests running this week"
            description="Weekly quests are being tuned. In the meantime, every bag you opt into and every post that gets approved still earns points."
            action={
              <Button size="sm" asChild>
                <Link href="/dashboard">
                  <Compass aria-hidden="true" className="size-3.5" />
                  Explore bags
                </Link>
              </Button>
            }
          />
        ) : (
          <>
            <WeekSummary
              completed={summary.completed}
              total={summary.total}
              pointsEarned={summary.pointsEarned}
              pointsAvailable={summary.pointsAvailable}
              rewardPerQuest={summary.rewardPerQuest}
              resetLabel={data.period.resetLabel}
              windowLabel={data.period.label}
            />

            {summary.completed === summary.total ? (
              <AllCompleteBanner points={summary.pointsEarned} />
            ) : null}

            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {quests.map((quest, index) => (
                <QuestCard key={quest.id} quest={quest} index={index} />
              ))}
            </ul>

            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-relaxed text-muted-foreground">
              <Sparkles aria-hidden="true" className="size-3.5 shrink-0 text-brand" />
              <span>
                Points are awarded automatically on completion and never removed.{" "}
                <span className="text-muted-foreground/80">
                  Progress is derived from submissions and payouts — never from a number sent by a
                  browser.
                </span>
              </span>
            </p>
          </>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------- meter */

/**
 * The progress meter.
 *
 * Hand-built rather than reused from `ui/progress` because the fill animates with a `scaleX`
 * tween and the ARIA has to describe a quest ("2 of 3 Bags") rather than a bare percentage.
 * Reduced motion gets the settled bar immediately — no sweep, same information.
 */
function Meter({
  percent,
  label,
  valueText,
  complete,
  className,
}: {
  percent: number;
  /** Short label for assistive tech, e.g. `Opt-in Starter progress`. */
  label: string;
  /** Human summary, e.g. `2 of 3 Bags`. */
  valueText: string;
  complete: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-valuetext={valueText}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-white/[0.06]", className)}
    >
      <motion.span
        aria-hidden="true"
        className="block h-full origin-left rounded-full bg-[linear-gradient(90deg,#ffe70e,#bdfe00)]"
        style={{ width: `${clamped}%` }}
        initial={reduce ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={reduce ? { duration: 0 } : { duration: 0.7, ease: [0.22, 0.61, 0.36, 0.98] }}
      />
    </div>
  );
}



/* ------------------------------------------------------------ week summary */

/** The week at a glance: how many quests are done, what is banked, and when it resets. */
function WeekSummary({
  completed,
  total,
  pointsEarned,
  pointsAvailable,
  rewardPerQuest,
  resetLabel,
  windowLabel,
}: {
  completed: number;
  total: number;
  pointsEarned: number;
  pointsAvailable: number;
  rewardPerQuest: number;
  resetLabel: string;
  windowLabel: string;
}) {
  const percent = total > 0 ? (completed / total) * 100 : 0;

  return (
    <Card className="overflow-hidden py-0">
      <CardContent className="p-0">
        <dl className="grid divide-y divide-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="px-4 py-4 sm:px-5">
            <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Quests completed
            </dt>
            <dd className="mt-1.5 flex items-baseline gap-1.5">
              <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                {completed}
              </span>
              <span className="text-sm text-muted-foreground">/ {total}</span>
            </dd>
          </div>

          <div className="px-4 py-4 sm:px-5">
            <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Points banked
            </dt>
            <dd className="mt-1.5 flex items-baseline gap-1.5">
              <span
                className={cn(
                  "font-mono text-2xl font-semibold tabular-nums",
                  pointsEarned > 0 ? "text-brand" : "text-foreground",
                )}
              >
                {formatPoints(pointsEarned)}
              </span>
              <span className="text-xs text-muted-foreground">
                {pointsAvailable > 0
                  ? `${formatPoints(pointsAvailable)} still available`
                  : "week complete"}
              </span>
            </dd>
          </div>

          <div className="px-4 py-4 sm:px-5">
            <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              This week
            </dt>
            <dd className="mt-1.5 space-y-1">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <CalendarClock aria-hidden="true" className="size-3.5 text-muted-foreground" />
                {windowLabel}
              </p>
              <p className="text-xs text-muted-foreground">{resetLabel}</p>
            </dd>
          </div>
        </dl>

        <div className="space-y-1.5 border-t border-border/60 px-4 py-3.5 sm:px-5">
          <Meter
            percent={percent}
            label="Weekly quests completed"
            valueText={`${completed} of ${total} quests complete`}
            complete={total > 0 && completed === total}
          />
          <p className="text-[11px] text-muted-foreground">
            {rewardPerQuest > 0
              ? `Each completion pays ${formatPoints(rewardPerQuest)} points.`
              : "Each completion pays its own reward."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Shown only when every quest is done — the receipt for a finished week. */
function AllCompleteBanner({ points }: { points: number }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.35, ease: "easeOut" }}
      className="relative overflow-hidden rounded-xl border px-4 py-3.5 sm:px-5"
      // Inline because the console's global `* { border-color }` rule outranks Tailwind's
      // `border-*` utilities (see globals.css), so an accent border has to be set directly.
      style={{
        borderColor: "rgba(189, 254, 0, 0.35)",
        background:
          "linear-gradient(120deg, rgba(189,254,0,0.10), rgba(255,231,14,0.06) 60%, transparent)",
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border"
          style={{ borderColor: "rgba(189,254,0,0.4)" }}
        >
          <Trophy className="size-4 text-success" />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="title-display text-sm text-foreground">All three quests complete</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {formatPoints(points)} points banked this week. A fresh set opens Monday.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------- card */

/** The status of one quest, said in words — never colour alone. */
function StatusPill({ done }: { done: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        done ? "text-success" : "text-muted-foreground",
      )}
      style={{
        borderColor: done ? "rgba(189, 254, 0, 0.35)" : "var(--border)",
        backgroundColor: done ? "rgba(189, 254, 0, 0.08)" : "transparent",
      }}
    >
      {done ? (
        <Check aria-hidden="true" className="size-3" />
      ) : (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-brand pulse-dot" />
      )}
      {done ? "Completed" : "In progress"}
    </span>
  );
}


/** One weekly quest: what it asks for, how far along it is, and what it pays. */
function QuestCard({ quest, index }: { quest: QuestProgressView; index: number }) {
  const reduce = useReducedMotion();
  const done = quest.status === "completed";
  const headingId = `quest-${quest.slug}`;

  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduce ? { duration: 0 } : { duration: 0.35, delay: index * 0.06, ease: "easeOut" }
      }
      className="h-full list-none"
    >
      <article
        aria-labelledby={headingId}
        className={cn(
          "relative flex h-full flex-col gap-4 overflow-hidden rounded-2xl border bg-card/40 p-5 transition-colors duration-200",
          !done && "hover:border-border hover:bg-card/70",
        )}
        // See the note in `AllCompleteBanner`: accent border colours must be inline here.
        style={done ? { borderColor: "rgba(189, 254, 0, 0.32)" } : undefined}
      >
        {done ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-16 -right-10 size-40 rounded-full opacity-60 blur-3xl"
            style={{
              background: "radial-gradient(circle, rgba(189,254,0,0.22), transparent 70%)",
            }}
          />
        ) : null}

        <header className="relative flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Quest {String(index + 1).padStart(2, "0")}
            </p>
            <h2 id={headingId} className="title-display text-lg leading-tight text-foreground">
              {quest.title}
            </h2>
          </div>
          <StatusPill done={done} />
        </header>

        <p className="relative text-sm leading-relaxed text-muted-foreground">
          {quest.description}
        </p>

        <div className="relative mt-auto space-y-2">
          <p className="font-mono text-lg font-semibold tabular-nums tracking-tight text-foreground">
            {quest.progressLabel}
          </p>

          {/* The percentage sits beside the bar, not beside the label: a grouped label like
              "6,200 / 10,000 views" needs the full width of the card to stay on one line. */}
          <div className="flex items-center gap-2.5">
            <Meter
              percent={quest.percent}
              label={`${quest.title} progress`}
              // Spoken form: "2 of 5 links" reads; "2 / 5" does not. The compact label stays
              // on screen, so the two never have to agree about punctuation.
              valueText={
                quest.metric
                  ? questProgressSentence(quest.metric, quest.progress, quest.target)
                  : quest.progressLabel
              }
              complete={done}
              className="flex-1"
            />
            <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
              {quest.percent}%
            </span>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground/80">{quest.counts}</p>
        </div>

        <footer className="relative flex items-center justify-between gap-3 border-t border-border/60 pt-3.5">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold tabular-nums",
              done ? "text-success" : "text-brand",
            )}
            style={{
              borderColor: done ? "rgba(189, 254, 0, 0.35)" : "rgba(255, 231, 14, 0.32)",
              backgroundColor: done ? "rgba(189, 254, 0, 0.08)" : "rgba(255, 231, 14, 0.07)",
            }}
          >
            <Target aria-hidden="true" className="size-3" />
            +{formatPoints(quest.reward)} points
          </span>

          {done ? (
            <span className="text-[11px] font-medium text-muted-foreground">
              {quest.pointsAwarded > 0
                ? `${formatPoints(quest.pointsAwarded)} pts paid`
                : "Reward paid"}
            </span>
          ) : (
            <Link
              href={quest.href}
              className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-brand hover:decoration-brand focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {quest.action}
              <ArrowRight aria-hidden="true" className="size-3" />
            </Link>
          )}
        </footer>
      </article>
    </motion.li>
  );
}


/* ---------------------------------------------------------------- skeleton */

/** Shaped like the real page — summary card, then three quest cards — so nothing shifts. */
function QuestsSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading your weekly quests">
      <Card className="gap-0 py-0">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-7 w-24" />
              </div>
            ))}
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </CardContent>
      </Card>

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <li key={i} className="list-none">
            <Card className="h-full gap-0 py-0">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <Skeleton className="h-2.5 w-16" />
                    <Skeleton className="h-5 w-32" />
                  </div>
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-4/5" />
                <div className="space-y-2 pt-2">
                  <Skeleton className="h-6 w-28" />
                  <Skeleton className="h-2 w-full rounded-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <Skeleton className="h-6 w-28 rounded-md" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
