"use client";

import * as React from "react";
import {
  PrivyProvider,
  useIdentityToken,
  useLinkAccount,
  usePrivy,
  useUnlinkOAuth,
  type PrivyClientConfig,
} from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { useQueryClient } from "@tanstack/react-query";
import {
  PRIVY_APP_ID,
  PRIVY_SOCIAL_ACCOUNT_TYPE,
  SOCIAL_VERIFY_PLATFORMS,
  SOLANA_CAIP2,
  SOLANA_RPC_URL,
  SOLANA_WS_URL,
  isPrivyConfigured,
  normalizeSocialHandle,
  type SocialVerifyPlatform,
} from "@/lib/privy/config";
import { seedSocials, storeVerifiedSocial } from "@/lib/profile/hooks";

/**
 * The auth surface the rest of Bagwork consumes.
 *
 * Components use `useAuth()` instead of Privy's hooks directly, which guarantees one
 * thing: the shape is identical whether or not Privy credentials exist on the machine.
 * No component can crash `usePrivy()` on a fresh clone.
 */
export interface AuthState {
  /** Real Privy credentials are present. */
  configured: boolean;
  /** Privy finished restoring the session. Gate authenticated UI on this. */
  ready: boolean;
  authenticated: boolean;
  /** Privy DID (`did:privy:…`) — the value stored on `User.privyId`. */
  privyUserId: string | null;
  /** Solana wallet backing the session, embedded or externally connected. */
  walletAddress: string | null;
  /** True when `walletAddress` is a Privy embedded wallet, not an external one. */
  isEmbeddedWallet: boolean;
  login: () => void;
  logout: () => Promise<void>;
  /**
   * Opens Privy's modal to link an *additional* wallet to the signed-in account.
   *
   * Needed by publisher payouts: the bag's treasury is a specific wallet, and the
   * publisher has to have it connected before they can sign a transfer out of it.
   */
  linkWallet: () => void;
  /** Access token for `Authorization: Bearer …` calls to our own API routes. */
  getAccessToken: () => Promise<string | null>;
  /**
   * Privy identity token (JWT), refreshed automatically by the SDK.
   *
   * Sent to our own API as `X-Privy-Identity-Token`. It carries the user's linked
   * accounts — including the Solana wallet — and the server verifies it locally against
   * the app's JWKS, so the wallet address never has to be trusted from the client or
   * fetched over a second API round-trip.
   */
  identityToken: string | null;
  /**
   * Handles Privy has proven for the signed-in account, read from `user.linkedAccounts`.
   *
   * This is what Privy knows. `User.socials` on our own profile is what we have *stored*, and the two
   * are compared by the panel: a platform linked in Privy but not stored yet is simply waiting on the
   * store call that follows a link.
   */
  linkedSocials: Partial<Record<SocialVerifyPlatform, string>>;
  /** The platform whose link flow is open now, or whose handle is being stored. */
  socialLinkPending: SocialVerifyPlatform | null;
  /** How the last attempt ended, for the panel to report. Null when there is nothing to say. */
  socialLinkResult: { ok: boolean; message: string } | null;
  clearSocialLinkResult: () => void;
  /**
   * Starts Privy's link flow for one platform, on the signed-in account.
   *
   * Manual by construction: nothing calls this except a Verify / Re-verify button. A link flow changes
   * the user's own Privy account, so it must never be something a page does on its own.
   */
  linkSocial: (platform: SocialVerifyPlatform) => void;
  /**
   * Removes a platform's link from the Privy account, so removing a handle here leaves nothing behind.
   * Best-effort — see the bridge — and never touches login.
   */
  unlinkSocial: (platform: SocialVerifyPlatform) => Promise<void>;
  /**
   * Stores a handle Privy already holds for this account but that our own record is missing.
   *
   * The recovery path for a link that completed while the store call did not: the row says "linked,
   * not saved yet" and this is what saves it. Still manual — the user presses Save.
   */
  saveLinkedSocial: (platform: SocialVerifyPlatform) => Promise<void>;
}

const NOT_CONFIGURED: AuthState = {
  configured: false,
  ready: true,
  authenticated: false,
  privyUserId: null,
  walletAddress: null,
  isEmbeddedWallet: false,
  login: () => {},
  logout: async () => {},
  linkWallet: () => {},
  getAccessToken: async () => null,
  identityToken: null,
  linkedSocials: {},
  socialLinkPending: null,
  socialLinkResult: null,
  clearSocialLinkResult: () => {},
  linkSocial: () => {},
  unlinkSocial: async () => {},
  saveLinkedSocial: async () => {},
};

