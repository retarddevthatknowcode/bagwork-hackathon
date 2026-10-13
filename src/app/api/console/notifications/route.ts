import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

type Item = {
  id: string;
  kind: "payout" | "approved" | "rejected" | "reviewing" | "new-bag";
  title: string;
  body: string;
  at: string;
  href: string;
};

/**
 * GET /api/console/notifications
 *
 * Derived from real rows (payouts, submissions, newly funded bags) rather than
 * a separate notifications table. Read/unread state is owned by the client
 * (persisted locally per browser), so the server stays stateless.
 */
export async function GET() {
  const session = await getSessionUser();
  const userId = session?.user.id ?? null;

  const [payouts, submissions, campaigns] = await Promise.all([
    // Review decisions and payouts are private to the creator they belong to. This
    // route previously read every submission on the platform, so one creator's
    // rejection reason (and another's payout) appeared in everyone's bell menu.
    userId
      ? db.payout.findMany({
          where: { submission: { userId } },
          include: {
            submission: { include: { campaign: { include: { project: true } } } },
          },
          orderBy: { createdAt: "desc" },
          take: 6,
        })
      : Promise.resolve([]),
    userId
      ? db.submission.findMany({
          where: { userId },
          include: { campaign: { include: { project: true } } },
          orderBy: { createdAt: "desc" },
          take: 12,
        })
      : Promise.resolve([]),
    // Newly funded bags are public — the same signal as the live-campaigns feed.
    db.campaign.findMany({
      include: { project: true },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
  ]);

  const items: Item[] = [];

  for (const p of payouts) {
    items.push({
      id: `payout-${p.id}`,
      kind: "payout",
      title: `Payout settled · $${p.amount.toFixed(2)}`,
      body: `${p.submission.campaign.project.tokenSymbol} bag — ${p.submission.campaign.title}`,
      at: p.createdAt.toISOString(),
      href: "/dashboard/earnings",
    });
  }

  for (const s of submissions) {
    if (s.status === "pending") continue;
    const map = {
      approved: {
        kind: "approved" as const,
        title: "Submission approved",
        body: `${s.campaign.title} passed review — claim your payout.`,
        href: "/dashboard/submissions",
      },
      paid: {
        kind: "approved" as const,
        title: "Submission approved & paid",
        body: `${s.campaign.title} — $${(s.payoutAmount ?? 0).toFixed(2)} sent on-chain.`,
        href: "/dashboard/submissions",
      },
      reviewing: {
        kind: "reviewing" as const,
        title: "Submission in review",
        body: `${s.campaign.title} is being scored by the anti-slop engine.`,
        href: "/dashboard/submissions",
      },
      rejected: {
        kind: "rejected" as const,
        title: "Submission rejected",
        body: `${s.campaign.title} — ${s.reviewNote ?? "did not meet the brief."}`,
        href: "/dashboard/submissions",
      },
    }[s.status];
    if (!map) continue;
    items.push({
      id: `${s.status}-${s.id}`,
      ...map,
      at: s.updatedAt.toISOString(),
    });
  }

  for (const c of campaigns) {
    items.push({
      id: `bag-${c.id}`,
      kind: "new-bag",
      title: `New bag funded · ${c.project.tokenSymbol}`,
      body: `${c.title} is paying ${
        c.rateType === "DYNAMIC" ? `$${c.ratePer1k}/1K views` : `$${c.maxPayout} fixed`
      }.`,
      at: c.createdAt.toISOString(),
      href: `/dashboard/bags/${c.id}`,
    });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return NextResponse.json(
    { notifications: items.slice(0, 14) },
    { headers: NO_STORE },
  );
}
