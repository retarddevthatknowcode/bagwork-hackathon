"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

/**
 * The homepage's card-flow system.
 *
 * Every "N simple steps" block on this page — the creator flow, the publisher flow, the Fee
 * Redirect cycle — is the same machine, so it lives here once instead of being copied per
 * section: one card lights up for two seconds, the cards before it stay settled in their
 * finished state, and the whole thing resets when the cycle wraps.
 *
 * Three states per card, and each one means something:
 *   active — this step is happening now (lime border + glow, its mock animating)
 *   done   — the step finished earlier in this cycle (checkmark, mock frozen at its end value)
 *   idle   — not reached yet (dimmed, mock showing placeholders)
 *
 * Shared on purpose. Three near-identical copies is how the sections drifted apart in the first
 * place, and a card that is *almost* the same as the one above it reads worse than a different one.
 */

/** How long each card holds the spotlight. Every flow on the page beats at this tempo. */
export const FLOW_CARD_MS = 2000;

/** Advances through `count` cards every `ms`, marking each finished card as it goes. */
export function useSequential(count: number, ms: number = FLOW_CARD_MS) {
  const [active, setActive] = React.useState(0);
  const [completed, setCompleted] = React.useState<boolean[]>(Array(count).fill(false));

  React.useEffect(() => {
    const id = setInterval(() => {
      setActive((prev) => {
        const next = (prev + 1) % count;
        if (next === 0) {
          // Wrap: the cycle starts over, so every card returns to idle on the same frame.
          setCompleted(Array(count).fill(false));
        } else {
          setCompleted((c) => {
            const n = [...c];
            n[prev] = true;
            return n;
          });
        }
        return next;
      });
    }, ms);
    return () => clearInterval(id);
  }, [count, ms]);

  return { active, completed };
}

/**
 * One step card: number, icon, copy, and a fixed-height panel showing the step happening.
 *
 * The panel height is fixed so a card never resizes mid-animation, and the mock inside arrives
 * as children — the card itself knows nothing about what it is displaying.
 */
export function StepCard({
  n,
  icon: Icon,
  title,
  desc,
  children,
  active,
  done,
}: {
  n: string;
  icon: React.ElementType;
  title: string;
  desc: string;
  children: React.ReactNode;
  active: boolean;
  done: boolean;
}) {
  const state = active ? "active" : done ? "done" : "idle";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className={`relative flex flex-col overflow-hidden rounded-2xl border p-5 transition-all duration-500 ${
        state === "active"
          ? "border-[#bdfe00]/40 bg-[#0f0d08] shadow-[0_0_28px_-6px_rgba(189,254,0,0.2)]"
          : state === "done"
            ? "border-[#bdfe00]/20 bg-[#0f0d08]"
            : "border-white/10 bg-[#0f0d08]"
      }`}
    >
      <div
        className={`absolute inset-x-0 top-0 h-[2px] transition-all duration-300 ${
          state === "active"
            ? "bg-[#bdfe00] opacity-100"
            : state === "done"
              ? "bg-[#bdfe00]/30 opacity-100"
              : "opacity-0"
        }`}
        style={{ boxShadow: state === "active" ? "0 0 8px #bdfe00" : "none" }}
      />
      <div className="flex items-center justify-between">
        <Icon
          className={`h-6 w-6 transition-colors duration-500 ${
            state === "active"
              ? "text-[#bdfe00]"
              : state === "done"
                ? "text-[#bdfe00]/60"
                : "text-[#bdfe00]/30"
          }`}
        />
        <div className="flex items-center gap-1.5">
          {state === "done" && <CheckCircle2 className="h-4 w-4 text-[#bdfe00]/60" />}
          <span
            className={`text-2xl font-bold transition-colors duration-500 ${
              state === "active"
                ? "text-[#bdfe00]"
                : state === "done"
                  ? "text-[#bdfe00]/40"
                  : "text-white/10"
            }`}
          >
            {n}
          </span>
        </div>
      </div>
      <h3 className="mt-4 text-sm font-bold uppercase tracking-wide text-white">{title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-white/50">{desc}</p>
      <div className="mt-4 h-[100px] overflow-hidden rounded-lg border border-white/5 bg-black/40 p-3">
        {children}
      </div>
    </motion.div>
  );
}

/**
 * A label/value line inside a mock.
 *
 * Values render as an em dash until their card is reached, which is what makes an idle card
 * look like it is waiting rather than broken.
 */
export function MockMetric({
  label,
  value,
  bright,
  tone,
}: {
  label: string;
  value: string;
  bright: boolean;
  /** `lime` forces the accent colour on — for figures that should read as money either way. */
  tone?: "lime" | "white";
}) {
  const colour =
    tone === "lime"
      ? bright
        ? "text-[#bdfe00]"
        : "text-white/30"
      : bright
        ? "text-white"
        : "text-white/30";
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="uppercase tracking-wider text-white/40">{label}</span>
      <span className={colour}>{value}</span>
    </div>
  );
}

/** A thin lime progress bar. Lit while the card is active, settled when it is done. */
export function MockBar({ pct, bright = true }: { pct: number; bright?: boolean }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full bg-[#bdfe00] transition-all duration-500"
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          boxShadow: bright && pct > 0 ? "0 0 6px rgba(189,254,0,0.5)" : "none",
        }}
      />
    </div>
  );
}
