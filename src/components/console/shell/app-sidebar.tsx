"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/components/auth/auth-provider";
import { usd } from "@/lib/console/format";
import { useConsoleProfile } from "@/lib/console/hooks";
import {
  CONSOLE_DOCS_LINK,
  CONSOLE_NAV_FOOTER,
  CONSOLE_SITE_LINK,
  CONSOLE_SOCIAL_LINK,
  consoleNavFor,
  isNavItemActive,
} from "../nav";
import { PlatformIcon } from "../platform-icons";
import { BagworkerTag, ProfileAvatar, formatPoints } from "../identity";

export function AppSidebar() {
  const pathname = usePathname();
  const { configured, ready, authenticated, login, walletAddress } = useAuth();
  const { data, isLoading } = useConsoleProfile();
  const profile = data?.user;

  // One nav for everyone: there is no role to read, and no account can be in a state where
  // part of the product is unreachable.
  const navGroups = consoleNavFor();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {/*
         * One control strip: the mark on the left, the collapse control on its right.
         *
         * Both live in a single `h-12` row — exactly the height of the `size="lg"` nav button this
         * header used to hold — so the header and the list below keep one rhythm and the panel's
         * height does not change when it folds.
         *
         * Collapsed, the mark is removed rather than shrunk, and the strip centres the control in
         * the icon rail's 3rem. That is the whole trick to "no awkward gap": there is never an
         * empty logo slot, because the only child left is the button, centred in the same box.
         */}
        <div className="flex h-12 items-center gap-1 group-data-[collapsible=icon]:justify-center">
          <Link
            href="/"
            aria-label="Bagwork — back to the site"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 outline-hidden transition-colors hover:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:hidden"
          >
            <Image
              src="/bagwork-logo.png"
              alt=""
              width={191}
              height={256}
              priority
              className="h-6 w-auto shrink-0"
            />
            <span className="grid min-w-0 text-left leading-tight">
              <span className="title-display truncate text-sm font-bold text-sidebar-foreground">
                bagwork
              </span>
              <span className="truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                creator console
              </span>
            </span>
          </Link>

          <SidebarCollapse />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isNavItemActive(pathname, item);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        {/*
                         * `prefetch={false}` on purpose. Every sidebar link was prefetching its
                         * RSC payload on viewport, and the sidebar renders twice (desktop rail +
                         * mobile sheet), so a single console page fired ~44 background
                         * `_rsc` requests — all of them competing with the page's own data for
                         * the same connection pool. The payloads are 5–11ms warm, so clicking
                         * still lands instantly; the difference is that nothing is fetched until
                         * it is actually wanted.
                         */}
                        <Link
                          href={item.href}
                          prefetch={false}
                          aria-current={active ? "page" : undefined}
                        >
                          <item.icon aria-hidden="true" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {/*
         * A "Coming soon" group lived here — API and Launchpad, rendered as disabled buttons with a
         * "Soon" badge. Nothing was ever behind them and no route existed, so the only thing they
         * achieved was two permanently greyed-out rows in the primary nav teaching people to ignore
         * that part of the sidebar. The roadmap has a real home now: Feature Requests, where an idea
         * can be read and voted on rather than merely promised.
         */}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {CONSOLE_NAV_FOOTER.map((item) => {
            const active = isNavItemActive(pathname, item);
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    aria-current={active ? "page" : undefined}
                  >
                    <item.icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
                {/* Our X account sits side by side with Docs. */}
                {item.href === CONSOLE_DOCS_LINK.href ? (
                  <SidebarMenuAction asChild>
                    <a
                      href={CONSOLE_SOCIAL_LINK.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={CONSOLE_SOCIAL_LINK.label}
                      title={CONSOLE_SOCIAL_LINK.label}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <PlatformIcon platform="x" className="size-3.5" />
                    </a>
                  </SidebarMenuAction>
                ) : null}
              </SidebarMenuItem>
            );
          })}

          <SidebarMenuItem>
            {/* Leaving the console pulls the whole marketing page's RSC payload, so it is not
                prefetched either. */}
            <SidebarMenuButton asChild tooltip="Back to the bagwork site">
              <Link href={CONSOLE_SITE_LINK.href} prefetch={false}>
                <CONSOLE_SITE_LINK.icon aria-hidden="true" />
                <span>{CONSOLE_SITE_LINK.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/30 p-2.5 group-data-[collapsible=icon]:hidden">
          {!configured ? null : !ready ? (
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-1.5 w-full" />
            </div>
          ) : !authenticated ? (
            // Anonymous visitors can browse bags, so the footer offers the one action
            // that unlocks everything else instead of showing invented progress.
            <>
              <p className="text-xs font-medium text-sidebar-foreground">
                Not signed in
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                Sign in to submit content and earn USDC.
              </p>
              <Button
                size="sm"
                className="mt-2 h-7 w-full text-xs"
                onClick={login}
              >
                <Wallet aria-hidden="true" className="size-3" />
                Sign in
              </Button>
            </>
          ) : isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-1.5 w-full" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <ProfileAvatar
                  character={profile?.character}
                  avatarId={profile?.avatarId}
                  profileNumber={profile?.profileNumber}
                  className="size-7 shrink-0 rounded-md"
                />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-sidebar-foreground">
                  @{profile?.handle ?? walletAddress ?? "bagworker"}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  Lv {profile?.level ?? 1}
                </span>
              </div>

              {/* The permanent identity, right beside the level it belongs to. */}
              <BagworkerTag
                number={profile?.profileNumber}
                className="border-sidebar-border bg-transparent px-1.5 py-px text-[10px]"
              />

              <Progress
                value={profile?.levelProgress ?? 0}
                aria-label={`Level ${profile?.level ?? 1} progress: ${
                  profile?.levelProgress ?? 0
                }% of the way to the next level`}
                className="!mt-2 h-1 bg-sidebar-accent [&>div]:bg-brand"
              />
              <p className="!mt-1.5 text-[10px] tabular-nums text-muted-foreground">
                {formatPoints(profile?.points ?? 0)} points ·{" "}
                {usd(profile?.totalEarned ?? 0, { compact: true })} earned
              </p>
            </>
          )}
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

/* ------------------------------------------------------------- the collapse control */

/**
 * The collapse control, living inside the sidebar's own header.
 *
 * It sits in the strip above rather than in the top bar because the button that changes a panel's
 * width belongs on that panel's own corner — it is where the pointer already is when you are
 * reading the nav, and it cannot overlap a nav row or be pushed off-screen by a long page title.
 * The top bar keeps a trigger only below `md`, where the sidebar is a sheet and there is no rail to
 * put a control on.
 *
 * The icon and the accessible name both describe what pressing it *does*, not the state it is in:
 * a panel that is folded shows "Expand navigation" beside an opening arrow. `aria-expanded` keeps
 * the state itself available to assistive tech, so the two read as a pair rather than as a puzzle.
 */
function SidebarCollapse() {
  const { state, toggleSidebar, isMobile } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          className="size-8 shrink-0 rounded-md text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden="true" className="size-4" />
          ) : (
            <PanelLeftClose aria-hidden="true" className="size-4" />
          )}
        </Button>
      </TooltipTrigger>
      {/* Only useful when the panel is folded and the label is out of sight. */}
      <TooltipContent side="right" hidden={!collapsed || isMobile}>
        Expand navigation
      </TooltipContent>
    </Tooltip>
  );
}
