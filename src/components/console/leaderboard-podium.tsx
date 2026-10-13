"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "framer-motion";

import { BagworkerTag, ProfileAvatar, formatPoints } from "@/components/console/identity";
import type { LeaderboardEntry } from "@/lib/console/hooks";
import { bagworkerHref } from "@/lib/profile/href";
import { cn } from "@/lib/utils";

/**
 * The top three, as a podium.
 *
 * This is the one screen in the console that is allowed to be loud: three medal finishes, a
 * crown each, and the winner standing taller than the rest. Everything below the podium stays
 * quiet so the hierarchy reads instantly.
 *
 * The medal is never carried by colour alone — each card prints its own place and finish
 * ("1st · Gold"), so the crowns are decoration and are `aria-hidden` rather than a second
 * thing to announce.
 */

type Place = 1 | 2 | 3;

interface Medal {
  label: string;
  /** Crown gradient, light to dark. */
  from: string;
  via: string;
  to: string;
  /** Text/tint colour that clears AA on the dark console background. */
  text: string;
  /** Avatar ring gradient. */
  ring: string;
  /** Ambient glow behind the card. */
  glow: string;
  /**
   * The card's hairline.
   *
   * Painted by an overlay with an inline `border-color` on purpose: `globals.css` sets
   * `* { border-color: var(--border) }` outside any `@layer`, so it outranks every `border-*`
   * utility in the console theme. Inline styles are the only thing that still wins.
   */
  border: string;
  ordinal: string;
}

const MEDALS: Record<Place, Medal> = {
  1: {
    label: "Gold",
    from: "#fff6b8",
    via: "#ffe70e",
    to: "#c08e05",
    text: "#ffe70e",
    ring: "linear-gradient(150deg, #fff6b8, #ffe70e 45%, #c08e05)",
    glow: "rgba(255, 231, 14, 0.22)",
    border: "rgba(255, 231, 14, 0.45)",
    ordinal: "1st",
  },
  2: {
    label: "Silver",
    from: "#ffffff",
    via: "#dde3e8",
    to: "#8a949f",
    text: "#dde3e8",
    ring: "linear-gradient(150deg, #ffffff, #dde3e8 45%, #8a949f)",
    glow: "rgba(221, 227, 232, 0.14)",
    border: "rgba(221, 227, 232, 0.3)",
    ordinal: "2nd",
  },
  3: {
    label: "Bronze",
    from: "#ffdcb8",
    via: "#dda173",
    to: "#8a4f22",
    text: "#e0a06a",
    ring: "linear-gradient(150deg, #ffdcb8, #dda173 45%, #8a4f22)",
    glow: "rgba(221, 161, 115, 0.15)",
    border: "rgba(221, 161, 115, 0.35)",
    ordinal: "3rd",
  },
};

const CROWN_BODY = "M2.6 6.4 L7 10.6 L12 3.4 L17 10.6 L21.4 6.4 L19.4 17 L4.6 17 Z";

/** A crowned silhouette in one of three metal finishes. */
function Crown({ place, className }: { place: Place; className?: string }) {
  const medal = MEDALS[place];
  const uid = React.useId();

  return (
    <svg
      viewBox="0 0 24 20"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id={`${uid}-metal`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor={medal.from} />
          <stop offset="45%" stopColor={medal.via} />
          <stop offset="100%" stopColor={medal.to} />
        </linearGradient>
        <linearGradient id={`${uid}-shine`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <path
        d={CROWN_BODY}
        fill={`url(#${uid}-metal)`}
        stroke={medal.to}
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
      {/* the same silhouette again, filled with a diagonal sheen */}
      <path d={CROWN_BODY} fill={`url(#${uid}-shine)`} />
      <rect
        x="4.6"
        y="16.4"
        width="14.8"
        height="3.4"
        rx="1.2"
        fill={`url(#${uid}-metal)`}
        stroke={medal.to}
        strokeWidth="0.7"
      />

      {/* gems on the five points */}
      <circle cx="12" cy="3.5" r="1.7" fill={medal.from} />
      <circle cx="2.6" cy="6.1" r="1.3" fill={medal.from} />
      <circle cx="21.4" cy="6.1" r="1.3" fill={medal.from} />
      <circle cx="7" cy="10.2" r="1.1" fill={medal.from} />
      <circle cx="17" cy="10.2" r="1.1" fill={medal.from} />
      {/* and three set into the band */}
      <circle cx="9" cy="18.1" r="0.9" fill={medal.from} />
      <circle cx="12" cy="18.1" r="1.1" fill={medal.from} />
      <circle cx="15" cy="18.1" r="0.9" fill={medal.from} />
    </svg>
  );
}

/* --------------------------------------------------------------- the cards */

/**
 * Reveal choreography: the runner-up and third arrive first, the winner lands last.
 *
 * 80ms per step and nothing but `opacity`/`transform`, so the whole sequence is under half a
 * second and stays on the compositor. Reduced motion drops the offsets entirely.
 */
const podiumParent: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
};

const podiumCard: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.22, 0.61, 0.36, 0.98] } },
};

