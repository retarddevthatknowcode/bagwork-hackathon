import { PublicKey, type Connection } from "@solana/web3.js";

import { PUMP_SDK, feeSharingConfigPda, isSharingConfigEditable } from "@pump-fun/pump-sdk";

import { withRpcFallback } from "@/lib/solana/connection";

import { TOTAL_SHARE_BPS } from "./config";

/**
 * Proving a launch actually did what it claimed.
 *
 * The whole promise of this product is one sentence — *creator fees are locked to Bagwork, forever* —
 * and a signature in a database is not evidence of it. Anyone can write down a transaction hash. So a
 * launch is only marked `verified`, and only then turned into a bag, once the chain itself says so:
 * the coin's `sharing_config` is read back, its shareholder list is compared to what was intended, and
 * the config is checked to be permanently un-editable.
 *
 * The assertions are deliberately positive rather than "not wrong": a share must *be* the treasury at
 * exactly 100%, and the admin must *be* revoked. A config that merely fails to look broken is not good
 * enough when the consequence of being wrong is a coin whose fees permanently flow somewhere else.
 */

export interface LaunchVerification {
  ok: boolean;
  /** Why verification failed, phrased for the launcher. Null when it passed. */
  error: string | null;
  /** The share the treasurer actually holds, read off the chain. 0 when unverifiable. */
  feeShareBps: number;
  /** True when the chain confirms the split can never be changed again. */
  adminRevoked: boolean;
  /** Every shareholder address the config holds, for diagnostics. */
  shareholders: string[];
  /**
   * True when the *chain could not be read* rather than the launch being wrong.
   *
   * Worth separating: a coin whose lock is fine must not be reported as broken because a provider
   * had a bad minute, and the caller's response is different — retry, rather than tell the launcher
   * something is wrong with what they signed.
   */
  transient?: boolean;
}

function fail(error: string, transient = false): LaunchVerification {
  return { ok: false, error, feeShareBps: 0, adminRevoked: false, shareholders: [], transient };
}

/**
 * Reads the coin's fee-sharing config and checks it against what a Bagwork launch promises.
 *
 * `treasury` is the address the launch was *supposed* to lock to, passed in rather than assumed, so
 * this compares the chain against the deployment's own FEE treasury instead of against whatever the
 * config happens to contain. That distinction is the difference between "some split exists" and "our
 * treasury holds all of it".
 */
export async function verifyLaunch({
  connection,
  mint,
  treasury,
}: {
  connection: Connection;
  mint: string;
  treasury: string;
}): Promise<LaunchVerification> {
  let mintKey: PublicKey;
  let treasuryKey: PublicKey;
  try {
    mintKey = new PublicKey(mint);
    treasuryKey = new PublicKey(treasury);
  } catch {
    return fail("The launch could not be verified because an address was malformed.");
  }

  const configAddress = feeSharingConfigPda(mintKey);

  /*
   * Read through the provider chain, and report a total failure instead of throwing.
   *
   * This used to go straight at the head connection. One provider having a bad minute then threw
   * out of the verifier, and an unguarded throw in the route became a 500 with no error body —
   * which the wizard could only render as "Could not verify the launch", with the coin already
   * created and nothing for the launcher to act on. A verifier that cannot reach the chain has to
   * say exactly that, because the coin may be perfectly fine.
   */
  let accountInfo;
  try {
    accountInfo = await withRpcFallback((conn) => conn.getAccountInfo(configAddress, "confirmed"), {
      label: "getAccountInfo(feeSharingConfig)",
    });
  } catch {
    return fail(
      "The Solana RPC could not be reached to check this coin's fee lock. Nothing is wrong with " +
        "the launch — try again in a moment.",
      true,
    );
  }

  if (!accountInfo) {
    /*
     * No sharing config means step 2 of the launch never landed — the coin exists but its creator
     * fees still accrue to a plain wallet rather than to a locked split. Recorded as a failure rather
     * than a soft pass, because a bag built on it would be advertised as fee-funded while paying
     * nothing.
     */
    return fail(
      "This coin has no fee-sharing configuration on-chain, so its creator fees are not locked. " +
        "The launch did not complete.",
    );
  }

  let config;
  try {
    config = PUMP_SDK.decodeSharingConfig(accountInfo);
  } catch {
    // An account that will not decode is not this deployment's coin, whatever the address says.
    return fail("The fee-sharing configuration on-chain could not be read.");
  }

  const shareholders = config.shareholders.map((share) => share.address.toBase58());
  const treasuryShare = config.shareholders.find((share) =>
    share.address.equals(treasuryKey),
  );

  const adminRevoked = !isSharingConfigEditable({ sharingConfig: config });

  // Every failure below is reported with the actual numbers, because "fee lock failed" with no
  // detail is unactionable for whoever has to look into it.
  if (!treasuryShare) {
    return {
      ok: false,
      error:
        `Creator fees are locked to ${shareholders.join(", ") || "nobody"}, not to the Bagwork ` +
        `fee treasury. The launch was not accepted and no bag was created.`,
      feeShareBps: 0,
      adminRevoked,
      shareholders,
    };
  }

  if (treasuryShare.shareBps !== TOTAL_SHARE_BPS) {
    return {
      ok: false,
      error:
        `The Bagwork fee treasury holds ${treasuryShare.shareBps / 100}% of this coin's creator ` +
        `fees, not 100%. A bag would start advertising a budget it does not receive, so the launch ` +
        `was not accepted.`,
      feeShareBps: treasuryShare.shareBps,
      adminRevoked,
      shareholders,
    };
  }

  if (!adminRevoked) {
    return {
      ok: false,
      error:
        "The fee split is not permanent — the configuration can still be changed. Bagwork only " +
        `creates bags from launches whose fees cannot be redirected later, so this launch was not accepted.`,
      feeShareBps: treasuryShare.shareBps,
      adminRevoked,
      shareholders,
    };
  }

  return {
    ok: true,
    error: null,
    feeShareBps: treasuryShare.shareBps,
    adminRevoked,
    shareholders,
  };
}
