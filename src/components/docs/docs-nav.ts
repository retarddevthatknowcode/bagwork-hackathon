import { POINTS_LEVELS_SECTION_ID } from "@/lib/profile/points";
import { QUESTS_SECTION_ID } from "@/lib/quests/weekly";

/**
 * The docs' table of contents, in the order the page renders it.
 *
 * One list, four consumers: the sidebar (grouped), the right-hand "On this page" rail, the page's
 * own `<h2 id>` anchors, and the section header each of those headings belongs to. They cannot
 * drift, because they are the same array.
 *
 * Two ids are imported rather than written here — `11-points-levels-profile-value` and
 * `12-weekly-quests`. Those are the **old** anchor addresses: the profile page and the quests page
 * both deep-link into the docs, and they were written when those sections really were 11 and 12.
 * When Summary moved to the end the printed numbers shifted, which left `08 Points` behind an
 * href reading `#11-…` — links that worked but looked wrong, and that is exactly the kind of thing
 * a reader stops trusting.
 *
 * So each section now has an `id` derived from the number it prints, and the old address is kept
 * as an **alias**: a zero-height element carrying the legacy id, rendered at the top of the
 * section. Both addresses scroll to the same block, so nothing that already links to the docs
 * breaks, and the sidebar/TOC hrefs match the numbers on screen.
 *
 * Pure module — no Prisma, no React — so a client component can import it. (`lib/profile/points`
 * and `lib/quests/weekly` are both import-free, which is what makes the ids shareable like this.)
 */

/** Sidebar groups. The docs shell renders these as labelled sections in the left rail. */
export const DOC_GROUPS = ["Core", "Work", "Reputation", "Close"] as const;

export type DocGroup = (typeof DOC_GROUPS)[number];

export interface DocSectionMeta {
  /** Anchor id. Kept stable even when the printed section number changes. */
  id: string;
  /** Printed section number, `01`–`12`. */
  n: string;
  /** Heading, sidebar entry and TOC label. */
  title: string;
  /** Shorter label for the narrow right-hand TOC. */
  short: string;
  /**
   * One line under the heading.
   *
   * Every deck is a compression of sentences already in that section — a reader who stops after
   * the deck has read nothing that is not also stated below it. No deck introduces a fact.
   */
  deck: string;
  /** Which sidebar group the entry sits in. */
  group: DocGroup;
  /**
   * Older addresses for this section, kept working.
   *
   * A zero-height element carrying each alias is rendered at the top of the section, so an href
   * written against a previous numbering still lands on the right block.
   */
  aliases?: string[];
}

export const DOC_SECTIONS: DocSectionMeta[] = [
  {
    id: "01-what-bagwork-is",
    n: "01",
    title: "What Bagwork is",
    short: "What Bagwork is",
    deck: "A funded content marketplace: anyone can open a campaign, and Bagworkers get paid for real posts.",
    group: "Core",
  },
  {
    id: "02-campaign-types",
    n: "02",
    title: "Two campaign types",
    short: "Campaign types",
    deck: "A Bag is funded one of two ways — by a deposit, or by a token's own trading fees.",
    group: "Core",
  },
  {
    id: "03-fixed-campaigns",
    n: "03",
    title: "How fixed campaigns work",
    short: "Fixed campaigns",
    deck: "Fund the bag, write the brief, review the work, pay on-chain.",
    group: "Core",
  },
  {
    id: "04-flywheel-launch-and-fees",
    n: "04",
    title: "How Flywheel works",
    short: "Flywheel",
    deck: "A token's trading fees become its own content budget, automatically.",
    group: "Core",
  },
  {
    id: "05-platform-fee-and-bag-burn",
    n: "05",
    title: "The 5% fee and $BAG burn",
    short: "Fee & $BAG burn",
    deck: "Half funds the platform. Half buys $BAG from the open market and burns it.",
    group: "Core",
  },
  {
    id: "06-who-its-for",
    n: "06",
    title: "Who it's for",
    short: "Who it's for",
    deck: "Token teams, brands and communities — and the creators who make the content.",
    group: "Work",
  },
  {
    id: "07-submit-review-pay",
    n: "07",
    title: "Submit, review, pay",
    short: "Submit → review → pay",
    deck: "Paste a link, pass review, get paid on-chain.",
    group: "Work",
  },
  {
    id: "08-points-levels-rank-badges",
    aliases: [POINTS_LEVELS_SECTION_ID],
    n: "08",
    title: "Points, levels, rank badges",
    short: "Points & levels",
    deck: "A permanent public score: $1 of approved earnings is 33 points.",
    group: "Reputation",
  },
  {
    id: "09-weekly-quests",
    aliases: [QUESTS_SECTION_ID],
    n: "09",
    title: "Weekly quests",
    short: "Weekly quests",
    deck: "Three small goals a week, 200 points each, resetting Monday 00:00 UTC.",
    group: "Reputation",
  },
  {
    id: "10-campaign-communities",
    n: "10",
    title: "Campaign communities",
    short: "Communities",
    deck: "One announcement board per bag, for the people working on it.",
    group: "Close",
  },
  {
    id: "11-profile-identity",
    n: "11",
    title: "Profile identity",
    short: "Profile identity",
    deck: "A character, a permanent number, and a record of work that cannot be inflated.",
    group: "Close",
  },
  {
    id: "12-summary",
    n: "12",
    title: "Summary",
    short: "Summary",
    deck: "The whole loop, in one paragraph.",
    group: "Close",
  },
];
