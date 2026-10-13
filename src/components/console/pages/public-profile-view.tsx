"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, Coins, Hammer, Pencil, Star, TrendingUp, UserX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BagworkerTag,
  LevelProgress,
  ProfileAvatar,
  formatPoints,
} from "@/components/console/identity";
import { RankBadgeRail } from "@/components/console/rank-badges";
import { EmptyState, ErrorState, MetricCard, PageHeader, SectionCard } from "@/components/console/ui";
import { dateMedium, usd } from "@/lib/console/format";
import { usePublicProfile, type PublicProfileError } from "@/lib/profile/hooks";
import { levelFromPoints } from "@/lib/profile/points";

/**
 * Another Bagworker's public profile.
 *
 * Public means identity and reputation: who they are, how far along they are, and what that has
 * added up to. It deliberately does not mean their work. There is no submissions list, no bag
 * opt-in, no campaign detail and no review history here — not hidden with CSS, simply absent from
 * the payload the page reads, so there is nothing to leak by accident.
 *
 * Read-only by construction: the only interactive things are the way back to the leaderboard and,
 * when you are looking at yourself, a link to the real editable profile. That page has the controls;
 * this one never renders one.
 *
 * The calendar is the same widget the profile header uses, and the totals beside it come from the
 * same counting function, so the two cannot disagree.
 */

/** The calendar keys its cells to the browser's timezone, so it is mounted, never server-rendered. */
const ProfileActivity = dynamic(
  () => import("@/components/console/profile-activity").then((m) => m.ProfileActivity),
  { ssr: false },
);

export function PublicProfileView({ handle }: { handle: string }) {
  const { data, isPending, isError, error, refetch } = usePublicProfile(handle);

  if (isPending) return <ProfileSkeleton />;

  if (isError) {
    // "No such Bagworker" is a different answer from "the request failed", and a 404 must not offer
    // a retry button that would 404 again.
    const notFound = (error as PublicProfileError | null)?.notFound === true;

    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        {notFound ? (
          <EmptyState
            icon={UserX}
            title={`No Bagworker named “${handle}”`}
            description="That handle or Bagworker number does not match anyone here. They may have changed their handle since the link was shared."
            action={
              <Button asChild size="sm">
                <Link href="/dashboard/leaderboard">Back to the leaderboard</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState
            title="We couldn't load this profile"
            description="The profile request failed. Try again — if it keeps failing, the server log will say why."
            onRetry={() => void refetch()}
          />
        )}
      </div>
    );
  }

  const profile = data.profile;
  const name =
    profile.displayName?.trim() || (profile.handle ? `@${profile.handle}` : "Bagworker");
  /** Level is a pure function of points, exactly as it is on the owner's own profile. */
  const progress = levelFromPoints(profile.points);
  const me = data.isYou;

  return (
    <>
      <PageHeader
        eyebrow={me ? "Your public profile" : "Bagworker"}
        title={name}
        description={
          me
            ? "This is how other Bagworkers see you. Your own profile — with everything editable — is one click away."
            : "Identity and reputation only. This Bagworker's posts, campaign work and review history are private."
        }
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/leaderboard">
                <ArrowLeft aria-hidden="true" className="size-3.5" />
                Leaderboard
              </Link>
            </Button>
            {me ? (
              <Button asChild size="sm">
                <Link href="/dashboard/profile">
                  <Pencil aria-hidden="true" className="size-3.5" />
                  Edit profile
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <SectionCard contentClassName="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
            <ProfileAvatar
              character={profile.character}
              avatarId={profile.avatarId}
              profileNumber={profile.profileNumber}
              className="size-24 shrink-0 rounded-2xl"
            />

            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="title-display truncate text-xl text-foreground">{name}</h2>
                <BagworkerTag number={profile.profileNumber} />
              </div>

              {profile.handle ? (
                <p className="text-sm text-muted-foreground">@{profile.handle}</p>
              ) : null}

              {profile.bio ? (
                <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                  {profile.bio}
                </p>
              ) : null}

              <p className="text-xs text-muted-foreground">
                Joined {dateMedium(profile.joinedAt)}
                <span aria-hidden="true"> · </span>
                {profile.submissions} {profile.submissions === 1 ? "link" : "links"} submitted
                <span aria-hidden="true"> · </span>
                {profile.approvals} approved
              </p>
            </div>
          </SectionCard>

          <SectionCard
            title="Level progress"
            description="Points to the next level"
            contentClassName="flex justify-center px-5 py-5"
          >
            <LevelProgress progress={progress} ringSize={112} />
          </SectionCard>
        </div>

        {/* Directly under the identity panel, above the stats and the badge rack. It used to sit
            last on the page, under the badges, which buried the one part of a public profile that
            actually changes from week to week. */}
        <SectionCard
          title="Contribution activity"
          description="Opting into a bag, delivering a post link and being approved — counted per day, never per campaign."
        >
          <ProfileActivity
            identifier={profile.profileNumber ?? profile.handle}
            className="px-5 pb-5"
          />
        </SectionCard>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Total points"
            value={formatPoints(profile.points)}
            icon={Star}
            hint="33 points per $1 earned"
          />
          <MetricCard
            label="Level"
            value={String(profile.level)}
            icon={TrendingUp}
            hint="Status only — nothing is gated by it"
          />
          <MetricCard
            label="Contributions"
            value={String(profile.contributions)}
            icon={Hammer}
            hint={`${profile.activeDays} active ${profile.activeDays === 1 ? "day" : "days"}`}
          />
          <MetricCard
            label="Paid out"
            value={usd(profile.paidUsdc, { cents: true })}
            icon={Coins}
            hint={
              profile.payoutCount > 0
                ? `${profile.payoutCount} ${profile.payoutCount === 1 ? "payout" : "payouts"} · ${usd(profile.earned, { cents: true })} earned`
                : `${usd(profile.earned, { cents: true })} earned · nothing paid out yet`
            }
          />
        </div>

        {/* The same rack the owner sees. Read-only here, and read-only everywhere: a badge is
            never a thing you select, only the level your points have already reached. */}
        <RankBadgeRail level={profile.level} points={profile.points} />

        <p className="text-xs leading-relaxed text-muted-foreground">
          Public profile — identity and reputation only. Submissions, campaign work, review history
          and wallets are never shown on anyone else&apos;s profile.
        </p>
      </div>
    </>
  );
}

/**
 * Shaped like the real page — identity panel, calendar, stats row — so nothing shifts when it
 * lands. The order matters as much as the shapes: the calendar is the second block now.
 */
function ProfileSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading this profile"
      className="space-y-6 px-4 py-6 sm:px-6 lg:px-8"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <Skeleton className="h-[172px] rounded-2xl" />
        <Skeleton className="h-[172px] rounded-2xl lg:w-[236px]" />
      </div>
      <Skeleton className="h-[240px] rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[108px] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
