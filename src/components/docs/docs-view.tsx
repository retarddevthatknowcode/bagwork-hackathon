"use client";

import { motion } from "framer-motion";
import {
  BookOpen,
  Building2,
  Fingerprint,
  Flag,
  Flame,
  Landmark,
  LayoutGrid,
  MessagesSquare,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { POINTS_LEVELS_SECTION_ID } from "@/lib/profile/points";
import { QUESTS_SECTION_ID } from "@/lib/quests/weekly";
import { cn } from "@/lib/utils";
import { AudienceCard, FactCard, StatTile, type Accent } from "./docs-cards";
import {
  ReadingProgress,
  Reveal,
  ScrollToTop,
  Stagger,
  StaggerItem,
  staggerChild,
} from "./docs-motion";
import { useScrollspy, scrollToSection } from "./use-scrollspy";
import { DiagramCommunity } from "./diagram-community";
import { DiagramCampaignLoop } from "./diagram-campaign-loop";
import { DiagramFeeSplit } from "./diagram-fee-split";
import { DiagramFeeRedirect } from "./diagram-fee-redirect";
import { DiagramApprovalPipeline } from "./diagram-approval-pipeline";
import { DiagramPointsLevels } from "./diagram-points-levels";
import { DiagramProfileMarketplace } from "./diagram-profile-marketplace";
import { DiagramWeeklyQuests } from "./diagram-weekly-quests";

/**
 * Anchor for the closing section on identity and future profiles.
 *
 * Declared here rather than beside `POINTS_LEVELS_SECTION_ID`: points and quests have ids in
 * `lib/` because the console links to them from elsewhere, and nothing links to this one.
 */
const PROFILE_IDENTITY_SECTION_ID = "14-profile-identity-nft";

/**
 * Anchor for Campaign Communities.
 *
 * Same reasoning as the identity section: it is a docs-only anchor, so it lives here next to the
 * content it names rather than in a lib module nothing else would import.
 */
const COMMUNITY_SECTION_ID = "13-campaign-communities";

type Section = {
  id: string;
  n: string;
  title: string;
  paragraphs?: string[];
  list?: string[];
  listOrdered?: boolean;
  diagram?: React.ReactNode;
};

/**
 * The Bagwork concept doc. Sections 01–10 are content supplied verbatim by the user; 11 (Points,
 * Levels & Profile Value) was added alongside the points system, 12 alongside weekly quests, 13
 * (Campaign Communities) alongside the community feature, and 14 (Profile Identity & Future NFT
 * Profiles) alongside profile identity. Order, numbering and wording of the original ten MUST
 * stay intact.
 */
const SECTIONS: Section[] = [
  {
    id: "01-what-bagwork-is",
    n: "01",
    title: "What Bagwork Is",
    paragraphs: [
      "Bagwork is a platform where anyone can create a funded content campaign (called a “Bag”). Creators on the platform, called Bagworkers, make real organic content for that campaign on social media platforms like X, TikTok, Instagram, and YouTube.",
      "The key difference from normal influencer or KOL platforms is that Bagworkers do not need to hold the project's token to participate. They simply create content according to the campaign rules and get paid based on the rate the campaign creator has set. Payment can be based on views, a fixed amount per post, or a mix of both.",
      "Every campaign that runs on Bagwork pays a 5% platform fee. Half of that fee goes into the platform treasury so the product can keep improving. The other half is used to buy $BAG tokens from the open market and burn them. This means the more campaigns that run and the more money that flows through the platform, the more $BAG gets removed from circulation.",
    ],
  },
  {
    id: "02-how-campaign-works",
    n: "02",
    title: "How a Normal Campaign Works",
    listOrdered: true,
    list: [
      "Someone creates a Bag and funds it with tokens or USDC.",
      "They write what kind of content they want and set the payment rate.",
      "Bagworkers find the campaign, create content, and submit the link to their post.",
      "The post is reviewed (first by AI, then by a human if needed).",
      "If the post is approved, the creator gets paid directly on-chain according to the rate that was set.",
      "The 5% fee is taken and split between the treasury and the $BAG buyback-and-burn.",
    ],
    paragraphs: ["This is the basic loop of the platform."],
    diagram: <DiagramCampaignLoop />,
  },
  {
    id: "03-fee-and-why-it-matters",
    n: "03",
    title: "The 5% Fee and Why It Matters",
    paragraphs: [
      "Every Bag pays a 5% fee. This fee is split equally:",
      "This creates a direct relationship between platform usage and the supply of $BAG. The more successful Bagwork becomes, the more $BAG is burned.",
    ],
    list: [
      "50% goes to the platform treasury. This money is used to develop new features, run incentives, and keep the platform running.",
      "50% is used to buy $BAG tokens and permanently burn them.",
    ],
    diagram: <DiagramFeeSplit />,
  },
  {
    id: "04-who-can-create-a-bag",
    n: "04",
    title: "Who Can Create a Bag",
    paragraphs: [
      "Bags are not limited to crypto token teams. Anyone can open one:",
      "The person or team creating the Bag writes a clear description of what they want, deposits the budget, sets how much they are willing to pay per view or per post, and publishes it. Bagworkers then decide if they want to work on it.",
    ],
    list: [
      "Memecoin and token developers",
      "Real-world brands",
      "Individual creators or influencers",
      "Communities",
      "Even regular people who simply want content made for them",
    ],
  },
  {
    id: "05-fee-redirect-feature",
    n: "05",
    title: "Fee Redirect Feature (One of the Strongest Ideas)",
    paragraphs: [
      "This feature is designed especially for new tokens. When someone launches a token on pump.fun or any other launchpad (on any chain), they can choose to send a portion of the trading fees or creator fees to a special Bagwork wallet. Those fees arrive in the token itself. The system then automatically converts them into USDC. The USDC becomes the live budget of a Bag campaign for that same token. On the campaign page, people can see in real time how much money has been collected from fees (shown in USD). The token team sets the rate they want to pay creators, and Bagworkers start making content using that growing budget.",
      "This creates a powerful loop: More trading → More fees collected → Bigger content budget → More content created → More attention on the token → More trading. It turns trading activity into an automatic marketing engine.",
    ],
    diagram: <DiagramFeeRedirect />,
  },
  {
    id: "06-for-bagworkers",
    n: "06",
    title: "For Bagworkers (The Creators)",
    paragraphs: [
      "Bagworkers are the people who make the content. They do not need to buy or hold the project token. They browse open Bags, choose ones they like or that pay well, create the content, and submit the link. After review, they get paid. Over time they build a reputation on the platform through trust score, experience points, levels, streaks, and quests. Higher reputation can lead to better opportunities and higher-paying campaigns.",
    ],
  },
  {
    id: "07-for-token-teams",
    n: "07",
    title: "For Token Teams and Memecoin Developers",
    paragraphs: [
      "Instead of only spending money on boosts, ads, or paid promoters, a team can put part of their supply or their trading fees into a Bag. This gives them real organic content from many different creators, full transparency on how the money was spent, and participation in the $BAG burn system at the same time. When combined with the Fee Redirect feature, their marketing budget can grow automatically as their token is traded.",
    ],
  },
  {
    id: "08-for-brands-and-creators",
    n: "08",
    title: "For Brands and Individual Creators",
    paragraphs: [
      "Any brand or person who wants user-generated content can open a Bag, describe exactly what they need, fund it with USDC, set the rate, and let Bagworkers deliver the content. This makes Bagwork useful outside of pure crypto as well.",
    ],
  },
  {
    id: "09-how-content-gets-approved",
    n: "09",
    title: "How Content Gets Approved and Paid",
    paragraphs: [
      "In the early version of the platform, the process is kept simple and controlled:",
      "This approach avoids needing expensive official social media APIs at the beginning while still keeping quality under control.",
    ],
    list: [
      "The Bagworker only needs to paste the link to their post.",
      "An AI system reviews the content for quality, relevance, and spam.",
      "The system automatically calculates how much should be paid based on the campaign rules.",
      "The submission appears in an admin panel.",
      "A human admin only needs to click Approve or Reject.",
      "If approved, the payment is sent on-chain.",
    ],
    diagram: <DiagramApprovalPipeline />,
  },
  {
    id: "10-summary-core-idea",
    n: "10",
    title: "Summary of the Core Idea",
    paragraphs: [
      "Bagwork turns content creation into an open marketplace. Anyone can fund a campaign. Anyone can work on a campaign. Payments are transparent and on-chain. A portion of every campaign permanently reduces the supply of $BAG. The Fee Redirect feature adds an extra layer where trading activity on a token can automatically fund its own marketing through content.",
    ],
  },
  {
    id: POINTS_LEVELS_SECTION_ID,
    n: "11",
    title: "Points, Levels & Profile Value",
    paragraphs: [
      "Every Bagworker carries a public score: Points. Points measure how much real, settled work a profile has delivered — not how loud it is, not how early it arrived, and not how much money it holds. The rule is fixed and simple: $1 of approved earnings = 33 points.",
      "Points can only ever come from money that actually moved, or from a weekly quest that was actually completed. A payout that settled on-chain adds points. A quest that reached its target adds 200. A submission that is still pending, one that was rejected, and anything adjusted by hand adds nothing. There is no way to buy points, no way to move them into a profile, and no manual override — which is exactly what makes the number mean something.",
      "Points never go down. A profile's total is its lifetime record, so once work has been paid for, the score stays. As the total grows the profile passes thresholds and gains a Level, from Level 1 at 0 points up to Level 6 at 500,000 points.",
      "Every level also has a badge. Six shields, one for each level, shown in order on your profile: Initiate, Contender, Vanguard, Elite, Mythic, and Legendary. The badge for your current level is highlighted; the ones you have not reached yet are still shown, greyed out, with the number of points they need. A badge is only ever a picture of your level — it is not a second score, it cannot be bought, and it changes only when your level changes.",
      "Alongside points, every profile has a permanent number of its own, generated the moment the profile is created and shown everywhere as Bagworker#3578. A handle or display name can be changed later; the number cannot.",
      "That is what turns a profile from a login into an asset. In the future, profiles will be sellable, and the number, the level and the entire points and work history go with them.",
      "The future marketplace works like this: owners will be able to list their own profile, buyers will be able to purchase a profile, and ownership will transfer together with the Bagworker# number and all of the profile's points and level history. Profile value will be driven by three things — total points, current level, and work history.",
      "None of this is switched on yet, and none of it changes how the platform works today. Levels are status only: no campaign, bag or payout is ever gated behind one.",
    ],
    list: [
      "Level 1 starts at 0 points",
      "Level 2 at 5,000 points",
      "Level 3 at 25,000 points",
      "Level 4 at 75,000 points",
      "Level 5 at 200,000 points",
      "Level 6 at 500,000 points — the Legendary badge",
    ],
    diagram: (
      <div className="space-y-4">
        <DiagramPointsLevels />
        <DiagramProfileMarketplace />
      </div>
    ),
  },
  {
    id: QUESTS_SECTION_ID,
    n: "12",
    title: "Weekly Quests",
    paragraphs: [
      "Weekly quests are three small goals that every Bagworker gets at the start of each week. Complete one and it pays 200 points. Every quest resets when a new week begins — Monday at 00:00 UTC — and then you can complete it again.",
      "What makes them worth having is what they count. A quest never trusts a number you tell it. It counts work that has already been verified somewhere else on the platform: a bag you really opted into, a post link that passed the validation check, or views on a submission that was reviewed and approved. If the work did not happen, the progress does not move.",
      "The three quests are the same for everyone right now: Opt-in Starter, Content Creator, and View Hunter. Each one pays 200 points, so a full week of quests is worth 600 points on top of everything else you earn.",
      "Progress updates while you work. As soon as an action is verified the progress bar moves, and the moment the bar reaches its target the quest is marked Completed and the 200 points are added to your profile automatically. There is no claim button to press, and no way to fall behind on claiming a reward you earned.",
      "Points from quests behave exactly like every other point on Bagwork: they are permanent, they never go down, and they count toward your Level. So a Bagworker who is genuinely active each week moves up faster than the earnings curve alone would allow — which is the point. Quests exist to reward real weekly work.",
      "When the week ends, the quests reset and start from zero. What you completed does not disappear: the points are already yours, and the work behind them stays in your submission history.",
    ],
    list: [
      "Opt-in Starter — Opt into 3 different live Bags during the week — 200 points",
      "Content Creator — Submit 5 content links that pass validation during the week — 200 points",
      "View Hunter — Generate 10,000 verified views across submissions approved during the week — 200 points",
    ],
    diagram: <DiagramWeeklyQuests />,
  },
  {
    id: COMMUNITY_SECTION_ID,
    n: "13",
    title: "Campaign Communities",
    paragraphs: [
      "A Bag is more than a budget. It is a group of people who agreed to make content for the same campaign, and for a long time those people had nowhere to talk to each other. A Community is that place: one announcement board attached to a bag, where the publisher tells everyone what the campaign needs next.",
      "Each bag can have exactly one. The publisher who funded the bag creates it, and becomes its admin — the only person who can post. Everyone who joined that campaign can walk in and read. Nobody else can open it at all, not a signed-in user who skipped the bag and not a visitor. Access is not something you apply for; it is something the bag has already decided.",
      "It is built for the things a campaign has to say out loud: the brief and its rules, a change to the payout model, an update when a bag is topped up, and what is working for the other creators in it. Announcements carry images and links, and the admin can pin the ones that should stay put — a pinned post is a standing instruction, so it sits above the feed rather than being scrolled for.",
      "Members read everything and cannot send. That asymmetry is the point rather than an oversight: a board anyone can post to stops being the place you check what the campaign actually said. There are no voice notes either, for a similar reason — a board people read later has to be searchable, and audio is not.",
      "Getting in follows from the bag. Publishers open the community from the bag they funded. Bagworkers join the bag first — claiming a slot is what makes someone a member — and the Community button appears on that bag from then on. If you have not joined, there is nothing to see and nothing to apply for.",
      "Two more spaces sit on the same board: Ideas, for collecting angles worth trying, and Planning, for milestones and posting schedules. Both are visible and labelled as coming soon rather than quietly missing — Chat is the channel that is live today.",
    ],
    list: [
      "Announcements — the brief, the rules, and what has changed",
      "Updates — a bag topped up, a rate moved, a deadline shifted",
      "Coordination — what to post, what is landing, what to avoid",
    ],
    diagram: <DiagramCommunity />,
  },
  {
    id: PROFILE_IDENTITY_SECTION_ID,
    n: "14",
    title: "Profile Identity & Future NFT Profiles",
    paragraphs: [
      "A Bagworker profile is more than a login. It carries a pixel character chosen once during setup, a permanent number shown everywhere as Bagworker#3578, and a public record of the work that profile has actually delivered. Points, level and badge are all part of that record.",
      "The record is what gives a profile its value, and it is value that can only be built one way: by doing approved work. Points cannot be bought, transferred in from somewhere else, or manufactured by hand. So a profile that has delivered a lot of real work is worth more than one that has not — and the platform does not have to promise anything for that to be true.",
      "The character is fixed after onboarding on purpose. If a profile could be reshaped whenever its holder liked, there would be nothing stable to recognise and nothing durable for the work to accumulate against. Identity is set once; the score is what moves.",
      "In the future, profiles are intended to be transferable. The plan is that a holder could list their profile and a buyer could purchase it, with ownership moving together with the Bagworker# number, the character, and the whole points and level history — so the work a profile has done stays with it no matter which account holds it.",
      "None of that is switched on today, and none of it is a financial promise. There is no token tied to a profile, no yield, no guaranteed resale value and no expectation of profit. A profile is a record of work. Whether one is ever sold, and for how much, is left entirely to the people who might one day trade them. The one thing the platform does control is that the record is real and cannot be inflated.",
    ],
    list: [
      "Set once — the pixel character is chosen in onboarding and cannot be changed afterwards",
      "Permanent — the Bagworker# number is generated at creation and never changes",
      "Earned, never bought — points and level come only from approved work and completed quests",
      "Transferable in future — number, character and full history would move together, if this ships",
    ],
  },
];


/* ==========================================================================
   Presentation layer
   The content above is frozen (wording/order must not change); everything
   below only decides how it is presented.
   ========================================================================== */

type Block =
  | { kind: "single"; section: Section }
  | { kind: "trio"; sections: Section[] };

type SectionMeta = {
  icon: LucideIcon;
  accent?: Accent;
  /** Consecutive sections sharing a group render as a single card row. */
  group?: "audience";
};

const SECTION_META: Record<string, SectionMeta> = {
  "01-what-bagwork-is": { icon: Sparkles, accent: "yellow" },
  "02-how-campaign-works": { icon: RefreshCw, accent: "lime" },
  "03-fee-and-why-it-matters": { icon: Flame, accent: "yellow" },
  "04-who-can-create-a-bag": { icon: LayoutGrid, accent: "lime" },
  "05-fee-redirect-feature": { icon: TrendingUp, accent: "yellow" },
  "06-for-bagworkers": { icon: Users, accent: "lime", group: "audience" },
  "07-for-token-teams": { icon: Rocket, accent: "yellow", group: "audience" },
  "08-for-brands-and-creators": {
    icon: Building2,
    accent: "lime",
    group: "audience",
  },
  "09-how-content-gets-approved": { icon: ShieldCheck, accent: "yellow" },
  "10-summary-core-idea": { icon: Flag, accent: "lime" },
  [POINTS_LEVELS_SECTION_ID]: { icon: Trophy, accent: "yellow" },
  [QUESTS_SECTION_ID]: { icon: Target, accent: "lime" },
  [COMMUNITY_SECTION_ID]: { icon: MessagesSquare, accent: "yellow" },
  [PROFILE_IDENTITY_SECTION_ID]: { icon: Fingerprint, accent: "yellow" },
};

/** Section 03's bullets are the two halves of the fee — show them as cards. */
const FEE_SPLIT_SECTION = "03-fee-and-why-it-matters";

const toneOf = (accent: Accent) => (accent === "yellow" ? "#ffe70e" : "#bdfe00");

function buildBlocks(sections: Section[]): Block[] {
  const blocks: Block[] = [];
  for (let i = 0; i < sections.length; i++) {
    const group = SECTION_META[sections[i].id]?.group;
    if (!group) {
      blocks.push({ kind: "single", section: sections[i] });
      continue;
    }
    const run: Section[] = [sections[i]];
    let j = i + 1;
    while (j < sections.length && SECTION_META[sections[j].id]?.group === group) {
      run.push(sections[j]);
      j++;
    }
    blocks.push({ kind: "trio", sections: run });
    i = j - 1;
  }
  return blocks;
}

export function DocsView() {
  const ids = React.useMemo(() => SECTIONS.map((s) => s.id), []);
  const blocks = React.useMemo(() => buildBlocks(SECTIONS), []);
  const activeId = useScrollspy(ids);
  const pageRef = React.useRef<HTMLDivElement>(null);

  const activeIndex = Math.max(
    0,
    SECTIONS.findIndex((s) => s.id === activeId),
  );

  return (
    <div ref={pageRef} className="docs relative w-full bg-[#0b0a07]">
      <ReadingProgress targetRef={pageRef} />

      {/* Ambient light + hairline grid, clipped in their own layer: the element
          measured by `useScroll` must stay a plain block, otherwise its
          `overflow-hidden` turns it into a second scroll container and scroll
          offsets stop being calculated against the window. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(58%_58%_at_50%_0%,rgba(255,231,14,0.07),transparent_72%)]" />
        <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(90deg,rgba(255,255,255,0.028)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.028)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(70%_50%_at_50%_0%,black,transparent)]" />
      </div>


      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[236px_minmax(0,1fr)] lg:gap-14">
          <Rail activeId={activeId} activeIndex={activeIndex} />

          <div className="min-w-0">
            <Hero />
            <ChipIndex activeId={activeId} />

            <div className="space-y-6 py-10 lg:space-y-8 lg:py-12">
              {blocks.map((block) =>
                block.kind === "trio" ? (
                  <AudienceTrio key={block.sections[0].id} sections={block.sections} />
                ) : (
                  <DocSection key={block.section.id} section={block.section} />
                ),
              )}
            </div>

            <ClosingCta />

            {/* Sticky, not fixed: it is confined to the docs section, so it can
                never drift over the site footer. */}
            <ScrollToTop threshold={900} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- hero */

function Hero() {
  return (
    <header className="border-b border-border pt-12 pb-10 lg:pt-16 lg:pb-12">
      <Stagger className="max-w-3xl" step={0.07}>
        <StaggerItem>
          <span className="docs-mono inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/60">
            <span className="relative flex size-1.5" aria-hidden="true">
              <span className="absolute inline-flex size-full rounded-full bg-[#bdfe00]/70 motion-safe:animate-ping" />
              <span className="relative inline-flex size-1.5 rounded-full bg-[#bdfe00]" />
            </span>
            Bagwork Docs
          </span>
        </StaggerItem>

        <StaggerItem>
          <h1 className="docs-mono mt-5 text-balance text-4xl font-bold leading-[1.04] tracking-[-0.025em] text-foreground sm:text-5xl lg:text-[54px]">
            The complete concept,{" "}
            <span className="text-[#ffe70e]">in 14 sections.</span>
          </h1>
        </StaggerItem>

        <StaggerItem>
          <p className="mt-5 max-w-[62ch] text-sm leading-relaxed text-foreground/70 sm:text-[15px]">
            Everything you need to understand Bagwork — the funded content
            marketplace where anyone can run a campaign, anyone can create
            organic content for it, and a slice of every transaction permanently
            burns $BAG.
          </p>
        </StaggerItem>
      </Stagger>

      <Stagger
        className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        step={0.08}
        delay={0.12}
      >
        <StatTile
          icon={Landmark}
          countTo={5}
          suffix="%"
          label="flat platform fee on every Bag"
          accent="yellow"
        />
        <StatTile
          icon={Flame}
          value="50 / 50"
          label="treasury vs $BAG buyback & burn"
          accent="lime"
        />
        <StatTile
          icon={Wallet}
          value="0"
          label="tokens you must hold to start working"
          accent="yellow"
        />
        <StatTile
          icon={BookOpen}
          countTo={14}
          label="sections in this document"
          accent="lime"
        />
      </Stagger>

      <div className="docs-mono mt-8 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/60">
        <span>14 sections</span>
        <span aria-hidden="true" className="h-px w-6 bg-border" />
        <span>the full flywheel</span>
        <span aria-hidden="true" className="h-px w-6 bg-border" />
        <span>scroll to read</span>
      </div>
    </header>
  );
}

/* ------------------------------------------------------- desktop index rail */

function Rail({
  activeId,
  activeIndex,
}: {
  activeId: string | null;
  activeIndex: number;
}) {
  return (
    <aside className="hidden lg:block">
      <div className="docs-mono custom-scroll sticky top-24 max-h-[calc(100vh-7.5rem)] overflow-y-auto pr-1">
        <div className="mb-5">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#ffe70e]">
            Documentation
          </span>
          <h2 className="mt-2 text-base font-bold tracking-tight text-foreground">
            Bagwork Concept
          </h2>
          <p className="mt-2 text-[11px] leading-relaxed text-foreground/60">
            The complete platform model — what it is, who it serves, and how the
            flywheel works.
          </p>
        </div>

        <nav aria-label="On this page">
          <ul className="relative border-l border-border">
            {SECTIONS.map((s) => {
              const isActive = activeId === s.id;
              return (
                <li key={s.id} className="relative">
                  <button
                    type="button"
                    onClick={() => scrollToSection(s.id)}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "relative flex w-full items-start gap-2.5 rounded-r-md py-2 pl-3.5 pr-2 text-left text-[12px] transition-colors focus-visible:ring-[3px] focus-visible:ring-[#ffe70e]/40 focus-visible:outline-none",
                      isActive
                        ? "text-[#ffe70e]"
                        : "text-foreground/60 hover:bg-white/[0.03] hover:text-foreground/90",
                    )}
                  >
                    {isActive ? (
                      <motion.span
                        layoutId="docs-rail-active"
                        aria-hidden="true"
                        className="absolute inset-y-0 -left-px w-[2px] rounded-full bg-[#ffe70e]"
                        style={{ boxShadow: "0 0 10px rgba(255,231,14,0.45)" }}
                        transition={{
                          type: "spring",
                          stiffness: 420,
                          damping: 34,
                        }}
                      />
                    ) : null}
                    <span
                      className={cn(
                        "relative w-4 shrink-0 pt-px text-[10px] font-bold tabular-nums",
                        isActive ? "text-[#ffe70e]/90" : "text-foreground/40",
                      )}
                    >
                      {s.n}
                    </span>
                    <span className="relative font-medium leading-snug">
                      {s.title}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-5 rounded-lg border border-border bg-card/60 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#bdfe00]">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-[#bdfe00] pulse-dot"
            />
            Section {String(activeIndex + 1).padStart(2, "0")} / {SECTIONS.length}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-foreground/60">
            The index follows the section you are reading.
          </p>
        </div>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------- mobile chip index */

function ChipIndex({ activeId }: { activeId: string | null }) {
  return (
    <div className="docs-mono sticky top-16 z-30 -mx-4 border-b border-border bg-[#0b0a07]/95 px-4 py-3 backdrop-blur-xl lg:hidden">
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto">
        {SECTIONS.map((s) => {
          const isActive = activeId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollToSection(s.id)}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
                isActive
                  ? "border-[#ffe70e]/40 bg-[#ffe70e]/10 text-[#ffe70e]"
                  : "border-border bg-card/40 text-foreground/60 hover:text-foreground/90",
              )}
            >
              <span className="tabular-nums">{s.n}</span>
              <span className="hidden sm:inline">{s.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ section card */

function DocSection({ section }: { section: Section }) {
  const meta = SECTION_META[section.id];
  const Icon = meta?.icon ?? BookOpen;
  const accent: Accent = meta?.accent ?? "lime";
  const tone = toneOf(accent);
  const isFeeSplit = section.id === FEE_SPLIT_SECTION;

  return (
    <Reveal amount={0.12}>
      <section
        id={section.id}
        aria-labelledby={`${section.id}-title`}
        className="scroll-mt-24"
      >
        <Card className="gap-0 border-border bg-card/50 py-0 transition-colors duration-200 hover:border-white/[0.14]">
          <CardContent className="p-5 sm:p-7">
            {/* monogram + label on one row, then the heading and description
                start at the card's content edge so every card shares a spine */}
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg border"
                style={{
                  borderColor: `${tone}40`,
                  backgroundColor: `${tone}14`,
                  color: tone,
                }}
              >
                <Icon className="size-4" />
              </span>
              <span
                className="docs-mono text-[10px] font-bold uppercase tracking-[0.18em]"
                style={{ color: tone }}
              >
                Section {section.n}
              </span>
            </div>

            <h2
              id={`${section.id}-title`}
              className="docs-mono mt-4 text-lg font-bold leading-tight tracking-tight text-foreground sm:text-xl lg:text-[26px]"
            >
              {section.title}
            </h2>

            {section.paragraphs?.length ? (
              <div className="mt-5 space-y-4">
                {section.paragraphs.map((paragraph, i) => (
                  <p
                    key={i}
                    className="max-w-[68ch] text-sm leading-relaxed text-foreground/70"
                    dangerouslySetInnerHTML={{ __html: renderInline(paragraph) }}
                  />
                ))}
              </div>
            ) : null}

            {section.list && isFeeSplit ? (
              <Stagger className="mt-5 grid gap-3 sm:grid-cols-2" step={0.08}>
                <FactCard
                  icon={Landmark}
                  accent="lime"
                  title="Platform treasury"
                  body={section.list[0]}
                />
                <FactCard
                  icon={Flame}
                  accent="yellow"
                  title="Buyback & burn"
                  body={section.list[1]}
                />
              </Stagger>
            ) : null}

            {section.list && !isFeeSplit ? (
              <ListRender
                items={section.list}
                ordered={section.listOrdered ?? false}
              />
            ) : null}

            {/* fade-only: the card above already slid, so a second offset here
                would stack motion and read as jitter */}
            {section.diagram ? (
              <Reveal className="mt-6" y={0} amount={0.15}>
                {section.diagram}
              </Reveal>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </Reveal>
  );
}

/* --------------------------------------------------------- audience row */

function AudienceTrio({ sections }: { sections: Section[] }) {
  return (
    <Reveal amount={0.1}>
      <section aria-label="Who Bagwork is for" className="scroll-mt-24">
        <div className="flex items-center gap-3">
          <span className="docs-mono text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/60">
            Who it’s for
          </span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </div>

        <Stagger className="mt-4 grid gap-4 lg:grid-cols-3" step={0.08}>
          {sections.map((s) => {
            const meta = SECTION_META[s.id];
            return (
              <AudienceCard
                key={s.id}
                id={s.id}
                n={s.n}
                title={s.title}
                body={s.paragraphs?.join(" ") ?? ""}
                icon={meta?.icon ?? BookOpen}
                accent={meta?.accent ?? "lime"}
              />
            );
          })}
        </Stagger>
      </section>
    </Reveal>
  );
}

/* ------------------------------------------------------------- closing CTA */

function ClosingCta() {
  return (
    <Reveal className="border-t border-border pt-10 pb-20 lg:pb-24" y={0}>
      <Card className="gap-0 overflow-hidden border-border bg-card py-0">
        <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="max-w-xl space-y-1.5">
            <h2 className="docs-mono text-lg font-bold tracking-tight text-foreground sm:text-xl">
              Put the model to work
            </h2>
            <p className="text-sm leading-relaxed text-foreground/70">
              Browse funded Bags, submit a post and claim your payout in USDC —
              the console tracks every review and settlement.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild size="sm" className="gap-1.5">
              <a href="/dashboard">Open the console</a>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => scrollToSection(SECTIONS[SECTIONS.length - 1].id)}
            >
              Jump to the summary
            </Button>
          </div>
        </CardContent>
      </Card>
    </Reveal>
  );
}

/* -------------------------------------------------------------- list render */

function ListRender({
  items,
  ordered,
}: {
  items: string[];
  ordered: boolean;
}) {
  const MotionList = ordered ? motion.ol : motion.ul;
  return (
    <MotionList
      className="mt-5 max-w-[68ch] space-y-2.5"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
      }}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.1 }}
    >
      {items.map((item, i) => (
        <motion.li
          key={i}
          variants={staggerChild}
          className="flex gap-3 text-sm leading-relaxed text-foreground/70"
        >
          {ordered ? (
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border border-[#ffe70e]/30 bg-[#ffe70e]/[0.08] text-[10px] font-bold tabular-nums text-[#ffe70e]">
              {i + 1}
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="mt-2 size-1.5 shrink-0 rounded-full bg-[#bdfe00]"
            />
          )}
          <span
            className="flex-1"
            dangerouslySetInnerHTML={{ __html: renderInline(item) }}
          />
        </motion.li>
      ))}
    </MotionList>
  );
}





/**
 * Lightweight inline renderer — converts the few markdown-ish tokens used in
 * the concept doc into spans. Supports:
 *   $BAG          → yellow-tinted token ticker
 *   →             → lime arrow
 *   "Bag" (quoted) → italic tinted span
 * Otherwise the string is passed through (HTML-escaped) so dangerouslySetInnerHTML
 * is safe.
 */
function renderInline(input: string): string {
  // escape HTML to be safe (input is trusted static content, but defense in depth)
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  // Protect the arrow chain in the fee-redirect loop sentence so the
  // surrounding $BAG / token replacement doesn't touch arrows.
  const tokens: { kind: "arrow" | "other"; value: string }[] = [];
  let rest = input;
  while (rest.length > 0) {
    const arrowIdx = rest.indexOf("→");
    if (arrowIdx === -1) {
      tokens.push({ kind: "other", value: rest });
      break;
    }
    if (arrowIdx > 0) {
      tokens.push({ kind: "other", value: rest.slice(0, arrowIdx) });
    }
    tokens.push({ kind: "arrow", value: "→" });
    rest = rest.slice(arrowIdx + 1);
  }

  return tokens
    .map((t) => {
      if (t.kind === "arrow") {
        return `<span class="text-[#bdfe00] font-bold">→</span>`;
      }
      // $BAG ticker
      let s = esc(t.value).replace(
        /\$BAG/g,
        '<span class="text-[#ffe70e] font-bold">$BAG</span>'
      );
      // quoted "Bag"
      s = s.replace(
        /"Bag"/g,
        '<span class="text-white italic">"Bag"</span>'
      );
      // arrow tokens still present as literals in some sentences get the
      // lime tint via the dedicated token branch above; arrows in non-token
      // text get the same tint so they always match the brand
      s = s.replace(/→/g, '<span class="text-[#bdfe00] font-bold">→</span>');
      return s;
    })
    .join("");
}