const AuthContext = React.createContext<AuthState>(NOT_CONFIGURED);

/** Current auth state. Safe to call from any Client Component. */
export function useAuth(): AuthState {
  return React.useContext(AuthContext);
}

/** Bagwork pays out on Solana only, so Solana is the only chain enabled. */
const solanaConnectors = toSolanaWalletConnectors();

const privyConfig: PrivyClientConfig = {
  appearance: {
    // Matches the app shell and the Bagwork accent so the modal reads as our UI.
    theme: "#0b0a07",
    accentColor: "#bdfe00",
    logo: "/bagwork-logo.png",
    showWalletLoginFirst: true,
    walletChainType: "solana-only",
    /*
     * Wallet-first copy, and now wallet-*only*. The wallet is the whole account here — it is the
     * signer for a launch, the address payouts go to, and the thing that survives a change of
     * device — so the message says exactly that and offers nothing else. Email and SMS are not
     * reachable: `loginMethods` below is wallet-only, matching the dashboard.
     */
    loginMessage:
      "Connect a Solana wallet to get started — your wallet is your account.",
    // Curate the modal to mainstream Solana wallets. Without this, Privy falls back to
    // WalletConnect's entire registry, which surfaces a long tail of obscure entries
    // ("AB Pay", "Alicebob Wallet", …) beside Phantom and Solflare.
    walletList: [
      "detected_solana_wallets",
      "phantom",
      "solflare",
      "backpack",
      "jupiter",
    ],
  },
  /*
   * Wallet-only, and deliberately the literal single-element list.
   *
   * The dashboard already has email, SMS and social disabled, so this is the code half of the same
   * decision rather than a local preference — the two must agree or the modal offers a method the
   * app refuses. There is no env knob any more, and no `login()` call passes options that could
   * re-enable email at the call site (every call is a bare `login()`).
   */
  loginMethods: ["wallet"],
  externalWallets: {
    solana: { connectors: solanaConnectors },
  },
  embeddedWallets: {
    /*
     * Embedded wallets are disabled in the dashboard, and there is nothing here that needs one: a
     * wallet-only login always arrives with an external Solana wallet, which is the signer for a
     * launch and the address payouts go to. `"off"` states that intent in code so the two never
     * drift — `createOnLogin` used to make a Privy wallet for anyone without one, which is a method
     * the dashboard no longer offers.
     */
    solana: { createOnLogin: "off" },
  },
  solana: {
    // Required by Privy's embedded-wallet transaction UIs — without RPC clients the
    // SDK cannot build or broadcast. Keyed by CAIP-2 so it tracks the env cluster.
    rpcs: {
      [SOLANA_CAIP2]: {
        rpc: createSolanaRpc(SOLANA_RPC_URL),
        rpcSubscriptions: createSolanaRpcSubscriptions(SOLANA_WS_URL),
        blockExplorerUrl: "https://explorer.solana.com",
      },
    },
  },
};

const EMBEDDED_WALLET_CLIENTS = new Set(["privy", "privy-v2"]);

/** The only wallet fields this app needs, read from the verified user's linked accounts. */
interface LinkedWallet {
  address: string;
  chainType: string;
  walletClientType?: string;
}

/**
 * Runtime guard for a Solana wallet linked account.
 *
 * Deliberately structural: `Privy`'s wallet unions are large discriminated types that
 * shift between releases, so this validates the three fields we actually depend on and
 * returns `null` for anything else (emails, socials, Ethereum wallets).
 */
function asSolanaWallet(account: unknown): LinkedWallet | null {
  if (!account || typeof account !== "object") return null;
  const candidate = account as Partial<LinkedWallet>;
  if (typeof candidate.address !== "string") return null;
  if (candidate.chainType !== "solana") return null;
  return {
    address: candidate.address,
    chainType: candidate.chainType,
    walletClientType: candidate.walletClientType,
  };
}

/**
 * Solana wallet for the session, preferring the embedded wallet — the one this app
 * creates and pays out to. Mirrors the preference in `lib/auth/session.ts` so the
 * client and server always agree on which address is "the" wallet.
 */
function pickSolanaWallet(user: ReturnType<typeof usePrivy>["user"]): LinkedWallet | null {
  const wallets = (user?.linkedAccounts ?? [])
    .map(asSolanaWallet)
    .filter((wallet): wallet is LinkedWallet => wallet !== null);
  return (
    wallets.find((wallet) => EMBEDDED_WALLET_CLIENTS.has(wallet.walletClientType ?? "")) ??
    wallets[0] ??
    null
  );
}

