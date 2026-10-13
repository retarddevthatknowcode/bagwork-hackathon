"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

/** Shared console primitives. Deliberately dependency-light — plain Tailwind, no shadcn. */

export const money = (value: number, cents = false) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })}`;

export const shortAddr = (value: string | null | undefined, lead = 4, tail = 4) => {
  if (!value) return "—";
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
};

export function when(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  const value =
    mins < 1 ? "just now" : mins < 60 ? `${mins}m` : hours < 24 ? `${hours}h` : `${days}d`;
  return value === "just now" ? value : diff < 0 ? `${value} ago` : `in ${value}`;
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#2a2a2a] bg-[#141414]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2a2a2a] px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-white">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-white/40">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "accent" | "good" | "bad" | "warn";
}) {
  const toneClass =
    tone === "accent"
      ? "text-[#E8924C]"
      : tone === "good"
        ? "text-emerald-400"
        : tone === "bad"
          ? "text-red-400"
          : tone === "warn"
            ? "text-amber-400"
            : "text-white";
  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#191919] p-4">
      <div className="text-[10px] uppercase tracking-[0.14em] text-white/40">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</div>
      {hint ? <div className="mt-1 text-[11px] text-white/40">{hint}</div> : null}
    </div>
  );
}

export function Pill({
  children,
  tone = "muted",
  title,
}: {
  children: ReactNode;
  tone?: "muted" | "good" | "bad" | "warn" | "info" | "accent";
  title?: string;
}) {
  const map: Record<string, string> = {
    muted: "border-[#333] bg-[#1f1f1f] text-white/60",
    good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    bad: "border-red-500/30 bg-red-500/10 text-red-400",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    info: "border-sky-500/30 bg-sky-500/10 text-sky-400",
    accent: "border-[#E8924C]/40 bg-[#E8924C]/10 text-[#E8924C]",
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${map[tone]}`}
    >
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-[#2f2f2f] px-4 py-10 text-center text-sm text-white/40">
      {children}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-white/40">
      <Loader2 className="h-4 w-4 animate-spin text-[#E8924C]" />
      {label}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs text-red-400"
    >
      {message}
    </div>
  );
}

/** Thin wrapper so every table in the console scrolls instead of squashing. */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[640px] border-collapse text-left text-xs">
        {children}
      </table>
    </div>
  );
}

export function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap border-b border-[#2a2a2a] pb-2 pr-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35 ${right ? "text-right" : ""}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  right,
  className = "",
}: {
  children: ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`border-b border-[#232323] py-2.5 pr-3 align-top text-white/70 ${right ? "text-right" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

/** A small status chip driven by the submission/campaign status strings. */
export function StatusPill({ status }: { status: string }) {
  const tone =
    status === "paid" || status === "approved" || status === "LIVE"
      ? "good"
      : status === "rejected" || status === "ENDED"
        ? "bad"
        : status === "reviewing" || status === "FILLING"
          ? "info"
          : "warn";
  return <Pill tone={tone}>{status}</Pill>;
}
