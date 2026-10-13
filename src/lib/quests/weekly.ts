/**
 * Weekly quests — the vocabulary, in one pure module.
 *
 * No React, no Prisma. Three callers need these names and one of them is a client component:
 *
 *   - `lib/quests/engine.ts` (server) reads the period maths and the metric keys;
 *   - `/dashboard/quests` renders labels and progress strings from here;
 *   - the docs diagram reads the same numbers, so the copy cannot promise a reward the server
 *     does not pay.
 *
 * Everything about quests is weekly. Daily quests are deliberately absent: a seven-day window is
 * the shortest one that rewards real work (a bag opt-in, a post that has to be reviewed) rather
 * than refreshing a button every morning.
 */

/* ------------------------------------------------------------------ rewards */

/**
 * Points every starter quest pays.
 *
 * Each quest's reward is stored in the database; this is the value the catalogue is seeded with
 * and the number the docs and the UI quote.
 */
export const WEEKLY_QUEST_REWARD = 200;

/* ------------------------------------------------------------------ metrics */

/**
 * How a quest measures progress.
 *
 * A metric is a *question against authoritative tables*, never a counter the client can bump:
 * progress is recomputed from submissions and payouts on every read (`lib/quests/engine.ts`).
 */
export const QUEST_METRICS = ["opt_in", "content_links", "verified_views"] as const;

export type QuestMetric = (typeof QUEST_METRICS)[number];

export function isQuestMetric(value: unknown): value is QuestMetric {
  return typeof value === "string" && QUEST_METRICS.includes(value as QuestMetric);
}

export interface QuestMetricMeta {
  metric: QuestMetric;
  /** Unit word for this metric: "Bags", "links", "views". */
  unit: string;
  /** Whether a progress string should be grouped ("6,200 / 10,000 views") or plain ("2/3"). */
  grouped: boolean;
  /** What the unit counts, said plainly — shown under the bar. */
  counts: string;
  /** The thing the quest asks the Bagworker to do, used as the card's action label. */
  action: string;
  /** Where that action happens. */
  href: string;
}

/**
 * One entry per metric, in the order the UI lists them.
 *
 * The label copy lives here rather than inside the card so the quests page, the profile summary
 * and the docs describe the same rule — and so a quest whose metric changes in the database
 * cannot end up explained by the wrong sentence.
 */
export const QUEST_METRIC_META: readonly QuestMetricMeta[] = [
  {
    metric: "opt_in",
    unit: "Bags",
    grouped: false,
    counts: "Distinct live bags you opted into this week.",
    action: "Find bags",
    href: "/dashboard",
  },
  {
    metric: "content_links",
    unit: "links",
    grouped: false,
    counts: "Links that passed submission validation this week.",
    action: "Submit a link",
    href: "/dashboard/submissions",
  },
  {
    metric: "verified_views",
    unit: "views",
    grouped: true,
    counts: "Verified views on submissions approved this week.",
    action: "See submissions",
    href: "/dashboard/submissions",
  },
];

export function questMetricMeta(metric: QuestMetric): QuestMetricMeta {
  return (
    QUEST_METRIC_META.find((entry) => entry.metric === metric) ??
    QUEST_METRIC_META[QUEST_METRIC_META.length - 1]
  );
}


/* ------------------------------------------------------------------- period */

/** Seven days, in milliseconds. The one reset interval this system has. */
export const QUEST_PERIOD_DAYS = 7;
const DAY_MS = 86_400_000;

export interface QuestPeriod {
  /** `2026-W36` — the key every progress row is stored under. */
  key: string;
  /** Monday 00:00 UTC. */
  startsAt: Date;
  /** Next Monday 00:00 UTC — exclusive, so a week is `[startsAt, endsAt)`. */
  endsAt: Date;
}

/**
 * The ISO week containing `now`, in UTC.
 *
 * UTC for the same reason the leaderboard uses it: a shared weekly reset has to be one instant
 * for everybody. If the boundary followed the viewer's clock, two Bagworkers in one race could
 * finish "last week" and "this week" at the same moment.
 *
 * Weeks start on Monday (ISO 8601) and the key is the ISO week number, so the string is stable
 * and sortable across year boundaries.
 */
export function questPeriod(now: Date = new Date()): QuestPeriod {
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // getUTCDay: 0 = Sunday. Shift so Monday = 0, then step back to that week's Monday.
  startsAt.setUTCDate(startsAt.getUTCDate() - ((startsAt.getUTCDay() + 6) % 7));

  const endsAt = new Date(startsAt.getTime() + QUEST_PERIOD_DAYS * DAY_MS);
  return { key: isoWeekKey(startsAt), startsAt, endsAt };
}

/**
 * `2026-W36` for the Monday that starts an ISO week.
 *
 * The Thursday of the same week decides the year: that is what makes the week containing
 * 1 January belong to the year holding most of its days, instead of splitting at the calendar
 * boundary.
 */
