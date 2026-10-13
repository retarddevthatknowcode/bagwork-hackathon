import type { Metadata } from "next";
import { ProfileView } from "@/components/console/pages/profile-view";

export const metadata: Metadata = {
  title: "Profile | Bagwork Console",
  description: "Your creator profile — name, handle, bio, platforms and linked wallet.",
};

export default function ProfileRoute() {
  return <ProfileView />;
}
