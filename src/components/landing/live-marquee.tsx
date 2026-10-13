"use client";

import * as React from "react";

import { useCampaigns } from "@/lib/queries";
import { Marquee } from "@/components/site/marquee";
import { LiveBadge } from "@/components/site/badges";
import { BloomOrb } from "@/components/landing/bloom-orb";
import { useApp } from "@/lib/store";
import type { Campaign } from "@/lib/types";

/**
 * The live-campaigns ticker.
 *
 * Every avatar in it is the site's own Bloom Orb (`components/landing/bloom-orb.tsx`), randomised per
 * campaign: the palette, which way the gradient turns, how fast, and where in its own drift it starts
 * all come from a hash of the campaign id. That is why no two pills move alike, and why a pill's orb
 * is the same on every visit — the numbers are derived from the id, never from `Math.random()`, so the
 * server and the browser agree and nothing reshuffles on a re-render.
 *
 * Only the three knobs the orb CSS exposes are used (`--orb-*` on the slot), so this adds no second
 * animation system: it is the same `orb-flow` keyframe the hero, the steps and the footer use.
 */

/**
 * Orb palettes — a hue per pill, each one a full five-colour sphere rather than a tint of lime.
 *
 * The names are the colour a reader would call it. `bg` stays near-black in every one: the symbol is
 * drawn on top of the orb, and a light core would swallow it. `glow` is the outer bloom, which is the
 * part that reads across the strip.
 */
const ORB_PALETTES = [
  { name: "blue",    bg: "#07101c", c1: "#3b82f6", c2: "#bfdbfe", c3: "#38bdf8", c4: "#1d4ed8", c5: "#7dd3fc", glow: "rgba(56, 189, 248, 0.5)" },
  { name: "red",     bg: "#160607", c1: "#ef4444", c2: "#fecaca", c3: "#f87171", c4: "#991b1b", c5: "#fca5a5", glow: "rgba(248, 113, 113, 0.5)" },
  { name: "orange",  bg: "#170d04", c1: "#fb923c", c2: "#fed7aa", c3: "#f97316", c4: "#9a3412", c5: "#fdba74", glow: "rgba(251, 146, 60, 0.5)" },
  { name: "grey",    bg: "#0d0d0f", c1: "#94a3b8", c2: "#e2e8f0", c3: "#64748b", c4: "#334155", c5: "#cbd5e1", glow: "rgba(148, 163, 184, 0.45)" },
  { name: "white",   bg: "#101114", c1: "#f8fafc", c2: "#ffffff", c3: "#e2e8f0", c4: "#94a3b8", c5: "#f1f5f9", glow: "rgba(241, 245, 249, 0.45)" },
  { name: "purple",  bg: "#0e0718", c1: "#a78bfa", c2: "#ede9fe", c3: "#8b5cf6", c4: "#5b21b6", c5: "#c4b5fd", glow: "rgba(167, 139, 250, 0.5)" },
  { name: "pink",    bg: "#170711", c1: "#ec4899", c2: "#fbcfe8", c3: "#f472b6", c4: "#9d174d", c5: "#f9a8d4", glow: "rgba(244, 114, 182, 0.5)" },
  { name: "fuchsia", bg: "#15061a", c1: "#d946ef", c2: "#f5d0fe", c3: "#e879f9", c4: "#86198f", c5: "#f0abfc", glow: "rgba(232, 121, 249, 0.5)" },
  { name: "cyan",    bg: "#04121a", c1: "#06b6d4", c2: "#a5f3fc", c3: "#22d3ee", c4: "#0e7490", c5: "#67e8f9", glow: "rgba(34, 211, 238, 0.5)" },
  { name: "indigo",  bg: "#080a1c", c1: "#6366f1", c2: "#c7d2fe", c3: "#818cf8", c4: "#3730a3", c5: "#a5b4fc", glow: "rgba(129, 140, 248, 0.5)" },
  { name: "lime",    bg: "#0f0f0f", c1: "#c8ff00", c2: "#f4ffb4", c3: "#bdfe00", c4: "#7d9c00", c5: "#e6ff66", glow: "rgba(189, 254, 0, 0.45)" },
  { name: "amber",   bg: "#150f03", c1: "#f59e0b", c2: "#fde68a", c3: "#fbbf24", c4: "#b45309", c5: "#fcd34d", glow: "rgba(251, 191, 36, 0.5)" },
] as const;

/**
 * FNV-1a over the campaign id: a small, stable 32-bit number.
 *
 * Hashed rather than indexed on position so a bag keeps its look as others come and go, and computed
 * rather than random so the first paint and the hydrated paint are identical.
 */
