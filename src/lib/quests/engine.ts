/**
 * The weekly quest engine — server only.
 *
 * Two rules shape everything here:
 *
 *   1. **Progress is derived, never tracked.** There is no counter to increment when a link is
 *      submitted; instead the engine *asks the authoritative tables* how much of each quest is
 *      done ("how many distinct bags did this user claim since Monday?"). A tracker can drift,
 *      miss an event, or be written twice; a query cannot.
 *
 *   2. **Only verified actions count.** Every metric reads rows that exist because a real,
 *      checked action happened: a claim row for a live bag, a link that passed submission
 *      validation, views on a submission the review engine approved. Nothing reads a
 *      client-supplied number, and nothing counts pending or rejected work.
 *
 * The `user_quests` row is therefore a cache plus two facts that cannot be derived — that a
 * completion was claimed, and what it paid. `awardQuestReward` in `lib/profile/rewards.ts` owns
 * the exactly-once part of that.
 *
 * Cost: one statement for the catalogue, one for the quests, one for the progress rows, one per
 * unfinished quest, and a write only when a number actually moved. A board where everything is
 * already complete costs four reads and no writes.
 */
import { db } from "@/lib/db";
import { awardQuestReward } from "@/lib/profile/rewards";
import {
  STARTER_WEEKLY_QUESTS,
  isQuestMetric,
  questDaysRemaining,
  questMetricMeta,
  questPeriod,
  questPeriodLabel,
  questProgressLabel,
  questProgressPercent,
  questResetLabel,
  type QuestMetric,
  type QuestPeriod,
} from "@/lib/quests/weekly";

/* ------------------------------------------------------------------- shapes */

/** One quest as the board needs it: its definition plus this week's verified progress. */
export interface QuestView {
  id: string;
  slug: string;
  title: string;
  description: string;
  /** The metric progress was measured with, or `null` when the row's metric is unknown. */
  metric: QuestMetric | null;
  target: number;
  reward: number;
  /** Verified units this week, capped at `target`. */
  progress: number;
  /** `in_progress` | `completed`. */
  status: "in_progress" | "completed";
  completedAt: string | null;
  /** Points credited for this week's completion (`0` while it is still in progress). */
  pointsAwarded: number;
  /** 0–100, for the meter. */
  percent: number;
  /** `2/3`, or `6,200 / 10,000 views`. */
  progressLabel: string;
  /** `Distinct live bags you opted into this week.` */
  counts: string;
  unit: string;
  /** Where the work happens, and what to call the link. */
  action: string;
  href: string;
}


export interface QuestBoard {
  period: {
    key: string;
    startsAt: string;
    endsAt: string;
    /** `Mon 29 Sep — Sun 5 Oct`. */
    label: string;
    daysRemaining: number;
    /** `Resets Monday 00:00 UTC — 3 days left this week`. */
    resetLabel: string;
  };
  quests: QuestView[];
  summary: {
    /** How many quests are live this week. */
    total: number;
    completed: number;
    inProgress: number;
    /** Points already banked from this week's quests. */
    pointsEarned: number;
    /** Points still on the table this week. */
    pointsAvailable: number;
    /** What one completion pays — the headline number on the page. */
    rewardPerQuest: number;
  };
}

/* ---------------------------------------------------------------- catalogue */

/**
 * Makes sure the starter quests exist.
 *
 * `createMany({ skipDuplicates })` inserts only the slugs that are missing, so it can never
 * overwrite a quest an operator has retitled, retargeted or switched off.
 *
 * `ensureQuestCatalogueOnce` is what callers should use on a read path. It matters because this
 * function is a **write**: running it on every quest read meant every visit to the quests page
 * paid a full write round-trip (~0.9s against the remote pooler) to insert rows that were
 * already there. The migration seeds the catalogue; this is the heal for a database that lost it.
 */
export async function ensureQuestCatalogue(): Promise<void> {
  await db.quest.createMany({
    data: STARTER_WEEKLY_QUESTS.map((quest) => ({
      id: quest.id,
      slug: quest.slug,
      title: quest.title,
      description: quest.description,
      metric: quest.metric,
      target: quest.target,
      reward: quest.reward,
      cadence: "WEEKLY",
      active: true,
      sortOrder: quest.sortOrder,
    })),
    skipDuplicates: true,
  });
}

/** Module-scope, so it is once per server instance: it resets on redeploy, and a wiped database
 *  is healed by the first request that instance serves. */
let catalogueEnsured = false;

async function ensureQuestCatalogueOnce(): Promise<void> {
  if (catalogueEnsured) return;
  await ensureQuestCatalogue();
  catalogueEnsured = true;
}

/* ------------------------------------------------------------------ metrics */

/**
 * How much of `metric` this user has verified inside `[since, …)`.
 *
 * Each branch is a question with one honest answer, and each answer is a row that only exists
 * because something real happened. Progress is capped by the caller, not here.
 */
