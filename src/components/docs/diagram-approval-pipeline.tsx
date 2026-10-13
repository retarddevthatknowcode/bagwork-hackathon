"use client";

import * as React from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import {
  Calculator,
  Link2,
  ScanLine,
  ShieldCheck,
  Wallet,
} from "lucide-react";

/**
 * Diagram D — Approval Pipeline (section 09)
 *
 * 5-stage horizontal pipeline:
 *   Paste Link → AI Review → Calculate Payout → Admin Approve → On-chain Pay
 *
 * A soft `#bdfe00` glow — no glyph, no badge — travels left-to-right along the
 * stage circles, pausing at each stage, then loops. Each stage lights up with a
 * `#bdfe00` glow + border when active. A progress bar beneath fills in step with
 * it. Under `prefers-reduced-motion` the pipeline holds on its final, fully-lit
 * stage instead of looping.
 */

const STAGES = [
  { icon: Link2, label: "Paste Link" },
  { icon: ScanLine, label: "AI Review" },
  { icon: Calculator, label: "Calculate Payout" },
  { icon: ShieldCheck, label: "Admin Approve" },
  { icon: Wallet, label: "On-chain Pay" },
];

const STEP_MS = 1400;

/** Diameter of the travelling glow, in px. */
const GLOW = 48;

export function DiagramApprovalPipeline() {
  const reduce = useReducedMotion();
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const inView = useInView(wrapperRef, { amount: 0.35 });
  const [step, setStep] = React.useState(0);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const stageRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const [centers, setCenters] = React.useState<number[]>([]);

  // Reduced motion: hold on the last stage so the pipeline reads as one
  // finished, fully-lit chain rather than an idle loop.
  const active = reduce ? STAGES.length - 1 : step;

  // Only advance while the figure is on screen.
  React.useEffect(() => {
    if (reduce || !inView) return;
    const id = window.setInterval(
      () => setStep((p) => (p + 1) % STAGES.length),
      STEP_MS,
    );
    return () => window.clearInterval(id);
  }, [reduce, inView]);

  // The glow is positioned from the measured stage-circle centres rather than a
  // percentage of the track, so it lands dead-centre on each stage no matter
  // what the grid gap is.
  React.useEffect(() => {
    const measure = () => {
      const track = trackRef.current;
      if (!track) return;
      const base = track.getBoundingClientRect().left;
      setCenters(
        stageRefs.current.map((el) =>
          el
            ? el.getBoundingClientRect().left + el.offsetWidth / 2 - base
            : 0,
        ),
      );
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // progress % — fills as the glow advances
  const progress = (active / (STAGES.length - 1)) * 100;
  const glowX = (centers[active] ?? GLOW / 2) - GLOW / 2;

  return (
    <div
      ref={wrapperRef}
      className="docs-mono rounded-xl border border-white/10 bg-[#17140e] p-4 sm:p-6"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#ffe70e]/70">
          APPROVAL PIPELINE
        </span>
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40">
          <span className="h-1.5 w-1.5 rounded-full bg-[#bdfe00] pulse-dot" />
          {active === STAGES.length - 1 ? "payout sent" : "reviewing"}
        </span>
      </div>

      {/* stage row */}
      <div ref={trackRef} className="relative">
        {/* connecting track */}
        <div className="absolute left-0 right-0 top-1/2 hidden h-[2px] -translate-y-1/2 bg-white/10 sm:block" />

        {/* Travelling light: a pure glow — no glyph, no badge, no border. Only
            `x` animates, so it stays on the compositor; `-mt-6` is half of the
            48px diameter, which centres it on the track without a transform. */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-1/2 z-20 -mt-6 hidden size-12 rounded-full sm:block"
          initial={false}
          animate={{ x: glowX }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{
            background:
              "radial-gradient(circle, rgba(189,254,0,0.5) 0%, rgba(189,254,0,0.2) 38%, rgba(189,254,0,0) 70%)",
          }}
        />

        {/* stages */}
        <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-2">
          {STAGES.map((stage, i) => {
            const isActive = active === i;
            const Icon = stage.icon;
            return (
              <div
                key={stage.label}
                ref={(el) => {
                  stageRefs.current[i] = el;
                }}
                className="flex flex-col items-center gap-1.5"
              >
                <motion.div
                  initial={false}
                  animate={
                    isActive
                      ? { borderColor: "rgba(189,254,0,0.6)" }
                      : { borderColor: "rgba(255,255,255,0.08)" }
                  }
                  transition={{ duration: 0.3 }}
                  className="flex h-10 w-10 items-center justify-center rounded-full border-2"
                  style={{
                    background: isActive ? "rgba(189,254,0,0.08)" : "#0f0d08",
                    boxShadow: isActive
                      ? "0 0 18px -2px rgba(189,254,0,0.55)"
                      : "none",
                  }}
                >
                  <Icon
                    className="h-4 w-4 sm:h-5 sm:w-5"
                    style={{
                      color: isActive ? "#bdfe00" : "rgba(255,255,255,0.4)",
                    }}
                  />
                </motion.div>
                <span
                  className="text-center text-[9px] font-bold uppercase tracking-wider sm:text-[10px]"
                  style={{
                    color: isActive ? "#ffffff" : "rgba(255,255,255,0.5)",
                  }}
                >
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* progress bar beneath */}
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-white/40">
          <span>post progress</span>
          <AnimatePresence mode="wait">
            <motion.span
              key={active}
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="font-bold text-[#bdfe00]"
            >
              {STAGES[active].label}
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-[#bdfe00]"
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            style={{
              boxShadow: "0 0 10px rgba(189,254,0,0.6)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
