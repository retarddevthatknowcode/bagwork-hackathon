"use client";

import * as React from "react";
import { Check, ExternalLink, Loader2, ScanLine, X } from "lucide-react";

import { money, Pill, shortAddr, StatusPill, when } from "./ui";

/** One submission in the review desk, with its scores and the three decisions. */
export interface AdminSubmission {
  id: string;
  postUrl: string;
  platform: string;
  status: string;
  campaignId: string;
  campaignTitle: string;
  tokenSymbol: string;
  treasury: string;
  rateType: string;
  ratePer1k: number;
  maxPayout: number;
  views: number;
  likes: number;
  reposts: number;
  aiQuality: number;
  aiAuthenticity: number;
  aiSpamRisk: number;
  payoutAmount: number | null;
  feeAmount: number | null;
  reviewNote: string | null;
  txSignature: string | null;
  creator: {
    id: string;
    handle: string | null;
    wallet: string | null;
    trustScore: number;
  } | null;
  /** Repeated from `creator.id` so a row still identifies its creator when the join is missing. */
  creatorId: string | null;
  createdAt: string;
  /** When the *link* arrived — what the desk means by "submitted". */
  submittedAt: string;
}

export function ReviewCard({
  s,
  busy,
  selected,
  onSelect,
  onApprove,
  onReject,
}: {
  s: AdminSubmission;
  busy: boolean;
  /** Tick state for a partial batch. Only meaningful while `selectable`. */
  selected: boolean;
  onSelect: (selected: boolean) => void;
  onApprove: (amount: number | undefined) => void;
  onReject: (reason: string) => void;
}) {
  const [amount, setAmount] = React.useState(
    s.payoutAmount != null ? String(s.payoutAmount) : "",
  );
  const [reason, setReason] = React.useState("");
  const [showReject, setShowReject] = React.useState(false);

  // A paid submission is finished: re-approving it would double-credit the creator.
  const decidable = s.status !== "paid";
  /**
   * Only a submission with no verdict can be reviewed, so only those are selectable.
   *
   * The batch skips anything else anyway; a checkbox that does nothing when ticked would make the
   * selection count lie about what a run will cover.
   */
  const selectable = s.status === "pending" || s.status === "reviewing";

  return (
    <article
      className={`rounded-xl border bg-[#191919] p-4 ${
        selected ? "border-[#E8924C]/50" : "border-[#2a2a2a]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            disabled={!selectable}
            onChange={(e) => onSelect(e.target.checked)}
            aria-label={
              selectable
                ? `Select this submission for a batch review`
                : `Not selectable — this submission is ${s.status}`
            }
            title={selectable ? "Include in a batch review" : `Already ${s.status}`}
            className="mt-1 h-3.5 w-3.5 shrink-0 accent-[#E8924C] disabled:opacity-30"
          />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={s.status} />
              <Pill tone="muted">{s.platform}</Pill>
              <span className="text-sm font-semibold text-white">{s.campaignTitle}</span>
              <span className="text-[11px] text-white/40">· {s.tokenSymbol}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/45">
              <span>{s.creator?.handle ? `@${s.creator.handle}` : "unknown creator"}</span>
              <span className="font-mono" title={s.creatorId ?? undefined}>
                {shortAddr(s.creatorId, 6, 4)}
              </span>
              <span className="font-mono" title={s.creator?.wallet ?? undefined}>
                {shortAddr(s.creator?.wallet)}
              </span>
              <span>submitted {when(s.submittedAt)}</span>
              <a
                href={s.postUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 underline decoration-[#333] underline-offset-4 hover:text-[#E8924C]"
              >
                Open post <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>

      </div>


      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <Metric label="Quality" value={`${s.aiQuality}/100`} />
        <Metric label="Authenticity" value={`${s.aiAuthenticity}/100`} />
        <Metric label="Spam risk" value={`${s.aiSpamRisk}/100`} />
        <Metric label="Views" value={s.views.toLocaleString()} />
        <Metric label="Likes" value={s.likes.toLocaleString()} />
        <Metric
          label="Payout"
          value={s.payoutAmount != null ? money(s.payoutAmount, true) : "—"}
          accent
        />
        <Metric label="Fee (5%)" value={s.feeAmount != null ? money(s.feeAmount, true) : "—"} />
      </div>

      {s.reviewNote ? (
        <p className="mt-3 rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-2 text-[11px] leading-relaxed text-white/55">
          {s.reviewNote}
        </p>
      ) : null}

      {decidable ? (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-[#232323] pt-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-white/40">
              Payout USDC
            </span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder={s.payoutAmount != null ? String(s.payoutAmount) : "0.00"}
              className="w-28 rounded-lg border border-[#333] bg-[#111] px-3 py-1.5 text-xs text-white outline-none focus:border-[#E8924C]/50"
            />
          </label>

          <button
            onClick={() => onApprove(amount ? Number(amount) : undefined)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-black hover:bg-emerald-400 disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" /> Approve
          </button>

          {showReject ? (
            <div className="flex flex-1 items-end gap-2">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-white/40">
                  Reason (shown to the creator)
                </span>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Off-brief, low effort, broken link…"
                  className="w-full rounded-lg border border-red-500/30 bg-[#111] px-3 py-1.5 text-xs text-white outline-none focus:border-red-500/60"
                />
              </label>
              <button
                onClick={() => {
                  onReject(reason);
                  setShowReject(false);
                }}
                disabled={busy}
                className="rounded-lg bg-red-500/20 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/30 disabled:opacity-40"
              >
                Confirm reject
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowReject(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/10 disabled:opacity-40"
            >
              <X className="h-3.5 w-3.5" /> Reject
            </button>
          )}
        </div>
      ) : null}
    </article>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-[#262626] bg-[#141414] px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-[0.12em] text-white/35">{label}</div>
      <div
        className={`mt-0.5 text-sm font-semibold tabular-nums ${accent ? "text-[#E8924C]" : "text-white/85"}`}
      >
        {value}
      </div>
    </div>
  );
}
