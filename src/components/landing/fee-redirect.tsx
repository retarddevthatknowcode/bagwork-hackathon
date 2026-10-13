"use client";

import * as React from "react";
import { Activity, Route, RefreshCw, TrendingUp, Users, Eye } from "lucide-react";

import { FLOW_CARD_MS, MockBar, MockMetric, StepCard, useSequential } from "./flow-card";

/**
 * Fee Redirect — the loop that funds a Bag out of its own market.
 *
 * This is the part of the product that is hardest to explain and easiest to fall in love with,
 * and it was nowhere on the homepage. The mechanism is real and already shipped:
 *
 *   · a token routes creator/trading fees to Bagwork's fee address (`/api/fees/sync` picks the
 *     transfers up, matching them on the mint);
 *   · each one is recorded as a `FeeDeposit` and swapped to USDC;
 *   · the USDC is credited to that mint's Bag budget — `feeRaisedUsdc` on the campaign.
 *
 * The six cards below are that sequence, in the same card shape as the creator and publisher
 * flows so the page reads as one system rather than three.
 */

const STEPS = [
  {
    icon: Activity,
    title: "TRADING",
    desc: "The token trades all day, on its own. Nobody is thinking about marketing while that happens.",
  },
  {
    icon: Route,
    title: "FEES ROUTED",
    desc: "A share of the creator or trading fees is pointed at Bagwork instead of a private wallet.",
  },
  {
    icon: RefreshCw,
    title: "AUTO-CONVERTED",
    desc: "Every deposit that lands is swapped to USDC, so the budget is priced in something stable.",
  },
  {
    icon: TrendingUp,
    title: "CONTENT BUDGET GROWS",
    desc: "The USDC becomes that Bag's budget. The market has started paying for its own marketing.",
  },
  {
    icon: Users,
    title: "BAGWORKERS CREATE",
    desc: "A bigger budget means more slots and better rates. Creators claim them and post.",
  },
  {
    icon: Eye,
    title: "MORE ATTENTION",
    desc: "The content brings eyes back to the token — and more eyes mean more volume.",
  },
];

const MOCKS = [MockVolume, MockRouted, MockConvert, MockBudget, MockCreators, MockLoop];

export function FeeRedirect() {
  const { active, completed } = useSequential(STEPS.length, FLOW_CARD_MS);

  return (
    <section id="fee-redirect" className="relative overflow-hidden border-b border-white/10 bg-[#13110c]">
      <div className="pointer-events-none absolute right-[-10%] top-[-20%] h-[520px] w-[520px] rounded-full bg-[#bdfe00]/5 blur-[130px]" />
      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#bdfe00]/30 bg-[#bdfe00]/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#bdfe00]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#bdfe00] pulse-dot" />
            FEE REDIRECT
          </div>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl">
            TURN TRADING FEES <span className="text-[#bdfe00]">INTO CONTENT.</span>
          </h2>
          <p className="mt-4 text-sm text-white/50">
            Point a token&apos;s creator fees, or a share of its trading fees, at Bagwork. They
            arrive on-chain, convert to USDC, and go straight into a Bag&apos;s budget.
          </p>
          <p className="mt-2 text-[10px] uppercase tracking-widest text-white/30">
            Panels below illustrate the loop, not live figures
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, i) => {
            const Mock = MOCKS[i];
            return (
              <StepCard
                key={step.title}
                n={String(i + 1).padStart(2, "0")}
                icon={step.icon}
                title={step.title}
                desc={step.desc}
                active={active === i}
                done={completed[i]}
              >
                <Mock active={active === i} done={completed[i]} />
              </StepCard>
            );
          })}
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-[#bdfe00]/20 bg-[#bdfe00]/5 p-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <p className="text-sm text-white/70">
            The loop runs itself: volume pays for the content that drives volume.
          </p>
          <a
            href="/docs"
            className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#bdfe00] hover:underline"
          >
            See how Fee Redirect works
            <span aria-hidden>→</span>
          </a>
        </div>
      </div>
    </section>
  );
}

// === MOCKS: active=animating, done=frozen final state, idle=dimmed ===

