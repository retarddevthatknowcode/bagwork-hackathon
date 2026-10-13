"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";

import { NpcAvatar } from "@/components/console/npc-avatar";
import { LevelRing } from "@/components/shared/level-ring";
import { AnimatedCounter } from "@/components/site/animated-counter";
import { TerminalWindow } from "@/components/site/terminal-window";
import { formatPoints } from "@/lib/profile/points";
import { cn } from "@/lib/utils";

/**
 * The hero's card — the sample Bagworker profile, shown inside the REWARDS_DASHBOARD.EXE
 * terminal window.
 *
 * This is the one fabricated surface on the marketing site, and it says so on its face: the
 * body carries a SAMPLE chip. Everything else on the page is read from the database (the live
 * figures beside it come from `/api/stats`). It exists because a visitor has to *recognise*
 * the thing they are being sold — a Bagworker's card, with a face, a number, a level and the
 * money each platform actually paid — and no real profile could be shown without publishing
 * someone's earnings.
 *
 * The window is `components/site/terminal-window.tsx`, used exactly as it is — traffic lights,
 * dark chrome, glow, and the `float-tilt` drift it has always had. Only the body is authored
 * here, so the shell keeps the shape and the border it has always had, and the figures stay
 * quiet and scannable inside it: one number per band, tabular figures, no decoration inside
 * the data.
 */

/* ---------------------------------------------------------------- sample data */

/**
 * Fixed demo values, per the brief.
 *
 * `progress` is declared rather than recomputed from `lib/profile/points.ts`: the brief pins
 * the level (3) and the caption ("1,580 points to Level 4"), and 1,580 against Level 3's
 * 50,000-point span to Level 4 is 96.8%. Declaring the fraction keeps the ring and the
 * sentence under it in agreement — recomputing the level from the printed total would
 * contradict both, which is worse than an obviously fictional number on a card marked SAMPLE.
 *
 * `totalEarned` and the `earnings` split are deliberately *not* reconciled: the brief supplies
 * the headline figure ($1,823) and the per-platform figures ($2,810 together) as separate
 * numbers, so each band prints what it was given. Nothing here is load-bearing arithmetic —
 * the card is a picture of the product and it says SAMPLE on its face.
 */
const SAMPLE = {
  handle: "@gainzy",
  bagworkerNumber: 3841,
  /**
   * A pixel character from the house set, so the card looks like the product.
   *
   * "Mira" specifically: pale skin plus lavender goggles stay legible at 40px on a near-black
   * plate, where "Nia" (near-black hair, dark brown skin) collapsed into an anonymous brown
   * blob with a yellow band across it.
   */
  avatarId: "mira",
  points: 18_420,
  level: 3,
  pointsToNextLevel: 1_580,
  progress: 0.968,
  totalEarned: 1_823,
  earnings: [
    { platform: "TikTok", share: 45, amount: 1_240, from: "#2dd4bf", to: "#22d3ee" },
    { platform: "X", share: 30, amount: 860, from: "#f5f5f4", to: "#a8a29e" },
    { platform: "YouTube", share: 25, amount: 710, from: "#ff5a4d", to: "#ef4444" },
  ],
  /**
   * Two bags a Bagworker could claim, so the card shows the marketplace and not only the
   * scoreboard. `kind`, `platforms` and `slots` are written in normal case and uppercased by
   * CSS, exactly like every other label on the card.
   *
   * Named as the marketplace names a campaign rather than after a coin. Every demo identity this
   * product ever had is gone from the system, and the marketing site is part of the system, so
   * nothing here may echo one back.
   *
   * A fabricated *campaign title* is also the honest thing to show: it reads as a picture of the
   * product rather than as a real token's bag, which is what the SAMPLE chip on the card says too.
   */
  campaigns: [
    {
      name: "Meme Clip Contest",
      kind: "clipping",
      rate: "$14 / 1K",
      platforms: "X · TikTok",
      slots: "18 slots left",
    },
    {
      name: "Original Content Series",
      kind: "original",
      rate: "$180 / post",
      platforms: "X · YouTube",
      slots: "19 slots left",
    },
  ],
} as const;

const TOTAL_EARNINGS = SAMPLE.earnings.reduce((sum, entry) => sum + entry.amount, 0);

const money = (value: number) => `$${value.toLocaleString("en-US")}`;

