import type { Metadata } from "next";
import { FeatureRequests } from "@/components/console/pages/feature-requests";

export const metadata: Metadata = {
  title: "Feature Requests | Bagwork Console",
  description:
    "Tell Bagwork what to build next. Upvote the ideas you want, see what is open, planned and done, and post your own once you reach Level 4.",
};

export default function FeatureRequestsRoute() {
  return <FeatureRequests />;
}
