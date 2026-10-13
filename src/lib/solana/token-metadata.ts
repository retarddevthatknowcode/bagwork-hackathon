import { getMint } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

import { getTokenMetadata } from "@/lib/helius";
import { withRpcFallback } from "./connection";

/**
 * Everything the bag form needs to show about a token before someone budgets in it.
 *
 * `decimals` is the field that matters: every amount in the system is stored in whole token
 * units and multiplied by `10^decimals` at transfer time, so a wrong value makes payouts
 * wrong by orders of magnitude. It is therefore read from the mint account itself and never
 * inferred from the symbol.
 */
export interface ResolvedToken {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  logoUrl: string | null;
  /** True when `decimals` came from the mint account rather than from an indexer's cache. */
  decimalsVerifiedOnChain: boolean;
}

/**
 * Reads `decimals` straight from the mint account.
 *
 * Returns null when the address is not a mint at all (a wallet, a program, or nothing), which
 * is the signal that the publisher pasted the wrong kind of address.
 */
async function readMintDecimals(mint: string): Promise<number | null> {
  try {
    const info = await withRpcFallback((connection) =>
      getMint(connection, new PublicKey(mint)),
    );
    return info.decimals;
  } catch {
    return null;
  }
}

/**
 * Resolves a contract address into displayable metadata.
 *
 * Two sources, deliberately: Helius DAS supplies the name, symbol and logo, while the mint
 * account supplies `decimals`. The indexer's copy of decimals is a cache that can lag, and
 * the mint account is the only authority — so on-chain wins when both are available.
 *
 * Returns null when there is no mint at that address, so the caller can say "check the
 * address" instead of creating a bag denominated in a token that does not exist.
 */
export async function resolveToken(mint: string): Promise<ResolvedToken | null> {
  const [das, onChainDecimals] = await Promise.all([
    getTokenMetadata(mint).catch(() => null),
    readMintDecimals(mint),
  ]);

  if (onChainDecimals === null) return null;

  return {
    mint,
    // DAS is the only source of a human name; a mint account carries no symbol. Falling back
    // to an empty string lets the caller require the publisher to confirm what they pasted.
    name: das?.name || "",
    symbol: (das?.symbol || "").toUpperCase(),
    decimals: onChainDecimals,
    logoUrl: das?.logoUrl ?? null,
    decimalsVerifiedOnChain: true,
  };
}
