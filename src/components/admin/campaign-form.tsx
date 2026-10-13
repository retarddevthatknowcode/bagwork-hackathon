"use client";

import * as React from "react";
import { ImageUp, Loader2, Trash2 } from "lucide-react";

import { adminGet, adminPatch, adminPost } from "./api";
import { ErrorNote, Pill, when } from "./ui";
import {
  PAYMENT_MODELS,
  PLATFORMS,
  PLATFORM_LABELS,
  type PaymentModel,
  type Platform,
} from "@/lib/types";
import { MIN_BUDGET } from "@/lib/campaigns/limits";

/** The bag statuses an operator may set. `FILLING` is derived, never chosen. */
const STATUSES = ["DRAFT", "LIVE", "PAUSED", "ENDED"] as const;
type AdminStatus = (typeof STATUSES)[number];

/**
 * One bag as the admin API returns it — the shape `GET /api/admin/campaigns` produces.
 *
 * Declared here rather than imported so the console stays free of server-only types; the
 * create/edit routes return the same fields back, which is what lets the list refresh in place.
 */
export interface AdminCampaignRow {
  id: string;
  title: string;
  status: string;
  contentType: string;
  rateType: string;
  ratePer1k: number;
  maxPayout: number;
  budget: number;
  fundedAmount: number;
  spent: number;
  remaining: number;
  slotsRemaining: number;
  platforms: Platform[];
  endsAt: string;
  createdAt: string;
  description: string;
  bannerUrl: string | null;
  chain: string;
  paymentModel: string;
  fixedFee: number | null;
  maxSubmissions: number | null;
  maxPerCreator: number | null;
  createdByAdmin: boolean;
  projectName: string;
  tokenSymbol: string;
  tokenMint: string;
  tokenKind: string;
  treasury: string;
  owner: { id: string; handle: string | null; wallet: string | null } | null;
  submissions: number;
  awaitingReview: number;
}

/** One entry in a bag's audit trail. */
interface ChangeEntry {
  id: string;
  action: string;
  changes: Record<string, { from: string | null; to: string | null }> | null;
  createdAt: string;
}

type Draft = {
  title: string;
  projectName: string;
  description: string;
  bannerUrl: string;
  platforms: Platform[];
  tokenKind: string;
  tokenMint: string;
  tokenSymbol: string;
  tokenDecimals: string;
  paymentModel: PaymentModel;
  budget: string;
  fixedFee: string;
  ratePer1k: string;
  maxPayout: string;
  maxSubmissions: string;
  maxPerCreator: string;
  /** `yyyy-mm-dd` from the date input — the day the bag stops taking work. */
  endsAt: string;
  status: AdminStatus;
};

/** Today + `days`, as the value a `<input type="date">` wants. */
function isoDay(offsetDays: number): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/** An existing row, or a sensible new bag, as form state. */
function draftFrom(row: AdminCampaignRow | null): Draft {
  if (!row) {
    return {
      title: "",
      projectName: "",
      description: "",
      bannerUrl: "",
      platforms: [],
      tokenKind: "USDC",
      tokenMint: "",
      tokenSymbol: "",
      tokenDecimals: "6",
      paymentModel: "FIXED",
      budget: "",
      fixedFee: "",
      ratePer1k: "",
      maxPayout: "",
      maxSubmissions: "",
      maxPerCreator: "",
      endsAt: isoDay(30),
      status: "DRAFT",
    };
  }
  return {
    title: row.title,
    projectName: row.projectName,
    description: row.description,
    bannerUrl: row.bannerUrl ?? "",
    platforms: row.platforms,
    tokenKind: row.tokenKind,
    tokenMint: row.tokenMint,
    tokenSymbol: row.tokenSymbol,
    tokenDecimals: "",
    paymentModel: (row.paymentModel as PaymentModel) ?? "FIXED",
    budget: String(row.budget),
    fixedFee: row.fixedFee === null ? "" : String(row.fixedFee),
    ratePer1k: String(row.ratePer1k || ""),
    maxPayout: String(row.maxPayout || ""),
    maxSubmissions: row.maxSubmissions === null ? "" : String(row.maxSubmissions),
    maxPerCreator: row.maxPerCreator === null ? "" : String(row.maxPerCreator),
    endsAt: new Date(row.endsAt).toISOString().slice(0, 10),
    status: (STATUSES as readonly string[]).includes(row.status)
      ? (row.status as AdminStatus)
      : "LIVE",
  };
}

/** Every input in the console form shares this surface. */
const inputClass =
  "w-full rounded-lg border border-[#333] bg-[#1f1f1f] px-3 py-2 text-xs text-white placeholder:text-white/25 focus:border-[#E8924C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E8924C]/40";

