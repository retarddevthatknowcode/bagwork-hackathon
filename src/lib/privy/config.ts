/**
 * Shared Privy + Solana configuration.
 *
 * This module is imported by both client and server code. Only `NEXT_PUBLIC_*`
 * values are read here — Next.js inlines them at build time, so they are safe in
 * the browser bundle. The Privy App Secret is deliberately absent and is read
 * exclusively by `src/lib/auth/privy-server.ts` on the server.
 */

/**
 * Normalises a raw environment value: trimmed, and unquoted when it arrived wrapped.
 *
 * The quoting is load-bearing. `.env.example` writes every value quoted —
 * `NEXT_PUBLIC_PRIVY_APP_ID="cm…"` — which dotenv strips for a real `.env` file but a dashboard
 * text field does not. Pasted into a host's environment variables the quotes are stored literally,
 * so this module would publish `"cm…"`, quotes and all. Privy's SDK rejects exactly that during
 * `next build`'s prerender pass ("Cannot initialize the Privy provider with an invalid Privy app
 * ID"), and a provider that throws fails the *entire* deployment — so a copy-paste was enough to
 * take every route down at build time. Stripping a wrapping pair of matching quotes removes that
 * whole failure mode, and does nothing to a value that was never quoted.
 *
 * Exported because the two server modules read their secrets with the same normalisation; the
 * secrets themselves are still never read here (see the note at the top).
 */
