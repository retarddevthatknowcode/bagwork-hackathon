import type { Metadata } from "next";
import { Quests } from "@/components/console/pages/quests-page";

export const metadata: Metadata = {
  title: "Weekly Quests | Bagwork Console",
  description:
    "Three weekly quests for Bagworkers — opt into live bags, publish approved content, earn verified views. Each completion pays 200 points, and every quest resets every Monday.",
};

export default function QuestsRoute() {
  return <Quests />;
}
