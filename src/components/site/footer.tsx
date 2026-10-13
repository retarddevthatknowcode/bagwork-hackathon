/**
 * The footer.
 *
 * Every link here goes somewhere real. That is the whole rule, and it is why this file no longer
 * lists "API Reference", "Careers", "Press Kit" or a "Cookie Policy": those were stubs that
 * scrolled the visitor back to the top of the page they were already on, which reads as a broken
 * site rather than as a roadmap. Links we cannot honour do not belong in a footer.
 *
 * Server component, with no state and no `useApp`. It used to be a client component only because
 * "Top Earners" switched the marketing SPA's view; that board is a real route now, so the whole
 * thing is static markup and the browser downloads nothing to render it. The Bloom Orb in front of
 * the wordmark does not change that: it is CSS plus one style attribute and carries no `"use
 * client"` of its own (`landing/bloom-orb.tsx` explains why), so it renders here on the server like
 * everything else in this file.
 */

import { SITE_X_URL } from "@/lib/site";
import { BloomOrb } from "@/components/landing/bloom-orb";

interface FooterLink {
  label: string;
  href: string;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

/**
 * Five destinations per group at most, and each one is a route or a real section on `/`.
 *
 * `Explore Bags` names the full, filterable marketplace, and that is the console route
 * (`/dashboard`) — the homepage's `#live` block is a capped preview of it, so the label and the
 * destination only agree at the console. The section links keep the `/#` prefix for the reason the
 * header uses it: a bare hash only resolves on the page it is written on, so from `/docs` or
 * `/terms` it would do nothing.
 */
const COLUMNS: FooterColumn[] = [
  {
    title: "PRODUCT",
    links: [
      { label: "Explore Bags", href: "/dashboard" },
      { label: "How It Works", href: "/#how" },
      { label: "Fee Redirect", href: "/#fee-redirect" },
      { label: "Token Analytics", href: "/dashboard/token" },
      { label: "Docs", href: "/docs" },
    ],
  },
  {
    title: "CREATORS",
    links: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Leaderboard", href: "/dashboard/leaderboard" },
      { label: "Weekly Quests", href: "/dashboard/quests" },
      { label: "Community", href: "/dashboard/community" },
    ],
  },
  {
    title: "PUBLISHERS",
    links: [
      { label: "Create Bag", href: "/dashboard/create" },
      { label: "My Bags", href: "/dashboard/my-bags" },
      { label: "Feature Requests", href: "/dashboard/features" },
    ],
  },
  {
    title: "LEGAL",
    links: [
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
    ],
  },
];

/**
 * The X mark, inline.
 *
 * Drawn here rather than pulled from an icon library: `lucide`'s fallback is the old Twitter bird,
 * and the site's own `PlatformIcon` renders a lettered tile, which is right inside a bag card and
 * wrong beside a brand name. One path, `currentColor`, sized by the caller.
 */
function XMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto border-t border-white/10 bg-[#0f0d08]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-6 md:gap-8">
          {/* Brand */}
          <div className="col-span-2">
            <a
              href="/"
              aria-label="Bagwork — home"
              className="inline-flex items-center gap-2.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bdfe00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0d08]"
            >
              {/*
               * The Bloom Orb, in front of the name.
               *
               * The same pure-CSS sphere the step card uses, at 26px so it sits level with the
               * wordmark's 24px caps rather than towering over them. `aria-hidden` inside the
               * component: the link's own label already says "Bagwork", so this is decoration.
               */}
              <BloomOrb size={26} speed={8} />
              <span className="text-2xl font-bold tracking-tight">
                <span className="text-[#ffe70e]">bag</span>
                <span className="text-white">work</span>
              </span>
            </a>
            <p className="mt-4 max-w-xs text-xs leading-relaxed text-white/50">
              The on-chain content marketplace. Projects fund Bags, creators get paid
              on-chain for approved work, and a token&apos;s own trading fees can fund a
              Bag automatically.
            </p>
            <div className="mt-4 flex items-center gap-2 text-[10px] uppercase tracking-wider text-[#bdfe00]/70">
              <span className="h-1.5 w-1.5 rounded-full bg-[#bdfe00] pulse-dot" />
              MAINNET · SOLANA
            </div>

            {/* One social link, because one account is the truth. A row of four marks would
                be three dead tiles and a promise this product does not keep. */}
            <a
              href={SITE_X_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-white/70 transition-colors hover:border-[#bdfe00]/40 hover:text-[#bdfe00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bdfe00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0d08]"
            >
              <XMark className="size-3.5" />
              Follow on X
            </a>
          </div>

          {/* Link columns. Each group is its own labelled `nav`, so a screen reader announces
              "Product navigation" rather than four unlabelled lists. */}
          {COLUMNS.map((col) => {
            const headingId = `footer-${col.title.toLowerCase()}`;
            return (
              <nav key={col.title} aria-labelledby={headingId}>
                <h4
                  id={headingId}
                  className="text-[10px] font-bold uppercase tracking-widest text-white/40"
                >
                  {col.title}
                </h4>
                <ul className="mt-3 space-y-2">
                  {col.links.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        className="rounded text-xs text-white/75 transition-colors hover:text-[#bdfe00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bdfe00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0d08]"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            );
          })}
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-6 text-[10px] uppercase tracking-wider text-white/40 sm:flex-row sm:items-center">
          {/* Computed rather than typed: a hard-coded year is the one thing on a site that is
              guaranteed to go stale. */}
          <span>© {new Date().getFullYear()} BAGWORK · ALL RIGHTS RESERVED</span>
          <span>BUILT ON SOLANA · POWERED BY $BAG</span>
        </div>
      </div>

      {/*
       * The brand stamp.
       *
       * One decorative word, sized in `vw` so it keeps its proportion on every screen, and clipped
       * by its own wrapper — which is the last child of the footer, so the cut lands exactly on the
       * footer's bottom edge and only the top of the letters shows.
       *
       * `0.55em` of the line box is the visible band. The line box is the font size (`leading-none`),
       * and the glyphs occupy roughly 0.7em of it, so about half of each letter is above the cut —
       * which is the whole effect. It is `aria-hidden` and not a heading: it is a texture, not
       * something to announce or to add to the document outline.
       *
       * At 17vw the word is ~71% of the viewport wide at any size, so it can never cause a
       * horizontal scrollbar; the `clamp` caps it at 15rem on large desktops.
       */}
      <div
        aria-hidden="true"
        className="pointer-events-none relative mt-8 h-[0.55em] select-none overflow-hidden text-[clamp(2.5rem,17vw,15rem)] leading-none"
      >
        <span className="block text-center font-bold leading-none tracking-[-0.03em] text-white opacity-50">
          BAGWORK
        </span>
      </div>
    </footer>
  );
}
