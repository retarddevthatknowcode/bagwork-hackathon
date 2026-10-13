"use client";

import { motion, AnimatePresence } from "framer-motion";
import * as React from "react";
import { ShieldCheck, Bot, Eye, Lock, ScanLine, Fingerprint, CheckCircle2 } from "lucide-react";
import { useStats } from "@/lib/queries";
import { FLOW_CARD_MS, useSequential } from "./flow-card";

// === SEQUENTIAL ANTI-BOTS (same card system as steps + features) ===

const CARD_MS = FLOW_CARD_MS;
/**
 * The protection layers, and only the protection layers.
 *
 * This section's job is narrow on purpose: everything here answers "how is the money kept away
 * from fake work". The product story — marketplace, payouts, points, quests, the $BAG loop —
 * lives in the section above it, so no card is repeated across the two.
 */
const LAYERS = [
  { icon: Bot, title: "BOT DETECTION", desc: "Engagement velocity and ratio analysis flag inflated traffic before a payout is built. Real numbers, or no payment." },
  { icon: ScanLine, title: "AI QUALITY SCORING", desc: "An LLM reads every submission for genuine creator effort. Copy-paste, filler and slop get rejected with the reason shown." },
  { icon: Fingerprint, title: "SOCIAL VERIFICATION", desc: "A submitted link has to belong to an account you actually connected. Claiming someone else's post fails ownership checks." },
  { icon: Eye, title: "HUMAN REVIEW", desc: "A person reads what the engine flags. Edge cases get a judgement call, not an automatic reject." },
  { icon: ShieldCheck, title: "FARMING PROTECTION", desc: "Duplicate links, repeated content and multi-account rings are caught across campaigns — not just within one." },
  { icon: Lock, title: "HOLDER VERIFICATION", desc: "On gated Bags the token balance is read from the chain at submission time, so a multiplier can't be faked." },
];

const MOCKS = [MockBotDetect, MockAIScore, MockSocial, MockHumanReview, MockFarming, MockHolder];

/*
 * The step states and the timing come from `./flow-card`, the same hook and card the creator
 * flow and the publisher flow use.
 */

