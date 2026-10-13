import {
  BookOpen,
  Building2,
  Flame,
  Info,
  Landmark,
  Lightbulb,
  MessagesSquare,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  TriangleAlert,
  Trophy,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";

import { Step, Steps } from "fumadocs-ui/components/steps";

import { DiagramApprovalPipeline } from "./diagram-approval-pipeline";
import { DiagramCampaignLoop } from "./diagram-campaign-loop";
import { DiagramCommunity } from "./diagram-community";
import { DiagramFeeRedirect } from "./diagram-fee-redirect";
import { DiagramFeeSplit } from "./diagram-fee-split";
import { DiagramPointsLevels } from "./diagram-points-levels";
import { DiagramProfileMarketplace } from "./diagram-profile-marketplace";
import { DiagramWeeklyQuests } from "./diagram-weekly-quests";
import { DocsProfileCast } from "./docs-profile-cast";
import { DOC_SECTIONS } from "./docs-nav";

/**
 * The docs body.
 *
 * Every sentence here is the wording that was already on the page. What changed is the shape: the
 * twelve topics the concept doc always covered are now twelve `##` sections in the order a reader
 * meets them, Summary has moved from the middle to the end, and the prose is set in Fumadocs'
 * typography instead of hand-rolled cards.
 *
 * No claim was added, removed or re-scoped. Where wording was tightened it was tightened around the
 * same fact — and anything describing something that is **not** live yet still says so, in a
 * `Callout` that says it louder than the paragraph used to.
 *
 * Renders on the server: the only interactive things inside are the diagram components, which are
 * client components and are rendered as leaves.
 */

/* --------------------------------------------------------------- primitives */

/** `$BAG`, as the concept doc always styled it. */
const BAG = <span className="font-semibold text-[#ffe70e]">$BAG</span>;
/** The loop arrows, tinted so a chain of them reads as one flow. */
const ARROW = <span className="font-semibold text-[#bdfe00]">→</span>;

function P({ children }: { children: React.ReactNode }) {
  return <p className="bw-p">{children}</p>;
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="bw-list">
      {items.map((item, index) => (
        <li key={index}>
          <span aria-hidden="true" className="bw-list-dot" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A section: eyebrow number, display heading, one-line deck, then the body.
 *
 * The same three-part header on all twelve sections, because that repetition is what makes the page
 * scannable. The id comes from the shared manifest, so the heading, the sidebar entry and the rail
 * all address the same element — there is no second place for a section name to be spelled.
 */
function Section({ id, children }: { id: string; children: React.ReactNode }) {
  const meta = DOC_SECTIONS.find((section) => section.id === id)!;

  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-28 border-t border-fd-border/70 pt-12 pb-4 first:border-t-0 first:pt-0"
    >
      {/* Legacy addresses for this section — zero-height, so they occupy no space but still scroll
          here. See `aliases` in `docs-nav.ts`. */}
      {meta.aliases?.map((alias) => (
        <span key={alias} id={alias} aria-hidden="true" className="bw-anchor-alias" />
      ))}
      <header className="mb-6">
        <span className="bw-eyebrow">{meta.n}</span>
        <h2 id={`${id}-title`} className="bw-h2 mt-3 text-balance">
          {meta.title}
        </h2>
        <p className="bw-deck mt-2.5">{meta.deck}</p>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------- components */

/** Diagram wrapper — a little extra room above so a figure never crowds its paragraph. */
function Figure({ children }: { children: React.ReactNode }) {
  return <div className="pt-2">{children}</div>;
}

/** One figure in the hero's fact row. Real values only — see `DocsHero`. */
function HeroStat({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
}) {
  return (
    <li className="bw-stat">
      <Icon aria-hidden="true" className="bw-stat-icon" />
      <span className="bw-stat-value">{value}</span>
      <span className="bw-stat-label">{label}</span>
    </li>
  );
}

/**
 * A campaign type — the two-up pair in section 02.
 *
 * Equal columns, equal height: `Fixed Bags` and `Flywheel` are alternatives, not a primary and a
 * secondary, and a card that is taller than its neighbour quietly ranks them.
 */
function TypeCard({
  icon: Icon,
  kicker,
  title,
  body,
}: {
  icon: LucideIcon;
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <div className="bw-card">
      <span className="bw-card-icon">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <p className="bw-card-kicker">{kicker}</p>
      <h3 className="bw-card-title">{title}</h3>
      <p className="bw-card-body">{body}</p>
    </div>
  );
}

/** One weekly quest: icon, name, what it pays, and the rule it counts. */
function QuestCard({
  icon: Icon,
  title,
  rule,
}: {
  icon: LucideIcon;
  title: string;
  rule: string;
}) {
  return (
    <div className="bw-quest">
      <span className="bw-card-icon">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <h3 className="bw-quest-title">{title}</h3>
      {/* Every quest pays the same 200, so the reward is stated once and is not repeated per card. */}
      <span className="bw-quest-reward">200 pts</span>
      <p className="bw-card-body">{rule}</p>
    </div>
  );
}

/**
 * The 5% split, as two bars.
 *
 * The split is 50 / 50 — that is the whole number, so the bars are equal by definition. Nothing here
 * is estimated, and nothing is measured against a figure that could drift; the bars illustrate the
 * one ratio the doc actually states.
 */
function FeeSplitBars() {
  const rows = [
    {
      label: "Platform treasury",
      value: "50%",
      note: "This money is used to develop new features, run incentives, and keep the platform running.",
      tone: "lime",
    },
    {
      label: "$BAG buyback and burn",
      value: "50%",
      note: "Used to buy $BAG tokens from the open market and permanently burn them.",
      tone: "gold",
    },
  ];

  return (
    <div className="bw-bars">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="bw-bar-head">
            <span className="bw-bar-label">{row.label}</span>
            <span className="bw-bar-value">{row.value}</span>
          </div>
          <div className="bw-bar-track" aria-hidden="true">
            <span className="bw-bar-fill" data-tone={row.tone} />
          </div>
          <p className="bw-bar-note">{row.note}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Level thresholds.
 *
 * A table rather than a bullet list, because six rows of "a number and a number" *are* a table, and
 * a reader comparing thresholds wants them aligned. The badge column is the doc's own sentence —
 * "six shields, one for each level, shown in order … Initiate, Contender, Vanguard, Elite, Mythic,
 * and Legendary" — read out as the mapping it already describes.
 */
function LevelTable() {
  const levels: { level: number; points: string; badge: string }[] = [
    { level: 1, points: "0", badge: "Initiate" },
    { level: 2, points: "5,000", badge: "Contender" },
    { level: 3, points: "25,000", badge: "Vanguard" },
    { level: 4, points: "75,000", badge: "Elite" },
    { level: 5, points: "200,000", badge: "Mythic" },
    { level: 6, points: "500,000", badge: "Legendary" },
  ];

  return (
    <div className="bw-table-wrap">
      <table className="bw-table">
        <caption className="sr-only">Points required for each level</caption>
        <thead>
          <tr>
            <th scope="col">Level</th>
            <th scope="col">Points</th>
            <th scope="col">Badge</th>
          </tr>
        </thead>
        <tbody>
          {levels.map((row) => (
            <tr key={row.level}>
              <th scope="row">Level {row.level}</th>
              <td className="bw-table-num">{row.points}</td>
              <td>{row.badge}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A callout.
 *
 * Built here rather than re-skinned from Fumadocs' `Callout`: that component sets its accent
 * through an **inline** `--callout-color` custom property, and an inline declaration outranks any
 * class, so every colour and border it draws would have to be overridden with `!important`. Own
 * markup, own tokens, three tones, no fighting.
 */
function Note({
  type,
  title,
  children,
}: {
  type: "info" | "warn" | "idea";
  title: string;
  children: React.ReactNode;
}) {
  const Icon = type === "warn" ? TriangleAlert : type === "idea" ? Lightbulb : Info;

  return (
    <aside className="bw-note" data-tone={type}>
      <span className="bw-note-icon" aria-hidden="true">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="bw-note-title">{title}</p>
        <div className="bw-note-body">{children}</div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------- hero */

function DocsHero() {
  const facts = [
    { icon: Landmark, value: "5%", label: "flat platform fee on every Bag" },
    { icon: Flame, value: "50 / 50", label: "treasury vs $BAG buyback & burn" },
    // Deliberately not "0". A zero in a stat tile reads as a broken number rather than as the point
    // being made, and the point is the strong one: holding the token is not a requirement.
    { icon: Wallet, value: "None", label: "tokens you must hold to start working" },
    { icon: BookOpen, value: "12", label: "sections in this document" },
  ];

  return (
    <header className="bw-hero">
      <span className="bw-pill">
        <span aria-hidden="true" className="bw-pill-dot" />
        Bagwork docs
      </span>

      <h1 className="bw-hero-title">
        The complete concept, <span className="bw-hero-title-accent">in 12 sections.</span>
      </h1>

      <p className="bw-hero-sub">
        Everything you need to understand Bagwork — the funded content marketplace where anyone can
        run a campaign, anyone can create organic content for it, and a slice of every transaction
        permanently burns {BAG}.
      </p>

      <ul className="bw-stats">
        {facts.map((fact) => (
          <HeroStat key={fact.label} {...fact} />
        ))}
      </ul>
    </header>
  );
}


/* ------------------------------------------------------------------ 01–02 */

function SectionWhatBagworkIs() {
  return (
    <Section id="01-what-bagwork-is">
      <P>
        Bagwork is a platform where anyone can create a funded content campaign (called a “Bag”).
        Creators on the platform, called Bagworkers, make real organic content for that campaign on
        social media platforms like X, TikTok, Instagram, and YouTube.
      </P>
      <P>
        The key difference from normal influencer or KOL platforms is that Bagworkers do not need to
        hold the project&apos;s token to participate. They simply create content according to the
        campaign rules and get paid based on the rate the campaign creator has set. Payment can be
        based on views, a fixed amount per post, or a mix of both.
      </P>
      <P>
        Every campaign that runs on Bagwork pays a 5% platform fee. Half of that fee goes into the
        platform treasury so the product can keep improving. The other half is used to buy {BAG}{" "}
        tokens from the open market and burn them. This means the more campaigns that run and the
        more money that flows through the platform, the more {BAG} gets removed from circulation.
      </P>
    </Section>
  );
}

function SectionCampaignTypes() {
  return (
    <Section id="02-campaign-types">
      <P>A Bag is funded in one of two ways.</P>
      <div className="bw-pair">
        <TypeCard
          icon={Wallet}
          kicker="Deposit-funded"
          title="Fixed Bags"
          body="Funded by the person or team who opens the campaign. They deposit the budget in tokens or USDC, write what kind of content they want, and set the payment rate. Bagworkers are paid from that budget, on-chain, as their work is approved."
        />
        <TypeCard
          icon={Rocket}
          kicker="Fee-funded"
          title="Flywheel"
          body="Funded by the coin's own trading fees. A share of a token's trading or creator fees is routed to a Bagwork wallet, converted automatically into USDC, and becomes the live budget of that token's campaign."
        />
      </div>
      <Note type="info" title="Same rules either way">
        Review, approval and the 5% platform fee work identically for both. The only difference is
        where the budget comes from — a deposit, or a token&apos;s trading activity.
      </Note>
    </Section>
  );
}


/* ------------------------------------------------------------------ 03–04 */

function SectionFixedCampaigns() {
  return (
    <Section id="03-fixed-campaigns">
      <Steps>
        <Step>
          <h3>Fund the bag</h3>
          <p>Someone creates a Bag and funds it with tokens or USDC.</p>
        </Step>
        <Step>
          <h3>Write the brief</h3>
          <p>They write what kind of content they want and set the payment rate.</p>
        </Step>
        <Step>
          <h3>Creators deliver</h3>
          <p>
            Bagworkers find the campaign, create content, and submit the link to their post.
          </p>
        </Step>
        <Step>
          <h3>Review</h3>
          <p>The post is reviewed (first by AI, then by a human if needed).</p>
        </Step>
        <Step>
          <h3>Get paid</h3>
          <p>
            If the post is approved, the creator gets paid directly on-chain according to the rate
            that was set.
          </p>
        </Step>
        <Step>
          <h3>The 5% fee</h3>
          <p>
            The 5% fee is taken and split between the treasury and the {BAG} buyback-and-burn.
          </p>
        </Step>
      </Steps>
      <P>This is the basic loop of the platform.</P>
      <Figure>
        <DiagramCampaignLoop />
      </Figure>
    </Section>
  );
}

function SectionFlywheel() {
  return (
    <Section id="04-flywheel-launch-and-fees">
      <P>
        This feature is designed especially for new tokens. When someone launches a token on
        pump.fun or any other launchpad (on any chain), they can choose to send a portion of the
        trading fees or creator fees to a special Bagwork wallet. Those fees arrive in the token
        itself. The system then automatically converts them into USDC. The USDC becomes the live
        budget of a Bag campaign for that token.
      </P>
      <P>
        This creates a powerful loop: More trading {ARROW} More fees collected {ARROW} Bigger
        content budget {ARROW} More content created {ARROW} More attention on the token {ARROW} More
        trading. It turns trading activity into an automatic marketing engine.
      </P>
      <Note type="idea" title="A token marketing its own chart">
        The loop is the product. Trading activity pays for the content, the content brings attention
        back to the token, and the attention is what produces more trading — with no one deciding to
        run another campaign.
      </Note>
      <Figure>
        <DiagramFeeRedirect />
      </Figure>
    </Section>
  );
}


/* ------------------------------------------------------------------ 05–06 */

function SectionFee() {
  return (
    <Section id="05-platform-fee-and-bag-burn">
      <P>
        Every Bag pays a 5% fee. This fee is split equally between two things, and both of them are
        public: where the money goes is not a policy that can change quietly.
      </P>
      <FeeSplitBars />
      <P>
        This creates a direct relationship between platform usage and the supply of {BAG}. The more
        successful Bagwork becomes, the more {BAG} is burned.
      </P>
      <Figure>
        <DiagramFeeSplit />
      </Figure>
    </Section>
  );
}

function SectionWhoItsFor() {
  return (
    <Section id="06-who-its-for">
      <P>Bags are not limited to crypto token teams. Anyone can open one:</P>
      <Bullets
        items={[
          "Memecoin and token developers",
          "Real-world brands",
          "Individual creators or influencers",
          "Communities",
          "Even regular people who simply want content made for them",
        ]}
      />
      <P>
        The person or team creating the Bag writes a clear description of what they want, deposits
        the budget, sets how much they are willing to pay per view or per post, and publishes it.
        Bagworkers then decide if they want to work on it.
      </P>

      <h3 className="pt-2 text-base font-semibold text-fd-foreground">
        For Bagworkers (The Creators)
      </h3>
      <P>
        Bagworkers are the people who make the content. They do not need to buy or hold the project
        token. They browse open Bags, choose ones they like or that pay well, create the content,
        and submit the link. After review, they get paid. Over time they build a reputation on the
        platform through trust score, experience points, levels, streaks, and quests. Higher
        reputation can lead to better opportunities and higher-paying campaigns.
      </P>

      <h3 className="pt-2 text-base font-semibold text-fd-foreground">
        For Token Teams and Memecoin Developers
      </h3>
      <P>
        Instead of only spending money on boosts, ads, or paid promoters, a team can put part of
        their supply or their trading fees into a Bag. This gives them real organic content from many
        different creators, full transparency on how the money was spent, and participation in the{" "}
        {BAG} burn system at the same time. When combined with the Fee Redirect feature, their
        marketing budget can grow automatically as their token is traded.
      </P>

      <h3 className="pt-2 text-base font-semibold text-fd-foreground">
        For Brands and Individual Creators
      </h3>
      <P>
        Any brand or person who wants user-generated content can open a Bag, describe exactly what
        they need, fund it with USDC, set the rate, and let Bagworkers deliver the content. This
        makes Bagwork useful outside of pure crypto as well.
      </P>
    </Section>
  );
}


/* ------------------------------------------------------------------ 07–08 */

function SectionSubmitReviewPay() {
  return (
    <Section id="07-submit-review-pay">
      <P>In the early version of the platform, the process is kept simple and controlled:</P>
      <Bullets
        items={[
          "The Bagworker only needs to paste the link to their post.",
          "An AI system reviews the content for quality, relevance, and spam.",
          "The system automatically calculates how much should be paid based on the campaign rules.",
          "The submission appears in an admin panel.",
          "A human admin only needs to click Approve or Reject.",
          "If approved, the payment is sent on-chain.",
        ]}
      />
      <P>
        This approach avoids needing expensive official social media APIs at the beginning while
        still keeping quality under control.
      </P>
      <Figure>
        <DiagramApprovalPipeline />
      </Figure>
    </Section>
  );
}

function SectionPointsLevels() {
  return (
    <Section id="08-points-levels-rank-badges">
      <P>
        Every Bagworker carries a public score: Points. Points measure how much real, settled work a
        profile has delivered — not how loud it is, not how early it arrived, and not how much money
        it holds. The rule is fixed and simple: $1 of approved earnings = 33 points.
      </P>
      <P>
        Points can only ever come from money that actually moved, or from a weekly quest that was
        actually completed. A payout that settled on-chain adds points. A quest that reached its
        target adds 200. A submission that is still pending, one that was rejected, and anything
        adjusted by hand adds nothing. There is no way to buy points, no way to move them into a
        profile, and no manual override — which is exactly what makes the number mean something.
      </P>
      <P>
        Points never go down. A profile&apos;s total is its lifetime record, so once work has been
        paid for, the score stays. As the total grows the profile passes thresholds and gains a
        Level, from Level 1 at 0 points up to Level 6 at 500,000 points.
      </P>
      <LevelTable />
      <Figure>
        <DiagramPointsLevels />
      </Figure>
      <P>
        Every level also has a badge. Six shields, one for each level, shown in order on your
        profile: Initiate, Contender, Vanguard, Elite, Mythic, and Legendary. The badge for your
        current level is highlighted; the ones you have not reached yet are still shown, greyed out,
        with the number of points they need. A badge is only ever a picture of your level — it is not
        a second score, it cannot be bought, and it changes only when your level changes.
      </P>
      <P>
        Alongside points, every profile has a permanent number of its own, generated the moment the
        profile is created and shown everywhere as Bagworker#3578. A handle or display name can be
        changed later; the number cannot.
      </P>
      <Note type="warn" title="Profiles are not sellable yet">
        <p>
          That is what turns a profile from a login into an asset. In the future, profiles will be
          sellable, and the number, the level and the entire points and work history go with them.
        </p>
        <p>
          The future marketplace works like this: owners will be able to list their own profile,
          buyers will be able to purchase a profile, and ownership will transfer together with the
          Bagworker# number and all of the profile&apos;s points and level history. Profile value
          will be driven by three things — total points, current level, and work history.
        </p>
        <p>
          None of this is switched on yet, and none of it changes how the platform works today.
          Levels are status only: no campaign, bag or payout is ever gated behind one.
        </p>
      </Note>
    </Section>
  );
}


/* ------------------------------------------------------------------ 09–10 */

function SectionWeeklyQuests() {
  return (
    <Section id="09-weekly-quests">
      <P>
        Weekly quests are three small goals that every Bagworker gets at the start of each week.
        Complete one and it pays 200 points. Every quest resets when a new week begins — Monday at
        00:00 UTC — and then you can complete it again.
      </P>
      <div className="bw-trio">
        <QuestCard
          icon={Target}
          title="Opt-in Starter"
          rule="Opt into 3 different live Bags during the week."
        />
        <QuestCard
          icon={Sparkles}
          title="Content Creator"
          rule="Submit 5 content links that pass validation during the week."
        />
        <QuestCard
          icon={Trophy}
          title="View Hunter"
          rule="Generate 10,000 verified views across submissions approved during the week."
        />
      </div>
      <P>
        What makes them worth having is what they count. A quest never trusts a number you tell it.
        It counts work that has already been verified somewhere else on the platform: a bag you
        really opted into, a post link that passed the validation check, or views on a submission
        that was reviewed and approved. If the work did not happen, the progress does not move.
      </P>
      <P>
        Each one pays 200 points, so a full week of quests is worth 600 points on top of everything
        else you earn. Progress updates while you work: as soon as an action is verified the progress
        bar moves, and the moment the bar reaches its target the quest is marked Completed and the
        200 points are added to your profile automatically. There is no claim button to press, and no
        way to fall behind on claiming a reward you earned.
      </P>
      <P>
        Points from quests behave exactly like every other point on Bagwork: they are permanent, they
        never go down, and they count toward your Level. So a Bagworker who is genuinely active each
        week moves up faster than the earnings curve alone would allow — which is the point. Quests
        exist to reward real weekly work.
      </P>
      <P>
        When the week ends, the quests reset and start from zero. What you completed does not
        disappear: the points are already yours, and the work behind them stays in your submission
        history.
      </P>
      <Figure>
        <DiagramWeeklyQuests />
      </Figure>
    </Section>
  );
}

function SectionCommunities() {
  return (
    <Section id="10-campaign-communities">
      <P>
        A Bag is more than a budget. It is a group of people who agreed to make content for the same
        campaign, and for a long time those people had nowhere to talk to each other. A Community is
        that place: one announcement board attached to a bag, where the publisher tells everyone what
        the campaign needs next.
      </P>
      <P>
        Each bag can have exactly one. The publisher who funded the bag creates it, and becomes its
        admin — the only person who can post. Everyone who joined that campaign can walk in and read.
        Nobody else can open it at all, not a signed-in user who skipped the bag and not a visitor.
        Access is not something you apply for; it is something the bag has already decided.
      </P>
      <P>
        It is built for the things a campaign has to say out loud: the brief and its rules, a change
        to the payout model, an update when a bag is topped up, and what is working for the other
        creators in it. Announcements carry images and links, and the admin can pin the ones that
        should stay put — a pinned post is a standing instruction, so it sits above the feed rather
        than being scrolled for.
      </P>
      <Bullets
        items={[
          "Announcements — the brief, the rules, and what has changed",
          "Updates — a bag topped up, a rate moved, a deadline shifted",
          "Coordination — what to post, what is landing, what to avoid",
        ]}
      />
      <P>
        Members read everything and cannot send. That asymmetry is the point rather than an
        oversight: a board anyone can post to stops being the place you check what the campaign
        actually said. There are no voice notes either, for a similar reason — a board people read
        later has to be searchable, and audio is not.
      </P>
      <P>
        Getting in follows from the bag. Publishers open the community from the bag they funded.
        Bagworkers join the bag first — claiming a slot is what makes someone a member — and the
        Community button appears on that bag from then on. If you have not joined, there is nothing
        to see and nothing to apply for.
      </P>
      <Note type="info" title="Chat is live; Ideas and Planning are not">
        Two more spaces sit on the same board: Ideas, for collecting angles worth trying, and
        Planning, for milestones and posting schedules. Both are visible and labelled as coming soon
        rather than quietly missing — Chat is the channel that is live today.
      </Note>
      <Figure>
        <DiagramCommunity />
      </Figure>
    </Section>
  );
}


/* ------------------------------------------------------------------ 11–12 */

function SectionProfileIdentity() {
  return (
    <Section id="11-profile-identity">
      <P>
        A Bagworker profile is more than a login. It carries a pixel character chosen once during
        setup, a permanent number shown everywhere as Bagworker#3578, and a public record of the work
        that profile has actually delivered. Points, level and badge are all part of that record.
      </P>
      <Bullets
        items={[
          "Set once — the pixel character is chosen in onboarding and cannot be changed afterwards",
          "Permanent — the Bagworker# number is generated at creation and never changes",
          "Earned, never bought — points and level come only from approved work and completed quests",
          "Transferable in future — number, character and full history would move together, if this ships",
        ]}
      />
      {/* The bullets above are the claims; this is what they look like. Four real characters, drawn
          by the console's own renderer, taking turns under one handle and one number. */}
      <Figure>
        <DocsProfileCast />
      </Figure>
      <P>
        The record is what gives a profile its value, and it is value that can only be built one way:
        by doing approved work. Points cannot be bought, transferred in from somewhere else, or
        manufactured by hand. So a profile that has delivered a lot of real work is worth more than
        one that has not — and the platform does not have to promise anything for that to be true.
      </P>
      <P>
        The character is fixed after onboarding on purpose. If a profile could be reshaped whenever
        its holder liked, there would be nothing stable to recognise and nothing durable for the work
        to accumulate against. Identity is set once; the score is what moves.
      </P>
      <Note type="warn" title="Not live, and not a financial promise">
        <p>
          In the future, profiles are intended to be transferable. The plan is that a holder could
          list their profile and a buyer could purchase it, with ownership moving together with the
          Bagworker# number, the character, and the whole points and level history — so the work a
          profile has done stays with it no matter which account holds it.
        </p>
        <p>
          None of that is switched on today, and none of it is a financial promise. There is no token
          tied to a profile, no yield, no guaranteed resale value and no expectation of profit. A
          profile is a record of work. Whether one is ever sold, and for how much, is left entirely
          to the people who might one day trade them. The one thing the platform does control is that
          the record is real and cannot be inflated.
        </p>
      </Note>
      <Figure>
        <DiagramProfileMarketplace />
      </Figure>
    </Section>
  );
}

function SectionSummary() {
  return (
    <Section id="12-summary">
      <div className="bw-closing">
        <p className="bw-closing-text">
          Bagwork turns content creation into an open marketplace. Anyone can fund a campaign. Anyone
          can work on a campaign. Payments are transparent and on-chain. A portion of every campaign
          permanently reduces the supply of {BAG}. The Fee Redirect feature adds an extra layer where
          trading activity on a token can automatically fund its own marketing through content.
        </p>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------- page */

/**
 * The whole document, in the order the sidebar lists it.
 *
 * Summary is last. It used to sit in the middle of the page (section 10 of 14), which meant the one
 * paragraph that ties every other section together appeared before five of them had been read.
 */
export function DocsContent() {
  return (
    <article className="docs bw-doc">
      <DocsHero />
      <div className="bw-sections">
        <SectionWhatBagworkIs />
        <SectionCampaignTypes />
        <SectionFixedCampaigns />
        <SectionFlywheel />
        <SectionFee />
        <SectionWhoItsFor />
        <SectionSubmitReviewPay />
        <SectionPointsLevels />
        <SectionWeeklyQuests />
        <SectionCommunities />
        <SectionProfileIdentity />
        <SectionSummary />
      </div>
    </article>
  );
}

