import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Admin console auth.
 *
 * The password used to be a literal in this file and shipped in the
 * client bundle's route manifest — anyone who read the deployed JS, or this repository,
 * had full moderation rights. It now comes from `ADMIN_PASSWORD`, and with no value set
 * the console is closed rather than open.
 *
 * The session is a signed, expiring token rather than a constant. It used to be the literal
 * value `1`, which made the password check decoration: the cookie is client-controlled, so
 * anyone who set `bagwork_admin=1` had every admin route — approving submissions and sending
 * treasury payouts included — without ever knowing the password. The cookie is now
 * `<expiresAt>.<nonce>.<hmac>`: the signature is what makes it unforgeable, and the expiry is
 * what stops a leaked cookie working forever. Rotating `ADMIN_PASSWORD` invalidates every
 * existing session, which is the intended property.
 */
const COOKIE_NAME = "bagwork_admin";

/** How long a session lasts. Long enough for a working day, short enough that a leak ages out. */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * The key sessions are signed with.
 *
 * `ADMIN_SESSION_SECRET` when it is set, otherwise `ADMIN_PASSWORD` — so the deployment needs no
 * new variable to be safe, while a deployment that wants sessions to survive a password change can
 * set the separate one.
 */
function sessionSecret(): string {
  return (process.env.ADMIN_SESSION_SECRET ?? process.env.ADMIN_PASSWORD ?? "").trim();
}

function adminPassword(): string {
  return (process.env.ADMIN_PASSWORD ?? "").trim();
}

/** Constant-time compare so a wrong guess cannot be narrowed down by response timing. */
function matches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function signature(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("hex");
}

/** A fresh session token: an expiry, a random nonce, and an HMAC over both. */
function issueSessionToken(now = Date.now()): string {
  const expiresAt = String(now + SESSION_TTL_MS);
  const nonce = randomBytes(8).toString("hex");
  const payload = `${expiresAt}.${nonce}`;
  return `${payload}.${signature(payload)}`;
}

/**
 * True only when the cookie carries a token this server signed and it has not expired.
 *
 * Every rejection path returns `false` — missing cookie, wrong number of parts, non-numeric or
 * past expiry, failed signature — and no branch trusts the cookie's value itself. That is the
 * whole difference from the previous implementation, which returned true for the string `"1"`.
 */
function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [expiresAt, nonce, provided] = parts;
  const expires = Number(expiresAt);
  if (!Number.isFinite(expires) || expires <= Date.now()) return false;

  return matches(signature(`${expiresAt}.${nonce}`), provided);
}

export async function POST(req: NextRequest) {
  const expected = adminPassword();
  if (!expected) {
    return NextResponse.json(
      {
        error:
          "Admin access is disabled: set ADMIN_PASSWORD in the environment to enable it.",
      },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }
  if (!matches(expected, String(body.password))) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, issueSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    path: "/",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}

export function isAdmin(req: NextRequest): boolean {
  if (!sessionSecret()) return false;
  return verifySessionToken(req.cookies.get(COOKIE_NAME)?.value);
}
