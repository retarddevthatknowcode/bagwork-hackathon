import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Portal — Bagwork",
  description: "Internal operations console.",
  // Never indexed: this is an operator surface behind a shared password.
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
