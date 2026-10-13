import { isValidSolanaAddress } from "./connection";

/** The fields needed to work out where a creator gets paid. */
export interface PayoutDestinationSource {
  payoutWallet: string | null;
  walletAddress: string | null;
}

/**
 * Where a creator's money goes.
 *
 * The address they set on their profile wins. Their sign-in wallet is only a fallback, for
 * accounts that never set one.
 *
 * This used to live inline in each payout route and read `walletAddress` directly, so editing
 * the payout wallet on the profile silently did nothing — funds kept going to the sign-in
 * wallet. Resolving it in one place means the three callers cannot drift apart again.
 *
 * Returns `null` when neither address is usable. A transfer to a malformed address cannot be
 * reversed, so callers must refuse the payout rather than guess.
 */
export function resolvePayoutDestination(
  user: PayoutDestinationSource | null | undefined,
): string | null {
  if (!user) return null;

  const preferred = user.payoutWallet?.trim();
  if (preferred && isValidSolanaAddress(preferred)) return preferred;

  const fallback = user.walletAddress?.trim();
  if (fallback && isValidSolanaAddress(fallback)) return fallback;

  return null;
}