async function measureMetric(
  userId: string,
  metric: QuestMetric,
  since: Date,
): Promise<number> {
  switch (metric) {
    /**
     * Distinct bags opted into this week.
     *
     * `claimedAt` is the opt-in timestamp. It is null for claims made before that column
     * existed, so those fall back to `createdAt` — a row with no link and no claim time is still
     * an opt-in. `distinct` on `campaignId` is what makes it "3 different bags": claiming a
     * fourth slot in the same bag is not a new opt-in.
     */
    case "opt_in": {
      const rows = await db.submission.findMany({
        where: {
          userId,
          OR: [{ claimedAt: { gte: since } }, { claimedAt: null, createdAt: { gte: since } }],
        },
        select: { campaignId: true },
        distinct: ["campaignId"],
      });
      return rows.length;
    }

    /**
     * Links that passed submission validation this week.
     *
     * `POST /api/submissions` only writes a row once the URL is real and the post's author
     * matches an account the creator verified, and `submittedAt` is stamped at that moment —
     * which is why this is not `createdAt`: a slot claimed on Monday and filled on Friday is
     * Friday's link.
     *
     * Rejected rows stop counting: if review later flags the post, the link is no longer verified
     * work.
     */
    case "content_links":
      return db.submission.count({
        where: {
          userId,
          postUrl: { not: null },
          submittedAt: { gte: since },
          status: { not: "rejected" },
        },
      });

    /**
     * Verified views on submissions approved this week.
     *
     * Only `approved` and `paid` rows carry verified engagement, and `approvedAt` puts each total
     * in the week its submission was approved — so this number is "views produced by work this
     * week", which is the only thing a weekly reset can honestly measure. A pending or rejected
     * submission contributes nothing, whatever its view count says.
     */
    case "verified_views": {
      const total = await db.submission.aggregate({
        where: {
          userId,
          status: { in: ["approved", "paid"] },
          approvedAt: { gte: since },
        },
        _sum: { views: true },
      });
      return total._sum.views ?? 0;
    }
  }
}

/* ------------------------------------------------------------ reconciliation */

/** The `UserQuest` row shape the reconciliation needs, without pulling the quest. */
type ProgressRow = {
  id: string;
  progress: number;
  status: string;
  completedAt: Date | null;
  pointsAwarded: number;
};

/** The quest columns this engine uses. A `Quest` row is wider; this is what matters here. */
type QuestDefinition = {
  id: string;
  slug: string;
  title: string;
  description: string;
  metric: string;
  target: number;
  reward: number;
};

/** Builds the row the UI renders, from whichever numbers it was told. */
function buildView(input: {
  quest: QuestDefinition;
  metric: QuestMetric | null;
  progress: number;
  status: string;
  completedAt: Date | null;
  pointsAwarded: number;
}): QuestView {
  const { quest, metric, progress, status, completedAt, pointsAwarded } = input;
  const meta = metric ? questMetricMeta(metric) : null;
  const progressLabel = meta
    ? questProgressLabel(metric as QuestMetric, progress, quest.target)
    : `${progress} / ${quest.target}`;

  return {
    id: quest.id,
    slug: quest.slug,
    title: quest.title,
    description: quest.description,
    metric,
    target: quest.target,
    reward: quest.reward,
    progress,
    status: status === "completed" ? "completed" : "in_progress",
    completedAt: completedAt ? completedAt.toISOString() : null,
    pointsAwarded,
    percent: questProgressPercent(progress, quest.target),
    progressLabel,
    // An unknown metric still renders a real quest — it just cannot claim to count something.
    counts: meta?.counts ?? "Progress is measured from verified actions only.",
    unit: meta?.unit ?? "units",
    action: meta?.action ?? "See submissions",
    href: meta?.href ?? "/dashboard/submissions",
  };
}


/**
 * Writes this week's number for one quest, and pays the reward the moment it completes.
 *
 * A completed row is never touched again: its progress stays at the target and its points stay
 * paid, so a rejection arriving later cannot un-complete it or claw points back.
 */
