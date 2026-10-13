import { Connection, PublicKey, clusterApiUrl, type Commitment } from "@solana/web3.js";

/**
 * Solana connection setup, with a provider chain.
 *
 * ## The chain
 *
 * Server-side reads are attempted in order, stopping at the first provider that answers:
 *
 *   1. **Helius**     — primary. Keyed, server-only (`HELIUS_API_KEY`).
 *   2. **Alchemy**    — backup. Keyed, server-only (`ALCHEMY_RPC_URL` or `ALCHEMY_API_KEY`).
 *   3. **Public RPC** — last resort, unkeyed. Kept because it is the one endpoint that still works
 *                       when a key is missing, rotated or rate-limited, which is exactly when
 *                       someone is staring at an error page.
 *
 * A *fallback* is logged (server logs only) whenever a provider other than the primary serves the
 * request, so silently-degraded Helius shows up as a log line rather than as mysterious latency.
 * Counters for the same thing are exposed to the admin console.
 *
 * ## Two connections, deliberately separated
 *
 *   getServerConnection()  — the head of the chain (Helius, else Alchemy, else public). Used by API
 *                            routes for balances, transaction lookups and sending transactions.
 *                            No key is ever read with a `NEXT_PUBLIC_` prefix, so none can be
 *                            inlined into the browser bundle.
 *
 *   getPublicConnection()  — an unkeyed public RPC. Used in the browser, and by Privy's embedded
 *                            wallets to build/broadcast transactions. No credential to steal.
 *
 * If you later want Helius or Alchemy in the browser too, do NOT expose a key: add a route that
 * proxies JSON-RPC and point `NEXT_PUBLIC_SOLANA_RPC_URL` at it.
 *
 * Note on SDKs: `@solana/web3.js` (this module) handles RPC and transactions;
 * `@solana/spl-token` builds token instructions; `@solana/kit` is the newer SDK that
 * Privy's Solana connectors use internally. They coexist — use this one for
 * server-side chain work.
 */

const trimmed = (value: string | undefined): string => (value ?? "").trim();

export type SolanaClusterName = "devnet" | "mainnet-beta";

/** Cluster the app operates on. Follows the same env var as the rest of the app. */
export const SOLANA_CLUSTER_NAME: SolanaClusterName =
  trimmed(process.env.NEXT_PUBLIC_SOLANA_CLUSTER) === "mainnet-beta"
    ? "mainnet-beta"
    : "devnet";

/** Helius key. Server-only — never read with a NEXT_PUBLIC_ prefix. */
export const HELIUS_API_KEY = trimmed(process.env.HELIUS_API_KEY);

export const isHeliusConfigured = HELIUS_API_KEY.length > 0;

/** Helius JSON-RPC endpoint for the active cluster, or `""` when unconfigured. */
export function getHeliusRpcUrl(cluster: SolanaClusterName = SOLANA_CLUSTER_NAME): string {
  if (!isHeliusConfigured) return "";
  const host = cluster === "mainnet-beta" ? "mainnet" : "devnet";
  return `https://${host}.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
}

/**
 * Alchemy endpoint, as a full URL when one is configured.
 *
 * `ALCHEMY_RPC_URL` wins when set, because the Alchemy dashboard hands out a complete URL and
 * pasting it is both less error-prone and resilient to the host format changing. `ALCHEMY_API_KEY`
 * is the shorthand: it builds the documented Solana host, so a key alone is enough.
 *
 * Server-only. Alchemy is used here as the *backup*, so nothing breaks when this is unset — the
 * chain simply skips it.
 */
export const ALCHEMY_RPC_URL_EXPLICIT = trimmed(process.env.ALCHEMY_RPC_URL);
export const ALCHEMY_API_KEY = trimmed(process.env.ALCHEMY_API_KEY);

export function getAlchemyRpcUrl(cluster: SolanaClusterName = SOLANA_CLUSTER_NAME): string {
  if (ALCHEMY_RPC_URL_EXPLICIT) return ALCHEMY_RPC_URL_EXPLICIT;
  if (!ALCHEMY_API_KEY) return "";
  const host = cluster === "mainnet-beta" ? "solana-mainnet" : "solana-devnet";
  return `https://${host}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
}

export const isAlchemyConfigured = getAlchemyRpcUrl().length > 0;

/** Browser-safe RPC. Falls back to the public cluster endpoint. */
export const PUBLIC_RPC_URL =
  trimmed(process.env.NEXT_PUBLIC_SOLANA_RPC_URL) || clusterApiUrl(SOLANA_CLUSTER_NAME);

/** Default confirmation level: "confirmed" is the right balance of speed and safety. */
export const DEFAULT_COMMITMENT: Commitment = "confirmed";

export type RpcProvider = "helius" | "alchemy" | "public";

export interface RpcEndpoint {
  provider: RpcProvider;
  url: string;
}

