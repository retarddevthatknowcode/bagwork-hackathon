"use client";

import * as React from "react";
import { ChevronDown, RefreshCw } from "lucide-react";

import { adminGet, adminPatch } from "./api";
import { Empty, ErrorNote, Loading, Panel, Pill, when } from "./ui";
import { OPS_CATEGORIES, OPS_CATEGORY_LABELS, OPS_SOURCES, OPS_STATUSES } from "@/lib/ops/types";

/** One row, exactly as `GET /api/admin/reports` returns it. */
interface ReportView {
  id: string;
  createdAt: string;
  source: string;
  severity: string;
  category: string;
  title: string;
  message: string;
  path: string | null;
  userId: string | null;
  handle: string | null;
  profileNumber: number | null;
  userAgent: string | null;
  meta: unknown;
  status: string;
  adminNote: string | null;
  resolvedAt: string | null;
}

interface Payload {
  reports: ReportView[];
  total: number;
  page: number;
  perPage: number;
  counts: { open: number; acknowledged: number; resolved: number };
}

type Tone = "muted" | "good" | "bad" | "warn" | "info" | "accent";

const SEVERITY_TONE: Record<string, Tone> = {
  info: "info",
  warning: "warn",
  error: "bad",
  critical: "bad",
};

const STATUS_TONE: Record<string, Tone> = {
  open: "warn",
  acknowledged: "info",
  resolved: "good",
};

const ALL = "ALL";

/** `#1234` for a signed-in reporter, `anonymous` otherwise. */
function reporterLabel(row: ReportView): string {
  if (!row.userId) return "Not signed in";
  const handle = row.handle ? `@${row.handle}` : row.userId.slice(0, 8);
  return row.profileNumber ? `${handle} · Bagworker#${row.profileNumber}` : handle;
}

const selectClass =
  "rounded-lg border border-[#333] bg-[#111] px-2.5 py-1.5 text-xs text-white outline-none [color-scheme:dark] focus:border-[#E8924C]/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-[0.14em] text-white/35">{label}</span>
      {children}
    </label>
  );
}

const categoryLabel = (value: string) =>
  OPS_CATEGORY_LABELS[value as keyof typeof OPS_CATEGORY_LABELS] ?? value;

const smallBtn =
  "rounded-lg border border-[#333] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/60 hover:border-[#E8924C]/40 hover:text-[#E8924C]";

/**
 * The ops feed: user-filed bugs and system failures, in one time-ordered list.
 *
 * Read-only apart from a status and a note. There is no delete on purpose — a resolved report is
 * still the record that the thing happened.
 */
