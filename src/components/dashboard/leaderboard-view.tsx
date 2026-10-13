"use client";

import { motion } from "framer-motion";
import { Trophy, ArrowLeft } from "lucide-react";
import { useLeaderboard } from "@/lib/queries";
import { useApp } from "@/lib/store";
import { NeonButton } from "@/components/site/neon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedCounter } from "@/components/site/animated-counter";
import type { LeaderboardEntry } from "@/lib/types";

const BADGE_STYLE: Record<
  NonNullable<LeaderboardEntry["badge"]>,
  string
> = {
  DIAMOND: "from-cyan-300 to-blue-500 text-black",
  PLATINUM: "from-slate-200 to-slate-400 text-black",
  GOLD: "from-yellow-300 to-yellow-500 text-black",
  SILVER: "from-slate-300 to-slate-500 text-black",
  BRONZE: "from-orange-300 to-orange-600 text-black",
};

export function LeaderboardView() {
  const { data, isLoading } = useLeaderboard();
  const go = useApp((s) => s.go);
  const entries = data?.leaderboard ?? [];
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#eab308]/30 bg-[#eab308]/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#eab308]">
            <Trophy className="h-3 w-3" />
            BAGWORKERS LEADERBOARD
          </div>
          <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
            TOP <span className="text-[#bdfe00]">EARNERS</span>
          </h1>
        </div>
        <NeonButton variant="outline" size="md" onClick={() => go({ name: "landing" })}>
          <ArrowLeft className="h-3.5 w-3.5" /> BACK
        </NeonButton>
      </div>

      {/* Podium */}
      {!isLoading && podium.length === 3 && (
        <div className="mb-8 grid grid-cols-3 gap-3 sm:gap-4">
          {podium.map((e, i) => (
            <PodiumCard key={e.wallet} entry={e} place={i + 1} />
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#13110c]">
        <div className="hidden grid-cols-[60px_1fr_1fr_100px_120px_80px] gap-2 border-b border-white/10 bg-[#17140e] px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-white/40 sm:grid">
          <span>RANK</span>
          <span>BAGWORKER</span>
          <span>WALLET</span>
          <span>TRUST</span>
          <span>EARNED</span>
          <span>BADGE</span>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg bg-white/10" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {rest.map((e, i) => (
              <Row key={e.wallet} entry={e} index={i + 4} />
            ))}
          </div>
        )}
      </div>

      {/* mobile table */}
      <div className="mt-4 sm:hidden">
        <p className="text-[10px] uppercase tracking-wider text-white/40">
          Scroll horizontally to view all stats →
        </p>
      </div>

      {/* footer CTA */}
      <div className="mt-10 rounded-2xl border border-[#bdfe00]/20 bg-[#bdfe00]/5 p-6 text-center">
        <h3 className="text-xl font-bold text-white">
          CLIMB THE RANKS. <span className="text-[#bdfe00]">EARN MORE.</span>
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/50">
          Every approved submission raises your trust score. Top creators unlock
          instant approvals, premium campaigns, and lifetime multipliers.
        </p>
        <NeonButton className="mt-4" arrow onClick={() => go({ name: "landing" })}>
          START EARNING
        </NeonButton>
      </div>
    </div>
  );
}

function PodiumCard({
  entry,
  place,
}: {
  entry: LeaderboardEntry;
  place: number;
}) {
  const heights = ["h-32", "h-24", "h-20"];
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: place * 0.1 }}
      className={
        "relative flex flex-col items-center rounded-2xl border p-4 text-center " +
        (place === 1
          ? "border-[#bdfe00]/40 bg-[#bdfe00]/10"
          : "border-white/10 bg-[#13110c]")
      }
    >
      <div className="text-2xl">{medals[place - 1]}</div>
      <div className="mt-1 truncate text-sm font-bold text-white">
        {entry.handle}
      </div>
      <div className="text-[10px] text-white/40">{entry.wallet}</div>
      <div
        className={
          "mt-2 grid w-full " + heights[place - 1] + " place-items-center rounded-lg bg-[#bdfe00]/5"
        }
      >
        <div>
          <div className="text-lg font-bold text-[#bdfe00]">
            ${entry.totalEarned.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
          <div className="text-[9px] uppercase tracking-wider text-white/40">
            EARNED
          </div>
        </div>
      </div>
      <div className="mt-2 text-[10px] uppercase tracking-wider text-white/50">
        TRUST: <span className="text-[#bdfe00]">{entry.trustScore}</span>
      </div>
    </motion.div>
  );
}

function Row({ entry, index }: { entry: LeaderboardEntry; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="grid grid-cols-[40px_1fr_100px_80px] items-center gap-2 px-4 py-3 text-xs sm:grid-cols-[60px_1fr_1fr_100px_120px_80px]"
    >
      <span className="text-sm font-bold text-white/40">#{index}</span>
      <div className="min-w-0">
        <div className="truncate font-bold text-white">{entry.handle}</div>
        <div className="text-[10px] text-white/40">
          {entry.submissions} subs · {entry.approvalRate}% approval
        </div>
      </div>
      <span className="hidden truncate text-[10px] text-white/50 sm:block">
        {entry.wallet}
      </span>
      <div className="flex items-center gap-1.5">
        <div className="hidden h-1.5 w-10 overflow-hidden rounded-full bg-white/10 sm:block">
          <div
            className="h-full rounded-full bg-[#bdfe00]"
            style={{ width: `${entry.trustScore}%` }}
          />
        </div>
        <span className="text-[#bdfe00]">{entry.trustScore}</span>
      </div>
      <AnimatedCounter
        value={entry.totalEarned}
        prefix="$"
        className="font-bold text-white"
      />
      <div className="text-right">
        {entry.badge ? (
          <span
            className={
              "inline-block rounded bg-gradient-to-r px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider " +
              BADGE_STYLE[entry.badge]
            }
          >
            {entry.badge}
          </span>
        ) : (
          <span className="text-[9px] uppercase tracking-wider text-white/30">
            —
          </span>
        )}
      </div>
    </motion.div>
  );
}
