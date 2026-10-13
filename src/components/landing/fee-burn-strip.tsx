"use client";

import { motion } from "framer-motion";
import { Flame } from "lucide-react";

/**
 * The fee split, as one strip.
 *
 * Deliberately not another six-card flow: it answers a single question — "what does Bagwork take,
 * and where does it go?" — in one glance. The figures are the shipped ones: 5% of every settled
 * payout, split 50/50 between the treasury and the $BAG buyback-and-burn (`lib/solana/burn.ts`).
 *
 * The only motion is a fade/slide on entry and the split bar growing, using the same 0.5s and
 * easing as every card on the page. A looping animation here would be noise next to the two
 * flows either side of it.
 */

const SPLIT = [
  { value: "5%", label: "PLATFORM FEE ON EVERY BAG" },
  { value: "50%", label: "TO TREASURY" },
  { value: "50%", label: "BUYBACK & BURN $BAG" },
];

export function FeeBurnStrip() {
  return (
    <section id="fees" className="relative border-b border-white/10 bg-[#0b0a07]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 rounded-2xl border border-white/10 bg-[#0f0d08] p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="max-w-md"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-[#ff6b35]/30 bg-[#ff6b35]/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#ff6b35]">
              <Flame className="h-3 w-3" />
              5% FEE · $BAG
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              CAMPAIGNS HELP <span className="text-[#bdfe00]">BURN $BAG.</span>
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/50">
              Every campaign helps strengthen $BAG by burning supply as the platform grows.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="w-full lg:max-w-lg"
          >
            <div className="grid grid-cols-3 gap-4">
              {SPLIT.map((item) => (
                <div key={item.label}>
                  <div className="text-2xl font-bold text-[#bdfe00] sm:text-3xl">{item.value}</div>
                  <div className="mt-1 text-[9px] uppercase tracking-widest text-white/40">
                    {item.label}
                  </div>
                </div>
              ))}
            </div>

            {/* The split itself: fee in, two halves out. Treasury in lime, burn in the warm
                accent the docs diagrams already use for the burn leg. */}
            <div className="mt-5 flex h-2 overflow-hidden rounded-full bg-white/10">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: "50%" }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="h-full bg-[#bdfe00]"
                style={{ boxShadow: "0 0 8px rgba(189,254,0,0.45)" }}
              />
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: "50%" }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="h-full bg-[#ff6b35]"
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[9px] uppercase tracking-widest">
              <span className="text-[#bdfe00]/70">Treasury</span>
              <span className="text-[#ff6b35]/80">$BAG burn</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
