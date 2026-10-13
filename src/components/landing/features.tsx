"use client";

import { motion } from "framer-motion";
import * as React from "react";
import { Store, Coins, TrendingUp, Target, Trophy, Flame, CheckCircle2 } from "lucide-react";

import { FLOW_CARD_MS, MockBar, MockMetric, useSequential } from "./flow-card";

// === SEQUENTIAL: active highlights, previous show COMPLETED state, reset on loop ===
//
// This section is the *product* story — what BAGWORK is and why it beats a normal marketplace
// for both sides. Abuse protection is a section of its own further down the page, with its own
// cards: nothing here repeats it, so a visitor reads two different arguments rather than the
// same one twice in different words.

const FEATURES = [
  {
    icon: Store,
    title: "OPEN MARKETPLACE",
    desc: "Anyone can create a Bag, anyone can work one. No invites and no gatekeepers — funded briefs sit in the open, and slots go to whoever claims them.",
  },
  {
    icon: Coins,
    title: "ON-CHAIN PAYOUTS",
    desc: "A Bag's budget is in its treasury before it opens, and approved work settles as an SPL transfer on Solana. Every payout is checkable on Solscan.",
  },
  {
    icon: TrendingUp,
    title: "POINTS, LEVELS & PROFILE",
    desc: "Every approved post earns points. Points raise your level, and your level, earnings and history live on a public Bagworker profile.",
  },
  {
    icon: Target,
    title: "WEEKLY QUESTS",
    desc: "Fresh quests every week, stacking on top of campaign work. Opt in, hit the target, collect — then the board resets and starts again.",
  },
  {
    icon: Trophy,
    title: "LEADERBOARD & REPUTATION",
    desc: "Lifetime points and earnings rank every Bagworker. The top tier wears DIAMOND, and the record travels with the account.",
  },
  {
    icon: Flame,
    title: "5% FEE → $BAG BURN",
    desc: "Bagwork takes 5% of every Bag. Half funds the treasury, half buys back and burns $BAG — so every campaign tightens the supply.",
  },
];

const MOCKS = [FeatureMarketplace, FeatureOnChain, FeatureLevels, FeatureQuests, FeatureRanking, FeatureBurn];

