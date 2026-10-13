import type { OpsCategory, OpsSeverity, OpsSource, OpsStatus } from "./types";

/**
 * The shape the admin board receives for one row.
 *
 * A dedicated mapper rather than returning the Prisma row directly, because three of the columns
 * are `Date` objects (JSON would serialise them anyway, but with no stated contract) and the
 * author's identity has to be folded in from the relation. Dates leave as ISO strings; `meta` is
 * passed through untouched — it was sanitised on the way *in*, so it is safe on the way out.
 */
export interface OpsReportView {
  id: string;
  createdAt: string;
  source: OpsSource | string;
  severity: OpsSeverity | string;
  category: OpsCategory | string;
  title: string;
  message: string;
  path: string | null;
  userId: string | null;
  /** The reporter's handle, when the account still exists. */
  handle: string | null;
  profileNumber: number | null;
  userAgent: string | null;
  meta: unknown;
  status: OpsStatus | string;
  adminNote: string | null;
  resolvedAt: string | null;
}

/** The subset of the row this mapper reads — kept structural so callers can select less. */
export interface OpsReportRow {
  id: string;
  createdAt: Date;
  source: string;
  severity: string;
  category: string;
  title: string;
  message: string;
  path: string | null;
  userId: string | null;
  userAgent: string | null;
  meta: unknown;
  status: string;
  adminNote: string | null;
  resolvedAt: Date | null;
  user?: { handle: string | null; profileNumber: number } | null;
}

export function toOpsReportView(row: OpsReportRow): OpsReportView {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    source: row.source,
    severity: row.severity,
    category: row.category,
    title: row.title,
    message: row.message,
    path: row.path,
    userId: row.userId,
    handle: row.user?.handle ?? null,
    profileNumber: row.user?.profileNumber ?? null,
    userAgent: row.userAgent,
    meta: row.meta,
    status: row.status,
    adminNote: row.adminNote,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

/** The relation selection both admin routes use, so a row always carries the same author shape. */
export const OPS_AUTHOR_SELECT = { user: { select: { handle: true, profileNumber: true } } };
