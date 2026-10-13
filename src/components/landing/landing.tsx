"use client";

import { Hero } from "./hero";
import { LiveMarquee } from "./live-marquee";
import { StatsBand } from "./stats-band";
import { Steps } from "./steps";
import { PublisherPath } from "./publisher-path";
import { Features } from "./features";
import { FeeRedirect } from "./fee-redirect";
import { FeeBurnStrip } from "./fee-burn-strip";
import { LiveCampaigns } from "./live-campaigns";
import { AntiBots } from "./anti-bots";
import { Faq } from "./faq";

/**
 * The homepage, in the order a newcomer needs it.
 *
 * The page has to explain three sides of the product, so the sections are grouped by who they
 * are for rather than by how impressive they look:
 *
 *   hero → stats            what BAGWORK is, with real adoption figures
 *   how it works            the creator's four steps
 *   for projects            the publisher's four steps — the other side of the same marketplace
 *   why bagwork             the product advantages (open market, payouts, points, quests, $BAG)
 *   fee redirect → fee+burn the loop that funds a Bag out of its own market, and where the fee goes
 *   live bags               proof: real funded campaigns anyone can work
 *   anti-abuse              why the numbers above can be trusted
 *   faq                     the remaining questions
 *
 * The last two sections are deliberately different arguments — "what you get" versus "what we
 * stop" — and no card appears in both.
 */
export function Landing() {
  return (
    <>
      <Hero />
      <LiveMarquee />
      <StatsBand />
      <Steps />
      <PublisherPath />
      <Features />
      <FeeRedirect />
      <FeeBurnStrip />
      <LiveCampaigns />
      <AntiBots />
      <Faq />
    </>
  );
}

