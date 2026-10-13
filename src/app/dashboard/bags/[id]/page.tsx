import type { Metadata } from "next";

import { BagDetail } from "@/components/console/pages/bag-detail";

export const metadata: Metadata = {
  title: "Bag Details",
};

export default async function BagDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BagDetail id={id} />;
}
