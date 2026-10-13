"use client";

import * as React from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { ArrowRight, BadgeCheck, Gauge, History, Store, Tag, UserPlus } from "lucide-react";

import {
  BAGWORKER_NUMBER_EXAMPLE,
  formatBagworkerNumber,
} from "@/lib/profile/points";

/**
 * Diagram — the future profile marketplace (section 11, part 3).
 *
 * Nothing here ships yet, so the diagram says so: it is labelled FUTURE, and it describes the
 * three steps a sale would take plus everything that has to travel with the profile for the
 * sale to be worth anything.
 *
 * Runs as a three-phase loop while it is on screen (list → buy → transfer) and stops as soon as
 * it scrolls away. Reduced motion renders the settled state — ownership transferred — with no
 * loop, because the end state is the information, not the movement.
 */

const STEPS = [
  {
    key: "list",
    label: "List",
    icon: Tag,
    body: "The owner lists the profile. Its points, level and work history are facts already in the record — nobody types them in.",
  },
  {
    key: "buy",
    label: "Buy",
    icon: Store,
    body: "A buyer purchases it. The price is informed by the same record: how much real, settled work the profile represents.",
  },
  {
    key: "transfer",
    label: "Transfer",
    icon: UserPlus,
    body: "Ownership moves together with the Bagworker# number and the profile's entire points and level history.",
  },
] as const;

const PHASE_MS = 2400;

/** What a profile's value would be computed from. Deliberately only three inputs. */
const VALUE_INPUTS = [
  { label: "Total points", icon: Gauge },
  { label: "Level", icon: BadgeCheck },
  { label: "Work history", icon: History },
];

const EASE = [0.22, 0.61, 0.36, 0.98] as const;

export function DiagramProfileMarketplace() {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (reduce || !inView) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % STEPS.length),
      PHASE_MS,
    );
    return () => window.clearInterval(timer);
  }, [reduce, inView]);

  // Reduced motion — and a diagram nobody is looking at — shows the completed state.
  const active = reduce ? STEPS.length - 1 : index;

  return (
    <div
      ref={ref}
      className="docs-mono rounded-xl border border-white/10 bg-[#17140e] p-4 sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#ffe70e]/70">
          Profile marketplace
        </span>
        <span className="rounded-full border border-white/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white/45">
          Future
        </span>
      </div>

      {/* The three steps, with the active one lit. */}
      <ol className="grid gap-2 sm:grid-cols-3">
        {STEPS.map((entry, i) => {
          const isActive = i === active;
          const Icon = entry.icon;
          return (
            <li key={entry.key}>
              <div
                className="flex h-full items-start gap-2.5 rounded-lg border p-3 transition-colors duration-200"
                style={{
                  borderColor: isActive ? "rgba(189,254,0,0.35)" : "rgba(255,255,255,0.08)",
                  backgroundColor: isActive ? "rgba(189,254,0,0.06)" : "rgba(0,0,0,0.4)",
                }}
              >
                <span
                  className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border"
                  style={{
                    borderColor: isActive ? "rgba(189,254,0,0.4)" : "rgba(255,255,255,0.12)",
                    color: isActive ? "#bdfe00" : "rgba(255,255,255,0.45)",
                  }}
                >
                  <Icon aria-hidden="true" className="size-3.5" />
                </span>
                <span className="min-w-0">
                  <span
                    className="block text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: isActive ? "#bdfe00" : "rgba(255,255,255,0.45)" }}
                  >
                    {i + 1}. {entry.label}
                  </span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-white/60">
                    {entry.body}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      {/* What the value is made of → the identity that travels with it. */}
      <div className="mt-4 flex flex-col gap-3 rounded-lg border border-white/10 bg-black/40 p-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          {VALUE_INPUTS.map((input) => {
            const Icon = input.icon;
            return (
              <span
                key={input.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-wider text-white/60"
              >
                <Icon aria-hidden="true" className="size-3 text-[#ffe70e]" />
                {input.label}
              </span>
            );
          })}
        </div>

        <ArrowRight
          aria-hidden="true"
          className="hidden size-3.5 shrink-0 text-white/25 sm:block"
        />

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-white/40">transfers</span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={active}
              initial={reduce ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="rounded-md border border-[#ffe70e]/30 bg-[#ffe70e]/10 px-2 py-0.5 font-bold tabular-nums text-[#ffe70e]"
            >
              {formatBagworkerNumber(BAGWORKER_NUMBER_EXAMPLE)}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>

      <p className="mt-3 text-center text-[10px] uppercase tracking-wider text-white/40">
        Not shipped yet — points and level history would travel with the number
      </p>
    </div>
  );
}
