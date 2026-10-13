/**
 * Feature requests — the board's rules, in one place.
 *
 * Pure module: no React, no Prisma, no `next/*`. The route that writes a request, the page that
 * renders the composer and anything that needs to explain the gate read the same limits from here,
 * so the form cannot offer something the API would refuse, and the "locked" copy cannot disagree
 * with the level that actually unlocks it.
 *
 * The gate is the interesting part. Until now levels were explicitly status only — "no campaign is
 * blocked by a level" (see `lib/profile/points.ts`). Posting to this board is the first thing in the
 * product that a level *does* unlock, so it is declared here, once, rather than as a number written
 * into a route: `FEATURE_REQUEST_MIN_LEVEL` is the whole rule, and everything that needs to explain
 * it derives from it.
 */

import { LEVEL_THRESHOLDS } from "@/lib/profile/points";

/**
 * Posting unlocks at this level.
 *
 * "Above Level 3" — so 4. The composer is locked for anyone whose level is below this, and the copy
 * explaining that is generated from the number.
 */
export const FEATURE_REQUEST_MIN_LEVEL = 4;

/**
 * The points behind that level.
 *
 * Looked up in `LEVEL_THRESHOLDS` rather than restated, so moving a threshold moves the gate and
 * the sentence describing it together. The fallback exists only so the type is a `number`: it cannot
 * be reached while `FEATURE_REQUEST_MIN_LEVEL` names a level in the table, and `0` fails *open*
 * (everyone can post) rather than closed — the safe direction when a write path's gate breaks is
 * that nobody is blocked by a bug, since the endpoint still authenticates and validates.
 */
export const FEATURE_REQUEST_MIN_POINTS =
  LEVEL_THRESHOLDS.find((threshold) => threshold.level === FEATURE_REQUEST_MIN_LEVEL)
    ?.minPoints ?? 0;

/* --------------------------------------------------------------- what a good request is */

/**
 * The length caps, and the floors that stop a one-word "app is bad" from becoming an entry.
 *
 * Both ends matter. The caps keep a paste-bombed essay out of the board — the columns are
 * unbounded `TEXT`, so the route is the only thing standing between a client and a megabyte of
 * body — and the floors are what keep the board worth reading: a title has to say what the feature
 * is, and the detail has to say why.
 */
export const FEATURE_TITLE_MIN = 6;
export const FEATURE_TITLE_MAX = 90;
export const FEATURE_DETAILS_MIN = 20;
export const FEATURE_DETAILS_MAX = 600;

/* --------------------------------------------------------------------------- status */

/** Where an idea has got to. A fixed set, because the badge and the filter both switch on it. */
export const FEATURE_STATUSES = ["OPEN", "PLANNED", "DONE"] as const;

export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

/** The words people read, kept apart from the stored values so storage can change freely. */
export const FEATURE_STATUS_LABELS: Record<FeatureStatus, string> = {
  OPEN: "Open",
  PLANNED: "Planned",
  DONE: "Done",
};

/** Narrows a value read out of the database. Anything unrecognised is `null`, never a guess. */
export function toFeatureStatus(value: unknown): FeatureStatus | null {
  return typeof value === "string" && (FEATURE_STATUSES as readonly string[]).includes(value)
    ? (value as FeatureStatus)
    : null;
}

/** The label for a stored status, with a safe reading for a row written by an older build. */
export function featureStatusLabel(value: unknown): string {
  const status = toFeatureStatus(value);
  return status ? FEATURE_STATUS_LABELS[status] : "Open";
}

/** Which way the board is ordered. Both orderings happen server-side; the client only picks one. */
export const FEATURE_SORTS = ["top", "new"] as const;
export type FeatureSort = (typeof FEATURE_SORTS)[number];

/** Narrows a `?sort=` value, defaulting to the board's own point — most upvoted first. */
export function toFeatureSort(value: unknown): FeatureSort {
  return value === "new" ? "new" : "top";
}

/* -------------------------------------------------------------------------- validation */

export interface FeatureDraft {
  title: string;
  details: string;
}

/** Field-keyed problems, so the composer can put each message under its own input. */
export type FeatureDraftErrors = Partial<Record<keyof FeatureDraft, string>>;

export type FeatureDraftResult =
  | { ok: true; value: FeatureDraft }
  | { ok: false; errors: FeatureDraftErrors };

/**
 * C0/C1 control characters. Invisible, never typed on purpose, and they break copy-paste.
 *
 * Two patterns rather than one with a flag: `details` is allowed to contain newlines (people write
 * lists in there), so `\n` is carved out of the range for that field. Written as two literals
 * because a regex object carries `lastIndex` state and mutating one to "remove the newline" was
 * silently doing nothing — the source string contains the escape sequence `\u000a`, not a newline.
 */
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;
const CONTROL_CHARS_KEEPING_NEWLINES = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g;

