"use client";

import * as React from "react";
import { Copy, Loader2, Send } from "lucide-react";

import { adminPost } from "./api";
import { money, Pill, shortAddr, when } from "./ui";

export interface PendingRow {
  id: string;
  postUrl: string;
  platform: string;
  status: string;
  campaignId: string;
  campaignTitle: string;
  tokenSymbol: string;
  treasury: string;
  rateType: string;
  maxPayout: number;
  views: number;
  aiQuality: number;
  payoutAmount: number | null;
  creator: { id: string; handle: string | null; wallet: string | null } | null;
  createdAt: string;
}

export interface BuiltTransfer {
  transaction: string;
  feePayer: string;
  amount: number;
  fee: number;
  treasury: number;
  burn: number;
  rawAmount: string;
  decimals: number;
  mint: string;
  estimatedFeeLamports: number;
  creatorWallet: string;
  campaignTitle: string;
}

/** The built transfer, spelled out: exactly what moves, where from, where to, and fees. */
function TransferDetails({
  built,
  copied,
  setCopied,
}: {
  built: BuiltTransfer;
  copied: boolean;
  setCopied: (value: boolean) => void;
}) {
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-[#E8924C]/25 bg-[#E8924C]/5 p-3 text-[11px] text-white/70">
      <p className="text-[#E8924C]">
        Send exactly {built.amount} USDC ({built.rawAmount} base units, mint{" "}
        {shortAddr(built.mint)}) from{" "}
        <span className="font-mono">{shortAddr(built.feePayer)}</span> to{" "}
        <span className="font-mono">{shortAddr(built.creatorWallet)}</span>.
      </p>
      <p className="text-white/50">
        Fee split on this payout: {money(built.fee, true)} platform fee →{" "}
        {money(built.treasury, true)} treasury + {money(built.burn, true)} $BAG
        buyback-and-burn. The treasury also pays the network fee (
        {built.estimatedFeeLamports.toLocaleString()} lamports).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(built.transaction).catch(() => {});
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#333] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/60 hover:text-[#E8924C]"
        >
          <Copy className="h-3 w-3" /> {copied ? "Copied" : "Copy unsigned tx (base64)"}
        </button>
        <span className="text-white/40">
          Paste into a wallet that accepts a raw transaction, sign with the treasury, then
          record the signature below.
        </span>
      </div>
    </div>
  );
}

export function PayoutRow({
  row,
  onDone,
  onError,
}: {
  row: PendingRow;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [signature, setSignature] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [built, setBuilt] = React.useState<BuiltTransfer | null>(null);
  const [copied, setCopied] = React.useState(false);

  const creatorWallet = row.creator?.wallet ?? null;
  const payable = Boolean(creatorWallet) && (row.payoutAmount ?? 0) > 0;

  async function build() {
    setBusy(true);
    try {
      setBuilt(
        await adminPost<BuiltTransfer>("/api/admin/pay", {
          submissionId: row.id,
          build: true,
        }),
      );
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function record() {
    setBusy(true);
    try {
      const result = await adminPost<{ amount: number }>("/api/admin/pay", {
        submissionId: row.id,
        txSignature: signature.trim(),
      });
      onDone(`Paid ${money(result.amount, true)} · settlement recorded`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-xl border border-[#2a2a2a] bg-[#191919] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold tabular-nums text-[#E8924C]">
              {money(row.payoutAmount ?? 0, true)}
            </span>
            <Pill tone="muted">{row.platform}</Pill>
            <span className="text-sm font-semibold text-white">{row.campaignTitle}</span>
            <span className="text-[11px] text-white/40">· {row.tokenSymbol}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/45">
            <span>{row.creator?.handle ? `@${row.creator.handle}` : "unknown creator"}</span>
            <span className="font-mono">pays {shortAddr(creatorWallet)}</span>
            <span>approved {when(row.createdAt)}</span>
            <a
              href={row.postUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-[#333] underline-offset-4 hover:text-[#E8924C]"
            >
              post
            </a>
          </div>
          {!payable ? (
            <p className="text-[11px] text-amber-400">
              {creatorWallet
                ? "No payout amount — approve this submission with an amount first."
                : "This creator has no Solana wallet linked, so there is nowhere to send."}
            </p>
          ) : null}
        </div>

        <button
          onClick={build}
          disabled={busy || !payable}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#333] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/70 hover:border-[#E8924C]/40 hover:text-[#E8924C] disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Build transfer
        </button>
      </div>
      {built ? <TransferDetails built={built} copied={copied} setCopied={setCopied} /> : null}
      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-[#232323] pt-3">
        <label className="flex min-w-[240px] flex-1 flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-white/40">
            Transaction signature (after you send it)
          </span>
          <input
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="3xKq…9QpZ"
            spellCheck={false}
            autoComplete="off"
            className="w-full rounded-lg border border-[#333] bg-[#111] px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-[#E8924C]/50"
          />
        </label>
        <button
          onClick={record}
          disabled={busy || signature.trim().length < 64}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#E8924C] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-black hover:brightness-110 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Mark as paid
        </button>
      </div>
    </article>
  );
}
