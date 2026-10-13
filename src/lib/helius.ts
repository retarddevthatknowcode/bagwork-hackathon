/**
 * Helius — Solana RPC + Digital Asset Standard (DAS) data, server-side only.
 *
 * The API key is read from `HELIUS_API_KEY` and deliberately never exposed with a
 * `NEXT_PUBLIC_` prefix. A key that is inlined into the browser bundle can be lifted
 * and burned by anyone, so anything keyed goes through this module on the server.
 *
 * What this is for: real token metadata (name, symbol, decimals, logo), fungible token
 * balances, NFTs, and transaction history — the data behind campaign tokens and creator
 * earnings. It complements (does not replace) the RPC that Privy's embedded wallets use
 * in the browser, which stays on a public endpoint for now.
 *
 * Docs: https://docs.helius.dev
 */

const HELIUS_API_KEY_INTERNAL = (process.env.HELIUS_API_KEY ?? "").trim();
/**
 * Server-only: the fee-redirect sync needs the key itself to call Helius's enhanced-transaction
 * API. Exported for server modules only — never reachable from a `NEXT_PUBLIC_` name.
 */
export const HELIUS_API_KEY = HELIUS_API_KEY_INTERNAL;

/** True once a Helius key is present; callers render an empty state otherwise. */
export const isHeliusConfigured = HELIUS_API_KEY.length > 0;

export type HeliusCluster = "devnet" | "mainnet";

/** Cluster to query. Follows the app's Solana cluster unless explicitly overridden. */
export const HELIUS_CLUSTER: HeliusCluster =
  (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet").trim() === "mainnet-beta"
    ? "mainnet"
    : "devnet";

/** JSON-RPC endpoint, used for standard Solana methods (getBalance, getTransaction…). */
export const HELIUS_RPC_URL = isHeliusConfigured
  ? `https://${HELIUS_CLUSTER === "mainnet" ? "mainnet" : "devnet"}.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : "";

/** A fungible token holding, normalised for the UI. */
export interface TokenHolding {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  /** Raw integer amount, as a string to avoid precision loss on large supplies. */
  rawAmount: string;
  /** Human-readable amount (rawAmount / 10^decimals). */
  amount: number;
  logoUrl: string | null;
}

/** Parameters accepted by the DAS `getAssetsByOwner` call. */
export interface AssetQueryOptions {
  /** Include fungible tokens, not just NFTs. Defaults to true. */
  fungibleOnly?: boolean;
  /** Maximum assets per page (Helius allows up to 1000; 100 is plenty here). */
  limit?: number;
  /** 1-based page number. */
  page?: number;
}

type DasResponse<T> = {
  result?: T;
  error?: { code: number; message: string };
};

type DasAsset = {
  id: string;
  content?: { metadata?: { name?: string; symbol?: string }; links?: { image?: string } };
  token_info?: { decimals?: number; balance?: number; symbol?: string };
};

/**
 * Low-level DAS call. Returns `null` on any failure (missing key, network, or a Helius
 * error) so callers can degrade gracefully instead of throwing into a render.
 */
async function dasRequest<T>(
  method: string,
  // JSON-RPC params may be positional (an array) or by-name (an object).
  params: Record<string, unknown> | unknown[]
): Promise<T | null> {
  if (!isHeliusConfigured) return null;

  try {
    const response = await fetch(HELIUS_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "bagwork", method, params }),
      // Asset metadata changes rarely; a short cache keeps the UI snappy and the
      // credit usage down. Next.js dedupes identical requests within this window.
      next: { revalidate: 60 },
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as DasResponse<T>;
    if (payload.error) {
      console.error(`[helius] ${method} failed: ${payload.error.message}`);
      return null;
    }
    return payload.result ?? null;
  } catch (error) {
    console.error(`[helius] ${method} request threw`, error);
    return null;
  }
}

/** Metadata for a single token mint (name, symbol, decimals, logo). */
export async function getTokenMetadata(mint: string): Promise<TokenHolding | null> {
  const asset = await dasRequest<DasAsset>("getAsset", { id: mint });
  if (!asset) return null;

  const decimals = asset.token_info?.decimals ?? 0;
  const raw = asset.token_info?.balance ?? 0;

  return {
    mint: asset.id,
    symbol: asset.token_info?.symbol ?? asset.content?.metadata?.symbol ?? "",
    name: asset.content?.metadata?.name ?? "",
    decimals,
    rawAmount: String(raw),
    amount: raw / 10 ** decimals,
    logoUrl: asset.content?.links?.image ?? null,
  };
}

/**
 * Fungible token holdings for a wallet — the basis for "your earned tokens" screens.
 * NFTs are filtered out unless `fungibleOnly` is explicitly disabled.
 */
export async function getWalletTokens(
  ownerAddress: string,
  options: AssetQueryOptions = {}
): Promise<TokenHolding[]> {
  const { fungibleOnly = true, limit = 100, page = 1 } = options;

  const result = await dasRequest<{ items?: DasAsset[] }>("getAssetsByOwner", {
    ownerAddress,
    page,
    limit,
    displayOptions: { showFungible: fungibleOnly },
  });

  const items = result?.items ?? [];

  return items
    .filter((asset) => Boolean(asset.token_info))
    .map((asset) => {
      const decimals = asset.token_info?.decimals ?? 0;
      const raw = asset.token_info?.balance ?? 0;
      return {
        mint: asset.id,
        symbol: asset.token_info?.symbol ?? asset.content?.metadata?.symbol ?? "",
        name: asset.content?.metadata?.name ?? "",
        decimals,
        rawAmount: String(raw),
        amount: raw / 10 ** decimals,
        logoUrl: asset.content?.links?.image ?? null,
      };
    });
}

/**
 * Native SOL balance in **lamports** (1 SOL = 1e9 lamports), or `null` when the lookup
 * fails.
 *
 * Named for the unit on purpose: `lib/solana/payments.ts` also exports a
 * `getSolBalance`, which returns SOL. Two same-named helpers returning different units
 * is a silent 1e9× mistake waiting to happen.
 */
export async function getLamportBalance(address: string): Promise<number | null> {
  const result = await dasRequest<{ value: number }>("getBalance", [address]);
  return result?.value ?? null;
}
