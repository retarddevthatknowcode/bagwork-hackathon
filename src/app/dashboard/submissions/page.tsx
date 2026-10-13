import type { Metadata } from "next";
import { MySubmissions } from "@/components/console/pages/my-submissions";

export const metadata: Metadata = {
  title: "My Submissions | Bagwork Console",
  description: "Track all your submitted content, review status, scores and claimed payouts.",
};

export default function SubmissionsPage() {
  return <MySubmissions />;
}
