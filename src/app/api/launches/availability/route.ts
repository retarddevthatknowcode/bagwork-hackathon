import { NextResponse } from "next/server";

import { MAX_DEV_BUY_BPS, launchAvailability } from "@/lib/launch/config";

export const dynamic = "force-dynamic";

/**
 * GET /api/launches/availability — whether this deployment can launch, and why not if it cannot.
 *
 * Tiny on purpose. The launch page has to be able to say *before anyone fills in a form* that
 * launching is switched off, rather than letting someone write a whole brief and then meet a 503 at
 * the wallet prompt. The quote and build routes already refuse correctly; this exists so the refusal
 * can be shown at the top of the page instead of at the end of the effort.
 *
 * `flag` is the diagnosis. "Set it in the dashboard and it is still off" has three causes — the
 * variable is absent from *this* deployment, it is set to a value nothing accepts, or it was added
 * after the running deployment was built — and without this field they are indistinguishable from
 * outside. It reports only the *state* of a boolean switch: no value, no secret, nothing private.
 *
 * Unauthenticated, and it reveals nothing that is not already public: a boolean, the operator's
 * explanation, and the FEE treasury address — which `/api/treasury?kind=fee` already serves. The key
 * that signs from that address is never involved.
 */
export async function GET() {
  const availability = launchAvailability();

  return NextResponse.json(
    {
      enabled: availability.enabled,
      reason: availability.reason,
      treasury: availability.treasury,
      maxDevBuyBps: MAX_DEV_BUY_BPS,
      flag: availability.flag,
    },
    // Never cached: flipping the flag must take effect on the next page load, not in an hour.
    { headers: { "Cache-Control": "no-store" } },
  );
}

