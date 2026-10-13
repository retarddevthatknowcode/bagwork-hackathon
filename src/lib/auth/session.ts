/**
 * The bridge between Privy (identity) and our database (state).
 *
 * Rule this module enforces: a wallet address is only ever persisted when it came out
 * of a Privy-signed token. Nothing client-supplied is trusted, because `walletAddress`
 * is what payouts will be sent to.
 */
import { cookies, headers } from "next/headers";
import type { LinkedAccount, User as PrivyUser } from "@privy-io/node";
import { Prisma, type User } from "@prisma/client";
import { db } from "@/lib/db";
import {
  BAGWORKER_NUMBER_MAX,
  BAGWORKER_NUMBER_MIN,
  randomBagworkerNumber,
} from "@/lib/profile/points";
import {
  handleWithSuffix,
  randomHandle,
  randomHandleSuffix,
} from "@/lib/profile/handles";
import { isValidSolanaAddress } from "@/lib/solana/connection";
import { getPrivyServer } from "./privy-server";
/** Identity proven by a Privy token carried on the incoming request. */
export interface VerifiedIdentity {
  /** `did:privy:…` — stored verbatim on `User.privyId`. */
  privyUserId: string;
  walletAddress: string | null;
  isEmbeddedWallet: boolean;
  email: string | null;
  handle: string | null;
}

/** Privy mirrors both session tokens into same-origin readable cookies. */
const IDENTITY_TOKEN_COOKIE = "privy-id-token";
const ACCESS_TOKEN_COOKIE = "privy-token";
/** Header form, for non-browser clients holding an identity token. */
const IDENTITY_TOKEN_HEADER = "x-privy-identity-token";

/**
 * Attempts at landing a free random Bagworker number: one per possible collision before
 * falling back to a scan, and separately one per create retry.
 */
const PROFILE_NUMBER_ATTEMPTS = 10;

/**
 * Identity token first: it verifies locally against the app's JWKS and carries the
 * full user object (wallets, email, socials), so no Privy API round-trip is needed.
 */
async function readIdentityToken(): Promise<string | null> {
  const headerList = await headers();
  const fromHeader = headerList.get(IDENTITY_TOKEN_HEADER);
  if (fromHeader?.trim()) return fromHeader.trim();
  const cookieStore = await cookies();
  return cookieStore.get(IDENTITY_TOKEN_COOKIE)?.value?.trim() ?? null;
}

/** Access token: verifies cheaply, but identifies the user by DID only. */
async function readAccessToken(): Promise<string | null> {
  const headerList = await headers();
  const authorization = headerList.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();
    if (token) return token;
  }
  const cookieStore = await cookies();
  return cookieStore.get(ACCESS_TOKEN_COOKIE)?.value?.trim() ?? null;
}

type SolanaAccount = Extract<LinkedAccount, { chain_type: "solana" }>;

const isSolanaAccount = (account: LinkedAccount): account is SolanaAccount =>
  "chain_type" in account && account.chain_type === "solana" && "address" in account;

const isEmailAccount = (
  account: LinkedAccount
): account is Extract<LinkedAccount, { type: "email" }> => account.type === "email";

const isTwitterAccount = (
  account: LinkedAccount
): account is Extract<LinkedAccount, { type: "twitter_oauth" }> =>
  account.type === "twitter_oauth";

/**
 * Keeps only a real base58 Solana address.
 *
 * `walletAddress` and `payoutWallet` decide where money goes, so nothing that fails a public-key
 * check is ever allowed to become one. A linked Solana account from a verified Privy token is
 * already trustworthy — this is the belt to that braces: an address of any other shape (empty,
 * truncated, an Ethereum hex address that slipped into a `chain_type: "solana"` field) resolves to
 * `null`, which reads as "no wallet" everywhere rather than as a payout target.
 */
function asSolanaAddress(value: string | null | undefined): string | null {
  return value && isValidSolanaAddress(value) ? value : null;
}

/** Reads profile data out of a verified Privy user object. */
function toIdentity(user: PrivyUser): VerifiedIdentity {
  const accounts = user.linked_accounts ?? [];
  const solanaAccounts = accounts.filter(isSolanaAccount);
  // Prefer the embedded wallet: it is the one this app creates and controls.
  const embedded = solanaAccounts.find(
    (account) => "connector_type" in account && account.connector_type === "embedded"
  );
  const primary = embedded ?? solanaAccounts[0] ?? null;

  const email = accounts.find(isEmailAccount)?.address ?? null;
  const twitterHandle = accounts.find(isTwitterAccount)?.username ?? null;

  return {
    privyUserId: user.id,
    // Validated here, once, so every caller (session sync and the Privy webhook) gets the same
    // guarantee: a `walletAddress` that is not null is always a real Solana address.
    walletAddress: asSolanaAddress(primary?.address),
    isEmbeddedWallet: Boolean(embedded),
    email,
    handle: twitterHandle ?? (email ? email.split("@")[0] : null),
  };
}

