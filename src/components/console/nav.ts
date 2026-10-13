import {
  BookOpen,
  Compass,
  FileText,
  Gift,
  Home,
  Lightbulb,
  LineChart,
  MessagesSquare,
  Package,
  Plus,
  Settings,
  Trophy,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { SITE_X_URL } from "@/lib/site";

export interface ConsoleNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Matched exactly (used for the console root). */
  exact?: boolean;
}

/**
 * Primary navigation — identical for everyone.
 *
 * There is no creator/publisher split any more. Every account can browse bags, submit
 * work, post its own bag and get paid, so a single ordered list is the whole truth:
 * browse → track your work → get paid → run your own bags → you.
 *
 * Order matters for comprehension, not for permission: `Explore Bags` is first because it
 * is the front door, `Create Bag` sits after the tracking entries because funding a bag is
 * the deliberate act of someone who already knows the product.
 *
 * The leaderboard closes the Marketplace group: it is the one page in there that is about
 * the platform rather than about your own work, so it sits after the three that are yours.
 * Quests follow it — the leaderboard is where points are compared, quests are where they are
 * earned, and the two read as a pair.
 */
export const CONSOLE_NAV: ConsoleNavItem[] = [
  { label: "Explore Bags", href: "/dashboard", icon: Compass, exact: true },
  { label: "My Submissions", href: "/dashboard/submissions", icon: FileText },
  { label: "Earnings", href: "/dashboard/earnings", icon: Wallet },
  { label: "Leaderboard", href: "/dashboard/leaderboard", icon: Trophy },
  { label: "Weekly Quests", href: "/dashboard/quests", icon: Gift },
  /**
   * Community sits after Quests: it is the one place in the Marketplace group you go to *read*
   * rather than to act, and it belongs beside the bags it is attached to rather than down in the
   * account links.
   */
  { label: "Community", href: "/dashboard/community", icon: MessagesSquare },
  { label: "My Bags", href: "/dashboard/my-bags", icon: Package },
  { label: "Create Bag", href: "/dashboard/create", icon: Plus },
  { label: "Profile", href: "/dashboard/profile", icon: UserRound },
  /**
   * Feature Requests closes the list.
   *
   * It is the one entry that is about the *product* rather than about a bag or about your own
   * work: you go there to say what should change, and to add your vote to what someone else
   * already asked for. That is why it is last — after everything you came here to do — and why it
   * gets its own group below rather than being filed under "Account".
   */
  { label: "Feature Requests", href: "/dashboard/features", icon: Lightbulb },
];

export interface ConsoleNavGroup {
  label: string;
  items: ConsoleNavItem[];
}

/**
 * The nav, grouped for display.
 *
 * The group headings describe what you are doing, not who you are — the same person can be
 * in two of these at once, which is exactly why the old role switcher was removed.
 */
export function consoleNavFor(): ConsoleNavGroup[] {
  return [
    // Sliced rather than indexed by number: the boundaries below are the only place the grouping
    // is expressed, so inserting an item cannot silently move a link to the wrong group.
    {
      label: "Marketplace",
      items: CONSOLE_NAV.slice(0, 6),
    },
    { label: "Your bags", items: CONSOLE_NAV.slice(6, 8) },
    // Ends at 9, not open-ended: Feature Requests follows as its own group, and an unbounded
    // slice here would pull it into "Account" the moment it was added.
    { label: "Account", items: CONSOLE_NAV.slice(8, 9) },
    /**
     * The roadmap, from the reader's side.
     *
     * Its own group rather than a slot in one of the three above, because the answer to "where do
     * I ask for a dark mode" should not depend on knowing how this sidebar is filed.
     */
    { label: "Product", items: CONSOLE_NAV.slice(9) },
  ];
}

/** Flat list of every nav item — used by search and the command palette. */
export function consoleNavItems(): ConsoleNavItem[] {
  return CONSOLE_NAV;
}

/** Documentation — a real route (`/docs`), not the marketing SPA's state view. */
export const CONSOLE_DOCS_LINK: ConsoleNavItem = {
  label: "Docs",
  href: "/docs",
  icon: BookOpen,
};

/**
 * Token Analytics — the $BAG dashboard (`/dashboard/token`).
 *
 * Declared above `CONSOLE_NAV_FOOTER` on purpose: the footer array is built at module load, so a
 * `const` referenced before its declaration would throw while the sidebar is being imported rather
 * than at any point the UI could recover from.
 *
 * The same page is linked from the marketing header, so the fee loop is reachable from the site as
 * well as from the console. The page itself reads `BAG_TOKEN_MINT`; until that is set it runs in
 * "Launching Soon" mode rather than showing placeholder numbers.
 */
export const CONSOLE_TOKEN_LINK: ConsoleNavItem = {
  label: "Token Analytics",
  href: "/dashboard/token",
  icon: LineChart,
};

/** Bottom section. Docs is first so it sits above Settings, beside the X link. */
export const CONSOLE_NAV_FOOTER: ConsoleNavItem[] = [
  CONSOLE_DOCS_LINK,
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
  /*
   * Token Analytics sits last, at the very bottom of the sidebar.
   *
   * It is a platform-level read — the $BAG fee loop, the buyback-and-burn ledger and the market
   * metrics — not part of a Bagworker's own workflow, so it belongs under the account links rather
   * than in the Marketplace group where it would compete with Explore.
   */
  CONSOLE_TOKEN_LINK,
];

/**
 * Our X account.
 *
 * External, so it is a plain anchor with `rel="noreferrer noopener"` rather than a
 * `next/link`, and the mark comes from the shared platform glyph set.
 */
export const CONSOLE_SOCIAL_LINK = {
  label: "Bagwork on X",
  // Single-sourced with the launch metadata's default X link — see `SITE_X_URL`.
  href: SITE_X_URL,
};

/**
 * Leaves the console for the marketing site (`/`). The landing page is a separate
 * app, so this is the return path that keeps the two halves connected.
 *
 * The sidebar mark is a second way out — it points at the same place, because the logo
 * is the control people reach for when they want to leave a product.
 */
export const CONSOLE_SITE_LINK: ConsoleNavItem = {
  label: "Back to site",
  href: "/",
  icon: Home,
  exact: true,
};

/**
 * Whether a nav item is the one the given route is on.
 *
 * Prefix match, so a bag's detail page keeps "Explore Bags" lit while you are inside it. `exact`
 * exists for the console root (`/dashboard`), which would otherwise claim every route beneath it.
 */
export function isNavItemActive(pathname: string, item: ConsoleNavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
