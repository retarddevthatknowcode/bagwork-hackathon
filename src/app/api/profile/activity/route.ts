import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { collectProfileActivity, parseActivityOffset } from "@/lib/profile/activity";
import { resolveBagworker } from "@/lib/profile/lookup";

/**
 * GET /api/profile/activity[?user=<handle|Bagworker#number>][&tz=<minutes>]
 *
 * The contribution calendar on a Profile header: how many contributions this Bagworker produced on
 * each of the last 365 days. One contribution = one submission activity (opt-in, post link,
 * approval) — `lib/profile/activity.ts` owns that counting, and the profile endpoint reads the same
 * function for the totals shown beside the calendar, so the two can never disagree.
 *
 * The only endpoint here that reads a row belonging to someone else, and it does so on purpose: the
 * calendar has to work when a visitor is looking at another creator's profile. What it exposes is a
 * count per day and the identity it belongs to — never a wallet, an email, or anything about the
 * submission itself. Without `?user=` it resolves the session user instead, so the same widget
 * serves both cases.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Resolve who the calendar is for: any Bagworker named by handle or `Bagworker#number`, or the
 * session user when no identifier is given. `resolveBagworker` owns the lookup, so the public
 * profile resolves exactly the same spellings.
 */
async function resolveTarget(raw: string | null) {
  if (raw) return resolveBagworker(raw);

  const session = await getSessionUser();
  return session
    ? {
        id: session.user.id,
        handle: session.user.handle,
        profileNumber: session.user.profileNumber,
      }
    : null;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const offset = parseActivityOffset(params.get("tz"));
  const requested = params.get("user");

  const target = await resolveTarget(requested);
  if (!target) {
    return requested
      ? NextResponse.json({ error: "No such Bagworker" }, { status: 404, headers: NO_STORE })
      : NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const activity = await collectProfileActivity(target.id, offset);

  return NextResponse.json(
    {
      user: { handle: target.handle, profileNumber: target.profileNumber },
      ...activity,
    },
    { headers: NO_STORE }
  );
}
