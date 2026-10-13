"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { tipsForPath } from "@/lib/console/suggestions";
import { NotificationMenu } from "./notification-menu";
import { ReportBugButton } from "./report-bug";
import { SearchCommand } from "./search-command";
import { UserMenu } from "./user-menu";

/**
 * The rotating suggestion line.
 *
 * Split into its own component so the top bar can remount it with `key={pathname}`: that
 * resets the rotation on navigation without an effect writing state back on every render,
 * which is both cheaper and what the compiler lint expects.
 */
function TipLine({ tips }: { tips: string[] }) {
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reducedMotion || tips.length < 2) return;
    const timer = window.setInterval(
      () => setIndex((value) => (value + 1) % tips.length),
      7000,
    );
    return () => window.clearInterval(timer);
  }, [tips.length, reducedMotion]);

  return (
    // Not a live region on purpose: this rotates every 7s and announcing it would interrupt
    // whatever the user is reading.
    <p className="truncate text-xs text-muted-foreground">
      {tips[index % tips.length]}
    </p>
  );
}

/**
 * Thin persistent top bar.
 *
 * The line next to the pulse dot is a *suggestion*, not a metric. It used to cycle live
 * figures ("$9,100 still up for grabs", "3 settled so far"), which read as a status
 * readout, competed with the page's own numbers, and went stale between polls. What sits
 * here now is a rotating tip for the page you are on.
 */
export function ConsoleTopbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4">
      {/*
       * The trigger is only the way in when the sidebar is a sheet (`md` and below). At `md` and up
       * the rail is visible and carries its own collapse control in its header, so a second button
       * here would be two controls for one job — and the one in the top bar is the further of the
       * two from the panel it moves.
       */}
      <SidebarTrigger className="-ml-1 md:hidden" aria-label="Toggle navigation" />
      <Separator orientation="vertical" className="mr-1 hidden h-5 sm:block" />

      <div className="flex min-w-0 items-center gap-2">
        <span className="relative flex size-2 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex size-full rounded-full bg-brand/70 motion-safe:animate-ping" />
          <span className="relative inline-flex size-2 rounded-full bg-brand" />
        </span>
        <TipLine key={pathname} tips={tipsForPath(pathname)} />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <SearchCommand />
        <NotificationMenu />
        {/* Sits beside the bell: a small, always-present way to say "this is broken". */}
        <ReportBugButton />
        {/* One account control: profile, payout wallet, settings and sign-out. */}
        <UserMenu />
      </div>
    </header>
  );
}
