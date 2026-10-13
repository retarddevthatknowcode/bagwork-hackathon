"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { Lock } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  RANK_BADGES,
  isRankUnlocked,
  nextRank,
  rankFromLevel,
  type RankBadge,
} from "@/lib/profile/badges";
import { formatPoints } from "@/lib/profile/points";
import { cn } from "@/lib/utils";

/**
 * The rank rack: all six badges, always all six.
 *
 * The point of showing the locked ones is that they are a ladder, not a trophy case. Hiding the
 * badges a profile has not reached would turn progression into a surprise; showing them greyed
 * with the number that unlocks each one is what makes the next step legible.
 *
 * Everything here is derived from `level` and `points`, which the server already sends. Nothing
 * is stored, nothing is fetched, and there is no second source of truth to get out of step.
 */

/** One badge, drawn at whatever size the caller asks for. */
export function RankBadgeArt({
  badge,
  unlocked,
  size = 56,
  className,
}: {
  badge: RankBadge;
  unlocked: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={badge.src}
      alt=""
      width={size}
      height={size}
      // Decorative: the badge's name and state are always rendered as text beside it.
      aria-hidden="true"
      draggable={false}
      className={cn(
        "object-contain transition-[filter,opacity] duration-300 motion-reduce:transition-none",
        unlocked ? "opacity-100" : "opacity-30 grayscale",
        className,
      )}
    />
  );
}

export function RankBadgeRail({
  level,
  points,
  className,
}: {
  level: number;
  points: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const current = rankFromLevel(level);
  const upcoming = nextRank(level);
  /** Whole points still owed for the next badge. Never negative, even if the two disagree. */
  const remaining = upcoming ? Math.max(0, upcoming.minPoints - points) : 0;

  return (
    <Card className={cn("gap-0 py-0", className)}>
      <div className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Rank
            </span>
            <span className="font-display truncate text-base font-semibold text-foreground">
              {current.name}
            </span>
            <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
              Level {current.level}
            </span>
          </div>

          <p className="text-xs tabular-nums text-muted-foreground">
            {upcoming ? (
              <>
                <span className="font-semibold text-foreground">
                  {formatPoints(remaining)}
                </span>
                {" points to "}
                <span className="font-semibold text-foreground">{upcoming.name}</span>
              </>
            ) : (
              <>Top rank reached</>
            )}
          </p>
        </div>

        <ol className="mt-5 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-6 sm:gap-x-2">
          {RANK_BADGES.map((badge, index) => {
            const unlocked = isRankUnlocked(badge.rank, level);
            const isCurrent = badge.rank === current.rank;
            return (
              <li
                key={badge.rank}
                // The current badge is announced as such, so the state is not carried by colour alone.
                aria-current={isCurrent ? "true" : undefined}
                title={
                  unlocked
                    ? `${badge.name} — unlocked at ${formatPoints(badge.minPoints)} points`
                    : `${badge.name} — locked until ${formatPoints(badge.minPoints)} points`
                }
                className="flex min-w-0 flex-col items-center gap-1.5 text-center"
              >
                {/*
                  One fixed box for all six.

                  The badges are the same size, so the labels beneath them start at the same
                  height. The old version gave the current badge a larger wrapper (and a border,
                  and a dashed border when locked), which both fought the artwork's own outline
                  and pushed one label out of line with the other five.

                  The current badge is marked by a soft glow and a small scale instead — a
                  transform, so it costs the layout nothing.
                */}
                <div className="flex size-16 items-center justify-center">
                  <motion.div
                    initial={reduce ? false : { opacity: 0, scale: 0.86 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true, amount: 0.6 }}
                    transition={
                      reduce
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 320, damping: 26, delay: index * 0.04 }
                    }
                    className="flex size-full items-center justify-center"
                  >
                    <RankBadgeArt
                      badge={badge}
                      unlocked={unlocked}
                      size={64}
                      className={cn(
                        "size-full transition-transform duration-300 motion-reduce:transition-none",
                        isCurrent && unlocked
                          ? "scale-105 drop-shadow-[0_0_12px_rgba(255,231,14,0.35)]"
                          : null,
                      )}
                    />
                  </motion.div>
                </div>

                <span
                  className={cn(
                    // Fixed height, so all six labels sit on one baseline whether or not the
                    // locked ones carry a lock glyph.
                    "flex h-4 items-center justify-center gap-1 text-[11px] leading-none",
                    unlocked
                      ? isCurrent
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground"
                      : "text-muted-foreground/60",
                  )}
                >
                  {unlocked ? null : <Lock aria-hidden="true" className="size-2.5 shrink-0" />}
                  {badge.name}
                </span>

                {/* The number that unlocks it, said out loud rather than only in a tooltip —
                    a locked badge should explain itself without a hover. */}
                <span className="text-[10px] leading-none tabular-nums text-muted-foreground/50">
                  {formatPoints(badge.minPoints)}
                </span>

                {/* The state and the requirement, for anyone who cannot read the greyscale. */}
                <span className="sr-only">
                  {unlocked
                    ? `Unlocked at ${formatPoints(badge.minPoints)} points.`
                    : `Locked. Unlocks at ${formatPoints(badge.minPoints)} points.`}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}
