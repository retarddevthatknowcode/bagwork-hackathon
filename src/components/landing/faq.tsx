"use client";

import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { GlitchText } from "@/components/site/glitch-text";

const FAQS = [
  {
    q: "How do I get paid?",
    a: "After you submit a post, our AI anti-slop engine + human reviewers score it for content quality and engagement authenticity. If approved, the payout is calculated (views × rate, holder multiplier applied, capped at max) and sent as an SPL token transfer directly to your Solana wallet. Every transaction is verifiable on Solscan.",
  },
  {
    q: "Do I need a big audience?",
    a: "No. BAGWORK rewards quality and authenticity, not follower count. A 500-view post with genuine engagement can out-earn a 100K-view post flagged for bot traffic. Your trust score grows with every approved submission, unlocking higher-rate campaigns over time.",
  },
  {
    q: "What is the holder multiplier?",
    a: "Some campaigns are holder-gated. Hold a minimum balance of the project's token and you qualify for a boosted payout; the balance is read from the chain at submission time, so it can't be faked. It rewards real believers over mercenary farmers.",
  },
  {
    q: "How does the anti-slop engine work?",
    a: "Six layers, and each one can stop a payment on its own: bot detection (engagement velocity and ratio analysis), AI quality scoring (an LLM reads the submission for real creator effort), social verification (a submitted link has to belong to an account you actually connected), human review of anything the engine flags, farming protection (duplicate links and multi-account rings, caught across campaigns), and on-chain holder verification for gated Bags. Fake traffic is rejected before a payout is ever built.",
  },
  {
    q: "What is Fee Redirect?",
    a: "It turns a token's fees into content budget. Point the creator fees, or a share of the trading fees, at Bagwork: each deposit lands on-chain, converts to USDC, and is credited straight into that token's Bag. More volume means a bigger content budget, which buys more content, which brings more attention back to the token. The loop funds itself.",
  },
  {
    q: "What does Bagwork charge, and where does it go?",
    a: "5% of every settled payout. Half of it funds the treasury and half buys back and burns $BAG, so every campaign tightens the supply as the platform grows. The fee comes out of the funded budget, never out of the payout a creator was quoted — what a campaign card shows is what lands in the wallet.",
  },
  {
    q: "Who can create a Bag?",
    a: "Anyone with a Solana wallet. Sign in, write the brief, set the rate and the caps, fund the budget, and the Bag appears in the marketplace. There is no approval queue and no sales call — the review engine is what protects the money, and unspent budget stays in the Bag.",
  },
  {
    q: "Which platforms are supported?",
    a: "X (Twitter), TikTok, Instagram, and YouTube. Each campaign specifies which platforms it accepts. We validate post ownership and pull live engagement metrics directly from the platforms' APIs.",
  },
  {
    q: "What's the trust score?",
    a: "Your trust score (0-100) reflects your submission approval rate, engagement authenticity history, and on-chain reputation. Higher scores unlock premium campaigns, instant approvals, and priority payout routing. Top creators earn DIAMOND/PLATINUM badges with lifetime multipliers.",
  },
  {
    q: "How does a project run a campaign?",
    a: "Create a Bag, set the brief, platforms, rate and caps, then fund the budget into its treasury — the money is locked before the Bag opens, so creators can see it is really there. It goes live in the marketplace, creators claim slots and post, and you pay only for work that passes review. Unspent budget stays in the Bag. Tokens can also fund one automatically with Fee Redirect.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="relative border-b border-white/10 bg-[#0b0a07]">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white/50">
            FAQ
          </div>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl">
            <GlitchText text="QUESTIONS?" />{" "}
            <span className="text-[#bdfe00]">ANSWERED.</span>
          </h2>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mt-10"
        >
          <Accordion
            type="single"
            collapsible
            className="space-y-3"
            defaultValue="0"
          >
            {FAQS.map((f, i) => (
              <AccordionItem
                key={i}
                value={String(i)}
                className="overflow-hidden rounded-xl border border-white/10 bg-[#0f0d08] px-4 data-[state=open]:border-[#bdfe00]/30"
              >
                <AccordionTrigger className="text-left text-sm font-bold uppercase tracking-wide text-white hover:no-underline hover:text-[#bdfe00]">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-white/60">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
