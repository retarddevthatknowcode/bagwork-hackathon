"use client";

import * as React from "react";
import { AlertTriangle, Ban, CheckCircle2, Loader2, Play, RefreshCw } from "lucide-react";

import { adminGet, adminPatch, adminPost } from "./api";
import { ErrorNote, money } from "./ui";

/**
 * The batch review controls: the engine's on/off switch, and the Run review button.
 *
 * Manual by construction. Nothing here fires on mount, on a timer, or as a side effect of
 * submitting a link — the only call to the batch route is the one behind the button. The switch is
 * persisted server-side (`PATCH /api/admin/settings`), so "on" survives a reload, a different
 * operator and a deployment; and the server re-reads it before every run, which is why the button
 * being enabled here is never the thing that authorises anything.
 */

/** What `GET|PATCH /api/admin/settings` returns. */
export interface BatchReviewSettings {
  batchReviewEnabled: boolean;
  running: boolean;
  batchRunStartedAt: string | null;
  lockTtlMs: number;
  limit: { default: number; max: number };
}

interface BatchItem {
  id: string;
  campaignTitle: string;
  platform: string;
  outcome: "approved" | "rejected" | "skipped" | "failed";
  status: string;
  qualityScore: number;
  authenticityScore: number;
  payoutAmount: number;
  note: string;
}

/** What `POST /api/admin/review/batch` returns. */
export interface BatchRunResponse {
  ok: true;
  examined: number;
  reviewed: number;
  approved: number;
  rejected: number;
  skipped: number;
  failed: number;
  limit: number;
  requested: number | null;
  durationMs: number;
  results: BatchItem[];
}

