"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthButton } from "@/components/auth/auth-button";
import { BrandLogo } from "./brand-logo";

/**
 * The header nav.
 *
 * Six entries — three sections on `/` and three routes — plus two actions. Every label points at the
 * thing it names.
 *
 * `EXPLORE` is the console's browse route, not the homepage section. `/dashboard` is where a bag can
 * actually be searched, filtered and claimed, and the `#live` block below the hero is a capped
 * preview of that same list — so pointing the nav item at the preview pointed it at the smaller of
 * the two. It used to open the marketing leaderboard while its href went somewhere else, which is
 * exactly the kind of leftover that makes a page feel assembled rather than built.
 *
 * Section ids: `#how` (the creator's four steps), `#why` (why Bagwork), `#fee-redirect` (the fee
 * loop). Explore, Docs, Dashboard and Token Analytics are real routes.
 *
 * Every section href is written the way a link has to be written to work from *any* page: `/#how`,
 * not `#how`. A bare hash only means "the section on the page I am already on", so from `/docs`
 * every one of these nav items was a button that did nothing — see `followNav`.
 */
const NAV = [
  { label: "EXPLORE", href: "/dashboard" },
  { label: "HOW IT WORKS", href: "/#how" },
  { label: "WHY BAGWORK", href: "/#why" },
  { label: "FEE REDIRECT", href: "/#fee-redirect" },
  /* The token page is reachable from the site as well as from the console sidebar. */
  { label: "TOKEN ANALYTICS", href: "/dashboard/token" },
  { label: "DOCS", href: "/docs" },
] as const;

/**
 * The section id an href points at — but only when that section is on the page already showing.
 *
 * `/#how` while on `/` gives `"how"`; the same href anywhere else gives `null`, which means "let
 * the browser navigate to it". Returns `null` for route links too.
 */
function sectionOnThisPage(href: string): string | null {
  const match = /^\/#(.+)$/.exec(href);
  if (!match) return null;
  return window.location.pathname === "/" ? match[1] : null;
}

/**
 * Follows a nav entry.
 *
 * These are real anchors with real hrefs, so the default behaviour is correct everywhere: from
 * `/docs`, `/#how` navigates home and lands on the section, and every item can be middle-clicked,
 * opened in a new tab, copied and crawled.
 *
 * The one case that needs handling is the section that is *already* on this page. There the href
 * would reload the homepage to reach a section that is already on screen, so the click is taken
 * over and scrolled smoothly instead — and `replaceState` keeps the address bar honest afterwards,
 * so the link is still shareable once it has been followed.
 *
 * This is the bug that made the header look dead on Docs: the previous version unconditionally ran
 * `document.querySelector("#how")`, which is `null` on any route that is not the homepage. No
 * error, no navigation — just a button that did nothing.
 */
function followNav(event: React.MouseEvent<HTMLAnchorElement>, href: string, close?: () => void) {
  close?.();

  // Everything that is not a plain left click belongs to the browser: new tab, new window, save.
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const section = sectionOnThisPage(href);
  if (!section) return;

  const target = document.getElementById(section);
  // No such section here — fall through to the normal navigation rather than swallowing the click.
  if (!target) return;

  event.preventDefault();
  target.scrollIntoView({ behavior: "smooth" });
  window.history.replaceState(null, "", `#${section}`);
}

export function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b transition-colors duration-300",
        scrolled
          ? "border-white/10 bg-[#0b0a07]/90 backdrop-blur-xl"
          : "border-transparent bg-transparent"
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo — a square mark plus the flickering wordmark, linked home. */}
        <BrandLogo />

        {/* Desktop nav, at `xl` and up.
            The breakpoint is unchanged, and it is worth keeping the reason it was raised on the
            record: the wordmark used to reserve the width of "MAKING BAGWORKING GREAT AGAIN"
            (29ch), and at 1024px that, plus these six labels, the two actions and the logo, came
            to ~18px more than the row holds — the labels wrapped onto two lines and the nav ended
            up flush against the slogan. The wordmark is a fixed "bagwork" now, so the row would
            very likely fit at `lg` again; that is a layout change nobody asked for, so it waits.
            Below `xl` the menu button below holds every item, exactly as it does on a phone. */}
        <nav className="hidden items-center gap-4 xl:flex xl:gap-6">
          {NAV.map((item) => {
            /* A route entry that matches this path gets `aria-current` — which is what marks "DOCS"
               as the page you are on while you are reading the docs. */
            const current = pathname === item.href;
            return (
              <a
                key={item.label}
                href={item.href}
                onClick={(event) => followNav(event, item.href)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "rounded text-[11px] font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bdfe00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0a07]",
                  current ? "text-[#bdfe00]" : "text-white/75 hover:text-[#bdfe00]",
                )}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Actions. Same breakpoint as the nav — a header showing the menu button must not also be
            showing half of the desktop actions. */}
        <div className="hidden items-center gap-2 xl:flex">
          {/* A real link to the console route, painted with the shared ghost surface. */}
          <a
            href="/dashboard"
            className="btn-3d btn-surface-ghost inline-flex h-8 items-center justify-center rounded-xl px-3 text-[11px] font-bold uppercase tracking-wider"
          >
            <span className="relative z-10">DASHBOARD</span>
          </a>
          {/* Real Privy session — replaces the previous in-memory mock wallet. */}
          <AuthButton />
        </div>

        {/* Mobile toggle — carries the nav below `xl`. */}
        <button
          className="xl:hidden text-white"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="xl:hidden overflow-hidden border-t border-white/10 bg-[#0b0a07]"
          >
            <div className="flex flex-col gap-1 p-4">
              {NAV.map((item) => {
                const current = pathname === item.href;
                return (
                  <a
                    key={item.label}
                    href={item.href}
                    onClick={(event) => followNav(event, item.href, () => setOpen(false))}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "rounded-lg px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider",
                      current
                        ? "bg-[#bdfe00]/10 text-[#bdfe00]"
                        : "text-white/85 hover:bg-[#bdfe00]/10 hover:text-[#bdfe00]",
                    )}
                  >
                    {item.label}
                  </a>
                );
              })}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <a
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className="btn-3d btn-surface-outline inline-flex h-8 items-center justify-center rounded-xl px-3 text-[11px] font-bold uppercase tracking-wider"
                >
                  <span className="relative z-10">DASHBOARD</span>
                </a>
                <div onClickCapture={() => setOpen(false)}>
                  <AuthButton size="sm" />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