export function AdminReports() {
  const [status, setStatus] = React.useState(ALL);
  const [source, setSource] = React.useState(ALL);
  const [category, setCategory] = React.useState(ALL);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const [data, setData] = React.useState<Payload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [reload, setReload] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setError(null);

    const params = new URLSearchParams();
    if (status !== ALL) params.set("status", status);
    if (source !== ALL) params.set("source", source);
    if (category !== ALL) params.set("category", category);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    adminGet<Payload>(`/api/admin/reports?${params.toString()}`)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load reports");
      });

    return () => {
      cancelled = true;
    };
  }, [status, source, category, from, to, reload]);

  async function act(id: string, next: string) {
    setBusyId(id);
    setError(null);
    try {
      // An empty note is treated as "leave the existing one alone" by the route.
      await adminPatch(`/api/admin/reports/${id}`, { status: next, adminNote: note });
      setNote("");
      setReload((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the report");
    } finally {
      setBusyId(null);
    }
  }

  const rows = data?.reports ?? [];
  const counts = data?.counts;
  const filtersActive =
    status !== ALL || source !== ALL || category !== ALL || Boolean(from) || Boolean(to);

  return (
    <Panel
      title="Reports & errors"
      subtitle={
        counts
          ? `${counts.open} open · ${counts.acknowledged} acknowledged · ${counts.resolved} resolved`
          : "User bug reports and system failures"
      }
      actions={
        <button onClick={() => setReload((value) => value + 1)} className={smallBtn}>
          <RefreshCw className="mr-1 inline h-3 w-3" />
          Refresh
        </button>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Status">
          <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value={ALL}>All statuses</option>
            {OPS_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source">
          <select className={selectClass} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value={ALL}>User + system</option>
            {OPS_SOURCES.map((value) => (
              <option key={value} value={value}>
                {value === "USER_REPORT" ? "User" : "System"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <select
            className={selectClass}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value={ALL}>All areas</option>
            {OPS_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {categoryLabel(value)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From">
          <input type="date" className={selectClass} value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" className={selectClass} value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        {filtersActive ? (
          <button
            onClick={() => {
              setStatus(ALL);
              setSource(ALL);
              setCategory(ALL);
              setFrom("");
              setTo("");
            }}
            className={`${smallBtn} text-white/50`}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="mb-3">
          <ErrorNote message={error} />
        </div>
      ) : null}

      {!data ? (
        <Loading label="Loading reports…" />
      ) : rows.length === 0 ? (
        <Empty>
          {filtersActive ? "Nothing matches these filters." : "No reports yet — all quiet."}
        </Empty>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const isOpen = expanded === row.id;
            return (
              <div key={row.id} className="rounded-xl border border-[#2a2a2a] bg-[#191919]">
                <button
                  onClick={() => {
                    setExpanded(isOpen ? null : row.id);
                    setNote("");
                  }}
                  aria-expanded={isOpen}
                  className="flex w-full items-start gap-2 px-3 py-2.5 text-left"
                >
                  <ChevronDown
                    className={`mt-0.5 h-4 w-4 shrink-0 text-white/40 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Pill tone={row.source === "USER_REPORT" ? "accent" : "muted"}>
                        {row.source === "USER_REPORT" ? "User" : "System"}
                      </Pill>
                      <Pill tone={SEVERITY_TONE[row.severity] ?? "muted"}>{row.severity}</Pill>
                      <Pill tone={STATUS_TONE[row.status] ?? "muted"}>{row.status}</Pill>
                      <span className="text-[10px] uppercase tracking-wide text-white/35">
                        {categoryLabel(row.category)}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-sm font-medium text-white">
                      {row.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-white/40">
                      {when(row.createdAt)} · {row.path ?? "—"} · {reporterLabel(row)}
                    </span>
                  </span>
                </button>

                {isOpen ? (
                  <div className="border-t border-[#2a2a2a] px-3 py-3">
                    <p className="whitespace-pre-wrap text-xs text-white/70">{row.message}</p>

                    <dl className="mt-3 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-3">
                      <div>
                        <dt className="text-[9px] uppercase tracking-[0.14em] text-white/35">
                          Reporter
                        </dt>
                        <dd className="text-white/60">{reporterLabel(row)}</dd>
                      </div>
                      <div>
                        <dt className="text-[9px] uppercase tracking-[0.14em] text-white/35">Page</dt>
                        <dd className="break-all text-white/60">{row.path ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-[9px] uppercase tracking-[0.14em] text-white/35">
                          User agent
                        </dt>
                        <dd className="break-all text-white/60">{row.userAgent ?? "—"}</dd>
                      </div>
                    </dl>

                    {row.meta && Object.keys(row.meta as object).length ? (
                      <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-[#2a2a2a] bg-[#111] p-2 text-[10px] leading-relaxed text-white/50">
                        {JSON.stringify(row.meta, null, 2)}
                      </pre>
                    ) : null}

                    {row.adminNote ? (
                      <p className="mt-2 rounded-lg border border-[#E8924C]/25 bg-[#E8924C]/5 px-2.5 py-1.5 text-[11px] text-[#E8924C]">
                        Note: {row.adminNote}
                      </p>
                    ) : null}

                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      maxLength={1000}
                      placeholder="Add an operator note (optional)"
                      className="mt-2 w-full rounded-lg border border-[#333] bg-[#111] px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-white/25 focus:border-[#E8924C]/50"
                    />

                    <div className="mt-2 flex flex-wrap gap-2">
                      {OPS_STATUSES.map((value) => (
                        <button
                          key={value}
                          disabled={busyId === row.id || row.status === value}
                          onClick={() => act(row.id, value)}
                          className={`${smallBtn} disabled:opacity-40`}
                        >
                          {value === "open" ? "Reopen" : value}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
