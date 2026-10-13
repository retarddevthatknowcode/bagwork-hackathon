/**
 * The fixed-budget minimum, in one place.
 *
 * It lives in its own module — with no imports at all — because three different callers have to
 * agree on the number: the publisher's form (a Client Component, which must not drag the server's
 * Prisma and Solana code into the browser bundle), `POST /api/campaigns`, and the admin portal.
 *
 * It was previously written out twice: `MIN_BUDGET.USDC = 100` in the authoring rules and a bare
 * `100` literal in the form. Two copies of a limit is how a form lets someone through to a step the
 * API then refuses, so both now read this.
 */

/**
 * TESTING VALUE — deliberately $5, not the real minimum.
 *
 * Five dollars exists so the whole flow can be exercised with real money for the price of a coffee:
 * build the transfer, sign it in a wallet, verify it on-chain, and watch the bag go LIVE. Raise this
 * to `MIN_FIXED_BUDGET_USDC_AT_LAUNCH` once that has been done end to end on mainnet — at $5 a bag
 * pays for roughly one post, which is not a campaign budget anybody should be selling.
 *
 * Changing this line is the entire change: the form, the API and the admin portal all read it.
 */
export const MIN_FIXED_BUDGET_USDC = 5;

/**
 * The smallest budget worth creating in each token, in the token's own units.
 *
 * Expressed in the token's own units because the budget is: $100 of USDC and 1 SOL are both "a real
 * campaign", while 100 SOL is not the same thing at all. A custom token's price is unknowable here,
 * so it only has to be greater than zero.
 *
 * This table lives in this module — with the USDC minimum and nothing else around it — so the
 * publisher's form, the operator's form and the API can all read it without importing the Solana
 * SDK. `lib/campaigns/authoring.ts` re-exports it for the server routes that already import it.
 */
export const MIN_BUDGET: Record<string, number> = {
  USDC: MIN_FIXED_BUDGET_USDC,
  SOL: 1,
  CUSTOM: 0,
};


/** What the minimum becomes once testing is finished. Intentionally not wired up yet. */
export const MIN_FIXED_BUDGET_USDC_AT_LAUNCH = 100;
