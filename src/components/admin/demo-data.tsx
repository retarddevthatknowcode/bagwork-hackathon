"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";

import { adminGet, adminPost } from "./api";
import { ErrorNote, Loading, Panel, Pill } from "./ui";

/** The sweep's plan, as `GET /api/admin/demo-bags` returns it. */
interface DemoCampaign {
  id: string;
  title: string;
  status: string;
  createdBy: string | null;
  createdByAdmin: boolean;
  submissions: number;
}

interface DemoProject {
  id: string;
  name: string;
  tokenSymbol: string;
  campaigns: DemoCampaign[];
}

interface Plan {
  empty: boolean;
  projectsMatched: number;
  projects: DemoProject[];
  strays: DemoCampaign[];
  bags: DemoCampaign[];
  orphanProjects: { id: string; name: string; tokenSymbol: string }[];
  skipped: { name: string; tokenSymbol: string; reason: string }[];
  explore: {
    total: number;
    demos: {
      title: string;
      project: string;
      tokenSymbol: string;
      status: string;
      owned: boolean;
      deletable: boolean;
    }[];
  };
}

interface ApplyResult {
  applied: boolean;
  removed: {
    projects: number;
    strays: number;
    bags: number;
    orphanProjects: number;
    campaigns: string[];
  } | null;
  after: Plan;
}

/**
 * The demo-bag purge, as a button.
 *
 * The rows it removes are seeded leftovers — NOVA, EMBER, $DEMO and a hand-made CTST bag — that sit
 * in the live database and show up on Explore as campaigns nobody can be paid for. They are rows, not
 * code: the seeds that created them are deleted, so nothing can bring them back, but only a write
 * against the database they live in removes the ones already there.
 *
 * That is why this is a panel and not only a script. `scripts/remove-demo-bags.ts` needs
 * `DATABASE_URL`, and the machine an operator is sitting at often does not have the production one;
 * the deployed app does, and this calls through it (`GET` to look, `POST` with `confirm: true` to
 * write). The rule is the same module either way.
 *
 * Look before writing: nothing is sent until "Check", the DELETE/SKIP list is shown as it was
 * reported, and the delete button is a two-step confirm. After a run the panel re-reads the plan, so
 * what it reports is the state of the database rather than what it asked for.
 */
