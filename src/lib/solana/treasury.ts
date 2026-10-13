import { Keypair } from "@solana/web3.js";

import { base58Decode } from "./base58";

/**
 * The two Bagwork treasuries.
 *
 * One wallet per funding model, on purpose. A fixed-budget bag is filled by a single transfer from
 * the publisher; a flywheel bag is filled by a token's trading fees, deposit by deposit. Sharing
 * one address meant the two streams commingled and every downstream question — which wallet pays
 * this payout, whose history holds this deposit, which address a launchpad fee recipient must be
 * pointed at — had to be answered by hope. The split makes each answer structural:
 *
 *   - **FIXED** holds publisher budgets. Funding transfers land here and fixed-bag payouts leave
 *     from here (`TREASURY_FIXED_PRIVATE_KEY`).
 *   - **FEE** holds redirected trading fees. Fee detection watches this address, fee→USDC swaps
 *     sign with this key, and flywheel payouts leave from here (`TREASURY_FEE_PRIVATE_KEY`).
 *
 * ---- how they are funded ---------------------------------------------------------------
 *
 * Neither address has a budget of its own, and nothing in this codebase holds part of one back.
 * FIXED holds what publishers have transferred in; FEE holds what the coins' redirected creator
 * fees have accumulated, plus whatever an operator has topped up. A few dollars of seed SOL moves
 * into each at deployment for one reason only — so the very first sync and the very first swap can
 * pay their own network fees at all. That seed is a starting balance, **not a cap**: no code path
 * reserves it, compares a wallet against it, or refuses to spend past it.
 *
 * An outflow is judged on two live things and nothing else — does the wallet hold SOL for rent and
 * gas, and does it hold enough of the payout mint (`getSolBalance` / `getTokenBalance`) — plus, for
 * a creator payout, the paying bag's own budget (`lib/payouts/budget.ts`). Those are the checks
 * that matter, and all of them grow with the fees that keep arriving.
 *
 * Backward compatibility: the original single `TREASURY_PRIVATE_KEY` maps to the FIXED treasury, so
 * an existing deployment's funded bags stay payable after this change with no env edit at all. The
 * FEE wallet deliberately has *no* fallback — a flywheel that silently drew from the fixed wallet
 * would be exactly the mixing this module exists to prevent, so an unset FEE key fails closed and
 * says so.
 *
 * Keys are only ever read server-side. Only addresses are ever returned to a client, and only
 * through the guarded helpers below — never through a `NEXT_PUBLIC_` variable, because an address
 * that does not match the key means money nobody can move.
 */

export type TreasuryKind = "FIXED" | "FEE";

/** Parses the secret key in either format people actually paste. */
function parseSecretKey(raw: string): Keypair | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Solana CLI keypair files are a JSON array of 64 bytes; some wallets export base58.
  try {
    if (trimmed.startsWith("[")) {
      const bytes = JSON.parse(trimmed) as unknown;
      if (Array.isArray(bytes) && bytes.every((b) => typeof b === "number")) {
        return Keypair.fromSecretKey(Uint8Array.from(bytes as number[]));
      }
      return null;
    }
    const decoded = base58Decode(trimmed);
    return Keypair.fromSecretKey(decoded);
  } catch {
    return null;
  }
}

/**
 * One cached parse per wallet, not per env var name: the same key under two names must resolve to
 * one keypair, and a malformed value stays loudly malformed rather than being re-parsed per call.
 */
const keypairCache = new Map<string, Keypair | null>();

function envKeypair(cacheKey: string, varNames: string[]): Keypair | null {
  if (keypairCache.has(cacheKey)) return keypairCache.get(cacheKey) ?? null;

  let keypair: Keypair | null = null;
  for (const name of varNames) {
    const raw = (process.env[name] ?? "").trim();
    if (!raw) continue;
    keypair = parseSecretKey(raw);
    if (keypair) break;
    // Loud on purpose: a malformed key silently disabling payouts is far worse than a startup
    // error, because it surfaces as creators not getting paid with no obvious reason.
    console.error(`[treasury] ${name} is set but could not be parsed as a Solana keypair.`);
  }
  keypairCache.set(cacheKey, keypair);
  return keypair;
}

