import type { Metadata } from "next";

import { CommunityView } from "@/components/console/pages/community-page";

export const metadata: Metadata = {
  title: "Community",
  description: "A bag's announcement board.",
};

/**
 * One community.
 *
 * `[id]` is either a community id or a campaign id — the API resolves both, which is what lets a
 * bag page link here with the campaign it already holds, before a community even exists.
 */
export default async function CommunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CommunityView communityRef={id} />;
}
