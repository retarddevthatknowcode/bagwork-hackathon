/**
 * The shared vocabulary of the ops/bug-report system.
 *
 * This module is deliberately dependency-free so both the server helpers and the client
 * ("Report bug") form can import it. The DB stores plain strings, so every value that reaches
 * `OpsReport` is funnelled through one of the guards below rather than trusted from a request.
 */

/** Where a row came from. `USER_REPORT` is always forced server-side; it is never client-settable. */
export const OPS_SOURCES = ["USER_REPORT", "SYSTEM"] as const;
export type OpsSource = (typeof OPS_SOURCES)[number];

export const OPS_SEVERITIES = ["info", "warning", "error", "critical"] as const;
export type OpsSeverity = (typeof OPS_SEVERITIES)[number];

export const OPS_CATEGORIES = [
  "ui",
  "api",
  "wallet",
  "payout",
  "review",
  "launch",
  "rate_limit",
  "other",
] as const;
export type OpsCategory = (typeof OPS_CATEGORIES)[number];

export const OPS_STATUSES = ["open", "acknowledged", "resolved"] as const;
export type OpsStatus = (typeof OPS_STATUSES)[number];

/** Human labels for the user-facing dropdown. */
export const OPS_CATEGORY_LABELS: Record<OpsCategory, string> = {
  ui: "Look and feel",
  api: "Page failed to load",
  wallet: "Wallet / signing",
  payout: "Payment",
  review: "Content review",
  launch: "Coin launch",
  rate_limit: "Rate limit",
  other: "Something else",
};

/**
 * The categories a person may file under.
 *
 * `rate_limit` is excluded on purpose: it is something the platform observes about a caller,
 * not something a caller reports about the product.
 */
export const USER_REPORT_CATEGORIES: OpsCategory[] = [
  "ui",
  "api",
  "wallet",
  "payout",
  "review",
  "launch",
  "other",
];

/** Hard caps, shared by the route, the helper and the form's `maxLength`. */
export const OPS_MESSAGE_MAX = 2_000;
export const OPS_TITLE_MAX = 120;

export function isOpsCategory(value: unknown): value is OpsCategory {
  return typeof value === "string" && (OPS_CATEGORIES as readonly string[]).includes(value);
}

export function isUserCategory(value: unknown): value is OpsCategory {
  return typeof value === "string" && (USER_REPORT_CATEGORIES as readonly string[]).includes(value);
}

export function isOpsSeverity(value: unknown): value is OpsSeverity {
  return typeof value === "string" && (OPS_SEVERITIES as readonly string[]).includes(value);
}

export function isOpsSource(value: unknown): value is OpsSource {
  return typeof value === "string" && (OPS_SOURCES as readonly string[]).includes(value);
}

export function isOpsStatus(value: unknown): value is OpsStatus {
  return typeof value === "string" && (OPS_STATUSES as readonly string[]).includes(value);
}

/** Trim, collapse runs of whitespace, and clamp — the one normalisation everything shares. */
export function clampText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Like `clampText`, but keeps line breaks so a pasted stack/paragraph stays readable. */
export function clampMultiline(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").trim().slice(0, max);
}
