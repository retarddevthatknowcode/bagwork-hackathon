/**
 * Points and levels — the one place this system is defined.
 *
 * The rules, exactly:
 *
 *   - `$1 of real approved earnings = 33 points`.
 *   - A completed **weekly quest** pays a fixed reward (200 points each; see
 *     `lib/quests/weekly.ts`). Quests are the only way to earn without a payout, and they are
 *     still paid work: a quest completes off verified actions — a real bag opt-in, a link that
 *     passed validation, views on an approved submission.
 *   - Everything else adds nothing. Pending work, rejected work, manual adjustments and
 *     purchases never add points, and there is no path that lets someone buy their way up.
 *   - Points never decrease. A profile's points are its lifetime record of real work.
 *
 * Pure module: no React, no Prisma. The server (`lib/profile/rewards.ts`), the quests engine
 * and the client (profile page, quests page, onboarding, docs) all read the same numbers from
 * here, so the copy in the docs cannot drift away from what the code pays out.
 */

/** The conversion rate. Changing this changes history, so treat it as a constant. */
export const POINTS_PER_DOLLAR = 33;

export interface LevelThreshold {
  level: number;
  /** Points at which this level begins. */
  minPoints: number;
}

/**
 * Soft thresholds — status only.
 *
 * Deliberately not a gate: no campaign is blocked by a level, and `levelFromPoints` is
 * never consulted before letting someone claim a bag. It exists to describe a profile.
 */
export const LEVEL_THRESHOLDS: readonly LevelThreshold[] = [
  { level: 1, minPoints: 0 },
  { level: 2, minPoints: 5_000 },
  { level: 3, minPoints: 25_000 },
  { level: 4, minPoints: 75_000 },
  { level: 5, minPoints: 200_000 },
  /**
   * The top of the ladder.
   *
   * Added when ranks got badges: the sixth shield needed a level to stand for, and inventing a
   * parallel set of tiers for it would have meant two progression systems that could disagree.
   * Every threshold below is unchanged, so nobody's level moved when this line appeared.
   */
  { level: 6, minPoints: 500_000 },
];

export const MAX_LEVEL = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1].level;

/**
 * Converts approved earnings into points.
 *
 * Floored per payout rather than on the running total, so nobody can gain a point by
 * splitting one payment into two.
 */
export function pointsForEarnings(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.floor(amount * POINTS_PER_DOLLAR);
}

export interface LevelProgress {
  level: number;
  points: number;
  /** Lower bound of the current level. */
  pointsForCurrentLevel: number;
  /** Lower bound of the next level, or `null` at the top. */
  pointsForNextLevel: number | null;
  /** Points earned inside the current level. */
  pointsIntoLevel: number;
  /** Points still needed for the next level; `0` at the top. */
  pointsToNextLevel: number;
  /** 0–1 fraction of the way to the next level, for the circular progress bar. */
  progress: number;
  isMaxLevel: boolean;
}

/** Turns a lifetime points total into a level plus progress toward the next. */
export function levelFromPoints(points: number): LevelProgress {
  const total = Number.isFinite(points) && points > 0 ? Math.floor(points) : 0;

  let index = 0;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (total >= LEVEL_THRESHOLDS[i].minPoints) index = i;
  }

  const current = LEVEL_THRESHOLDS[index];
  const next = LEVEL_THRESHOLDS[index + 1] ?? null;
  const pointsIntoLevel = total - current.minPoints;

  if (!next) {
    return {
      level: current.level,
      points: total,
      pointsForCurrentLevel: current.minPoints,
      pointsForNextLevel: null,
      pointsIntoLevel,
      pointsToNextLevel: 0,
      progress: 1,
      isMaxLevel: true,
    };
  }

  const span = next.minPoints - current.minPoints;
  const pointsToNextLevel = Math.max(0, next.minPoints - total);

  return {
    level: current.level,
    points: total,
    pointsForCurrentLevel: current.minPoints,
    pointsForNextLevel: next.minPoints,
    pointsIntoLevel,
    pointsToNextLevel,
    progress: span > 0 ? Math.min(1, pointsIntoLevel / span) : 0,
    isMaxLevel: false,
  };
}

/** `12,540` — grouped for display next to the letter-spaced "POINTS" label. */
export function formatPoints(points: number): string {
  return (Number.isFinite(points) && points > 0 ? Math.floor(points) : 0).toLocaleString(
    "en-US",
  );
}

/**
 * The sentence under the circular progress bar.
 *
 * Exact wording is part of the spec — "X points to Level Y" — with the singular handled
 * so it never reads "1 points".
 */
export function pointsToNextLevelLabel(progress: LevelProgress): string {
  if (progress.isMaxLevel) return `Top level reached — Level ${progress.level}`;
  const remaining = progress.pointsToNextLevel;
  return `${formatPoints(remaining)} point${remaining === 1 ? "" : "s"} to Level ${
    progress.level + 1
  }`;
}

/* ------------------------------------------------------------ Bagworker number */

/** A 4-digit number, so the first digit is never a leading zero. */
export const BAGWORKER_NUMBER_MIN = 1000;
export const BAGWORKER_NUMBER_MAX = 9999;

/** Uniform random 4-digit candidate. Uniqueness is enforced by the caller + the index. */
export function randomBagworkerNumber(): number {
  const span = BAGWORKER_NUMBER_MAX - BAGWORKER_NUMBER_MIN + 1;
  return BAGWORKER_NUMBER_MIN + Math.floor(Math.random() * span);
}

/** The one format used everywhere: `Bagworker#3578`. */
export function formatBagworkerNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "Bagworker#—" : `Bagworker#${value}`;
}

/**
 * The example number used in the docs.
 *
 * Docs have to show the format, and showing a real number would imply a real account, so this
 * is a fixed example rendered through the same formatter the app uses.
 */
export const BAGWORKER_NUMBER_EXAMPLE = 3578;

/** The docs section id, shared by the docs page and the profile link. */
export const POINTS_LEVELS_SECTION_ID = "11-points-levels-profile-value";

/**
 * "See how Points & Levels work" — the link from the profile page.
 *
 * Built from the section id rather than written out, so renaming the docs section cannot
 * leave the profile page pointing at an anchor that no longer exists.
 */
export const POINTS_LEVELS_DOCS_HREF = `/docs#${POINTS_LEVELS_SECTION_ID}`;

/** Copy for the profile, reused by the onboarding reveal so the two never disagree. */
export const BAGWORKER_NUMBER_BLURB =
  "Your permanent identity number. It stays with your profile for life — and it is what moves to the new owner if a profile is ever sold.";
