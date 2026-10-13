import type { Metadata } from "next";

import { BagSubmissionView } from "@/components/console/pages/bag-submission-view";

export const metadata: Metadata = {
  title: "My submission | Bagwork Console",
  description: "Every content link you have submitted to this bag, and what each one earned.",
};

/**
 * One bagworker's full view of a bag they are working on.
 *
 * A route rather than a side panel so it can be linked to, refreshed and shared with itself —
 * a creator managing several links needs a place to come back to, which a drawer cannot be.
 */
export default async function BagSubmissionRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BagSubmissionView campaignId={id} />;
}