export function BatchReviewBar({
  selectedIds,
  pendingCount,
  onRan,
}: {
  /** Rows the operator ticked. Non-empty means the run is scoped to exactly those. */
  selectedIds: string[];
  /** How many submissions are waiting, so the default scope is stated rather than implied. */
  pendingCount: number;
  /** Fired after a run so the board reloads and the operator sees the new statuses. */
  onRan: (result: BatchRunResponse) => void;
}) {
  const [settings, setSettings] = React.useState<BatchReviewSettings | null>(null);
  const [settingsError, setSettingsError] = React.useState<string | null>(null);
  const [toggling, setToggling] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<BatchRunResponse | null>(null);

  const loadSettings = React.useCallback(() => {
    setSettingsError(null);
    adminGet<BatchReviewSettings>("/api/admin/settings")
      .then(setSettings)
      .catch((e: Error) => setSettingsError(e.message));
  }, []);

  React.useEffect(loadSettings, [loadSettings]);

  const enabled = settings?.batchReviewEnabled === true;
  const selected = selectedIds.length;

  async function toggle() {
    if (!settings) return;
    setToggling(true);
    setSettingsError(null);
    try {
      // The server returns the stored state, so the switch shows the row the batch route reads —
      // not the value we hoped we wrote.
      const next = await adminPatch<BatchReviewSettings>("/api/admin/settings", {
        batchReviewEnabled: !enabled,
      });
      setSettings(next);
      if (!next.batchReviewEnabled) setSummary(null);
    } catch (e) {
      setSettingsError((e as Error).message);
    } finally {
      setToggling(false);
    }
  }

  async function run() {
    setRunning(true);
    setRunError(null);
    try {
      /*
       * A selection scopes the run to those rows; with none, the server takes the oldest pending
       * ones up to its cap. The `limit` is deliberately not sent: the operator is choosing *what*
       * to review, and the cap is a server-side safety property, not a knob to widen here.
       */
      const result = await adminPost<BatchRunResponse>(
        "/api/admin/review/batch",
        selected ? { submissionIds: selectedIds } : {},
      );
      setSummary(result);
      onRan(result);
    } catch (e) {
      setRunError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  const busy = running || toggling;
  const canRun = enabled && !running && !settings?.running && (selected > 0 || pendingCount > 0);

  return (
    <section
      aria-label="Batch review"
      className="mb-4 rounded-xl border border-[#2a2a2a] bg-[#191919] p-3"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {/* ---- The switch ------------------------------------------------------------- */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Batch review engine"
            disabled={!settings || toggling}
            onClick={toggle}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition disabled:opacity-50 ${
              enabled ? "border-[#E8924C]/50 bg-[#E8924C]" : "border-[#3a3a3a] bg-[#222]"
            }`}
          >
            <span
              aria-hidden="true"
              className={`ml-0.5 inline-block h-3.5 w-3.5 rounded-full bg-black transition-transform ${
                enabled ? "translate-x-4" : "translate-x-0 bg-white/60"
              }`}
            />
          </button>
          <div className="leading-tight">
            <div className="text-[11px] font-bold uppercase tracking-wider text-white/70">
              Batch review
            </div>
            <div className={`text-[11px] ${enabled ? "text-emerald-400" : "text-white/40"}`}>
              {settings ? (enabled ? "Batch review is on" : "Batch review is off") : "Reading…"}
            </div>
          </div>
        </div>

        {/* ---- Scope ------------------------------------------------------------------ */}
        <div className="min-w-px flex-1 border-l border-[#262626] pl-4 text-[11px] text-white/45">
          {selected > 0 ? (
            <>
              <span className="font-semibold text-white/75">{selected}</span> row
              {selected === 1 ? "" : "s"} selected — the run reviews only those
            </>
          ) : (
            <>
              Runs on the oldest <span className="font-semibold text-white/75">{pendingCount}</span>{" "}
              pending submission{pendingCount === 1 ? "" : "s"}
              {settings ? ` (max ${settings.limit.default} per run)` : ""}
            </>
          )}
          {settings?.running ? (
            <span className="ml-2 text-amber-400">· a batch is already running</span>
          ) : null}
        </div>

        {/* ---- Run ------------------------------------------------------------------- */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={run}
            disabled={!canRun}
            title={enabled ? undefined : "Batch review is off — turn it on to run"}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#E8924C] px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider text-black hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {running ? "Reviewing…" : "Run review"}
          </button>
          <button
            type="button"
            onClick={loadSettings}
            disabled={busy}
            aria-label="Refresh batch review settings"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#333] px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-white/50 hover:border-[#E8924C]/40 hover:text-[#E8924C] disabled:opacity-40"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>

      {settingsError ? (
        <div className="mt-3">
          <ErrorNote message={settingsError} />
        </div>
      ) : null}
      {runError ? (
        <div className="mt-3">
          <ErrorNote message={runError} />
        </div>
      ) : null}

      {summary ? <BatchSummary result={summary} /> : null}
    </section>
  );
}

/**
 * What the last run did.
 *
 * The one line an operator reads is `Reviewed · approved · rejected · skipped · failed`, because
 * those five numbers answer the only two questions after pressing the button: did it work, and is
 * anything left for me? The per-item list underneath is the audit — every row with its verdict,
 * scores and the engine's own reason, so "skipped" is never a mystery.
 */
function BatchSummary({ result }: { result: BatchRunResponse }) {
  const [open, setOpen] = React.useState(false);
  const reasons = result.results.filter(
    (item) => item.outcome === "skipped" || item.outcome === "failed",
  );

  return (
    <div className="mt-3 rounded-xl border border-[#2a2a2a] bg-[#141414] p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px]">
        <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 text-[#E8924C]" />
        <span className="font-semibold uppercase tracking-wider text-white/70">Last run</span>
        <span className="tabular-nums text-white/60">
          Reviewed <strong className="text-white">{result.reviewed}</strong>
        </span>
        <span className="text-emerald-400">
          approved <strong className="tabular-nums">{result.approved}</strong>
        </span>
        <span className="text-red-400">
          rejected <strong className="tabular-nums">{result.rejected}</strong>
        </span>
        <span className="text-amber-400">
          skipped <strong className="tabular-nums">{result.skipped}</strong>
        </span>
        <span className={result.failed ? "text-red-400" : "text-white/40"}>
          failed <strong className="tabular-nums">{result.failed}</strong>
        </span>
        <span className="text-white/30">
          · {result.examined} examined of {result.requested ?? result.limit} requested ·{" "}
          {(result.durationMs / 1000).toFixed(1)}s
        </span>
        {reasons.length ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="ml-auto rounded-lg border border-[#333] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/50 hover:border-[#E8924C]/40 hover:text-[#E8924C]"
          >
            {open ? "Hide" : `Why ${reasons.length} need a person`}
          </button>
        ) : null}
      </div>

      <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-white/40">
        <Ban aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
        Nothing was paid. Skipped and failed rows reached no verdict — the model was unreachable, the
        post could not be read, or the row was already decided — so they are still{" "}
        <span className="text-white/60">pending</span> for a human. Approvals are waiting in Pay
        creators.
      </p>

      {open ? (
        <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {result.results.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-[#262626] bg-[#191919] px-2.5 py-2 text-[11px]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    item.outcome === "approved"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : item.outcome === "rejected"
                        ? "border-red-500/30 bg-red-500/10 text-red-400"
                        : item.outcome === "failed"
                          ? "border-red-500/30 bg-red-500/10 text-red-400"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                  }`}
                >
                  {item.outcome}
                </span>
                <span className="truncate text-white/70">{item.campaignTitle}</span>
                <span className="text-white/30">· {item.status}</span>
                {item.outcome === "approved" || item.outcome === "rejected" ? (
                  <span className="tabular-nums text-white/40">
                    · q {item.qualityScore} / a {item.authenticityScore}
                    {item.payoutAmount ? ` · ${money(item.payoutAmount, true)}` : ""}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 flex items-start gap-1.5 leading-relaxed text-white/45">
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 opacity-60" />
                {item.note}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
