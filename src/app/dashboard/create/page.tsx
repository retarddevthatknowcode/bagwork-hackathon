import type { Metadata } from "next";
import { CreateBag } from "@/components/console/pages/create-bag-page";

export const metadata: Metadata = {
  title: "Create a Bag | Bagwork Console",
  description: "Fund permissionless creator bounties pool in USDC on Solana.",
};

export default function CreateBagRoute() {
  return <CreateBag />;
}
