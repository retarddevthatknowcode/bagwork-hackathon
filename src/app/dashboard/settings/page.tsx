import type { Metadata } from "next";
import { SettingsPage } from "@/components/console/pages/settings-page";

export const metadata: Metadata = {
  title: "Settings | Bagwork Console",
  description: "Configure notifications, RPC endpoints, and account preferences.",
};

export default function SettingsRoute() {
  return <SettingsPage />;
}
