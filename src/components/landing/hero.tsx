"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { NeonButton } from "@/components/site/neon-button";
import { HeroDotBackground } from "@/components/site/hero-dot-bg";
import { useStats } from "@/lib/queries";
import { useApp } from "@/lib/store";

import { HeroBagworkerCard } from "./hero-bagworker-card";
import { BloomOrb } from "./bloom-orb";
import { MATRIX_WORDS, MatrixWord } from "./matrix-word";

/**
 * Hero — the pitch on the left, a Bagworker's card on the right.
 *
 * The card is a sample profile and says so on its face (`hero-bagworker-card.tsx`). Everything
 * else in this section is real: the live line under the buttons reads `/api/stats`, the same
 * query that feeds the stats band immediately below.
 *
 * The card beside it is the REWARDS_DASHBOARD.EXE terminal window, restored and used exactly
 * as it always was (`components/site/terminal-window.tsx`); everything inside it is the
 * fabricated sample profile from `./hero-bagworker-card.tsx`, which says SAMPLE on its face.
 * The window's own figures moved out: the visitor's wallet address, balance, trust score and
 * the stat table that repeated the stats band verbatim are one section down, where they are
 * not standing between a first-time visitor and the pitch.
 */

const EYEBROW = "Make Bagworking Great Again";

/**
 * The four-line mechanism, exactly as specified.
 *
 * Held as data and rendered as four separate lines rather than one paragraph: the break points
 * are part of the copy here, and letting them fall wherever the text-wrap algorithm lands (four
 * on a laptop, seven on a phone) is what makes a subheading read as filler.
 */
const SUBHEAD = [
  "Projects put money into a Bag.",
  "Real people create content for it.",
  "AI + humans review every post.",
];

const SUBHEAD_PAYOFF =
  "Approved creators get paid on-chain — no bots, no wasted budget.";

/**
 * The heading as one stable sentence, used as the `h1`'s accessible name.
 *
 * The visible last word cycles through `MATRIX_WORDS` every two seconds and is hidden from
 * assistive tech, so the heading needs a fixed, complete sentence to be read as — otherwise it
 * is announced as "...when you can pay" and the word the whole page rests on goes missing.
 * Built from the same constant the animation uses, so the two cannot drift apart.
 */
const HEADLINE_NAME = `Why pay for ads when you can pay ${MATRIX_WORDS[0]}`;

/**
 * Entrance stagger.
 *
 * The animation itself is `.hero-rise` in `globals.css`, together with its reduced-motion
 * opt-out — so nothing here can leave the hero invisible. This only spaces the elements out:
 * 60ms apart, all inside the first half-second, top of the column first.
 */
const RISE = "hero-rise";
const riseDelay = (ms: number) => ({ animationDelay: `${ms}ms` });