function PodiumCard({
  entry,
  place,
  rangeCaption,
  reduce,
}: {
  entry: LeaderboardEntry;
  place: Place;
  /** "this week" / "all time" — clarifies which points total the card is showing. */
  rangeCaption: string;
  reduce: boolean;
}) {
  const medal = MEDALS[place];
  const name =
    entry.displayName?.trim() || (entry.handle ? `@${entry.handle}` : "Bagworker");
  const winner = place === 1;

  return (
    <motion.li
      variants={podiumCard}
      initial={reduce ? false : undefined}
      className={cn(
        "group relative flex flex-col items-center overflow-hidden rounded-2xl bg-card/70 px-4 pt-6 text-center",
        // Transform only — nothing here reflows, and the hairline and ambient wash both brighten
        // through `group-hover`, so a hover reads as one physical object.
        "transition-transform duration-200 ease-out hover:-translate-y-1",
        winner ? "pb-6 lg:order-2 lg:pb-9" : "pb-5 lg:order-1 lg:pb-6",
        place === 3 && "lg:order-3",
      )}
      style={{
        // `borderColor: transparent` cancels the forced `* { border-color: var(--border) }`; the
        // medal hairline is the overlay below.
        borderColor: "transparent",
        borderWidth: 1,
        borderStyle: "solid",
        boxShadow: `0 20px 48px -30px ${medal.glow}`,
      }}
    >
      {/* The medal hairline, over the top of the card's own edge. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-2xl border opacity-70 transition-opacity duration-200 group-hover:opacity-100"
        style={{ borderColor: medal.border }}
      />
      {/* Ambient wash plus a hairline of metal across the top — the whole "premium" cue, with
          no blur filters and nothing animating but opacity. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 left-1/2 size-64 -translate-x-1/2 rounded-full opacity-70 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `radial-gradient(circle, ${medal.glow} 0%, transparent 70%)` }}
      />
      <span
        aria-hidden="true"
        className="absolute inset-x-8 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${medal.via}, transparent)` }}
      />

      <div className="relative flex w-full flex-col items-center gap-3">
        <Crown place={place} className={winner ? "size-11" : "size-8"} />

        {/* Metallic ring: a padded gradient frame with the character clipped inside it. Wrapped in
            the profile link so the avatar is clickable; the name underneath is the link a keyboard
            user reaches, so this one stays out of the tab order and out of the a11y tree. */}
        <Link href={bagworkerHref(entry)} tabIndex={-1} aria-hidden="true">
          <span className="block rounded-2xl p-[3px]" style={{ backgroundImage: medal.ring }}>
            <ProfileAvatar
              character={entry.character}
              avatarId={entry.avatarId}
              profileNumber={entry.profileNumber}
              className={cn("block rounded-[13px]", winner ? "size-24" : "size-20")}
            />
          </span>
        </Link>

        <div className="w-full space-y-1.5">
          <p
            className="flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: medal.text }}
          >
            <span className="tabular-nums">{medal.ordinal}</span>
            <span aria-hidden="true">·</span>
            <span>{medal.label}</span>
          </p>

          <h3 className="text-base font-semibold text-foreground">
            <Link
              href={bagworkerHref(entry)}
              className="block truncate rounded-sm underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {name}
            </Link>
          </h3>

          <div className="flex justify-center">
            <BagworkerTag number={entry.profileNumber} className="text-[10px]" />
          </div>
        </div>

        <div className="grid w-full grid-cols-2 divide-x divide-border/60 border-t border-border/60 pt-3">
          <div className="min-w-0 px-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Points
            </p>
            <p
              className={cn(
                "font-mono font-bold tabular-nums text-foreground",
                winner ? "text-2xl" : "text-xl",
              )}
            >
              {formatPoints(entry.points)}
            </p>
          </div>
          <div className="min-w-0 px-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Level
            </p>
            <p
              className={cn(
                "font-mono font-bold tabular-nums text-foreground",
                winner ? "text-2xl" : "text-xl",
              )}
            >
              {entry.level}
            </p>
          </div>
        </div>

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {entry.settled} settled {entry.settled === 1 ? "payout" : "payouts"} {rangeCaption}
        </p>
      </div>
    </motion.li>
  );
}

/* --------------------------------------------------------------- the podium */

export function LeaderboardPodium({
  entries,
  rangeCaption,
  className,
}: {
  /** Ranks 1–3, in order. Fewer than three is fine — the podium shrinks. */
  entries: LeaderboardEntry[];
  rangeCaption: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const headingId = React.useId();
  const places = entries.slice(0, 3);

  if (places.length === 0) return null;

  return (
    // The cards are `h3`, so the podium needs its own `h2` to keep the page outline in order
    // (h1 Leaderboard → h2 Top three → h3 names → h2 Ranks 4 and up). It is visually redundant —
    // the podium *is* the heading — so it is only there for assistive tech.
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="sr-only">
        Top three Bagworkers
      </h2>

      <motion.ol
        variants={podiumParent}
        initial={reduce ? false : "hidden"}
        animate="visible"
        className={cn(
          // DOM order is 1st → 2nd → 3rd, so the ranking reads in order on mobile and for a
          // screen reader, while the desktop grid rearranges it to the classic 2-1-3. The
          // winner stands taller (bigger crown and avatar, deeper base) and widens the line.
          "grid list-none grid-cols-1 gap-4 lg:grid-cols-3 lg:items-end lg:gap-5",
          className,
        )}
      >
        {places.map((entry, index) => (
          <PodiumCard
            key={entry.userId}
            entry={entry}
            place={(index + 1) as Place}
            rangeCaption={rangeCaption}
            reduce={Boolean(reduce)}
          />
        ))}
      </motion.ol>
    </section>
  );
}