/**
 * The full Privy user for a DID, read through the SDK's own API client.
 *
 * The wallet lives on the *user object*, not on either session token, so the only two ways to
 * learn a request's Solana address are (a) the identity token's `linked_accounts` claim, or
 * (b) asking Privy for the user. (a) is the fast path and is tried first. (b) is this — and it
 * is needed, because `linked_accounts` is only present when **"Return user data in an identity
 * token"** is switched on in the Privy dashboard; with it off, the identity token verifies but
 * carries no accounts, the parser throws, and this app used to fall straight through to the
 * access token, which knows the DID and nothing else. Every signup then landed in the database
 * with `walletAddress: null` and no default payout wallet.
 *
 * This used to be believed impossible: an older note in `privy-server.ts` said Privy's
 * user-by-id endpoint answers **405** to Node's HTTP/1.1 fetch. That is true of the legacy
 * `/v1/apps/{appId}/users/{userId}` path, but the SDK's `users()._get()` calls
 * `GET /v1/users/{id}` — a different endpoint that answers normally, verified against this
 * app's live credentials. So the address is fetched here, server-side, from the same
 * authenticated client that already verifies the tokens.
 *
 * Cached briefly per DID: this runs on the access-token path only (never once identity tokens
 * are on), and a wallet does not change between two requests a second apart. Failures are
 * cached for much less time so a transient Privy blip does not pin a user to "no wallet".
 */
const USER_CACHE_TTL_MS = 5 * 60 * 1000;
const USER_FAILURE_TTL_MS = 30 * 1000;
const privyUserCache = new Map<string, { user: PrivyUser | null; expiresAt: number }>();

async function fetchPrivyUser(
  privy: NonNullable<ReturnType<typeof getPrivyServer>>,
  privyUserId: string
): Promise<PrivyUser | null> {
  const cached = privyUserCache.get(privyUserId);
  if (cached && cached.expiresAt > Date.now()) return cached.user;

  let user: PrivyUser | null = null;
  try {
    user = await privy.users()._get(privyUserId);
  } catch (error) {
    console.error("[session] could not load the Privy user by id", {
      privyUserId,
      error: error instanceof Error ? error.message : error,
    });
  }

  privyUserCache.set(privyUserId, {
    user,
    expiresAt: Date.now() + (user ? USER_CACHE_TTL_MS : USER_FAILURE_TTL_MS),
  });
  return user;
}

/**
 * Verifies the request's Privy credentials. Returns `null` for anonymous, malformed,
 * expired, or unconfigured requests — callers treat all of those as "unauthorized".
 */
export async function verifyRequestIdentity(): Promise<VerifiedIdentity | null> {
  const privy = getPrivyServer();
  if (!privy) return null;

  /**
   * Preferred path: the identity token carries the user's linked accounts — including
   * the Solana wallet — and is verified locally against the app's JWKS, so no outbound
   * call is needed and nothing client-supplied is trusted.
   *
   * Deliberately NOT followed by a "look the user up by DID" fallback. Privy's
   * `GET /apps/{appId}/users/{userId}` endpoint answers **405 Method not allowed** to
   * Node's HTTP/1.1 fetch (verified directly: the same request returns 200 from an
   * HTTP/2 client such as curl). Such a fallback therefore fails silently in production
   * and persists a profile with `walletAddress: null`. Instead the client sends both
   * tokens, so the wallet always arrives inside a signed token.
   */
  const identityToken = await readIdentityToken();
  if (identityToken) {
    try {
      return toIdentity(await privy.utils().auth().verifyIdentityToken(identityToken));
    } catch {
      // Expired identity tokens are normal during a long session; fall through to the
      // access token so the request can still be attributed to a user.
    }
  }

  /**
   * Fallback: identify the user by DID, then read the user itself so the wallet is still
   * available. The access token alone carries no profile, so on its own it would persist
   * `walletAddress: null` — which is exactly what happened for every wallet signup before
   * `fetchPrivyUser` existed (see its comment). Reading the user makes this path complete.
   */
  const accessToken = await readAccessToken();
  if (!accessToken) return null;

  let privyUserId: string;
  try {
    const claims = await privy.utils().auth().verifyAccessToken(accessToken);
    if (!claims.user_id) return null;
    privyUserId = claims.user_id;
  } catch {
    return null;
  }

  const user = await fetchPrivyUser(privy, privyUserId);
  if (user && user.id === privyUserId) return toIdentity(user);

  // Privy did not answer (or answered for a different user). The request is still
  // authenticated, so attribute it — just without a wallet, exactly as before.
  return {
    privyUserId,
    walletAddress: null,
    isEmbeddedWallet: false,
    email: null,
    handle: null,
  };
}