/**
 * The ordered provider chain for server-side reads.
 *
 * Only configured providers are included, and the unkeyed public endpoint is always last, so the
 * chain can never be empty — a chain that could be empty would force every caller to handle a case
 * that cannot usefully be handled.
 */
export function rpcEndpoints(cluster: SolanaClusterName = SOLANA_CLUSTER_NAME): RpcEndpoint[] {
  const endpoints: RpcEndpoint[] = [];

  const helius = getHeliusRpcUrl(cluster);
  if (helius) endpoints.push({ provider: "helius", url: helius });

  const alchemy = getAlchemyRpcUrl(cluster);
  if (alchemy) endpoints.push({ provider: "alchemy", url: alchemy });

  if (!endpoints.some((endpoint) => endpoint.url === PUBLIC_RPC_URL)) {
    endpoints.push({ provider: "public", url: PUBLIC_RPC_URL });
  }

  return endpoints;
}

const connections = new Map<string, Connection>();

function connectionFor(endpoint: RpcEndpoint): Connection {
  const existing = connections.get(endpoint.url);
  if (existing) return existing;
  const created = new Connection(endpoint.url, DEFAULT_COMMITMENT);
  connections.set(endpoint.url, created);
  return created;
}

/**
 * Server-side connection: the head of the chain.
 *
 * The contract is unchanged — callers that need "a Connection" keep working — but the endpoint is
 * now the first configured provider rather than Helius-or-public.
 */
export function getServerConnection(): Connection {
  return connectionFor(rpcEndpoints()[0]);
}

/** Read-only connection safe to call anywhere (no credentials). */
export function getPublicConnection(): Connection {
  return connectionFor({ provider: "public", url: PUBLIC_RPC_URL });
}

