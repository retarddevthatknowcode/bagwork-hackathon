"use client";

import * as React from "react";
import { motion, AnimatePresence, useInView, useReducedMotion } from "framer-motion";
import { Coins, Flame, Building2, ArrowRight } from "lucide-react";

/**
 * Diagram B — 5% Fee Split (section 03)
 *
 * A horizontal "5% FEE" bar fills, then splits into two halves:
 *   50% Treasury  (left, lime #bdfe00, coins flow into a treasury box)
 *   50% Burn      (right, warm #ff6b35, $BAG tokens shown burning)
 *
 * A `$BAG supply` counter DECREASES as the burn happens (1,000,000 → 999,500).
 *
 * Loops on an interval:
 *   fill (1.4s) → split (1.0s) → burn (2.6s) → reset → repeat
 */

const PHASES = {
  fill: 0,
  split: 1,
  burn: 2,
} as const;

const PHASE_MS: Record<number, number> = {
  0: 1400,
  1: 1000,
  2: 2600,
};

const SUPPLY_START = 1_000_000;
const SUPPLY_END = 999_500;

export function DiagramFeeSplit() {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const [phase, setPhase] = React.useState<number>(PHASES.fill);
  const [supply, setSupply] = React.useState(SUPPLY_START);

  // phase machine — paused while off screen (an off-screen diagram then costs
  // nothing) and skipped under reduced motion
  React.useEffect(() => {
    if (reduce || !inView) return;
    const order = [PHASES.fill, PHASES.split, PHASES.burn];
    let idx = 0;
    let timer: number;
    const next = () => {
      setPhase(order[idx]);
      timer = window.setTimeout(() => {
        idx = (idx + 1) % order.length;
        next();
      }, PHASE_MS[order[idx]]);
    };
    next();
    return () => clearTimeout(timer);
  }, [reduce, inView]);

  // reduced motion: draw the settled state — split complete, burn finished
  React.useEffect(() => {
    if (!reduce) return;
    setPhase(PHASES.burn);
    setSupply(SUPPLY_END);
  }, [reduce]);

  // burn phase: animate supply downward
  React.useEffect(() => {
    if (reduce) return;
    if (phase !== PHASES.burn) {
      if (phase === PHASES.fill) setSupply(SUPPLY_START);
      return;
    }
    let raf: number;
    const start = performance.now();
    const dur = PHASE_MS[2] - 200;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(SUPPLY_START - (SUPPLY_START - SUPPLY_END) * eased);
      setSupply(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const fillPct =
    phase === PHASES.fill
      ? 100 // grow to full
      : 100; // stays full through split + burn

  const showSplit = phase === PHASES.split || phase === PHASES.burn;

  return (
    <div
      ref={ref}
      className="docs-mono rounded-xl border border-white/10 bg-[#17140e] p-4 sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#ffe70e]/70">
          5% FEE SPLIT
        </span>
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40">
          <span className="h-1.5 w-1.5 rounded-full bg-[#bdfe00] pulse-dot" />
          {reduce
            ? "split 50 / 50"
            : phase === PHASES.fill
              ? "collecting fee"
              : phase === PHASES.split
                ? "splitting 50 / 50"
                : "burn in progress"}
        </span>
      </div>

      {/* the bar */}
      <div className="relative h-10 overflow-hidden rounded-lg border border-white/10 bg-black/40">
        {/* fill track */}
        <motion.div
          className="absolute inset-y-0 left-0"
          initial={false}
          animate={{ width: `${fillPct}%` }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          style={{
            background:
              "linear-gradient(90deg, rgba(255,231,14,0.85), rgba(255,231,14,0.5))",
            boxShadow: "0 0 14px rgba(255,231,14,0.45)",
          }}
        >
          <span className="flex h-full items-center justify-center text-[10px] font-bold uppercase tracking-widest text-black/80">
            5% FEE
          </span>
        </motion.div>

        {/* split halves appear on top once split phase starts */}
        <AnimatePresence>
          {showSplit && (
            <motion.div
              key="split"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex"
            >
              <motion.div
                initial={{ width: "100%" }}
                animate={{ width: "50%" }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="relative flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(189,254,0,0.85), rgba(189,254,0,0.45))",
                  boxShadow: "inset 0 0 14px rgba(189,254,0,0.35)",
                }}
              >
                <span className="text-[10px] font-bold uppercase tracking-widest text-black/80">
                  50% Treasury
                </span>
              </motion.div>
              <motion.div
                initial={{ width: "0%" }}
                animate={{ width: "50%" }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="relative flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(255,107,53,0.5), rgba(255,107,53,0.85))",
                  boxShadow: "inset 0 0 14px rgba(255,107,53,0.45)",
                }}
              >
                <span className="text-[10px] font-bold uppercase tracking-widest text-black/80">
                  50% Burn
                </span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* below: treasury box + burn supply counter */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* treasury */}
        <div className="flex items-center gap-3 rounded-lg border border-[#bdfe00]/15 bg-black/40 p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#bdfe00]/10">
            <Building2 className="h-5 w-5 text-[#bdfe00]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/50">
              Platform Treasury
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              {/* coins flowing into the box */}
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="block h-2 w-2 rounded-full bg-[#bdfe00]"
                  style={{ boxShadow: "0 0 6px rgba(189,254,0,0.7)" }}
                  animate={
                    showSplit && !reduce
                      ? { x: [0, 28, 28], opacity: [0, 1, 0] }
                      : { opacity: 0 }
                  }
                  transition={{
                    duration: 1.2,
                    delay: i * 0.3,
                    repeat: Infinity,
                    repeatDelay: 0.4,
                    ease: "easeInOut",
                  }}
                />
              ))}
              <Coins className="ml-1 h-3.5 w-3.5 text-[#bdfe00]/50" />
            </div>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-white/30" />
        </div>

        {/* burn */}
        <div className="flex items-center gap-3 rounded-lg border border-[#ff6b35]/15 bg-black/40 p-3">
          <motion.div
            className="flex h-9 w-9 items-center justify-center rounded-md bg-[#ff6b35]/10"
            animate={
              phase === PHASES.burn
                ? {
                    boxShadow: [
                      "0 0 0px rgba(255,107,53,0)",
                      "0 0 18px rgba(255,107,53,0.7)",
                      "0 0 0px rgba(255,107,53,0)",
                    ],
                  }
                : {}
            }
            transition={{
              duration: 0.8,
              repeat: phase === PHASES.burn && !reduce ? Infinity : 0,
            }}
          >
            <Flame
              className="h-5 w-5"
              style={{ color: "#ff6b35" }}
            />
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/50">
              $BAG Burned
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[10px] uppercase tracking-wider text-white/40">
                supply
              </span>
              <span
                key={supply}
                className="text-sm font-bold tabular-nums text-white"
                style={{ color: phase === PHASES.burn ? "#ff6b35" : "#ffffff" }}
              >
                {supply.toLocaleString()}
              </span>
              <AnimatePresence>
                {phase === PHASES.burn && (
                  <motion.span
                    key="dec"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-[10px] tabular-nums font-bold text-[#ff6b35]"
                  >
                    ▼ -500
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 text-center text-[10px] uppercase tracking-wider text-white/40">
        every campaign · 2.5% treasury + 2.5% $BAG burn
      </div>
    </div>
  );
}