/** How many suffixed candidates to try before falling back to a fresh pair. */
const HANDLE_ATTEMPTS = 20;

/**
 * A handle nobody else is using.
 *
 * `handle` has no unique index in the schema — it is a display name, not an identifier, and adding
 * one now would fail against accounts that already happen to share one. So this reads and checks
 * rather than relying on a constraint: the common case is one query, and an unlucky collision costs
 * a suffix instead of a failed signup. `Bagworker#` (`profileNumber`) is the identifier that really
 * is unique, and it is allocated separately in `createUserRow`.
 *
 * Suffixes count upwards from the candidate rather than re-rolling, because re-rolling can land on
 * the same collision repeatedly while counting cannot.
 */
async function allocateFreeHandle(): Promise<string> {
  const candidate = randomHandle();

  const take = async (value: string) =>
    (await db.user.findFirst({ where: { handle: value }, select: { id: true } })) === null;

  if (await take(candidate)) return candidate;

  for (let attempt = 2; attempt <= HANDLE_ATTEMPTS; attempt++) {
    const next = handleWithSuffix(candidate, attempt);
    if (await take(next)) return next;
  }

  // Every suffix of this pair is taken, which means the pool is genuinely busy. A random number on
  // a fresh pair is the least bad last resort, and it is still checked.
  const fallback = `${randomHandle()}${randomHandleSuffix()}`;
  return (await take(fallback)) ? fallback : `${fallback}${randomHandleSuffix()}`;
}

/**
 * A free 4-digit Bagworker number.
 *
 * Random rather than sequential on purpose: the number is public, and a low one would
 * advertise how early someone arrived. The existence check makes the common case a single
 * query; the unique index is the actual guarantee, and `createUserRow` retries on a clash.
 */
async function freeProfileNumber(): Promise<number> {
  for (let attempt = 0; attempt < PROFILE_NUMBER_ATTEMPTS; attempt++) {
    const candidate = randomBagworkerNumber();
    const taken = await db.user.findUnique({
      where: { profileNumber: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }

  // Ten random probes all hit existing numbers, so the pool is close to full. Scan it once
  // instead of retrying forever — at most 9,000 rows, and only on this rare path.
  const used = new Set(
    (await db.user.findMany({ select: { profileNumber: true } })).map(
      (row) => row.profileNumber,
    ),
  );
  for (let candidate = BAGWORKER_NUMBER_MIN; candidate <= BAGWORKER_NUMBER_MAX; candidate++) {
    if (!used.has(candidate)) return candidate;
  }

  throw new Error("Every Bagworker number is taken — widen the range in lib/profile/points.ts");
}

/**
 * True only when a `P2002` came from the Bagworker number index.
 *
 * Two shapes have to be accepted, because Postgres and the other providers disagree on what
 * `meta.target` holds: the field list (`profile_number` / `profileNumber`) and the violated
 * index name (`users_profile_number_key`). Matching only the field form meant that a genuine
 * two-signups-in-the-same-second race — the exact case the retry exists for — fell through to
 * a raw 500 instead of quietly picking another number. Underscores and case are stripped
 * first so all three spellings normalise to the same thing.
 */
function isProfileNumberConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? "")];
  return fields.some((field) => {
    const normalised = field.toLowerCase().replace(/_/g, "");
    return normalised === "profilenumber" || normalised.endsWith("profilenumberkey");
  });
}

/**
 * Creates the row, retrying only when the Bagworker number lost a race.
 *
 * Two people signing up in the same second can pick the same random number; that must cost
 * a retry, not a failed signup. A clash on `privyId` or `walletAddress` is a different
 * problem and is not swallowed here.
 */
async function createUserRow(
  data: Omit<Prisma.UserUncheckedCreateInput, "profileNumber">,
): Promise<User> {
  for (let attempt = 0; attempt < PROFILE_NUMBER_ATTEMPTS; attempt++) {
    try {
      return await db.user.create({
        data: { ...data, profileNumber: await freeProfileNumber() },
      });
    } catch (error) {
      if (!isProfileNumberConflict(error)) throw error;
    }
  }
  throw new Error("Could not allocate a Bagworker number");
}

