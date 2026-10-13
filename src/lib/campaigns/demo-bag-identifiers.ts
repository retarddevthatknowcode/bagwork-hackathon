/**
 * Which bags are demo data, and which of those may be deleted.
 *
 * Pure — no Prisma, no side effects, no imports — so the rule that decides what gets removed from a
 * live database can be read on its own and exercised without one. Everything the sweep
 * (`@/lib/campaigns/demo-bag-sweep`) does is driven by the predicates below; if they are wrong, the
 * wrong rows go. The sweep is reached two ways — `scripts/remove-demo-bags.ts` for a database you
 * have credentials for, and `POST /api/admin/demo-bags` for the one the running app is already
 * connected to — and both go through this file, so the two can never disagree about the rule.
 *
 * What was demo data, and where each one came from:
 *
 *   - **NOVA** and **EMBER** — two *fixed-budget* bags from the seed that used to live at
 *     `prisma/seed-test-campaigns.ts`: projects "Nova Protocol" (ticker NOVA, wrapped SOL) and
 *     "EmberSwap" (ticker EMBER, USDC), never funded, treasury the incinerator.
 *   - **$DEMO** — one *flywheel* (Fee Redirect) bag from the seed that used to live at
 *     `scripts/seed-demo-flywheel.ts`, on a project named "Demo Flywheel": title
 *     `DEMO — Flywheel bag: $DEMO trading fees fund this pot`, brief opening "DEMO DATA — not a real
 *     campaign". It also stood on a **deterministic mint** — the sha256 of a fixed string, base58
 *     encoded — which is the one identifier that nothing except that seed could ever have produced.
 *   - **CTST** — a fixed-budget bag made by hand through the app, briefed "Community test bag — try
 *     the announcement board". No seed and no code reference: a row in the database and nothing else.
 */

/** The tickers the seeds used. Matched case-insensitively. */
export const DEMO_SYMBOLS = ["NOVA", "EMBER", "DEMO"];

/**
 * The project names the seeds used, matched case-insensitively.
 *
 * `Solana Mobile` is here because the EMBER demo bag's project carried that name — it is a real
 * company's name, so it is only ever matched through the ownership guard below (`isUnowned`): a
 * project with that name that anyone actually owns is reported as SKIP and left alone.
 */
export const DEMO_NAMES = ["Nova Protocol", "EmberSwap", "Demo Flywheel", "Solana Mobile"];

/**
 * The flywheel demo's project mint.
 *
 * `base58(sha256("bagwork-demo-flywheel-project"))`, computed with the app's own encoder when the
 * seed was written. Written out as a literal rather than recomputed here on purpose: this module has
 * no imports, and a data value that can only have come from one seed is safer stated than derived.
 *
 * It is the sharpest matcher in this file. A project sitting on a mint nobody holds cannot be a real
 * publisher's bag, whatever its name or ticker says after an edit.
 */
export const DEMO_MINTS = ["ANxPAY7a9pU4s275Za8BHQ6M5gxNMigcFanzRmpzWiuW"];

/**
 * The demo campaign titles, matched exactly.
 *
 * Belt and braces: if a project row was renamed by hand, the campaigns it holds are still recognisably
 * the seeded ones, and an unowned bag with one of these exact titles is not something a person created.
 */
export const DEMO_TITLES = [
  "Show your first Nova swap — 60s clip contest",
  "Explain EmberSwap's fee split in your own words",
  "DEMO — Flywheel bag: $DEMO trading fees fund this pot",
];

/** The test bag's ticker, as it appears on its project row. */
export const TEST_TICKER = "CTST";

/**
 * Fragments of demo copy, matched case-insensitively against title, brief and project name.
 *
 * Fragments rather than whole sentences on purpose: these are strings typed by hand or by a seed, and
 * matching a punctuation mark is how a cleanup silently misses the row it was written for — a dash may
 * be an em dash, an en dash or a hyphen. Each fragment below is distinctive enough that no real
 * campaign contains it.
 */
