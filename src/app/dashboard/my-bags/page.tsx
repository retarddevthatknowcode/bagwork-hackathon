import type { Metadata } from "next";
import { MyBags } from "@/components/console/pages/my-bags";

export const metadata: Metadata = {
  title: "My Bags | Bagwork Console",
  description:
    "The campaigns you funded as a publisher — spend, submissions received and payouts made.",
};

export default function MyBagsRoute() {
  return <MyBags />;
}