/**
 * Materialises a verified Privy identity as a `User` row.
 *
 * Written as find-then-write rather than a bare `upsert` because both `privyId` and
 * `walletAddress` are unique: a row may already exist under either key, and matching
 * the wallet first keeps the link stable when someone connects before signing in.
 */
export async function syncUser(identity: VerifiedIdentity): Promise<User> {
  const byPrivyId = await db.user.findUnique({
    where: { privyId: identity.privyUserId },
  });

  if (byPrivyId) {
    // Never clear a stored wallet just because this token carried no profile data.
    const walletAddress = identity.walletAddress ?? byPrivyId.walletAddress;
    const handle = byPrivyId.handle ?? identity.handle;

    /*
     * Write only when a value actually changes.
     *
     * This used to update unconditionally on every authenticated request. Against the remote
     * pooler that is a second database round-trip — measured at ~920ms per statement — on every
     * single API call, plus a row lock taken to store exactly what was already in the row.
     * A steady-state session (the overwhelmingly common case) now costs one read.
     */
    /*
     * Fill in a payout wallet the account does not have yet.
     *
     * Someone who signed up with email has none. The moment they connect a Solana wallet, the
     * product should stop asking — the wallet they just proved they hold is the obvious place to be
     * paid, and a second question about it is exactly the friction this flow is meant to remove.
     *
     * This only fires while the field is empty, so it is a once-ever write rather than the
     * every-request write this function used to do — which, against the remote pooler, cost a
     * second round-trip and a row lock on every single authenticated call.
     */
    const payoutWallet = byPrivyId.payoutWallet ?? walletAddress ?? null;

    if (
      walletAddress === byPrivyId.walletAddress &&
      handle === byPrivyId.handle &&
      payoutWallet === byPrivyId.payoutWallet
    ) {
      return byPrivyId;
    }

    return db.user.update({
      where: { id: byPrivyId.id },
      data: { walletAddress, handle, payoutWallet },
    });
  }

  if (identity.walletAddress) {
    const byWallet = await db.user.findUnique({
      where: { walletAddress: identity.walletAddress },
    });
    if (byWallet) {
      return db.user.update({
        where: { id: byWallet.id },
        data: {
          privyId: identity.privyUserId,
          handle: byWallet.handle ?? identity.handle,
          // Same backfill as above: an account found by its wallet clearly has one, so it may as
          // well be paid there until the owner says otherwise.
          payoutWallet: byWallet.payoutWallet ?? identity.walletAddress,
        },
      });
    }
  }

  /*
   * The account is complete the moment it exists.
   *
   * `profileNumber` is assigned here and nowhere else, and three other defaults are filled in at
   * the same time, because a new user should never meet a form before they meet the product:
   *
   *   - **handle** — a random two-word name (`mooncat`, `solcrab92`) unless Privy supplied one.
   *     Editable later from the profile; asking for it up front was the first thing onboarding did,
   *     and the worst possible opening question.
   *   - **payoutWallet** — the wallet they just signed in with. There is no better answer available
   *     and no reason to ask for one.
   *   - **character** — deliberately left null. `resolveCharacter` derives a stable look from
   *     `profileNumber`, so an unset character is already a complete, consistent avatar rather than
   *     a placeholder. That is what makes "random defaults" free instead of a second thing to
   *     generate and store.
   *
   * `onboardingCompletedAt` is stamped for the same reason: there is no wizard left to finish, so
   * leaving the flag unset would mark a finished account as incomplete.
   */
  return createUserRow({
    privyId: identity.privyUserId,
    walletAddress: identity.walletAddress,
    handle: identity.handle ?? (await allocateFreeHandle()),
    payoutWallet: identity.walletAddress,
    onboardingCompletedAt: new Date(),
  });
}

/**
 * Materialises a Privy `user` object delivered by a webhook.
 *
 * The webhook payload carries the same `User` shape as the identity token, so it goes through the
 * exact same `syncUser` path — one place decides what a user row looks like, whether the identity
 * arrived on a request or in a signed Privy delivery. `toIdentity` validates the Solana address and
 * `syncUser` only backfills `payoutWallet` while it is empty, so a redelivered event (or a user who
 * has since chosen a different payout wallet) can never overwrite a choice.
 */
export async function syncUserFromPrivyUser(user: PrivyUser): Promise<User> {
  return syncUser(toIdentity(user));
}

/**
 * The one call every authenticated route needs: verify the request, then return the
 * database row for that user (`null` when unauthorized).
 */
export async function getSessionUser(): Promise<{
  identity: VerifiedIdentity;
  user: User;
} | null> {
  const identity = await verifyRequestIdentity();
  if (!identity) return null;
  const user = await syncUser(identity);
  return { identity, user };
}

