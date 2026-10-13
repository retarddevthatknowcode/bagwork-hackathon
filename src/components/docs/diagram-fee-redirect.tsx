"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Coins,
  Eye,
  PenTool,
  RefreshCw,
  Wallet,
} from "lucide-react";
import * as React from "react";

/**
 * Diagram C — Fee Redirect Cycle (section 05)
 *
 * The trading-fee flywheel as an aligned five-card pipeline:
 *   Trading → Fees Collected → Content Budget → Content Created → More Attention
 *   ↺ closes back into Trading
 *
 * Replaces the earlier circular layout, whose nodes were absolutely positioned
 * on a circle (ragged widths, 8–9px labels, an orbiting dot that drifted off the
 * node centres). Cards now sit on a strict grid so every step number, icon,
 * title and caption lines up on the same baselines, and the connectors are
 * centred in the gutters on desktop only.
 *
 * Motion is deliberately one idea: a lime rail fills across the card the flow is
 * currently passing through, with a `layoutId` dot riding its leading edge. The
 * interval runs only while the figure is on screen, and `prefers-reduced-motion`
 * renders the pipeline fully drawn with no loop at all.
 */

const STEPS = [
  { icon: BarChart3, title: "Trading", caption: "fees routed to Bagwork" },
  { icon: Wallet, title: "Fees Collected", caption: "auto-converted to USDC" },
  { icon: Coins, title: "Content Budget", caption: "the Bag’s live budget" },
  { icon: PenTool, title: "Content Created", caption: "Bagworkers make content" },
  { icon: Eye, title: "More Attention", caption: "trading follows attention" },
] as const;

/** Dwell time on each card. */
const STEP_MS = 1100;

export function DiagramFeeRedirect() {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const [step, setStep] = React.useState(0);

  React.useEffect(() => {
    if (reduce || !inView) return;
    const id = window.setInterval(
      () => setStep((p) => (p + 1) % STEPS.length),
      STEP_MS,
    );
    return () => window.clearInterval(id);
  }, [reduce, inView]);

  // -1 = nothing highlighted: the pipeline reads as one static, drawn chain
  const activeStep = reduce ? -1 : step;

  return (
    <div
      ref={ref}
      className="rounded-xl border border-white/10 bg-[#17140e] p-4 sm:p-6"
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span className="docs-mono text-[10px] font-bold uppercase tracking-widest text-[#ffe70e]/70">
          FEE REDIRECT CYCLE
        </span>
        <span className="docs-mono flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/60">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-[#bdfe00] pulse-dot"
          />
          {activeStep >= 0
            ? `step ${activeStep + 1} / ${STEPS.length} · self-fueling loop`
            : `${STEPS.length} steps · closes the loop`}
        </span>
      </header>

      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
        {STEPS.map((s, i) => {
          const isActive = activeStep === i;
          const Icon = s.icon;
          return (
            <li key={s.title} className="relative h-full">
              <div
                className="relative flex h-full flex-col gap-2.5 overflow-hidden rounded-lg border p-3 transition-colors duration-200"
                style={{
                  borderColor: isActive
                    ? "rgba(189,254,0,0.35)"
                    : "rgba(255,255,255,0.08)",
                  backgroundColor: isActive ? "rgba(189,254,0,0.05)" : "#0f0d08",
                }}
              >
                {/* the single animated element: the flow rail */}
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-[2px] origin-left bg-gradient-to-r from-[#bdfe00] to-[#bdfe00]/30"
                  initial={false}
                  animate={{
                    scaleX: reduce || isActive ? 1 : 0,
                    opacity: reduce ? 0.28 : 1,
                  }}
                  transition={
                    isActive
                      ? { duration: STEP_MS / 1000, ease: "linear" }
                      : { duration: 0 }
                  }
                />
                {isActive ? (
                  <motion.span
                    aria-hidden="true"
                    layoutId="fee-redirect-flow"
                    className="absolute left-0 top-0 size-1.5 rounded-full bg-[#bdfe00]"
                    style={{ boxShadow: "0 0 8px rgba(189,254,0,0.9)" }}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}

                <div className="flex items-center justify-between gap-2">
                  <span
                    className="docs-mono text-[10px] font-bold tabular-nums tracking-widest"
                    style={{
                      color: isActive ? "#ffe70e" : "rgba(255,255,255,0.32)",
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    aria-hidden="true"
                    className="flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors duration-200"
                    style={{
                      borderColor: isActive
                        ? "rgba(189,254,0,0.35)"
                        : "rgba(255,255,255,0.08)",
                      backgroundColor: isActive
                        ? "rgba(189,254,0,0.10)"
                        : "rgba(255,255,255,0.02)",
                      color: isActive ? "#bdfe00" : "rgba(255,255,255,0.45)",
                    }}
                  >
                    <Icon className="size-3.5" />
                  </span>
                </div>

                <span
                  className="docs-mono text-[11px] font-bold uppercase leading-tight tracking-wider"
                  style={{
                    color: isActive ? "#ffffff" : "rgba(255,255,255,0.62)",
                  }}
                >
                  {s.title}
                </span>

                <span className="mt-auto text-[10px] leading-relaxed text-white/55">
                  {s.caption}
                </span>
              </div>

              {/* Connector, centred in the 16px gutter: `left-full` puts the box
                  at the card's right edge, the 2px leading margin is
                  (gutter 16px − arrow 12px) / 2. Lights up as the flow leaves
                  the card so the direction stays readable. */}
              {i < STEPS.length - 1 ? (
                <ArrowRight
                  aria-hidden="true"
                  className="absolute top-1/2 left-full ml-0.5 hidden size-3 -translate-y-1/2 transition-colors duration-200 lg:block"
                  style={{
                    color: isActive
                      ? "rgba(189,254,0,0.85)"
                      : "rgba(255,255,255,0.32)",
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      {/* loop-back rail: the chain closes from the last card into the first */}
      <div className="mt-4 flex items-center gap-3 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
        <RefreshCw
          aria-hidden="true"
          className="size-3.5 shrink-0 text-[#bdfe00]"
        />
        <span className="docs-mono text-[10px] font-bold uppercase tracking-widest text-[#bdfe00]">
          05 → 01
        </span>
        <span
          aria-hidden="true"
          className="h-px flex-1 bg-gradient-to-r from-[#bdfe00]/45 via-[#bdfe00]/15 to-transparent"
        />
        <span className="docs-mono text-[10px] uppercase tracking-wider text-white/55">
          cycle closes
        </span>
      </div>
    </div>
  );
}

