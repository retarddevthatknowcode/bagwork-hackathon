import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { logOpsEvent } from "@/lib/ops/log";
import { clientIp, takeToken } from "@/lib/ops/rate-limit";
import {
  clampMultiline,
  clampText,
  isUserCategory,
  OPS_MESSAGE_MAX,
  OPS_TITLE_MAX,
} from "@/lib/ops/types";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** 5 reports per hour — per account when signed in, otherwise per IP. */
const LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

/** Below this, a "report" carries no information and is almost always a mis-click. */
const MIN_MESSAGE = 10;

/**
 * POST /api/reports — file a bug.
 *
 * **Signed-in is preferred, not required.** Someone who cannot sign in is precisely the person
 * most likely to have something to report, so the endpoint works signed out and keys its rate
 * limit on the IP instead of the account.
 *
 * The client's `source` and `severity` are ignored outright: this route *always* writes
 * `USER_REPORT`, so a crafted body cannot drop a `SYSTEM`/`critical` row into the operator's feed
 * to make noise look like a platform failure.
 *
 * Nothing is returned but `{ ok: true }` — the reporter never sees a feed, a status or anyone
 * else's report.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();

  const key = session ? `user:${session.user.id}` : `ip:${clientIp(req.headers)}`;
  if (!takeToken(key, LIMIT, WINDOW_MS)) {
    // Record the flood once (the helper dedupes repeats) so an operator can see it, then refuse.
    void logOpsEvent({
      source: "SYSTEM",
      severity: "warning",
      category: "rate_limit",
      title: "Bug report rate limit hit",
      message: `More than ${LIMIT} reports in an hour from ${
        session ? "a signed-in account" : "a single IP"
      }.`,
      path: "/api/reports",
      userId: session?.user.id ?? null,
    });

    return NextResponse.json(
      { error: "You have sent a few already — please try again later." },
      { status: 429, headers: NO_STORE },
    );
  }

  const body = (await req.json().catch(() => null)) as
    | { message?: unknown; category?: unknown; path?: unknown }
    | null;

  const message = clampMultiline(body?.message, OPS_MESSAGE_MAX);
  if (message.length < MIN_MESSAGE) {
    return NextResponse.json(
      { error: "Tell us a little more about what went wrong." },
      { status: 400, headers: NO_STORE },
    );
  }

  // Unknown categories fall back to `other` rather than being rejected: the category is a
  // convenience for triage, not a contract worth failing a report over.
  const category = isUserCategory(body?.category) ? body.category : "other";
  const path = clampText(body?.path, 300) || null;

  // Derived, not asked for: the first line becomes the list title, the whole text the detail.
  const title = clampText(message.split("\n")[0], OPS_TITLE_MAX) || "User report";

  await logOpsEvent({
    source: "USER_REPORT",
    severity: "warning",
    category,
    title,
    message,
    path,
    userId: session?.user.id ?? null,
    userAgent: req.headers.get("user-agent"),
    meta: { signedIn: Boolean(session) },
  });

  return NextResponse.json({ ok: true }, { status: 201, headers: NO_STORE });
}