export function AntiBots() {
  const { active, completed } = useSequential(LAYERS.length, CARD_MS);

  return (
    <section id="anti-abuse" className="relative overflow-hidden border-b border-white/10 bg-[#0f0d08]">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#bdfe00]/5 blur-[120px]" />
      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-red-400">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 pulse-dot" />
            ANTI-ABUSE LAYERS
          </div>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl">
            NO BOTS. <span className="text-[#bdfe00]">NO SLOP.</span>
          </h2>
          <p className="mt-4 text-sm text-white/50">
            Six independent layers stand between a fake post and a payout. If it isn't real, it doesn't get paid. Period.
          </p>
          <p className="mt-2 text-[10px] uppercase tracking-widest text-white/30">
            Panels below illustrate the checks, not live figures
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {LAYERS.map((l, i) => {
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
                  state === "active" ? "border-[#bdfe00]/40 bg-[#0b0a07] shadow-[0_0_28px_-6px_rgba(189,254,0,0.2)]" :
                  state === "done" ? "border-[#bdfe00]/20 bg-[#0b0a07]" :
                  "border-white/10 bg-[#0b0a07]"
                }`}
              >
                <div className={`absolute inset-x-0 top-0 h-[2px] transition-all duration-300 ${
                  state === "active" ? "bg-[#bdfe00] opacity-100" : state === "done" ? "bg-[#bdfe00]/30 opacity-100" : "opacity-0"
                }`} style={{ boxShadow: state === "active" ? "0 0 8px #bdfe00" : "none" }} />
                <div className="flex items-center justify-between">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors duration-500 ${
                    state === "active" ? "border-[#bdfe00]/30 bg-[#bdfe00]/10" : state === "done" ? "border-[#bdfe00]/15 bg-[#bdfe00]/5" : "border-[#bdfe00]/10 bg-[#bdfe00]/5"
                  }`}>
                    <l.icon className={`h-5 w-5 transition-colors duration-500 ${state === "active" ? "text-[#bdfe00]" : state === "done" ? "text-[#bdfe00]/60" : "text-[#bdfe00]/30"}`} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {state === "done" && <CheckCircle2 className="h-4 w-4 text-[#bdfe00]/60" />}
                    <span className={`text-2xl font-bold transition-colors duration-500 ${state === "active" ? "text-[#bdfe00]" : state === "done" ? "text-[#bdfe00]/40" : "text-white/10"}`}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                </div>
                <h3 className="mt-4 text-sm font-bold uppercase tracking-wide text-white">{l.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-white/50">{l.desc}</p>
                <div className="mt-4 h-[80px] overflow-hidden rounded-lg border border-white/5 bg-black/40 p-3">
                  <Mock active={isActive} done={isDone} />
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* real platform averages from /api/stats */}
        <TrustBanner />
      </div>
    </section>
  );
}

/**
 * Real platform averages.
 *
 * This banner previously asserted fixed numbers — "98/100 trust", "99.4% fake traffic
 * blocked", "100% payouts settled" — none of which were derived from anything. Every
 * figure here now comes from `/api/stats` and shows an em dash until it loads.
 */
function TrustBanner() {
  const { data: stats } = useStats();

  return (
    <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-black/40 p-6 text-center sm:flex-row sm:justify-between sm:text-left">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-white/40">
          AVG CREATOR TRUST SCORE
        </div>
        <div className="mt-1 text-2xl font-bold text-[#bdfe00]">
          {stats ? `${stats.trustAvg} / 100` : "—"}
        </div>
      </div>
      <div className="flex items-center gap-6 text-xs text-white/50">
        <TrustStat
          label="SUBMISSIONS REVIEWED"
          val={stats ? String(stats.totalSubmissions) : "—"}
        />
        <TrustStat
          label="AVG PAYOUT"
          val={stats ? `$${stats.avgPayout}` : "—"}
        />
        <TrustStat
          label="ACTIVE CAMPAIGNS"
          val={stats ? String(stats.activeCampaigns) : "—"}
        />
      </div>
    </div>
  );
}

function TrustStat({ label, val }: { label: string; val: string }) {
  return (
    <div>
      <div className="text-lg font-bold text-white">{val}</div>
      <div className="text-[9px] uppercase tracking-widest text-white/40">{label}</div>
    </div>
  );
}

// === MOCKS: active=animating, done=frozen, idle=dimmed ===

function MockBotDetect({ active, done }: { active: boolean; done: boolean }) {
  const [bars, setBars] = React.useState([30, 50, 25, 70, 40, 20]);
  const [stamped, setStamped] = React.useState(false);

  React.useEffect(() => {
    if (done) { setBars([35, 55, 30, 75, 45, 25]); setStamped(true); return; }
    if (!active) { setStamped(false); return; }
    const id = setInterval(() => {
      setBars(prev => prev.map(() => 15 + Math.floor(Math.random() * 70)));
      setStamped(Math.random() > 0.4);
    }, 800);
    return () => clearInterval(id);
  }, [active, done]);

  return (
    <div className="relative h-[52px]">
      {/* Bar chart */}
      <div className="flex items-end gap-1.5 h-full">
        {bars.map((h, i) => (
          <div key={i} className={`flex-1 rounded-t transition-all duration-500 ${(active || done) ? "bg-[#bdfe00]/30" : "bg-white/10"}`} style={{ height: `${h}%` }} />
        ))}
      </div>
      {/* Big red stamp animation */}
      <AnimatePresence>
        {stamped && (active || done) && (
          <motion.div
            initial={{ scale: 3, opacity: 0, rotate: -15 }}
            animate={{ scale: 1, opacity: 1, rotate: -8 }}
            exit={{ opacity: 0, scale: 1.5 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="rounded-lg border-[3px] border-red-500 px-3 py-1 text-lg font-black uppercase tracking-widest text-red-500" style={{ textShadow: "0 0 12px rgba(239,68,68,0.5)", boxShadow: "0 0 16px rgba(239,68,68,0.3)" }}>
              BLOCKED
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MockAIScore({ active, done }: { active: boolean; done: boolean }) {
  const [pct, setPct] = React.useState(0);
  React.useEffect(() => {
    if (done) { setPct(88); return; }
    if (!active) { setPct(0); return; }
    let p = 0;
    const id = setInterval(() => { p = Math.min(88, p + 8); setPct(p); }, 300);
    return () => clearInterval(id);
  }, [active, done]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="uppercase tracking-wider text-white/40">QUALITY</span>
        <span className={`font-bold ${(active || done) ? "text-[#bdfe00]" : "text-white/30"}`}>{(active || done) ? `${pct}/100` : "—"}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[#bdfe00] transition-all duration-300" style={{ width: `${pct}%`, boxShadow: pct > 0 ? "0 0 4px rgba(189,254,0,0.4)" : "none" }} />
      </div>
      <div className="text-[9px] uppercase tracking-wider text-white/40">
        {active ? "ANALYZING…" : done ? "PASSED ✓" : "WAITING"}
      </div>
    </div>
  );
}

/** Holder balance read straight off the chain. */
function MockHolder({ active, done }: { active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="text-white/40">BALANCE</span>
      <span className={(active || done) ? "text-white" : "text-white/30"}>{(active || done) ? "1.2M BONK" : "—"}</span>
      <span className={(active || done) ? "text-[#bdfe00]" : "text-white/30"}>✓</span>
    </div>
  );
}

/** The submitted link has to match an account the creator actually connected. */
function MockSocial({ active, done }: { active: boolean; done: boolean }) {
  const bright = active || done;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="uppercase tracking-wider text-white/40">POST OWNER</span>
        <span className={bright ? "text-white" : "text-white/30"}>
          {bright ? "@you · connected" : "—"}
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="uppercase tracking-wider text-white/40">LINK MATCH</span>
        <span className={bright ? "text-[#bdfe00]" : "text-white/30"}>
          {active ? "CHECKING…" : done ? "MATCHED ✓" : "—"}
        </span>
      </div>
    </div>
  );
}

/** A person reading what the engine flagged, then clearing it. */
function MockHumanReview({ active, done }: { active: boolean; done: boolean }) {
  const [verdict, setVerdict] = React.useState<"none" | "reading" | "approved">("none");

  React.useEffect(() => {
    if (done) {
      setVerdict("approved");
      return;
    }
    if (!active) {
      setVerdict("none");
      return;
    }
    setVerdict("reading");
    const t = setTimeout(() => setVerdict("approved"), 1200);
    return () => clearTimeout(t);
  }, [active, done]);

  const bright = active || done;
  const label = verdict === "approved" ? "APPROVED ✓" : verdict === "reading" ? "IN REVIEW" : "—";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="uppercase tracking-wider text-white/40">REVIEWER</span>
        <span className={bright ? "text-white" : "text-white/30"}>
          {bright ? "human · queued" : "—"}
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="uppercase tracking-wider text-white/40">VERDICT</span>
        <span className={verdict === "approved" ? "text-[#bdfe00]" : bright ? "text-white/60" : "text-white/30"}>
          {label}
        </span>
      </div>
    </div>
  );
}

/** The same link, or the same content, turning up twice. */
function MockFarming({ active, done }: { active: boolean; done: boolean }) {
  const [seen, setSeen] = React.useState(0);

  React.useEffect(() => {
    if (done) {
      setSeen(2);
      return;
    }
    if (!active) {
      setSeen(0);
      return;
    }
    const t = setTimeout(() => setSeen(2), 700);
    return () => clearTimeout(t);
  }, [active, done]);

  const bright = active || done;
  const duplicate = seen > 1;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="uppercase tracking-wider text-white/40">LINK SEEN</span>
        <span className={bright ? "text-white" : "text-white/30"}>
          {bright ? `${seen}×` : "—"}
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="uppercase tracking-wider text-white/40">VERDICT</span>
        <span className={duplicate ? "text-[#ff6b35]" : bright ? "text-white/60" : "text-white/30"}>
          {duplicate ? "DUPLICATE — REJECTED" : bright ? "CLEAR" : "—"}
        </span>
      </div>
    </div>
  );
}

/*
 * The escrow and transparent-payout panels that used to sit beside these were removed: payouts
 * are a product advantage, and they are covered once, in the marketplace section above.
 */

