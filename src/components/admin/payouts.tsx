"use client";

import * as React from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

import { adminGet } from "./api";
import { Empty, ErrorNote, Loading, money, Panel, Pill, TableWrap, Td, Th, shortAddr, when } from "./ui";

interface AdminPayout {
  id: string;
  amount: number;
  token: string;
  status: string;
  txSignature: string;
  feeAmount: number;
  createdAt: string;
  explorerUrl: string;
  submissionId: string;
  platform: string;
  postUrl: string;
  views: number;
  campaignId: string;
  campaignTitle: string;
  tokenSymbol: string;
  projectName: string;
  creatorHandle: string | null;
  creatorWallet: string | null;
}

/** Every settled payout, with its on-chain signature and the fee withheld. */
export function AdminPayouts() {
  const [rows, setRows] = React.useState<AdminPayout[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setError(null);
    adminGet<{ payouts: AdminPayout[] }>("/api/admin/payouts")
      .then((d) => setRows(d.payouts))
      .catch((e: Error) => setError(e.message));
  }, []);

  React.useEffect(load, [load]);

  const total = (rows ?? []).reduce((s, p) => s + p.amount, 0);
  const fees = (rows ?? []).reduce((s, p) => s + p.feeAmount, 0);

  return (
    <Panel
      title="Payouts"
      subtitle={
        rows
          ? `${rows.length} settlements · ${money(total, true)} paid · ${money(fees, true)} in fees`
          : "Settled on-chain transfers"
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
      {error ? (
        <ErrorNote message={error} />
      ) : !rows ? (
        <Loading label="Loading payouts…" />
      ) : rows.length === 0 ? (
        <Empty>No payouts settled yet.</Empty>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Creator</Th>
              <Th>Bag</Th>
              <Th>Platform</Th>
              <Th right>Amount</Th>
              <Th right>Fee</Th>
              <Th>Transaction</Th>
              <Th>When</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <Td>
                  <span className="block">{p.creatorHandle ? `@${p.creatorHandle}` : "—"}</span>
                  <span className="block font-mono text-[11px] text-white/40">
                    {shortAddr(p.creatorWallet, 4, 4)}
                  </span>
                </Td>
                <Td>
                  <span className="block">{p.campaignTitle}</span>
                  <span className="block text-[11px] text-white/40">
                    {p.projectName} · {p.tokenSymbol}
                  </span>
                </Td>
                <Td>
                  <Pill tone="muted">{p.platform}</Pill>
                </Td>
                <Td right className="tabular-nums text-emerald-400">{money(p.amount, true)}</Td>
                <Td right className="tabular-nums">{money(p.feeAmount, true)}</Td>
                <Td>
                  <a
                    href={p.explorerUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 font-mono text-[11px] underline decoration-[#333] underline-offset-4 hover:text-[#E8924C]"
                  >
                    {shortAddr(p.txSignature, 6, 6)} <ExternalLink className="h-3 w-3" />
                  </a>
                </Td>
                <Td className="text-[11px]">{when(p.createdAt)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </Panel>
  );
}
