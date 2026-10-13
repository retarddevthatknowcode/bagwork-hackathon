import type { Metadata } from "next";

import { ExploreBags } from "@/components/console/pages/explore-bags";

export const metadata: Metadata = {
  title: "Explore Bags",
};

export default function Page() {
  return <ExploreBags />;
}
