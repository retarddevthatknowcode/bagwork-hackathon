import type { Metadata } from "next";

import { CommunityIndex } from "@/components/console/pages/community-index";

export const metadata: Metadata = {
  title: "Communities",
  description:
    "Announcement boards for the bags you have joined — what each campaign's publisher is telling its Bagworkers.",
};

export default function CommunityRoute() {
  return <CommunityIndex />;
}
