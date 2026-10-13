"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * The level ring — one implementation, used everywhere a level is shown as a circle.
 *
 * There used to be two. The marketing hero drew a three-stop lime-to-green arc with an inner bloom, a
 * soft drop-shadow and a bold tracked "LEVEL" label; the console profile drew a two-stop version of the
 * same idea with no depth, a thinner label in a muted token colour and a heavier stroke. Side by side
 * on the profile — where the ring sits in a row of stats — the second read as *flat*: the same product,
 * two different qualities of the same component, which is exactly what a shared component prevents.
 *
 * This is the hero's design, because that is the one that looked right, and both callers now render it:
 * the hero card at 80–132px and the profile header at 64px. The only thing that varies is `size`;
 * every colour, stop, weight and shadow below is fixed.
 *
 * The design, in plain terms: a warm yellow → lime → deep green gradient arc, round caps, an 8%
 * stroke, a faint yellow bloom behind the number so the bore is not dead flat, and one 3px glow on the
 * arc itself. The restraint is deliberate — enough depth to read as a lit ring, not enough to look
 * like a neon sign.
 *
 * Geometry lives in a 100×100 viewBox so everything scales from the single `size` prop, including the
 * type: a fixed 9px label would be illegible at 64px and lost at 132px.
 *
 * The arc is decoration — the level sits in the middle as real text and the sentence beneath the ring
 * says the same thing in words — so the values live on `role="progressbar"`, where a screen reader
 * reads them once, properly, instead of on an unlabelled `svg`.
 */
const RING_VIEW = 100;
/** 8 units of 100 — the hero's weight. Thicker than this and the arc crowds the numeral. */
const RING_STROKE = 8;
const RING_RADIUS = (RING_VIEW - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function LevelRing({
  level,
  progress,
  size = 96,
  className,
}: {
  level: number;
  /** 0–1. */
  progress: number;
  size?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const gradientId = React.useId();
  const discId = React.useId();
  const clamped = Math.max(0, Math.min(1, progress));
  const percent = Math.round(clamped * 100);
  const offset = RING_CIRCUMFERENCE * (1 - clamped);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`Level ${level}, ${percent}% of the way to Level ${level + 1}`}
      aria-label="Progress to next level"
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox={`0 0 ${RING_VIEW} ${RING_VIEW}`}
        aria-hidden="true"
        focusable="false"
        className="size-full"
      >
        <defs>
          {/* Brand ramp: warm yellow into lime into a deep green end, so the arc has somewhere to
              travel and does not read as one flat tint. */}
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffe70e" />
            <stop offset="60%" stopColor="#bdfe00" />
            <stop offset="100%" stopColor="#7ab200" />
          </linearGradient>
          {/* Faint inner bloom, so the plate behind the number is not dead flat. */}
          <radialGradient id={discId} cx="50%" cy="32%" r="72%">
            <stop offset="0%" stopColor="rgba(255,231,14,0.16)" />
            <stop offset="100%" stopColor="rgba(255,231,14,0)" />
          </radialGradient>
        </defs>

        <circle cx={50} cy={50} r={RING_RADIUS - RING_STROKE / 2} fill={`url(#${discId})`} />
        <circle
          cx={50}
          cy={50}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          className="stroke-white/10"
        />
        <motion.circle
          cx={50}
          cy={50}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          stroke={`url(#${gradientId})`}
          transform="rotate(-90 50 50)"
          strokeDasharray={RING_CIRCUMFERENCE}
          /*
            The initial value is sent to the browser as an attribute, so it must not depend on
            `useReducedMotion()` — that resolves differently on the server and the client and React
            reports a hydration mismatch it will not patch up. Reduced motion shortens the transition
            to zero instead, which lands on the same final value without animating toward it.
          */
          initial={{ strokeDashoffset: RING_CIRCUMFERENCE }}
          animate={{ strokeDashoffset: offset }}
          transition={
            reduce
              ? { duration: 0 }
              : { duration: 1.1, delay: 0.25, ease: [0.22, 0.61, 0.36, 0.98] }
          }
          style={{ filter: "drop-shadow(0 0 3px rgba(255,231,14,0.4))" }}
        />
      </svg>

      {/* Inner text scales with `size`: the ring is used at 64px in the profile stats row, where a
          fixed 32px numeral would not fit inside the bore. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span
          className="font-bold uppercase tracking-[0.18em] text-white/50"
          style={{ fontSize: Math.max(7, Math.round(size * 0.085)) }}
        >
          Level
        </span>
        <span
          className="font-bold tabular-nums text-white"
          style={{ fontSize: Math.round(size * 0.3), marginTop: Math.round(size * 0.04) }}
        >
          {level}
        </span>
      </div>
    </div>
  );
}
