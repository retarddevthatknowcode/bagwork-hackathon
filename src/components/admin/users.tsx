"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";

import { adminGet } from "./api";
import { Empty, ErrorNote, Loading, money, Panel, Pill, TableWrap, Td, Th, shortAddr } from "./ui";

interface AdminUser {
  id: string;
  privyId: string | null;
  handle: string | null;
  displayName: string | null;
  walletAddress: string | null;
  trustScore: number;
  totalEarned: number;
  onboardingCompleted: boolean;
  createdAt: string;
  submissionsCount: number;
  payoutsCount: number;
  bagsFunded: number;
}

/** Every account, with what it has actually done (counted, not from cached counters). */
export function AdminUsers() {
  const [users, setUsers] = React.useState<AdminUser[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");

  const load = React.useCallback(() => {
    setError(null);
    adminGet<{ users: AdminUser[] }>("/api/admin/users")
      .then((d) => setUsers(d.users))
      .catch((e: Error) => setError(e.message));
  }, []);

  React.useEffect(load, [load]);

  const needle = query.trim().toLowerCase();
  const rows = (users ?? []).filter(
    (u) =>
      !needle ||
      (u.handle ?? "").toLowerCase().includes(needle) ||
      (u.walletAddress ?? "").toLowerCase().includes(needle) ||
      (u.displayName ?? "").toLowerCase().includes(needle),
  );

  return (
    <Panel
      title="Users"
      subtitle={users ? `${users.length} accounts` : "Every registered account"}
      actions={
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by handle, name or wallet…"
            className="w-56 rounded-lg border border-[#333] bg-[#111] px-3 py-1.5 text-xs text-white outline-none focus:border-[#E8924C]/50"
          />
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#333] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/60 hover:border-[#E8924C]/40 hover:text-[#E8924C]"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </>
      }
    >
      {error ? (
        <ErrorNote message={error} />
      ) : !users ? (
        <Loading label="Loading users…" />
      ) : rows.length === 0 ? (
        <Empty>No accounts match that filter.</Empty>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Account</Th>
              <Th>Wallet</Th>
              <Th right>Trust</Th>
              <Th right>Earned</Th>
              <Th right>Subs</Th>
              <Th right>Payouts</Th>
              <Th right>Bags</Th>
              <Th>Onboarded</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <Td>
                  <span className="block font-medium text-white/90">
                    {u.displayName ?? "—"}
                  </span>
                  <span className="block text-[11px] text-white/40">
                    {u.handle ? `@${u.handle}` : u.id.slice(0, 10)}
                  </span>
                </Td>
                <Td className="font-mono">{shortAddr(u.walletAddress, 5, 5)}</Td>
                <Td right className="tabular-nums">{u.trustScore}</Td>
                <Td right className="tabular-nums text-emerald-400">
                  {money(u.totalEarned, true)}
                </Td>
                <Td right className="tabular-nums">{u.submissionsCount}</Td>
                <Td right className="tabular-nums">{u.payoutsCount}</Td>
                <Td right className="tabular-nums">{u.bagsFunded}</Td>
                <Td>
                  {u.onboardingCompleted ? (
                    <Pill tone="good">yes</Pill>
                  ) : (
                    <Pill tone="warn">no</Pill>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </Panel>
  );
}
