"use client";

import * as React from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import {
  PackagePlus,
  Wallet,
  Settings2,
  PenTool,
  ScanLine,
  Coins,
} from "lucide-react";

/**
 * Diagram A — Campaign Loop (section 02)
 *
 * 6-node flow: Create Bag → Fund → Set Rules → Create Content → Review → Pay
 * arranged in a responsive grid (3 cols on desktop, 2 on tablet, 1 on mobile).
 *
 * A glowing `#bdfe00` dot "travels" through the nodes in order, lighting each
 * up as it arrives, then loops. The active node gets a yellow border + glow
 * + the traveling dot sits on it. Continuously loops via setInterval.
 */

const NODES = [
  { icon: PackagePlus, label: "Create Bag" },
  { icon: Wallet, label: "Fund" },
  { icon: Settings2, label: "Set Rules" },
  { icon: PenTool, label: "Create Content" },
  { icon: ScanLine, label: "Review" },
  { icon: Coins, label: "Pay" },
];

const STEP_MS = 1500;

export function DiagramCampaignLoop() {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const [step, setStep] = React.useState(0);

  // -1 = nothing lit: with reduced motion every node renders in its resting
  // state instead of animating.
  const active = reduce ? -1 : step;

  // The loop only runs while the figure is on screen, so an off-screen diagram
  // costs nothing.
  React.useEffect(() => {
    if (reduce || !inView) return;
    const id = window.setInterval(
      () => setStep((p) => (p + 1) % NODES.length),
      STEP_MS,
    );
    return () => window.clearInterval(id);
  }, [reduce, inView]);

  return (
    <div
      ref={ref}
      className="docs-mono rounded-xl border border-white/10 bg-[#17140e] p-4 sm:p-6"
    >
      {/* eyebrow */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#ffe70e]/70">
          CAMPAIGN LIFECYCLE
        </span>
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40">
          <span className="h-1.5 w-1.5 rounded-full bg-[#bdfe00] pulse-dot" />
          live loop
        </span>
      </div>

      {/* node grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {NODES.map((node, i) => {
          const isActive = active === i;
          const Icon = node.icon;
          return (
            <motion.div
              key={node.label}
              initial={false}
              animate={
                isActive
                  ? { borderColor: "rgba(255,231,14,0.6)" }
                  : { borderColor: "rgba(255,255,255,0.08)" }
              }
              transition={{ duration: 0.3 }}
              className="relative flex flex-col items-center gap-2 rounded-lg border p-3 sm:p-4"
              style={{
                background: isActive ? "rgba(255,231,14,0.06)" : "#0f0d08",
                boxShadow: isActive
                  ? "0 0 24px -4px rgba(255,231,14,0.35), inset 0 0 0 1px rgba(255,231,14,0.25)"
                  : "none",
              }}
            >
              {/* step number */}
              <span
                className="absolute left-2 top-2 text-[10px] font-bold tabular-nums tracking-wider"
                style={{
                  color: isActive ? "rgba(255,231,14,0.9)" : "rgba(255,255,255,0.25)",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>

              {/* traveling light dot — sits on the active node */}
              {isActive && (
                <motion.span
                  layoutId="campaign-loop-light"
                  className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-[#bdfe00]"
                  style={{
                    boxShadow:
                      "0 0 10px rgba(189,254,0,0.95), 0 0 22px rgba(189,254,0,0.55)",
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 380,
                    damping: 30,
                  }}
                >
                  <span className="absolute inset-0 rounded-full bg-[#bdfe00]/60 animate-ping" />
                </motion.span>
              )}

              {/* icon */}
              <Icon
                className="h-6 w-6 sm:h-7 sm:w-7"
                style={{
                  color: isActive ? "#ffe70e" : "rgba(255,255,255,0.4)",
                }}
              />
              <span
                className="text-[10px] font-bold uppercase tracking-wider sm:text-[11px]"
                style={{
                  color: isActive ? "#ffffff" : "rgba(255,255,255,0.5)",
                }}
              >
                {node.label}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* loop indicator */}
      <div className="mt-4 flex items-center justify-center gap-2 text-[10px] uppercase tracking-wider text-white/40">
        <span className="text-[#bdfe00]">↻</span>
        <span>
          {active >= 0
            ? `step ${active + 1} of ${NODES.length} · loops continuously`
            : `${NODES.length} steps · loops continuously`}
        </span>
      </div>
    </div>
  );
}