/** Display name per platform, for the sentences this bridge writes. */
const SOCIAL_LABEL: Record<SocialVerifyPlatform, string> = {
  x: "X",
  tiktok: "TikTok",
  instagram: "Instagram",
};

/** Privy's own provider id per platform, which is what `unlink` takes. */
const OAUTH_PROVIDER: Record<SocialVerifyPlatform, "twitter" | "tiktok" | "instagram"> = {
  x: "twitter",
  tiktok: "tiktok",
  instagram: "instagram",
};

/** Reads a linked account as one of ours, or null when it is not a social account we store. */
function readLinkedSocial(account: unknown): { platform: SocialVerifyPlatform; handle: string } | null {
  if (!account || typeof account !== "object") return null;
  const type = "type" in account && typeof account.type === "string" ? account.type : "";
  const platform = SOCIAL_VERIFY_PLATFORMS.find(
    (candidate) => PRIVY_SOCIAL_ACCOUNT_TYPE[candidate] === type,
  );
  if (!platform) return null;
  const raw = "username" in account && typeof account.username === "string" ? account.username : "";
  const handle = normalizeSocialHandle(raw);
  return handle ? { platform, handle } : null;
}

/** Every social handle Privy has for this user, by platform. */
function readLinkedSocials(user: ReturnType<typeof usePrivy>["user"]): Partial<Record<SocialVerifyPlatform, string>> {
  const found: Partial<Record<SocialVerifyPlatform, string>> = {};
  for (const account of user?.linkedAccounts ?? []) {
    const linked = readLinkedSocial(account);
    if (linked) found[linked.platform] = linked.handle;
  }
  return found;
}

/** The provider-side subject of a linked account, which is what `unlink` needs. */
function readLinkedSubject(
  user: ReturnType<typeof usePrivy>["user"],
  platform: SocialVerifyPlatform,
): string | null {
  const wanted = PRIVY_SOCIAL_ACCOUNT_TYPE[platform];
  for (const account of user?.linkedAccounts ?? []) {
    if (!account || typeof account !== "object") continue;
    const type = "type" in account && typeof account.type === "string" ? account.type : "";
    if (type !== wanted) continue;
    const subject = "subject" in account && typeof account.subject === "string" ? account.subject : "";
    if (subject) return subject;
  }
  return null;
}

/** Privy's failure message, or something plain, for a link that did not complete. */
function linkErrorMessage(error: unknown): string {
  const text =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/denied|cancel|closed|abort/i.test(text)) {
    return "That verification was cancelled. Nothing changed — you can try again.";
  }
  return text || "Could not open the verification page. Try again.";
}

/**
 * Bridges Privy's hooks into {@link AuthState}. Only ever mounted inside
 * `PrivyProvider`, which is what makes `usePrivy()` safe to call here.
 */