/** Volume, happening on its own. */
function MockVolume({ active, done }: { active: boolean; done: boolean }) {
  const [bars, setBars] = React.useState([30, 45, 35, 60, 40, 55]);

  React.useEffect(() => {
    if (done) {
      setBars([40, 55, 45, 70, 50, 65]);
      return;
    }
    if (!active) return;
    const id = setInterval(
      () => setBars((prev) => prev.map(() => 20 + Math.floor(Math.random() * 70))),
      700,
    );
    return () => clearInterval(id);
  }, [active, done]);

  const bright = active || done;
  return (
    <div className="space-y-2">
      <MockMetric label="VOLUME 24H" value={bright ? "TRADING" : "—"} bright={bright} />
      <div className="flex h-[34px] items-end gap-1">
        {bars.map((h, i) => (
          <div
            key={i}
            className={`flex-1 rounded-t transition-all duration-500 ${
              bright ? "bg-[#bdfe00]/40" : "bg-white/10"
            }`}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** The fee arriving at Bagwork's fee address. */
function MockRouted({ active, done }: { active: boolean; done: boolean }) {
  const bright = active || done;
  return (
    <div className="space-y-1.5">
      <MockMetric label="ROUTED" value={bright ? "ON" : "—"} bright={bright} />
      <div className="rounded-md border border-white/10 bg-black/60 px-2 py-1 text-[10px] text-white/60">
        {bright ? "FEE ADDRESS · BAGWORK" : "—"}
      </div>
      <MockMetric label="DEPOSIT" value={bright ? "RECEIVED" : "—"} bright={bright} tone="lime" />
    </div>
  );
}

/** Token in, USDC out. */
function MockConvert({ active, done }: { active: boolean; done: boolean }) {
  const [swapped, setSwapped] = React.useState(false);

  React.useEffect(() => {
    if (done) {
      setSwapped(true);
      return;
    }
    if (!active) {
      setSwapped(false);
      return;
    }
    const t = setTimeout(() => setSwapped(true), 800);
    return () => clearTimeout(t);
  }, [active, done]);

  const bright = active || done;
  return (
    <div className="space-y-1">
      <MockMetric label="IN" value={bright ? "TOKEN" : "—"} bright={bright} />
      <div
        className={`text-center text-[10px] transition-colors duration-500 ${
          swapped ? "text-[#bdfe00]" : "text-white/25"
        }`}
      >
        ↓ swap
      </div>
      <MockMetric
        label="OUT"
        value={swapped ? "USDC" : bright ? "SWAPPING…" : "—"}
        bright={bright}
        tone="lime"
      />
    </div>
  );
}

/** The Bag budget climbing with every deposit. */
function MockBudget({ active, done }: { active: boolean; done: boolean }) {
  const [pct, setPct] = React.useState(0);

  React.useEffect(() => {
    if (done) {
      setPct(100);
      return;
    }
    if (!active) {
      setPct(0);
      return;
    }
    let p = 0;
    const id = setInterval(() => {
      p = Math.min(100, p + 12);
      setPct(p);
    }, 200);
    return () => clearInterval(id);
  }, [active, done]);

  const bright = active || done;
  return (
    <div className="space-y-2">
      <MockMetric label="BAG BUDGET" value={bright ? "GROWING" : "—"} bright={bright} tone="lime" />
      <MockBar pct={pct} bright={bright} />
      <MockMetric label="FUNDED BY" value={bright ? "TRADING FEES" : "—"} bright={bright} />
    </div>
  );
}

/** Creators claiming the slots that bigger budget paid for. */
function MockCreators({ active, done }: { active: boolean; done: boolean }) {
  const [slots, setSlots] = React.useState(0);
  const rows = ["SLOT 01 CLAIMED", "SLOT 02 CLAIMED", "SLOT 03 CLAIMED"];

  React.useEffect(() => {
    if (done) {
      setSlots(rows.length);
      return;
    }
    if (!active) {
      setSlots(0);
      return;
    }
    const timers = rows.map((_, i) => window.setTimeout(() => setSlots(i + 1), 400 * (i + 1)));
    return () => timers.forEach((t) => window.clearTimeout(t));
    // The slot list is fixed for the lifetime of the component; only the card state is a dependency.
  }, [active, done]);

  return (
    <div className="space-y-1">
      {rows.map((row, i) => (
        <div
          key={row}
          className={`rounded-md border px-2 py-0.5 text-[10px] transition-all duration-500 ${
            i < slots
              ? "border-[#bdfe00]/25 bg-[#bdfe00]/5 text-[#bdfe00]"
              : "border-white/10 bg-white/5 text-white/25"
          }`}
        >
          {row}
        </div>
      ))}
    </div>
  );
}

/** Attention back at the token — which is where the loop started. */
function MockLoop({ active, done }: { active: boolean; done: boolean }) {
  const bright = active || done;
  return (
    <div className="space-y-1.5">
      <MockMetric label="ATTENTION" value={bright ? "UP" : "—"} bright={bright} tone="lime" />
      <MockMetric label="VOLUME" value={bright ? "UP" : "—"} bright={bright} tone="lime" />
      <div
        className={`pt-1 text-[9px] uppercase tracking-wider transition-colors duration-500 ${
          bright ? "text-white/50" : "text-white/20"
        }`}
      >
        ↻ back to step 01
      </div>
    </div>
  );
}
