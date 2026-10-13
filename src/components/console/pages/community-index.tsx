"use client";

import Link from "next/link";
import { ArrowRight, Compass, Lock, Megaphone, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/auth/auth-provider";
import { useCommunityIndex } from "@/lib/community/hooks";
import type { CommunityListItem } from "@/lib/community/mappers";
import { cn } from "@/lib/utils";

import { EmptyState, ErrorState, PageHeader, SignInRequired } from "../ui";

/**
 * The Community header's artwork, from `public/`.
 *
 * Same treatment as the Explore header's banner, and deliberately the same mechanism rather than a
 * second one: a public path instead of an import (this is a CSS background, so nothing bundles it,
 * the browser fetches it once and caches it with the rest of the static assets, and the file is a
 * 2 MB SVG whose art is embedded raster — the one thing a build step could not have made smaller).
 *
 * `PageHeader` owns the whole stack — the crop, the left scrim, the bottom fade and the order the
 * artwork sits in — so this page contributes nothing but the URL. The banner therefore lands *under*
 * the dot grid and the colour wash, under the text, and dissolves into the panel below exactly as the
 * Explore header does, because it is the same code path.
 */
const COMMUNITY_BANNER = "/communitypagebanner.svg";

/**
 * Where that artwork sits vertically in the header, as a `background-position` percentage.
 *
 * Explore keeps `PageHeader`'s `88%`, which is right for its 4:1 artwork. This one is 5.9:1, so it
 * overflows the header by only ~44px and `88%` spent nearly all of that pushing the cast up against
 * the top edge. `50%` centres the crop instead, which sits the characters lower in the strip — the
 * same treatment, the same fade, just the crop this illustration wants.
 */
const COMMUNITY_BANNER_POSITION_Y = 50;

/**
 * The community index.
 *
 * Shows every bag's community, not only the ones that are open. "There is a board on a bag you
 * have not joined" is the answer that tells someone what to do next, so hiding those rows would
 * hide the instruction. Locked rows explain themselves and link to the bag that unlocks them.
 */
export function CommunityIndex() {
  const { ready, authenticated, login } = useAuth();
  const { data, isLoading, isError, refetch } = useCommunityIndex();

  if (ready && !authenticated) {
    return (
      <SignInRequired
        title="Sign in to see communities"
        description="Communities are announcement boards attached to bags. Access follows the campaigns you have joined, so we need to know who you are."
        onConnect={login}
      />
    );
  }

  const communities = data?.communities ?? [];
  const open = communities.filter((entry) => entry.canOpen);
  const locked = communities.filter((entry) => !entry.canOpen);

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Community"
        title="Communities"
        description="Every bag can have one announcement board. The publisher who funded the bag posts; the Bagworkers who joined it read."
        bannerSrc={COMMUNITY_BANNER}
        bannerPositionY={COMMUNITY_BANNER_POSITION_Y}
        actions={
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/dashboard">
              <Compass aria-hidden="true" className="size-3.5" />
              Explore bags
            </Link>
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-[1100px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <HowAccessWorks joinedBags={data?.joinedBags ?? 0} />

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : communities.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No communities yet"
            description="A community opens when a publisher creates one for their bag. Join a live bag in the meantime — when its community appears, you are already in."
            action={
              <Button asChild>
                <Link href="/dashboard">Explore live bags</Link>
              </Button>
            }
          />
        ) : (
          <>
            {open.length > 0 ? (
              <section className="space-y-3" aria-label="Communities you can open">
                <h2 className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                  Yours
                </h2>
                <ul className="list-none space-y-3 p-0">
                  {open.map((entry) => (
                    <li key={entry.id}>
                      <CommunityRow entry={entry} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {locked.length > 0 ? (
              <section className="space-y-3" aria-label="Communities you cannot open yet">
                <h2 className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                  Locked — join the bag first
                </h2>
                <ul className="list-none space-y-3 p-0">
                  {locked.map((entry) => (
                    <li key={entry.id}>
                      <CommunityRow entry={entry} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * What a community is and how to get into one.
 *
 * The rules stated up front: a locked board with no explanation is indistinguishable from a broken
 * one, and "Join a Bag campaign first" is the actual instruction.
 */
function HowAccessWorks({ joinedBags }: { joinedBags: number }) {
  const steps = [
    {
      title: "Join a bag",
      body: "Opt into a live campaign from Explore Bags. Claiming a slot is what makes you a member — there is nothing else to apply for.",
    },
    {
      title: "Get access",
      body: "The moment you join, that bag's community unlocks for you. The publisher who funded the bag is its admin.",
    },
    {
      title: "Read the board",
      body: "The admin posts briefs, rules and updates. Members read them, with pinned announcements kept at the top.",
    },
  ];

  return (
    <Card className="gap-0 py-0">
      <CardContent className="grid gap-4 p-5 sm:grid-cols-3">
        {steps.map((step, index) => (
          <div key={step.title} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="flex size-5 shrink-0 items-center justify-center rounded-full border border-brand/40 bg-brand/10 text-[10px] font-bold tabular-nums text-brand"
              >
                {index + 1}
              </span>
              <h2 className="text-sm font-semibold text-foreground">{step.title}</h2>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{step.body}</p>
          </div>
        ))}

        {joinedBags === 0 ? (
          <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-3">
            You have not joined a bag yet. Join a Bag campaign first — a community only becomes
            visible to the Bagworkers who are in the campaign, and there is no separate request to
            make.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** One row: the bag, its board, and whether you can walk in. */
function CommunityRow({ entry }: { entry: CommunityListItem }) {
  return (
    <Card className="gap-0 py-0 transition-colors duration-200 hover:border-foreground/20">
      <CardContent className="flex flex-wrap items-center gap-3 p-4">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40",
            !entry.canOpen && "text-muted-foreground",
          )}
          // The token's own colour, the same wash the bag cards use, so a row is recognisable
          // next to the bag it belongs to.
          style={
            entry.canOpen
              ? {
                  borderColor: `${entry.tokenColor}40`,
                  backgroundColor: `${entry.tokenColor}14`,
                  color: entry.tokenColor,
                }
              : undefined
          }
        >
          {entry.canOpen ? <Megaphone className="size-4" /> : <Lock className="size-4" />}
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{entry.title}</h3>
            {entry.role === "ADMIN" ? (
              <Badge
                variant="outline"
                className="border-brand/40 bg-brand/10 px-1.5 py-0 text-[10px] font-medium text-brand"
              >
                Admin
              </Badge>
            ) : entry.role === "MEMBER" ? (
              <Badge
                variant="outline"
                className="border-border bg-muted/40 px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
              >
                Member
              </Badge>
            ) : null}
          </div>

          <p className="truncate text-xs text-muted-foreground">
            {entry.campaignTitle}
            <span aria-hidden="true"> · </span>
            <span className="font-medium tracking-wide">{entry.tokenSymbol}</span>
          </p>

          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users aria-hidden="true" className="size-3" />
              <span className="tabular-nums">{entry.memberCount}</span>
              {entry.memberCount === 1 ? "member" : "members"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Megaphone aria-hidden="true" className="size-3" />
              <span className="tabular-nums">{entry.messageCount}</span>
              {entry.messageCount === 1 ? "post" : "posts"}
            </span>
          </p>
        </div>

        {/* A locked row still needs somewhere to go — to the bag that unlocks it. */}
        <Button
          asChild
          size="sm"
          variant={entry.canOpen ? "default" : "outline"}
          className="shrink-0 gap-1.5"
        >
          <Link href={entry.canOpen ? `/dashboard/community/${entry.id}` : `/dashboard/bags/${entry.campaignId}`}>
            {entry.canOpen ? "Open" : "View bag"}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