export function AdminDemoData({ onApplied }: { onApplied?: () => void }) {
  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [result, setResult] = React.useState<ApplyResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function check() {
    setBusy(true);
    setError(null);
    setResult(null);
    setConfirming(false);
    adminGet<Plan>("/api/admin/demo-bags")
      .then(setPlan)
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const body = await adminPost<ApplyResult>("/api/admin/demo-bags", { confirm: true });
      setResult(body);
      setPlan(body.after);
      onApplied?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const campaigns =
    (plan?.projects.reduce((sum, project) => sum + project.campaigns.length, 0) ?? 0) +
    (plan?.strays.length ?? 0) +
    (plan?.bags.length ?? 0);
  const submissions =
    plan?.projects.reduce(
      (total, project) =>
        total + project.campaigns.reduce((sum, campaign) => sum + campaign.submissions, 0),
      0,
    ) ?? 0;


  return (
    <Panel
      title="Demo data"
      subtitle="Seeded NOVA / EMBER / $DEMO / CTST bags, and everything hanging off them"
      actions={
        <>
          <button
            onClick={check}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#333] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/60 hover:border-[#E8924C]/40 hover:text-[#E8924C] disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
            {plan ? "Check again" : "Check"}
          </button>
          {plan && !plan.empty ? (
            confirming ? (
              <button
                onClick={remove}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-red-400 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {busy ? "Removing…" : `Confirm — delete ${campaigns}`}
              </button>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/10 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove {campaigns}
              </button>
            )
          ) : null}
        </>
      }
    >
      <div className="space-y-3">
        {error ? <ErrorNote message={error} /> : null}

        {result?.applied && result.removed ? (
          <div
            role="status"
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-300"
          >
            <p className="font-semibold">
              Removed {result.removed.projects} project(s), {result.removed.bags} bag(s) matched on
              their own copy, {result.removed.strays} stray campaign(s) and{" "}
              {result.removed.orphanProjects} emptied project(s).
            </p>
            {result.removed.campaigns.length ? (
              <p className="mt-1 text-emerald-300/70">{result.removed.campaigns.join(", ")}</p>
            ) : null}
          </div>
        ) : null}

        {busy && !plan ? <Loading label="Reading the campaign tables…" /> : null}

        {!plan && !busy ? (
          <div className="space-y-2">
            <p className="text-xs text-white/50">
              Nothing is read until you check. The check lists every row the sweep would delete, every
              row it would deliberately leave alone, and whether Explore would still show any of them.
            </p>
            <button
              onClick={check}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#E8924C] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-black hover:brightness-110"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Check for demo data
            </button>
          </div>
        ) : null}

        {plan ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={plan.explore.demos.length ? "bad" : "good"}>
                Explore: {plan.explore.total} bag{plan.explore.total === 1 ? "" : "s"} visible,{" "}
                {plan.explore.demos.length} demo
              </Pill>
              {plan.projectsMatched ? (
                <Pill tone="muted">{plan.projectsMatched} project(s) matched</Pill>
              ) : null}
              {plan.skipped.length ? (
                <Pill tone="warn">{plan.skipped.length} left alone</Pill>
              ) : null}
            </div>

            {plan.explore.demos.map((demo) => (
              <p key={demo.title} className="text-xs text-white/60">
                <span className="text-red-400">Visible on Explore</span> — {demo.title} ·{" "}
                {demo.project} ({demo.tokenSymbol}) [{demo.status}]
                {demo.owned ? " · owned, so the rule leaves it alone" : ""}
              </p>
            ))}

            {plan.empty ? (
              <p className="rounded-xl border border-dashed border-[#2f2f2f] px-4 py-6 text-center text-xs text-white/40">
                No demo bag is left in this database. Nothing to delete.
              </p>
            ) : (
              <>
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p>
                    This deletes {campaigns} campaign(s) — {submissions} submission(s) among them —
                    with their payouts, communities and admin log entries. Fee deposits that were
                    matched to these bags survive with no campaign, because those deposits really
                    happened on-chain.
                  </p>
                </div>

                {plan.projects.map((project) => (
                  <div
                    key={project.id}
                    className="rounded-xl border border-[#2a2a2a] bg-[#191919] p-3"
                  >
                    <p className="text-xs font-semibold text-white">
                      Delete {project.name}{" "}
                      <span className="text-white/40">({project.tokenSymbol})</span>
                    </p>
                    {project.campaigns.map((campaign) => (
                      <p key={campaign.id} className="mt-0.5 text-[11px] text-white/50">
                        “{campaign.title}” [{campaign.status}] · {campaign.submissions} submission(s)
                      </p>
                    ))}
                  </div>
                ))}

                {[...plan.strays, ...plan.bags].map((campaign) => (
                  <p key={campaign.id} className="text-xs text-white/60">
                    <span className="text-red-400">Delete bag</span> — “{campaign.title}” [
                    {campaign.status}] · {campaign.submissions} submission(s) · owner{" "}
                    {campaign.createdBy ?? (campaign.createdByAdmin ? "admin" : "none")}
                  </p>
                ))}

                {plan.orphanProjects.map((project) => (
                  <p key={project.id} className="text-xs text-white/50">
                    Delete empty project {project.name} ({project.tokenSymbol}) — nothing left on it
                    once its bag is gone
                  </p>
                ))}
              </>
            )}

            {plan.skipped.map((skip) => (
              <p key={skip.tokenSymbol} className="text-xs text-white/40">
                Kept {skip.name} ({skip.tokenSymbol}) — {skip.reason}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
