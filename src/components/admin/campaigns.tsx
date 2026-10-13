"use client";

import * as React from "react";
import { ExternalLink, Eye, Pause, Pencil, Play, Plus, RefreshCw, X } from "lucide-react";

import { adminGet, adminPatch } from "./api";
import { AdminCampaignForm, type AdminCampaignRow } from "./campaign-form";
import { Empty, ErrorNote, Loading, money, Panel, Pill, StatusPill, TableWrap, Td, Th, shortAddr, when } from "./ui";

/** What the filter offers, in lifecycle order. `ALL` means every status, drafts included. */
const FILTERS = ["ALL", "DRAFT", "LIVE", "FILLING", "PAUSED", "ENDED"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * Every bag on the platform — publisher-funded and operator-created alike — with the controls to
 * create one, edit one, pause it, end it, or look at what it has done so far.
 *
 * Both kinds of bag appear here identically on purpose. To a creator they are indistinguishable,
 * so the console should not have to remember which is which either: `createdByAdmin` is the only
 * marker, and it never leaves the admin API.
 */
export function AdminCampaigns() {
  const [rows, setRows] = React.useState<AdminCampaignRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<Filter>("ALL");
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<AdminCampaignRow | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setError(null);
    const params = new URLSearchParams();
    if (status !== "ALL") params.set("status", status);
    if (query.trim()) params.set("q", query.trim());
    adminGet<{ campaigns: AdminCampaignRow[] }>(`/api/admin/campaigns?${params}`)
      .then((d) => setRows(d.campaigns))
      .catch((e: Error) => setError(e.message));
  }, [status, query]);

  // Search is debounced: the list should not refetch on every keystroke.
  React.useEffect(() => {
    const timer = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  /**
   * Pause, resume or end.
   *
   * A status-only PATCH, so no other field can be touched by accident. A paused bag keeps its
   * budget, its slots and its page; it simply stops taking new claims and drops out of the
   * marketplace until it is resumed.
   */
  async function changeStatus(row: AdminCampaignRow, next: "LIVE" | "PAUSED" | "ENDED") {
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    try {
      await adminPatch(`/api/admin/campaigns/${row.id}`, { status: next });
      setNotice(`“${row.title}” is now ${next}`);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (creating || editing) {
    return (
      <AdminCampaignForm
        row={editing}
        onCancel={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={(message) => {
          setCreating(false);
          setEditing(null);
          setNotice(message);
          load();
        }}
      />
    );
  }

  return (
    <Panel
      title="Campaigns"
      subtitle={
        rows
          ? `${rows.length} bag${rows.length === 1 ? "" : "s"}${
              status === "ALL" && !query ? "" : " matching"
            }`
          : "Every bag — funded by a publisher, or created here"
      }
      actions={
        <>
          <button
            onClick={() => {
              setNotice(null);
              setCreating(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#E8924C] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-black hover:brightness-110"
          >
            <Plus className="h-3.5 w-3.5" /> New bag
          </button>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#333] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/60 hover:border-[#E8924C]/40 hover:text-[#E8924C]"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((option) => (
          <button
            key={option}
            onClick={() => setStatus(option)}
            aria-pressed={status === option}
            className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition ${
              status === option
                ? "border-[#E8924C]/50 bg-[#E8924C]/15 text-[#E8924C]"
                : "border-[#333] text-white/50 hover:border-white/25 hover:text-white/80"
            }`}
          >
            {option}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2">
          <span className="sr-only">Search bags</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, project or @handle"
            className="w-56 rounded-lg border border-[#333] bg-[#1f1f1f] px-3 py-1.5 text-xs text-white placeholder:text-white/25 focus:border-[#E8924C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8924C]/40"
          />
        </label>
      </div>

      {notice ? (
        <p
          role="status"
          className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-2 text-xs text-emerald-400"
        >
          {notice}
        </p>
      ) : null}

      {error ? (
        <ErrorNote message={error} />
      ) : !rows ? (
        <Loading label="Loading campaigns…" />
      ) : rows.length === 0 ? (
        <Empty>
          {query || status !== "ALL"
            ? "No bags match that filter."
            : "No campaigns yet. Use “New bag” to create one."}
        </Empty>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Bag</Th>
              <Th>Owner</Th>
              <Th>Treasury</Th>
              <Th>Rate</Th>
              <Th right>Budget</Th>
              <Th right>Paid out</Th>
              <Th right>Left</Th>
              <Th right>Subs</Th>
              <Th right>Slots</Th>
              <Th>Ends</Th>
              <Th>Status</Th>
              <Th right>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <React.Fragment key={c.id}>
              <tr>
                <Td>
                  <span className="block font-medium text-white/90">{c.title}</span>
                  <span className="block text-[11px] text-white/40">
                    {c.projectName} · {c.tokenSymbol} · {c.platforms.join(", ") || "—"}
                  </span>
                </Td>
                <Td>
                  {c.owner ? (
                    <span className="flex flex-col">
                      <span>{c.owner.handle ? `@${c.owner.handle}` : "unamed"}</span>
                      <span className="font-mono text-[11px] text-white/40">
                        {shortAddr(c.owner.wallet, 4, 4)}
                      </span>
                    </span>
                  ) : (
                    <Pill tone="warn" title="Created before ownership existed">
                      unowned
                    </Pill>
                  )}
                </Td>
                <Td className="font-mono">{shortAddr(c.treasury, 5, 5)}</Td>
                <Td>
                  {c.rateType === "DYNAMIC"
                    ? `${money(c.ratePer1k)} / 1k`
                    : `${money(c.maxPayout)} fixed`}
                </Td>
                <Td right className="tabular-nums">{money(c.budget, true)}</Td>
                <Td right className="tabular-nums text-emerald-400">{money(c.spent, true)}</Td>
                <Td right className="tabular-nums text-[#E8924C]">{money(c.remaining, true)}</Td>
                <Td right className="tabular-nums">
                  {c.submissions}
                  {c.awaitingReview > 0 ? (
                    <span className="ml-1 text-amber-400">({c.awaitingReview})</span>
                  ) : null}
                </Td>
                <Td right className="tabular-nums">{Math.max(0, c.slotsRemaining)}</Td>
                <Td className="text-[11px]">{when(c.endsAt)}</Td>
                <Td>
                  <StatusPill status={c.status} />
                </Td>
                <Td right>
                  <span className="inline-flex items-center gap-1">
                    <IconAction label="View" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                      <Eye className="h-3.5 w-3.5" />
                    </IconAction>
                    <IconAction label="Edit" onClick={() => setEditing(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </IconAction>
                    {c.status === "PAUSED" ? (
                      <IconAction
                        label="Resume"
                        tone="good"
                        disabled={busyId === c.id}
                        onClick={() => void changeStatus(c, "LIVE")}
                      >
                        <Play className="h-3.5 w-3.5" />
                      </IconAction>
                    ) : c.status === "LIVE" || c.status === "FILLING" ? (
                      <IconAction
                        label="Pause"
                        tone="warn"
                        disabled={busyId === c.id}
                        onClick={() => void changeStatus(c, "PAUSED")}
                      >
                        <Pause className="h-3.5 w-3.5" />
                      </IconAction>
                    ) : null}
                    {c.status !== "ENDED" ? (
                      <IconAction
                        label="End"
                        tone="bad"
                        disabled={busyId === c.id}
                        onClick={() => void changeStatus(c, "ENDED")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </IconAction>
                    ) : null}
                  </span>
                </Td>
              </tr>
              {expanded === c.id ? (
                <tr>
                  <td colSpan={12} className="border-b border-[#232323] bg-[#101010] px-3 py-3">
                    <CampaignDetail id={c.id} />
                  </td>
                </tr>
              ) : null}
              </React.Fragment>
            ))}
          </tbody>
        </TableWrap>
      )}
    </Panel>
  );
}

/** The shape `GET /api/admin/campaigns/[id]` returns. */
interface DetailPayload {
  campaign: AdminCampaignRow & { tokenKind: string };
  history: {
    id: string;
    action: string;
    changes: Record<string, { from: string | null; to: string | null }> | null;
    createdAt: string;
  }[];
}

/**
 * What one bag has done, opened underneath its row.
 *
 * Fetched only when a row is expanded, so the list itself stays a single request. The change
 * history is the reason this view exists: it is where "why is this budget different from what
 * was funded?" gets answered.
 */
function CampaignDetail({ id }: { id: string }) {
  const [data, setData] = React.useState<DetailPayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setData(null);
    setError(null);
    adminGet<DetailPayload>(`/api/admin/campaigns/${id}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <p className="text-[11px] text-white/35">Loading bag…</p>;

  const c = data.campaign;

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Detail label="Treasury" value={shortAddr(c.treasury, 6, 6)} />
        <Detail label="Token" value={`${c.tokenSymbol} · ${c.tokenKind}`} />
        <Detail
          label="Owner"
          value={
            c.owner
              ? c.owner.handle
                ? `@${c.owner.handle}`
                : shortAddr(c.owner.wallet, 4, 4)
              : "created here"
          }
        />
        <Detail label="Created" value={when(c.createdAt)} />
        <Detail label="Slots left" value={String(Math.max(0, c.slotsRemaining))} />
        <Detail label="Funded" value={money(c.fundedAmount, true)} />
        <Detail label="Paid out" value={money(c.spent, true)} />
        <Detail
          label="Max subs / creator"
          value={`${c.maxSubmissions ?? "∞"} / ${c.maxPerCreator ?? "∞"}`}
        />
      </dl>

      <p className="text-[11px] leading-relaxed text-white/50">{c.description}</p>

      <div className="flex flex-wrap items-center gap-3">
        <Pill tone={c.createdByAdmin ? "accent" : "muted"}>
          {c.createdByAdmin ? "created here" : "publisher-funded"}
        </Pill>
        <a
          href={`/dashboard/bags/${c.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-[#E8924C] hover:underline"
        >
          <ExternalLink className="h-3 w-3" /> Open the bag page
        </a>
      </div>

      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
          Change history
        </h4>
        {data.history.length === 0 ? (
          <p className="mt-1 text-[11px] text-white/35">No changes recorded.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {data.history.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-2 text-[11px]">
                <Pill tone={entry.action === "UPDATE" ? "muted" : "accent"}>{entry.action}</Pill>
                <span className="text-white/60">
                  {Object.entries(entry.changes ?? {})
                    .map(([field, delta]) => `${field}: ${delta.from ?? "—"} → ${delta.to ?? "—"}`)
                    .join(" · ") || "no field changes"}
                </span>
                <span className="text-white/30">{when(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.12em] text-white/35">{label}</dt>
      <dd className="mt-0.5 font-medium text-white/80">{value}</dd>
    </div>
  );
}
function IconAction({
  label,
  tone = "muted",
  disabled,
  onClick,
  children,
}: {
  label: string;
  tone?: "muted" | "good" | "warn" | "bad";
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const toneClass = {
    muted: "hover:border-white/25 hover:text-white",
    good: "hover:border-emerald-500/40 hover:text-emerald-400",
    warn: "hover:border-amber-500/40 hover:text-amber-400",
    bad: "hover:border-red-500/40 hover:text-red-400",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#333] text-white/50 transition disabled:opacity-40 ${toneClass}`}
    >
      {children}
    </button>
  );
}
