/**
 * Formatting helpers for the Bagwork console. Pure functions only — no React,
 * no design tokens — so they can be used on the server and the client.
 */

export function usd(value: number, opts: { compact?: boolean; cents?: boolean } = {}) {
  const { compact = false, cents = false } = opts;
  if (compact && Math.abs(value) >= 10_000) return `$${compactNumber(value)}`;
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })}`;
}

export function compactNumber(value: number) {
  if (Math.abs(value) >= 1_000_000)
    return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (Math.abs(value) >= 1_000)
    return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}K`;
  return `${Math.round(value)}`;
}

export function pct(value: number, digits = 0) {
  return `${value.toFixed(digits)}%`;
}

export function dateShort(iso: string | number | Date) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function dateMedium(iso: string | number | Date) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function dateTime(iso: string | number | Date) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "3d ago" · "in 2w" · "just now" */
export function relative(iso: string | number | Date) {
  const then = new Date(iso).getTime();
  const diff = then - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  const weeks = Math.round(days / 7);
  const value =
    mins < 1
      ? "just now"
      : mins < 60
        ? `${mins}m`
        : hours < 24
          ? `${hours}h`
          : days < 14
            ? `${days}d`
            : weeks < 9
              ? `${weeks}w`
              : `${Math.round(days / 30)}mo`;
  if (value === "just now") return value;
  return diff < 0 ? `${value} ago` : `in ${value}`;
}

/** Days until an ISO date — negative when already ended. */
export function daysLeft(iso: string | number | Date) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function countdownLabel(iso: string | number | Date) {
  const days = daysLeft(iso);
  if (days < 0) return "Ended";
  if (days === 0) return "Ends today";
  if (days === 1) return "1 day left";
  if (days < 14) return `${days} days left`;
  return `${Math.round(days / 7)} weeks left`;
}

/** 4Nd1mHk9…HxfB */
export function shortAddress(address: string, lead = 4, tail = 4) {
  if (!address) return "";
  if (address.includes("...") || address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

/**
 * SOL for a wallet chip: `1.234 SOL`, `<0.001 SOL` for dust, `0 SOL` for nothing.
 *
 * Three decimals is the readable ceiling — in a header a balance is a rough "can I pay the fee"
 * signal, not an accounting figure. Dust is stated rather than rounded to `0.000`, so a wallet that
 * holds a few thousand lamports does not look empty. A non-finite or negative value (a failed read
 * that slipped through) is treated as nothing rather than printed as `NaN SOL`.
 */
export function solAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 SOL";
  if (value < 0.001) return "<0.001 SOL";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 3 })} SOL`;
}

export function initials(value: string, max = 2) {
  return (value || "BW")
    .replace(/^@/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, max)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function growthPct(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}
