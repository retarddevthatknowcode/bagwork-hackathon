"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useApp } from "@/lib/store";
import { Header } from "@/components/site/header";
import { Footer } from "@/components/site/footer";
import { Landing } from "@/components/landing/landing";
import { LeaderboardView } from "@/components/dashboard/leaderboard-view";
import { DocsView } from "@/components/docs/docs-view";

/**
 * The marketing surface: landing, docs and the public leaderboard.
 *
 * This is the interactive half of `/`, split out from the route so that the route itself can stay a
 * Server Component and export `metadata` — a Client Component cannot, and without that the homepage
 * had no canonical URL or Open Graph URL of its own. The split is the only reason this file exists;
 * the behaviour is unchanged.
 *
 * Product views (dashboard, bag detail, submit) are real routes under `/dashboard/**` with their own
 * shell and server data. The in-page SPA copies of those screens were removed: they were unreachable
 * (`go()` navigates to the console route instead) and they rendered mock figures — fake wallets,
 * earnings and submission rows — that no longer exist anywhere in the data model.
 */
export function MarketingPage() {
  const view = useApp((s) => s.view);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={view.name}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {view.name === "landing" && <Landing />}
            {view.name === "leaderboard" && <LeaderboardView />}
            {view.name === "docs" && <DocsView />}
          </motion.div>
        </AnimatePresence>
      </main>
      <Footer />
    </div>
  );
}
