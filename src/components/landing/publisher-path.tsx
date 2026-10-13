"use client";

import * as React from "react";
import { SquarePen, Wallet, Users, BadgeCheck } from "lucide-react";

import { FLOW_CARD_MS, MockBar, MockMetric, StepCard, useSequential } from "./flow-card";

/**
 * The publisher half of the marketplace.
 *
 * The hero and the "4 simple steps" section below it explain what a *creator* does. Nothing on
 * the page explained what a *project* does, which left the other half of the product invisible —
 * this is that half, in the same four-step shape, using the same cards.
 *
 * Every step here is the real flow: a Bag is created and priced (`/dashboard/create`), the
 * budget is funded into the Bag's treasury, creators claim slots, and only approved work is
 * paid. Nothing is aspirational.
 */

const STEPS = [
  {
    icon: SquarePen,
    title: "CREATE A BAG",
    desc: "Set the brief, the platforms, the rate and the caps. A few minutes, no sales call.",
  },
  {
    icon: Wallet,
    title: "FUND THE BUDGET",
    desc: "Send the budget into the Bag's treasury. It is locked before launch, so creators can see the money is really there.",
  },
  {
    icon: Users,
    title: "BAGWORKERS POST CONTENT",
    desc: "The Bag goes live in the marketplace. Creators claim slots and post on X, TikTok, Instagram or YouTube.",
  },
  {
    icon: BadgeCheck,
    title: "PAY ONLY FOR APPROVED WORK",
    desc: "Every post is scored and reviewed. Approved work pays out on-chain from the budget; rejected work pays nothing.",
  },
];

const MOCKS = [MockBrief, MockFund, MockPosts, MockPayout];

export function PublisherPath() {
  const { active, completed } = useSequential(STEPS.length, FLOW_CARD_MS);

  return (
    <section id="publishers" className="relative border-b border-white/10 bg-[#0b0a07]">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#bdfe00]/30 bg-[#bdfe00]/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#bdfe00]">
            FOR PROJECTS
          </div>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl">
            FUND A BAG. <span className="text-[#bdfe00]">GET REAL CONTENT.</span>
          </h2>
          <p className="mt-4 text-sm text-white/50">
            Projects set the brief and the budget. Creators deliver organic content. Payments
            happen on-chain — and only for work that passes review.
          </p>
          <p className="mt-2 text-[10px] uppercase tracking-widest text-white/30">
            Panels below illustrate the flow, not live figures
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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

        <div className="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-[#bdfe00]/20 bg-[#bdfe00]/5 p-8 text-center">
          <h3 className="text-xl font-bold text-white sm:text-2xl">
            NO RETAINERS. NO AGENCY MARKUP.
          </h3>
          <p className="max-w-md text-sm text-white/50">
            You fund a budget, you keep the brief, and the payout only happens when a post is
            approved. Unspent budget stays in the Bag.
          </p>
          {/* A real link to the console route, painted with the same surface as every other
              button on the page (`NeonButton` renders a `<button>`; this needs to be an anchor). */}
          <a
            href="/dashboard/create"
            className="btn-3d btn-surface-solid inline-flex h-12 items-center justify-center gap-2 rounded-xl px-7 text-[13px] font-bold uppercase tracking-wider"
          >
            <span className="relative z-10 flex items-center gap-2">
              Create a Bag
              <span className="text-[1.1em] leading-none">→</span>
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}

// === MOCKS: active=animating, done=frozen final state, idle=dimmed ===

/** The brief, filled in and priced. */
function MockBrief({ active, done }: { active: boolean; done: boolean }) {
  const bright = active || done;
  return (
    <div className="space-y-1.5">
      <MockMetric label="BRIEF" value={bright ? "SET" : "—"} bright={bright} />
      <MockMetric label="PLATFORMS" value={bright ? "X · TIKTOK" : "—"} bright={bright} />
      <MockMetric label="RATE" value={bright ? "$25 / POST" : "—"} bright={bright} tone="lime" />
    </div>
  );
}

/** The budget landing in the Bag's treasury. */
function MockFund({ active, done }: { active: boolean; done: boolean }) {
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
      p = Math.min(100, p + 20);
      setPct(p);
    }, 200);
    return () => clearInterval(id);
  }, [active, done]);

  const bright = active || done;
  return (
    <div className="space-y-2">
      <MockMetric
        label="TREASURY"
        value={done ? "LOCKED ✓" : active ? "RECEIVING…" : "—"}
        bright={bright}
      />
      <MockBar pct={pct} bright={bright} />
      <MockMetric label="BUDGET" value={bright ? "5,000 USDC" : "—"} bright={bright} tone="lime" />
    </div>
  );
}

/** Creators claiming the open slots. */
function MockPosts({ active, done }: { active: boolean; done: boolean }) {
  const [claims, setClaims] = React.useState(0);
  const creators = ["@creator_a", "@creator_b", "@creator_c"];

  React.useEffect(() => {
    if (done) {
      setClaims(creators.length);
      return;
    }
    if (!active) {
      setClaims(0);
      return;
    }
    const timers = creators.map((_, i) =>
      window.setTimeout(() => setClaims(i + 1), 400 * (i + 1)),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
    // The creator list is fixed for the lifetime of the component; only the card state is a dependency.
  }, [active, done]);

  const bright = active || done;
  return (
    <div className="space-y-1.5">
      {creators.map((creator, i) => (
        <div key={creator} className="flex items-center justify-between text-[10px]">
          <span className={i < claims ? "text-white/70" : "text-white/25"}>{creator}</span>
          <span className={i < claims ? "text-[#bdfe00]" : "text-white/20"}>
            {i < claims ? "CLAIMED" : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Review decides, and only the approved side pays. */
function MockPayout({ active, done }: { active: boolean; done: boolean }) {
  const [paid, setPaid] = React.useState(false);

  React.useEffect(() => {
    if (done) {
      setPaid(true);
      return;
    }
    if (!active) {
      setPaid(false);
      return;
    }
    const t = setTimeout(() => setPaid(true), 900);
    return () => clearTimeout(t);
  }, [active, done]);

  const bright = active || done;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="uppercase tracking-wider text-white/40">APPROVED</span>
        <span className={bright ? "text-[#bdfe00]" : "text-white/30"}>{bright ? "PAID ✓" : "—"}</span>
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="uppercase tracking-wider text-white/40">REJECTED</span>
        <span className={bright ? "text-white/50" : "text-white/30"}>
          {bright ? "NO PAYOUT" : "—"}
        </span>
      </div>
    </div>
  );
}