const labelClass = "block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <span className="mt-1 block">{children}</span>
      {hint ? <span className="mt-1 block text-[11px] text-white/35">{hint}</span> : null}
    </label>
  );
}

/**
 * Create a bag, or edit one that is already running.
 *
 * Rendered in place of the list rather than inside a dialog: the form is long, and an operator
 * filling it in on a narrow screen should not be fighting a modal.
 *
 * The bag it produces is an ordinary bag. Nothing the console writes marks it as
 * operator-created in the public UI — the only trace is the internal `createdByAdmin` flag,
 * which is never mapped into a public payload.
 */
export function AdminCampaignForm({
  row,
  onSaved,
  onCancel,
}: {
  /** Null to create, a row to edit. */
  row: AdminCampaignRow | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const editing = row !== null;
  const [draft, setDraft] = React.useState<Draft>(() => draftFrom(row));
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<ChangeEntry[] | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // An existing bag's edit trail: an operator should be able to see that someone already
  // raised this budget before raising it again.
  React.useEffect(() => {
    if (!row) return;
    adminGet<{ history: ChangeEntry[] }>(`/api/admin/campaigns/${row.id}`)
      .then((d) => setHistory(d.history))
      .catch(() => setHistory([]));
  }, [row]);

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      // No Content-Type header: the browser has to set the multipart boundary itself. The route
      // accepts the admin cookie in place of a publisher session.
      const res = await fetch("/api/uploads/banner", {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error || "Upload failed");
      set("bannerUrl", json.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /**
   * Reads a custom token off the chain.
   *
   * Decimals in particular have to come from the mint account: a token stored with the wrong
   * ones makes every payout off by orders of magnitude.
   */
  async function resolveMint(mint: string) {
    setError(null);
    try {
      const res = await fetch(`/api/tokens/${mint.trim()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        token?: { symbol?: string; decimals?: number };
        error?: string;
      };
      if (!res.ok || !json.token?.symbol) {
        throw new Error(json.error || "Could not read that token");
      }
      setDraft((d) => ({
        ...d,
        tokenSymbol: json.token?.symbol ?? d.tokenSymbol,
        tokenDecimals:
          json.token?.decimals === undefined ? d.tokenDecimals : String(json.token.decimals),
      }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const ready =
    draft.title.trim().length >= 4 &&
    draft.description.trim().length >= 20 &&
    draft.platforms.length > 0 &&
    Number(draft.budget) > 0 &&
    (draft.tokenKind !== "CUSTOM" ||
      (draft.tokenMint.trim().length > 0 && draft.tokenSymbol.trim().length > 0));

  async function save() {
    setError(null);
    setSaving(true);
    try {
      // The date input means "ends at the end of that day", in the operator's own timezone —
      // which is what someone scheduling a campaign means by an end date.
      const payload = {
        title: draft.title.trim(),
        projectName: draft.projectName.trim(),
        description: draft.description.trim(),
        bannerUrl: draft.bannerUrl.trim() || null,
        platforms: draft.platforms,
        token:
          draft.tokenKind === "CUSTOM"
            ? {
                kind: "CUSTOM",
                mint: draft.tokenMint.trim(),
                symbol: draft.tokenSymbol.trim(),
                decimals: Number(draft.tokenDecimals),
              }
            : { kind: draft.tokenKind },
        chain: "solana",
        paymentModel: draft.paymentModel,
        budget: Number(draft.budget),
        fixedFee: draft.fixedFee === "" ? null : Number(draft.fixedFee),
        ratePer1k: draft.ratePer1k === "" ? 0 : Number(draft.ratePer1k),
        maxPayout: draft.maxPayout === "" ? null : Number(draft.maxPayout),
        maxSubmissions: draft.maxSubmissions === "" ? null : Number(draft.maxSubmissions),
        maxPerCreator: draft.maxPerCreator === "" ? null : Number(draft.maxPerCreator),
        endsAt: new Date(`${draft.endsAt}T23:59:59`).toISOString(),
        status: draft.status,
      };

      if (editing && row) {
        await adminPatch(`/api/admin/campaigns/${row.id}`, payload);
        onSaved(`${draft.title.trim()} updated`);
      } else {
        await adminPost(`/api/admin/campaigns`, payload);
        onSaved(`${draft.title.trim()} created as ${draft.status}`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#2a2a2a] bg-[#141414]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2a2a2a] px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-white">
            {editing ? "Edit bag" : "New bag"}
          </h2>
          <p className="mt-0.5 text-xs text-white/40">
            {editing
              ? `Editing “${row?.title}” · ${row?.projectName}`
              : "Published straight away if you set it Live — an operator bag needs no funding transfer."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Pill tone={draft.status === "LIVE" ? "good" : draft.status === "PAUSED" ? "warn" : "muted"}>
            {draft.status}
          </Pill>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[#333] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/60 hover:border-white/25 hover:text-white"
          >
            Cancel
          </button>
        </div>
      </header>

      <div className="space-y-5 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" hint="At least 4 characters">
            <input
              className={inputClass}
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Solana Mobile — dApp Store clips"
            />
          </Field>
          <Field
            label="Project name"
            hint="Shared with every bag priced in the same token"
          >
            <input
              className={inputClass}
              value={draft.projectName}
              onChange={(e) => set("projectName", e.target.value)}
              placeholder="Solana Mobile"
            />
          </Field>
        </div>

        <Field
          label="Brief"
          hint="At least 20 characters — this is what creators are asked to make."
        >
          <textarea
            rows={4}
            className={inputClass}
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Post a 30–60s clip showing the dApp Store install flow. Hook in the first 2 seconds, no price talk."
          />
        </Field>

        <div>
          <label className={labelClass} htmlFor="admin-banner-url">
            Banner
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              id="admin-banner-url"
              className={`${inputClass} min-w-[220px] flex-1`}
              value={draft.bannerUrl}
              onChange={(e) => set("bannerUrl", e.target.value)}
              placeholder="/api/uploads/banner/… or https://…"
            />
            <input
              ref={fileRef}
              id="admin-banner-file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#333] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/60 hover:border-[#E8924C]/40 hover:text-[#E8924C] disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImageUp className="h-3.5 w-3.5" />
              )}
              {uploading ? "Uploading" : "Upload"}
            </button>
            {draft.bannerUrl ? (
              <button
                type="button"
                onClick={() => set("bannerUrl", "")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#333] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/40 hover:border-red-500/40 hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-white/35">
            PNG, JPG or WebP up to 600 KB, or an https link. Cards fall back to the token
            colour when there is no banner.
          </p>
          {draft.bannerUrl ? (
            <img
              src={draft.bannerUrl}
              alt="Banner preview"
              className="mt-2 h-24 w-full max-w-[420px] rounded-lg border border-[#2a2a2a] object-cover"
            />
          ) : null}
        </div>

        <div>
          <span className={labelClass}>Platforms</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {PLATFORMS.map((platform) => (
              <Toggle
                key={platform}
                active={draft.platforms.includes(platform)}
                onClick={() =>
                  set(
                    "platforms",
                    draft.platforms.includes(platform)
                      ? draft.platforms.filter((p) => p !== platform)
                      : [...draft.platforms, platform],
                  )
                }
              >
                {PLATFORM_LABELS[platform]}
              </Toggle>
            ))}
          </div>
        </div>

        {/* Budget, token and rates — the money side of the bag. */}
        <div className="rounded-xl border border-[#2a2a2a] bg-[#191919] p-4">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/50">
            Budget, token &amp; rates
          </h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <Field
              label="Budget"
              hint={
                draft.tokenKind === "CUSTOM"
                  ? "In the token's own units"
                  // Read from the shared table rather than spelled out: the operator's form and the
                  // publisher's form have to state the same minimum, and this one said "100 USDC"
                  // while the API accepted 5.
                  : `At least ${MIN_BUDGET[draft.tokenKind]} ${draft.tokenKind}`
              }
            >
              <input
                type="number"
                min="0"
                step="any"
                className={inputClass}
                value={draft.budget}
                onChange={(e) => set("budget", e.target.value)}
                placeholder="5000"
              />
            </Field>
            <Field
              label="Token"
              hint={editing ? "Fixed once a bag exists" : "The budget is denominated in this"}
            >
              <select
                className={inputClass}
                value={draft.tokenKind}
                disabled={editing}
                onChange={(e) => set("tokenKind", e.target.value)}
              >
                <option value="USDC">USDC</option>
                <option value="SOL">SOL</option>
                <option value="CUSTOM">Custom CA</option>
              </select>
            </Field>
            <Field label="Payment model">
              <select
                className={inputClass}
                value={draft.paymentModel}
                onChange={(e) => set("paymentModel", e.target.value as PaymentModel)}
              >
                {PAYMENT_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {draft.tokenKind === "CUSTOM" ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field
                label="Token address"
                hint={editing ? "Fixed once a bag exists" : "Read from the chain when you leave the field"}
              >
                <input
                  className={inputClass}
                  value={draft.tokenMint}
                  disabled={editing}
                  onChange={(e) => set("tokenMint", e.target.value)}
                  onBlur={() => {
                    if (!editing && draft.tokenMint.trim().length > 30) {
                      void resolveMint(draft.tokenMint);
                    }
                  }}
                  placeholder="So11111111111111111111111111111111111111112"
                />
              </Field>
              <Field label="Symbol">
                <input
                  className={inputClass}
                  value={draft.tokenSymbol}
                  disabled={editing}
                  onChange={(e) => set("tokenSymbol", e.target.value)}
                  placeholder="MOBILE"
                />
              </Field>
              <Field label="Decimals" hint="Must match the mint, or every payout is wrong">
                <input
                  className={inputClass}
                  value={draft.tokenDecimals}
                  disabled={editing}
                  onChange={(e) => set("tokenDecimals", e.target.value)}
                  placeholder="9"
                />
              </Field>
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {draft.paymentModel !== "RPM" ? (
              <Field
                label={draft.paymentModel === "HYBRID" ? "Flat fee per post" : "Payout per post"}
              >
                <input
                  type="number"
                  min="0"
                  step="any"
                  className={inputClass}
                  value={draft.fixedFee}
                  onChange={(e) => set("fixedFee", e.target.value)}
                  placeholder="25"
                />
              </Field>
            ) : null}
            {draft.paymentModel !== "FIXED" ? (
              <Field label="Reward per 1,000 views">
                <input
                  type="number"
                  min="0"
                  step="any"
                  className={inputClass}
                  value={draft.ratePer1k}
                  onChange={(e) => set("ratePer1k", e.target.value)}
                  placeholder="1.50"
                />
              </Field>
            ) : null}
            {draft.paymentModel !== "FIXED" ? (
              <Field label="Per-post cap" hint="Stops one viral post eating the budget">
                <input
                  type="number"
                  min="0"
                  step="any"
                  className={inputClass}
                  value={draft.maxPayout}
                  onChange={(e) => set("maxPayout", e.target.value)}
                  placeholder="200"
                />
              </Field>
            ) : null}
          </div>

          {editing ? (
            <p className="mt-3 text-[11px] text-white/35">
              Changing the budget or the rates re-derives how many slots are left from the
              submissions already on the bag, so nobody loses a slot.
            </p>
          ) : null}
        </div>

        {/* Limits, schedule and status. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Max submissions" hint="Blank = unlimited">
            <input
              type="number"
              min="1"
              className={inputClass}
              value={draft.maxSubmissions}
              onChange={(e) => set("maxSubmissions", e.target.value)}
              placeholder="—"
            />
          </Field>
          <Field label="Max per creator" hint="Blank = unlimited">
            <input
              type="number"
              min="1"
              className={inputClass}
              value={draft.maxPerCreator}
              onChange={(e) => set("maxPerCreator", e.target.value)}
              placeholder="—"
            />
          </Field>
          <Field label="Ends on" hint="Stops taking posts after this day">
            <input
              type="date"
              className={inputClass}
              value={draft.endsAt}
              onChange={(e) => set("endsAt", e.target.value)}
            />
          </Field>
          <Field
            label="Status"
            hint={
              editing
                ? "Pausing stops new claims immediately"
                : "Live publishes it as soon as you save"
            }
          >
            <select
              className={inputClass}
              value={draft.status}
              onChange={(e) => set("status", e.target.value as AdminStatus)}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {error ? <ErrorNote message={error} /> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!ready || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#E8924C] px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-black hover:brightness-110 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {editing ? "Save changes" : "Create bag"}
          </button>
          {!ready ? (
            <span className="text-[11px] text-white/35">
              A title, a brief, at least one platform and a budget are required.
            </span>
          ) : null}
        </div>

        {editing ? (
          <div className="rounded-xl border border-[#2a2a2a] bg-[#191919] p-4">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/50">
              Change history
            </h3>
            {!history ? (
              <p className="mt-2 text-[11px] text-white/35">Loading…</p>
            ) : history.length === 0 ? (
              <p className="mt-2 text-[11px] text-white/35">No changes recorded yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {history.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-baseline gap-2 text-[11px]">
                    <Pill tone={entry.action === "UPDATE" ? "muted" : "accent"}>
                      {entry.action}
                    </Pill>
                    <span className="text-white/65">
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
        ) : null}
      </div>
    </section>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
        active
          ? "border-[#E8924C]/50 bg-[#E8924C]/15 text-[#E8924C]"
          : "border-[#333] text-white/50 hover:border-white/25 hover:text-white/80"
      }`}
    >
      {children}
    </button>
  );
}