async function reconcile(input: {
  userId: string;
  quest: QuestDefinition;
  period: QuestPeriod;
  /** The measured number for this metric, before capping. */
  raw: number;
  /** This week's existing row, when there is one. */
  existing: ProgressRow | undefined;
  now: Date;
}): Promise<QuestView> {
  const { userId, quest, period, raw, existing, now } = input;
  const metric = isQuestMetric(quest.metric) ? quest.metric : null;

  const complete = quest.target > 0 && raw >= quest.target;
  const progress = complete ? quest.target : Math.max(0, Math.min(raw, quest.target));
  const status = complete ? "completed" : "in_progress";
  const completedAt = complete ? (existing?.completedAt ?? now) : null;
  let pointsAwarded = existing?.pointsAwarded ?? 0;
  let rowId = existing?.id;

  // A refresh that changes nothing writes nothing.
  const changed = !existing || existing.progress !== progress || existing.status !== status;

  if (changed) {
    const row = await db.userQuest.upsert({
      where: {
        userId_questId_periodKey: { userId, questId: quest.id, periodKey: period.key },
      },
      create: {
        userId,
        questId: quest.id,
        periodKey: period.key,
        progress,
        status,
        completedAt,
        pointsAwarded: 0,
      },
      // `pointsAwarded` is deliberately absent: the award path owns it.
      update: { progress, status, completedAt },
      select: { id: true },
    });
    rowId = row.id;
  }

  /**
   * Completion pays, exactly once.
   *
   * `pointsAwarded === 0` on a completed row is the retry marker: if the credit fails or the
   * process dies here, the next sync reaches this branch again and the claim inside
   * `awardQuestReward` decides who actually pays. The worst case is therefore a short delay —
   * never a missing reward, and never two of them.
   */
  if (complete && pointsAwarded === 0 && rowId) {
    const award = await awardQuestReward({
      userId,
      userQuestId: rowId,
      reward: quest.reward,
      context: `quest ${quest.slug} (${period.key})`,
    });
    if (award) pointsAwarded = award.awarded;
  }

  return buildView({ quest, metric, progress, status, completedAt, pointsAwarded });
}


/* --------------------------------------------------------------------- read */

/**
 * Brings one Bagworker's weekly quests up to date and returns the board.
 *
 * This is the whole public surface of the system: the quests page calls it on every load, and the
 * claim / submit / review routes call it the moment the action that feeds a metric happens.
 * Calling it twice is free of consequence — progress is recomputed from the same rows, a completed
 * week is left alone, and the award is claimed exactly once.
 */
export async function syncWeeklyQuests(
  userId: string,
  now: Date = new Date(),
): Promise<QuestBoard> {
  const period = questPeriod(now);

  // A missing catalogue heals here rather than throwing: this is a read, and a database that lost
  // its quest rows should recover instead of 500-ing the page. Once per instance is enough — the
  // write was previously paid by every single read.
  await ensureQuestCatalogueOnce();

  const [quests, rows] = await Promise.all([
    db.quest.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
    }),
    db.userQuest.findMany({ where: { userId, periodKey: period.key } }),
  ]);

  const rowByQuest = new Map(rows.map((row) => [row.questId, row as ProgressRow]));

  // Only unfinished quests are measured. A completed one keeps its points and its target: the week
  // it was earned cannot be rewritten by a later rejection.
  const unfinished = quests.filter((quest) => rowByQuest.get(quest.id)?.status !== "completed");

  const measured = await Promise.all(
    unfinished.map(async (quest) => ({
      quest,
      raw: isQuestMetric(quest.metric)
        ? await measureMetric(userId, quest.metric, period.startsAt)
        : 0,
    })),
  );

  const updated = await Promise.all(
    measured.map(({ quest, raw }) =>
      reconcile({ userId, quest, period, raw, existing: rowByQuest.get(quest.id), now }),
    ),
  );
  const viewByQuest = new Map(updated.map((view) => [view.id, view]));

  const views: QuestView[] = quests.map((quest) => {
    const fresh = viewByQuest.get(quest.id);
    if (fresh) return fresh;
    // Already complete this week: read straight off the frozen row.
    const row = rowByQuest.get(quest.id);
    return buildView({
      quest,
      metric: isQuestMetric(quest.metric) ? quest.metric : null,
      progress: quest.target,
      status: row?.status ?? "completed",
      completedAt: row?.completedAt ?? null,
      pointsAwarded: row?.pointsAwarded ?? 0,
    });
  });

  const completed = views.filter((view) => view.status === "completed");

  return {
    period: {
      key: period.key,
      startsAt: period.startsAt.toISOString(),
      endsAt: period.endsAt.toISOString(),
      label: questPeriodLabel(period),
      daysRemaining: questDaysRemaining(now, period),
      resetLabel: questResetLabel(now),
    },
    quests: views,
    summary: {
      total: views.length,
      completed: completed.length,
      inProgress: views.length - completed.length,
      pointsEarned: completed.reduce((sum, view) => sum + view.pointsAwarded, 0),
      pointsAvailable: views
        .filter((view) => view.status !== "completed")
        .reduce((sum, view) => sum + view.reward, 0),
      rewardPerQuest: views.find((view) => view.reward > 0)?.reward ?? 0,
    },
  };
}

/**
 * `syncWeeklyQuests`, made non-fatal for the routes that trigger it.
 *
 * A claim, a submission or a review verdict has already been written by the time this runs, so
 * throwing here would tell a Bagworker their action failed when it did not. A failure is logged
 * and swallowed instead: progress is derived, so the next sync — the quests page, or the next
 * action — recomputes the same number and pays anything still owed.
 */
export async function syncWeeklyQuestsSafely(
  userId: string | null | undefined,
  context: string,
): Promise<QuestBoard | null> {
  if (!userId) return null;
  try {
    return await syncWeeklyQuests(userId);
  } catch (error) {
    console.error(`[quests] sync failed after ${context}`, {
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}


