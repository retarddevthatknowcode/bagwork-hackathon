import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  clampMultiline,
  clampText,
  OPS_MESSAGE_MAX,
  OPS_TITLE_MAX,
  type OpsCategory,
  type OpsSeverity,
  type OpsSource,
} from "./types";

/**
 * The one place a row is written to `ops_reports`.
 *
 * Two rules make this safe to call from anywhere:
 *
 *   1. **It never throws.** A failure to record that something failed must not become a second
 *      failure — both are wrapped, and the only trace of a logging problem is a `console.warn`.
 *   2. **It never stores a secret.** `meta` is filtered (key-named fields dropped, strings
 *      clamped) and the text fields are length-capped, so a raw error object or a request body
 *      cannot smuggle a key or a token into the operator's list.
 */
export interface OpsEventInput {
  /** Defaults to `SYSTEM`. The public route forces `USER_REPORT` and ignores anything sent. */
  source?: OpsSource;
  severity?: OpsSeverity;
  category: OpsCategory;
  /** Short summary shown in the list. */
  title: string;
  /** Full detail. Plain text; clamped to {@link OPS_MESSAGE_MAX}. */
  message: string;
  path?: string | null;
  userId?: string | null;
  userAgent?: string | null;
  /** Context only. Any key that looks like a credential is dropped before it is stored. */
  meta?: Record<string, unknown>;
}

/**
 * How close two SYSTEM events must be to count as the same one.
 *
 * A failing dependency does not fail once — it fails on every request until it recovers, and an
 * un-deduped list would be nothing but that one line. Same `title` + `path` inside this window is
 * recorded once.
 */
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

/** Field names that must never reach the database, whatever the caller passes. */
const SENSITIVE_KEY = /(private|secret|password|passwd|mnemonic|seed|bearer|authorization|api[_-]?key|cookie|credential|token)/i;

/** Nested objects/arrays are normalised with the same rules, up to these bounds. */
const MAX_META_KEYS = 20;
const MAX_META_DEPTH = 2;
const MAX_META_STRING = 400;

function redact(value: unknown, depth: number): unknown {
  if (value === null) return null;

  const kind = typeof value;
  if (kind === "number" || kind === "boolean") return value;
  if (kind === "string") {
    const text = value as string;
    return text.length > MAX_META_STRING ? text.slice(0, MAX_META_STRING) : text;
  }

  if (depth >= MAX_META_DEPTH) return undefined;

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_META_KEYS)
      .map((item) => redact(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (kind === "object") {
    return sanitizeMeta(value as Record<string, unknown>, depth + 1);
  }

  // functions, symbols, bigint, undefined — not storable and never worth guessing at.
  return undefined;
}

/** Drops credential-shaped keys and clamps everything else to something a JSON column can hold. */
function sanitizeMeta(input: Record<string, unknown> | undefined, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!input || typeof input !== "object") return out;

  let kept = 0;
  for (const [key, value] of Object.entries(input)) {
    if (kept >= MAX_META_KEYS) break;
    if (SENSITIVE_KEY.test(key)) continue;

    const clean = redact(value, depth);
    if (clean === undefined) continue;
    out[key] = clean;
    kept += 1;
  }
  return out;
}

/** One-line description of an unknown thrown value, without a stack. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return clampText(error.message, OPS_MESSAGE_MAX) || error.name;
  if (typeof error === "string") return clampText(error, OPS_MESSAGE_MAX);
  return "Unknown error";
}

/**
 * Records one event. Await it when the caller has nothing else to do; fire-and-forget
 * (`void logOpsEvent(...)`) when the response must not wait on it.
 */
export async function logOpsEvent(input: OpsEventInput): Promise<void> {
  try {
    const source: OpsSource = input.source === "USER_REPORT" ? "USER_REPORT" : "SYSTEM";
    const title = clampText(input.title, OPS_TITLE_MAX) || "Untitled event";
    const message = clampMultiline(input.message, OPS_MESSAGE_MAX) || title;

    /*
     * Dedupe SYSTEM noise only.
     *
     * A user's report is never collapsed: two people reporting the same thing is a signal, and
     * even one person filing twice is their business. A *system* event repeating is the one case
     * where every extra row is pure noise.
     */
    if (source === "SYSTEM") {
      const recent = await db.opsReport.findFirst({
        where: {
          source,
          title,
          path: input.path ?? null,
          createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
        },
        select: { id: true },
      });
      if (recent) return;
    }

    await db.opsReport.create({
      data: {
        source,
        severity: input.severity ?? "warning",
        category: input.category,
        title,
        message,
        path: input.path ? clampText(input.path, 300) : null,
        userId: input.userId ?? null,
        userAgent: input.userAgent ? clampText(input.userAgent, 300) : null,
        meta: sanitizeMeta(input.meta) as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    // Swallowed on purpose — logging is best-effort and must never break the request it logs.
    console.warn(
      "[ops] failed to record an event:",
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * The common call from an API route's `catch`: a `SYSTEM` error row with the request's own
 * context (method, path, status) attached, and nothing else from the request.
 */
export async function logApiFailure(
  req: NextRequest,
  args: {
    category: OpsCategory;
    title: string;
    error: unknown;
    /** Status the route is about to return. Defaults to 500. */
    status?: number;
    severity?: OpsSeverity;
    userId?: string | null;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  return logOpsEvent({
    source: "SYSTEM",
    severity: args.severity ?? "error",
    category: args.category,
    title: args.title,
    message: errorMessage(args.error),
    path: req.nextUrl.pathname,
    userId: args.userId ?? null,
    userAgent: req.headers.get("user-agent"),
    meta: {
      status: args.status ?? 500,
      method: req.method,
      ...args.meta,
    },
  });
}