/** The fixed-budget treasury keypair — publisher budgets live here. Server-only. */
export function treasuryFixedKeypair(): Keypair | null {
  // The legacy single-treasury key maps here, so an existing deployment keeps working unchanged.
  return envKeypair("fixed", ["TREASURY_FIXED_PRIVATE_KEY", "TREASURY_PRIVATE_KEY"]);
}

/**
 * The fee-redirect treasury keypair — a token's trading fees land here and are swapped from here.
 * Server-only, and deliberately without a legacy fallback: see the module comment.
 */
export function treasuryFeeKeypair(): Keypair | null {
  return envKeypair("fee", ["TREASURY_FEE_PRIVATE_KEY"]);
}

/** The keypair for one of the two treasuries, or null when it is not (validly) configured. */
export function treasuryKeypairFor(kind: TreasuryKind): Keypair | null {
  return kind === "FEE" ? treasuryFeeKeypair() : treasuryFixedKeypair();
}

/**
 * The public address for one of the treasuries.
 *
 * Derived from the keypair when there is one, because the key that signs payouts and the address
 * publishers are told to fund must never drift apart. The `*_ADDRESS` variables exist only for the
 * rare case where an address is known but its key is held elsewhere (a hardware wallet, a multisig)
 * — then payouts from this wallet cannot be automatic, which `treasuryKeypairFor` reports by
 * returning null and the caller turns into a clear blocked reason.
 */
export function treasuryAddressFor(kind: TreasuryKind): string | null {
  const fromKey = treasuryKeypairFor(kind)?.publicKey.toBase58();
  if (fromKey) return fromKey;
  if (kind === "FEE") {
    return process.env.TREASURY_FEE_ADDRESS?.trim() || null;
  }
  return (
    process.env.TREASURY_FIXED_ADDRESS?.trim() ||
    process.env.TREASURY_WALLET_ADDRESS?.trim() ||
    null
  );
}

/** True when that treasury's address is known. Safe to call anywhere; reveals nothing else. */
export function isTreasuryConfiguredFor(kind: TreasuryKind): boolean {
  return treasuryAddressFor(kind) !== null;
}

/**
 * Every configured treasury address, FIXED first.
 *
 * Used by payout confirmation, which checks "the money left a Bagwork treasury" and should accept
 * either wallet rather than guessing which one an operator paid from.
 */
export function configuredTreasuryAddresses(): string[] {
  return (["FIXED", "FEE"] as const)
    .map((kind) => treasuryAddressFor(kind))
    .filter((address): address is string => address !== null);
}

/**
 * True when `address` is one of the Bagwork treasuries.
 *
 * This exists to keep a treasury from ever being treated as a launcher. The launch flow's whole
 * promise is that a coin is paid for by the launcher's own wallet and that the fee wallet only ever
 * *receives* — so a treasury sitting in the launcher slot is not a cosmetic mix-up, it is that flow
 * spending the money it exists to hold. Enforced on the client, so the page never presents a
 * treasury as a "dev wallet", and again on the server, so the guarantee does not depend on the
 * client having done it.
 *
 * The comparison lowercases both sides. Base58 is case-sensitive, which is exactly why a sloppy
 * comparison is dangerous here: a check that missed by case would silently allow the thing it
 * exists to refuse.
 */
export function isConfiguredTreasury(address: string | null | undefined): boolean {
  const value = (address ?? "").trim().toLowerCase();
  if (!value) return false;
  return configuredTreasuryAddresses().some(
    (treasury) => treasury.trim().toLowerCase() === value,
  );
}

/**
 * Which treasury a campaign's money belongs to.
 *
 * The persisted `treasuryKind` is authoritative: it was pinned at creation alongside the address,
 * so it survives any later change to `feeRedirectEnabled` semantics. Legacy rows predate the
 * column and all read "FIXED", so for those — and for anything without the column — the
 * `feeRedirectEnabled` flag decides, exactly as the migration rule states: existing campaigns are
 * FIXED unless fee redirect is on, in which case they are FEE.
 */
export function treasuryKindFor(campaign: {
  treasuryKind?: string | null;
  feeRedirectEnabled: boolean;
}): TreasuryKind {
  if (campaign.treasuryKind === "FEE") return "FEE";
  return campaign.feeRedirectEnabled ? "FEE" : "FIXED";
}
