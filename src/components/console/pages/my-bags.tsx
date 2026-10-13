"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Banknote, Coins, Loader2, Package, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/auth/auth-provider";
import { usd } from "@/lib/console/format";
import { useCloseBag, useMyBags, type MyBagRow } from "@/lib/console/hooks";
import {
  EmptyState,
  ErrorState,
  MetricCard,
  PageHeader,
  SignInRequired,
} from "../ui";
import { PublisherBagRow } from "./my-bags-row";

/**
 * The publisher's own bags.
 *
 * Publisher-side counterpart to Explore Bags, and the reason `Campaign.createdBy` exists:
 * before ownership, a publisher had no way to find, track or close the campaigns they had
 * funded. Everything here is scoped to the signed-in user server-side.
 */
export function MyBags() {
  const { ready, authenticated, login } = useAuth();
  const { data, isLoading, isError, refetch } = useMyBags();
  const closeBag = useCloseBag();
  const [closingBag, setClosingBag] = useState<MyBagRow | null>(null);

  if (ready && !authenticated) {
    return (
      <SignInRequired
        title="Sign in to see your bags"
        description="A bag belongs to the wallet that funded it, so the same wallet always brings back the campaigns you are running."
        onConnect={login}
      />
    );
  }

  if (isError && !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="pb-16">
        <PageHeader eyebrow="Publisher" title="My Bags" />
        <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="gap-0 py-0">
                <CardContent className="space-y-3 p-4">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-7 w-28" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const { bags, summary } = data;

  function confirmClose() {
    if (!closingBag) return;
    closeBag.mutate(
      { id: closingBag.campaign.id },
      {
        onSuccess: () => {
          toast.success("Bag closed", {
            description: `"${closingBag.campaign.title}" no longer accepts submissions. Approved payouts can still be settled.`,
          });
          setClosingBag(null);
        },
        onError: (error: Error) => toast.error(error.message),
      },
    );
  }

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Publisher"
        title="My Bags"
        description="The campaigns your treasury funded. Track spend, watch incoming submissions and close a bag when it has served its purpose."
        actions={
          <Button asChild className="gap-1.5">
            <Link href="/dashboard/create">
              <Plus aria-hidden="true" className="size-4" />
              Create a bag
            </Link>
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section
          aria-label="Publisher metrics"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <MetricCard
            label="Bags funded"
            value={String(summary.bags)}
            hint={`${summary.live} live · ${summary.ended} closed`}
            icon={Package}
          />
          <MetricCard
            label="Budget committed"
            value={usd(summary.budgetCommitted, { compact: true })}
            hint={`${usd(summary.remaining, { compact: true })} still available`}
            icon={Coins}
          />
          <MetricCard
            label="Paid to creators"
            value={usd(summary.paidOut, { compact: true })}
            hint={`${summary.submissions} submissions received`}
            icon={Banknote}
          />
          <MetricCard
            label="In the pipeline"
            value={String(summary.awaitingReview + summary.awaitingPayout)}
            hint={`${summary.awaitingReview} in review · ${summary.awaitingPayout} awaiting payout`}
            icon={Loader2}
          />
        </section>

        {/*
          The payout queue used to sit here.

          It listed every approved-but-unpaid submission across the publisher's bags under a "Payout
          queue" heading, and a publisher reading that can only conclude they are expected to do
          something about it — pay, approve, or sign. They are not, and they never were: review runs
          on its own and the payout is sent by the server from the bag's own treasury. A window onto
          a process you do not control is not a feature; it reads as a to-do list that never empties.

          The pipeline count above still tells a publisher what is moving, and My Bags still shows
          what has been paid per bag. What is gone is the framing that any of it is their action.
        */}

        {bags.length === 0 ? (
          <EmptyState
            icon={Package}
            title="You have not funded a bag yet"
            description="A bag is a funded budget creators post into. Set a rate, cap a max payout, and creators compete for the pool."
            action={
              <Button asChild>
                <Link href="/dashboard/create">Create your first bag</Link>
              </Button>
            }
            secondary={
              <Button asChild variant="outline">
                <Link href="/dashboard">See how other bags are set up</Link>
              </Button>
            }
          />
        ) : (
          <ul className="grid list-none gap-4 p-0">
            {bags.map((row) => (
              <li key={row.campaign.id}>
                <PublisherBagRow
                  row={row}
                  onClose={() => setClosingBag(row)}
                  busy={closeBag.isPending}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog
        open={closingBag !== null}
        onOpenChange={(next) => {
          if (!next) setClosingBag(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this bag?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{closingBag?.campaign.title}&rdquo; will stop accepting new
              submissions immediately. Submissions already approved can still be settled,
              and the record is kept — nothing is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={closeBag.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmClose();
              }}
              disabled={closeBag.isPending}
            >
              {closeBag.isPending ? (
                <>
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  Closing…
                </>
              ) : (
                "Close bag"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
