"use client";

import * as React from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { ArrowRight, BadgeCheck, Coins, Lock, X } from "lucide-react";

import { AnimatedCounter } from "@/components/bagwork/animated-counter";
import { LEVEL_THRESHOLDS, POINTS_PER_DOLLAR } from "@/lib/profile/points";

/**
 * Diagram — Points and Levels (section 11, part 1).
 *
 * Three beats, top to bottom:
 *   1. the conversion: approved earnings (dollars) → points, with the points counter running
 *      up as chips cross the arrow;
 *   2. the ladder: the thresholds with their exact totals, bars animating in on scroll;
 *   3. the rule: the three things that can never add points, struck through behind a lock.
 *
 * Every number is read from `lib/profile/points.ts`, so the docs cannot promise a rate the
 * server does not pay.
 *
 * Motion constraints: only `opacity` and `transform` animate, the chips are one loop that
 * stops as soon as the diagram leaves the viewport, and reduced motion gets the settled state
 * (full counter, filled bars, no loop).
 */

/** The worked example: one approved payout. */
const EXAMPLE_EARNINGS = 120;
const EXAMPLE_POINTS = EXAMPLE_EARNINGS * POINTS_PER_DOLLAR;

/**
 * The thresholds, as exact numbers with a relative bar.
 *
 * Bar width uses a square root of the threshold: the curve is deliberately compressed, because
 * a linear scale would make Levels 2 and 3 invisible next to Level 6's 500,000. The caption
 * says so rather than implying the bars are proportional.
 */
function ladderWidth(points: number) {
  const max = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1].minPoints;
  if (points <= 0) return 0;
  return Math.max(5, Math.round(Math.pow(points / max, 0.5) * 100));
}

function LevelLadder({ reduce }: { reduce: boolean }) {
  // Highest level first, so the block reads as a summit rather than a starting list.
  const rows = [...LEVEL_THRESHOLDS].reverse();

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
          Level thresholds
        </span>
        <span className="text-[10px] uppercase tracking-wider text-white/30">
          bar width is relative, not to scale
        </span>
      </div>

      <div className="mt-2.5 space-y-1.5">
        {rows.map((row, index) => (
          <div key={row.level} className="flex items-center gap-2.5">
            <span className="w-8 shrink-0 text-[10px] font-bold uppercase tracking-wider text-white/45">
              Lv {row.level}
            </span>
            <span className="w-[4.5rem] shrink-0 text-right text-[11px] font-bold tabular-nums text-white">
              {row.minPoints.toLocaleString("en-US")}
            </span>
            <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 origin-left rounded-full bg-gradient-to-r from-[#ffe70e] to-[#bdfe00]"
                style={{ width: `${ladderWidth(row.minPoints)}%` }}
                initial={reduce ? false : { scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{
                  duration: 0.5,
                  ease: [0.22, 0.61, 0.36, 0.98],
                  delay: index * 0.06,
                }}
              />
            </span>
          </div>
        ))}
      </div>

      <p className="mt-2.5 text-[10px] leading-relaxed text-white/40">
        Soft thresholds — status only. No bag, campaign or payout is ever blocked by a level.
      </p>
    </div>
  );
}

/** Things that must never add points — stated as plainly as the rule itself. */
const CANNOT_EARN = [
  "A submission that is pending or in review",
  "A submission that was rejected",
  "A manual adjustment, an admin edit, or a purchase",
];

export function DiagramPointsLevels() {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });

  return (
    <div
      ref={ref}
      className="docs-mono rounded-xl border border-white/10 bg-[#17140e] p-4 sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#ffe70e]/70">
          Points, Levels &amp; Profile Value
        </span>
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40">
          <span className="h-1.5 w-1.5 rounded-full bg-[#bdfe00] pulse-dot" />
          1 approved payout
        </span>
      </div>

      {/* 1 — the conversion */}
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="min-w-0 flex-1 rounded-lg border border-[#bdfe00]/20 bg-black/40 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50">
            <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5 text-[#bdfe00]" />
            Approved earnings
          </div>
          <div className="mt-1 text-lg font-bold tabular-nums text-white sm:text-xl">
            ${EXAMPLE_EARNINGS.toLocaleString("en-US")}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-white/40">
            paid on-chain
          </div>
        </div>

        <div className="relative flex shrink-0 items-center justify-center">
          <ArrowRight aria-hidden="true" className="h-4 w-4 text-white/30" />
          {/* point chips crossing the arrow, paused off screen */}
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              aria-hidden="true"
              className="absolute h-1.5 w-1.5 rounded-full bg-[#ffe70e]"
              style={{ boxShadow: "0 0 6px rgba(255,231,14,0.7)" }}
              animate={
                inView && !reduce
                  ? { x: [-16, 18], opacity: [0, 1, 0] }
                  : { opacity: 0 }
              }
              transition={{
                duration: 1.1,
                delay: i * 0.28,
                repeat: Infinity,
                repeatDelay: 0.5,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>

        <div className="min-w-0 flex-1 rounded-lg border border-[#ffe70e]/25 bg-black/40 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50">
            <Coins aria-hidden="true" className="h-3.5 w-3.5 text-[#ffe70e]" />
            Points added
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span
              className="text-lg font-bold tabular-nums text-[#ffe70e] sm:text-xl"
              aria-label={`${EXAMPLE_POINTS} points`}
            >
              <AnimatedCounter value={EXAMPLE_POINTS} duration={1100} />
            </span>
            <span className="text-[10px] uppercase tracking-wider text-white/40">pts</span>
          </div>
          <div className="text-[10px] uppercase tracking-wider text-white/40">
            ${1} × {POINTS_PER_DOLLAR} points
          </div>
        </div>
      </div>

      {/* 2 — the ladder */}
      <LevelLadder reduce={Boolean(reduce)} />

      {/* 3 — the rule */}
      <div className="mt-4 rounded-lg border border-[#ff6b35]/20 bg-black/40 p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#ff6b35]">
          <Lock aria-hidden="true" className="h-3.5 w-3.5" />
          Never adds points
        </div>
        <ul className="mt-2 space-y-1.5">
          {CANNOT_EARN.map((item) => (
            <li key={item} className="flex items-start gap-2 text-[11px] text-white/60">
              <X aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-[#ff6b35]" />
              <span className="line-through decoration-[#ff6b35]/60">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