function seedFrom(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * The pill's avatar: one Bloom Orb with the token's symbol over it.
 *
 * `size` is 28px, which also sets what the orb costs — the CSS scales its blur from `--orb-size`, so a
 * strip of these is far cheaper than the 40px orb in the steps section, let alone a page of them.
 */
function OrbAvatar({ campaign }: { campaign: Campaign }) {
  const seed = seedFrom(campaign.id);
  const palette =
    ORB_PALETTES[seed % ORB_PALETTES.length] ?? ORB_PALETTES[ORB_PALETTES.length - 1];
  /*
   * `>>>` and not `>>`: the hash is unsigned, and a *signed* shift turns every id above 2^31 negative,
   * which produced negative percentages — a speed of 4s and a delay of `--5s`, which CSS discards, so
   * those pills silently lost the phase offset that keeps them from marching in step.
   */
  const spin = (seed & 1) === 0 ? 1 : -1;        // which way the gradient turns
  const speed = 9 + ((seed >>> 3) % 7);          // 9–15s: same range, no two quite the same
  const phase = (seed >>> 5) % 12;               // seconds into its own drift to start at
  const size = 28;

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-white/10"
      style={{ width: size, height: size, background: palette.bg }}
    >
      <BloomOrb
        size={size}
        speed={speed}
        className="pointer-events-none absolute inset-0"
        style={
          {
            "--orb-bg": palette.bg,
            "--orb-1": palette.c1,
            "--orb-2": palette.c2,
            "--orb-3": palette.c3,
            "--orb-4": palette.c4,
            "--orb-5": palette.c5,
            "--orb-glow": palette.glow,
            "--orb-spin": String(spin),
            "--orb-delay": `-${phase}s`,
          } as React.CSSProperties
        }
      />
      {/* Keeps the symbol legible over whichever palette this pill drew. */}
      <span aria-hidden="true" className="absolute inset-0 z-[5] bg-black/30" />
      <span
        className="relative z-10 font-bold text-white"
        style={{ fontSize: 10, textShadow: "0 1px 2px rgba(0, 0, 0, 0.9)" }}
      >
        {campaign.token.symbol.slice(0, 3)}
      </span>
    </span>
  );
}

function MarqueeItem({ c }: { c: Campaign }) {
  const go = useApp((s) => s.go);
  return (
    <button
      onClick={() => go({ name: "campaign-detail", id: c.id })}
      className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#13110c] px-4 py-2.5 transition-colors hover:border-[#bdfe00]/40"
    >
      <OrbAvatar campaign={c} />
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-white">${c.token.symbol}</span>
        <span className="text-[10px] uppercase tracking-wider text-white/40">
          {c.rateType === "DYNAMIC" ? `$${c.ratePer1k}/1K` : "FIXED"}
        </span>
      </div>
      <span className="text-[10px] text-white/40">·</span>
      <span className="max-w-[140px] truncate text-[11px] text-white/60">
        {c.title}
      </span>
      <LiveBadge />
    </button>
  );
}

/**
 * How many bags the strip takes from the API, and how many pills one copy must hold.
 *
 * Two things decide what the ticker costs. Every pill is a live orb and the primitive renders the list
 * twice, so `TICKER_LIMIT × repeats × 2` is the number of orbs on the page. And one copy has to be at
 * least as wide as the screen: the loop slides by exactly one copy, so a copy narrower than the window
 * shows empty space at the edge before it wraps — which is what three live campaigns did, since three
 * pills are barely 660px.
 *
 * So the list is capped for cost and repeated for coverage: six bags, repeated until there are at
 * least twelve pills per copy, which is ~3,400px and wider than any desktop window this renders in.
 */
const TICKER_LIMIT = 6;
const TICKER_MIN_PILLS = 12;

export function LiveMarquee() {
  const { data, isLoading } = useCampaigns("LIVE");
  const campaigns = (data?.campaigns ?? []).slice(0, TICKER_LIMIT);

  const repeats = campaigns.length > 0 ? Math.ceil(TICKER_MIN_PILLS / campaigns.length) : 0;
  const pills = Array.from({ length: repeats }, (_, pass) =>
    campaigns.map((c) => <MarqueeItem key={`${c.id}-${pass}`} c={c} />),
  ).flat();

  if (isLoading || pills.length === 0) return null;
  return (
    <section className="border-y border-white/10 bg-[#0f0d08] py-4">
      <div className="mx-auto mb-3 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/40">
          <span className="h-1.5 w-1.5 rounded-full bg-[#bdfe00] pulse-dot" />
          LIVE CAMPAIGNS UPDATING IN REAL-TIME
        </div>
      </div>
      <Marquee items={pills} speed={45} className="px-4" />
    </section>
  );
}