/**
 * Accent borders are set inline, not with `border-[…]` utilities.
 *
 * `globals.css` declares `* { border-color: var(--border) }` outside any `@layer`, and an
 * unlayered rule beats Tailwind's layered utilities no matter how specific the utility is —
 * so every accent border on the site silently renders as the default hairline. Until that
 * rule is moved into `@layer base`, inline styles are the only way to get the colour asked
 * for. Same workaround as `console/pages/quests-page.tsx`.
 */
const accentBorder = (color: string): React.CSSProperties => ({ borderColor: color });

/* ---------------------------------------------------------------- level ring */

/*
 * The ring is `@/components/shared/level-ring` â€” one implementation for this hero card and the
 * console profile. It used to be defined here, which is how the two drifted apart in the first
 * place: the hero drew a three-stop arc with a bloom and a glow, the profile a flat two-stop one.
 */

/* ----------------------------------------------------------------- the card */

export function HeroBagworkerCard({ className }: { className?: string }) {
  const reduce = useReducedMotion();

  return (
    /* The shell is the restored REWARDS_DASHBOARD.EXE terminal window
       (`components/site/terminal-window.tsx`) — traffic lights, dark chrome and the drifting
       3D tilt it has always had. Nothing about the window itself is re-drawn here: this
       component only supplies the body, so the card keeps the shape and border it had.

       `group` owns the hover state for the whole composition and `focus-within` gives keyboard
       users the same moment. The lift lives on its own layer, never on the shell: `float-tilt`
       animates the shell's `transform`, and two rules animating `transform` on one element
       cancel each other out. */
    <div className={cn("group relative w-full max-w-[430px]", className)}>
      <div className="relative transition-transform duration-500 group-hover:scale-[1.012] group-focus-within:scale-[1.012]">
        <TerminalWindow title="REWARDS_DASHBOARD.EXE" tilt>
          <div className="relative flex min-h-[520px] flex-col overflow-hidden rounded-b-xl">

            {/* ------------------------------------------------------------ identity */}
            <div className="relative flex items-center gap-3 px-4 py-3">
              {/* The ring is a box-shadow, not a border: the accent colour survives the
                  unlayered `* { border-color }` in globals.css without a workaround.
                  Lime, not the old yellow: the window's own accent (the title bar's
                  CONNECTED dot and the glow) is `#bdfe00`, so the avatar plate belongs to
                  the chrome rather than sitting beside it. */}
              <NpcAvatar
                id={SAMPLE.avatarId}
                className="size-10 shrink-0 rounded-lg bg-[#191919] ring-1 ring-[#bdfe00]/30"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold tracking-tight text-white">
                    {SAMPLE.handle}
                  </span>
                  <span
                    className="shrink-0 rounded-md border bg-[#bdfe00]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#bdfe00]"
                    style={accentBorder("rgba(189,254,0,0.35)")}
                  >
                    Level {SAMPLE.level}
                  </span>
                </div>
                <div className="mt-1 font-mono text-[11px] tabular-nums text-white/55">
                  Bagworker#{SAMPLE.bagworkerNumber}
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.18em] text-white/50">
                Sample
              </span>
            </div>

            {/* -------------------------------------------------------------- points
                Ring right, on the big number's line.

                Row 2 of this grid holds the number and the ring and nothing else. The ring is
                80px, so row 2 becomes 80px tall and both items centre in it — the ring lands on
                the number's centre line, and it stays there whatever the label and the caption
                measure, including the caption wrapping on a narrow phone. Balancing the column
                with margins instead — the first pass at this fix — holds only until one of the
                two lines outside the row changes height, and this caption already sits at its
                max-content width, so the wrap moves at the smallest phone widths.

                The caption is a grid item of row 3 rather than a block under the row, so it
                takes the same 1fr track the label and the number use and cannot push the row
                around. Row 1 (label) and row 3 (caption) contribute 30px between them and row 2
                contributes 80, so the band is 130px with 9.5px of padding — the 12px the other
                three bands take, less the half pixel the two text rows round up on. That keeps
                the card at 430 x 585 while the ring is 16px lower than it was in the bug. */}
            <div className="relative border-t border-white/10 px-4 py-[9.5px]">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4">
                <span className="col-start-1 row-start-1 text-[9px] font-bold uppercase tracking-[0.24em] text-white/50">
                  Lifetime points
                </span>

                <div className="col-start-1 row-start-2 flex items-baseline gap-1.5">
                  <AnimatedCounter
                    value={SAMPLE.points}
                    duration={reduce ? 0 : 1500}
                    className="text-[2rem] font-bold leading-none tracking-[-0.02em] text-white"
                  />
                  <span className="text-xs font-bold uppercase tracking-wide text-[#bdfe00]">
                    pts
                  </span>
                </div>

                <div className="col-start-2 row-start-2">
                  <LevelRing level={SAMPLE.level} progress={SAMPLE.progress} size={80} />
                </div>

                <p className="col-start-1 row-start-3 text-[11px] font-medium tabular-nums text-white/55">
                  <span className="text-white/85">{formatPoints(SAMPLE.pointsToNextLevel)}</span>{" "}
                  points to Level {SAMPLE.level + 1}
                </p>
              </div>
            </div>

            {/* --------------------------------------------------------- total earned */}
            <div className="relative border-t border-white/10 px-4 py-3">
              <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/50">
                Total earned
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-[#bdfe00]">
                  {money(SAMPLE.totalEarned)}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                  usdc
                </span>
              </div>
            </div>

            {/* ------------------------------------------------------- live campaigns */}
            <div className="relative border-t border-white/10 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/50">
                  Live campaigns
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#bdfe00]">
                  {SAMPLE.campaigns.length} live
                </span>
              </div>

              {/* Two lines per bag rather than the brief's one: at this width a single line
                  of name · kind · rate · platforms · slots would wrap mid-token, and the rate
                  reads better as a value on the right than as the next item in a list. */}
              <ul className="mt-2 space-y-2">
                {SAMPLE.campaigns.map((campaign) => (
                  <li
                    key={campaign.name}
                    className="rounded-lg border border-white/5 bg-black/40 px-3 py-1.5"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[11px] font-bold tracking-tight text-white">
                        {campaign.name}{" "}
                        <span className="font-medium uppercase tracking-wide text-white/40">
                          · {campaign.kind}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] font-bold tabular-nums text-[#bdfe00]">
                        {campaign.rate}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[9px] font-bold uppercase tracking-wider text-white/45">
                      <span className="truncate">{campaign.platforms}</span>
                      <span className="shrink-0">{campaign.slots}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* ------------------------------------------------------------ earnings */}
            <div className="relative border-t border-white/10 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/50">
                  Earnings by platform
                </span>
                <span className="text-[11px] font-bold tabular-nums text-white/70">
                  {money(TOTAL_EARNINGS)}
                </span>
              </div>

              {/* Segments are sized by flex-grow and never animated, so the row never
                  reflows; the fill inside each one scales in from the left on mount. The
                  split is also stated to assistive tech as a single described image —
                  three unlabelled boxes would read as nothing at all.
                  `initial` is deliberately the same on the server and the client (see the
                  note on the ring): reduced motion collapses the duration to zero rather
                  than removing the initial value, which React would call a hydration
                  mismatch. */}
              <div
                className="mt-3 flex h-3 gap-[3px]"
                role="img"
                aria-label={`Earnings by platform: ${SAMPLE.earnings
                  .map((entry) => `${entry.platform} ${entry.share}% ${money(entry.amount)}`)
                  .join(", ")}`}
              >
                {SAMPLE.earnings.map((entry, index) => (
                  <span
                    key={entry.platform}
                    className="relative overflow-hidden rounded-full bg-white/[0.06]"
                    style={{ flex: `${entry.share} 1 0%` }}
                  >
                    <motion.span
                      className="absolute inset-0 rounded-full"
                      style={{
                        transformOrigin: "left center",
                        background: `linear-gradient(90deg, ${entry.from}, ${entry.to})`,
                      }}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={
                        reduce
                          ? { duration: 0 }
                          : {
                              duration: 0.9,
                              delay: 0.4 + index * 0.12,
                              ease: [0.22, 0.61, 0.36, 0.98],
                            }
                      }
                    />
                  </span>
                ))}
              </div>

              <div className="mt-2.5 grid grid-cols-3 gap-3">
                {SAMPLE.earnings.map((entry) => (
                  <div key={entry.platform} className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-[2px]"
                        style={{
                          background: `linear-gradient(135deg, ${entry.from}, ${entry.to})`,
                        }}
                      />
                      <span className="truncate text-[10px] font-bold uppercase tracking-wider text-white/50">
                        {entry.platform}
                      </span>
                    </div>
                    <div className="mt-1 text-[13px] font-bold tabular-nums text-white">
                      {money(entry.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TerminalWindow>
      </div>
    </div>
  );
}