export const DEMO_COPY_FRAGMENTS = [
  // The flywheel seed's own brief, which announces what it is.
  "demo data",
  "not a real campaign",
  "trading fees fund this pot",
  // The two seeded briefs, without their punctuation.
  "first nova swap",
  "fee split in your own words",
  // The hand-made test bag.
  "community test bag",
  "try the announcement board",
  "every post is scored for quality and authenticity",
];

/**
 * Whether this bag carries any of the demo identifiers at all — owner or no owner.
 *
 * The wider question than `shouldDelete`, and the one the verification asks: *would a visitor see a
 * demo bag?* A market feed is a public surface, so a row wearing a demo ticker matters to it whether
 * or not someone owns it. A real publisher's bag that merely inherited the ticker is therefore
 * reported here and left alone there.
 */
export function isDemoBag(campaign: DemoCandidate): boolean {
  if (isDemoCopy(campaign) || isTestTicker(campaign) || isDemoTicker(campaign)) return true;
  return DEMO_TITLES.some(
    (title) => title.toLowerCase() === campaign.title.trim().toLowerCase(),
  );
}

/** Nothing here belongs to a person: no owner, and no operator. */
export function isUnowned(campaign: {
  createdBy: string | null;
  createdByAdmin: boolean;
}): boolean {
  return campaign.createdBy === null && !campaign.createdByAdmin;
}

/** The columns the predicates below need. Nothing more, so a caller cannot pass the wrong shape. */
export interface DemoCandidate {
  title: string;
  description: string;
  createdBy: string | null;
  createdByAdmin: boolean;
  project: { tokenSymbol: string; name: string; tokenMint?: string | null };
}

/**
 * Copy that gives a demo away on its own.
 *
 * The deterministic mint the flywheel seed stood on, or words no real campaign contains. This is
 * evidence about the *bag*, not about its ticker, so nothing is preserved on the strength of an
 * owner: a row briefed "DEMO DATA — not a real campaign" is a demo whoever it belongs to.
 */
export function isDemoCopy(campaign: {
  title: string;
  description: string;
  project: { name: string; tokenMint?: string | null };
}): boolean {
  if (campaign.project.tokenMint && DEMO_MINTS.includes(campaign.project.tokenMint)) return true;

  const haystack = `${campaign.title}\n${campaign.description}\n${campaign.project.name}`
    .trim()
    .toLowerCase();
  return DEMO_COPY_FRAGMENTS.some((fragment) => haystack.includes(fragment));
}

/** A ticker only the operator's own test bag has ever used. */
export function isTestTicker(campaign: {
  project: { tokenSymbol: string };
}): boolean {
  return campaign.project.tokenSymbol.trim().toUpperCase() === TEST_TICKER;
}

/**
 * A ticker a seed used — and that a real coin may legitimately wear too.
 *
 * `fixedBags.ts`'s project-sharing bug is why this is not treated as proof on its own: a brand-new
 * real bag could inherit a demo project's ticker and render as NOVA or EMBER. Anything matched only
 * by these needs the ownership guard.
 */
export function isDemoTicker(campaign: {
  project: { tokenSymbol: string };
}): boolean {
  return DEMO_SYMBOLS.includes(campaign.project.tokenSymbol.trim().toUpperCase());
}

/**
 * Whether this bag may be deleted.
 *
 * Two strengths of evidence, because they are not equally strong:
 *
 *   - **Its own copy** (the demo mint, or text no real campaign contains) or the CTST ticker: deleted
 *     whatever its status and whoever owns it. Nobody writes "community test bag" into a campaign they
 *     are paying for.
 *   - **A seeded ticker alone** (NOVA / EMBER / DEMO): deleted only when no person and no operator owns
 *     it — exactly the shape the seeds produced, and the shape a real coin cannot have. A publisher's
 *     bag on a coin that happens to be called Nova is reported as SKIP and left alone.
 */
export function shouldDelete(campaign: DemoCandidate): boolean {
  if (isDemoCopy(campaign)) return true;
  if (isTestTicker(campaign)) return true;
  return isDemoTicker(campaign) && isUnowned(campaign);
}