function AuthBridge({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, login, logout, getAccessToken, linkWallet } =
    usePrivy();
  const { identityToken } = useIdentityToken();
  const solanaWallet = React.useMemo(() => pickSolanaWallet(user), [user]);

  const queryClient = useQueryClient();
  const [socialLinkPending, setSocialLinkPending] = React.useState<SocialVerifyPlatform | null>(null);
  const [socialLinkResult, setSocialLinkResult] = React.useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  /** What Privy has proven for this account, by platform. */
  const linkedSocials = React.useMemo(() => readLinkedSocials(user), [user]);

  /**
   * Stores a handle the moment Privy says a link completed.
   *
   * The only place a handle is written, and it runs from the link flow's own success callback — never
   * from a page load — so opening settings can never link anything by itself.
   */
  const adopt = React.useCallback(
    async (account: unknown) => {
      const linked = readLinkedSocial(account);
      if (!linked) {
        setSocialLinkPending(null);
        setSocialLinkResult({
          ok: false,
          message: "That account linked, but no handle came back with it. Try another account.",
        });
        return;
      }

      try {
        const accessToken = await getAccessToken();
        const { socials } = await storeVerifiedSocial({
          platform: linked.platform,
          handle: linked.handle,
          accessToken,
          identityToken,
        });
        seedSocials(queryClient, socials);
        setSocialLinkResult({
          ok: true,
          message: `@${linked.handle} verified on ${SOCIAL_LABEL[linked.platform]}.`,
        });
      } catch (storeError) {
        setSocialLinkResult({
          ok: false,
          message:
            storeError instanceof Error ? storeError.message : "That account could not be stored.",
        });
      } finally {
        setSocialLinkPending(null);
      }
    },
    [getAccessToken, identityToken, queryClient],
  );

  const { linkTwitter, linkTiktok, linkInstagram } = useLinkAccount({
    onSuccess: ({ linkedAccount }) => void adopt(linkedAccount),
    onError: (error) => {
      setSocialLinkPending(null);
      setSocialLinkResult({ ok: false, message: linkErrorMessage(error) });
    },
  });

  const { unlink } = useUnlinkOAuth();

  const linkers = React.useMemo(
    () => ({ x: linkTwitter, tiktok: linkTiktok, instagram: linkInstagram }),
    [linkTwitter, linkTiktok, linkInstagram],
  );

  const linkSocial = React.useCallback(
    (platform: SocialVerifyPlatform) => {
      setSocialLinkResult(null);
      setSocialLinkPending(platform);
      linkers[platform]();
    },
    [linkers],
  );

  /**
   * Revokes the Privy link behind a handle we have removed.
   *
   * Best-effort on purpose: our own `User.socials` is what decides whether a submission can be
   * credited, and the panel clears that with a DELETE. Keeping the Privy account in step is a bonus,
   * so a failure here is reported rather than thrown — removal has already happened.
   */
  const unlinkSocial = React.useCallback(
    async (platform: SocialVerifyPlatform) => {
      const subject = readLinkedSubject(user, platform);
      if (!subject) return;
      try {
        await unlink({ provider: OAUTH_PROVIDER[platform], subject });
      } catch {
        setSocialLinkResult({
          ok: false,
          message:
            "Removed from Bagwork. Privy still has that link — remove it from your Privy account if you want it revoked there too.",
        });
      }
    },
    [unlink, user],
  );

  const clearSocialLinkResult = React.useCallback(() => setSocialLinkResult(null), []);

  /** Stores a link Privy already holds, for a row that never got stored. Manual by design. */
  const saveLinkedSocial = React.useCallback(
    async (platform: SocialVerifyPlatform) => {
      setSocialLinkPending(platform);
      const account = (user?.linkedAccounts ?? []).find(
        (candidate) => readLinkedSocial(candidate)?.platform === platform,
      );
      await adopt(account);
    },
    [user, adopt],
  );

  const value = React.useMemo<AuthState>(
    () => ({
      configured: true,
      ready,
      authenticated,
      privyUserId: user?.id ?? null,
      walletAddress: solanaWallet?.address ?? null,
      isEmbeddedWallet: EMBEDDED_WALLET_CLIENTS.has(
        solanaWallet?.walletClientType ?? ""
      ),
      login: () => login(),
      logout: () => logout(),
      linkWallet: () => linkWallet(),
      getAccessToken,
      identityToken,
      linkedSocials,
      socialLinkPending,
      socialLinkResult,
      clearSocialLinkResult,
      linkSocial,
      unlinkSocial,
      saveLinkedSocial,
    }),
    [
      ready,
      authenticated,
      user?.id,
      solanaWallet,
      login,
      logout,
      linkWallet,
      getAccessToken,
      identityToken,
      linkedSocials,
      socialLinkPending,
      socialLinkResult,
      clearSocialLinkResult,
      linkSocial,
      unlinkSocial,
      saveLinkedSocial,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Dev-only hint shown instead of a cryptic `usePrivy()` crash. Never in production. */
function PrivySetupNotice() {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-4 left-4 z-[100] max-w-sm rounded-lg border border-[#ffe70e]/40 bg-[#0b0a07]/95 px-4 py-3 font-mono text-[11px] leading-relaxed text-white/80 shadow-2xl backdrop-blur"
    >
      <span className="font-bold text-[#ffe70e]">PRIVY NOT CONFIGURED</span>
      <br />
      Add <code className="text-[#bdfe00]">NEXT_PUBLIC_PRIVY_APP_ID</code> +{" "}
      <code className="text-[#bdfe00]">PRIVY_APP_SECRET</code> to{" "}
      <code className="text-[#bdfe00]">.env.local</code> and restart{" "}
      <code className="text-[#bdfe00]">next dev</code>. Login stays disabled until then.
    </div>
  );
}

/**
 * Wraps the app in Privy when credentials exist. When they do not, it publishes the
 * inert {@link NOT_CONFIGURED} state instead so every `useAuth()` consumer keeps
 * working and the UI can render a real "auth unavailable" state.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (!isPrivyConfigured) {
    return (
      <AuthContext.Provider value={NOT_CONFIGURED}>
        {children}
        <PrivySetupNotice />
      </AuthContext.Provider>
    );
  }

  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
      <AuthBridge>{children}</AuthBridge>
    </PrivyProvider>
  );
}
