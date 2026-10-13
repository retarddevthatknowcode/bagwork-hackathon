import type { Submission } from "./types";

/**
 * Grouping for My Submissions.
 *
 * A bagworker thinks in bags — "what am I working on, and how is each piece doing" — while the
 * records are one per content link, because that is the unit review and payout operate on. This
 * module is the bridge: it collapses a flat list of links into one entry per bag.
 *
 * Kept out of the component so the rules can be tested without rendering React: getting the
 * buckets wrong silently hides a creator's work behind the wrong tab.
 */

/** Where a bag belongs in the tab bar, based on the most actionable thing in it. */
export type SubmissionsBucket = "action" | "pending" | "approved" | "paid" | "rejected";

export interface BagGroup {
  campaignId: string;
  campaignTitle: string;
  tokenSymbol: string;
  /** Every record for this bag: slots claimed with no link yet, plus submitted links. */
  records: Submission[];
  /** Records that actually carry a link. */
  links: Submission[];
  /** Opted in but nothing posted yet. */
  awaitingLink: Submission[];
  earned: number;
  latest: string;
  bucket: SubmissionsBucket;
}

/**
 * Classifies a bag by its most actionable record.
 *
 * A claimed slot outranks everything: it is the one thing only the creator can fix, and burying
 * it behind a "Pending" tab means the slot quietly expires unused.
 *
 * Below that, the order follows what still needs something to happen: waiting on review, then
 * waiting on the publisher to pay, then already paid, and rejected last. Approved and paid are
 * separate buckets because they mean different things to the person looking — one is money owed,
 * the other is money received — and collapsing them is how a page ends up implying a payout that
 * has not happened.
 */
export function bucketFor(records: Submission[]): SubmissionsBucket {
  if (records.some((r) => r.status === "claimed")) return "action";
  if (records.some((r) => r.status === "pending" || r.status === "reviewing")) return "pending";
  if (records.some((r) => r.status === "approved")) return "approved";
  if (records.some((r) => r.status === "paid")) return "paid";
  return "rejected";
}

/** Collapses a flat submission list into one entry per bag, newest activity first. */
export function groupByBag(submissions: Submission[]): BagGroup[] {
  const groups = new Map<string, BagGroup>();

  for (const record of submissions) {
    let group = groups.get(record.campaignId);
    if (!group) {
      group = {
        campaignId: record.campaignId,
        campaignTitle: record.campaignTitle,
        tokenSymbol: record.tokenSymbol,
        records: [],
        links: [],
        awaitingLink: [],
        earned: 0,
        latest: record.createdAt,
        bucket: "pending",
      };
      groups.set(record.campaignId, group);
    }

    group.records.push(record);
    if (record.postUrl) group.links.push(record);
    else group.awaitingLink.push(record);
    group.earned += record.payoutAmount ?? 0;
    if (new Date(record.createdAt) > new Date(group.latest)) group.latest = record.createdAt;
  }

  return [...groups.values()]
    .map((group) => ({ ...group, bucket: bucketFor(group.records) }))
    .sort((a, b) => new Date(b.latest).getTime() - new Date(a.latest).getTime());
}

/**
 * Ordering for the links inside one bag.
 *
 * Settled work first, then approved, then in-flight, then rejected: a creator opening a bag
 * wants to see what has been paid before what is still moving.
 */
export function sortLinks(links: Submission[]): Submission[] {
  const rank: Record<string, number> = {
    paid: 0,
    approved: 1,
    reviewing: 2,
    pending: 3,
    claimed: 4,
    rejected: 5,
  };
  return [...links].sort(
    (a, b) =>
      (rank[a.status] ?? 6) - (rank[b.status] ?? 6) ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
