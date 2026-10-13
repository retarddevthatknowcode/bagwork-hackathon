"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";

import { adminGet } from "./api";
import { Empty, ErrorNote, Loading, money, Panel } from "./ui";
import { PayoutRow, type PendingRow } from "./payout-row";

/**
 * Pay creators — the operator's payout desk.
 *
 * Lists every approved-but-unpaid submission. Each row offers the two ways to settle it
 * (see `PayoutRow`): build the unsigned USDC transfer so you can see exactly what will
 * move, or record the signature of a transfer you actually sent. `/api/admin/pay` refuses
 * anything that is not a real base58 signature — a payout row means money moved, and an
 * earlier version of this flow invented a signature and linked to a transaction that never
 * existed.
 *
 * The creator is credited, never the operator, and the leaderboard is rebuilt on success.
 */
export function AdminPayments() {
  const [rows, setRows] = React.useState<PendingRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setError(null);
    adminGet<{ submissions: PendingRow[] }>("/api/admin/submissions?status=approved")
      .then((d) => setRows(d.submissions))
      .catch((e: Error) => setError(e.message));
  }, []);

  React.useEffect(load, [load]);

  const total = (rows ?? []).reduce((sum, r) => sum + (r.payoutAmount ?? 0), 0);

  return (
    <Panel
      title="Pay creators"
      subtitle={
        rows
          ? `${rows.length} approved submission${rows.length === 1 ? "" : "s"} · ${money(total, true)} outstanding`
          : "Approved submissions waiting to be paid"
      }
      actions={
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#333] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/60 hover:border-[#E8924C]/40 hover:text-[#E8924C]"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      }
    >
      {note ? (
        <div className="mb-3 rounded-xl border border-[#E8924C]/30 bg-[#E8924C]/5 px-3 py-2 text-xs text-[#E8924C]">
          {note}
        </div>
      ) : null}
      {error ? (
        <div className="mb-3">
          <ErrorNote message={error} />
        </div>
      ) : null}

      {!rows ? (
        <Loading label="Loading payout queue…" />
      ) : rows.length === 0 ? (
        <Empty>
          Nothing to pay. Approve a submission in the Review desk and it appears here.
        </Empty>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <PayoutRow
              key={r.id}
              row={r}
              onDone={(message) => {
                setNote(message);
                load();
              }}
              onError={(message) => setError(message || null)}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}
