/** Base network fee for a plain legacy transaction (5000 lamports per signature). */
export const BASE_FEE_LAMPORTS = 5_000;

/** Wrapped SOL mint — the well-known, verifiable address used by the test seed. */
export const WSOL_MINT = "So11111111111111111111111111111111111111112";

/**
 * Burn address that provably cannot receive funds. Used as the stand-in treasury for
 * test data so a test campaign can never be mistaken for a live one.
 */
export const INCINERATOR_ADDRESS = "1nc1nerator11111111111111111111111111111111";
