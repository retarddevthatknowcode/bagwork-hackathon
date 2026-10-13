/**
 * Rank badges — the visual layer over levels, and nothing more.
 *
 * A badge is not a second progression system. One number moves (`points`), one function reads it
 * (`levelFromPoints`), and this module does nothing but give each level a face: which of the six
 * shields to draw, what it is called, and whether a profile has reached it yet. Nothing here
 * awards anything and nothing here is stored — remove this file and every level would be exactly
 * the same, which is the property worth protecting.
 *
 * The thresholds are read from `LEVEL_THRESHOLDS` rather than restated, so the badge a profile
 * wears and the level the server puts it at can never drift apart.
 *
 * Art: six shields in `public/badges/rank-1.png` … `rank-6.png`, cut from a single source sheet
 * in ascending order. Regenerate with `node tool-results/slice-rank-badges.mjs`, which finds the
 * gap between neighbouring shields rather than dividing the sheet into sixths — the shields are
 * not on even cells, and cropping by arithmetic silently drags a neighbour's wing into a badge.
 * `node tool-results/verify-rank-badges.mjs` measures the ink sitting outside each shield and is
 * the cheap way to catch that. One file per level, so a seventh level means a seventh badge and
 * a seventh threshold; the names, the rail and the gallery all follow from the table
 * automatically.
 */

import { LEVEL_THRESHOLDS } from "./points";

export interface RankBadge {
  /** 1–6, in order. The rank and the level are the same thing, counted from one. */
  rank: number;
  /** The level this badge stands for. */
  level: number;
  /** Initiate, Contender, Vanguard, Elite, Mythic, Legendary — the six, ascending. */
  name: string;
  /** The points at which it unlocks. Read from the level table, never restated. */
  minPoints: number;
  /** Public path to the art. */
  src: string;
  /** One line, used as the tooltip and the accessible description. */
  blurb: string;
}

/**
 * The six rank names, in ascending order.
 *
 * Named for the climb rather than the colour of the shield, so a rank still reads as something
 * earned when it is spoken aloud — "Rank Vanguard" rather than "Rank Green". The top of the ladder
 * keeps the name it had.
 */
const RANK_NAMES = ["Initiate", "Contender", "Vanguard", "Elite", "Mythic", "Legendary"] as const;

const RANK_BLURBS = [
  "Every profile starts here.",
  "Earned 5,000 points of approved work.",
  "Earned 25,000 points of approved work.",
  "Earned 75,000 points of approved work.",
  "Earned 200,000 points of approved work.",
  "Earned 500,000 points — the top of the ladder.",
] as const;

/**
 * The six badges, built from the level table.
 *
 * Falling back rather than indexing blind: if a level is ever added ahead of its art, a profile
 * at that level should wear a plain name and the previous badge, not crash the profile page.
 */
export const RANK_BADGES: readonly RankBadge[] = LEVEL_THRESHOLDS.map((threshold, index) => ({
  rank: index + 1,
  level: threshold.level,
  name: RANK_NAMES[index] ?? `Rank ${index + 1}`,
  minPoints: threshold.minPoints,
  src: `/badges/rank-${index + 1}.png`,
  blurb: RANK_BLURBS[index] ?? "Reached a new rank.",
}));

/** The badge a given level wears. Clamped, so an unexpected level still returns a real badge. */
export function rankFromLevel(level: number): RankBadge {
  const index = Math.min(Math.max(Math.floor(level) - 1, 0), RANK_BADGES.length - 1);
  return RANK_BADGES[index];
}

/** The badge a points total has earned. The only entry point that matters. */
export function rankFromPoints(points: number): RankBadge {
  const index = RANK_BADGES.reduce(
    (found, badge, i) => (points >= badge.minPoints ? i : found),
    0,
  );
  return RANK_BADGES[index];
}

/** The badge one level up, or `null` at the top. Drives the "next rank" line. */
export function nextRank(level: number): RankBadge | null {
  return RANK_BADGES.find((badge) => badge.level > level) ?? null;
}

/** Unlocked means earned, not selected. Locked badges are shown greyed, never hidden. */
export function isRankUnlocked(rank: number, level: number): boolean {
  return rank <= Math.floor(level);
}
