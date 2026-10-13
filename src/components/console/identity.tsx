"use client";

import * as React from "react";

import { NpcAvatar } from "@/components/console/npc-avatar";
import { LevelRing } from "@/components/shared/level-ring";
import { findAvatar } from "@/lib/profile/avatars";
import {
  formatBagworkerNumber,
  formatPoints,
  pointsToNextLevelLabel,
  type LevelProgress as LevelProgressValue,
} from "@/lib/profile/points";
import {
  characterFromSeed,
  renderCharacter,
  type CharacterConfig,
} from "@/lib/profile/character";
import { cn } from "@/lib/utils";

/**
 * The three pieces of a Bagworker's public identity: the pixel character, the permanent
 * Bagworker# number, and the level ring.
 *
 * They live together because they always appear together, and because every surface that
 * shows a person (profile, top-bar menu, sidebar, onboarding) must agree about how. Drawing
 * the character from one component means the 24px version and the 160px version are the same
 * person, not two renders that drift apart.
 */

/* ------------------------------------------------------------- the character */

/** A built character, drawn as flat rects. Decorative — the name is always beside it. */
function CharacterAvatarBase({
  character,
  className,
}: {
  character: CharacterConfig;
  className?: string;
}) {
  const { size, background, parts } = React.useMemo(
    () => renderCharacter(character),
    [character],
  );

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      className={cn("size-8 shrink-0 bg-muted", className)}
    >
      <rect x={0} y={0} width={size} height={size} fill={background} />
      {parts.map((part) => (
        <rect
          key={`${part.x}-${part.y}`}
          x={part.x}
          y={part.y}
          width={1}
          height={1}
          fill={part.fill}
        />
      ))}
    </svg>
  );
}

/**
 * Compared field by field, not by reference.
 *
 * The builder renders one preview per option, and every option preview is built by spreading
 * the current character — so a new object arrives on every click even when six of the seven
 * fields are identical. Without this comparator, tuning your hair would re-render all
 * nineteen previews (~4,000 rects) instead of the seven that actually changed.
 */
function sameCharacter(
  previous: { character: CharacterConfig; className?: string },
  next: { character: CharacterConfig; className?: string },
) {
  if (previous.className !== next.className) return false;
  const a = previous.character;
  const b = next.character;
  return (
    a.skin === b.skin &&
    a.hair === b.hair &&
    a.hairColor === b.hairColor &&
    a.eyes === b.eyes &&
    a.accessory === b.accessory &&
    a.top === b.top &&
    a.background === b.background
  );
}

export const CharacterAvatar = React.memo(CharacterAvatarBase, sameCharacter);

/**
 * The signed-in user's avatar, from whichever source their account has.
 *
 * Three cases, in order: a character they built; a legacy `NPC_AVATARS` pick; otherwise a
 * character derived from their Bagworker number. That last case is why an account created
 * before the builder existed still has a face instead of an empty grey square — and it is
 * stable, because the seed is the number.
 */
export function ProfileAvatar({
  character,
  avatarId,
  profileNumber,
  className,
}: {
  character?: CharacterConfig | null;
  avatarId?: string | null;
  profileNumber?: number | null;
  className?: string;
}) {
  if (character) return <CharacterAvatar character={character} className={className} />;
  if (findAvatar(avatarId)) return <NpcAvatar id={avatarId} className={className} />;
  return (
    <CharacterAvatar character={characterFromSeed(profileNumber ?? 0)} className={className} />
  );
}

/* ---------------------------------------------------------------- level ring */

/*
 * The ring is `@/components/shared/level-ring`: the hero card's design, shared, so the profile
 * header renders exactly what the marketing hero renders. It used to live here as a second,
 * flatter implementation of the same idea.
 */

/**
 * The ring with its caption directly underneath — "X points to Level Y".
 *
 * Kept together so that sentence is always produced by `pointsToNextLevelLabel`, which reads
 * the same thresholds the server awards points on. The caption sits under the ring rather
 * than beside it because that is where the eye looks for it.
 */
export function LevelProgress({
  progress,
  ringSize = 96,
  className,
}: {
  progress: LevelProgressValue;
  ringSize?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <LevelRing level={progress.level} progress={progress.progress} size={ringSize} />
      <p className="text-center text-xs font-medium tabular-nums text-muted-foreground">
        {pointsToNextLevelLabel(progress)}
      </p>
    </div>
  );
}

/** Re-exported so callers do not have to reach into `lib` just for the copy. */
export { formatPoints };


/**
 * `Bagworker#3578`.
 *
 * One format, one component: this number survives a handle change and (later) a change of
 * owner, so it is never assembled inline at a call site.
 */
export function BagworkerTag({
  number,
  className,
}: {
  number: number | null | undefined;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-brand/30 bg-brand/10 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums tracking-tight text-brand",
        className,
      )}
    >
      {formatBagworkerNumber(number)}
    </span>
  );
}