export function envValue(raw: string | undefined): string {
  const bare = (raw ?? "").trim();
  return bare.replace(/^(["'])([\s\S]*)\1$/, "$2").trim();
}

/** Every value published by this module goes through {@link envValue}. */
const trimmed = envValue;

/**
 * The shape of a Privy App ID: `cm` followed by a CUID body.
 *
 * Checked, and this is the one place the check earns its keep. A `PrivyProvider` handed a value
 * that is not an App ID throws while `next build` is prerendering — "Cannot initialize the Privy
 * provider with an invalid Privy app ID", raised on `/_not-found`, before a single page is written —
 * and a throw in the prerender pass fails the **entire deployment**: Production keeps serving the
 * previous build while every commit after it stays red. A wrong value in an environment variable is
 * an operator mistake, not a reason to freeze deploys, so a value this far off is treated as "not
 * configured" instead: the provider is never mounted with it, the build completes, and the console
 * names the variable that needs fixing.
 *
 * Deliberately permissive — a false negative on a real App ID would be much worse than the problem
 * it solves — but strict enough for what actually gets pasted in by accident: an App Secret, a
 * quoted or truncated string, a placeholder. Both live App IDs match it.
 */
const APP_ID_SHAPE = /^cm[a-z0-9]{16,}$/i;

const rawPrivyAppId = trimmed(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

/**
 * Public Privy App ID. Empty string until `.env.local` is filled in, which is why
 * `isPrivyConfigured` exists — every Privy code path is gated behind it so the app
 * still boots (and typechecks) on a machine without credentials.
 */
export const PRIVY_APP_ID = APP_ID_SHAPE.test(rawPrivyAppId) ? rawPrivyAppId : "";

/** True once a real App ID is present. */
export const isPrivyConfigured = PRIVY_APP_ID.length > 0;

/**
 * A value *was* supplied and it is not a Privy App ID — a **misconfigured** deployment rather than
 * an unconfigured one, so the UI can say so instead of asking for a variable that is already filled
 * in (with the wrong thing).
 */
export const isPrivyAppIdMalformed = rawPrivyAppId.length > 0 && !isPrivyConfigured;

/**
 * The three platforms a creator can prove, and the Privy linked-account type each arrives as.
 *
 * There is **one** Privy app. Linking a social account is a link on the very same account that signs
 * in with a wallet: Privy's `useLinkAccount` adds it to the signed-in user, the handle is read back
 * from `user.linkedAccounts`, and it is stored against our own `User.socials`. A second app used to
 * do this, and it cost more than it bought — two Privy providers on one origin share a session, so
 * the second app was able to sign people out of bagwork. See `components/auth/auth-provider.tsx`.
 */
export const SOCIAL_VERIFY_PLATFORMS = ["x", "tiktok", "instagram"] as const;

export type SocialVerifyPlatform = (typeof SOCIAL_VERIFY_PLATFORMS)[number];

/** The `type` a linked social account carries in Privy's `user.linkedAccounts`. */
export const PRIVY_SOCIAL_ACCOUNT_TYPE: Record<SocialVerifyPlatform, string> = {
  x: "twitter_oauth",
  tiktok: "tiktok_oauth",
  instagram: "instagram_oauth",
};

/** True for one of the three platforms above; validates anything that arrives from a client. */
export function isSocialVerifyPlatform(value: unknown): value is SocialVerifyPlatform {
  return typeof value === "string" && (SOCIAL_VERIFY_PLATFORMS as readonly string[]).includes(value);
}

/**
 * A handle as stored: no `@`, no case, no surrounding space.
 *
 * Both halves must agree on this, because the server compares the handle the client claims against
 * the one Privy reports for the signed-in account — and two spellings of the same account would
 * otherwise look like a forgery.
 */
export function normalizeSocialHandle(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

/*
 * The second Privy app is gone: no second App ID, no second secret, no client id, no verify route.
 * Social linking runs on the signup app — the one that already signs the user in.
 */

/**
 * Says out loud, once per process, that a supplied App ID was rejected — in the build log, in the
 * browser console, and in the server logs. Without this the only evidence of the mistake is a
 * deployment that quietly keeps serving an older build.
 */
if (isPrivyAppIdMalformed) {
  console.error(
    "[privy/config] NEXT_PUBLIC_PRIVY_APP_ID is set but is not a Privy App ID (expected the `cm…` " +
      "form). Treating it as unconfigured so the build can finish — fix the value in the " +
      "deployment's environment variables.",
  );
}



/*
 * Login is **wallet-only** — in this code and in the Privy Dashboard.
 *
 * The product is wallet-first: one action gives someone an account *and* the wallet that signs
 * their launches and receives their payouts, and the launch flow cannot do anything at all without
 * a signing wallet. So there is no email, SMS or social door here — signing in stays a wallet.
 *
 * Linking a social account is a separate, optional, *manual* act on an account that already exists:
 * see `SOCIAL_VERIFY_PLATFORMS` above. It runs on this same Privy app, and the operator must enable
 * those providers for linking in the dashboard without turning them on as login methods.
 *
 * `loginMethods` is per-app, not per-user, so the login half is an app-wide decision — and it has
 * already been made in the dashboard: email, SMS and embedded wallets are disabled there. The client
 * config in `components/auth/auth-provider.tsx` matches it exactly (`loginMethods: ["wallet"]`).
 */

/**
 * Login is **wallet-only** — in this code and in the Privy Dashboard.
 *
 * The product is wallet-first: one action gives someone an account *and* the wallet that signs
 * their launches and receives their payouts, and the launch flow cannot do anything at all without
 * a signing wallet. So there is no email, SMS or social door here.
 *
 * `loginMethods` is per-app, not per-user, so this is an app-wide decision — and it has already
 * been made in the dashboard: email, SMS and embedded wallets are disabled there. The client config
 * in `components/auth/auth-provider.tsx` matches it exactly (`loginMethods: ["wallet"]`). The two
 * have to agree, because a mismatch only ever shows up as a modal offering a method the app then
 * refuses, or an account with no way back in.
 *
 * This replaces the old `NEXT_PUBLIC_PRIVY_WALLET_ONLY` flag, which defaulted to keeping email as a
 * secondary option. That flag is gone: the wallet is the account.
 */

export type SolanaCluster = "devnet" | "mainnet-beta";

/**
 * Cluster the app signs and pays out on.
 *
 * Accepts the several ways a mainnet value gets written — `mainnet`, `mainnet-beta`,
 * `solana:mainnet`, in any casing — because the old exact-string check for `"mainnet-beta"` turned
 * any other spelling into **devnet silently**. That failure is invisible in the UI and only shows
 * up as a wallet refusing to sign a transaction for the wrong cluster, which reads as "the transfer
 * button is broken". Anything unrecognised still falls back to devnet, which is the safe direction.
 */
export const SOLANA_CLUSTER: SolanaCluster = /^(solana:)?mainnet(-beta)?$/i.test(
  trimmed(process.env.NEXT_PUBLIC_SOLANA_CLUSTER),
)
  ? "mainnet-beta"
  : "devnet";

/**
 * CAIP-2 chain identifier. Privy keys its `config.solana.rpcs` map by this value,
 * so the RPC map and the cluster can never drift apart.
 */
export const SOLANA_CAIP2: "solana:mainnet" | "solana:devnet" =
  SOLANA_CLUSTER === "mainnet-beta" ? "solana:mainnet" : "solana:devnet";

/**
 * Canonical USDC mint for the active cluster.
 *
 * These two addresses are *the* USDC mints (Circle's), and they are the exact values in
 * Privy's own `SolanaUsdcAddressMap`. They are duplicated here as plain strings rather
 * than imported from `@privy-io/js-sdk-core`, because that package is a transitive
 * dependency of `@privy-io/react-auth` and importing it directly would break under a
 * hoisting change — and because this module is imported by Client Components, so it must
 * stay free of heavy SDK imports.
 *
 * Overridable per deployment with `NEXT_PUBLIC_USDC_MINT`, which is what a private
 * deployment or a mock-token testnet run would need.
 */
const USDC_MINT_BY_CLUSTER = {
  devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  "mainnet-beta": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
} as const;

export const USDC_MINT = trimmed(process.env.NEXT_PUBLIC_USDC_MINT) ||
  USDC_MINT_BY_CLUSTER[SOLANA_CLUSTER];

/** USDC uses 6 decimals on every cluster. Shown in the UI next to the mint address. */
export const USDC_DECIMALS = 6;

export const SOLANA_RPC_URL =
  trimmed(process.env.NEXT_PUBLIC_SOLANA_RPC_URL) ||
  (SOLANA_CLUSTER === "mainnet-beta"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com");

export const SOLANA_WS_URL =
  trimmed(process.env.NEXT_PUBLIC_SOLANA_WS_URL) ||
  (SOLANA_CLUSTER === "mainnet-beta"
    ? "wss://api.mainnet-beta.solana.com"
    : "wss://api.devnet.solana.com");

/** Explorer link for an address or transaction on the configured cluster. */
export function solanaExplorerUrl(
  kind: "address" | "tx",
  value: string
): string {
  const base = `https://explorer.solana.com/${kind}/${value}`;
  return SOLANA_CLUSTER === "mainnet-beta" ? base : `${base}?cluster=devnet`;
}

/** `7xKq...9QpZ` — display form of a wallet address for tight UI. */
export function truncateAddress(
  address: string | null | undefined,
  lead = 4,
  tail = 4
): string {
  if (!address) return "";
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}
