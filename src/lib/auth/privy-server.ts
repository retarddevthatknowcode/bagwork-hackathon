import { PrivyClient } from "@privy-io/node";
import { PRIVY_APP_ID, envValue } from "@/lib/privy/config";

/**
 * Server-only Privy client.
 *
 * This is the only module in the app that touches `PRIVY_APP_SECRET`. The secret
 * authenticates the backend to Privy's API and validates the tokens that arrive on
 * incoming requests, so it must never be imported into a Client Component.
 */

/** The App Secret, or an empty string when it has not been configured yet. */
export function getAppSecret(): string {
  // Same normalisation the public values get: a secret pasted into a host's dashboard with
  // `.env.example`'s quotes still around it would otherwise be sent to Privy wrapped and refused.
  return envValue(process.env.PRIVY_APP_SECRET);
}

/**
 * True when both halves of the credential pair are present. Routes call this to
 * tell "auth is not set up on this machine" apart from "this request is unauthenticated".
 */
export function isServerAuthConfigured(): boolean {
  return PRIVY_APP_ID.length > 0 && getAppSecret().length > 0;
}

let cached: PrivyClient | null = null;

/**
 * Lazily-built singleton, mirroring the `db` pattern in `src/lib/db.ts` — one
 * client per process, created on first use, `null` when credentials are absent.
 */
export function getPrivyServer(): PrivyClient | null {
  if (!isServerAuthConfigured()) return null;
  cached ??= new PrivyClient({ appId: PRIVY_APP_ID, appSecret: getAppSecret() });
  return cached;
}

/**
 * NOTE (Sept 2026, corrected): there is intentionally no *raw-fetch* "get user by DID" helper
 * here, because Privy's legacy `GET /api/v1/apps/{appId}/users/{userId}` endpoint returns
 * **405 Method not allowed** to Node's global `fetch` (which speaks HTTP/1.1), while the same
 * request returns 200 from an HTTP/2 client such as curl. A helper built on that URL fails
 * silently in production — it did, for a while, and every new signup was stored with
 * `walletAddress: null`.
 *
 * That is a fact about **that path**, not about "fetch the user by id" in general: the SDK's own
 * `client.users()._get(did)` calls `GET /v1/users/{id}` — a different endpoint that answers
 * normally over HTTP/1.1 (verified against this app's live credentials). `session.ts` uses it as
 * the fallback when the identity token carries no linked accounts, so the Solana wallet is
 * persisted on login whether or not identity tokens are enabled in the dashboard.
 *
 * The preferred way to read a user's linked accounts from a browser request remains the
 * **identity token**, which the client sends and which the SDK verifies locally against the
 * app's JWKS (`/api/v1/apps/{appId}/jwks.json` — which also works over HTTP/1.1).
 * See `verifyRequestIdentity` in `./session.ts`.
 */

