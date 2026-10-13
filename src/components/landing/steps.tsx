"use client";

import type { CSSProperties } from "react";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import * as React from "react";
import { CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { BloomOrb } from "./bloom-orb";

// === FIXED, CLICK-DRIVEN: the section is a constant height and nothing in here scrolls, measures
// or reflows. The left list selects a step; the card on the right swaps its contents in place.

/** The card's id — each step button points at it with `aria-controls`. */
const PANEL_ID = "how-panel";

/** One step of the creator flow. Titles and copy are unchanged from the card row this replaced. */
type StepMeta = { title: string; desc: string };

const STEPS: StepMeta[] = [
  {
    title: "SUBMIT YOUR POST",
    desc: "Paste your X, TikTok, IG, or YouTube link. We validate ownership and pull live engagement metrics.",
  },
  {
    title: "TRACK ENGAGEMENT",
    desc: "Watch real views, likes, and reposts roll in. Metric polling keeps your stats fresh.",
  },
  {
    title: "GET REVIEWED",
    desc: "Human moderators + our AI anti-slop engine score content quality and engagement authenticity.",
  },
  {
    title: "GET PAID ON-CHAIN",
    desc: "Approved creators receive instant SPL token transfers to their wallet. Transparent, verifiable on Solscan.",
  },
];

type StepMockProps = { active: boolean; done: boolean };

// The illustrative panel for each step — the same four mocks the cards used to carry.
const MOCKS: React.FC<StepMockProps>[] = [
  StepMockSubmit,
  StepMockTrack,
  StepMockReview,
  StepMockPayout,
];

function useCountUp(target: number, active: boolean, done: boolean) {
  const [val, setVal] = React.useState(0);
  React.useEffect(() => {
    if (done) { setVal(target); return; } // freeze at final value when completed
    if (!active) { setVal(0); return; }
    let raf: number;
    const start = performance.now();
    const dur = 1500;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, done]);
  return val;
}

function fmt(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

/**
 * The creator's four steps, as a fixed-height selector.
 *
 * Nothing here measures, scrolls or animates layout: the left column is four plain buttons and the
 * card beside it is one fixed box whose contents cross-fade. Clicking a step is the only
 * interaction, which is the point — the section cannot move the page under the reader, and it
 * cannot change its own height when the selected step changes.
 */
export function Steps() {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = React.useState(0);

  return (
    <section id="how" className="relative border-b border-white/10 bg-[#13110c]">
      {/*
        The bloom, lower-left: the light that carries the page across the join between the proof strip
        above (live bags, then the adoption figures) and the four steps here. Its centre sits level
        with the "EARN IN 4 SIMPLE STEPS" heading and half of it is past the left edge, which is where
        the page's light has been since the hero — it is an edge glow, not a graphic on the page.

        It is the site's own sphere, running the site's own `orb-flow` drift, so there is still one
        animation to know. Four things differ from the small orbs, each for a reason:

          size   704px — 10% up on the 640px this started at, and 35% up on the 520px the hero
                 carried. At this distance from the copy it can afford the weight, and the placement
                 below still keeps it clear of the heading.
          speed  9s, quicker than the small orbs' 6–8s and the 18s it started at: a bigger sphere
                 travels further per degree, so 18s on this radius read as a still image. 9s is
                 ~2x livelier than it was and still a drift, not a spin.
          wander `.orb-wander` adds a slow two-axis translate on top of the drift. `orb-flow` alone
                 is one closed loop, and a single closed loop on one big sphere reads as a static
                 picture; the uneven offset is what stops that. Transform-only, so it costs a
                 composited frame instead of a repaint.
          shade  `--orb-shade` gives it a dark side — a broad terminator opposite the specular, plus
                 a deeper core shadow — so it reads as a lit sphere with depth rather than a flat
                 lime disc. The small orbs leave it unset and look exactly as they did.

        `--orb-blur` is turned down from the 0.6em default: at this size the default softens the
        gradient into mush and is the expensive half of the paint. Full `opacity-100`: the sphere is
        a solid object on this page, not a wash over it.

        It is desktop-only (`hidden lg:block`, so a phone never lays it out or paints it), out of the
        document flow and `pointer-events-none`, so it cannot shift layout or swallow a click meant
        for a button or link underneath.

        `z-20` puts it on top of every text and panel layer on the page — the sections' copy sits at
        `z-10`, and nothing else on this page goes higher — while staying under the sticky header
        (`z-50`), so it slides beneath the nav rather than over it. Being on top is deliberate: the
        sphere is no longer dimmed or blurred by the panels it passes, and its top now reads in front
        of the ticker and the figures strip instead of being clipped by them. The trade is that it is
        a solid object over the left end of that strip and the first step row, which is what "on top
        of the stack" means. Half of it is off the left edge, which never adds a scrollbar (LTR
        overflow only scrolls on the right).

        The left offset changes with the breakpoint because that heading is centred: its left edge
        sits at ~171px on a 1024 screen and ~379px on a 1440 one, so the sphere gives up visible width
        on the narrower desktops rather than slide under the heading. Each step carries the same ~10%
        growth in what is actually visible — ~132px at 1024, ~264px at 1280, ~332px at 1400, and the
        full half (352px) from 1440 up, which is where there is room for it.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[572px] top-[-230px] z-20 hidden lg:block min-[1280px]:-left-[440px] min-[1400px]:-left-[372px] min-[1440px]:-left-[352px]"
      >
        <div className="orb-wander">
          <BloomOrb
            size={704}
            speed={9}
            style={{ "--orb-blur": "0.22em", "--orb-shade": "rgba(0, 0, 0, 0.6)" } as CSSProperties}
          />
        </div>
      </div>
      {/* `relative z-10` keeps the copy above the sphere above. */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white/50">
            HOW IT WORKS
          </div>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl">
            EARN IN <span className="text-[#bdfe00]">4 SIMPLE STEPS</span>
          </h2>
          <p className="mt-4 text-sm text-white/50">
            From paste to payout in minutes. No audience required. No gatekeepers except the anti-slop engine.
          </p>
          {/* These panels animate an example of the flow; they are not live figures. */}
          <p className="mt-2 text-[10px] uppercase tracking-widest text-white/30">
            Panels below are illustrative animations, not live figures
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:mt-16 lg:grid-cols-2 lg:items-start lg:gap-10">
          {/* ── Left: the four steps. Text only — no icons, no rail, no dots. The active state is
                 colour and background only, so no row can change size when the selection moves. ── */}
          <ul className="space-y-2">
            {STEPS.map((step, i) => {
              const isActive = active === i;
              return (
                <li key={step.title}>
                  <button
                    type="button"
                    aria-current={isActive ? "step" : undefined}
                    aria-controls={PANEL_ID}
                    onClick={() => setActive(i)}
                    className={cn(
                      "flex w-full cursor-pointer items-start gap-4 rounded-2xl border px-4 py-4 text-left transition-colors duration-300 sm:gap-5 sm:px-5",
                      isActive
                        ? "border-[#bdfe00]/25 bg-[#bdfe00]/[0.06]"
                        : "border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]",
                    )}
                  >
                    <span
                      className={cn(
                        "font-mono text-xs font-bold tabular-nums transition-colors duration-300",
                        isActive ? "text-[#bdfe00]" : "text-white/25",
                      )}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-sm font-bold uppercase tracking-wide transition-colors duration-300",
                          isActive ? "text-[#bdfe00]" : "text-white/45",
                        )}
                      >
                        {step.title}
                      </span>
                      <span
                        className={cn(
                          "mt-1 block text-xs leading-relaxed transition-colors duration-300",
                          isActive ? "text-white/60" : "text-white/25",
                        )}
                      >
                        {step.desc}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* ── Right: one card, one fixed box. Its size and its position never change — the
                 contents cross-fade inside it, absolutely positioned, so nothing can push it. ── */}
          <div className="relative">
            {/* Ambient neon *behind* the glass. The section sits on a flat near-black, so a
                backdrop blur over it would read as a plain dark panel with nothing to refract. */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              <div className="absolute -left-10 -top-10 h-56 w-56 rounded-full bg-[#bdfe00]/[0.16] blur-[90px]" />
              <div className="absolute -bottom-12 right-0 h-52 w-52 rounded-full bg-[#bdfe00]/[0.08] blur-[80px]" />
            </div>

            <div
              id={PANEL_ID}
              aria-live="polite"
              className="relative h-[420px] overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_30px_70px_-40px_rgba(0,0,0,0.95)] backdrop-blur-2xl"
            >
              {/* The Bloom Orb, top-left where the old card's icon sat. `initial={false}` on the
                  wrapper means the very first frame gets the orb live and fully opaque — no
                  entrance to sit through — while every *change* of step remounts it, so the drift
                  restarts from a fresh phase and it re-enters at low opacity. The gradient's own
                  CSS animation is never gated behind that entrance. */}
              <AnimatePresence initial={false}>
                <motion.div
                  key={active}
                  initial={reduceMotion ? { opacity: 0.25 } : { opacity: 0.25, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: reduceMotion ? 0.2 : 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute left-6 top-6 z-10"
                >
                  <BloomOrb size={40} speed={7} />
                </motion.div>
              </AnimatePresence>

              <AnimatePresence initial={false}>
                <motion.div
                  key={active}
                  initial={{ opacity: 0, filter: reduceMotion ? "blur(0px)" : "blur(6px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, filter: reduceMotion ? "blur(0px)" : "blur(6px)" }}
                  transition={{ duration: reduceMotion ? 0.2 : 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0 flex flex-col p-6"
                >
                  <StepBody index={active} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The card's contents for one step: the step number in the strip the orb occupies, the title, the
 * copy, and the step's illustrative panel. Rendered absolutely inside a fixed-height card, so
 * switching steps cannot change the card's size — let alone the section's.
 */
function StepBody({ index }: { index: number }) {
  const step = STEPS[index] ?? STEPS[0];
  const Mock = MOCKS[index] ?? MOCKS[0];

  return (
    <>
      {/* The strip the orb sits in: it reserves the orb's height and carries the step number. */}
      <div className="flex h-10 items-center justify-end">
        <span className="font-mono text-2xl font-bold leading-none text-[#bdfe00]/40">
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>

      <h3 className="mt-5 text-base font-bold uppercase tracking-wide text-white sm:text-lg">{step.title}</h3>
      <p className="mt-2 min-h-[2.5rem] max-w-md text-xs leading-relaxed text-white/55 sm:text-sm">{step.desc}</p>

      <div className="mt-auto flex h-[110px] flex-col justify-center rounded-2xl border border-white/10 bg-black/50 p-4">
        <Mock active done={false} />
      </div>
    </>
  );
}

// === MOCKS: active=animating, done=frozen final state, idle=placeholder ===
// One of these shows at a time, in whatever panel is currently active. They are passed `active`
// with `done` false — the panel only ever renders the live step — and `done` stays in the signature
// because it is what freezes the animation at its end value.

function StepMockSubmit({ active, done }: { active: boolean; done: boolean }) {
  return (
    <div className="space-y-2">
      <div className="text-[9px] uppercase tracking-wider text-white/40">POST URL</div>
      <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/60 px-2 py-1.5 text-[10px] text-white/60">
        <span className="text-[#bdfe00]">https://</span>x.com/.../status
        {active && <span className="blink text-[#bdfe00]">▋</span>}
      </div>
      <div className={`flex items-center gap-1 text-[9px] ${active || done ? "text-[#bdfe00]" : "text-white/30"}`}>
        <span className={`h-1 w-1 rounded-full ${active || done ? "bg-[#bdfe00] pulse-dot" : "bg-white/20"}`} />
        {active || done ? "OWNERSHIP VERIFIED" : "WAITING"}
      </div>
    </div>
  );
}

function StepMockTrack({ active, done }: { active: boolean; done: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <AnimatePresence mode="wait">
        {active || done ? (
          <motion.div key="submitted" initial={active ? { opacity: 0 } : false} animate={{ opacity: 1 }} className="flex items-center gap-2 rounded-lg border border-[#bdfe00]/30 bg-[#bdfe00]/10 px-3 py-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#bdfe00]" />
            <span className="text-[10px] font-bold text-[#bdfe00]">SUBMITTED!</span>
          </motion.div>
        ) : (
          <motion.div key="idle" initial={{ opacity: 0.3 }} animate={{ opacity: 0.3 }} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-white/30">
            SUBMIT CONTENT
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex items-center justify-between text-[10px]">
        <span className="uppercase tracking-wider text-white/40">STATUS</span>
        <span className={active ? "text-[#bdfe00]" : done ? "text-[#bdfe00]/60" : "text-white/30"}>
          {active ? "REVIEWING" : done ? "SUBMITTED" : "IDLE"}
        </span>
      </div>
    </div>
  );
}

function StepMockReview({ active, done }: { active: boolean; done: boolean }) {
  const views = useCountUp(12400, active, done);
  const likes = useCountUp(920, active, done);
  const barPct = done ? 100 : Math.min(100, (views / 12400) * 100);
  const stage = done ? "GOING VIRAL!" : views > 10000 ? "GOING VIRAL!" : views > 5000 ? "ACCELERATING" : views > 1000 ? "GAINING TRACTION" : active ? "STARTING…" : "WAITING";

  return (
    <div className="flex flex-col gap-1.5">
      <MetricRow label="VIEWS" val={active || done ? fmt(views) : "—"} bright={active || done} />
      <MetricRow label="LIKES" val={active || done ? fmt(likes) : "—"} bright={active || done} />
      <div className="mt-1">
        <div className="mb-1 text-[9px] uppercase tracking-wider text-[#bdfe00]/80">{stage}</div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[#bdfe00] transition-all duration-500" style={{ width: `${barPct}%`, boxShadow: barPct > 0 ? "0 0 6px rgba(189,254,0,0.5)" : "none" }} />
        </div>
      </div>
    </div>
  );
}

function StepMockPayout({ active, done }: { active: boolean; done: boolean }) {
  const balance = useCountUp(8200, active, done);
  const [payments, setPayments] = React.useState<number[]>([]);

  React.useEffect(() => {
    if (done) { setPayments([297.6, 142.5, 421.8]); return; }
    if (!active) { setPayments([]); return; }
    const timeouts: number[] = [];
    [500, 1000, 1500].forEach((delay, i) => {
      timeouts.push(window.setTimeout(() => setPayments(prev => [...prev.slice(-2), [297.6, 142.5, 421.8][i]]), delay));
    });
    return () => timeouts.forEach(clearTimeout);
  }, [active, done]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="uppercase tracking-wider text-white/40">WALLET</span>
        <span className={`font-bold ${active || done ? "text-[#bdfe00]" : "text-white/30"}`}>
          {active || done ? `$${balance.toLocaleString()}` : "—"}
        </span>
      </div>
      <div className="space-y-1">
        <AnimatePresence>
          {payments.map((amt, i) => (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5 rounded-md border border-[#bdfe00]/20 bg-[#bdfe00]/5 px-2 py-1 text-[10px]">
              <CheckCircle2 className="h-3 w-3 text-[#bdfe00]" />
              <span className="text-white/60">+${amt.toFixed(2)} USDC</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function MetricRow({ label, val, bright }: { label: string; val: string; bright: boolean }) {
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="uppercase tracking-wider text-white/40">{label}</span>
      <span className={bright ? "text-white" : "text-white/30"}>{val}</span>
    </div>
  );
}
