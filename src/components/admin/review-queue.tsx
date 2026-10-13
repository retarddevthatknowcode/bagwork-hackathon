"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";

import { adminGet, adminPost } from "./api";
import { BatchReviewBar } from "./batch-review-bar";
import { ErrorNote, Empty, Loading, money, Panel } from "./ui";
import { ReviewCard, type AdminSubmission } from "./review-card";

export interface AdminSubmissionsPayload {
  submissions: AdminSubmission[];
  /** Bags that have submissions, for the filter dropdown — never an option with no rows. */
  campaignOptions: { id: string; title: string; tokenSymbol: string; submissions: number }[];
  stats: {
    pending: number;
    reviewing: number;
    approved: number;
    rejected: number;
    paid: number;
    total: number;
    awaitingReview: number;
  };
}

/**
 * The board's tabs.
 *
 * `pending` is the default and the batch's default scope: a submission lands there the moment its
 * link is submitted and stays until somebody runs review. "Awaiting review" is gone as a tab of its
 * own — it merged two states with one word, which is how a queue of things nobody had looked at
 * could look identical to a queue of things being looked at right now.
 */
type Tab = "pending" | "reviewing" | "approved" | "rejected" | "paid" | "ALL";

const TABS: { key: Tab; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "reviewing", label: "In review" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "paid", label: "Paid" },
  { key: "ALL", label: "Everything" },
];

/**
 * The review desk: what has been submitted, and the one place review is started.
 *
 * The board itself is read-only apart from two overrides — Approve (set the payout, mark it ready
 * for Pay creators) and Reject (refuse it with a reason the creator sees). Everything else happens
 * through **Run review**, which is a *batch*: the operator decides when to spend the model calls,
 * ticks rows to narrow the scope, and gets back a per-item account of what happened.
 *
 * Nothing here reviews anything on its own. There is no effect, no timer and no post-submit hook
 * that calls the engine — a submission lands `pending` and stays there, which is exactly what the
 * queue is for. The engine also never approves without a model, so a run during an outage reports
 * "skipped" rather than emptying the queue into approvals.
 */