export function Features() {
  const { active, completed } = useSequential(FEATURES.length, FLOW_CARD_MS);

  return (
    <section id="why" className="relative border-b border-white/10 bg-[#0b0a07]">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white/50">
            WHY BAGWORK
          </div>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl">
            THE FAIREST CONTENT <span className="text-[#bdfe00]">REWARDS ENGINE</span>
          </h2>
          <p className="mt-4 text-sm text-white/50">
            Open on both sides: projects fund Bags in the open, creators get paid on-chain, and
            the platform&apos;s own fee feeds back into $BAG.
          </p>
          <p className="mt-2 text-[10px] uppercase tracking-widest text-white/30">
            Panels below illustrate the mechanics, not live figures
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const Mock = MOCKS[i];
            const isActive = i === active;
            const isDone = completed[i];
            const state = isActive ? "active" : isDone ? "done" : "idle";

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className={`relative flex flex-col overflow-hidden rounded-2xl border p-5 transition-all duration-500 ${
                  state === "active" ? "border-[#bdfe00]/40 bg-[#0f0d08] shadow-[0_0_28px_-6px_rgba(189,254,0,0.2)]" :
                  state === "done" ? "border-[#bdfe00]/20 bg-[#0f0d08]" :
                  "border-white/10 bg-[#0f0d08]"
                }`}
              >
                <div className={`absolute inset-x-0 top-0 h-[2px] transition-all duration-300 ${
                  state === "active" ? "bg-[#bdfe00] opacity-100" : state === "done" ? "bg-[#bdfe00]/30 opacity-100" : "opacity-0"
                }`} style={{ boxShadow: state === "active" ? "0 0 8px #bdfe00" : "none" }} />
                <div className="flex items-center justify-between">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors duration-500 ${
                    state === "active" ? "border-[#bdfe00]/30 bg-[#bdfe00]/10" : state === "done" ? "border-[#bdfe00]/15 bg-[#bdfe00]/5" : "border-[#bdfe00]/10 bg-[#bdfe00]/5"
                  }`}>
                    <f.icon className={`h-5 w-5 transition-colors duration-500 ${state === "active" ? "text-[#bdfe00]" : state === "done" ? "text-[#bdfe00]/60" : "text-[#bdfe00]/30"}`} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {state === "done" && <CheckCircle2 className="h-4 w-4 text-[#bdfe00]/60" />}
                    <span className={`text-2xl font-bold transition-colors duration-500 ${state === "active" ? "text-[#bdfe00]" : state === "done" ? "text-[#bdfe00]/40" : "text-white/10"}`}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                </div>
                <h3 className="mt-4 text-sm font-bold uppercase tracking-wide text-white">{f.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-white/50">{f.desc}</p>
                <div className="mt-4 h-[80px] overflow-hidden rounded-lg border border-white/5 bg-black/40 p-3">
                  <Mock active={isActive} done={isDone} />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// === MOCKS: active=animating, done=frozen final state, idle=dimmed ===
//
// Every panel on this page is an illustration of a mechanism, not a live figure.

/** A brief is posted, and a slot is claimed out of the open. */
function FeatureMarketplace({ active, done }: { active: boolean; done: boolean }) {
  const live = active || done;
  return (
    <div className="space-y-1">
      <div className="rounded-md border border-white/10 bg-black/60 px-2 py-1 text-[10px] text-white/60">
        NEW BAG · 500 USDC
      </div>
      <div
        className={`rounded-md border px-2 py-1 text-[10px] transition-all duration-500 ${
          live
            ? "border-[#bdfe00]/30 bg-[#bdfe00]/10 text-[#bdfe00]"
            : "border-white/10 bg-white/5 text-white/30"
        }`}
      >
        {live ? "SLOT CLAIMED ✓" : "SLOT OPEN"}
      </div>
    </div>
  );
}

/** The budget is held in the treasury, then the transfer confirms on-chain. */
function FeatureOnChain({ active, done }: { active: boolean; done: boolean }) {
  const [confirmed, setConfirmed] = React.useState(false);

  React.useEffect(() => {
    if (done) {
      setConfirmed(true);
      return;
    }
    if (!active) {
      setConfirmed(false);
      return;
    }
    const t = setTimeout(() => setConfirmed(true), 900);
    return () => clearTimeout(t);
  }, [active, done]);

  const bright = active || done;
  return (
    <div className="space-y-1.5">
      <MockMetric label="TREASURY" value={bright ? "LOCKED" : "—"} bright={bright} />
      <MockMetric
        label="PAYOUT TX"
        value={active ? (confirmed ? "CONFIRMED ✓" : "SIGNING…") : done ? "CONFIRMED ✓" : "—"}
        bright={bright}
        tone="lime"
      />
    </div>
  );
}

/** Points tick up and carry the level with them. */
function FeatureLevels({ active, done }: { active: boolean; done: boolean }) {
  const [pts, setPts] = React.useState(0);
  const nextLevel = 12_000;

  React.useEffect(() => {
    if (done) {
      setPts(8_420);
      return;
    }
    if (!active) {
      setPts(0);
      return;
    }
    let p = 0;
    const id = setInterval(() => {
      p = Math.min(8_420, p + 1_200);
      setPts(p);
    }, 160);
    return () => clearInterval(id);
  }, [active, done]);

  const bright = active || done;
  return (
    <div className="space-y-2">
      <MockMetric label="POINTS" value={bright ? pts.toLocaleString("en-US") : "—"} bright={bright} />
      <MockBar pct={(pts / nextLevel) * 100} bright={bright} />
      <MockMetric
        label="LEVEL"
        value={bright ? (pts >= 5_000 ? "L2" : "L1") : "—"}
        bright={bright}
        tone="lime"
      />
    </div>
  );
}

/** The week's quests tick off one by one. */
function FeatureQuests({ active, done }: { active: boolean; done: boolean }) {
  const [cleared, setCleared] = React.useState(0);
  const quests = ["OPT-IN STARTER", "CONTENT CREATOR", "VIEW HUNTER"];

  React.useEffect(() => {
    if (done) {
      setCleared(quests.length);
      return;
    }
    if (!active) {
      setCleared(0);
      return;
    }
    const timers = [500, 1000, 1500].map((ms, i) =>
      window.setTimeout(() => setCleared(i + 1), ms),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
    // The quest list is fixed for the lifetime of the component; only the card state is a dependency.
  }, [active, done]);

  return (
    <div className="space-y-1.5">
      {quests.map((quest, i) => {
        const complete = i < cleared;
        return (
          <div key={quest} className="flex items-center gap-1.5 text-[9px]">
            <CheckCircle2
              className={`h-3 w-3 transition-colors duration-300 ${
                complete ? "text-[#bdfe00]" : "text-white/15"
              }`}
            />
            <span className={complete ? "text-white/70" : "text-white/30"}>{quest}</span>
          </div>
        );
      })}
    </div>
  );
}

/** The top of the board, by tier. */
function FeatureRanking({ active, done }: { active: boolean; done: boolean }) {
  const bright = active || done;
  const rows = [
    { rank: "01", tier: "DIAMOND", pts: "26,800" },
    { rank: "02", tier: "PLATINUM", pts: "12,400" },
    { rank: "03", tier: "GOLD", pts: "8,100" },
  ];

  return (
    <div className="space-y-0.5">
      {rows.map((row, i) => (
        <div
          key={row.rank}
          className="flex items-center justify-between text-[9px] leading-none"
        >
          <span className="flex items-center gap-1.5">
            <span className={bright ? "text-white/40" : "text-white/15"}>{row.rank}</span>
            <span
              className={`rounded px-1 py-0.5 font-bold tracking-wider transition-colors duration-500 ${
                bright
                  ? i === 0
                    ? "bg-[#bdfe00]/15 text-[#bdfe00]"
                    : "bg-white/10 text-white/60"
                  : "bg-white/5 text-white/20"
              }`}
            >
              {row.tier}
            </span>
          </span>
          <span className={bright ? "text-white/70" : "text-white/20"}>
            {bright ? `${row.pts} PTS` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The 5% fee splitting 50/50, with the burn half warming up. */
function FeatureBurn({ active, done }: { active: boolean; done: boolean }) {
  const bright = active || done;
  return (
    <div className="space-y-2">
      <MockMetric label="FEE ON PAYOUT" value={bright ? "5%" : "—"} bright={bright} />
      <div className="flex h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full bg-[#bdfe00] transition-all duration-700"
          style={{ width: bright ? "50%" : "0%" }}
        />
        <div
          className="h-full bg-[#ff6b35] transition-all duration-700"
          style={{ width: bright ? "50%" : "0%" }}
        />
      </div>
      <MockMetric
        label="TREASURY / $BAG BURN"
        value={bright ? "50 / 50" : "—"}
        bright={bright}
        tone="lime"
      />
    </div>
  );
}