/** True when `value` is a valid base58 Solana address (mint, wallet or program). */
export function isValidSolanaAddress(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * True when `value` looks like a base58 transaction signature.
 *
 * A signature is 64 bytes, which is 87 or 88 base58 characters. The floor used to be 64, which
 * accepted strings that are not signatures at all — and because the RPC rejects those with
 * `Invalid param: WrongSize`, a bad input surfaced as a server error from whichever route was
 * checking it. Requiring the real length refuses them where the message can still be useful.
 */
export function isValidTxSignature(value: string | null | undefined): boolean {
  return (
    typeof value === "string" &&
    value.length >= 80 &&
    value.length <= 90 &&
    /^[1-9A-HJ-NP-Za-km-z]+$/.test(value)
  );
}

/** Explorer link for an address, transaction or token on the active cluster. */
export function explorerUrl(
  kind: "address" | "tx" | "token",
  value: string
): string {
  const base = `https://explorer.solana.com/${kind}/${value}`;
  return SOLANA_CLUSTER_NAME === "mainnet-beta" ? base : `${base}?cluster=devnet`;
}

export interface RpcFallbackStats {
  /** Operations run through the chain. */
  operations: number;
  /** Operations that were NOT served by the head of the chain. */
  fallbacks: number;
  /** How many operations each provider served. */
  served: Record<RpcProvider, number>;
  /** The most recent fallback, for "why is this slow" debugging. */
  lastFallback: { provider: RpcProvider; label: string; at: string } | null;
}

function emptyStats(): RpcFallbackStats {
  return {
    operations: 0,
    fallbacks: 0,
    served: { helius: 0, alchemy: 0, public: 0 },
    lastFallback: null,
  };
}

/**
 * Per-process counters. Module scope on purpose: they reset on redeploy, and they exist as a
 * debugging aid rather than as billing data.
 */
let rpcStats = emptyStats();

export function rpcFallbackStats(): RpcFallbackStats {
  return { ...rpcStats, served: { ...rpcStats.served } };
}

export function resetRpcFallbackStats(): void {
  rpcStats = emptyStats();
}

/**
 * Runs an RPC operation against the provider chain until one provider answers.
 *
 * `accept` decides what counts as an answer, and it exists because "did not throw" is not the same
 * as "knows the answer". `getParsedTransaction` and `getSignatureStatuses` both return an empty
 * result for a transaction a node has not indexed yet, and with a second provider configured that
 * empty result is a reason to ask someone else rather than a conclusion.
 *
 * The primary's error is what gets rethrown when every provider fails, because it describes the
 * configured primary path rather than a backup's unrelated problem.
 */
export async function withRpcFallback<T>(
  operation: (connection: Connection, provider: RpcProvider) => Promise<T>,
  options: { label?: string; accept?: (value: T) => boolean } = {},
): Promise<T> {
  const label = options.label ?? "rpc";
  const accept = options.accept ?? ((value: T) => value !== null && value !== undefined);
  const endpoints = rpcEndpoints();
  const primary = endpoints[0];

  rpcStats.operations += 1;

  let primaryError: unknown = null;
  let haveFirst = false;
  let first: T | undefined;

  for (const endpoint of endpoints) {
    let value: T;
    try {
      value = await operation(connectionFor(endpoint), endpoint.provider);
    } catch (error) {
      if (endpoint.provider === primary.provider) primaryError = error;
      // A backup's failure is not the story when the primary also failed, so keep walking.
      continue;
    }

    if (!haveFirst) {
      first = value;
      haveFirst = true;
    }

    if (accept(value)) {
      rpcStats.served[endpoint.provider] += 1;
      if (endpoint.provider !== primary.provider) {
        rpcStats.fallbacks += 1;
        rpcStats.lastFallback = {
          provider: endpoint.provider,
          label,
          at: new Date().toISOString(),
        };
        // Server logs only, and deliberately noticeable: a primary that is quietly failing is the
        // one thing nobody notices until payouts start behaving oddly.
        console.warn(
          `[rpc] ${label} was served by ${endpoint.provider} after ${primary.provider} did not answer`,
        );
      }
      return value;
    }
  }

  /*
   * Nobody accepted the result. Returning the first one keeps "the chain does not have this" — a
   * legitimate answer that becomes a `pending` in the funding flow — distinguishable from "the
   * chain could not be reached", which throws and becomes "could not reach Solana".
   */
  if (haveFirst) return first as T;
  throw primaryError ?? new Error(`No RPC provider answered ${label}`);
}

export interface SignatureStatusSummary {
  signature: string;
  /** A node has the transaction in its ledger. */
  found: boolean;
  /** Confirmed or finalized — the level the rest of the app treats as settled. */
  confirmed: boolean;
  /** On-chain and reverted: a real signature that moved nothing. */
  failed: boolean;
  slot: number | null;
  /** The raw error, kept for the failure reason shown to an operator. */
  error: unknown;
}

/**
 * Confirmation state for a batch of signatures, across the provider chain.
 *
 * One `getSignatureStatuses` call covers every signature, which is what makes this cheap enough to
 * run on the payout path. The `accept` rule asks the next provider when *none* of the signatures
 * were found: an empty status array means "this node has not seen it" as easily as it means "it
 * does not exist", and those two need opposite responses.
 */
export async function getSignatureStatusesChecked(
  signatures: string[],
  label = "getSignatureStatuses",
): Promise<SignatureStatusSummary[]> {
  if (signatures.length === 0) return [];

  return withRpcFallback(
    async (connection) => {
      const { value } = await connection.getSignatureStatuses(signatures, {
        searchTransactionHistory: true,
      });
      return value.map((status, index) => {
        const signature = signatures[index];
        if (!status) {
          return {
            signature,
            found: false,
            confirmed: false,
            failed: false,
            slot: null,
            error: null,
          };
        }
        const confirmed =
          status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized";
        const failed = status.err !== null && status.err !== undefined;
        return {
          signature,
          found: true,
          confirmed,
          failed,
          slot: status.slot ?? null,
          error: status.err ?? null,
        };
      });
    },
    { label, accept: (value) => value.some((entry) => entry.found) },
  );
}

export interface RpcHealth {
  /** Which provider answered — the head of the chain when everything is healthy. */
  source: RpcProvider;
  cluster: SolanaClusterName;
  slot: number;
  version: string | null;
  /** Every configured provider, in chain order. */
  chain: RpcProvider[];
  /** Fallback counters at the moment of the check. */
  stats: RpcFallbackStats;
}

/**
 * Native SOL balance in **lamports**, or `null` when the lookup fails.
 *
 * Named for the unit on purpose: `lib/solana/payments.ts` also exposes a `getSolBalance`,
 * and that one is denominated in SOL. Two same-named helpers returning different units is
 * a silent 1e9× mistake waiting to happen, so this one says what it returns.
 *
 * Goes through the chain, so a blip on the primary does not read as "this wallet is empty".
 */
export async function getSolanaBalanceLamports(address: string): Promise<number | null> {
  if (!isValidSolanaAddress(address)) return null;
  try {
    return await withRpcFallback(
      (connection) => connection.getBalance(new PublicKey(address), DEFAULT_COMMITMENT),
      { label: "getBalance" },
    );
  } catch {
    return null;
  }
}

/**
 * Round-trips the RPC to prove the chain actually works, and reports which provider answered.
 *
 * Used by health checks, by the admin treasury panel, and as the first thing to call when debugging
 * a chain issue.
 */
export async function getRpcHealth(): Promise<RpcHealth> {
  const endpoints = rpcEndpoints();
  let source: RpcProvider = endpoints[0].provider;

  const [slot, version] = await withRpcFallback(
    async (connection, provider) => {
      source = provider;
      return Promise.all([connection.getSlot(), connection.getVersion().catch(() => null)]);
    },
    { label: "health" },
  );

  return {
    source,
    cluster: SOLANA_CLUSTER_NAME,
    slot,
    version: version?.["solana-core"] ?? null,
    chain: endpoints.map((endpoint) => endpoint.provider),
    stats: rpcFallbackStats(),
  };
}
