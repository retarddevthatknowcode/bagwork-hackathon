"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { adminGet } from "@/components/admin/api";
import { AdminOverview } from "@/components/admin/overview";
import { AdminReviewQueue } from "@/components/admin/review-queue";
import { AdminPayments } from "@/components/admin/payments";
import { AdminUsers } from "@/components/admin/users";
import { AdminCampaigns } from "@/components/admin/campaigns";
import { AdminDemoData } from "@/components/admin/demo-data";
import { AdminPayouts } from "@/components/admin/payouts";
import { AdminReports } from "@/components/admin/reports";
import { AdminLogin } from "@/components/admin/login";

type Tab = "overview" | "review" | "pay" | "users" | "campaigns" | "payouts" | "reports";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "review", label: "Review desk" },
  { key: "pay", label: "Pay creators" },
  { key: "users", label: "Users" },
  { key: "campaigns", label: "Campaigns" },
  { key: "payouts", label: "Payouts" },
  { key: "reports", label: "Reports" },
];

/**
 * Operator console.
 *
 * Auth is the `bagwork_admin` cookie set by `POST /api/admin/login`, which compares
 * `ADMIN_PASSWORD` in constant time. The cookie is httpOnly, so this page never sees it —
 * it only asks whether it is *valid* by probing an admin route, and treats a 401 as signed
 * out. With `ADMIN_PASSWORD` unset the login route answers 503 and the portal stays closed
 * to everyone, which is the intended fail-closed behaviour.
 */
export default function AdminPortal() {
  const [authed, setAuthed] = React.useState(false);
  const [checking, setChecking] = React.useState(true);
  const [tab, setTab] = React.useState<Tab>("overview");
  /**
   * Bumped when the demo-data panel deletes rows, purely so the campaigns table below it remounts and
   * re-reads. Deleting demo bags changes that list, and a table that still shows the rows just
   * removed is exactly the kind of "did it work?" the panel exists to avoid.
   */
  const [campaignsEpoch, setCampaignsEpoch] = React.useState(0);

  React.useEffect(() => {
    adminGet("/api/admin/overview")
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#171717]">
        <Loader2 className="h-8 w-8 animate-spin text-[#E8924C]" />
      </div>
    );
  }

  if (!authed) return <AdminLogin onAuthed={() => setAuthed(true)} />;

  return (
    <div className="min-h-screen bg-[#171717]">
      <header className="sticky top-0 z-20 border-b border-[#2a2a2a] bg-[#171717]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <h1 className="text-base font-bold text-white">Bagwork Admin</h1>
            <p className="text-[11px] text-white/40">
              Platform operations — metrics, review, payouts
            </p>
          </div>
          <button
            onClick={async () => {
              await fetch("/api/admin/login", { method: "DELETE" }).catch(() => {});
              setAuthed(false);
            }}
            className="rounded-lg border border-[#333] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/60 hover:border-[#E8924C]/40 hover:text-[#E8924C]"
          >
            Sign out
          </button>
        </div>

        <nav className="mx-auto flex max-w-[1500px] flex-wrap gap-1 px-4 pb-2 sm:px-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
                tab === t.key
                  ? "bg-[#E8924C] text-black"
                  : "text-white/55 hover:bg-[#222] hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
        {tab === "overview" ? <AdminOverview /> : null}
        {tab === "review" ? <AdminReviewQueue /> : null}
        {tab === "pay" ? <AdminPayments /> : null}
        {tab === "users" ? <AdminUsers /> : null}
        {tab === "campaigns" ? (
          <div className="space-y-4">
            <AdminDemoData onApplied={() => setCampaignsEpoch((n) => n + 1)} />
            <AdminCampaigns key={campaignsEpoch} />
          </div>
        ) : null}
        {tab === "payouts" ? <AdminPayouts /> : null}
        {tab === "reports" ? <AdminReports /> : null}
      </main>
    </div>
  );
}
