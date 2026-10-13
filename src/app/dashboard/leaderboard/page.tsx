import type { Metadata } from "next";
import { Leaderboard } from "@/components/console/pages/leaderboard-page";

export const metadata: Metadata = {
  title: "Leaderboard | Bagwork Console",
  description:
    "The Bagwork leaderboard: every creator ranked by points earned from real, settled payouts. Daily, weekly, monthly and all-time.",
};

export default function LeaderboardRoute() {
  return <Leaderboard />;
}
