"use client";

import { useStats } from "@/lib/queries";
import { AnimatedCounter } from "@/components/site/animated-counter";
import { motion } from "framer-motion";

/**
 * The adoption figures, from `/api/stats` — every number here is real, including the zeroes.
 *
 * A young network has real zeroes in it (nothing has settled yet, nothing has been reviewed yet),
 * and six confident `0`s in a row make a working product look dead. So a figure with nothing
 * behind it renders as an em dash in a cooler weight instead of a zero: it reads as "not yet"
 * rather than "nobody", and the numbers that *are* real keep their full weight beside it.
 *
 * When every figure is still empty the whole band steps back and says so in one line, instead of
 * presenting six placeholders as a scoreboard.
 */
export function StatsBand() {
  const { data, isLoading } = useStats();
  const stats = data ?? {
    totalPaid: 0,
    activeCampaigns: 0,
    creators: 0,
    totalSubmissions: 0,
    avgPayout: 0,
    trustAvg: 0,
  };

  const items = [
    { label: "TOTAL PAID OUT", value: stats.totalPaid, prefix: "$" },
    { label: "ACTIVE CAMPAIGNS", value: stats.activeCampaigns, prefix: "" },
    { label: "CREATORS EARNING", value: stats.creators, prefix: "" },
    { label: "SUBMISSIONS REVIEWED", value: stats.totalSubmissions, prefix: "" },
    { label: "AVG PAYOUT", value: stats.avgPayout, prefix: "$" },
    { label: "AVG TRUST SCORE", value: stats.trustAvg, prefix: "", suffix: "/100" },
  ];

  const settled = !isLoading && items.some((item) => item.value > 0);

  return (
    <section className="border-b border-white/10 bg-[#0f0d08]">
      <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y divide-white/5 sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-6">
        {items.map((item, i) => {
          const empty = !isLoading && item.value === 0;
          return (
            <motion.div
              key={item.label}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.05 }}
              className="flex flex-col items-center justify-center px-3 py-6 text-center"
            >
              <div
                className={`text-2xl font-bold sm:text-3xl ${
                  empty ? "text-white/20" : "text-[#bdfe00]"
                }`}
              >
                {isLoading ? (
                  <span className="text-white/20">—</span>
                ) : empty ? (
                  "—"
                ) : (
                  <AnimatedCounter value={item.value} prefix={item.prefix} />
                )}
                {item.suffix && !empty && !isLoading ? (
                  <span className="text-sm text-white/40">{item.suffix}</span>
                ) : null}
              </div>
              <div
                className={`mt-1 text-[9px] uppercase tracking-widest ${
                  empty ? "text-white/25" : "text-white/40"
                }`}
              >
                {item.label}
              </div>
            </motion.div>
          );
        })}
      </div>

      {!isLoading ? (
        <p className="mx-auto max-w-7xl px-4 pb-4 text-center text-[10px] uppercase tracking-widest text-white/25 sm:px-6 lg:px-8">
          {settled
            ? "Live figures from the platform. — means nothing has settled there yet."
            : "Early days: the first Bags are live. These figures update as work is reviewed and settled on-chain."}
        </p>
      ) : null}
    </section>
  );
}