/**
 * Validates and normalises a submitted draft.
 *
 * Normalisation is part of validation rather than a separate step, because a title that is only
 * valid after trimming and collapsing runs of whitespace has to be *stored* that way too —
 * otherwise the board fills up with titles padded by five blank lines and every consumer has to
 * defend itself a second time.
 *
 * Newlines survive in `details`, but runs of three or more collapse to two, so a six-newline gap
 * cannot be used to stretch one entry down the whole page.
 *
 * Nothing here escapes or strips markup. The text is stored as plain text and React escapes it on
 * render; this function's only job is length and shape.
 */
export function validateFeatureDraft(input: {
  title?: unknown;
  details?: unknown;
}): FeatureDraftResult {
  const errors: FeatureDraftErrors = {};

  const title = String(input.title ?? "")
    .replace(CONTROL_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();

  const details = String(input.details ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS_KEEPING_NEWLINES, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!title) {
    errors.title = "Give the idea a title.";
  } else if (title.length < FEATURE_TITLE_MIN) {
    errors.title = `Titles need at least ${FEATURE_TITLE_MIN} characters — say what the feature is.`;
  } else if (title.length > FEATURE_TITLE_MAX) {
    errors.title = `Titles are capped at ${FEATURE_TITLE_MAX} characters.`;
  }

  if (!details) {
    errors.details = "Add a little detail so people know what they are voting for.";
  } else if (details.length < FEATURE_DETAILS_MIN) {
    errors.details = `Add at least ${FEATURE_DETAILS_MIN} characters — what problem does this solve?`;
  } else if (details.length > FEATURE_DETAILS_MAX) {
    errors.details = `Details are capped at ${FEATURE_DETAILS_MAX} characters.`;
  }

  if (errors.title || errors.details) return { ok: false, errors };
  return { ok: true, value: { title, details } };
}

/* ------------------------------------------------------------------------- the level gate */

export interface FeatureGate {
  canPost: boolean;
  /** Why not — `null` once posting is unlocked. */
  message: string | null;
}

/**
 * Whether an account at `level` may post.
 *
 * The message names the level rather than saying "not unlocked yet", because the number is the
 * whole answer: the profile page and the sidebar both show the same level, so "Reach Level 4" is
 * something the reader can go and act on.
 */
export function featureGateFor(level: number): FeatureGate {
  const safeLevel = Number.isFinite(level) && level > 0 ? Math.floor(level) : 1;
  if (safeLevel >= FEATURE_REQUEST_MIN_LEVEL) {
    return { canPost: true, message: null };
  }
  return {
    canPost: false,
    message: `Reach Level ${FEATURE_REQUEST_MIN_LEVEL} to post feature requests`,
  };
}

/**
 * The same gate, phrased for the composer's locked state, where there is room to be encouraging.
 *
 * Split from `featureGateFor` on purpose: the short form above is what the API returns as an error,
 * so it stays one line and matches the product copy exactly. This one adds the "you can still vote"
 * half, because an API error would never need to say it.
 */
export function featureLockedBlurb(): string {
  return `Posting opens at Level ${FEATURE_REQUEST_MIN_LEVEL}. Until then you can still read the board and upvote anything you want built — the vote is what moves an idea up it.`;
}

/* ------------------------------------------------------- what crosses the wire */

/** Who filed a request. Enough to be accountable, not enough to be a profile page. */
export interface FeatureAuthorView {
  handle: string | null;
  profileNumber: number;
  level: number;
}

export interface FeatureRequestView {
  id: string;
  title: string;
  details: string;
  upvotes: number;
  status: FeatureStatus;
  /** ISO string — this crosses the wire, so dates are not `Date` objects. */
  createdAt: string;
  author: FeatureAuthorView | null;
  /** Whether the *requesting* account has voted on this one. */
  hasVoted: boolean;
  /** Whether the requesting account wrote it. */
  isMine: boolean;
}

export interface FeatureBoardViewer {
  /** `null` when signed out — the board is readable, voting is not. */
  level: number | null;
  canPost: boolean;
  /** Why posting is locked, or `null` when it is not. */
  message: string | null;
}

export interface FeatureBoardPayload {
  requests: FeatureRequestView[];
  viewer: FeatureBoardViewer;
  summary: {
    total: number;
    open: number;
    planned: number;
    done: number;
    /** How many of the listed requests this account has voted on. */
    yourVotes: number;
  };
}