export function Hero() {
  const { authenticated, login } = useAuth();
  const { data: stats } = useStats();
  const goToConsole = useApp((s) => s.goToConsole);

  return (
    <section className="relative overflow-hidden">
      {/* water-like dot field (yellow on near-black, hero only) */}
      <HeroDotBackground className="pointer-events-none absolute inset-0 z-0" />
      {/* Atmospheric bloom over the card half, so the right side of the hero has light in it
          before the card's own bloom is layered on top. Positioned off the right edge: the
          composition is deliberately asymmetric, and the light should follow it. */}
      <div className="pointer-events-none absolute right-[-12%] top-[-14%] h-[620px] w-[680px] rounded-full bg-[#ffe70e]/[0.07] blur-[130px]" />

      {/* The large sphere that used to sit here now lives in the how-it-works section, where it marks
          the join between the proof strip (live bags, then the adoption figures) and the four steps.
          See `steps.tsx`, which documents the size, speed and placement. */}

      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:px-8 lg:pb-28 lg:pt-24">
        <div className="grid items-center gap-14 lg:grid-cols-[1.12fr_1fr] lg:gap-10">
          {/* --------------------------------------------------------------- copy */}
          <div>
            <p
              className={`${RISE} inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[#bdfe00]`}
              style={{
                ...riseDelay(0),
                borderColor: "rgba(189,254,0,0.28)",
                backgroundColor: "rgba(189,254,0,0.06)",
              }}
            >
              {/*
               * The Bloom Orb, where the static green dot used to sit.
               *
               * Its box is the text's line height (15px) rather than the sphere's own 18px, so the
               * pill keeps the exact height it had before — the orb simply breathes 1.5px past its
               * box into the pill's 6px padding, which clips nothing. At its own height the pill
               * would grow 3px and everything below it in the column would move with it.
               *
               * `speed` is 6s, not the footer's 8s: the sphere is only 18px here, and the drift
               * has to outrun the eye's "that is a still dot" threshold at that size.
               */}
              <span className="flex h-[15px] shrink-0 items-center justify-center">
                <BloomOrb size={18} speed={6} />
              </span>
              {EYEBROW}
            </p>

            {/* Three fixed lines, not a wrapped paragraph: "bagworkers?" is the word the whole
                page rests on, and it gets its own line to land on. The clamp is tuned so the
                longest line ("when you can pay", 16 characters) still fits one line at every
                width — Space Mono is a fixed 0.6em per character, so that is 610px of the copy
                column's ~620px. The rotating word runs 5–13 characters on the same fixed metric
                (its longest entry, "UGC creators?", is 13), so it can never become the line that
                overflows.

                The last line carries no `text-neon-glow`. The brief asked for the animated word
                to be free of it, and the two static lines never had it, so the heading is now
                uniformly clean — the accent colour alone carries the word. */}
            <h1
              aria-label={HEADLINE_NAME}
              className={`${RISE} mt-6 text-[clamp(2rem,4.6vw,4.1rem)] font-bold leading-[1.03] tracking-[-0.03em] text-white`}
              style={riseDelay(60)}
            >
              <span className="block">Why pay for ads</span>
              <span className="block">when you can pay</span>
              <span className="block text-[#bdfe00]">
                <MatrixWord />
              </span>
            </h1>

            {/* Same size as before — the emphasis is weight and wording, not scale: 13px/14px
                bold still clears AA against the near-black canvas at this opacity. */}
            <div
              className={`${RISE} mt-7 max-w-[46ch] space-y-1.5 text-[13px] font-bold leading-relaxed text-white/65 sm:text-sm`}
              style={riseDelay(140)}
            >
              {SUBHEAD.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p className="pt-3 text-white/85">{SUBHEAD_PAYOFF}</p>
            </div>

            {/* Full-width on a phone: these are the two targets the thumb can reach, and a
                horizontal pair of pills would either overflow or shrink below 44px.

                The two are not the same kind of thing, so they are not the same element. `START
                EARNING` is an action — it opens the Privy modal — and stays a `<button>`. `EXPLORE
                BAGWORK` is a destination: the console's Explore Bags page (`/dashboard`), which is
                the full, filterable marketplace that the `#live` block below is a capped preview
                of. So it is an anchor with the shared outline surface painted on it, exactly as the
                publisher CTA is — `NeonButton` renders a `<button>`, which cannot be a link. That
                keeps it middle-clickable, openable in a new tab and crawlable, and it is the same
                target a signed-out visitor gets: the console browses without a session, and the
                sign-in gate sits on the actions that write.

                The surfaces are the shared ones from `globals.css` — `.btn-surface-solid` and
                `.btn-surface-outline`, applied by `NeonButton` and by the console's shadcn
                `Button` — so the hero gets the same paint as every other button in the product
                with no hero-only styling. Sizes, order, the arrow and the `sm:w-auto` swap are
                all unchanged. */}
            <div
              className={`${RISE} mt-9 flex flex-col gap-3 sm:flex-row sm:items-center`}
              style={riseDelay(220)}
            >
              <NeonButton
                size="lg"
                arrow
                className="w-full sm:w-auto"
                onClick={() => {
                  // The real gate is signing in; onboarding and the console follow.
                  if (authenticated) goToConsole();
                  else login();
                }}
              >
                START EARNING
              </NeonButton>
              <a
                href="/dashboard"
                className="btn-3d btn-surface-outline relative inline-flex h-12 w-full select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl px-7 text-[13px] font-bold uppercase tracking-wider sm:w-auto"
              >
                <span className="relative z-10 flex items-center gap-2">
                  EXPLORE BAGWORK
                  <span className="text-[1.1em] leading-none">→</span>
                </span>
              </a>
            </div>

            {/* One live line instead of the three-figure table that used to sit here. It is
                the same `/api/stats` query the band below renders, so the hero has proof
                without restating a table. */}
            <p
              className={`${RISE} mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/45`}
              style={riseDelay(280)}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#bdfe00] pulse-dot" />
              {stats ? (
                <>
                  <span className="text-white/80">{stats.activeCampaigns}</span> bags live
                  <span className="text-white/25">·</span>
                  <span className="text-white/80">${stats.totalPaid.toLocaleString("en-US")}</span>{" "}
                  paid out to <span className="text-white/80">{stats.creators}</span> Bagworkers
                </>
              ) : (
                <span className="text-white/25">— bags live · — paid out</span>
              )}
            </p>

            {/* The docs link, last in the stack. A real anchor, not an SPA view switch: `/docs`
                is a route with its own metadata, so this is openable in a new tab like any
                other link on the web.

                It used to be `text-white/70` with a `white/25` hairline under it, which read
                as washed-out next to the two buttons. `.hero-docs-link` sets the colour and
                the underline together (solid lime, 2px) so the two cannot drift apart. */}
            <div className={`${RISE} mt-7`} style={riseDelay(340)}>
              <a
                href="/docs"
                className="hero-docs-link group/link rounded-sm text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bdfe00] focus-visible:ring-offset-4 focus-visible:ring-offset-[#0b0a07]"
              >
                Full system breakdown
                <span
                  aria-hidden
                  className="ml-2 inline-block transition-transform duration-200 group-hover/link:translate-x-1"
                >
                  →
                </span>
              </a>
            </div>
          </div>

          {/* --------------------------------------------------------------- card */}
          <div className={`${RISE} flex justify-center lg:justify-end`} style={riseDelay(180)}>
            <HeroBagworkerCard />
          </div>
        </div>
      </div>
    </section>
  );
}

