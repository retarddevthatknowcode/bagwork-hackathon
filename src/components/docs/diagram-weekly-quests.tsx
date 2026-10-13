"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CalendarClock, Check, Coins, X } from "lucide-react";

import {
  STARTER_WEEKLY_QUESTS,
  WEEKLY_QUEST_REWARD,
  questMetricMeta,
} from "@/lib/quests/weekly";

/**
 * Diagram — Weekly Quests (section 12).
 *
 * Three beats, top to bottom:
 *
 *   1. the three quests, each as a row: what it asks for, what it pays, and a bar that fills on
 *      scroll — every number read from `lib/quests/weekly.ts`, the same module the engine is
 *      seeded from, so the docs cannot quote a target the database does not use;
 *   2. what counts against what never does, side by side — the rule of the system, stated where
 *      it is hardest to misread;
 *   3. the week itself: seven days, one reset, and the ceiling that makes the reset mean
 *      something.
 *
 * Motion is limited to `opacity` and `transform`, and reduced motion gets the settled state
 * (filled bars, no stagger).
 */

const TOTAL_AVAILABLE = STARTER_WEEKLY_QUESTS.reduce((sum, quest) => sum + quest.reward, 0);

/** The verified actions that can move a quest. Mirrors the three metrics in the engine. */
const COUNTS = [
  "Opting into a live bag you have not claimed yet",
  "A post link that passed submission validation",
  "Views on a submission the review engine approved",
];

/** The things that look like progress and are not. */
const NEVER_COUNTS = [
  "A submission still pending, or one that was rejected",
  "View or like counts typed in (nothing here reads a client number)",
  "The same bag claimed twice, or the same link submitted again",
];

function QuestRows({ reduce }: { reduce: boolean }) {
  return (
    <div className="mt-4 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
          This week&apos;s three quests
        </span>
        <span className="text-[10px] uppercase tracking-wider text-white/30">
          {TOTAL_AVAILABLE.toLocaleString("en-US")} points available
        </span>
      </div>

      {STARTER_WEEKLY_QUESTS.map((quest, index) => {
        const meta = questMetricMeta(quest.metric);
        // Shown mid-flight so the bars read as work in progress rather than as decoration.
        const filled = index === 0 ? 66 : index === 1 ? 40 : 62;

        return (
          <div
            key={quest.slug}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-2.5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-[12px] font-semibold text-white">{quest.title}</span>
              <span className="font-mono text-[10px] tabular-nums text-white/40">
                {quest.target.toLocaleString("en-US")} {meta.unit}
              </span>
            </div>

            <div className="mt-2 flex items-center gap-2.5">
              <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 origin-left rounded-full bg-gradient-to-r from-[#ffe70e] to-[#bdfe00]"
                  style={{ width: `${filled}%` }}
                  initial={reduce ? false : { scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{
                    duration: 0.5,
                    ease: [0.22, 0.61, 0.36, 0.98],
                    delay: index * 0.08,
                  }}
                />
              </span>
              <span className="shrink-0 rounded border border-[#ffe70e]/25 bg-[#ffe70e]/10 px-1.5 py-px font-mono text-[10px] font-bold tabular-nums text-[#ffe70e]">
                +{quest.reward} pts
              </span>
            </div>

            <p className="mt-1.5 text-[10px] leading-relaxed text-white/40">{meta.counts}</p>
          </div>
        );
      })}
    </div>
  );
}

function RuleSplit() {
  return (
    <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
      <div className="rounded-lg border border-[#bdfe00]/20 bg-black/40 p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#bdfe00]">
          <Check aria-hidden="true" className="h-3.5 w-3.5" />
          Verified work only
        </div>
        <ul className="mt-2 space-y-1.5">
          {COUNTS.map((item) => (
            <li key={item} className="flex items-start gap-2 text-[11px] text-white/60">
              <Check aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-[#bdfe00]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-[#ff6b35]/20 bg-black/40 p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#ff6b35]">
          <X aria-hidden="true" className="h-3.5 w-3.5" />
          Never counts
        </div>
        <ul className="mt-2 space-y-1.5">
          {NEVER_COUNTS.map((item) => (
            <li key={item} className="flex items-start gap-2 text-[11px] text-white/60">
              <X aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-[#ff6b35]" />
              <span className="line-through decoration-[#ff6b35]/60">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The week: seven days, one reset, one ceiling. */
function WeekStrip() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-black/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/50">
          <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
          One week, one reset
        </span>
        <span className="text-[10px] uppercase tracking-wider text-white/30">
          Monday 00:00 UTC
        </span>
      </div>

      <div className="mt-2.5 flex gap-1">
        {days.map((day) => (
          <span
            key={day}
            className="flex-1 rounded border border-white/[0.06] bg-white/[0.03] px-1 py-1 text-center text-[10px] font-medium text-white/40"
          >
            {day.slice(0, 1)}
            <span className="sr-only">{day}</span>
          </span>
        ))}
        <span className="flex shrink-0 items-center rounded border border-[#bdfe00]/30 bg-[#bdfe00]/10 px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#bdfe00]">
          Reset
        </span>
      </div>

      <p className="mt-2.5 text-[10px] leading-relaxed text-white/40">
        Progress is measured inside the week and nowhere else: what you completed stays on your
        profile as {WEEKLY_QUEST_REWARD} points per quest, and the quest itself starts again from
        zero next Monday. Completing all three is worth{" "}
        <span className="font-semibold text-white/70">{TOTAL_AVAILABLE} points a week</span> —
        earned the same way everything else is, by work that was verified.
      </p>
    </div>
  );
}

/** The diagram as it appears in the documentation. */
export function DiagramWeeklyQuests() {
  const reduce = useReducedMotion();

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#17140e] p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#ffe70e]/70">
          Weekly Quests
        </span>
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40">
          <Coins aria-hidden="true" className="h-3.5 w-3.5 text-[#ffe70e]" />
          {STARTER_WEEKLY_QUESTS.length} quests · {WEEKLY_QUEST_REWARD} points each
        </span>
      </div>

      <QuestRows reduce={Boolean(reduce)} />
      <RuleSplit />
      <WeekStrip />
    </div>
  );
}