export function AdminReviewQueue() {
  const [tab, setTab] = React.useState<Tab>("pending");
  const [data, setData] = React.useState<AdminSubmissionsPayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [campaignId, setCampaignId] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  /** Ticked rows, for a partial batch. Ids, so a reload cannot lose the selection. */
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const load = React.useCallback(
    (which: Tab, filters: { campaignId: string; from: string; to: string } = { campaignId: "", from: "", to: "" }) => {
      setError(null);
      const params = new URLSearchParams({ status: which });
      if (filters.campaignId) params.set("campaignId", filters.campaignId);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      adminGet<AdminSubmissionsPayload>(`/api/admin/submissions?${params}`)
        .then(setData)
        .catch((e: Error) => setError(e.message));
    },
    [],
  );

  React.useEffect(() => {
    load(tab, { campaignId, from, to });
  }, [load, tab, campaignId, from, to]);

  const rows = data?.submissions ?? [];
  const stats = data?.stats;
  const selectedIds = [...selected];
  const selectableRows = rows.filter(
    (row) => row.status === "pending" || row.status === "reviewing",
  );
  const allVisibleSelected =
    selectableRows.length > 0 && selectableRows.every((row) => selected.has(row.id));

  const filtersActive = Boolean(campaignId || from || to);

  function toggleRow(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /** Select or clear every reviewable row currently on screen. */
  function toggleAllVisible(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const row of selectableRows) {
        if (checked) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
  }

  /**
   * The two decisions a person can still make — and only ever as an override.
   *
   * Approving here sets the payout and marks it ready; it goes to Pay creators like any other
   * approval, and the automatic payout runs from the campaign's own treasury exactly as it always
   * has. Reviewing a row, by contrast, is not a per-row action any more: it is the batch above.
   */
  async function act(kind: "approve" | "reject", id: string, payload?: object) {
    setBusyId(id);
    setNote(null);
    try {
      const result = await adminPost<Record<string, unknown>>(`/api/admin/${kind}`, {
        submissionId: id,
        ...payload,
      });
      if (kind === "approve") {
        setNote(`Approved · payout ${money(Number(result.payoutAmount), true)}`);
      } else {
        setNote(`Rejected${result.slotReturned ? " · slot returned to the bag" : ""}`);
      }
      load(tab, { campaignId, from, to });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel
      title="Review desk"
      subtitle="Every submission, and the only place review is started. Approving sets the payout that Pay creators will send."
      actions={
        <button
          onClick={() => load(tab, { campaignId, from, to })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#333] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/60 hover:border-[#E8924C]/40 hover:text-[#E8924C]"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      }
    >
      {/* ---- Batch review: the switch, and the button the whole feature hangs on ---- */}
      <BatchReviewBar
        selectedIds={selectedIds}
        pendingCount={stats?.pending ?? 0}
        onRan={(result) => {
          /*
           * After a run: reload the board, and keep only the rows the run could not decide.
           *
           * Those are the ones still `pending` — model unreachable, post unreadable — and keeping
           * them ticked makes "retry the ones it could not read" a single click. Rows that reached a
           * verdict are dropped from the selection, because a ticked row that cannot be run again is
           * a lie about what the next click would do.
           */
          const stillPending = new Set(
            result.results.filter((item) => item.status === "pending").map((item) => item.id),
          );
          setSelected((current) => new Set([...current].filter((id) => stillPending.has(id))));
          load(tab, { campaignId, from, to });
        }}
      />

      {/* ---- Status tabs ------------------------------------------------------------ */}
      <div className="mb-3 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const count = t.key === "ALL" ? stats?.total : stats?.[t.key];
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-pressed={tab === t.key}
              className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
                tab === t.key
                  ? "border-[#E8924C] bg-[#E8924C] text-black"
                  : "border-[#333] text-white/60 hover:border-[#E8924C]/40 hover:text-[#E8924C]"
              }`}
            >
              {t.label}
              {typeof count === "number" ? ` · ${count}` : ""}
            </button>
          );
        })}
      </div>

      {/* ---- Filters ---------------------------------------------------------------- */}
      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-[#2a2a2a] bg-[#141414] px-3 py-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[9px] uppercase tracking-[0.14em] text-white/35">Campaign</span>
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className="min-w-[220px] max-w-[320px] rounded-lg border border-[#333] bg-[#111] px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#E8924C]/50"
          >
            <option value="">All campaigns</option>
            {(data?.campaignOptions ?? []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.title} · {option.submissions}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[9px] uppercase tracking-[0.14em] text-white/35">
            Submitted from
          </span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-[#333] bg-[#111] px-2.5 py-1.5 text-xs text-white outline-none [color-scheme:dark] focus:border-[#E8924C]/50"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[9px] uppercase tracking-[0.14em] text-white/35">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-[#333] bg-[#111] px-2.5 py-1.5 text-xs text-white outline-none [color-scheme:dark] focus:border-[#E8924C]/50"
          />
        </label>

        {filtersActive ? (
          <button
            onClick={() => {
              setCampaignId("");
              setFrom("");
              setTo("");
            }}
            className="rounded-lg border border-[#333] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/50 hover:border-white/25 hover:text-white/80"
          >
            Clear filters
          </button>
        ) : null}

        {selectableRows.length ? (
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-[11px] text-white/50">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={(e) => toggleAllVisible(e.target.checked)}
              className="h-3.5 w-3.5 accent-[#E8924C]"
            />
            Select all {selectableRows.length} reviewable here
          </label>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] text-white/40">
        <span>
          Showing <strong className="tabular-nums text-white/70">{rows.length}</strong>{" "}
          {rows.length === 1 ? "submission" : "submissions"}
        </span>
        {selectedIds.length ? (
          <span className="text-[#E8924C]">{selectedIds.length} selected</span>
        ) : null}
        {filtersActive ? <span>· filters applied</span> : null}
      </div>

      {note ? (
        <div
          role="status"
          className="mb-3 rounded-xl border border-[#E8924C]/30 bg-[#E8924C]/5 px-3 py-2 text-xs text-[#E8924C]"
        >
          {note}
        </div>
      ) : null}
      {error ? (
        <div className="mb-3">
          <ErrorNote message={error} />
        </div>
      ) : null}

      {!data ? (
        <Loading label="Loading submissions…" />
      ) : rows.length === 0 ? (
        <Empty>Nothing in “{TABS.find((t) => t.key === tab)?.label}”.</Empty>
      ) : (
        <div className="space-y-3">
          {rows.map((s) => (
            <ReviewCard
              key={s.id}
              s={s}
              busy={busyId === s.id}
              selected={selected.has(s.id)}
              onSelect={(checked) => toggleRow(s.id, checked)}
              onApprove={(amount) => act("approve", s.id, { adjustedPayout: amount })}
              onReject={(reason) => act("reject", s.id, { reason })}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}
