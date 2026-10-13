"use client";

import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useProfile } from "@/lib/profile/hooks";
import { AppSidebar } from "./app-sidebar";
import { ConsoleTopbar } from "./topbar";

/**
 * Console chrome: collapsible sidebar (a sheet on mobile — the shadcn Sidebar
 * handles that), thin persistent top bar, scrollable content.
 *
 * The `.console` class swaps in the clean shadcn dark token set (see
 * globals.css) for this subtree *and* for Radix portals via :root:has().
 *
 * There is deliberately no onboarding gate any more.
 *
 * The shell used to hold a signed-in user on a first-run setup flow — name, character, platforms,
 * payout wallet, then a reveal — before any console page would render. That is a strange thing to
 * demand from someone who clicked a wallet to launch a coin: it put a form in front of the product,
 * and the four answers it collected are all things the product can decide for itself or ask for
 * later. A new account is now created complete, and lands in the console able to act.
 *
 * Editing still exists — it is on the profile page, opened deliberately rather than imposed.
 *
 * Anonymous visitors are unaffected either way, so browsing campaigns still works signed out.
 *
 * The sidebar and top bar are not part of that gate — they render immediately, and while the
 * profile is in flight the content area shows a page-shaped skeleton rather than a single
 * centred spinner. The profile read is one database round-trip (~0.9s against the remote
 * pooler), so this is the difference between "the console is broken" and "the page is loading".
 */
function ContentSkeleton() {
  return (
    <div className="space-y-6 p-4 sm:p-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

export function ConsoleShell({ children }: { children: ReactNode }) {
  const { isLoading } = useProfile();

  /*
   * `children` is mounted immediately and merely hidden while the shell decides.
   *
   * This used to be `{isLoading ? skeleton : children}`, which serialised every console page
   * behind the session read: the page component did not exist, so its own queries could not
   * start until `/api/profile` had returned — one database round-trip (~0.9s against the remote
   * pooler) followed by the page's own — for a total that matched the 2–3s people were seeing.
   *
   * Mounting it up front means the session read and the page's data load *in parallel*: by the
   * time the skeleton is replaced, the page's queries are usually already resolved. The skeleton
   * is unchanged, so nothing appears early; the only cost is that a page's queries fire for an
   * account that turns out to need onboarding, which is one wasted request on a rare path.
   *
   * Hidden with `invisible` (visibility, not `display: none`) on purpose: a page that is hidden by
   * display is still mounted, but anything that measures its own layout on mount would measure
   * zero and render wrong once it appears. `visibility: hidden` keeps the box measurable, paints
   * nothing, and takes the subtree out of the tab order.
   */
  const hideChildren = isLoading;

  return (
    <div className="console min-h-svh bg-background text-foreground">
      <a
        href="#console-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-popover focus:px-3 focus:py-2 focus:text-sm focus:text-popover-foreground"
      >
        Skip to content
      </a>

      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <ConsoleTopbar />
          {/*
           * A `div`, not a `main`: `SidebarInset` already renders the page's `<main>` landmark, so
           * a second one nested inside it gave assistive tech two "main" regions on every console
           * page. `tabIndex={-1}` is what makes the skip link above land focus here reliably.
           */}
          <div id="console-content" tabIndex={-1} className="flex-1 outline-none">
            {isLoading ? (
              <div role="status" aria-label="Loading your account">
                <ContentSkeleton />
              </div>
            ) : null}
            <div className={hideChildren ? "invisible" : undefined} aria-hidden={hideChildren}>
              {children}
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