export function isoWeekKey(monday: Date): string {
  const thursday = new Date(monday.getTime() + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();

  // The Thursday of the week containing January 4th is always in ISO week 1.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const firstThursday = new Date(jan4.getTime());
  firstThursday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + 3);

  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** `Mon 29 Sep — Sun 5 Oct`: the window the page is describing. */
export function questPeriodLabel(period: QuestPeriod): string {
  const format = (date: Date) =>
    date.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  const lastDay = new Date(period.endsAt.getTime() - DAY_MS);
  return `${format(period.startsAt)} — ${format(lastDay)}`;
}

/**
 * Whole days left before the reset, counting today as part of the week: 7 on Monday, 1 on Sunday.
 *
 * Never 0, because the reset happens at the instant the week ends — "resets in 0 days" would read
 * as if the week were already over.
 */
export function questDaysRemaining(now: Date = new Date(), period = questPeriod(now)): number {
  const left = Math.ceil((period.endsAt.getTime() - now.getTime()) / DAY_MS);
  return Math.max(1, Math.min(QUEST_PERIOD_DAYS, left));
}

/** `Resets Monday 00:00 UTC — 3 days left this week`. One sentence, one source. */
export function questResetLabel(now: Date = new Date()): string {
  const days = questDaysRemaining(now);
  return `Resets Monday 00:00 UTC — ${days} day${days === 1 ? "" : "s"} left this week`;
}

/* ------------------------------------------------------------------ display */

/** `2/3` for counted units, `6,200 / 10,000 views` for large ones. */
export function questProgressLabel(metric: QuestMetric, progress: number, target: number): string {
  const meta = questMetricMeta(metric);
  const done = meta.grouped ? progress.toLocaleString("en-US") : String(progress);
  const goal = meta.grouped ? target.toLocaleString("en-US") : String(target);
  return `${done} / ${goal}${meta.grouped ? ` ${meta.unit}` : ""}`;
}

/** `2 of 3 Bags` — the long form, for inside a sentence or an `aria-label`. */
export function questProgressSentence(
  metric: QuestMetric,
  progress: number,
  target: number,
): string {
  const meta = questMetricMeta(metric);
  const done = meta.grouped ? progress.toLocaleString("en-US") : String(progress);
  const goal = meta.grouped ? target.toLocaleString("en-US") : String(target);
  return `${done} of ${goal} ${meta.unit}`;
}

/** 0–1, clamped. A completed quest reads as full even if the metric kept climbing. */
export function questProgressRatio(progress: number, target: number): number {
  if (!Number.isFinite(progress) || !Number.isFinite(target) || target <= 0) return 0;
  return Math.max(0, Math.min(1, progress / target));
}

/** `0`–`100`, for the meter's width and its `aria-valuenow`. */
export function questProgressPercent(progress: number, target: number): number {
  return Math.round(questProgressRatio(progress, target) * 100);
}

/* -------------------------------------------------------------------- paths */

/** The console page these quests live on. */
export const WEEKLY_QUESTS_PATH = "/dashboard/quests";

/** The docs section that explains the system. */
export const QUESTS_SECTION_ID = "12-weekly-quests";

/**
 * `See how Weekly Quests work` — built from the section id, so renaming the docs heading cannot
 * leave the quests page pointing at an anchor that no longer exists.
 */
export const QUESTS_DOCS_HREF = `/docs#${QUESTS_SECTION_ID}`;

/* ---------------------------------------------------------------- catalogue */

/**
 * The three starter quests, as code.
 *
 * This is the definition the database is seeded from — the `weekly_quests` migration inserts
 * exactly these rows, and `ensureQuestCatalogue` re-creates any that are missing. It is not read
 * at runtime by the UI: the board renders the rows, so an operator can retitle a quest, raise its
 * target or switch it off without a deploy.
 */
export interface StarterQuest {
  id: string;
  slug: string;
  title: string;
  description: string;
  metric: QuestMetric;
  target: number;
  reward: number;
  sortOrder: number;
}

export const STARTER_WEEKLY_QUESTS: readonly StarterQuest[] = [
  {
    id: "qst_opt_in_starter",
    slug: "opt-in-starter",
    title: "Opt-in Starter",
    description: "Opt into 3 different live Bags this week.",
    metric: "opt_in",
    target: 3,
    reward: WEEKLY_QUEST_REWARD,
    sortOrder: 1,
  },
  {
    id: "qst_content_creator",
    slug: "content-creator",
    title: "Content Creator",
    description: "Submit 5 content links that pass validation this week.",
    metric: "content_links",
    target: 5,
    reward: WEEKLY_QUEST_REWARD,
    sortOrder: 2,
  },
  {
    id: "qst_view_hunter",
    slug: "view-hunter",
    title: "View Hunter",
    description: "Generate 10,000 verified views across submissions approved this week.",
    metric: "verified_views",
    target: 10_000,
    reward: WEEKLY_QUEST_REWARD,
    sortOrder: 3,
  },
];

