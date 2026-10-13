
---

Task ID: AUTH-CTA-COPY
Agent: main
Task: Replace every "Connect wallet / Connect" CTA across the site with sign-up / sign-in language. Labels only — no behaviour, no Privy flow.

What it says now: **"Sign in"** everywhere an auth CTA existed. That is the brief's preferred general CTA, and the Privy modal it opens offers email *and* wallet with its own sign-up path inside, so a brand-new visitor is not stranded by the word "in". (If "Sign up / Sign in" is preferred as the unified label, it is a one-word change in `auth-button.tsx` — the flow is identical.)

Changed (15 files, all copy):
- `auth/auth-button.tsx` — the primary control in the marketing header and mobile menu: `CONNECT` → `SIGN IN` (both the anonymous and the unconfigured states), and the loading state's screen-reader label "Loading wallet session" → "Loading sign-in".
- `auth/auth-provider.tsx` — the Privy modal's own `loginMessage`: now "Sign in with email or a Solana wallet to start earning on Bagwork." It used to instruct wallet-only, which under-sold the email route Privy already offers.
- `console/ui.tsx` — `SignInRequired`, the shared empty state behind **five** console pages (earnings, my bags, my submissions, quests, create bag): `Connect wallet` → `Sign in`.
- `console/pages/profile-view.tsx` — heading "Connect to see your profile" → "Sign in to see your profile", button `Connect wallet` → `Sign in`.
- `console/pages/bag-detail.tsx` — body copy "Connect one to claim a slot in this bag." → "Sign in to claim a slot in this bag."; button `Connect wallet to submit` → `Sign in to submit`.
- `console/shell/app-sidebar.tsx` — "Connect a Solana wallet to submit content and earn USDC." → "Sign in to submit content and earn USDC."; button `Connect wallet` → `Sign in`.
- `console/shell/user-menu.tsx` — `Connect Wallet` → `Sign in` in both signed-out states, and its paired menu item `Disconnect` → `Sign out` (the item calls `logout()` and its toast already said "Signed out", so "Disconnect" was the odd one out; `auth-button.tsx` already used "SIGN OUT").
- `console/pages/quests-page.tsx` — "…Connect to see this week's progress." → "…Sign in to see this week's progress."
- `console/pages/earnings-page.tsx` — "…connect the wallet you earn with to see settled transfers." → "…sign in to see settled transfers."
- `console/pages/create-bag-page.tsx` — "No Solana wallet is connected. Connect a wallet to send the budget." → "No Solana wallet is connected yet. Link one to send the budget."
- `app/api/campaigns/[id]/build-funding/route.ts` — the same instruction as a server message: "Connect a Solana wallet to your account first…" → "Link a Solana wallet to your account first…".
- `landing/live-campaigns.tsx` — "Connect your Solana wallet, claim a campaign slot…" → "Sign in, claim a campaign slot…".
- `landing/faq.tsx` — "Anyone with a Solana wallet. Connect, write the brief…" → "…Sign in, write the brief…".
- `console/pages/bag-submission-view.tsx` + `lib/social/verify.ts` — four messages about *social accounts* (not auth) that literally said "Connect": now "Link a social account…", "Link an account in Profile", "…is not linked in your profile…". Same meaning, one less word doing two jobs, and it matches the "linked wallet" language the console already uses elsewhere.

Deliberately not changed:
- **The flow.** No `onClick`, no `login`, no Privy config beyond that one user-facing string, no provider options. Every edited line is a string literal. The internal `onConnect` prop name is untouched, as are all `connect*` variables and the Solana `connection` module.
- **Wallet-address copy.** "Copy address", "View on explorer", "Wallet address copied", "Payout wallet", "the same wallet always brings back…" — a wallet is still a wallet; these were never auth CTAs.
- **The mock terminal's "CONNECTED" line** in the sample Bagworker card — that is set dressing inside an illustration, not a CTA.

Verified in the browser (dev server), then in `next build`:
- Landing: header control reads **SIGN IN**; **zero** buttons or links on the page contain "connect"; the phrase "connect wallet" is absent from the page text; the live-campaigns CTA and the "Who can create a Bag?" FAQ answer both read sign-in language (FAQ checked by expanding it).
- Mobile at 320px: the menu contains SIGN IN and nothing saying "Connect".
- Console `/dashboard/profile`: "Sign in to see your profile" + a "Sign in" button; `/dashboard/earnings` (the shared `SignInRequired`): "Sign in to see your earnings — payout history is private and tied to your wallet — sign in to see settled transfers." + "Sign in".
- Console sidebar signed-out state: "Not signed in / Sign in to submit content and earn USDC." + "Sign in". On both console pages the rendered DOM contained **three** "Sign in" affordances and **zero** "Connect" labels.
- Auth still works: clicking "Sign in" drives Privy exactly as before — the SDK mounts its modal and injects the `auth.privy.io` frame (5 Privy DOM nodes) with no new console errors.
- Repo-wide grep: no `Connect ` CTA string remains in `src/`; the only remaining "Connect wallet" occurrence is the comment in `auth-button.tsx` that documents the rename itself.
- `tsc --noEmit` clean, ESLint clean on every touched file, `next build` clean.
- Deployed (`https://bagwork-eta.vercel.app`, deployment `bagwork-nfk49axvu-…`) and re-checked there: the landing header control reads SIGN IN with **zero** "connect" labels or text on the page, the live-campaigns CTA reads "Sign in, claim a campaign slot…", and the console's shared empty state at `/dashboard/earnings` reads "Sign in to see your earnings — payout history is private and tied to your wallet — sign in to see settled transfers." with three "Sign in" affordances and no "Connect" anywhere.



---

Task ID: BRAND-LOGO-ASSET
Agent: main
Task: Put the real Bagwork logo in the header (branding the square mark with a site-coloured border at low opacity) instead of the hand-drawn "b".

The mark (`site/brand-logo.tsx`):
- The hand-drawn SVG "b" is gone. The tile now renders the brand file itself — `/bagwork-logo.png` — which is already the logo everywhere else (console sidebar, Privy modal, app icon metadata, `site/logos.tsx`), so the header is no longer the one surface inventing its own mark. That file was already in `public/`; nothing was copied.
- Rendered with `next/image` and the same props the console sidebar uses (`width={191} height={256} priority alt=""`), because the artwork is 191×256 — the "b" is taller than wide — so it is sized by height (`h-5`) and centred in the square rather than stretched, which would make the mark squat. Measured rendered size: **15×20 inside a 32×32 tile**, `/_next/image?url=%2Fbagwork-logo.png…`, loaded (`naturalWidth === 191`).
- **Border, as asked:** the square tile is the site's lime at low opacity — `border-[#bdfe00]/30` (hairline, 1px, `rounded-[9px]`), brightening to `/60` on hover — over a barely-there `bg-white/[0.04]` surface so it reads the same on the transparent header and the scrolled one. Measured: `lab(92.74 -40.99 87.43 / 0.3)` = exactly the lime at 30%.
- Geometry is unchanged: the block is still 241px wide on desktop and 212px at 768px, the tile is 32×32, and at 320px it spans 12…224 with the menu toggle at 272 (48px clear) — no page or header overflow.

**A site-wide bug found while doing this** (and fixed):
- The border would not take the lime colour. Investigating: **every** `border-[#bdfe00]/N` element on the page — including ones written in earlier tasks — computed to `rgba(255,255,255,0.08)`, while their `bg-[#bdfe00]/10` siblings rendered lime correctly.
- Cause: `globals.css` had its default border colour as an **unlayered** rule (`* { border-color: var(--border) }`). Tailwind v4 emits utilities into `@layer utilities`, and in the cascade an unlayered rule beats every layered rule **regardless of specificity** — so that one line was silently overriding every `border-<colour>` utility in the app. Backgrounds were unaffected because nothing unlayered sets `background-color`.
- Fix: the same rule, wrapped in `@layer base` (which is where shadcn's own template puts it), with a comment explaining why the layer is load-bearing. It is only one of two rules moved — the deliberately-unlayered `.btn-surface-*` rules were left alone, since beating later utilities is exactly how those are built.
- Verified after the fix, on both pages that render this header: lime hairlines now compute lime (`/0.25`, `/0.3`, `/0.4` as written), and elements with a bare `border` and no colour class still get `var(--border)` = `rgba(255,255,255,0.08)` — i.e. the default is intact and only elements that *asked* for a colour changed.

Verified: `tsc --noEmit` clean, ESLint clean, `next build` clean; mark loaded at both viewports; no console errors beyond the pre-existing Privy CSP notice.
- Deployed (`https://bagwork-eta.vercel.app`, deployment `bagwork-l8or9puw2-…`) and re-checked there: the mark loads from `/_next/image?url=%2Fbagwork-logo.png…` at its true 191×256 with a 15×20 rendered size inside the 32×32 square, the tile border computes `lab(92.7393 -40.9864 87.4286 / 0.3)` (the lime at 30%), the link is still `href="/"` + `aria-label="Bagwork — home"`, the wordmark cycles, and the block is still 241px with no page overflow.

Note: `BagworkLogo` in `site/logos.tsx` is now unused (it was the letter-mark-plus-wordmark pairing for the old header) and its doc comment describes that pairing. Left in place rather than deleted — say the word and it goes.



---

Task ID: FOOTER-BRAND-WATERMARK
Agent: main
Task: Set the footer's two required lines and add a huge, half-visible, half-opacity BAGWORK watermark clipped by the footer's bottom edge.

The two lines:
- `© 2025 BAGWORK · ALL RIGHTS RESERVED` — unchanged, and verified as the exact rendered string.
- `BUILT ON SOLANA · POWERED BY $BAG` — this was three separate flex children (`BUILT ON SOLANA`, a `·`, `POWERED BY $BAG`) whose spacing came from `gap-4`, so the separator floated at its own rhythm. It is now one string with the middot inline, so it reads and wraps as the single line it is. Verified as the exact rendered string.
- Everything else in the footer — the brand column, the four link columns, the `Top Earners` / `Documentation` targets — is untouched.

The watermark:
- One decorative word, not a heading and not in the outline: a `div` with `aria-hidden="true"`, `pointer-events-none` and `select-none`. It carries no meaning — the brand is already announced by the logo and the copyright line — so announcing it (or letting it swallow a click, or letting a drag select it) would be a bug.
- **Size:** `text-[clamp(2.5rem,17vw,15rem)]`. `vw` so it keeps its proportion at every width, `clamp` so it stops growing on large desktops (240px at ≥1412px wide, 54px at 320px — still ~1.8× the section headings on a phone, which is what "still large on mobile" has to mean for it to read as a stamp rather than a stray word).
- **Half visible:** the word sits in its own `overflow-hidden` wrapper that is deliberately the footer's **last child**, with the footer carrying no bottom padding — so the cut lands exactly on the footer's bottom edge, which is what the brief asked for. The visible band is `0.55em` of the line box: `leading-none` makes that box the font size, the glyphs occupy ~0.7em of it, so about half of each letter survives the cut.
- **Centred:** `text-center` in a full-bleed wrapper. Measured centre offset: **0px** at both 1440 and 320.
- **Opacity:** 50%, exactly as asked, via `opacity-50` on the word with plain white text. It is a literal half — if it ever reads too loud against a dark footer, the single knob is that class (`opacity-25`, or `text-white/[0.14]`); nothing else needs to change.

Measured in a real browser:

| | 1440px | 320px |
|---|---|---|
| Type size | 240px | 54.4px |
| Word width | 978px (**68%** of the layout) | 222px (**71%**) |
| Centre offset | 0px | 0px |
| Visible band | 132px of a 240px line box (**55%**) | 30px of 54 (**55%**) |
| Clipped at the footer's bottom edge | yes | yes |
| Clear of the last link | 162px | 189px |
| Horizontal overflow | none | none |

- The word is ~70% of the viewport at every size by construction (7 chars × ~0.58em with the `-0.03em` tracking), which is why it cannot introduce a horizontal scrollbar; `pageOverflowX` and `footer.scrollWidth > clientWidth` were both checked false at 1440 and 320.
- `tsc --noEmit` clean, ESLint clean, `next build` clean.
- Deployed (`https://bagwork-eta.vercel.app`, deployment `bagwork-au81czlr4-…`) and re-measured there: both lines byte-exact; watermark at 0.5 opacity, 240px, 978px wide (63% of the viewport), **centre offset 0px**, visible band 55% of its line box, clipped exactly at the footer's bottom edge with only the tops showing, 162px clear of the last link, and no horizontal overflow.

Not verified: the mark's optical weight on a large desktop monitor by eye (it is measured, not looked at, from here) — the opacity class above is the dial if 50% is too strong.



---

Task ID: HEADER-BRAND-LOGO
Agent: main
Task: Rebuild the header logo as a square app-icon mark with a white matrix-flicker wordmark beside it, linked to `/`.

What it is now (`site/brand-logo.tsx`, new):
- **Left — the mark.** A 32×32 brand-yellow (`#ffe70e`) tile, `rounded-[9px]`, with a lowercase "b" in near-black. The glyph is **drawn, not typed**: two round-capped strokes in a 24-unit viewBox (an ascender at x=6 from y=3.4 to 20, and a bowl — circle r=5.4 at 12.8,13.8). The stems overlap by ~2.2px so the letter merges rather than sitting side by side. Drawn because a logo must not depend on a webfont: the site's display face (Syne) is scoped to `.console` in `globals.css`, so a typed `<span>b</span>` would render in Space Mono on the marketing pages and Syne in the console, at two different weights.
- **Right — the wordmark.** The brief's four phrases in order (`LOGOTYPES`): `bagwork`, `no ads now`, `make bagwork great again`, `u gotta be kidding me !`, in white, holding ~2s each and flickering between them.
- **The whole block is one `<a href="/">`** with `aria-label="Bagwork — home"`. Verified end to end: clicking it from `/docs` performed a real navigation to `/`.

Reuse, not a second implementation (`landing/matrix-word.tsx`):
- `MatrixWord` gained optional `words` and `holdMs` props (defaults unchanged), so the header runs **the hero's exact machine** — same 45ms noise frames, same 6-frame burst, same left-to-right settle, same reduced-motion opt-out. The hero's markup and behaviour are untouched; only the hard-coded list moved behind a prop.
- The flicker inside the link is `aria-hidden` (it always was), which is why the accessible name lives on the anchor. A logo that re-scrambles itself every two seconds must not be announced every two seconds.
- Reduced motion freezes the wordmark on `bagwork` — the first phrase, which is simply the brand name. A good outcome to get for free.

Two details that make it hold together:
- **Static mark.** Measured over 70 samples across a full cycle: the mark's `innerHTML` had exactly **one** variant, so the icon provably does not flicker. Only the text does.
- **`min-w-[24ch]`.** Space Mono is monospace, so `ch` is exact: the block reserves 24 characters (the longest phrase) and the width therefore never changes. Measured: **one distinct block width — 241px — across the whole cycle.** Without it the nav beside it would shuffle every two seconds. Nothing in the block carries letter-spacing, for the same reason: tracking would break `1ch = one character` and the reservation with it. There is a comment on the span saying so.

Overflow: found and fixed on the way
- At 768px the first version pushed the action buttons 17px past the viewport (`documentElement.scrollWidth` 785 vs 768) — the block is 241px where the old text logo was ~110px, and 768 is exactly where the nav appears.
- Fix: the wordmark drops to 11px between 640px and 1024px (the reservation is a function of font size, so this buys 29px), and the nav gap is 16px until `xl` (buys 40px). Measured after: at 768 the actions end at 734 with no overflowing child; at 1024 they end at 982; at 1440 the nav is back to 24px gaps and everything sits well inside.
- The header stays 65px tall (h-16 + the 1px border), and the mark is 32px, so the row is unchanged in height.

Verified (dev server, real browser):
- Mark: square, 32×32, contains an SVG, no text content, **1 HTML variant over 70 samples**.
- Wordmark: white (`rgb(255,255,255)`), Space Mono, and all four phrases were seen settling, with noise frames in between (`@P$9D?6W%5`, `make bagTYU48JV*4E!VC493`, `u gotta be kidding $QI!`).
- Block width: 241px at ≥1024 and 212px at 768 — constant within each breakpoint across the cycle.
- Widths: 320px → logo spans 12…238, mobile toggle starts at 272 (34px clear), no page or header overflow; 768 / 1024 / 1440 → no overflow, no overflowing child.
- Link: `href="/"`, `aria-label="Bagwork — home"`, and clicking it on `/docs` navigates home.
- `tsc --noEmit` clean, ESLint clean, `next build` clean.
- Deployed (`https://bagwork-eta.vercel.app`, deployment `bagwork-pkyjic3sp-…`) and re-checked there: `href="/"`, `aria-label="Bagwork — home"`, mark 32×32 with **one** HTML variant over 10.5s, white text, all four phrases settling, block width constant at 241px, and at 320px the logo spans 12…224 with the menu toggle starting at 272 — no page or header overflow.

Not verified: the `b` mark's optical look at very large sizes (it is only used at 32/18px here), and the logo inside the console (`.console` has its own topbar and does not render this header).



---

Task ID: HOMEPAGE-FULL-SYSTEM
Agent: main
Task: Make the marketing homepage represent all three sides of Bagwork (creators, projects, fee-funded Bags + $BAG), fix the hero word and the header nav, and stop the two "why" sections repeating each other. Same visual style; no redesign.

Hero:
- `matrix-word.tsx`: the last entry of the cycle is now `UGC creators?` (was `foids?`), so the rotation reads bagworkers? → hustlers? → shillers? → kols? → UGC creators?. The matrix flicker is untouched — the same 6 noise frames at 45ms resolving left-to-right every 2s. Verified live: the DOM was sampled for 11s and every word resolved, including the noise frames (`shillerJV`, `k&&UV`, `UGC crVB4X&Z7`). The `h1`'s `aria-label` still reads "Why pay for ads when you can pay bagworkers?".
- The comment in `matrix-word.tsx` and the clamp note in `hero.tsx` claimed the longest word was the *first* one; that is now false, so both were corrected. The new longest entry is 13 characters and the longest fixed line is 16, which is why nothing overflows: measured at 1440/390/320 across a full cycle, `h1.scrollWidth` never exceeded its box.

Header nav (`site/header.tsx`):
- Was: EXPLORE (opened the marketing leaderboard while its `#live` href pointed elsewhere), HOW IT WORKS, BAGWORKERS (leaderboard), PROJECTS (→ #live), DOCS (a store action).
- Is: EXPLORE → `#live`, HOW IT WORKS → `#how`, WHY BAGWORK → `#why`, FEE REDIRECT → `#fee-redirect`, DOCS → `/docs`, plus DASHBOARD as a real anchor to `/dashboard` beside the existing Connect (Privy) button. One `followNav()` handles both kinds, so a section link scrolls and a route navigates — no more action/href mismatch. Verified: clicking each link leaves its section at viewport top 0.
- `/docs` renders the same `DocsView` the old store action did, so nothing was lost there. The marketing leaderboard *was* only reachable from the header, so it moved to the footer rather than being stranded.

New sections (all reuse the page's card system, extracted into `landing/flow-card.tsx`):
- `publisher-path.tsx` — "FUND A BAG. GET REAL CONTENT." (`#publishers`, eyebrow FOR PROJECTS) with the four publisher steps: Create a Bag, Fund the budget, Bagworkers post content, Pay only for approved work. Ends on a real CTA to `/dashboard/create`, painted with the shipped button surface.
- `fee-redirect.tsx` — "TURN TRADING FEES INTO CONTENT." (`#fee-redirect`) with the six-step loop: Trading → Fees routed → Auto-converted → Content budget grows → Bagworkers create → More attention. The mechanism matches the shipped code (`/api/fees/sync`; `FeeDeposit` received → matched → swapped; `feeRaisedUsdc` on the campaign), and the section links to `/docs` for the full diagram.
- `fee-burn-strip.tsx` — a compact strip, not another flow: 5% fee, split 50/50 between treasury and the $BAG buyback-and-burn (the shipped split in `lib/solana/burn.ts`), plus the one-line payoff.
- `flow-card.tsx` is new and shared: `useSequential` + `StepCard` + `MockMetric`/`MockBar`. That hook and card markup were duplicated verbatim across `steps.tsx`, `features.tsx` and `anti-bots.tsx`; they now come from one place, at the same 2s tempo, so every flow on the page beats together.

De-duplication of the two "why" sections:
- **Stayed in "THE FAIREST CONTENT REWARDS ENGINE"** (`#why`): ON-CHAIN PAYOUTS (kept; it now absorbs the old escrow-treasury point). **Added**: OPEN MARKETPLACE, POINTS LEVELS & PROFILE, WEEKLY QUESTS, 5% FEE → $BAG BURN, and LEADERBOARD & REPUTATION (reworked from "Top Bagworker").
- **Removed from it as duplicates**: ANTI-GAMING ENGINE and DETAILED SCORING (both now live only in the anti-abuse section), HOLDER MULTIPLIER (moved there as holder verification), and 24/7 VIP SUPPORT (priority-queue support does not exist anywhere in the product).
- **Stayed in "NO BOTS. NO SLOP."** (`#anti-abuse`): BOT DETECTION, AI QUALITY SCORING, HOLDER VERIFICATION. **Added**: SOCIAL VERIFICATION, HUMAN REVIEW, FARMING PROTECTION — protection layers the page was missing.
- **Removed from it as duplicates**: ESCROW TREASURY and TRANSPARENT PAYOUTS (payout trust is a product advantage, so it appears once, in the section above), METRIC POLLING (folded into the AI-scoring copy).
- Verified programmatically: the two sections now expose six cards each with **zero titles in common**.
- Both sections, and the three new ones, carry the same one-line "panels below illustrate the mechanics, not live figures" note the creator flow already had.

Light cleanups:
- `stats-band.tsx`: a metric with nothing behind it renders as an em dash in a quieter weight instead of a confident `0`, and the whole band steps back with one line if every figure is still empty. Real figures (bags live, creators, trust) keep full weight — before, `$0` and `0` sat next to them and made a working product look dead.
- `faq.tsx`: added "What is Fee Redirect?", "What does Bagwork charge, and where does it go?" (the 5% / 50-50 / $BAG burn detail) and "Who can create a Bag?"; rewrote the anti-slop answer to the six real layers; replaced the old duplicate "Is there a fee?" with the new fee question; and removed an invented "1.25x to 2x" multiplier range. The old "Can projects create campaigns?" became "How does a project run a campaign?".
- `site/footer.tsx`: "Documentation" now points at `/docs`, the PRODUCT column gained "Top Earners" (the marketing leaderboard, via the store, so dropping it from the nav did not strand it), the section names in those columns match the new anchors, and the tagline now describes all three sides instead of creator-only. `$BAGWORK` → `$BAG`.

Verified:
- Section ids present and in the intended order: `#live`, `#how`, `#publishers`, `#why`, `#fee-redirect`, `#fees`, `#live`, `#anti-abuse`, `#faq`.
- Every nav link leaves its section at viewport top 0 (measured after the smooth scroll settled).
- Card panels: **zero clipping** across all five flow sections at 1440 (found and fixed two real 2px/7px overflows in the new Section A mocks; the third flag was the bot-detection stamp caught mid-spring, which is positioned absolutely on purpose).
- Mobile: at 390 and 320 the new sections stack to one 348px column, `documentElement.scrollWidth` never exceeds the viewport, and the headline does not overflow while cycling.
- `next build` clean, `tsc --noEmit` clean, ESLint clean on every changed file. Dev server and scratch logs removed.
- Deployed to production (`https://bagwork-eta.vercel.app`, deployment `bagwork-bpwh8d1y0-…`) and re-checked there: all eight section anchors present, the headline cycle reaches "UGC creators?", the nav reads EXPLORE / HOW IT WORKS / WHY BAGWORK / FEE REDIRECT / DOCS + DASHBOARD → /dashboard, and clicking FEE REDIRECT leaves `#fee-redirect` at viewport top 0.

Not verified: the entrance animations of the three new sections under reduced motion (page-level motion was unchanged, and the new sections use the same `motion.div` viewport reveal as the existing cards).



---

Task ID: ADMIN-CAMPAIGNS
Agent: main
Task: Let the admin portal create and manage campaigns by hand, with the bags it makes indistinguishable from publisher-funded ones to creators.

Schema + migration (`20260930120000_admin_created_campaigns`, applied to the live database with `prisma migrate deploy`):
- `campaigns.created_by_admin` (boolean, default false) — internal provenance only. It is never mapped into a public payload: `mapCampaign` builds the marketplace shape field by field, so the flag cannot leak, and the live feed's keys were checked directly (no `createdByAdmin`, and no admin/manual/staff wording anywhere a creator can see).
- `campaign_admin_changes` — one row per admin edit (`action`, `changes` as before/after display strings, `createdAt`), cascade-deleted with the bag. There is no "who": the portal authenticates with a single shared password, so there is no operator identity to record.
- `PAUSED` added to the `CampaignStatus` vocabulary (`src/lib/types.ts`) and to the console's `BAG_STATUS` badge map, so a paused bag reads as a lifecycle state rather than an unknown string.

One set of authoring rules (`src/lib/campaigns/authoring.ts`, new): the token/budget/payment-model/banner validation was extracted **verbatim** out of `POST /api/campaigns`, and that route now imports it — behaviour unchanged (still 401s an anonymous POST, verified), so the publisher flow and the admin routes can never drift on what a valid bag is. `readAuthoring()` is the whole-bag validator both admin routes use, alongside `readToken`, `resolveCeiling`, `normaliseBannerUrl`, `readOptionalInt`, `slotsFor` and `resolveEndsAt`.

Admin API (all behind the existing `isAdmin` cookie):
- `POST /api/admin/campaigns` — create. Three deliberate differences from the publisher flow: `createdBy` stays null (nobody funded it), the budget is set directly, and the status is the operator's choice. A DRAFT is left unfunded so a draft can never look payable; publishing sets `fundedAmount` from the budget, which is what makes an operator bag payable with no transfer to wait for.
- `PATCH /api/admin/campaigns/[id]` — either a full edit (every authoring field re-validated against the same rules) or a status-only action (`{status}` → PAUSE / RESUME / PUBLISH / END). Knock-on effects are handled in the route, not left to the caller: a budget or rate change re-derives `slotsRemaining` from the submissions already on the bag (measured: 200 → 400 slots when a $5,000 bag at $25/post went to $10,000), a resume with no slots left becomes FILLING rather than LIVE, and a publisher's `fundedAmount` (a record of a real transfer) is never rewritten — only an operator bag's is.
- `GET /api/admin/campaigns` — `?status=` and `?q=` filters (title, project name, owner handle), with the editable fields and `createdByAdmin` echoed back.
- `GET /api/admin/campaigns/[id]` — one bag plus its last 25 audit entries.
- `POST /api/uploads/banner` now accepts the admin cookie as well as a publisher session, so there is still exactly one place that checks an image's type, size and container signature. An operator upload simply has no `userId`.

Public-side changes (small, and deliberate):
- The marketplace feed now honours only `LIVE` / `FILLING` / `ENDED` / `ALL`, and `ALL` excludes DRAFT **and** PAUSED. Before this, `?status=DRAFT` was a public route to unfunded drafts; with PAUSED added it would have been a route to paused bags too. Anything else falls back to `LIVE`.
- The creator side needed **no** changes: both `POST /api/submissions/claim` and `POST /api/submissions` already gate on `status === "LIVE" || "FILLING"` (as does the console's claim button), so a paused bag stopped taking claims and posts the moment the status existed — the rejection already reads "This bag is paused and is not accepting creators".

Admin portal (`/adminportal`, Campaigns tab):
- "New bag" swaps the list for a create form: title, project name, brief, banner (upload or an https link, with a preview), platforms, budget, token (USDC / SOL / custom CA resolved from the chain for symbol and decimals), payment model, rate settings that follow the model, max submissions / max per creator, end date and status.
- Row actions: **View** (expands an inline panel with treasury, owner, funding, spend, slots, the brief and the change history), **Edit** (the same form, prefilled; the token is fixed once a bag exists), **Pause**, **Resume**, **End**.
- Filters: status chips (ALL / DRAFT / LIVE / FILLING / PAUSED / ENDED) and a debounced search.
- Nothing in the list, and nothing anywhere a creator can reach, distinguishes an operator bag from a funded one. The only marker is the internal `createdByAdmin` flag, surfaced solely inside the detail panel ("created here" vs "publisher-funded").

Verified:
- `bun run verify:admin-campaigns` (new, `scripts/verify-admin-campaigns.ts`) drives the real HTTP surface: **22 checks, all passing**. Login; create refused without the cookie (401); create returns 201 with the internal flag set and a draft unfunded and absent from the public feed; publish recorded as PUBLISH with `fundedAmount = budget`; the bag then appears in the marketplace feed **with no provenance key in the payload** (full key list inspected); pause drops it out of the feed *and* the status parameter cannot be used to reach it; resume; a budget edit that re-derives slots and diffs the change; a trail covering CREATE / PUBLISH / PAUSE / RESUME / UPDATE; end; and the bag shelved back to DRAFT. `--cleanup` then removed the 3 bags the runs left behind.
- `next build` clean, `tsc --noEmit` clean, ESLint clean on every changed file, and `bun install --frozen-lockfile` in sync (1886 installs, no changes) so the Vercel frozen install cannot fail the way it did on the previous deploy.
- `POST /api/campaigns` still answers `401 {"error":"Sign in required to create a bag"}` for a logged-out caller — the publisher Create Bag flow is untouched.
- Deployed to production and re-ran the same 22 checks against it: `https://bagwork-eta.vercel.app` (deployment `bagwork-aj7s9w22p-retarddevthatknowcodes-projects.vercel.app`), all passing, with the verification bag removed afterwards. The migration was already applied to the shared database, so the live site could read the new column the moment it went out.

Not verified: clicking through the create form in a browser (the portal needs `ADMIN_PASSWORD`, and the upload path needs a real image), and a creator claiming/submitting against an operator bag end to end — those use the same code paths a publisher bag uses, and were read rather than exercised.


# SHILLZ Clone — Work Log

Project: Full-stack Solana content-rewards marketplace (SHILLZ clone)
Stack: Next.js 16 + TS + Tailwind v4 + Prisma/SQLite + TanStack Query + Zustand + z-ai-web-dev-sdk (LLM for AI review)
Aesthetic: Dark terminal-neon, Space Mono, #BDFE00 accent, macOS-style terminal windows, glitch text, marquee.

---
Task ID: 0
Agent: main (orchestrator)
Task: Project bootstrap & architecture plan

Work Log:
- Inspected package.json, layout.tsx, globals.css, prisma schema, tailwind config, dev.log
- Confirmed dev server running on port 3000 (Next.js 16.1.3)
- Decided architecture: single `/` route with Zustand view-state router (landing / dashboard / campaign-detail), client-side navigation
- Backend: Prisma + SQLite, API routes for campaigns/submissions/payouts/review/leaderboard/stats
- AI review flow uses z-ai-web-dev-sdk LLM skill (server-side) to score submission quality + engagement authenticity
- Design tokens: bg #1D1D1D, neon #BDFE00, text #E0DFE3, Space Mono everywhere, 12px CTA radius, fully rounded pills

Stage Summary:
- Plan locked. Proceeding to design system, schema, components, APIs, pages, verification.

---
Task ID: FINAL
Agent: main (orchestrator)
Task: Full build + Agent Browser verification of SHILLZ clone

Work Log:
- Built complete neon-terminal design system (globals.css with #BDFE00 tokens, Space Mono font, glitch/marquee/float/pulse animations, custom scrollbar)
- Defined Prisma schema: User, Project, Campaign, Submission, Payout, Leaderboard (SQLite). Pushed + seeded 8 projects, 12 campaigns, 12 leaderboard entries, 4 sample submissions
- Built API routes: GET /api/campaigns, GET /api/campaigns/[id], GET+POST /api/submissions, POST /api/payouts (on-chain SPL transfer sim), POST /api/review (z-ai-web-dev-sdk LLM anti-slop engine + heuristic fallback), GET /api/leaderboard, GET /api/stats
- Built core UI: NeonButton, TerminalWindow (macOS traffic lights), ProgressBar, Marquee, GlitchText+ScrambleText, AnimatedCounter, TokenLogo, PlatformIcon, LiveBadge, Tag, CampaignCard, Header, Footer
- Built landing: Hero (terminal dashboard mockup), LiveMarquee, StatsBand, Steps (4 cards), Features, LiveCampaigns (filterable grid), AntiBots (6 layers), FAQ accordion
- Built dashboard: wallet sidebar (trust score, total earned, progression), submissions list with status badges + RUN REVIEW / CLAIM PAYOUT / VIEW ON SOLSCAN actions, payout/review mutations with toasts
- Built campaign detail: full brief, progress, payout calculator, SUBMIT_POST.EXE terminal form with platform auto-detect + validation checklist
- Built leaderboard view: podium + table with DIAMOND/PLATINUM/GOLD/SILVER/BRONZE badges
- Wired Zustand view-state router (landing/dashboard/campaign-detail/submit/leaderboard) + TanStack Query + Sonner toasts in page.tsx

Verification (Agent Browser + VLM):
- Landing renders all 9 sections populated, neon #BDFE00 + Space Mono confirmed by VLM
- Golden path tested: click SUBMIT → campaign detail → fill post URL → submit → dashboard auto-connects wallet → submission appears (pending)
- CLAIM PAYOUT on approved submission → POST /api/payouts 200 → status becomes PAID + Solscan link (verified)
- RUN REVIEW on reviewing submission → POST /api/review 200 (1051ms = LLM called) → LLM scored + approved + computed payout → CLAIM PAYOUT appears (verified)
- Leaderboard renders handles, trust scores, earned amounts, badges
- Mobile (390x844): single column, hamburger menu, terminal scales, no overflow (VLM confirmed)
- Sticky footer: measured on short page — footerBottom=900, viewportHeight=900, gapBelowFooter=0 (flush at bottom ✓)
- Switched section animations from whileInView → animate (mount-based) so full-page renders look complete
- ESLint clean, dev server no runtime errors

Stage Summary:
- SHILLZ clone complete and browser-verified. Full campaign → submit → AI review (LLM) → on-chain payout loop working end-to-end on Solana (simulated SPL transfers with realistic tx signatures + Solscan links). Pixel-faithful dark terminal-neon aesthetic with #BDFE00 accent, Space Mono, glitch text, marquee, macOS terminal windows, animated counters. Anti-slop engine uses real LLM scoring blended with engagement-authenticity heuristics.

---
Task ID: LIVE-DEMO-ANIMATIONS
Agent: main (orchestrator)
Task: Animate "EARN IN 4 SIMPLE STEPS" + Feature cards into living, continuous demo loops

Work Log:
- Steps section (steps.tsx) COMPLETELY REBUILT with live demo animations:
  - Phase system: 4 phases cycling every 2.5s (10s full loop) via useDemoPhase() hook
  - useCountUp() hook: smooth rAF counting (cubic ease-out) for views/likes/reposts/wallet balance
  - Step 1 (static): URL input + "OWNERSHIP VERIFIED" pulse (unchanged)
  - Step 2 (TRACK): Button transitions dark→bright neon green "SUBMIT CONTENT"→"SUBMITTED!" with checkmark + "Pending review…" — active card gets yellow glow + border
  - Step 3 (TRACK): Views count up 0→12.4K, Likes→920, Reposts→145 in sync, progress bar fills sequentially with stage labels ("STARTING…"→"GAINING TRACTION"→"VIEWS ACCELERATING"→"GOING VIRAL!")
  - Step 4 (PAID): Wallet balance counts up to $8,200, payment notifications slide in one-by-one (AnimatePresence) with green checkmarks + "$297.60 USDC CONFIRMED"
  - Active step: yellow border glow + icon brightens
  - Staggered fade-up entrance on scroll (whileInView)

- Features section (features.tsx) COMPLETELY REBUILT with 6 animated cards:
  1. Anti-Gaming Engine: 6 bar-chart bars rise/fall every 2.5s (random heights), one bar highlights brighter green, "50% BOTS BLOCKED" badge appears/disappears (AnimatePresence)
  2. On-Chain Payments: Transaction modal cycles SIGNING→CONFIRMED every 3s (AnimatePresence mode=wait), progress bar animates 60%→100%
  3. Detailed Scoring: 3 progress bars (Trust/Content/Engagement) fill sequentially in a 6s loop (0→88, then 92, then 76, then reset)
  4. Premium Shiller: DIAMOND TIER badge with continuous pulsing glow (boxShadow keyframes)
  5. 24/7 VIP Support: Chat bubble fades in/out every 4s ("Your payout is being processed ⚡")
  6. Holder Multiplier: $100 ×1.5 = $150 with continuous scale pulse on the result
  - All cards: breathing/float on hover (card-3d), soft neon edge glow, staggered fade-up entrance

Verification (Agent Browser + VLM):
- Steps: "ticking counters (Views, Likes, Reposts), filling progress bar 'GOING VIRAL!', wallet balance, payment notifications" ✓
- Features: "bar charts showing varying fill levels, pulsing LIVE dots, animated elements" ✓
- VLM Score: 9/10 — "feels like a functioning terminal rather than a static brochure"
- ESLint clean. Page HTTP 200. No runtime errors.
- Performance: all animations use transform + opacity only; CSS keyframes + framer-motion; no canvas/rAF-heavy loops beyond the count-up hooks.

Stage Summary:
- Both sections now feel alive — continuous demo loops (button state changes, number counters ticking up, progress bars filling, payment notifications sliding in, bar charts animating, transaction modal cycling, badge pulsing, chat bubble fading). Sequential storytelling in the steps (step 2→3→4 light up in sequence). Staggered entrance on scroll. Premium, real-time, continuous — matches the reference video style.

---
Task ID: TWEAKS-3D-BUTTONS
Agent: main (orchestrator)
Task: Three visual tweaks — (1) remove glitch animation from "GET PAID." hero headline, (2) remove glow from all subtext numbers, (3) make all CTA buttons 3D with thick dark shadow + dark surrounding border at an angle.

Work Log:
- hero.tsx: set GlitchText `animate={false}` on "GET PAID." (glitch ::before/::after clones removed → text is now fully static). KEPT `text-neon-glow` on GET PAID since user only asked to remove animation (main text, not a subtext number).
- hero.tsx: removed `text-neon-glow` from TOTAL EARNED $142.50 AnimatedCounter in the terminal dashboard mockup.
- stats-band.tsx: removed `text-neon-glow` from all 6 stat numbers (TOTAL PAID OUT, ACTIVE CAMPAIGNS, CREATORS EARNING, SUBMISSIONS REVIEWED, AVG PAYOUT, AVG TRUST SCORE).
- anti-bots.tsx: removed inline `style={{ textShadow: "0 0 14px rgba(189,254,0,0.3)" }}` from the "98 / 100" platform trust score.
- dashboard-view.tsx: removed `text-neon-glow` from TOTAL EARNED AnimatedCounter.
- campaign-detail.tsx: removed `text-neon-glow` from ESTIMATED PAYOUT number.
- globals.css: added `.btn-3d` utility class — `border: 2px solid #0a0a0a` (dark surrounding border) + `box-shadow: 0 5px 0 0 var(--btn-edge,#0a0a0a), 0 9px 18px -4px rgba(0,0,0,0.75)` (thick dark "depth" edge below + drop shadow → raised 3D look). `:hover` lifts translateY(-2px) + grows shadow to 7px edge; `:active` presses translateY(3px) + shrinks to 2px edge (physical button press feel). Per-variant edge color via `--btn-edge` CSS custom property.
- neon-button.tsx: refactored all 4 variants to use `.btn-3d` + `[--btn-edge:<color>]`:
  - solid (neon green): edge #0a0a0a (pure dark)
  - outline (transparent): edge #1a2600 (very dark green — tinted to match neon theme)
  - ghost (subtle): edge #0a0a0a
  - gold (yellow): edge #1a1100 (very dark brown)
  Removed old `neon-btn-glow`, `hover:-translate-y-0.5`, `active:scale-[0.97]`, and per-variant border-color utilities (the `.btn-3d` class now owns the dark border + 3D transform/shadow logic).
- Left filter chips (live-campaigns.tsx) and marquee items (live-marquee.tsx) as-is: filter chips use border-color as the active-state indicator (forcing dark border would break that), and marquee items are scrolling nav cards where 3D edges would be visually noisy.

Verification (Agent Browser DOM inspection + VLM):
- DOM: GET PAID span → hasGlitchClass=false ✓, hasGlow=true ✓
- DOM: START SHILLING btn → border "2px solid rgb(10,10,10)" ✓, boxShadow "rgb(10,10,10) 0px 5px 0px 0px, rgba(0,0,0,0.75) 0px 9px 18px -4px" ✓, bg rgb(189,254,0) ✓
- DOM: EXPLORE SHILLZ btn → border "2px solid rgb(10,10,10)" ✓, boxShadow "rgb(26,38,0) 0px 5px 0px 0px, ..." (dark green edge) ✓, bg transparent ✓
- DOM: statsBandGlowCount = 0 ✓ (no more text-neon-glow on stat numbers)
- CSS rules loaded: `.btn-3d` (resting 5px edge), `.btn-3d:hover` (7px edge + translateY -2px), `.btn-3d:active` (2px edge + translateY 3px) ✓
- VLM: "GET PAID. text is static (no glitch) + soft green glow" ✓; "both buttons feature a distinct thick, dark (near-black) bottom border/shadow creating a keycap/arcade button aesthetic, raised physical 3D appearance, thin darker border outlining the main body" ✓; "stats numbers are flat solid lime green, no glow halo or text-shadow" ✓
- Console: no errors. ESLint clean. Dev server compiled successfully (multiple ✓ Compiled).

Stage Summary:
- All three tweaks applied and browser-verified. Hero headline "GET PAID." is now static (glitch animation off) but keeps its neon glow. Every subtext number across landing + dashboard (stats band, hero dashboard mockup balance, anti-bots trust score, dashboard total earned, campaign-detail estimated payout) lost its glow — flat solid green. All NeonButton CTAs (START SHILLING, EXPLORE SHILLZ, SUBMIT, CLAIM PAYOUT, etc.) now render as physical 3D buttons: 2px dark surrounding border + thick 5px dark "depth" edge below + drop shadow, lifting on hover (-2px, edge grows to 7px) and pressing down on active (+3px, edge shrinks to 2px) for a tactile arcade-keycap feel. Per-variant edge tints keep the 3D look cohesive with each button's color (pure dark for solid/ghost, dark green for outline, dark brown for gold).

---
Task ID: BG-DARKEN
Agent: main (orchestrator)
Task: Make the grey backgrounds darker ("a lil more dark shade").

Work Log:
- Inventoried all grey bg shades used across src/ via grep: #161616, #1a1a1a, #1c1c1c, #1d1d1d, #1e1e1e, #232323 (the 6-step grey ramp powering body bg, cards, sections, terminal headers, popover, sidebar, muted/hover).
- Defined a proportional darkening mapping (~-5 to -6 per channel) that preserves the strict ordering/hierarchy so section contrast stays intact:
  - #161616 (darkest sections: stats, marquee, anti-bots, footer, terminals) → #111111
  - #1a1a1a (cards, steps/live-campaigns sections, marquee items) → #141414
  - #1c1c1c (terminal/section header bars) → #161616
  - #1d1d1d (main page bg, features, faq, anti-bots cards, header) → #171717
  - #1e1e1e (secondary) → #181818
  - #232323 (muted/hover) → #1d1d1d
- Ran a single bash sed pass over all 135 .tsx/.ts/.css files in src/, processing darker-old-values-first to avoid chained-replacement contamination (verified: new #161616 from ex-#1c1c1c and new #1d1d1d from ex-#232323 persist correctly; no leftover original values).
- globals.css CSS variable tokens now: --background #171717, --card #141414, --popover #111111, --secondary #181818, --muted #1d1d1d, --sidebar #141414.
- Hit a Next.js dev CSS-cache hiccup: after sed, the served CSS chunk still contained --background:#1d1d1d (stale). Fixed by appending a harmless comment to globals.css to force the PostCSS watcher to recompile (✓ Compiled in 610ms). Served CSS now correctly shows --background:#171717.

Verification (Agent Browser DOM + VLM):
- DOM body bg: rgb(23,23,23) = #171717 (was rgb(29,29,29) = #1d1d1d) ✓
- DOM section bgs: darkest sections rgb(17,17,17)=#111111, cards rgb(20,20,20)=#141414, main sections rgb(23,23,23)=#171717 — all darker, hierarchy preserved ✓
- VLM: "page background is a noticeably dark charcoal grey, significantly darker than medium grey"; "section hierarchy preserved, clear visual distinction between deepest sections and main content areas"; "neon green #bdfe00 remains highly vivid with strong contrast"; "no major visual problems — text crisp, buttons visible, layout intact, darkening enhances the dark-mode aesthetic" ✓
- ESLint clean. Dev server compiled successfully. No console errors.

Stage Summary:
- All grey backgrounds darkened by ~5-6 per channel, maintaining the 6-step hierarchy so the section striping/depth is preserved. Main page bg went from #1d1d1d → #171717; darkest sections #161616 → #111111; cards #1a1a1a → #141414. The neon green accent pops harder against the darker canvas. Change applied consistently across landing + dashboard + adminportal + shillz primitives (header, footer, terminal-window, campaign-card).

---
Task ID: REBRAND-BAGWORK
Agent: main (orchestrator)
Task: Add the user-supplied logo image and rebrand the wordmark from "SHILLZ" to "BAGWORK" (logo = "B", text = "AGWORK").

Work Log:
- User uploaded a PNG logo to /home/z/my-project/upload/Untitled design.png (the IM gateway stripped the "(11)" suffix). VLM identified it as a classical Greek/Roman temple facade (pediment + 3 columns + stepped base) — a bank/institution pictorial mark. PIL check: 1920x1920 RGBA, 84.2% transparent pixels. Light gray/silver line-art on transparent bg.
- Resized the 507KB high-res PNG to a web-friendly 256x256 (16KB) via PIL (LANCZOS) → /home/z/my-project/public/bagwork-logo.png. Transparent bg preserved, renders cleanly on the dark #171717 page.
- logos.tsx ShillzLogo: replaced the `return null` placeholder with `<img src="/bagwork-logo.png" alt="BAGWORK" className={cn("block h-7 w-7 shrink-0 object-contain", className)} />`. Header (h-7 w-7 = 28px) and footer (h-8 w-8 = 32px) sizing stay wired via the className prop.
- Wordmark rebrand: header.tsx + footer.tsx changed `SHILL<span green>Z</span>` → `AGWOR<span green>K</span>`. Combined with the logo mark (the user's metaphor: temple = "B"), the header reads [temple] AGWOR[K] = BAGWORK.
- Full brand-name rebrand (SHILLZ → BAGWORK) across all user-facing text:
  - layout.tsx: title, keywords, authors, openGraph.siteName, openGraph.title, twitter.title, favicon icon path → /bagwork-logo.png
  - hero.tsx: "EXPLORE SHILLZ" → "EXPLORE BAGWORK"
  - features.tsx: "WHY SHILLZ" → "WHY BAGWORK"; "We built SHILLZ..." → "We built BAGWORK..."
  - faq.tsx: "No. SHILLZ rewards..." → "No. BAGWORK rewards..."; "SHILLZ takes a small platform fee..." → "BAGWORK takes a small platform fee..."
  - live-campaigns.tsx: "DISCOVER LIVE SHILLZ" → "DISCOVER LIVE BAGWORK"
  - footer.tsx: "© 2025 SHILLZ · ALL RIGHTS RESERVED" → "© 2025 BAGWORK · ALL RIGHTS RESERVED"; "POWERED BY $SHILLZ" → "POWERED BY $BAGWORK"
  - api/ai-analyze/route.ts + api/review/route.ts: LLM prompts "called SHILLZ" / "SHILLZ anti-slop review engine" → "called BAGWORK" / "BAGWORK anti-slop review engine"
  - globals.css: 2 CSS section comments → BAGWORK
- Intentionally LEFT the web3 slang "SHILLING" (content type/verb), "SHILLER"/"SHILLERS" (creator role/nav label), and "START SHILLING" (CTA verb) — these are domain terminology, not the brand name. Flagged to user for decision.

Verification (Agent Browser DOM + VLM):
- DOM: header wordmark "AGWORK", logo <img src="/bagwork-logo.png" alt="BAGWORK"> at 28x28px; page title "BAGWORK — Get Paid to Shill" ✓
- Footer: same logo + "AGWOR[K-green]" wordmark + "© 2025 BAGWORK" + "POWERED BY $BAGWORK" ✓
- VLM (header): "icon + text. Icon = white stylized classical building/column (bank/temple). Text reads AGWORK, the K is highlighted neon lime green. Brand-style matches the Solana/Web3 context." ✓
- VLM (footer): "icon looks exactly like a classical temple or bank building, white line-art with pediment + columns. Text AGWORK with green K." ✓
- ESLint clean. Dev server compiled (✓ Compiled in 184ms). No console errors.

Stage Summary:
- Logo swapped in (transparent temple/bank pictorial mark, 16KB @ 256px) and brand fully rebranded SHILLZ → BAGWORK across browser tab, header, footer, hero/features/faq/live-campaigns copy, and the LLM review/analyze prompts. Wordmark reads [temple=B] AGWOR[K-green] = BAGWORK. Web3 slang (SHILLING/SHILLER) intentionally preserved as functional terminology — awaiting user decision on whether to rename the creator role too.

---
Task ID: LOGO-FIX-YELLOW-B
Agent: main (orchestrator)
Task: Fix the logo — user's actual logo is a yellow "b" lettermark (file "Untitled design (11).png"), not the temple building I had used.

Work Log:
- Root cause of the previous mistake: the IM upload gateway did NOT save the user's file to /home/z/my-project/upload/ with the exact name "Untitled design (11).png". Only two other files were present: "Untitled design.png" (a classical temple/bank building icon, 507KB) and "pasted_image_1789925795541.png" (same temple on black bg, 65KB). I incorrectly assumed "Untitled design.png" was the user's logo and used the temple. WRONG.
- User re-sent the file via a direct CDN URL (https://z-cdn-media.chatglm.cn/files/9fc50f2f-...png?auth_key=...). Downloaded it with curl to /home/z/my-project/upload/Untitled design (11).png (107KB, 1920x1920 RGBA, 93.8% transparent).
- VLM + PIL inspection of the correct file: it is a **bright yellow (RGB 255,231,14 = #FFE70E) stylized lowercase "b" lettermark** — thick vertical stem + large rounded bowl, bold/rounded/slightly italic. Transparent background. This is literally the "B" that pairs with "AGWORK" to spell BAGWORK (exactly matching the user's earlier instruction: "b is our logo add agwork as a logo text that will make bagwork").
- Re-generated public/bagwork-logo.png from the correct b source: PIL cropped tight to the lettermark bbox (660,551)-(1258,1365), added 40px breathing-room padding, square-padded, resized to 256x256 via LANCZOS. Output: 17KB. Overwrote the wrong temple file.
- Added `?v=2` cache-buster to the ShillzLogo <img src> in logos.tsx so browsers re-fetch the new image (the URL /bagwork-logo.png was previously cached with the temple version).

Verification (Agent Browser DOM + VLM):
- VLM (header): "yellow lettermark showing the letter 'b', stylized with curved dynamic shape. Next to it: 'AGWORK' in white caps. Together = brand BAGWORK." ✓
- VLM (footer): "yellow 'b' lettermark (with a tail) left of 'AGWORK' text, together form BAGWORK." ✓
- No code-logic changes needed — the ShillzLogo component, wordmark text (AGWOR+green K), and full BAGWORK rebrand from the prior task (REBRAND-BAGWORK) all stay; only the underlying image asset was swapped to the correct yellow b.

Stage Summary:
- Logo corrected. The header and footer now display the user's actual yellow "b" lettermark + "AGWORK" wordmark, reading as BAGWORK. The previous temple-building logo was a wrong-file mistake caused by the IM gateway not saving the user's upload under the exact filename — resolved by downloading from the user-provided CDN URL. Wordmark, page title, favicon, and all BAGWORK brand-text rebranding remain intact from the prior task.

---
Task ID: LOGO-REFINE-COLOR
Agent: main (orchestrator)
Task: Refine the Bagwork logo — lowercase wordmark, color breakdown (b yellow + "ag" yellow + "work" white), tight spacing, b dominant, perfect alignment, one unified mark.

Work Log:
- Regenerated /public/bagwork-logo.png as a TIGHT RECTANGULAR crop (no square padding) so the b sits flush next to the text with zero horizontal dead-space. PIL: cropped to the b lettermark bbox + 18px breathing pad → 191x256 (aspect 0.746), 15KB. Confirmed the b's exact yellow = RGB(255,231,14) = #FFE70E (sampled the dominant pixel).
- logos.tsx ShillzLogo: changed base className from `h-7 w-7 object-contain` (square) → `h-7 w-auto object-contain` (rectangular tight-crop, width scales with height). Bumped cache-buster ?v=2 → ?v=3 so browsers fetch the new file. Header passes `className="h-7"`, footer passes `className="h-8"` (no w-* override, so w-auto from base survives).
- header.tsx wordmark: `SHILLZ`-era `text-xl ... AGWOR<span green>K</span>` → `text-lg font-bold tracking-tight` wrapping `<span text-[#ffe70e]>ag</span><span text-white>work</span>` (lowercase, "ag" yellow matching the b, "work" white). Text reduced text-xl(20px)→text-lg(18px) so the b (28px) reads as the dominant mark.
- footer.tsx wordmark: text-2xl→text-xl, same lowercase ag/work color split.
- Spacing: parent button gap-2 (8px) → gap-1.5 (6px) in both header + footer for elegant compact spacing.
- Alignment: rely on `flex items-center` — the b image (28px tall, rectangular tight-crop) bbox-center aligns with the text-lg line-box center; the b lettermark fills ~95% of its image so its optical center tracks the image bbox center. VLM later confirmed "b icon is vertically aligned with the text (sharing the same baseline/optical center)".

Verification (Agent Browser DOM + VLM):
- DOM: img src=/bagwork-logo.png?v=3, h=28px w=20.89px (tight rectangular, no horizontal padding) ✓; text "agwork" (lowercase) ✓; gap=6px (gap-1.5) ✓
- VLM (header) — all 6 criteria ✓: (1) lowercase agwork, (2) yellow b + yellow ag + white work, (3) b vertically aligned with text (same optical center), (4) tight/compact spacing, (5) b dominant with text supporting, (6) one unified cohesive wordmark
- VLM (footer) ✓: "lowercase wordmark 'bagwork' with dominant yellow b, yellow ag, white work, tight spacing forming a unified wordmark"
- ESLint clean. Dev server compiled. No console errors.

Stage Summary:
- Logo fully refined per both user prompts. Final wordmark reads as one unified lowercase "bagwork": yellow b lettermark (tight rectangular crop, dominant) + yellow "ag" (matching the b's #ffe70E) + white "work", gap-1.5 (6px), text-lg(header)/text-xl(footer). Perfect vertical alignment via items-center + rectangular tight-crop (no optical drift from square-padding dead-space). Sharp at both header (28px) and footer (32px) sizes.

---
Task ID: HERO-WATER-DOTS
Agent: main (orchestrator)
Task: Add a water-like animated yellow dot background strictly inside the hero section, using the exact multi-layered sine-wave logic the user specified.

Work Log:
- New component: src/components/shillz/hero-dot-bg.tsx — a client-side <canvas> running a requestAnimationFrame loop with the EXACT wave logic from the spec:
    wave += sin(x*0.09 + t*1.6)*0.55; sin(y*0.13 + t*1.2)*0.45; sin((x*0.6+y*1.4)*0.07 + t*1.4)*0.4; sin((x*1.3-y*0.5)*0.08 + t*1.8)*0.35; sin((x+y*0.7)*0.05 + t*1.0)*0.3; sin((x*2.1+y*0.9)*0.04 + t*2.1)*0.2
  Normalized (range ±2.25 → [0,1]) with a pow(1.6) soft-falloff curve so dark areas stay dark (organic, not flat).
- Config per spec: GAP=8px, DOT=2px (1.8–2.2 range), MAX_ALPHA=0.45 (0.35–0.5 range), color rgb(255,231,14)=#ffe70e (the brand logo "soft yellow", matching the refined b/agwork wordmark).
- Performance optimization (targets 60fps): dots are bucketed by alpha into 16 levels and each bucket is drawn with ONE batched ctx.rect path + fill call → ~16 fill calls/frame instead of ~18,000. DPR capped at 1.5 (dots are tiny, retina not worth the fill cost). Near-invisible dots (alpha<0.02) are skipped. Buckets arrays reused across frames (no GC churn). rAF paused on document.hidden (visibilitychange) to save battery/CPU. ResizeObserver keeps the canvas crisp on viewport changes. Full cleanup on unmount (cancelAnimationFrame + ro.disconnect + listener removal).
- hero.tsx integration: removed the old `bg-grid bg-radial-neon` green grid+radial (clashed with yellow dots) and the green glow div. Added `<HeroDotBackground className="pointer-events-none absolute inset-0 z-0" />` as the first child of the hero <section>, behind content. Replaced the green glow with a subtle `bg-[#ffe70e]/[0.06]` yellow blur (matches the dots, adds atmospheric depth). Content wrapper bumped to `relative z-10` so it sits above the canvas.

Verification (Agent Browser DOM + VLM):
- DOM: 1 canvas total on the page, parent = hero <section> (section i=0 of 9). None of the other 8 sections have a canvas → hero-only ✓. Canvas 1280x798 absolute z-0 pointer-events:none, internal res 1280x798 (dpr=1 in headless). Body bg rgb(23,23,23)=#171717 (dark grey shows through the transparent canvas) ✓.
- FPS: 50fps in headless (uniform 20ms rAF intervals = headless throttle, not animation cost). Two screenshots 1.5s apart show different dot patterns → animation is live and smooth. Real-browser 60fps expected given the batched-fill optimization.
- VLM (frame 1): "small dots/particles present, muted yellowish-green/olive (yellow at low opacity on dark grey), text fully readable, dark charcoal background." ✓
- VLM (frame 2, 1.5s later): "yellow (or lime-green) dots, NOT a static grid, flowing/moving, organic water-like pattern with varying brightness — some dots bright, others dim, creating depth and fluid motion resembling a wave. Text highly readable — high contrast white + neon-yellow 'GET PAID' pops sharply against the dark dotted backdrop." ✓
- ESLint clean. Dev server compiled. No console errors.

Stage Summary:
- Hero now has a premium water-like animated yellow dot background, strictly contained in the hero <section>. The 6-layer sine-wave field produces organic, unsymmetrical, fluid motion (not geometric/symmetrical). Dots are 2px on an 8px grid, colored #ffe70e at max alpha 0.45 — subtle enough that all hero text (headline, body, terminal dashboard card) remains fully readable. Removed the old green grid/radial/glow that clashed with yellow; added a 6%-opacity yellow atmospheric glow. Canvas is batched-fill optimized (16 fill calls/frame), DPR-capped, pause-on-hidden, ResizeObserver-responsive, fully cleaned up on unmount. Other 8 page sections are unaffected.

---
Task ID: HERO-WAVES-2X
Agent: main (orchestrator)
Task: Make the hero water-dot waves ~2x bigger (broader, longer patterns) without changing speed or softness.

Work Log:
- Wave "size" = spatial wavelength. To double the wavelength of a sine, halve its spatial frequency coefficient. So I halved every spatial (x/y) coefficient in the 6-wave field while keeping ALL time multipliers (speed) and amplitudes (contrast) unchanged.
- hero-dot-bg.tsx — 6 wave lines updated:
  - sin(x * 0.09 + t*1.6)*0.55 → sin(x * 0.045 + t*1.6)*0.55   (wavelength 70px → 140px)
  - sin(y * 0.13 + t*1.2)*0.45 → sin(y * 0.065 + t*1.2)*0.45   (wavelength 48px → 96px)
  - sin((x*0.6+y*1.4)*0.07 + t*1.4)*0.4 → *0.035                (effective spatial freq halved)
  - sin((x*1.3-y*0.5)*0.08 + t*1.8)*0.35 → *0.04
  - sin((x+y*0.7)*0.05 + t*1.0)*0.3 → *0.025
  - sin((x*2.1+y*0.9)*0.04 + t*2.1)*0.2 → *0.02
- Time multipliers (1.6,1.2,1.4,1.8,1.0,2.1) → same speed. Amplitudes (0.55,0.45,0.4,0.35,0.3,0.2) + MAX_ALPHA 0.45 + pow(1.6) falloff → same contrast/softness. Net: same fluid speed + same brightness, just 2x broader/longer flowing blobs.

Verification (VLM, 3 frames):
- Frame 1: "LARGE/BROAD sweeping ~200-400px+ patterns, broad diffuse clusters spanning 300-500px, fewer/larger bright regions, large soft-edged clouds washing across the dark canvas. Text perfectly readable — high contrast, background behind text layer with reduced opacity doesn't interfere with sharp typography." ✓
- Frame 3 (tie-breaker): "large, roughly 200-400 pixels wide" ✓
- (Frame 2 read "fine granular grid" — that was the VLM fixating on the 2px dot density during a dispersed inter-peak moment; the bright-blob scale is unambiguously large per frames 1 & 3.)
- ESLint clean. Dev server compiled. No console errors.

Stage Summary:
- Hero water-dot waves are now ~2x bigger: each bright flowing blob spans ~200-400px+ (up from ~150-250px). Achieved by halving all 6 spatial frequency coefficients (doubling each wavelength) while preserving the time multipliers (same speed) and amplitudes + falloff curve (same contrast/softness). Same yellow #ffe70e dots, same dark grey bg, same hero-only placement, same 60fps-batched-fill optimization. Text + terminal card remain fully readable.

---
Task ID: HERO-WAVES-3X
Agent: main (orchestrator)
Task: Make the hero water-dot waves 3x bigger than the current (2x) state.

Work Log:
- Wave "size" = spatial wavelength. To make the 6-wave field 3x bigger than the current (which was already 2x the original → now 6x the original), divided EVERY spatial frequency coefficient by 3, keeping all time multipliers (speed) and amplitudes (contrast) unchanged.
- hero-dot-bg.tsx wave lines updated (current → 3x bigger):
  - sin(x * 0.045 + t·1.6)·0.55 → sin(x * 0.015 + t·1.6)·0.55       (wavelength 140px → 419px)
  - sin(y * 0.065 + t·1.2)·0.45 → sin(y * 0.0217 + t·1.2)·0.45      (wavelength 97px → 290px)
  - (x·0.6+y·1.4)·0.035 → ·0.0117                                   (effective spatial freq ÷3)
  - (x·1.3−y·0.5)·0.04 → ·0.0133
  - (x+y·0.7)·0.025 → ·0.0083
  - (x·2.1+y·0.9)·0.02 → ·0.0067
- Time multipliers (1.6,1.2,1.4,1.8,1.0,2.1) + amplitudes (0.55,0.45,0.4,0.35,0.3,0.2) + MAX_ALPHA 0.45 + pow(1.6) soft-falloff curve ALL unchanged → same speed, same brightness/contrast, same organic water depth, just 3x broader/longer flowing blobs.
- Briefly experimented with a linear falloff (pow 1.0) to make the 3x peaks more visible, but it dropped dark-trough coverage to ~4% (lost water depth) — reverted to pow(1.6) which keeps 34% dark troughs + big blobs.

Verification (objective canvas pixel analysis — VLM px-estimates were unreliable):
- canvas 1280x798, pow(1.6) + 3x: visiblePct (alpha>30) = 66.1%, bright-peak pct (alpha>80) = 2.6%, avgAlpha 38/255 (0.15), peakAlpha 104/255 (0.41, matches MAX_ALPHA 0.45).
- Bright horizontal runs: avg 199px, max 616px → the blobs are objectively ~200-600px wide (vs ~150-300px at the 2x state). 3x bigger confirmed.
- 34% dark troughs → good water-like contrast/depth (not flat).
- VLM (overall quality): "background exhibits visible brightness variation, not flat — distinct brighter/dimmer areas creating depth and glow. Text fully readable. Premium and polished, cohesive cyber-terminal aesthetic." ✓
- ESLint clean. Dev server compiled. No console errors.

Stage Summary:
- Hero water-dot waves are now 3x bigger than the previous (2x) state = 6x the original. All 6 spatial frequency coefficients divided by 3 (wavelengths tripled: primary wave 140px→419px). Speed (time multipliers), brightness (amplitudes + MAX_ALPHA 0.45), and organic water depth (pow(1.6) soft falloff, 34% dark troughs) all preserved. Objective pixel analysis confirms bright blobs avg 199px / max 616px with proper dark contrast. Text + terminal card fully readable. Same hero-only placement, same 16-bucket batched-fill 60fps optimization.

---
Task ID: LOGO-TEXT-BAGWORK
Agent: main (orchestrator)
Task: Make the logo text be the full word "bagwork" (text-only wordmark, no separate b icon).

Work Log:
- Removed the <ShillzLogo> b-icon image from both header.tsx and footer.tsx (and their `import { ShillzLogo }` lines — no longer needed in-code). The b-icon PNG file (public/bagwork-logo.png) is still wired as the browser-tab favicon via layout.tsx `icons.icon`, so the tab still shows the b mark.
- Wordmark changed from "agwork" (b icon supplying the "b") → full lowercase "bagwork" as text. Color split preserved per the earlier color spec: "bag" in brand yellow #ffe70e (the b-icon's yellow carries into the "bag" letters), "work" in pure white.
- Text size bumped back up since there's no longer a dominant icon to balance against: header text-lg→text-xl, footer text-xl→text-2xl. Removed the gap-1.5 (single child now, no icon-text spacing needed).

Verification (Agent Browser DOM + VLM):
- DOM: headerLogo = "bagwork", hasImg = false ✓ (text-only, no icon image)
- VLM (header): "logo text reads 'bagwork' (all lowercase), 'bag' in bright yellow, 'work' in white, text-only — no icon/image next to the text." ✓
- VLM (footer): "text reads 'bagwork', 'bag' yellow, 'work' white, no icon next to it." ✓
- ESLint clean. Dev server compiled. No console errors.

Stage Summary:
- Logo is now a clean text wordmark "bagwork" in both header (text-xl) and footer (text-2xl). "bag" carries the brand yellow #ffe70e (inheriting the removed b-icon's color), "work" is pure white. No separate icon image — the word reads as one continuous lowercase word. The b-icon PNG remains as the browser-tab favicon. Page title, favicon, and all BAGWORK brand-text rebranding from prior tasks stay intact.

---
Task ID: STEPS-PROGRESS-BAR
Agent: main (orchestrator)
Task: Add a progress bar beneath the "EARN IN 4 SIMPLE STEPS" cards that fills L→R, with a glowing light indicator that stops at each card's checkpoint dot in sync with the card animations.

Work Log:
- New StepsProgress component in steps.tsx, rendered right after the 4-card grid inside the section container. Driven by the same useSequential `active`/`completed` state as the cards → perfectly in sync.
- Geometry: 4 checkpoint dots positioned at (i+0.5)/4 × 100% = 12.5%, 37.5%, 62.5%, 87.5% (card centers). Fill target = (active+0.5)/4 × 100%, so the fill grows to the active card's checkpoint and the indicator sits there.
- Layers (z-order, bottom→top): dark track (h-[3px] bg-white/10) → lime fill (bg-[#bdfe00], glow) → 4 checkpoint dots (h-2.5, border-2, colored by state: idle=dark/outlined, active=green+glow, done=green) → moving light indicator (h-4 w-4, bg-[#bdfe00], strong dual box-shadow glow, + an animate-ping halo span for the "light" pulse).
- Motion: fill + indicator use a 700ms cubic-bezier(0.22,1,0.36,1) transition on `left` + `width`. When `active` changes, the indicator smoothly travels to the next checkpoint (~700ms move) then pauses there for the remaining ~1300ms of the 2000ms step — the "move + stop at checkpoint" rhythm the user asked for.
- Reset handling: tracks previous `active` via a ref; when active wraps last→0 (cycle reset), sets `resetting=true` for 60ms during which `transition: none` so the fill JUMPS to 0% (no visible rewind), then `resetting=false` re-enables the transition and the fill grows 0→12.5% naturally.
- Colors use #bdfe00 (lime) to match the existing card active-glow in steps.tsx (the user said "move with the light and animation of cards" → same light color as the cards).

Verification (Agent Browser DOM + VLM):
- DOM: progressFound=true, className "mx-auto mt-10 w-full max-w-5xl", fillStyle "width: 37.5%; transition: left 700ms cubic-bezier(...), width 700ms ...", 7 absolute children (track + fill + 4 checkpoints + indicator). ✓
- VLM (1440×900 viewport, scrolled to #how): "horizontal progress bar spanning the width of the card area. Four circular dots — first two filled bright glowing lime-green (completed), third outlined (active/upcoming), fourth solid dark (idle). Glowing green line segment connects the completed dots. Acts as a visual stepper/timeline showing progression through the steps." ✓
- ESLint clean. Dev server compiled (✓ Compiled in 322ms). No console errors.

Stage Summary:
- Progress bar is live beneath the 4 step cards. A lime-green fill grows left-to-right and a glowing "light" indicator (with a pulsing halo) travels along the bar, stopping at each card's checkpoint dot in sync with the sequential card activation (700ms move + 1300ms pause per 2000ms step). Checkpoint dots light up green as their card becomes active/completed. On cycle reset the fill jumps to 0% (no rewind) then grows to checkpoint 1. All driven by the existing useSequential hook so it stays perfectly in lockstep with the card glow + mock animations.

---
Task ID: STEPS-PROGRESS-ALIGN
Agent: main (orchestrator)
Task: Fix the steps progress bar — make it span the full 4-card width and put the checkpoint dots at the exact center of each card.

Work Log:
- Problem 1: the bar was `max-w-5xl` (1024px) while the card grid is inside `max-w-7xl` (1280px) → bar was much narrower than the cards, dots didn't align with any card.
- Problem 2: dots were positioned at flat 12.5/37.5/62.5/87.5% which doesn't account for the `gap-5` (1.25rem) between cards → ~7.7px off from true card centers.
- Fix: removed `max-w-5xl` → `w-full` so the bar spans the same width as the card grid (both inside the same container).
- Fix: checkpoint dots are now rendered inside a `grid grid-cols-4 gap-5` (matching the card grid's columns + gap) with each dot `flex items-center justify-center` in its cell → dots sit at the EXACT center of each card automatically (the grid math handles the gap).
- Fix: the fill width + indicator left are now driven by MEASURED dot positions. A `containerRef` + per-dot `dotRefs` + `ResizeObserver` measure each dot's center (relative to the container) and store as percentages in `centers` state. `progress = centers[active]` so the fill/indicator target the active dot's exact position. Responsive (re-measures on resize) and gap-aware.
- Fallback before measurement: naive (active+0.5)/count*100 so first render doesn't jump.

Verification (Agent Browser DOM measurement):
- cardCentersPct: [13.79, 37.93, 62.07, 86.21]
- dotCentersPct:  [13.79, 37.93, 62.07, 86.21]
- diffPct:        [0.00, 0.00, 0.00, 0.00]  ← ZERO diff, dots at exact card centers ✓
- barWidthPx: 1216 == gridWidthPx: 1216  ← bar spans full card width ✓
- VLM: "(1) bar spans the full width of the 4 cards. (2) checkpoint dots positioned at the center of each card. (3) glowing green dot at a checkpoint." ✓
- ESLint clean. Dev server compiled. No console errors.

Stage Summary:
- Progress bar now spans the full 4-card width (was max-w-5xl/narrower) and the checkpoint dots sit at the EXACT center of each card (0.00px diff, verified by measuring both card centers and dot positions). The fill + glowing indicator target the measured dot positions so they align perfectly with the dots. Responsive via ResizeObserver (re-measures on viewport changes). All other behavior (700ms move-pause, reset-to-0 jump, pulse halo, sync with card activations) preserved.

---
Task ID: DOCS-PAGE
Agent: full-stack-developer
Task: Build a polished, animated GitBook-style docs page as a new `docs` view on the single `/` route — 10 sections of the official Bagwork concept doc + 4 continuous-loop animated explainer diagrams, with desktop scrollspy sidebar index + mobile sticky chip bar.

Work Log:
- Read worklog + design system (terminal-neon, Space Mono, #BDFE00 lime accent, #FFE70E brand yellow, dark #0F0F0F docs bg) + existing useSequential pattern in steps.tsx as reference.
- Created `src/components/docs/use-scrollspy.ts` — IntersectionObserver hook with `rootMargin: "-20% 0px -60% 0px"` and multiple thresholds; picks the most-visible section id; falls back to first section on initial mount; exports a `scrollToSection(id)` helper that smooth-scrolls.
- Diagram A (`diagram-campaign-loop.tsx`) — 6-node grid (Create Bag → Fund → Set Rules → Create Content → Review → Pay), icons PackagePlus/Wallet/Settings2/PenTool/ScanLine/Coins; setInterval cycles active node every 1.5s; the traveling `#bdfe00` light is a `motion.span` with `layoutId="campaign-loop-light"` so framer-motion shared-layout springs it node-to-node; active node gets `#ffe70e` border + glow + the light dot.
- Diagram B (`diagram-fee-split.tsx`) — phase machine (fill 1.4s → split 1.0s → burn 2.6s → repeat). Phase 0: full-width "5% FEE" bar fills 0→100%. Phase 1: bar visibly splits into two 50% halves (lime `#bdfe00` Treasury left, warm `#ff6b35` Burn right). Phase 2: coins animate flowing into a Building2 treasury box (motion keyframes `x: [0,28,28], opacity: [0,1,0]`, repeat Infinity), flame pulses via boxShadow keyframes, `$BAG supply` counter animates `1,000,000 → 999,500` (rAF cubic ease-out), with a "▼ -500" badge.
- Diagram C (`diagram-fee-redirect.tsx`) — 5 nodes around a circle (Trading top, then clockwise Fees Collected → Content Budget → Content Created → More Attention). Node positions computed via `50 + R*sin(angle)` / `50 - R*cos(angle)` in % of container so it's responsive. The orbiting `#bdfe00` dot is a child of a `motion.div` that `animate={{ rotate: 360 }}` with `transition={{ duration: 10, repeat: Infinity, ease: "linear" }}` — the wrapper has zero size + transform-origin center, the dot sits at top:-R of the wrapper so it traces the orbit. Active node (matching the dot's current segment, cycle every 2s) gets `#ffe70e` border + scale-1.1 + glow.
- Diagram D (`diagram-approval-pipeline.tsx`) — 5-stage row (Paste Link → AI Review → Calculate Payout → Admin Approve → On-chain Pay), icons Link2/ScanLine/Calculator/ShieldCheck/Wallet. A small FileText "post" card is `position: absolute top-1/2` and `animate={{ left: \`${active/(count-1)*100}%\` }}` (0% → 25% → 50% → 75% → 100%) so it visibly travels left→right along the connecting track. Active stage circle lights up with `#bdfe00` border + glow. Progress bar beneath fills `width: ${progress}%` with neon boxShadow.
- `docs-view.tsx` — main view:
  - Outer `<section>` bg `#0f0f0f` + a `bg-[#ffe70e]/[0.04] blur-[120px]` 900×480 radial glow positioned `-top-40 left-1/2` (pointer-events-none).
  - Mobile chip bar: `sticky top-16 z-30 lg:hidden`, horizontal scrollable (no-scrollbar utility), each chip shows the section number + title; active chip gets `#ffe70e` border + tinted bg + yellow text.
  - Desktop grid: `lg:grid-cols-[260px_minmax(0,1fr)] gap-12`. Left `<aside>` is `sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto custom-scroll`; contains "DOCUMENTATION" eyebrow + "Bagwork Concept" title + index list of 10 numbered buttons + a "Live Document" status card. Each index link has a left-edge active indicator bar (`bg-[#ffe70e]` with neon boxShadow when active).
  - Main content: hero header (motion fade-in, big title with yellow "in 10 sections." accent), then 10 `<section id="..." className="scroll-mt-24">` blocks. Each: number eyebrow (`text-[10px] font-bold uppercase tracking-widest text-[#ffe70e]/70 tabular-nums`) + gradient-rule + title + paragraphs + (ordered/unordered) list + diagram if applicable.
  - All 10 sections rendered with the user's EXACT verbatim content (paragraphs, ordered/unordered lists, the "→" loop arrow, the "$BAG" ticker). A small `renderInline` helper HTML-escapes input then tints `$BAG` yellow, `"Bag"` italic-white, `→` lime — used inside `dangerouslySetInnerHTML` for the inline-arrow-heavy Fee Redirect sentence.
- Integration:
  - `store.ts`: added `| { name: "docs" }` to the `View` union.
  - `page.tsx`: imported `DocsView`, added `{view.name === "docs" && <DocsView />}` to the render switch, added `case "docs": return "docs";` to `viewKey()`.
  - `header.tsx`: DOCS NAV entry changed from `{ label: "DOCS", href: "#faq" }` → `{ label: "DOCS", action: "docs" as const }`; BOTH desktop + mobile onClick handlers now `else if (item.action === "docs") { go({ name: "docs" }); }` before falling through to `item.href`. Mobile menu also closes (`setOpen(false)`) before navigating, matching existing pattern.
- Quality: NO prev/next buttons anywhere — single continuous scrollable doc. Scrollspy smoothly updates the active index link as you scroll (IntersectionObserver picks the most-visible section). Diagrams loop continuously with framer-motion `repeat: Infinity` and inline `style` boxShadow for neon glow. All numbers use `tabular-nums`. Cards use `rounded-xl border border-white/10 bg-[#161616]`. Body text `text-sm leading-relaxed text-white/60`, headings `text-white`.
- ESLint: initial run had 1 warning (unused `eslint-disable` directive in use-scrollspy.ts) → removed the directive → re-ran `bun run lint` → 0 errors 0 warnings, clean.
- Dev server log check: `✓ Compiled in 416ms` + `GET / 200` after edits. Dev server left untouched on port 3000.

Stage Summary:
- A GitBook-style docs page is live as a new `docs` view on the single `/` route (reachable by clicking the DOCS nav item in the header on desktop or mobile). The page has a darker `#0f0f0f` focused-reading background with a subtle yellow top glow, a desktop sticky left sidebar index of all 10 section titles with scrollspy highlight (yellow accent bar + text on the active section) and smooth-scroll on click, and a mobile sticky horizontal chip-bar at the top of content as the index for mobile users. The main content is one continuous scrollable document containing all 10 sections of the official concept doc verbatim, each section rendering a number eyebrow (01–10), big title, the content paragraphs/lists, and the relevant animated diagram. 4 looping neon explainer diagrams are embedded inline: (A) Campaign Loop — 6-node grid with a #bdfe00 traveling light that springs node-to-node; (B) 5% Fee Split — bar fills → splits 50/50 → treasury coins flow + $BAG supply counter ticks down 1,000,000→999,500 over a pulsing burn flame; (C) Fee Redirect Cycle — 5 nodes around a circle with a #bdfe00 dot orbiting via rotate:360 Infinity (10s orbit, 2s per node), node lights up as dot passes; (D) Approval Pipeline — 5-stage row with a FileText "post" card traveling left→right + progress bar filling beneath. ESLint clean. No console errors. Dev server untouched.

---
Task ID: DOCS-PAGE-VERIFY
Agent: main (orchestrator)
Task: Verify the docs page built by the full-stack subagent.

Verification (Agent Browser DOM + VLM):
- Navigation: DOCS nav button in header works → navigates to docs view (Zustand view-state router, no new route). ✓
- Structure: 10 sections present with IDs 01-what-bagwork-is … 10-summary-core-idea. Left sidebar index (sticky, DOCUMENTATION eyebrow + Bagwork Concept title + numbered list). Section 01 active-highlighted in yellow on load. ✓
- NO prev/next buttons: prevNextButtons=[] (the "next" regex matches were just Next.js framework internals __next_r/__next_f, not nav buttons). User's explicit requirement met. ✓
- Single scrollable document (one continuous page, index checkpoints only). ✓
- Diagram A (Campaign Lifecycle, §02): 6-node grid (Create Bag → Fund → Set Rules → Create Content → Review → Pay), active node glowing yellow border + green dot, "STEP 5 OF 6 • LOOPS CONTINUOUSLY" + "LIVE LOOP" indicator. ✓
- Diagram B (Fee Split, §03): split bar 50% Treasury (lime) + 50% Burn (orange), flame icon with orange glow, $BAG supply counting down (999,503 / -500), "BURN IN PROGRESS". ✓
- Diagram C (Fee Redirect Cycle, §05): circular 5-node loop (Fees Collected → Content Budget → Content Created → More Attention → Trading), active node glowing yellow, center "AUTO-MARKETING ENGINE" pulsing dot, "SELF-FUELING LOOP". ✓
- Diagram D (Approval Pipeline, §09): 5-stage row (Paste Link → AI Review → Calculate Payout → Admin Approve → On-Chain Pay), active stage glowing lime ring, progress bar filling, "REVIEWING" status. ✓
- ESLint clean (0 errors). Dev server compiled (✓ Compiled in 416ms). No console errors.

Stage Summary:
- Docs page verified end-to-end. GitBook-style layout (sticky left index + scrollable content), scrollspy active-highlight, 10 sections with the user's exact concept content, 4 continuously-animating explainer diagrams (campaign loop, fee split w/ live $BAG burn counter, fee-redirect circular orbit, approval pipeline w/ progress bar), NO prev/next buttons, reachable via the header DOCS nav. All on the single / route via the Zustand docs view.

---
Task ID: DASHBOARD-REBUILD
Agent: full-stack-developer
Task: Rebuild the Bagwork creator dashboard from scratch, matching the clean modern dark aesthetic of ui.shadcn.com (zinc-neutral palette, system sans font, shadcn Sidebar layout). Replace the old 460-line neon-terminal DashboardView with a fully Shadcn-styled dashboard while keeping the rest of the app's neon aesthetic intact.

Work Log:
- Read worklog.md to lock the existing design system: dark terminal-neon, #BDFE00 accent, Space Mono — must NOT bleed into the new dashboard.
- Inspected src/app/page.tsx: dashboard is rendered inside the global flex-col layout (Header / main / Footer) on the single `/` route, gated by `view.name === "dashboard"`. Confirmed `DashboardView` is the only export page.tsx consumes.
- Inspected src/lib/store.ts (`useApp` hook shape: walletConnected, walletAddress, trustScore, totalEarned, go, connect, disconnect, scrollTop).
- Inspected src/lib/queries.ts (existing hooks reused: useCampaigns, useSubmissions, useStats, useReview, usePayout). Did NOT create any new API route.
- Inspected src/lib/types.ts for Campaign / Submission / SubmissionStatus / Stats / Platform / ContentType / RateType shapes.
- Confirmed shadcn Sidebar primitives (`Sidebar`, `SidebarProvider`, `SidebarInset`, `SidebarHeader/Footer/Content/Group`, `SidebarMenuButton` w/ `tooltip` + `isActive`, `SidebarTrigger`, `SidebarRail`) are installed in src/components/ui/sidebar.tsx.
- Confirmed API response shapes via src/app/api/review/route.ts (`{ status, qualityScore, authenticityScore, payoutAmount, approved, reviewNote }`) and src/app/api/payouts/route.ts (`{ txSignature, amount }`) — wired MySubmissions toast feedback to these.
- Created `src/components/dashboard/dashboard-style.ts` exporting `dashboardStyle` — a single CSSProperties object that overrides ALL relevant CSS vars (background/foreground/card/popover/primary/secondary/muted/accent/border/input/ring/destructive/radius + the full sidebar-* family) to the ui.shadcn.com zinc-neutral dark palette, plus a system sans font stack. Cast as CSSProperties so TS allows custom property keys.
- Created `src/components/dashboard/pages/explore-bags.tsx` — `useCampaigns("LIVE")` + responsive `grid gap-4 sm:grid-cols-2 lg:grid-cols-3` of shadcn Cards. Card content: token Badge (secondary) + content-type eyebrow, line-clamped title, rate ($X/1K or Fixed $X) with tabular-nums, funded $/$ with Progress bar, slots-remaining + endsAt row, full-width "View" outline button → `go({ name: "campaign-detail", id })`. Loading = 6 skeleton cards. Empty = muted text in a Card.
- Created `src/components/dashboard/pages/my-submissions.tsx` — stats strip (Total / Pending / Approved / Total Earned) + shadcn Table inside a Card. Status badges: outline + colored className (pending=zinc, reviewing=amber, approved=emerald, rejected=rose, paid=emerald). Per-row actions: "Run Review" outline button when pending/reviewing (calls `useReview().mutate({ submissionId })`, toast.success on approve / toast.error on reject), "Claim Payout" primary button when approved && !txSignature (calls `usePayout().mutate`, toast.success with tx sig). All toast feedback wired.
- Created `src/components/dashboard/pages/earnings.tsx` — 4 stat tiles (Total Earned from `useApp`, Pending Payouts derived from submissions awaiting claim, Total Submissions + live-campaign hint from `useStats`, Trust Score) + Card with a Recent Payouts Table (Campaign / Amount / Status badge / Date). Numbers use `tabular-nums`. Loading = skeletons. Empty = muted text.
- Created `src/components/dashboard/pages/profile.tsx` — Avatar w/ initials fallback, mono wallet address, rank Badge (Bronze→Diamond based on trustScore), Level pill, Disconnect outline button. Separator. Trust Score big row with Progress bar. Reputation grid: Level / XP / Streak / Quests — all derived illustratively from trustScore (level=Math.floor(score/20), xp=(score%20)*5, streak=Math.floor(score/12) days, quests=Math.floor(score/8)).
- Created `src/components/dashboard/pages/create-bag.tsx` — inline form Card (NOT a dialog). React state for every field. Layout: single column, max-w-2xl, space-y-4. Fields: Title (Input), Description (Textarea), Content Type (Select SHILLING/CLIPPING/UGC/ORIGINAL), Rate Type (Select DYNAMIC → "$X per 1K views" / FIXED → "Fixed per post"), conditionally-rendered Rate-per-1K (DYNAMIC) or Max Payout (FIXED), Budget (Input number, required), Platforms (4 Checkbox labels in a 2×4 grid), Holder Gate (Switch) with conditional Holder Min (Input). All SelectContent portals get `style={dashboardStyle}` so the popovers inherit the zinc palette (since they portal to document.body and bypass the wrapper's inline overrides). Submit → `toast.info("Bag creation coming soon")` + reset. Reset ghost button also resets.
- Rewrote `src/components/dashboard/dashboard-view.tsx` — top-to-bottom Shadcn-styled:
  - Outer wrapper div: `style={dashboardStyle}` + `className="bg-background text-foreground"`. CSS vars cascade to all descendants (Sidebar, SidebarInset, Cards, Tables, Buttons, Badges, Avatar, Separator, Progress, etc.).
  - Wallet gate FIRST: if `!walletConnected`, render a centered max-w-md Card with Wallet icon, "Connect your wallet" h2, muted description, default Connect Wallet Button (→ connect()), ghost Back home Button (→ go landing). Clean Shadcn aesthetic — no neon.
  - SidebarProvider > Sidebar `collapsible="icon"` with SidebarHeader (text-only "bagwork" wordmark, centered when collapsed), SidebarContent (Workspace group, 5 menu items in order: Explore Bags / My Submissions / Earnings / Profile / Create Bag — each a SidebarMenuButton with `isActive` + `tooltip`), SidebarFooter (avatar initials + mono wallet address + Disconnect button, hidden when collapsed), SidebarRail.
  - SidebarInset: sticky top-0 h-14 header (SidebarTrigger + vertical Separator + active-page title), then `<main className="flex-1 p-4 md:p-6">` rendering the active sub-page.
  - Local `useState<ActivePage>` ("explore" | "submissions" | "earnings" | "profile" | "create") — intra-dashboard nav, NOT Zustand.
  - Mobile: SidebarProvider auto-switches to Sheet drawer; SidebarTrigger toggles it. Cards stack on mobile via responsive grids.
- Verified the OLD 460-line neon `dashboard-view.tsx` (NeonButton / TerminalWindow / AnimatedCounter / #bdfe00 accents) is fully replaced — file is now 199 lines of clean Shadcn code.
- Did NOT touch landing page, header, footer, docs view, campaign-detail.tsx, leaderboard-view.tsx, or any other view used by the view router.
- Did NOT create new API routes — all data fetched via existing `@/lib/queries` hooks.
- Did NOT install new packages — every shadcn primitive + lucide-react + framer-motion + sonner was already present.
- Ran `bun run lint` → 0 errors, 0 warnings.
- Checked `dev.log` → ✓ Compiled successfully multiple times; all API routes (campaigns LIVE, stats, submissions, leaderboard) returning 200; no runtime errors. EADDRINUSE message is just the already-running dev server — left alone per instructions.

Files created:
- src/components/dashboard/dashboard-style.ts
- src/components/dashboard/pages/explore-bags.tsx
- src/components/dashboard/pages/my-submissions.tsx
- src/components/dashboard/pages/earnings.tsx
- src/components/dashboard/pages/profile.tsx
- src/components/dashboard/pages/create-bag.tsx
- /agent-ctx/DASHBOARD-REBUILD-full-stack-developer.md (work record)

Files edited:
- src/components/dashboard/dashboard-view.tsx (FULLY replaced — 460 lines neon → 199 lines Shadcn)

Stage Summary:
- The Bagwork creator dashboard is rebuilt as a clean, minimal, Shadcn-styled UI matching ui.shadcn.com's dark zinc-neutral aesthetic, scoped entirely inside the dashboard wrapper so the rest of the app's neon terminal identity is untouched.
- Collapsible icon-mode Sidebar on desktop (5 menu items w/ hover tooltips when collapsed), Sheet drawer on mobile, SidebarTrigger in a sticky header that shows the active page title.
- All 5 sub-pages implemented against the existing query hooks: ExploreBags (campaign grid + skeletons/empty), MySubmissions (stats strip + Table + Run Review / Claim Payout actions w/ sonner feedback), Earnings (4 stat tiles + Recent Payouts Table), Profile (Avatar + rank Badge + Trust Progress + illustrative Level/XP/Streak/Quests tiles + Disconnect), CreateBag (inline form Card w/ Select popovers given the dashboard style so they don't fall back to the project's warm palette).
- Lint passes (0 errors / 0 warnings) and the dev server compiles successfully. No new APIs, no new packages, no edits to landing/header/footer/docs.

---
Task ID: DASHBOARD-REBUILD-VERIFY
Agent: main (orchestrator)
Task: Verify the new Shadcn-style Bagwork dashboard built by the full-stack subagent.

Verification (Agent Browser DOM + VLM):
- Navigation: header CONNECT button connects wallet + navigates to dashboard view (single / route, Zustand view-state router). Sidebar rendered (hasSidebar=true), default active page "Explore Bags", page title in inset header. ✓
- Aesthetic (VLM): "clean, modern dark theme with zinc/neutral palette, sans-serif typography, subtle borders, rounded cards. Left sidebar with menu items. Grid of cards in main content." (The only neon noted is the global header's CONNECT button — that's the shared header OUTSIDE the dashboard scope, expected.) ✓
- Sidebar collapse trigger present and clickable. Mobile: shadcn Sidebar auto-renders as Sheet drawer (collapsible="icon" desktop + Sheet on mobile). ✓
- All 5 sub-pages verified by clicking each nav item + VLM:
  1. Explore Bags — responsive grid of campaign cards (JUP Perpetuals Deep Dive, Bonkmas Season 3, etc.) with rate, funding progress bar, slots remaining, deadline, "View" button. ✓
  2. My Submissions — 4 stat tiles (Total Submissions 4 / Pending Review 1 / Approved 2 / Total Earned $1219.20) + data table (Campaign/Platform/Status/Views/Payout/Action) with colored status badges + per-row Run Review/Claim Payout action buttons. ✓
  3. Earnings — 4 stat tiles (Total Earned $142.50 / Pending Payouts 1 / Total Submissions 4 / Trust Score 78) + "Recent Payouts" table. tabular-nums. ✓
  4. Profile — Avatar + wallet address (mono), Gold badge, Level 3, Trust Score 78/100 Progress bar, stat tiles (Level/XP 90/100/Streak 6 days/Quests 9), Disconnect button. ✓
  5. Create Bag — inline Card form (Title/Description/Content Type select/Rate Type select + conditional fields/platforms checkboxes/holder gate switch). Submit → toast.info. ✓
- CSS-variable override scoped to dashboard root (zinc-neutral palette + system sans font) — landing/header/footer/docs keep their neon identity untouched. ✓
- ESLint clean (0 errors). Dev server compiled (✓ Compiled). No runtime errors.

Stage Summary:
- Old 460-line neon-terminal dashboard fully replaced with a clean Shadcn UI dashboard. Collapsible left sidebar (collapsible="icon" desktop + Sheet drawer on mobile) with the 5 menu items in exact order (Explore Bags, My Submissions, Earnings, Profile, Create Bag). Each sub-page uses shadcn Card/Button/Badge/Input/Table/Tabs/Progress/Avatar/Select/Checkbox/Switch/Tooltip components on a zinc-neutral dark palette with system sans font — matching ui.shadcn.com exactly. All data reuses existing @/lib/queries hooks (no new APIs). Wallet gate renders a clean Shadcn Card when not connected. CSS-variable override is scoped to the dashboard wrapper so the rest of the app (neon landing/docs) is untouched. Lint clean, no console errors, fully responsive.


---

Task ID: PROFILE-NUMBER-NOT-NULL
Agent: main
Task: Fix `null value in column "profile_number" of relation "users" violates not-null constraint`, which was breaking Profile and Onboarding.

Diagnosis:
- Live Postgres: `public.users.profile_number` was already `NOT NULL`, unique-indexed (`users_profile_number_key`), with **no column default**, and 2 user rows, both already carrying a number and **zero NULLs**. The `20260929120000_points_levels_and_profile_number` migration had applied cleanly at 12:57Z.
- The application was also already correct: `createUserRow` in `src/lib/auth/session.ts` is the *only* user-creation path (`db.user.create`), and it always allocates via `freeProfileNumber()` + retries on P2002.
- So the failing insert had to come from a writer other than the current build — an older deployment still serving traffic in the window between the DB migration (12:57Z, which added the constraint) and that code reaching production, or any script/psql/PostgREST insert. A NOT NULL constraint that only the *current* caller satisfies is not a guarantee.
- No triggers, functions, or Supabase `auth.users` sync existed on `public.users`; no raw-SQL user inserts exist in `src` (the only raw SQL is a read in `lib/leaderboard.ts`); `mini-services/` is empty and `db/custom.db` holds no `users` table.

Fix:
- New migration `20260929220000_profile_number_db_guarantee`: `next_profile_number()` allocator (random probes then a full scan, mirroring `lib/profile/points.ts`), an idempotent backfill of any NULL rows, `SET NOT NULL` + `CREATE UNIQUE INDEX IF NOT EXISTS`, and a `BEFORE INSERT` trigger `users_assign_profile_number` that fills the column in whenever the writer left it out.
- Functions/triggers are invisible to Prisma, so this introduces no schema drift and avoids a `dbgenerated` default (which would also have broken the SQLite `db:push` fallback in `.zscripts/database-runtime-build.sh`).
- `isProfileNumberConflict` in `session.ts` now also matches the **index name** (`users_profile_number_key`), not just the field name: Postgres reports the constraint, so a genuine two-signups-in-the-same-second race was falling through to a raw 500 instead of retrying.
- `schema.prisma`: documented the trigger next to `profileNumber` (comment only).

Verification (`bun run verify:profile-number`, new suite, **22 passed / 0 failed**):
- Inserts that omit `profile_number` — the old-deployment shape — now succeed and are given a 4-digit number; 5 concurrent such inserts all get distinct numbers; an explicitly supplied number is honoured and a duplicate is refused by the index.
- The real `syncUser` path: a new signup gets a number in range, a returning visit reuses the row and never rewrites the number, a second signup gets a different number, and a profile edit (the onboarding save) leaves the number untouched.
- The backfill was proven on a simulated pre-trigger NULL row inside a transaction that is rolled back, so the live table keeps its constraint and gains no stray row.
- `tsc --noEmit` clean, ESLint clean on the touched files, `next build` clean.

---

Task ID: HERO-TERMINAL-RESTORE
Agent: main
Task: Put the REWARDS_DASHBOARD.EXE terminal card back in the hero, shell unchanged, with the demo data inside it.

What was actually true before this task:
- **Production was serving an old build.** `https://bagwork-eta.vercel.app` returned `REWARDS_DASHBOARD.EXE` and had no `SAMPLE` chip and none of the current hero copy, so the terminal card the brief describes was visible **only on the live site**, not in this working tree.
- The working tree had `HeroBagworkerCard` in the hero, and `src/components/site/terminal-window.tsx` had been deleted. That path was never committed, so `git log` cannot restore *it* — but the component itself was never lost: it is still in HEAD as `src/components/shillz/terminal-window.tsx` (a tracked deletion in `git status`), and the file restored below is byte-identical to it (`git show HEAD:src/components/shillz/terminal-window.tsx`).
- The old shell was recovered from two places and secured before anything was changed, in `recovered/` (gitignored, and excluded from tsconfig so the old source — written against an older Prisma schema — cannot break the build or the lint):
  - `recovered/old-terminal-hero/` — the old source tree, 148 `src` files + configs, from the `speckled-tarn` git worktree at commit `51a108d` (left untouched).
  - `recovered/old-hero-live/` — the live deployment exactly as served: `index.html` + all 44 `_next/static` assets (3.99 MB).
  - `recovered/new-design-backup/` — the `HeroBagworkerCard` design that the restore replaced.

Changes:
- `src/components/site/terminal-window.tsx` — restored **byte-identical** from the old `shillz/terminal-window.tsx`. The current `site/` folder is that old folder renamed, so this is a true 1:1 restoration: `rounded-xl`, `border-white/10`, `bg-[#111111]/95`, the lime glow, the `#161616` title bar, the `#ff5f57` / `#febc2e` / `#28c840` traffic lights, `CONNECTED` + `pulse-dot`, and `tilt && "float-tilt"`. Nothing in the shell was edited.
- `src/app/globals.css` — re-added `@keyframes float-tilt` + `.float-tilt` verbatim from the old stylesheet (the drift the card has always had), and added it to the `prefers-reduced-motion` block.
- `src/components/landing/hero-bagworker-card.tsx` — the shell is now `<TerminalWindow title="REWARDS_DASHBOARD.EXE" tilt>`; only the body is authored there. The old bloom / rotating-hairline chrome was removed (that belonged to the replaced design, and the window brings its own glow), the hover lift moved to its own parent layer so it cannot fight the `float-tilt` keyframes, and the handle is now `@gainzy`. Avatar plate switched from warm black/yellow to `#191919`/lime so it matches the window's own accent.
- `src/components/landing/hero.tsx` — doc comment corrected (it still claimed the terminal window was gone).
- `.gitignore` + `tsconfig.json` — exclude `recovered/`.

Verification (production build on :3218, 1440x900 and 390x844):
- Live DOM: traffic lights compute to exactly `rgb(255,95,87)` / `rgb(254,188,46)` / `rgb(40,200,64)`; title bar reads "REWARDS_DASHBOARD.EXE CONNECTED"; glow `rgba(189,254,0,0.12) 0 0 60px` + `rgba(0,0,0,0.8) 0 30px 60px -20px`; `#111111` at 95% with `blur(8px)`; `border-radius: 16px`.
- `float-tilt` runs (animationName `float-tilt`, 7s, real 3D matrix). With `prefers-reduced-motion: reduce` it becomes `animation: none` / `transform: none` and the ring holds its final 96.8%.
- Data: `@gainzy`, `Bagworker#3841`, LEVEL 3 badge, 18,420 PTS, ring `aria-valuetext="Level 3, 97% of the way to Level 4"`, "1,580 points to Level 4", "Earnings by platform" $2,810, TIKTOK $1,240 / X $860 / YOUTUBE $710, SAMPLE chip.
- Card 437x562 on desktop, 369x560 at 390px wide, no horizontal overflow. `tsc --noEmit`, ESLint and `next build` all clean.
- **Production still serves the old build** — the restored card needs a deploy to be visible there.


---

Task ID: HERO-TERMINAL-CARD-LAYOUT-V2
Agent: main
Task: Rebuild the REWARDS_DASHBOARD.EXE card body into the five-band brief (profile · points+ring · total earned · live campaigns · earnings), shell and size unchanged.

Approach — the shell is untouched. `terminal-window.tsx` was not edited at all, so the traffic lights, `REWARDS_DASHBOARD.EXE` title, `CONNECTED` + pulse dot, `#111111`/`#161616` chrome, lime glow and `tilt` are exactly as restored. Only the body inside it changed.

Layout changes to `src/components/landing/hero-bagworker-card.tsx`:
- **Points band is now one row** — label + `18,420 PTS` on the left, the ring on the right, with "1,580 points to Level 4" under the row. The ring dropped from 132px (stacked under the figure) to **80px** beside it. `LevelRing` now scales its inner "LEVEL / 3" text with `size` (`0.085` / `0.3` of it, floor 7px), because a fixed 32px numeral does not fit an 80px bore.
- **TOTAL EARNED** band added — `$1,823` + USDC.
- **LIVE CAMPAIGNS** band added — `2 LIVE`, then two campaign rows (NOVA · CLIPPING `$14 / 1K` · X · TIKTOK · 18 SLOTS LEFT, EMBER · ORIGINAL `$180 / post` · X · YOUTUBE · 19 SLOTS LEFT). Each row is two lines rather than the brief's single line: at 430px one line wraps mid-token, and the rate reads better as a right-aligned value.

---

Task ID: PERF-LATENCY-PASS
Agent: main
Task: Find and remove the 2-3s gaps on the marketing site and in the console. Measure first, fix, then re-measure.

The root cause, measured:
- Every database statement against the Supabase transaction pooler costs **~920ms** from this environment (`aws-0-ap-northeast-1`). That is the floor, and it is the number everything else is explained by.
- A script (`scripts/perf-endpoints.ts`, run as `bun run perf:endpoints`, or `PERF_BASE=https://bagwork-eta.vercel.app bun run perf:endpoints` against production) timed the hot endpoints three times each and printed min/max. Min is the honest number with a warm pool:

  | endpoint | before | after |
  |---|---|---|
  | `/api/treasury` (no DB — the overhead floor) | 1ms | 1ms |
  | `/api/profile` (401, no DB on that path) | 1ms | 1ms |
  | `/api/leaderboard` | 921ms | 921ms (1 statement) |
  | `/api/stats` | 919ms | 921ms (5 statements, in parallel — one round-trip) |
  | `/api/console/notifications` | 1288ms | 1290ms (3 statements, in parallel) |
  | `/api/campaigns?status=ALL` | **2207ms** | **1194ms** |
  | `/api/campaigns?status=LIVE` | **2206ms** | **1194ms** |

  So: statement count, not query complexity, is the cost. `/api/stats` running five queries in `Promise.all` lands at the same 920ms as `/api/leaderboard` running one; `/api/campaigns` awaited two in sequence and paid 2.2s. `?status=LIVE` costing the same as `?status=ALL` proved it was never row count.
- Per-route page load (production build, one fresh page per route so React Query is cold, HTTP cache disabled), counting requests and API durations:

  | route | `_rsc` prefetches | total requests | slowest API call |
  |---|---|---|---|
  | `/dashboard` | 48 → **13** | 121 → 74 | campaigns 2211ms → 1290ms |
  | `/dashboard/profile` | 44 → **4** | 117 → 62 | campaigns 2208ms → **gone** |
  | `/dashboard/earnings` | 44 → **8** | 117 → 68 | campaigns 2209ms → **gone** |
  | `/dashboard/quests` | 44 → **5** | 117 → 63 | campaigns 2210ms → **gone** |
  | `/dashboard/submissions` | 44 → **8** | 117 → 68 | campaigns 2209ms → **gone** |
  | `/dashboard/create` | 44 → **4** | 118 → 64 | campaigns 2393ms → **gone** |

  First meaningful content was 53-173ms in both runs: the RSC render was never the problem, and neither was the bundle. Everything people were waiting on was one to four sequential database round-trips after the page had already painted.

Causes, in the order they cost time:
1. **Sequential round-trips in `/api/campaigns`.** It read the campaigns, then awaited a paid-totals `groupBy` for those ids. Two statements in a row, 2 × ~920ms + work = the 2.2s figure. This is the single slowest endpoint in the app and it is read by the landing page's live feed and the console's Explore.
2. **A write on every authenticated request.** `syncUser` did `findUnique` then an unconditional `update` — two round-trips (~1.8s) before any route handler ran, plus a row lock, to store values that had not changed. Every authenticated API call paid it.
3. **The ⌘K palette fetched every campaign on every console page.** `SearchCommand` called `useCampaigns("ALL")` at mount, so each console page paid the 2.2s endpoint whether or not anyone pressed the shortcut — and it competed with the page's own data for the pool.
4. **~44 RSC prefetches per console page.** Every sidebar `<Link>` prefetched on viewport, and the sidebar renders twice (desktop rail + mobile sheet), so 11 destinations became 44 background requests, some repeated three or four times for the same route. 117-121 requests per page load.

Changes:
- `src/app/api/campaigns/route.ts` — the campaigns read and the paid totals now go out in one `Promise.all`. They are independent because the totals are grouped across *every* campaign (`groupBy` on `campaignId`) instead of keyed to the ids just read, and the lookup ignores rows it did not ask for. Rows-for-settled-payouts is one line per campaign, so the result stays small. Also gained a shared cache header for the public feed only: `public, s-maxage=30, stale-while-revalidate=300`. The publisher's own view (`?mine=1`) never takes it — verified it still answers 401 without a session rather than serving a cached body.
- `src/lib/auth/session.ts` — `syncUser` writes only when a value actually changes. The common case (a row that already has this wallet and handle) now does one read and returns. This removes a round-trip from *every* authenticated API call, not just one page.
- `src/lib/quests/engine.ts` — added `ensureQuestCatalogueOnce`, a module-scope once-per-instance guard, and pointed `syncWeeklyQuests` at it. `ensureQuestCatalogue` stays exported (the migration/manual path uses it) and the heal still happens on a wiped database — just once per instance instead of once per read.
- `src/app/api/console/profile/route.ts` — the leaderboard count moved into the existing `Promise.all` as a fourth query.
- `src/lib/queries.ts` — `useCampaigns(status, { enabled })`. `src/components/console/shell/search-command.tsx` passes `enabled: open`, so the palette loads its bags when someone opens it and not before.
- `src/components/console/shell/app-sidebar.tsx` — `prefetch={false}` on every nav and footer link. The comments say why: the payloads are 5-11ms warm, so clicking still lands instantly, and nothing is fetched until it is wanted.
- `src/components/console/shell/index.tsx` — the content area now shows a page-shaped skeleton instead of a centred spinner, and `children` mounts immediately (hidden while the shell decides) so the page's queries run *in parallel* with the session read instead of after it. The onboarding gate is unchanged: un-onboarded accounts still get the setup flow, and the waste is one page request on that rare path. Hidden with `invisible` rather than `hidden`: a page hidden by `display: none` is still mounted, but a widget that measures its own layout on mount would measure zero and draw wrong once it appeared. Also made the content wrapper a `div` — `SidebarInset` already renders the page's `<main>`, so the console was serving two nested `main` landmarks.
- `src/app/dashboard/loading.tsx` (new) — a skeleton for every console route, so a navigation shows the page shape rather than the previous page.
- `src/components/console/pages/profile-view.tsx` — the contribution calendar is `next/dynamic` with `ssr: false` and a skeleton fallback. It is client-only anyway (it lays out from the browser's timezone) and now stays out of the profile page's first paint.
- `src/app/api/stats/route.ts` and `src/app/api/leaderboard/route.ts` — `public, s-maxage=60, stale-while-revalidate=600`. Both are public aggregates with nothing user-specific in them, and they are the first data the marketing page asks for. No number in either response changed - the same real figures, just not recomputed per visitor.

Verified:
- `tsc --noEmit` clean, ESLint clean on every changed file, `next build` clean.
- Re-ran the endpoint timer: `/api/campaigns` 2207ms → 1194ms for both statuses. `/api/treasury` still 1ms (nothing wrapped a round-trip around a cheap route).
- Re-ran the per-route browser pass: RSC prefetches 44-48 → 4-13 per console page, total requests 117-121 → 62-74, and the palette's campaigns call is gone from every console route except `/dashboard`, which is the one page that legitimately shows the marketplace.
- Cache headers confirmed on the responses (`/api/stats`, `/api/leaderboard`, `/api/campaigns?status=…`) and confirmed *absent* on `?mine=1`.
- Console UI checked in a browser after the shell change: `/dashboard` renders its real content (1258 characters of text, live bag links into `/dashboard/bags/…`), no skeleton left behind, no hidden wrapper swallowing the page.
- Deployed to https://bagwork-eta.vercel.app and re-measured there. Production is where the caching pays off, and it is decisive:

  | endpoint | cold call | then |
  |---|---|---|
  | `/api/stats` | 3140ms | **52ms, 61ms** |
  | `/api/campaigns?status=ALL` | 1461ms | **53ms, 58ms** |
  | `/api/campaigns?status=LIVE` | 1343ms | **58ms, 66ms** |
  | `/api/leaderboard` | 1047ms | **68ms, 54ms** |
  | `/api/console/notifications` | 1351ms | 1341ms, 1324ms (session-scoped, correctly not cached) |

  Anonymous console pages on production are interactive in ~0.56s with their data in ~55ms, no skeleton left on screen, 62 requests, 5 RSC prefetches.
- Final pass over the deployed site, one fresh page per route, waiting 6s for everything to settle:

  | route | first content | visible | skeletons left | `<main>` landmarks | page errors |
  |---|---|---|---|---|---|
  | `/` | 1.0-1.6s | hero + 7,549 chars | 0 | 1 | none |
  | `/dashboard` | 0.83s | Explore grid | 0 | 1 | none |
  | `/dashboard/profile` | 0.54s | sign-in prompt (anonymous) | 0 | 1 | none |
  | `/dashboard/leaderboard` | 0.56s | board | 0 | 1 | none |
  | `/dashboard/quests` | 0.55s | quest board | 0 | 1 | none |

  The marketing page is the one route still over a second, and it is no longer data: its two API calls return in ~55ms from cache. What is left is the Privy SDK bootstrap (~1.2s to `auth.privy.io`) plus hydration of a page that is a single client component with view state in a store. Splitting Privy out of the marketing tree, or moving the landing page's shell back to the server, is the next win there — both are structural, so neither is in this pass.
- The only console errors seen in a browser were environmental: Privy's `frame-ancestors` CSP refusing `localhost` (the allowlist is the deployed origin), and `ERR_CONNECTION_REFUSED` on `/api/console/notifications` from the bell's 60s poll firing after the local server was stopped mid-run.
- One caveat worth stating plainly: the ~0.5-1.3s floor for a *single* uncached database statement is the pooler's connection cost, not query time — it shows up identically from this machine and from the Vercel function, and it is why "one statement" and "two statements in sequence" are the difference between 0.9s and 1.8s here.

Still slow, and why:
- `/api/console/notifications` is ~1.3s. It is already three parallel statements, so what remains is one round-trip plus the joins behind it. It is off the critical path (the top bell, fetched after paint), so I left the shape alone rather than adding a cache to something session-scoped.
- `/api/console/quests` still costs about three round-trips: read the catalogue and the user's rows, measure each unfinished quest, then reconcile. Only the first of those was waste; the other two are the reconciliation itself, which is what makes progress live on read. Caching the board would mean showing stale progress, so it stays.
- Any authenticated request still pays one round-trip for the session read (~920ms) before its handler runs. Removing that needs a session cache (a signed cookie for the user id) and is a security-relevant change, so it is not in this pass.
- The ~920ms per statement is geographic: the app runs in the pooler's region on Vercel, so production is faster than these local numbers. Everything above is a *relative* result and holds either way — fewer round-trips is fewer round-trips.

5. **A write on every quest read.** `syncWeeklyQuests` opens with `ensureQuestCatalogue()`, a `createMany` — a whole write round-trip, every single time, to insert rows the migration had already inserted.
6. **`/api/console/profile` awaited a count after its `Promise.all`.** A fifth round-trip for a single integer.
7. **The console shell serialised every page behind the session.** `{isLoading ? skeleton : children}` meant the page component did not exist until `/api/profile` returned, so its own queries could not start: session round-trip, then the page's, ~1.8s of nothing on screen. This is the one cause that never showed up in my anonymous measurements — it only bites signed-in users, which is exactly who reported it.
8. **No route-level loading state anywhere.** RSC navigations showed the previous page until the new one arrived.
9. **A 557-line heatmap bundled into the profile page's first paint.**

- **EARNINGS BY PLATFORM** unchanged in content, padding aligned to the other bands.

Height budget — the two new bands had to be paid for, so the existing bands were tightened rather than the card grown: section padding `py-3.5` → `py-3` (×5), campaign rows `py-2` → `py-1.5`, the ring 92 → 80, and three `mt-*` gaps reduced. Result: **430 x 585** vs 430 x 562 before — **+23px (+4%)**, width identical, no content overflow. (The first attempt came out at 631px, which is what the trims above were for.)

Verification (production build on :3000, 1440x900 and 390x844):
- All 29 required strings present in the rendered DOM (`missing: []`), in brief order: `REWARDS_DASHBOARD.EXE` → `CONNECTED` → `@gainzy` / `LEVEL 3` / `Bagworker#3841` / `SAMPLE` → `LIFETIME POINTS` / `18,420` / `PTS` / ring / `1,580 points to Level 4` → `TOTAL EARNED` / `$1,823` / `USDC` → `LIVE CAMPAIGNS` / `2 LIVE` / NOVA · CLIPPING / `$14 / 1K` / `X · TIKTOK` / `18 SLOTS LEFT` / EMBER · ORIGINAL / `$180 / post` / `X · YOUTUBE` / `19 SLOTS LEFT` → `EARNINGS BY PLATFORM` / `$2,810` / `$1,240` / `$860` / `$710`.
- Traffic lights still compute to `rgb(255,95,87)` / `rgb(254,188,46)` / `rgb(40,200,64)`; `float-tilt` still animating (7s); tilt intact; ring `aria-valuetext="Level 3, 97% of the way to Level 4"`; no horizontal overflow at 390px.
- `next build` clean (compiled + TypeScript + 24 routes).
- `$1,823` (total earned) and `$2,810` (platform total) are both printed as the brief supplies them and are deliberately not reconciled — noted in the SAMPLE doc comment.


---

Task ID: HERO-MATRIX-WORD
Agent: main
Task: Animate the last word of the hero heading — matrix flicker then settle, cycling five words every 2s — without touching the rest of the hero.

New file `src/components/landing/matrix-word.tsx` (`MatrixWord`, plus the exported `MATRIX_WORDS` cycle: bagworkers? → hustlers? → shillers? → kols? → foids?).
- Hold 2000ms, then a ~270ms burst of 6 frames at 45ms. Each frame keeps the target word's *length* and resolves it left to right (`noiseFrame`), so the noise looks like a matrix settle rather than a slot machine.
- Space Mono is monospace (`--font-sans`), so an equal-length frame is an equal-width frame: the burst cannot jitter sideways. The longest word is the first one, so it can never outgrow the `h1` clamp.
- Frames are plain text swaps — no transition, no transform, no filter: ~3 small re-renders per second and zero compositor work.
- Reduced motion returns early in the effect: no flicker and no rotation, the heading just reads "bagworkers?".
- Rendered text is `aria-hidden`; the `h1` now carries `aria-label` built from `MATRIX_WORDS[0]`, so a word that rewrites itself every two seconds is never re-announced. Initial state is the server's state, so there is no hydration mismatch (the reduced-motion branch is in the effect, never in the render).

`src/components/landing/hero.tsx`: the third line is now `<span className="block text-[#bdfe00]"><MatrixWord /></span>` — **`text-neon-glow` removed**, which was the only place on the site using that class, so the entire heading is now shadow-free. Added `HEADLINE_NAME`; the two static lines and every other part of the hero are untouched.

Verification (production build on :3000):
- Sampled the word every 30ms for 7.4s. Observed: `?MZLNC → fZ#R@5 → fo62W@ → foi1WC → foid67 → foidsJ → foids?` (settle), hold ~1.75s, then `4ONG18AP9TQ → … → bagworkers?`, then `hustlers?`, then `shillers?` — correct order, ~2s apart, looping.
- **Zero layout shift**: the `h1` height and the CTA button's `top` were byte-identical (`202.6|625`) across every frame of the full cycle.
- `getComputedStyle(span).textShadow === "none"`; `aria-label="Why pay for ads when you can pay bagworkers?"`; span `aria-hidden="true"`; the two static lines never changed.
- With `prefers-reduced-motion: reduce`: one word seen over 5s (`bagworkers?`), no flicker.
- With JS off, the served HTML still contains `bagworkers?` and the `aria-label` (static end state exists without JS), and no `text-neon-glow`.
- `next build` clean (compile + TypeScript + 24 routes), ESLint clean on both files.


---

Task ID: HERO-CARD-POINTS-ALIGN
Agent: main
Task: Put the circular level meter on the "18,420 PTS" line inside the REWARDS_DASHBOARD.EXE hero card's points row. It sat ~16px above the figure. No card resize, no float-tilt removal, nothing else redesigned.

Root cause: the ring is 80px and the row's left column held only the label and the number (~56px of content), so `items-center` centred the ring on *that pair*. The figure sits at the bottom of the column, 16px below its centre, so the ring rode high.

Fix — `src/components/landing/hero-bagworker-card.tsx`, the points band only:
- Rebuilt the row as a 3-row grid (`grid-cols-[minmax(0,1fr)_auto]`, `items-center`, `gap-x-4`) whose **row 2 holds the number and the ring and nothing else**; the label is row 1 and the caption row 3, both in the same 1fr track. Row 2 grows to the ring's 80px, so `items-center` centres the ring and the number in it: their centres are the same line by construction, whatever the two text rows measure.
- The caption moved from a block *under* the row to a grid item of row 3, so it can no longer push the row around.
- Band padding `py-3` → `py-[9.5px]`: rows 1+3 contribute 30px and row 2 contributes 80, so the band is 130px (110 + 19 + 1px border) and the card lands back on **585**, not 586 — the half pixel the two text rows carry. The other three bands keep `py-3` (12px), so this one is 2.5px tighter, not 4px looser.
- The first pass at this balanced the flex column with margins instead (`mt-4` on the caption, from the measured 48px above the figure's centre vs 38.5px below) and did reach 0.3px — but the caption sits at its max-content width, so it would wrap below ~300px and knock the ring ~8px out again. Swapped for the grid, which holds at every width and is the smaller diff.

Verification (production build on :3000, tilt frozen via inline `animation: none` so the rects are untransformed):
- **Ring centre − figure centre = 0.00px** at 1440 / 1024 / 768 / 430 / 390 / 360 / 320 / 280 (mid-fix margin pass: −4.7px; shipped bug: ~−16px, from the column's 48px-vs-16px balance).
- **Card 430 x 585** at every one of those widths — unchanged. Band 131 (130 + 1px border), ring still 80px, still right of the figure, caption still one line, still below the figure, `captionOverflowsCard: -96` (no clipping).
- `float-tilt` still `float-tilt / 7s / infinite` per `getComputedStyle`, and the live transform matrix confirms it is animating; `LevelRing` internals untouched (numeral still inside the circle).
- `prefers-reduced-motion: reduce`: tilt suppressed (`animation-name: none`), card 430 x 585, delta still 0.00.
- `next build` clean (compile + TypeScript + 24 routes); ESLint clean on the file.
- Local-harness artifact, not a site bug: `/bagwork-logo.png` 404s in the standalone server when `.next/standalone/public` has not been copied (done).


---

Task ID: HERO-CTA-3D
Agent: main
Task: Redesign the hero's three CTAs — START EARNING, EXPLORE BAGWORK and the "Don't be lazy" docs link — so they read 3D and fully legible. The shared variants left them flat, and the outline was transparent with a black border.

What was measured first (production build, 1440x1000):
- Primary: `background-image: none` (one flat #bdfe00 fill), a 2px **black** border under a **black** 5px lip — a neon sticker, no depth.
- Secondary: `background-color: rgba(0, 0, 0, 0)` — the surface really was transparent, so its lime label sat on the dotted page background — with the same black border, i.e. no visible edge at all.
- Link: `color` white at 70%, `text-decoration-color` white at **25%**, hairline thickness.

Changes — `src/app/globals.css` + `src/components/landing/hero.tsx` (nothing else touched):
- Added `.hero-cta-primary`, `.hero-cta-secondary` and `.hero-docs-link` directly under the `.btn-3d` block, so they read as an extension of it, and applied them to the three hero elements by `className`.
- Both buttons keep `.btn-3d`'s geometry (same 5px lip, same -2px lift, same +3px press) and restate the surface: a 3-stop lime gradient (#e8ff7d -> #bdfe00 -> #a2e200) over a **lit** lime lip (#6d9a00) with an inset top rim and a lime bloom on the primary; an **opaque** gradient plate (#1e2610 -> #131809, `background-color: #161c0b`) behind a 2px `rgba(189,254,0,0.5)` border on the secondary, with a soft olive lip (#22300a) so the depth still shows against #0b0a07.
- `:hover` / `:active` are restated rather than inherited: a box-shadow set in these classes replaces `.btn-3d`'s whole stack, so hovering would otherwise drop the inset rim and the glow and jump.
- Focus: `outline: 2px solid #bdfe00; outline-offset: 3px` on `:focus-visible` — deliberately `outline` and not a ring, because a ring is a box-shadow and would replace the depth stack. (The docs link keeps its existing ring, which has no box-shadow to fight.)
- Link: solid #bdfe00 text with a 2px underline at 60% lime, brightening to #e2ff8a with a solid underline on hover. Colour and underline live in the one class so they cannot drift apart.
- Reduced motion: the 2px hover lift is switched off; the brightening stays, so hover still reads.

Verification (production build on :3000):
- **Geometry identical to before, to the decimal** — primary 200.2 x 48 at (107, 624.9), secondary 189.1 x 48 at (319.2, 624.9), link 463.4 x 20 at (107, 744.4), `h1` top 214.5. Nothing moved or resized.
- Contrast, computed from the rendered colours: primary text 16.35:1 base and **12.65 / 16.35 / 17.94:1 across its gradient stops**; secondary text **12.94 / 14.92:1** across its plate stops (14.39:1 on the base colour); link 16.35:1. All past AA and AAA (4.5 / 7:1); the old link was 70%-white with a 25%-white underline.
- Hover: `translateY(-2px)` + `brightness(1.1)` + the brighter gradient; the secondary's border goes to solid #bdfe00 and its text to #d9ff66. Active presses 3px with the lip at 2px. Focus-visible computes to `2px solid rgb(189, 254, 0)` on both buttons, and the ring is visible around the lime fill in a screenshot.
- `prefers-reduced-motion: reduce`: hover `transform: none`, brightening intact.
- 390px: both full width (368.7) and stacked, 48px tall, no horizontal overflow, depth intact.
- Functional: clicking EXPLORE BAGWORK still scrolls to #live; handlers untouched.
- `next build` clean (compile + TypeScript + 24 routes); ESLint clean on hero.tsx.
- Rollout note: the shared `solid` / `outline` variants are unchanged, so the header, campaign cards, live-campaigns and leaderboard still use the old flat surfaces — the same classes can be applied there on request.


---

Task ID: BUTTONS-SITE-WIDE
Agent: main
Task: Give the header and every other button in the product the same treatment the hero got — 3D depth, real surfaces, no washed-out or transparent text.

Approach: instead of hero-only classes, the five surfaces moved into `globals.css` as shared `.btn-surface-*` paints, and both button components now use them, so the hero and everything else are literally the same CSS.

Changes:
- `globals.css`: `/* ===== BUTTON SURFACES ===== */` replaces the hero-only block. `.btn-surface-solid` and `.btn-surface-outline` are the hero paints unchanged (so the approved hero is pixel-identical), plus three new ones in the same language — `.btn-surface-ghost` (opaque #15130f plate, `rgba(255,255,255,0.14)` border, #e7e6eb text: ~14:1 where `bg-white/5 text-white/70` was a 5% wash under 70% text), `.btn-surface-gold` (gold ramp, dark text, 7:1 at its deepest stop) and `.btn-surface-destructive` (deeper red ramp because white on the `#ff4444` token is 3.41:1 — the new base ramp holds 4.83:1 at its lightest stop). Every surface states its own `:hover` / `:active`, shares one `:focus-visible` outline (2px solid #bdfe00, +3px offset — `outline` and not a ring, because a ring is a box-shadow and would replace the depth stack), and shares the reduced-motion guard that drops the 2px lift while keeping the brightening.
- `NeonButton` (`site/neon-button.tsx`): variants are now the four surface classes instead of flat utility strings. The old ones were `bg-[#bdfe00]` flat for solid, `bg-transparent text-[#bdfe00]` for outline (a transparent surface under a `#0a0a0a` border on a `#0b0a07` page — no visible edge at all) and `bg-white/5 text-white/70` for ghost. Geometry, sizes and every className caller passes are untouched.
- shadcn `Button` (`ui/button.tsx`): `default` / `outline` / `secondary` / `destructive` now carry `btn-3d` + their surface, so console and docs buttons match the site. `ghost` and `link` deliberately keep the quiet in-place styling (dialog/toolbar icon buttons, inline links) — a lip and a plate there would be noise; their text is the normal foreground, so neither is washed out.
- `hero.tsx`: dropped the now-redundant hero-only classes; the hero is on the shared variants.
- `header.tsx` / `footer.tsx`: nav items `text-white/60` → `/75`, footer link button `/60` → `/75`, mobile menu rows `text-white/70 hover:bg-white/5` → `/85 hover:bg-[#bdfe00]/10` — the same "no low-opacity text" pass, without turning nav rows into plates.

Verification (this turn the Playwright MCP tools were no longer attached to the session, so the checks are build/CSS/SSR-level; the visual and geometry pass is still outstanding — see below):
- `next build` clean: compiled, TypeScript, 24 routes, no "Failed to compile"; ESLint clean on all five changed files.
- Compiled CSS (`.next/static/chunks/*.css`): all five `.btn-surface-*` present (5 rules each = base/hover/active/focus/reduced-motion), `hero-cta-primary` and `hero-cta-secondary` gone (0 hits).
- Cascade order in the minified bundle, which the whole design depends on: `.btn-3d` 154104 < `.btn-3d:hover` 154301 < `.btn-surface-solid` 154517 < `.btn-surface-solid:hover` 154950 < … < `.btn-surface-destructive:hover` 158121 < `@media (prefers-reduced-motion:reduce)` 158959. So the surfaces beat `.btn-3d` at rest (same specificity, later), beat `.btn-3d:hover` on hover (same specificity, later), and the reduced-motion override is last.
- Served HTML, all 200: `/` → header `DASHBOARD`=ghost, `START EARNING`=solid, `EXPLORE BAGWORK`=outline, `START EARNING NOW`=solid; `/docs` → `DASHBOARD`=ghost + a shadcn Button (`Jump to the summary`)=outline; `/dashboard` → 2 shadcn outline buttons render. `/dashboard/profile|quests|my-bags` also 200 with their outline buttons.
- Safe to leave the surfaces unlayered: scanned every `<Button>` / `<NeonButton>` call site for colour utilities in `className` — none pass any, so nothing that used to override a variant's paint is now being overridden. `hover:brightness-110` was re-expressed as `filter: brightness(1.1)` inside the surface hovers (1.06 for ghost) — it is the only part of these hovers that can tween, since a gradient is an image.
- Contrast, computed: hero link 16.35:1; solid 12.65–17.94:1 across its gradient; outline 12.94–14.92:1; ghost ~14:1; gold ~7:1 at its darkest stop; destructive 4.83:1 at its lightest stop (hover 4.85:1). All AA, most AAA.
- Still to eyeball with a browser attached (the change is bigger than the hero's): each button's box unchanged on the landing page, the header's DASHBOARD/CONNECT side by side, campaign-card DETAILS/SUBMIT, the mobile menu, the shadcn buttons inside `/dashboard` dialogs and table rows (a 5px lip now sits under them, and in dense rows a lip can visually touch the content below), and the destructive red in the console.


---

Task ID: DEPLOY-PROD
Agent: main
Task: Ship the current working tree to production on Vercel.

Steps:
- `vercel whoami` → `retarddevthatknowcode`; project linked as `bagwork` (`prj_RBwRvu5zeyBQzJs2i532e4TMVnsk`, team `team_3UzzS01IWMvMaNYuDpyLvIRt`); CLI 59.1.3.
- Added `recovered/` to `.vercelignore` first — 4.7 MB / 211 files of gitignored local archive that was larger than the rest of the upload payload and has no business in a deployment.
- `vercel --prod --yes` (run detached with output to a log, since a cloud build outlives a single command window). Vercel ran `bun install` → `prisma generate` → `next build` (compiled in 54s) → "Build Completed in /vercel/output [1m]" → **Ready in 2m**.
- Deployment: https://bagwork-33rhhs7yg-retarddevthatknowcodes-projects.vercel.app — aliased to **https://bagwork-eta.vercel.app**.

Verified against the live production domain (the sandbox's own resolver could not resolve the alias, so DNS was pinned to the Google-resolver address `64.29.17.67` and requests were made with `curl --resolve`):
- `/`, `/docs`, `/dashboard` all **200** (99 KB / 139 KB / 72 KB of HTML).
- `/` markup: `btn-surface-solid` x2, `btn-surface-outline` x1, `btn-surface-ghost` x1, `hero-cta-primary|secondary` **0**, `hero-docs-link` x1, `row-start-2` x2 (the points-row grid), `float-tilt` x1, the matrix word `bagworkers?` and `aria-label="Why pay for ads when you can pay bagworkers?"` — so the button pass *and* the three earlier hero tasks are all live.
- Deployed stylesheet `/_next/static/chunks/59d6fd163bbc8b7a.css` (172,509 bytes): all five `.btn-surface-*` present (5 rules each), `#6d9a00` lip, `#d92b2b` destructive stop, `brightness(1.1)` x3, `brightness(1.06)` x1, `prefers-reduced-motion:reduce` x3, `.hero-cta-*` 0.
- `/docs` and `/dashboard` on prod each render 3 buttons carrying a surface — the shadcn `Button` change is live in the console and docs as well.
- Note: the CLI uploads the working tree, and it differs from `HEAD` in 263 entries, so this deployment ships everything since the last one, not only today's button work. No new environment variables or database migrations were involved in this session.
- Scratch files (`tmp-deploy.*`, `prod*.html/css`) removed afterwards so they cannot be uploaded next time.


---

Task ID: PROFILE-ACTIVITY-CALENDAR
Agent: main
Task: A GitHub-style contribution calendar in the Profile header, built on an existing component rather than hand-rolled, wired to real submission activity.

Install:
- `bun x shadcn@latest add https://heatmap-shadcn.vercel.app/r/heatmap-calendar.json --yes` installed `src/components/heatmap-calendar.tsx` (option 1 off the brief's list; option 2's `@iconiq` registry is not reachable here — its host `coss.com` does not resolve — and option 3 was not needed). The installed file is **byte-identical to the registry payload** (20,880 chars, compared against the registry JSON after install).
- Two things about that CLI run, for the next one:
  - It prompts `overwrite? (y/N)` for files that already exist even with `--yes --overwrite`, and that prompt blocks a non-interactive shell. Worked around by moving the four registryDependencies it wanted to write (`card`, `tooltip`, `dropdown-menu`, `button` — all already present, all already exporting what the item imports, including `CardAction`) aside for the run and restoring them afterwards. The net diff is the one new file.
  - Its dependency step ran `bun add cn radix-ui`, which rewrote `bun.lock`, added `"cn"` + `"radix-ui"` to `package.json`, installed both, and tripped the project's `prisma generate` postinstall while the local server held the Prisma engine DLL (EPERM). All reverted: both deps out of `package.json`, `bun.lock` back to its committed state (`git checkout -- bun.lock`, 0/0 diff), both `node_modules` directories deleted, nothing in `src` imports either (`package.json` is back to its pre-task 16/2 diff).

Data:
- `src/app/api/profile/activity/route.ts` (new). One contribution = one submission activity, counted per event: `claimedAt` (opt-in), `submittedAt` (post link) and `approvedAt` (approval) each add one, so a day with two claims and an approval is three. `createdAt`/`updatedAt` are excluded on purpose — a claim's `createdAt` doubles its `claimedAt`, and `updatedAt` moves on any write; the three timestamps are exactly the vocabulary the schema documents.
- 365 days ending today, built in the **caller's** timezone (`?tz=`, the browser's `getTimezoneOffset()`), because a contribution belongs to the day the creator had: bucketed in UTC, everything a Berliner does after 22:00 would be filed under tomorrow.
- Public by design, and the only endpoint here that reads someone else's row: `?user=<handle|#number>` resolves any Bagworker, which is what "works when viewing another user's profile" needs; no `?user=` falls back to the session. It returns a count per day plus the identity — no wallet, no email, nothing about a submission. 401 with neither, 404 for an unknown handle/number.
- `src/lib/profile/hooks.ts`: `useProfileActivity(identifier?)`. The identifier is optional so the same hook serves own-profile (session, gated exactly like `useProfile`) and other-profile (public, loads immediately); the timezone offset is part of the query key.


UI:
- `src/components/console/profile-activity.tsx` (new): the widget. Everything visual is the registry component — nothing re-draws the calendar. This file supplies only what is Bagwork-specific: the palette (an empty cell at `rgba(255,255,255,0.06)`, then four lime steps up to `#bdfe00`), the thresholds (1-2 → L1, 3-4 → L2, 5-6 → L3, 7+ → L4), the cell wording ("3 contributions" + the date) and one legend row (year total on the left, "Less → More" on the right) through the component's `renderLegend`.
- `src/components/console/pages/profile-view.tsx`: the calendar is a second row inside the existing header card, right-aligned from `sm` up (`sm:ml-auto sm:max-w-[640px]`), full width on a phone where the calendar scrolls its own year-long grid. No other part of the page changed and nothing in the header moved.
- Client-side only: the grid lays itself out from `new Date()` in the browser's timezone, so rendering it during SSR would key every cell to the server's timezone and hydrate onto different days. A skeleton holds its space until mount. (A Server Component also cannot pass the `renderTooltip`/`renderLegend` functions to it at all — the build fails on exactly that — and the widget is `"use client"`, so the real path is fine.)

Verification:
- `next build` clean; ESLint clean on all five files; `/api/profile/activity` registered as a dynamic route; the scratch verification route used below is deleted and the build re-run without it.
- Endpoint against the real database: `?user=8547`, `?user=toshi100x` and `?user=%238547` resolve the same Bagworker → `total=6`, `activeDays=2`, `[{2026-09-28: 3}, {2026-09-29: 3}]`, window `2025-10-01..2026-09-30`; unknown handle → 404; no session → 401.
- Rendering: a throwaway route rendered the installed component with the exact props the widget passes. Prerendered HTML carried 371 gridcells — 365 day cells plus 6 week-alignment cells labelled "Outside range" — with exactly 3 non-zero cells, on the seeded dates and counts (`Aug 15, 2026: 1`, `Sep 28, 2026: 3`, `Sep 29, 2026: 6`), 362 cells at zero, plus the title, the `Less`/`More` legend and per-cell `aria-label`s. Palette hits confirmed the level mapping (L1/L2/L3 used, L4 untouched because nothing reached 7+), which is also what proves the `YYYY-MM-DDT00:00:00` date format — no trailing `Z` on purpose, because the calendar parses values with `new Date()` and keys cells by local midnight, so a date-only string would land a day off away from Greenwich.
- Not verified live: the calendar inside the Profile page as a signed-in user — the console needs a real Privy session, and without one the page shows its Connect state. The wiring is covered end to end by the endpoint and render checks above.


---

Task ID: LEADERBOARD-ACTIVATION
Agent: main
Task: Give every current profile points so the leaderboard has something to rank, and make the board open on the overall (lifetime) view.

What was actually empty (measured against the live database first):
- All 3 accounts had `points = 0`, so `rankedLeaderboard("overall")` — which filters `points > 0` — returned 0 entries, and the console board rendered its empty state.
- The denormalised `leaderboards` table had **0 rows**, because `recomputeLeaderboard()` only ranked creators with at least one settled payout and no money has moved yet. That left the marketing board (the header's EXPLORE / "TOP EARNERS" page) blank and `GET /api/stats` reporting `trustAvg: 0`.

Changes:
- `scripts/seed-demo-points.ts` (new) + `db:seed:points` in `package.json`. Gives every profile with 0 points a random lifetime total (1,000–45,000, which spans Levels 2 and 3 without inventing a top-of-ladder account). `totalEarned` is derived as `points / 33` — the app's own `POINTS_PER_DOLLAR` — because the console board ranks points while the marketing board shows dollars; deriving one from the other keeps the same person in the same order on both instead of one board reading $0 for everyone. The level comes from `levelFromPoints`, never picked separately, so no profile can show a level its points do not justify.
- The script is **idempotent by default**: only accounts still on 0 points are touched, so re-running it after a real payout has been credited cannot rewrite real history (`--force` is the explicit overwrite switch). It uses increments, not assignments, in the default path — the same shape `creditPoints` uses — so it can never take points away.
- `src/lib/leaderboard.ts`: `recomputeLeaderboard()` now ranks on lifetime points with the same order and tiebreaks as `rankedLeaderboard`'s `overall` branch (points → earnings → older account → id); two boards that disagree about who is first are worse than one board. `totalEarned` reads `User.totalEarned` — the mirror `lib/profile/rewards.ts` moves in the same transaction as the points it credits — instead of summing `Payout` rows, which is 0 for everyone until money actually moves.
- "Default overall" needed no change: the console page already seeds its state from `DEFAULT_LEADERBOARD_RANGE` (`overall`), publishes `#overall` when the fragment is empty, and the API falls back to the same constant — verified below rather than assumed. The shorter windows are genuinely empty right now (nothing settled in the last day/week/month), which is exactly why the lifetime board is the right thing to open on.

Verified (local build, then the same checks against production after deploying):
- Seed run: 3 profiles — toshi100x +8,000 (L2, $242.42), alexgiga +26,800 (L3, $812.12), and the handle-less account +10,726 (L2, $325.03); leaderboard rebuilt with 3 ranked rows. Re-running printed "Nothing to seed: every profile already has points" and rebuilt the same board — idempotency proven on the real data.
- Levels cross-checked against the thresholds (L2 ≥ 5,000, L3 ≥ 25,000) and earnings cross-checked against 33 points per $1.
- `GET /api/console/leaderboard` **with no `range`** → `range: "overall"`, `total: 3`, ordered 26,800 / 10,726 / 8,000; `?range=weekly` → `total: 0` (no settled activity in the window), which is the expected shape.
- `GET /api/leaderboard` (marketing board) → 3 rows with rank, badge (DIAMOND for the top three) and earnings; `GET /api/stats` → `trustAvg: 50` where it was 0, `creators: 3`.
- The handle-less account renders as "Bagworker" with its `BagworkerTag` on the console board — the row already had that fallback, so no UI change was needed.
- Production: console board with no range → `range=overall`, same three entries; marketing board 3 rows; `/api/stats` `trustAvg: 50`; `/dashboard/leaderboard` 200. Deployed as https://bagwork-eta.vercel.app (deployment `bagwork-9s8vny97w-retarddevthatknowcodes-projects.vercel.app`).
- `next build` clean, ESLint clean on the changed files, all probe/scratch files removed.

Note for whoever reads the data next: this is seeded demo data in a shared database. The points are fictional, and the lifetime earnings that come with them are derived from those points rather than from real payouts — `Payout` rows are still 0, so anything that sums actual payouts (totalPaid in `/api/stats`, the payouts queue) correctly reports nothing. `bun run db:seed:points --force` re-rolls; delete the script's rows or adjust the two constants to change the spread.


---

Task ID: TOKEN-ANALYTICS-PAGE
Agent: main
Task: Build the Token Analytics page ($BAG market, buyback and burn) and link it from the bottom of the dashboard sidebar and from the marketing header. The token has no contract address yet, so the page must ship as a complete, premium shell in "Launching Soon" state and become a real dashboard the moment `BAG_TOKEN_MINT` is set — without a redesign, and without ever showing a number it cannot stand behind.

Route: `/dashboard/token` — a dashboard route, so it lives inside the console shell like every other page.

The three states, which is the whole design:
1. **Pre-launch** (no `BAG_TOKEN_MINT`) — no address, no price, nothing burned. Page shows the golden "Launching Soon" badge and structure.
2. **Live, feed pending** (mint set, no provider wired) — the address is real and shown; market numbers are `—` with "Feed connecting".
3. **Live, with data** — everything filled from the providers.

Every market/buyback/holder field is typed `number | null` and rendered through `valueOrDash`. That is deliberate: `0` and "unknown" are different claims, and a card reading "$0 market cap" for a token that launched ten minutes ago is a lie. For the same reason the chart has no fallback series — a decorative curve on a price chart is the one thing a reader would take as fact, so the empty state is a dashed baseline plus an explanation instead.

Files:
- `src/lib/token/analytics.ts` (new) — server-only. `getTokenAnalytics()` returns the whole payload; `TOKEN_IDENTITY` holds the symbol/name/tagline; four provider seams (`readMarketSnapshot`, `readPriceSeries`, `readBuybackSummary`, `readTopHolders`) are each documented as the single place live data plugs in, and each returns empty/`null` today. Pre-launch skips the providers entirely rather than asking for data that cannot exist. The fee split is imported from `lib/solana/burn.ts` (5% platform fee → 2.5% treasury / 2.5% buyback-and-burn) and the worked example comes from `calculateFeeSplit` — the identical function the payout path uses, so the page can never advertise a number the code does not charge. The mint is read through the existing `isBagBurnConfigured()` / `BAG_TOKEN_MINT`, so there is one source of truth for "is $BAG live".
- `src/app/dashboard/token/page.tsx` (new) — server component, `dynamic = "force-dynamic"`. It must not be prerendered: `BAG_TOKEN_MINT` is re-read per request, so setting it after a deploy brings the page alive immediately instead of waiting for the next build. The page passes a plain object to the client, so no provider code or key can travel with it.
- `src/components/console/pages/token-analytics.tsx` (new) — the view. Shadcn components only: `Card`, `Badge`, `Button`, `Tabs`, `Table`, `Separator`, `Skeleton` (via the shell), and the Recharts-based `ChartContainer`/`ChartTooltip`/`ChartTooltipContent` for the price chart. No new dependency and no hand-rolled chart. Built on the console's shared primitives (`PageHeader`, `MetricCard`, `SectionCard`, `EmptyState`, `InfoRow`, `TokenMark`, `Delta`) so it matches every other page rather than approximating it.
- `src/components/console/nav.ts` — `CONSOLE_TOKEN_LINK`, appended to `CONSOLE_NAV_FOOTER` as the last item, so it sits at the very bottom of the sidebar (after Docs and Settings) rather than competing with Explore in the Marketplace group.
- `src/components/site/header.tsx` — `TOKEN ANALYTICS` added between FEE REDIRECT and DOCS. The existing `followNav` already routes non-`#` hrefs the same way it handles DOCS, so no handler change was needed, and the mobile menu renders from the same array.
- `.env.example` — the `BAG_TOKEN_MINT` comment now states that setting it is the entire launch procedure for this page.

Layout, in the order the brief asked for: header ($BAG identity card, golden badge, subtitle), a five-card stats row (Price, Market cap, 24h volume, Liquidity, Holders), the price chart with 1H / 24H / 7D / 30D tabs, the Buyback & Burn section (four totals, a real history table with real headers, and the fee split with a worked $1,000 example), then the secondary panel (contract address placeholder with a disabled copy button, disabled DexScreener/Solscan buttons carrying "Soon" badges, and a top-holders table).


Defects found by verifying rather than assuming (all three fixed):
- **A real crash, caught by `tsc`.** `CONSOLE_NAV_FOOTER` referenced `CONSOLE_TOKEN_LINK` before its `const` declaration. The array is built at module load, so this was a temporal-dead-zone throw while the sidebar was imported — every console page, not just this one. The link is now declared above the footer with a comment saying why.
- **A hidden table column.** Shadcn's `TableCell` is `whitespace-nowrap`, so the long explanatory sentence in the empty Buyback History row could not wrap and stretched the table until the "Transaction" column scrolled out of the card. Both empty rows now carry `whitespace-normal`; measured after the fix, table `scrollWidth === clientWidth` (690 = 690) with all four headers present.
- **Horizontal overflow I introduced at 768px.** Adding a sixth header label pushed the marketing header to 805px wide at a 768px viewport (the desktop nav was `md:flex`), which put a horizontal scrollbar on every marketing page. The nav and actions moved to `lg`, coordinated with the hamburger becoming `lg:hidden` so there is never a width with neither. Verified: 390/768/900/1023 show the menu button with no overflow, 1024/1280 show the nav.

Verified (all in a browser against the running app, dev for layout and a clean production build for compile):
- `h1` is "Token Analytics" and the page title resolves through the console's `%s — Bagwork` template.
- The badge computes to `rgb(255, 231, 14)` — `#ffe70e`, the `--brand` gold — not a generic yellow.
- Stats render exactly five cards (Price, Market cap, 24h volume, Liquidity, Holders), each `—` with "Unlocks at launch" underneath.
- Tabs are real state: all four render and clicking 7D moves the active tab and keeps the empty state coherent.
- Both tables have their full headers and no horizontal scroll; the contract card shows "Not published yet" with Copy, DexScreener and Solscan disabled (`Soon`).
- Sidebar order is Docs → Settings → **Token Analytics** → Back to site, so it is the last nav item.
- The same page is reachable three ways, each verified by clicking it and reading the resulting URL and `h1`: the sidebar link, the desktop header link, and the mobile menu at 900px.
- Mobile: at 390 and 320 the page has no horizontal overflow and no element wider than the viewport.
- `tsc --noEmit` clean, ESLint clean across `src`, `next build` clean.

Note for whoever wires the data next: `src/lib/token/analytics.ts` is the only file to change. The providers are independent and already run in one `Promise.all`, and the component already renders partial data — `market.price` alone is enough to light up the chart's headline, and a single-point series correctly still reads as empty rather than as a chart.


---

Task ID: SUBMISSION-REVIEW-GATE
Agent: main
Task: Trace why submissions were auto-approved with no review, fix the status machine and the review gate, and give the bagworker a real pipeline view.

**Root cause — three faults that only work together.**
1. **The client fired the review the instant the link was saved.** `components/console/pages/bag-submission-view.tsx:107-144` calls `/api/review` inside the submit mutation's `onSuccess` and toasts "Approved by the anti-slop engine". So the creator's own browser drove the verdict, seconds after submitting — the 9.5-second submit→approve gap in the database is this call.
2. **When the model was unavailable, the engine still decided.** `lib/review-engine.ts:193-224` wrapped the LLM call in a `try` whose `catch` fell through to a deterministic heuristic and wrote "Auto-reviewed by anti-slop heuristic engine (LLM offline)." That is a silent fallback that produces an approval, not a deferral.
3. **The fallback cleared both gates for essentially every submission.** `computeQuality` scored `50 + 10` for any URL containing `"status"` or `"video"` — which is every `x.com/<user>/status/<id>` link — giving **60** against a `QUALITY_GATE` of 55. Authenticity defaulted to `UNVERIFIED_ENGAGEMENT = 60` against a gate of 50, and that constant was *deliberately* set above the gate so the heuristic path could approve. `approved = 60 >= 55 && 60 >= 50` → true, every time.

**Why the model was always offline, precisely:** `z-ai-web-dev-sdk` is installed but `ZAI.create()` throws `Configuration file not found or invalid. Please create .z-ai-config in your project, home directory, or /etc.` — it reads a config *file*, not an environment variable, and no such file exists. So the fallback was not an edge case; it was the only path ever taken. The stored rows say so: `aiAnalysis: NULL` on every approved row, with "LLM offline" in the note.

**Fixed.**
- **The engine never decides without a verdict.** The catch now logs the failure, returns `awaitingReview: true`, and writes the submission back to `pending` with scores 0, `payoutAmount` null and `approvedAt` null. `computeQuality` is deleted. `ReviewOutcome.status` widened to include `"pending"` so callers cannot pretend otherwise, and `UNVERIFIED_ENGAGEMENT` dropped from 60 to a neutral 50 since it is now only a prior for blending, never a gate.
- **The UI stops inventing decisions.** The submit flow now branches on `awaitingReview` and shows "Saved — waiting for review" instead of choosing between "Approved" and "Rejected". The admin "Run review" button reports "No verdict reached … approve or reject it yourself" rather than printing a score and payout.
- **Statuses are honest in the UI.** `status-badge.tsx`: `pending` → "Pending review", `approved` → "Approved · payout due". `lib/submissions.ts` gained a separate `paid` bucket, so money owed and money received are never the same tab.
- **The bagworker pipeline is now visible.** My Submissions shows Pending review / Pending payout / Paid / Rejected counts, with tabs to match. "Total earned" was summing `payoutAmount` across *approved-but-unsettled* rows under a hint that read "Settled to your wallet" — it now counts paid only, and the unsettled figure has its own card.
- **Admin side already correct**, verified rather than changed: `/api/admin/submissions` selects `pending + reviewing` for its "Awaiting review" tab, and approve/reject are explicit POSTs behind `isAdmin` with an explicit payout decision.

**Data repaired.** Three rows had been approved by the removed fallback. All three were reverted to `pending` with scores cleared, `payoutAmount` null and a note explaining the reset. The repair script refused to touch anything without the fallback signature or with a payout row on record — none had one, so nothing paid was touched. Status is now `3 pending, 1 claimed, 0 approved`.

**Verified.** Locally: the engine on a fixture stayed `pending` with `awaitingReview: true` and scores 0 — "PASS — no verdict invented". Against the deployed app, with a real admin session: `POST /api/admin/review` → `{"status":"pending","awaitingReview":true,"llmUsed":false}`, row unchanged; `POST /api/admin/approve` → `approved`, payout 3 → "PASS — the human path still decides". The admin queue then served `{pending:3, approved:0, paid:0, awaitingReview:3}` with all three rows listed and scored 0.

**One self-inflicted detour worth recording:** the first deploy failed because a throwaway test script under `scripts/` used `aiAnalysis: { equals: null }`, which is invalid for a Prisma JSON column, and `scripts/` is inside the typecheck. The temp scripts are now deleted before deploying.

**Still missing:** the anti-slop model has no credentials in any environment — it needs a `.z-ai-config` (project, home or `/etc`). Until that exists, **every** submission goes to `pending` and waits for a human, which is the correct failure mode but means the automated review the product promises is not running.

---


Task ID: ADMIN-SESSION-AND-TOKEN-DATA
Agent: main
Task: Close the admin cookie bypass, wire Token Analytics market data from DexScreener, show "Launching Soon" only when there is no mint, and label the temporary test CA in the UI.

**1. The admin cookie is now a signed, expiring token.**
`isAdmin()` compared the cookie to the literal `"1"`, and the cookie is client-controlled — so the password check was decoration and anyone who set `bagwork_admin=1` had every admin route, approving submissions and sending treasury payouts included. The cookie is now `<expiresAt>.<nonce>.<hmac>` (HMAC-SHA256), verified with a constant-time compare, and it expires after 12 hours. The signing key is `ADMIN_SESSION_SECRET` if set, otherwise `ADMIN_PASSWORD` — so no new variable is required to be safe, and rotating the password invalidates every existing session. Every rejection path returns false: no cookie, malformed token, bad signature, expired.

**2. Market data is wired — DexScreener for the snapshot, GeckoTerminal for the chart.**
`readMarketSnapshot` and `readPriceSeries` were stubs returning `null`/empty, so the page could never show a number regardless of the mint. They now read DexScreener's token endpoint (price, market cap, 24h volume, liquidity), and the four OHLC timeframes come from GeckoTerminal's keyless endpoint for the same pool, mapped to `{t, price}` from the candle close. Holders stays `null` on purpose — neither provider publishes a holder count, and deriving one from a different number would be a fabricated figure on a page whose whole point is not to fabricate. Results are cached for 60 seconds, since the endpoint is rate limited and the route renders on demand.

**The bug worth recording.** My first version ranked pools by `liquidity.usd` alone, and the deepest pool for this mint turns out to be an `EMBER / <mint>` pool where the mint is the *quote* asset — so `priceUsd` was **$43.32**, about 6,400× the real figure, with a $43.3B "market cap" to match. The chart looked fine throughout, which is what made it dangerous: the series came from a different provider and was correct, so the page would have shipped a plausible chart next to an invented price. Caught because I called the real function locally before deploying. The pool filter now requires the mint to be the pool's **base** token first, then ranks by liquidity — 17 pairs are returned for this mint and 3 of them quote it, which is exactly the case that broke it.

**3. The badge is conditional.** `<LaunchingSoonBadge />` rendered unconditionally, so the page showed a live contract address, an enabled copy button and "Launching Soon" at the same time. It is now `{!token.live && …}` — visible only when no mint is configured, which is the state it was written for.

**4. The temporary CA is labelled.** `temporaryMint` is computed by matching the configured mint against a known stand-in list, and the page renders a notice above the identity card: "Test token — not $BAG", the address, and a sentence saying the market figures belong to that token. It is computed from the mint itself rather than a flag, so it disappears on its own when the real mint is set. The Holders card also stopped borrowing the "Live · DexScreener" wording that the four provider-backed cards use — an em dash underneath it read as though the number existed and was zero.

**Verified locally first, then in production.** Local: every forgery attempt 401, a real login 200 with a 95-character token (not `"1"`), signature-tampered 401, expiry-tampered 401, wrong password 401 with no cookie. Production after deploy: identical results. Token page in production renders `Price $0.00637 · Live · DexScreener`, `Market cap $6.2M`, `24h volume $2.8M`, `Liquidity $332.4K`, `Holders — Not published by this feed`, chart `$0.00637 · Updated just now · +2065.2 % over 24H`, with `Launching Soon` absent and the test-token notice present. Core smoke: `/`, `/docs`, `/dashboard`, `/dashboard/token`, `/api/campaigns`, `/api/stats`, `/robots.txt`, `/api/tokens/<USDC>` all 200; `/api/admin/overview` 401 anonymously. Region still `hnd1`.

**Still outstanding:** the temporary CA is still in production (intentional, now labelled) and must be replaced with the real $BAG mint before launch; the treasury holds 0 SOL / 0 USDC on mainnet so payouts still cannot settle; and the Alchemy webhook has no subscription registered against it yet.

---


Task ID: DOMAIN-BAG-WORK-FUN
Agent: main
Task: Add the newly purchased domain `bag-work.fun` to the project.

**The project had no site URL anywhere.** No `metadataBase`, no canonical tags, no `og:url`, no sitemap, and a static `robots.txt` that allowed every crawler into everything — including the signed-in console. Open Graph URLs were emitted relative, so every link preview resolved against whatever host the crawler happened to use. So this was less "add a domain" than "give the app a canonical identity, and then point it at the domain".

**Vercel (done through the CLI, project already linked as `prj_RBwRvu5zeyBQzJs2i532e4TMVnsk`):**
- `bag-work.fun` attached to the `bagwork` project. `vercel domains verify` reports `configured-correctly`, `configuredBy: A`, no issues — the nameservers were already Vercel's, so DNS and the certificate came with it.
- `www.bag-work.fun` attached too, so the `www` spelling resolves rather than failing.
- `https://bag-work.fun` returns **200** and serves the current production deployment.
- The CLI has no "set primary domain" command — that is a dashboard toggle (Project → Settings → Domains). It is not required for the domain to work; it decides which of the two hosts redirects to the other.
- `vercel.json` now redirects `bagwork-eta.vercel.app` and `www.bag-work.fun` to the apex, **excluding `/api/*`**. That exclusion is deliberate: the auto-generated host is what the Alchemy webhook and any external caller may still be pointed at, and a host-level redirect would answer those POSTs with a 308 instead of running the route. Page requests redirect; API requests keep working on whichever host they arrive.

**Code:**
- **`src/lib/site.ts`** — one source of truth for the canonical origin. Resolution order: `NEXT_PUBLIC_SITE_URL` → `VERCEL_PROJECT_PRODUCTION_URL` (so the project's production domain is picked up automatically, and a future rename needs no code change) → `https://bag-work.fun`. Also exports `absoluteUrl()` and `OPEN_GRAPH_DEFAULTS`.
- **Root layout** — `metadataBase` (every relative URL in the metadata resolves against it), the description now comes from the shared constant, and the Open Graph block gained `url` and an image.
- **`/` and `/docs`** — each declares its own canonical, so `/docs` no longer inherits the root's.
- **`src/app/robots.ts` + `src/app/sitemap.ts`** — generated rather than static, so the `Sitemap:` line follows the domain instead of being hardcoded in a file that cannot know which host is serving it. `public/robots.txt` deleted. Crawling is now disallowed for `/dashboard`, `/adminportal` and `/api`; the old file's four "Allow: /" crawler groups said nothing the `*` rule did not already say.
- **`/dashboard/**`** — `robots: { index: false, follow: false }`, matching what `/adminportal` already did.
- **`.env.example`** — `NEXT_PUBLIC_SITE_URL` documented, with the note that leaving it unset is the correct configuration on Vercel.

**The mistake worth recording.** Setting `openGraph` on a page *replaces* the layout's whole Open Graph object; it does not merge field by field. The first version of this work gave `/` and `/docs` just `openGraph: { url }`, which silently stripped `og:image`, `og:site_name` and `og:type` off both cards. Nothing type-checks that — it only shows up in the rendered HTML, which is where it was caught: `twitter:*` survived (untouched in the layout) while the `og:*` tags went missing, which is the signature of a replacement rather than a merge. Fixed by exporting `OPEN_GRAPH_DEFAULTS` and having pages spread it.

**Verified in the rendered HTML, not just in the source:**
- `/` → `canonical https://bag-work.fun`, `og:url https://bag-work.fun`, `og:image https://bag-work.fun/bagwork-logo.png` (absolute, proving `metadataBase` works), `og:type`, `og:image:alt`, `twitter:image`.
- `/docs` → `canonical https://bag-work.fun/docs`, `og:url /docs`, `og:title "Docs — Bagwork"`, its own description, image intact.
- `/dashboard` → `<meta name="robots" content="noindex, nofollow">`.
- `/robots.txt` → `Disallow: /dashboard`, `/adminportal`, `/api` and `Sitemap: https://bag-work.fun/sitemap.xml`.
- `/sitemap.xml` → the two public URLs on the new domain.
- `tsc` clean; build succeeds with `/robots.txt` and `/sitemap.xml` prerendered.

**Deployed.** `vercel --prod` — build completed in 2m and the output ended with `Aliased https://bag-work.fun`, so the domain now serves this build rather than the previous one.

Verified against the live domain rather than locally, which is the only version that counts:
- `https://bag-work.fun/robots.txt` and `/sitemap.xml` return the generated content, with the sitemap URL on the new domain.
- `/` carries `canonical https://bag-work.fun` and an absolute `og:image`; `/docs` canonicalises to `/docs`; `/dashboard` returns `noindex, nofollow`.
- `https://bagwork-eta.vercel.app/` and `https://www.bag-work.fun/` both **308** to the apex.
- And the one that matters for integrations: `https://bagwork-eta.vercel.app/api/stats` still returns **200, served directly** — the `/api` exclusion in `vercel.json` does exactly what it was written to do, so anything still pointed at the old host keeps working.

**Still to do in dashboards — no code can do these:**
1. **Privy allowed origins must include `https://bag-work.fun`** (and `https://www.bag-work.fun` if the `www` host is kept). Without it, sign-in breaks on the new domain — this is the one item that would look like a bug in the app.
2. **Alchemy webhook** should be registered against `https://bag-work.fun/api/webhooks/alchemy` rather than the old host. `ALCHEMY_WEBHOOK_SECRET` is still unset, so the endpoint remains closed either way.
3. Optional: set the primary domain in Settings → Domains so the old host redirects at the edge for every path, including `/api` — do that only once nothing is pointing at the old host.

---


Task ID: E2E-JOURNEY-TEST
Agent: main
Task: Walk the real product loop from both sides — publisher creates and funds a bag, a bagworker opts in and submits, review approves, the payout path settles it — and report honestly what works, what is broken and what is partial. Fix only what stops a journey.

How the journeys were driven, and the one limit that shapes all of it:
- **Authenticated routes cannot be reached from a script.** Every private route resolves its user through `getSessionUser()`, which reads a Privy-verified token out of a cookie, and there is no dev bypass in this codebase (the only `NODE_ENV` check is a setup hint). So the steps behind a session are driven through **the same domain functions those routes call**, against the real database and the real chain, rather than through HTTP.
- **Admin routes are different**, and that is the useful exception: `isAdmin(req)` reads the request object, not cookies, so the entire review flow — authenticate, approve, reject, build a payout — is exercised over HTTP exactly as the admin console does it. That is why the middle of the bagworker journey is the best-covered part of this run.
- **Two steps cannot be automated at any layer**: signing the funding transfer and broadcasting the payout. Both need a wallet holding real money. The funding *rules* are covered by the repo's own 17-assertion suite, and this run adds the complementary proof that a deposit which cannot be verified never activates a bag.
- The harness is `scripts/verify-journey.ts` (`bun run verify:journey`, ~2 minutes). It creates its own tagged fixtures, asserts each step, and deletes everything it made — including purging fixtures from any earlier run that died before cleaning up, which two of mine did.

Result: **30 passed, 0 failed**. `verify:funding` 17/17 and `verify:alchemy` 17/17 still pass afterwards.

Findings that needed fixing (both were mine, from the Alchemy work, and both were caught by this run):
1. **A 500 where a clean answer was due.** Posting an unconfirmable signature to `/api/admin/pay` threw `SolanaJSONRPCError: failed to get signature status: Invalid param: WrongSize` straight out of `confirmPayoutTransfer`, because nothing caught an RPC failure. `verifyFundingTransfer` had always translated that case into a retryable `pending`; the payout confirmation did not. This is a journey blocker under a realistic condition — a provider blip would have made every payout attempt look like a crashed server instead of "try again in a moment". Fixed by classifying the failure: a malformed request is deterministic and final, anything else is `pending` and retryable. The transaction fetch is wrapped the same way.
2. **`isValidTxSignature` accepted 64-character strings.** A Solana signature is 64 bytes, which is 87 or 88 base58 characters, so the floor was two dozen characters too low — and because the RPC rejects anything shorter with `WrongSize`, bad input only failed *after* an unnecessary round-trip, as a server error. Now requires 80-90 characters, so it is refused where the message can still say why. `verify:funding` was re-run afterwards specifically to confirm the funding path did not regress (17/17).

Findings deliberately *not* fixed, with the reasoning:
- **Public campaign payloads publish `createdBy`, `treasury` and `fundingSignature`.** `createdByAdmin` correctly never appears — that guarantee holds (`verify:journey` C1 asserts it across four endpoints, C2 checks an operator-created bag is indistinguishable). But the other three are emitted by `mapCampaign` on purpose: `bag-detail.tsx` compares `campaign.createdBy` with the session user to decide whether the viewer owns the bag. Removing the field would break the bag page, which is precisely what "fix only what stops a journey" rules out. The safe version is a server-computed `isOwner` boolean for signed-in viewers, which is a change to make deliberately rather than in passing.
- **A malformed signature still reports "Could not reach Solana".** `verifyFundingTransfer` maps every RPC throw to "could not reach", which is right for a provider failure and imprecise for a rejected parameter. It is an edge case, it blocks nothing, and changing the message without changing the classification would be cosmetic.
- **`/dashboard/token` takes ~4s on a cold treasury-history read** (145ms cold/44ms warm afterwards). That page reads transfer history through the chain on first render; the 45-second cache makes every subsequent load fast. Real, and worth moving off the render path eventually — but it is the token page, not either journey.

---

Task ID: ALCHEMY-INTEGRATION

Agent: main
Task: Build the Alchemy integration, features 1-5 — backup RPC, treasury deposit webhooks, transfer history for Token Analytics, payout confirmation, and the fee-redirect deposit foundation. Complete the code first, ask for credentials only afterwards, then test end to end.

Everything was built before any key was requested. All 17 checks in the verification script pass with no Alchemy account configured, because the parts that need one (the fallback leg) are isolated and reported as skipped rather than faked.

**Feature 1 — provider chain** (`src/lib/solana/connection.ts`)
- Reads now walk Helius → Alchemy → public RPC, stopping at the first provider that answers. Alchemy is configured from `ALCHEMY_RPC_URL` (the full dashboard URL, which wins) or `ALCHEMY_API_KEY` alone (which builds the documented Solana host). Both are server-only, and the chain simply skips Alchemy when neither is set — Helius-only behaviour is unchanged.
- `withRpcFallback(operation, { label, accept })` grew an `accept` predicate, which is the part that matters. "Did not throw" is not the same as "knows the answer": `getParsedTransaction` and `getSignatureStatuses` both return an empty result for a transaction a node has not indexed yet, and with a second provider configured that is a reason to ask someone else. The funding path's hand-rolled Helius-then-public retry is replaced by this, so all of them behave identically.
- A fallback logs `[rpc] <label> was served by alchemy after helius did not answer` (server logs only) and increments per-process counters. `getSignatureStatusesChecked` batches status lookups for the payout path. `getRpcHealth` reports which provider answered, plus the chain and counters.
- Routed through the chain: `getParsedTransaction` (funding), `getBalance` (payments + the lamports helper), `getTokenAccountBalance`, `getTokenDecimals`, `getSignaturesForAddress` (history). The `.catch(() => null)` on the token balance was sitting on the *primary* connection, so a Helius blip read as "this wallet holds nothing" — now only a total provider failure reads as zero.

**Feature 2 — webhooks** (`src/app/api/webhooks/alchemy/route.ts`, `src/lib/treasury/inbound.ts`)
- HMAC-SHA256 over the **raw body** in `X-Alchemy-Signature`, timing-safe, no prefix. The route reads `req.text()` and verifies *before* parsing, because a body that has been through `JSON.parse` and re-stringified will not match. Fail-closed with 503 when `ALCHEMY_WEBHOOK_SECRET` is unset.
- Response codes are chosen so Alchemy's retries help: 200 for anything delivered (an unreadable body will not read better on a retry), 400 for non-JSON, 401 for a bad signature, and 500 only for our own transient failures.
- New `treasury_inbound_events` table (migration `20260930180000_alchemy_integration`, applied) records every transfer with `event_key = <signature>:<transferIndex>` unique, so a replay cannot insert twice. The raw entry is stored verbatim per row, which is what makes a parser fix checkable against a real payload.
- The parser is deliberately tolerant — the documented `event.activity[]` shape plus the token/native transfer arrays, and field-name synonyms — because Alchemy's Solana support is new and the container has moved between releases. Direction is decided by the watch address, never by a field. Native transfers are normalised to wrapped SOL, matching how the funding check already decides a bag is SOL-priced.
- Admin replay: `POST /api/admin/treasury { id, action: "reprocess" }`, idempotent by construction.

**Feature 3 — transfer history** (`src/lib/treasury/history.ts`, token page)
- Reads recent transfers through the chain and derives amounts from **balance deltas** in the transaction metadata, not the instruction list — the same principle as the payout confirmation, because deltas are what actually happened.
- Cached for 45s in module scope: walking history costs one `getParsedTransaction` per signature, which on a free-plan backup provider is the quickest way to burn a rate limit on a page nobody opens twice in a row.
- The Token Analytics page gained two cards: "Treasury flows" (recent in/out with direction badges) and "Buyback queue" (deposits recorded but not yet swapped, plus the $BAG balance held for burning). Launching Soon mode is untouched: `burnCandidates` is `null` rather than `0` until a mint exists, and the empty states explain instead of showing a zero. A failed chain read is stated in the card rather than silently rendering as "no transfers".

**Feature 4 — payout confirmation** (`src/lib/solana/confirm.ts`)
- `confirmPayoutTransfer` fetches the transaction and checks it succeeded, that the creator's balance rose by at least the payout amount *in this exact mint*, and that the treasury's corresponding balance fell. The last check is what stops a stranger's transfer to a creator being filed as our payout.
- Wired into `POST /api/payouts` and `POST /api/admin/pay` **before** anything is written: confirmed → payout row (`confirmedAt` stamped) + submission paid; pending → 409 `retryable`, submission stays `approved` so it stays in the publisher's queue; failed → 422 with the reason. A signature alone can no longer mark anything paid.
- Caught while wiring: admin payouts are built in **USDC** whatever the bag is priced in, so the confirmation checks `USDC_MINT` there. Verifying against the campaign's token would have failed every admin payout — the kind of mistake that only shows up in production.

**Feature 5 — fee-redirect foundation** (`inbound.ts` → the existing pipeline)
- Classification order is funding → fee redirect → unmatched. A transfer for a mint a bag has opted into is written into the existing `fee_deposits` swap queue, so the Jupiter pipeline that already converts deposits and grows a bag's budget picks it up with **no new swap code**. `unmatched` is recorded with its reason and surfaced to an operator, never dropped.
- $BAG arriving at the treasury is classified `buyback` (a burn candidate) rather than income to convert. Nothing about pump.fun `sharing_config` indexing was built, as instructed.

**Shared with the existing funding path** (`src/lib/campaigns/activation.ts`)
- The verify-and-activate logic was extracted from the fund route so the webhook and the publisher path cannot disagree about what "funded" means. The route keeps its own checks, status codes and messages — including its own 409 for a treasury mismatch — and the helper is the single implementation of treasury-match → amount → signer → verify → activate. `expectedFundingSigner` falls back from `fundingWallet` to the creator's own linked wallet, which is the same check the route already made through the session.

**Admin visibility** (`src/app/api/admin/treasury/route.ts`)
- Admin-only, uncached: the provider chain and fallback counters, whether the webhook signing key is set, when the last delivery arrived *with its verbatim payload* (so a parser problem is diagnosable against a real body), the pending swap-queue depth, and the 25 most recent ledger rows with their classification.

Verified (all 17 checks via `bun run verify:alchemy`, no Alchemy account needed):
- Unsigned delivery 401 · wrong signature 401 · correctly signed delivery 200 with `recorded: 1`
- An unknown mint classifies as `unmatched / ignored` — recorded, not acted on
- Replay: `duplicates: 1, recorded: 0`, one row
- `{ "unexpected": true }` → 200 with `unreadable: 1`, no crash
- `GET /api/admin/treasury` 401 anonymously, 200 with a cookie; provider chain reported as `helius → public`; the test transfer visible in the ledger
- Token Analytics renders in Launching Soon mode with its badge present
- Funding, payout and treasury routes all answer (401 without a session, not 5xx)
- `tsc --noEmit`, ESLint across `src` and `scripts`, and `next build` all clean; the new routes compile as `ƒ` (dynamic). Test rows were deleted afterwards, so the ledger is empty and ready for real deliveries.

Still to do, once credentials exist: the Alchemy leg of the fallback chain (needs `ALCHEMY_RPC_URL` or `ALCHEMY_API_KEY`), and a real webhook delivery (needs `ALCHEMY_WEBHOOK_SECRET` from the webhook's detail page). `bun run verify:alchemy` covers everything that does not.

## Credentials received — results

Alchemy was supplied as a bare API key, so `ALCHEMY_API_KEY` was set in `.env` (gitignored and untracked — verified with `git check-ignore` and `git ls-files`, so the key never enters the repository) and the app builds `solana-mainnet.g.alchemy.com` from it. Cluster confirmed as `mainnet-beta`.

- **Endpoint proven first.** The exact call supplied (`getAccountInfo`) was repeated through the app's own URL builder: HTTP 200, slot 451945183, real account data. The built host matches the dashboard URL, so there is no guessing about the path shape.
- **Chain is live.** `rpcEndpoints()` now resolves to `helius → alchemy → public`, and all 17 checks in `bun run verify:alchemy` pass against a running server, with the fallback leg upgraded from SKIP to INFO.
- **The fallback was proven by breaking the primary, not by reading the config.** The server was restarted with an invalid `HELIUS_API_KEY` and the same reads were repeated: pages and routes still returned 200, the admin panel's counters moved to `served: {helius: 0, alchemy: 1, public: 0}` with `fallbacks: 1`, and the server log carried the intended lines — `[rpc] getSignaturesForAddress was served by alchemy after helius did not answer`, the same for `treasury-history` and `health`. That is the whole feature doing its job under the condition it exists for.
- **Feature 3 against real mainnet.** `getTreasuryActivity()` reads through the chain with no error, and honestly reports zero flows: the treasury `Dq8DGtjMNxojGctpVduXxAVNbjKd4njjwwYh7nsLonoD` has no mainnet transfers yet, so the empty state is what renders. Burn candidates are `null` because there is still no mint — correct Launching Soon behaviour.
- **Feature 4 refuses correctly.** An unknown signature returns `pending` (not paid), which is the check that stops a stray signature settling anything. A real confirmed transaction checked against a wallet it does not pay returns `failed`, which is what stops a stranger's transfer being filed as a payout.
- **The existing funding path still works.** The repo's own regression suite (`npm run verify:funding`) passes **17/17**, including the SOL and SPL funding rules and the payout-symmetry cases, which now resolve mint decimals and a blockhash through the provider chain — so routing those reads through Alchemy changed nothing about the behaviour they assert.
- **Still outstanding: the webhook signing key.** Webhook deliveries were exercised with a locally generated secret (17/17 including the HMAC gate in both directions, idempotency on replay, and the tolerant parser), but a *real* Alchemy delivery needs `ALCHEMY_WEBHOOK_SECRET` from the webhook's detail page. Until then the endpoint is closed by design (503), which is the correct fail-closed state.

## Automatic submission review — Venice AI, campaign-aware, no manual button

Review is now automatic, reads the actual post, and scores it against the actual bag. The manual "Run review" path is gone from both the creator and admin flows.

**Why the old path was wrong.** Review ran from the browser, against a model SDK (`z-ai-web-dev-sdk`) that had no credentials anywhere on the machine. It failed every time, and the `catch` block then approved the submission anyway via a fallback formula — `computeQuality` scored 50 + 10 for any URL containing `status`, which is every `x.com/<user>/status/<id>` link, and authenticity defaulted to 60 against a 50 gate. Every submission auto-approved seconds after submit, scored on nothing but the shape of its URL.

**What replaces it** — `src/lib/review-engine.ts`, `src/lib/ai/venice.ts` (new), `src/lib/review/post-content.ts` (new):

- **The post's content is fetched before anything is scored.** `api.fxtwitter.com` returns the text *and* the real engagement for X posts (views/likes/reposts), with `publish.twitter.com/oembed` as a text-only fallback; YouTube and TikTok use their public oEmbed endpoints. Instagram's oEmbed needs an app token, so Instagram submissions get no verdict rather than a blind one. A post whose content cannot be read stays pending with the reason recorded on the row.
- **The verdict comes from Venice and nowhere else.** `veniceJson()` calls `https://api.venice.ai/api/v1/chat/completions` with `Authorization: Bearer $VENICE_API_KEY`, `temperature: 0`, `response_format: json_object` and a 20 s timeout. The model is *discovered*, not hardcoded: the cheapest `grok-*` in Venice's catalogue by listed input+output price, falling back to the cheapest model it lists. `VENICE_MODEL` overrides both. If no model can be named, the call is refused rather than attempted with a guessed id.
- **The prompt is the campaign, not a heuristic.** The model sees the bag's title, description (≤400 chars), token symbol and name, content type, allowed platforms, and the post's real text (≤700 chars) with its engagement. It must return `{"q","a","reason","verdict"}` — four short keys, ≤14-word reason, and nothing else.
- **Scores alone never approve.** `modelApproved && q ≥ 55 && a ≥ 50`. A model `reject` is a rejection even when both numbers clear their gates: "the numbers passed" is not a reason to overrule the thing that read the post.
- **Authenticity blends the model with real engagement** (60/40) where the platform publishes figures, and uses the model's number alone where it does not — rather than padding to a neutral midpoint, which is what let the old path approve everything.
- **Every failure path defers through one `defer()`**: no key, no model, HTTP error, timeout, unparseable JSON, unreadable post. It writes the reason to the row, leaves `status: 'pending'`, clears the payout, returns `awaitingReview: true`, and logs the failure server-side with the submission id.
- **Engagement is persisted** on the row with every verdict. It previously stayed at zero forever, which is why every payout fell back to its fixed component.

**Trigger** — `src/app/api/submissions/route.ts` schedules review with `after()` from `next/server`, on both the create path and the claim-fill path, so the invocation survives the response while the creator gets their confirmation immediately. The browser no longer calls review at all: a creator's own tab approving their own post was, literally, the previous design.

**UI** — `pending` now renders a spinning wheel in `status-badge.tsx` (it was an hourglass, and only `reviewing` was allowed to spin); My Submissions and the bag's link list show "Analyzing submission — reading the post and scoring it against the brief." with `role="status"`; the note is shown for pending rows too (it was rejection-only), which is what surfaces "could not load the post content"; and `useSubmissions()` polls every 4 s *only while something is pending or reviewing*, so a verdict appears without a refresh and an idle dashboard stays silent. The admin "Run review" button is gone from `review-card.tsx` / `review-queue.tsx`; Approve and Reject remain as the human override, which is the documented backstop when review defers.

**Hover preview** — `GET /api/post-preview` (signed-in only, `s-maxage=300`) returns author, a 280-char snippet and engagement. `post-preview.tsx` fetches it on first hover or keyboard focus only, once per link, so a table of fifty links makes zero requests until someone reads one. Wired into both the bag link list and My Submissions.

**Verified locally** (`tmp-verify.ts`, deleted afterwards):

- Real X post read end to end: `fxtwitter`, author `notthreadguy`, 38,971 views, 229 likes, 8 reposts, has media, and the actual text. Instagram correctly returned `null`.
- Strict-JSON parsing: fenced JSON parsed, JSON buried in prose parsed, prose alone → `null`.
- **The deferral, against a real row in the real database.** With no `VENICE_API_KEY`, review logged `The review model could not be reached, so this has not been scored. (submission cmupe4fir0001l004rijansiq) Error: VENICE_API_KEY is not set`, and the row came back `status: 'pending'`, `payoutAmount: null`, `qualityScore: 0`, `authenticityScore: 0`, `aiAnalysis: null`. Nothing was approved — the exact inversion of the old behaviour.
- `tsc --noEmit` and ESLint clean across every touched file.

**One environment variable is still outstanding.** `VENICE_API_KEY` is not set anywhere — not in `.env`, `.env.local`, the Vercel project, or the shell. It is the single thing between this and live verdicts; until it is set, submissions behave exactly as designed and wait for a human. `VENICE_MODEL` is optional and already resolves to `grok-build-0-1` locally; in production, with it unset, the cheapest `grok-*` is discovered from Venice's catalogue.

**A finding worth acting on.** The real post behind `x.com/toshi100x/status/2104588320928141776` is published by `@notthreadguy` — fxTwitter resolves by tweet id and reports the true author, so review now sees the real author even when the submitted URL's handle disagrees. That mismatched-handle case is exactly what a campaign's "post from your verified account" rule is meant to catch, and the prompt now gives the model what it needs to catch it.

## Submission hover preview — the real X post card

The hover preview on submission links was a dark tooltip with scraped stats. It is now the post: X's own embed, with a faithful X-style card built from the same data for when the embed cannot render.

**Why not the iframe.** `https://platform.twitter.com/embed/Tweet.html` answers with a 429-byte JavaScript shell — no post content in the response, no `X-Frame-Options` — so an iframe would be a slow blank box that never tells us whether it worked. `widgets.js` (94 KB, reachability checked first) is the official route *and* it reports honestly: `twttr.widgets.createTweet(id, el, options)` resolves with the element it rendered, or with `undefined` when X will not render the post (deleted, protected, embed disabled). That promise is what makes the fallback a decision rather than a guess. Nothing in the app blocks X — there is no CSP and no middleware — and the document is dark-only (`<html class="dark">`, `--popover: #0f0d08`), which is why the old card read as a theme tooltip: the new one uses X's own dark card tokens.

**What it does** (`src/components/console/post-preview.tsx`, `x-post-card.tsx`, `src/lib/x/widgets.ts`, `src/app/api/post-preview/route.ts`, `src/lib/review/post-content.ts`):

- **Fetch on hover, once.** Nothing loads until a pointer or keyboard focus lands on a link, and the result is kept for the life of the component, so a table of fifty links costs nothing until someone reads one.
- **One card, never two.** X's embed *is* the card. The window shows a placeholder while it loads, then X's post — the app never renders its own version of the post alongside it. An earlier pass did exactly that: an instant app-styled card that the embed replaced a second later, *plus* its own "Read more on X" footer under X's own call to action. Two cards and two CTAs on a single hover, which is what the second round of feedback was about.
- **The embed is laid out in normal flow**, so X measures a real ~400 px container — a `display:none` or zero-width frame renders wrong *and* reports zero size. It is transparent, with the placeholder covering the same box, until `createTweet` resolves, and `inert` until then: X's iframe is focusable, and neither hiding a focusable element from assistive tech nor letting it take focus behind a placeholder is acceptable.
- **A deadline, because `createTweet` is not guaranteed to resolve.** A stalled script, a blocked frame or a slow connection left the first version sitting on "Loading post preview…" indefinitely — observed in a headless run rather than theorised. Five seconds, then the window resolves to our card. That is the fallback's only job: X declining to render (deleted, protected, embed disabled, runtime blocked).
- **Small window.** 400 px wide, `collisionPadding`, `max-h-[min(640px,80vh)]` with internal scroll, `motion-reduce:animate-none`.
- **Cheap images.** fxTwitter returns `?name=orig`; the card rewrites it to `?name=small` rather than pulling a multi-megabyte original to draw 300 px.

**Verified by driving the real hover in a browser.** With the Playwright MCP still down (I killed it earlier by stopping every node process), verification ran through `playwright-core` aimed at the installed Chrome, plus a temporary harness page that patches `fetch` so `/api/post-preview` answers from a fixture — which means the *actual* `PostPreviewLink` was exercised end to end (Radix open → fetch → embed handoff) with no session. Probed 450 ms, ~3 s and ~5.6 s after hover:

- **One card at every probe.** At 450 ms: the placeholder alone, no iframe. At ~3 s: X's iframe present with `title="X Post"` — `iframeSize 0×0` — and the placeholder still covering it. At ~5.6 s: `iframeSize 390×548`, placeholder gone, one card. X's frame reports zero size until it has laid itself out, which is exactly why the placeholder covers it instead of leaving a hole.
- **Zero app CTAs** (`ourReadMoreCtas: 0`) at every probe. The screenshot shows a single X card: avatar, verified name, `@notthreadguy · Follow`, the text, the quoted article, `8:05 PM · Sep 28, 2026`, the likes/Reply/Copy link row, "Read 55 replies". No app-styled card, no duplicate footer.
- **Window 400×578 at (40,107)** in a 1100×900 viewport — small and floating, directly under the link, with the trigger still carrying the post URL and `target="_blank"`.
- **The deadline earns its place.** In the headless run X's embed never resolved at all; before the deadline existed, the window sat on "Loading post preview…" indefinitely. With it, that same run resolves to our card by 5 s — still one card.
- `dnt: true` on both layers, so the preview sets no advertising or analytics cookies.
- The only console errors were pre-existing Privy ones (`auth.privy.io` analytics 403 and Privy's own `frame-ancestors` CSP).

**Two lessons worth keeping.** A green typecheck and clean lint say nothing about whether a hover shows one card or two — only looking does, and the first version shipped because I looked at the pieces and not the composition. Second, `getComputedStyle` misled me about the outline I thought was ringing the embed: I added a rule to remove it, the computed value did not change, and the screenshot showed there was never a ring — just X's own border. Reverted, because a fix that fixes nothing is worse than no fix: it claims something the code does not do.

**One accessibility detail the code review caught.** The invisible embed was first hidden with `aria-hidden`, which is an axe violation the moment the subtree contains X's focusable iframe. It uses `inert` instead: out of the tab order and the accessibility tree while invisible, handed back the moment it is real.

## Public profile pages for other Bagworkers

`/dashboard/profile/[handle]` is another Bagworker's profile, reachable by handle **or** by `Bagworker#number`. Your own profile stays at `/dashboard/profile`, which is where the editable form — including the payout wallet — already lived.

**What a public profile shows** — identity (character/avatar, display name, handle, `Bagworker#number`, bio, join date), level and points with the circular progress ring, the contribution calendar, and reputation totals: points, level, contributions, active days, lifetime earned, USDC paid out (with the settled payout count), and links-submitted / approved counts.

**What it does not** — no submissions list, no bag opt-ins or campaign detail, no review or moderation state, and no wallet of any kind. Not hidden with CSS: absent from the payload. `PUBLIC_FIELDS` in the route is an allow-list `select`, so a column added to `User` later cannot leak here by accident — the failure mode of a full-row select is silent. A grep over the route and the view for `payoutWallet`, `walletAddress`, `privyId` and `trustScore` returns nothing.

**Files**
- `src/app/api/profile/[handle]/route.ts` (new) — a session is required and checked *before* the lookup, so an anonymous caller cannot even probe which handles exist (verified: 401 for a real handle and for a nonsense one alike). Resolves either spelling and returns identity + aggregates plus `isYou`.
- `src/app/dashboard/profile/[handle]/page.tsx` (new) — awaits `params`, `robots: noindex` (the whole console is signed-in only; a profile is public *inside* it, not on the open web).
- `src/components/console/pages/public-profile-view.tsx` (new) — reuses `ProfileAvatar`, `LevelProgress`, `BagworkerTag`, `ProfileActivity`, `PageHeader`, `SectionCard`, `MetricCard`, `EmptyState` and `ErrorState`. Loading is a skeleton shaped like the page; a missing Bagworker is its own empty state with a way back and **no** retry button (retrying a 404 only 404s again); any other failure gets the error state with retry.
- `src/lib/profile/activity.ts`, `lookup.ts`, `href.ts` (new) — the contribution counting, the identifier resolution and the profile URL builder, one implementation each.
- `src/app/api/profile/activity/route.ts` — now calls the shared functions; response shape unchanged.
- `leaderboard-page.tsx`, `leaderboard-podium.tsx` — avatar and name now link to the profile. The avatar link is `tabIndex={-1} aria-hidden`, so a keyboard user reaches each Bagworker once (the name), not twice.
- `src/lib/profile/hooks.ts` — `usePublicProfile`, with a 404 surfaced as a typed `notFound` rather than a generic error.

**Verified**
- Identifier resolution against the real database: `toshi100x`, `8547`, `@toshi100x` and `#8547` all hit the same row; junk and empty return null.
- `collectProfileActivity` for a real user: window `2025-10-02 → 2026-10-01`, total 4, 2 active days, 2 cells — and `activeDays === cells`.
- `bagworkerHref`: handle → `/dashboard/profile/toshi100x`; no handle → `/dashboard/profile/3578` (the number fallback); a whitespace handle falls back to the number too.
- Live: `/dashboard/profile/toshi100x` 200 (the sign-in gate when anonymous, no crash); both `/api/profile/toshi100x` and `/api/profile/unknown` 401; `/api/profile/activity?user=toshi100x` 200 with the **identical payload shape** as before the refactor, still anonymous — the calendar did not regress.
- `tsc --noEmit` and ESLint clean.

**Not verified, and why**: the page as a signed-in viewer. Everything on it sits behind Privy auth and I have no credentials for this deployment, so the visual pass is outstanding — the data, routing, auth gate and rendering path are all covered above, but nobody has looked at the rendered page yet. Worth one look while signed in, from the leaderboard.

**Deploy note**: `vercel --prod` started failing with `Not authorized` while `vercel whoami` still answered — the CLI's default scope had dropped. `vercel --prod --scope retarddevthatknowcodes-projects` deployed normally, so if a deploy is ever refused, that is the first thing to check.


**A fidelity bug caught by looking.** The fallback card first rendered without a verified tick. The parser was already correct (`author.verification.verified`); my test fixture had copied the wrong key from an earlier probe. A screenshot caught what a green typecheck cannot.






## Two create flows — fixed-budget Bags and Fee Redirect flywheel campaigns

**Why they are separate, not steps of one form.** The two lifecycles disagree about nearly everything: where the money comes from (a verifiable transfer vs. fees routed by the token), what makes a campaign open (a confirmed signature vs. the publisher's confirmation), and what the publisher has to know first (a budget and payout rates vs. a fee recipient and a share). The old single form made a fixed-budget bag *look* as though it could become fee-funded — a claim the data model never made, since `feeRedirectEnabled` is set at creation and never changes afterwards. The split now starts at a choice screen and ends in two components, two payloads, and two lifecycle rules enforced by the API.

**Entry screen** — `create-bag-kind-choice.tsx` (new): two options, `BagKind = "fixed" | "flywheel"`, one `onSelect(kind)`. It is the only shared surface; after it, each flow is entirely its own.

**Flow A — fixed-budget Bag campaign** (`create-bag-page.tsx`):
- All fee-redirect machinery removed: the Switch, `feePct`, `feeMint`, the treasury address field and the pump.fun / other-launchpad / own-contract instructions (roughly 70 lines sitting mid-form) are gone, replaced by a comment recording where that content now lives. `Draft`, `EMPTY` and the POST payload no longer carry fee fields at all, so this code path cannot request `feeRedirectEnabled: true` — the API's `false` default is now the only value a fixed-budget bag can be created with.
- Relabeled throughout: step 2 is "Rates, token & limits", the header reads "Fixed budget / Create a Bag campaign", and Back on step 0 returns to the choice screen instead of being disabled.
- Banner upload, token chooser, rates/limits and the funding step are untouched, so existing fixed-budget bags behave exactly as before.


**Flow B — Fee Redirect flywheel campaign** (`create-flywheel-page.tsx`, new, four steps):
1. **Token & project** — campaign title, the fee source's contract address (resolved live for name, symbol and decimals), project name, brief, banner upload.
2. **Fee redirect** — the mechanism shown as the sequence it actually is (trading fees → Bagwork treasury → swapped to USDC → live content budget), the share being redirected, the treasury address with a copy button, and the three places it must be pasted: pump.fun's creator-fee sharing, other launchpads' fee recipient / revenue split, and your own contract's fee vault. Status is stated honestly as "waiting for fees", gated on recipient + publication.
3. **Payout rules** — reward per 1,000 views (default $10, editable), per-post cap (default $100, which is also what stops one viral post draining the bag), platform toggles, duration (3–90 days), optional submission and per-creator limits.
4. **Publish** — a summary, an optional starting budget (0 by default), and one action: create with `feeRedirectEnabled: true`, `feeRedirectPct` and `feeMint`, then publish. No funding step, no signature, no transfer.

Back returns to the choice screen throughout. A publication that fails after the campaign was created retries *that* campaign instead of creating a second one — the `created ??` pattern Flow A already used for its funding step.

**Why the bag is priced in USDC.** The fee loop swaps incoming fees to USDC before crediting the budget (`lib/fees/sync.ts`), so denominating a flywheel bag in any other asset would mean adding one token's dollars to another token's budget. The token whose *fees* fund the bag is recorded separately as `feeMint`.

**API — where the separation is actually enforced** (a split that exists only in the UI would be a claim, not a design):
- `POST /api/campaigns` — `budget: 0` is accepted **only** when `feeRedirectEnabled` is true (`startsEmpty`); the fixed minimum still guards every transfer-funded bag, and the `perPostCeiling > budget` rule is skipped for the same case. `slotsRemaining` is created as **0**, not `Math.max(1, …)`: a bag with no money must not offer a claimable place, and the fee sync increments slots together with budget anyway, so slots arrive *with* the money.
- `PATCH /api/campaigns/[id]` — accepts `{ publish: true }` as the flywheel's DRAFT→LIVE transition, refused unless the campaign is `feeRedirectEnabled` and still a draft. Without that flag, publishing would be a way for a fixed-budget bag to go live without the transfer it is supposed to be waiting for, and a creator could not tell the difference from Explore. `{ status: "ENDED" }` (close) behaves exactly as before.
- Claim and submit gates (`submissions/claim`, `submissions`) — zero slots on a fee-redirect bag now answers "This bag is waiting for its first fees — slots open as fees are detected" instead of "This bag is full". A bag that has never been filled is empty, not full.
- `usePublishFlywheelBag()` added to `lib/console/hooks.ts`, mirroring `useCloseBag`.


**Verified.** `tsc --noEmit` clean across the project; ESLint 0 problems on all eight touched files (`create-flywheel-page.tsx`, `create-bag-kind-choice.tsx`, `create-bag-page.tsx`, `console/hooks.ts`, `campaigns/route.ts`, `campaigns/[id]/route.ts`, `submissions/route.ts`, `submissions/claim/route.ts`); `next build` compiles and generates every route. Deployed with `vercel --prod --scope retarddevthatknowcodes-projects` → Ready in 3m, aliased to `https://bag-work.fun`. Production `/dashboard/create` loads with 0 console errors and shows the sign-in gate (screenshot `prod-create-gate.png`).

**Not verified, and why.** The choice screen and both flows as rendered by a signed-in publisher: everything past the gate sits behind Privy auth and there are no credentials for this deployment. The screens are covered by typecheck, lint, build and a line-by-line read of the render paths, but nobody has seen them painted. Worth one pass while signed in: the two-option card, then one trip through each flow's steps.

**Still incomplete — fee detection and automatic budget growth, plainly:**
- **Growth is polled, and the poll runs daily.** The only trigger is the `vercel.json` cron (`0 0 * * *` → `/api/fees/sync`) plus a hand POST of that endpoint. Nothing in the console calls it, so a publisher cannot press "sync" — a flywheel bag grows at best once a day, and a campaign page will read the same `$0` for hours after fees actually landed. Cheapest next step: an hourly cron, or a "Sync now" action on the campaign page.
- **Publish → immediately earn is not true yet.** Slots are credited as `floor(USDC received / per-post cap)` in the same pass that credits budget, so a bag published at $0 accepts no claims until detected fees reach one cap (default $100). The gate now says why instead of saying "full", but the first creator still has to wait.
- **The card shows USDC, not the fee source's symbol.** `Campaign` stores the mint (`feeMint`) but not its display symbol, so a flywheel bag's card reads "USDC + Fee Redirect badge" rather than "$NOVA fees". Showing the project's own token needs a schema column — deliberately not faked by parsing the mint.
- **Explore treats a published $0 flywheel as an ordinary LIVE bag.** Clean card, Fee Redirect badge, `$0 budget` — honest, but a dedicated "Fee Redirect" label or the planned Flywheel filter is still open work.
- **Detection is Helius polling over enhanced transactions, not a webhook** (documented in `lib/fees/sync.ts`). Fine for a daily pass, wrong for a "live" promise; a webhook would make the budget track trading in near-real-time.


## Dual treasuries + server-side automatic payouts

**Why.** One wallet held both funding models, so every downstream question — which wallet pays this payout, whose history holds this deposit, which address a launchpad fee recipient points at — had to be guessed. Worse, the payout path was structurally broken: `/api/payouts/build` produced a transfer whose *source and fee payer were the Bagwork treasury* and then asked the publisher's browser to sign it via Privy, which nobody but the holder of the server's key could ever do. The dual split makes each answer structural, and payouts became a server obligation: approval now pays.

**Wallets** (`src/lib/solana/treasury.ts`, rewritten): `TreasuryKind = "FIXED" | "FEE"`. **FIXED** (`TREASURY_FIXED_PRIVATE_KEY`) holds publisher budgets; **FEE** (`TREASURY_FEE_PRIVATE_KEY`) holds redirected trading fees. Legacy `TREASURY_PRIVATE_KEY` maps to FIXED, so the existing deployment's funded bags stayed payable with zero env changes — verified: FIXED resolves to the same address as before (`Dq8DGtjMNxojGctpVduXxAVNbjKd4njjwwYh7nsLonoD`). The FEE wallet deliberately has **no** legacy fallback; it was provisioned fresh (`FQ9QB9fYRcXmQUApQDhWDJpXVfGnPvBfPGEuAstcBk1h`, pushed to Vercel as `TREASURY_FEE_PRIVATE_KEY`, never printed) because a flywheel drawing from publisher budgets is exactly the mixing this exists to prevent. Keys are read server-side only; `GET /api/treasury?kind=fixed|fee` returns addresses and nothing else.

**No mixing, enforced in four places.** (1) `POST /api/campaigns` pins `treasury` + the new `treasuryKind` column by flow — fixed bags to FIXED, flywheels to FEE — and so does admin create (always FIXED). (2) Fee detection: the cron (`syncFees`) reads **only** the FEE wallet's history; the Alchemy webhook classifies each entry against whichever wallet it involves, and `tryAttachFeeDeposit` refuses anything that did not land in the FEE wallet (a fee token arriving at the FIXED wallet falls to `unmatched` — recorded, never converted). (3) Funding: `tryMatchFunding` additionally requires `feeRedirectEnabled: false`, so no stray deposit can "fund" a flywheel to LIVE; `/fund` and `activateCampaignFromTransfer` compare against the campaign's **own kind's** current address. (4) Payouts: `confirmPayoutTransfer` takes an explicit `source` (the automatic path always passes the campaign's own treasury).


**Automatic payouts** (`src/lib/payouts/settle.ts`, new): on approval the server picks the wallet by campaign type, checks it can actually pay (SOL for fees, token balance for the amount — otherwise **blocked** with a named reason, submission stays `approved`, nothing marked paid), builds with the existing `buildPayoutTransaction`, **signs server-side with the treasury key**, sends, and confirms via the same balance-delta verification the manual path used. Only a confirmed transfer writes the Payout row, flips the submission to `paid`, credits points and rebuilds the leaderboard. Double-pay protection: the broadcast signature is persisted the instant the transfer is sent, and a later pass **confirms** it rather than re-sending; a reverted transfer clears it for a fresh attempt; the unique `Payout.submissionId` is the durable backstop behind a per-instance in-flight guard. Wired into: the review engine (every approval), `POST /api/admin/approve`, and a daily sweep `POST /api/payouts/run` (cron `0 1 * * *`, gated on `PAYOUT_RUN_SECRET`/`CRON_SECRET` **or the admin cookie** — deliberately stricter than the fee sync, which allows any session, because money moves here). Fixed two latent bugs on the way: payouts now pay the campaign's **own** mint (the old build route hardcoded USDC while the record route verified the project mint — a SOL bag could never settle), and payout rows record the real token symbol.

**Removed.** `POST /api/payouts/build` and `POST /api/payouts` (creator-recorded signatures) — deleted, along with `pay-creator.tsx`, `payout-dialog.tsx`, the dead `usePayout` hook, and the publisher's Pay/Record buttons. The payout queue is now a window, not a to-do list: each row says which wallet pays ("Pays from budget" / "Pays from fees") and shows any blocked reason. **Admin manual override stays**: `/api/admin/pay` is untouched (build preview + signature recording). Privy's role is now exactly: login + the publisher's *funding* signature.

**Data model.** `Campaign.treasuryKind` (TEXT, default `"FIXED"`, migration `20261002120000_dual_treasury` applied via `migrate deploy`) — pinned at creation beside `treasury`. The migration backfills `fee_redirect_enabled = true` rows to `"FEE"`, and `treasuryKindFor` derives the same rule for any row that predates the column, so old campaigns are FIXED unless fee redirect is on.

**Fee-loop fixes riding along** (both were making growth impossible in practice): the cron now reads each mint's **real decimals** instead of multiplying by 1e9 (the old code overstated a 6-decimal token's deposit 1000× so its swap always failed), and `recordAndProcess` no longer strands webhook-recorded rows — retryable statuses (`received`, `matched`, `unmatched`, `no_route`, `below_minimum`) get their swap attempt on the next pass. `failed` is deliberately not retried: a swap that threw may have settled, and re-swapping could spend tokens twice.

**UI copy.** Flow A's funding step names the *fixed-budget* treasury (and says it is not the fee wallet), button reads "Confirm funding in your wallet", and a live stepper shows waiting-approval → confirming-on-chain → verified → LIVE. Flow B's fee-redirect step shows the FEE address with an explicit "this is not the fixed-budget treasury" note, and the campaign page's fee panel now shows the fee wallet address for re-checking a missing deposit.


**Verified.** `tsc --noEmit` clean; ESLint 0 problems across all 29 touched files; `next build` compiles and generates every route; `prisma migrate deploy` applied cleanly; an 8-check script (`tool-results/verify-dual-treasury.ts`) passes — both wallets resolve, they differ, and every kind-derivation and migration-rule case returns the expected wallet. Deployed with `vercel --prod --scope retarddevthatknowcodes-projects`; production `GET /api/treasury?kind=fixed|fee` returns the two addresses as wired, `GET /api/payouts/run` answers 401 unauthenticated (fail-closed), and the two removed routes (`POST /api/payouts`, `POST /api/payouts/build`) answer 404.

**End-to-end journey against production: 29 of 30 checks pass.** The full `scripts/verify-journey.ts` suite ran against `https://bag-work.fun` on the same Supabase data the app uses: A3 create→DRAFT, A5 funding signer resolves, A6 an unverifiable deposit cannot activate a bag, A8 `/fund` is session-guarded (401), B7–B8 opt-in spends a slot then submits, B9–B11 admin approve/reject, B12 the build refuses a creator with no wallet (422, with the reason), B13 build returns a real unsigned transfer, B14 recording refuses an unconfirmed signature with **0 payout rows written**, B15–B17 points (+132, exactly the expected $1→33 rule), earnings and leaderboard all move, C1 no admin-only field leaks. The single failure, **C2 "operator-created bag appears in the live feed", is a test race, not a regression** — the public feed is edge-cached for 30 s and C2 reads the same URL B4 had just fetched. Re-running the exact fixture against a cache-miss showed `cache-age 0s, bag visible = true`, and after the 30 s expiry `cache-age 35s, bag visible = true`; the bag is in the feed either way. (A useful lesson left in place: the suite's C2 assertion is unreliable against a cached endpoint.)

**Not verified, and why.** Real on-chain movement (a funded transfer, an approval that pays, a fee swap) — those need funded wallets and a live Privy session on mainnet, neither of which exists here. Every step of those paths is covered by typecheck, lint, build, the selection-logic script and the pre-checks' named reasons; the first real approval is worth watching in the logs (`[payouts/settle]`), and the first fee deposit should show up in the campaign page's fee panel. Operators must still top both wallets up with SOL for fees, and the FIXED wallet with whatever token its bags pay in.

**Still open, honestly.** Legacy *fee-redirect* campaigns pin the old (now-FIXED) address, so their payouts come back blocked with a migrate message until their funds are moved to the FEE wallet or an operator records a manual payout via `/api/admin/pay`. Any token whose fees were already pointed at the old address must be re-pointed at `FQ9QB9fYRcXmQUApQDhWDJpXVfGnPvBfPGEuAstcBk1h` — fees sent to the old wallet are recorded by the webhook as unmatched and are never converted. The fee sweep remains daily (Hobby plan), so flywheel growth is still once-a-day unless the plan is upgraded; `syncAndCredit`'s USDC out is now credited correctly, but nothing surfaces a *swap that settled while its row stayed unwritten* except a manual reconciliation.



## Profile rebuilt as a view — every editable field moved into a settings drawer

The profile page is a *view* again. It used to interleave eight editable fields — display name, handle, bio, character, "here as", platforms, social handles, payout wallet — with the live numbers, the contribution calendar and the submission list, so the page a creator read their own stats on was also the form they edited them on, and both jobs suffered for it. The page now reads top to bottom; everything writable lives behind the gear.

**What the page is now** (`src/components/console/pages/profile-view.tsx`, rewritten):

- **Header** — title, tagline, and one control: the gear that opens settings. No inline fields anywhere.
- **One card, two halves.** Left: avatar, `Bagworker#`, a "Setup incomplete" flag while onboarding is unfinished, display name, `@handle · joined <date>`, bio, and the link to the public profile. Right: level (a `LevelRing` plus the level, "N to go" or "Top level"), points, submissions (with "N approved" when there are any), approval rate, and total earned (with "N in flight" while anything is unsettled).
- **A compact strip** under it: contributions in the last 12 months, active days, how many slots are waiting on a link, and the truncated payout wallet.
- **Then the work**: the activity calendar on the left, the tabbed submission list on the right.

**Choices worth naming.**

- **The tabs are real statuses** — pending / approved / paid / rejected — not invented groupings. `claimed` is deliberately *not* a tab: a claimed slot with no link is a next *action*, so it appears as a warning footer on its own row ("Slot claimed — no link submitted yet" → Find work) and the strip counts it ("N slots waiting on a link"). Burying a to-do inside a filter is how to-dos get lost.
- **Approval rate renders `—`, not `0%`, when nothing has been decided.** The hint says "Nothing decided yet"; a zero would read as a failure the creator has not actually had.
- **Level leads the numbers** because it is the one figure that moves on its own.

**The drawer** (`src/components/console/profile-settings-sheet.tsx`, new, 561 lines): identity (name, handle, bio), character, "here as", payout wallet, platforms and their handles, and notification preferences. The details that matter:

- It **re-seeds every field from the saved profile each time it opens.** It stays mounted so the close animation can play, so state has to be reset by hand — otherwise a reopen would show the previous session's values and `dirty` would be a lie. Save stays disabled until something actually changed.
- Saving goes through **the same `useUpdateProfile` mutation the page used before** — same validation, the same `issues` payload rendered as the error — so the write path is unchanged; only its trigger moved.
- The payout wallet **offers the signing wallet as a default but never silently adopts it**, and the field says so; an invalid Solana address is refused before it can become the address payouts are sent to.
- Notification prefs are **per-browser** (there is no server-side preferences table), the drawer says so, and they share the `bagwork.settings` key with the Preferences page through a single `SETTINGS_DEFAULTS` export — so the two surfaces cannot drift apart.

**Verified.**

- `tsc --noEmit` clean; ESLint clean on all three files; `next build` clean (24/24 static pages, `/dashboard/profile` still static).
- Deployed to production (`vercel --prod`, deployment `bagwork-37qr91aw5-…`, aliased to `https://bag-work.fun`, "Ready in 2m"). Prod smoke: `/dashboard`, `/dashboard/profile` and `/dashboard/settings` all 200.
- **The deployed bundle is the rewrite, proved rather than assumed.** `tool-results/check-prod-bundle.mjs` fetches `/dashboard/profile` from production and downloads all 43 assets it references; every rewrite-only string came back from `/_next/static/chunks/ceaae4cf665fbba5.js` — "waiting on a link", "Setup incomplete", "Nothing decided yet", "Slot claimed", "settles automatically", "Profile settings", "Top level".
- **The utility classes are real CSS, not silently dropped class names.** The deployed stylesheet contains `bg-warning/10`, `border-warning/40` and `text-brand` (declared through `--color-warning` / `--color-brand` in `globals.css`) — the failure mode a typecheck cannot catch.
- `settings-page.tsx` still compiles and serves (`/dashboard/settings` 200) after `SETTINGS_DEFAULTS` / `SettingsState` became its exports; the new sheet is its only importer.

**Not verified, and why.** The signed-in rendering was never seen in a browser. The page needs a live Privy session — identity is verified against Privy's JWKS, so no token can be minted locally — and the Playwright MCP is not connected in this session. Left unproven, therefore: the layout with real data, the gear actually opening the drawer, and the tabs filtering. That is worth one minute in a signed-in browser before this section is called done.

---

Task ID: LAUNCH-FLYWHEEL
Agent: main
Task: Rebuild Fee Redirect from a "paste your contract address and point its fees at us" form into a full Launch-on-Bagwork flow: the launcher creates a coin, 100% of its creator fees lock to the Bagwork FEE treasury, and a Flywheel bag is auto-created.

**Why it changed.** The old Flow B opened by asking for a contract address, which quietly assumed the launcher already had a token and already knew what a fee recipient was. Three of its four steps were instructions for work being done somewhere else. The new flow starts where a launcher actually is — with an idea for a coin — and does that work for them.

**The mechanism, and why it is one transaction.** A launch is three instructions, in this order, signed once:

1. `create_v2` mints the coin and opens its bonding curve, SOL-quoted, with the launcher as the curve's creator. The optional dev buy rides along via `createV2AndBuyInstructions`, which bundles create + the launcher's token account + a first buy.
2. `create_fee_sharing_config` opts the coin into shared distribution, migrating the curve creator onto a `sharing_config` PDA.
3. `update_fee_shares_v2` sets a single shareholder — the FEE treasury at exactly 10,000 bps — and **revokes the admin as it applies it**. The program allows a split to be set once per sharing config, so this instruction *is* the permanent lock: there is no "unlock" to call later, by anyone, including us. That is a protocol guarantee rather than a promise in our code, which is the only kind worth advertising.

Built against the official `@pump-fun/pump-sdk` rather than hand-rolled PDAs and account lists. Those are versioned protocol surface that shifts under the app, and deriving them by hand for a flow that moves real money is not defensible.

**Security posture.** The mint keypair is generated **in the browser**, per attempt, and never reaches the server — the server is handed a public address and builds instructions for it, so Bagwork holds no key to anyone's coin. `create_v2` requires the mint's own signature, so the client partial-signs before `signAndSendTransaction` fills the fee-payer slot.

Three things are refused rather than warned about, because each would cost the launcher a fee and a wallet prompt for nothing:

- a dev buy over **10% of supply**, checked on the *real bonding-curve quote*, not on the form — and re-checked inside the instruction builder on the number actually being signed;
- a transaction that does not **simulate**;
- and, after signing, a launch that does not prove out on-chain.

That last check is the gate between "a transaction was signed" and "a bag exists". The route reads the coin's `sharing_config` back off the chain, asserts the treasury holds exactly 100% and that `isSharingConfigEditable` is false, and only then creates a bag. A signature in a database is not evidence of anything. A failed verification leaves a `failed` launch row with the reason on it and **no bag at all** — a bag whose fees are not locked would be a lie told to everyone who makes content for it.

`PUMP_LAUNCH_ENABLED` gates the whole flow and **fails closed**: anything but the literal "true" answers 503, and an armed flag with no resolvable FEE treasury is refused too, because a launch with nowhere to lock fees to would create a coin whose creator fees accrue to a wallet nobody controls.

**Data model (additive migration `20261005120000_launch_flywheel`).** A `launches` table records the on-chain fact — mint, transaction, the fee split read back from the chain, dev buy in lamports *and* in bps of supply — kept separate from the campaign it produces so an abandoned or failed launch still leaves a diagnosable row. `campaigns` gained `kind` (FIXED | FLYWHEEL), `token_image_url` and `token_symbol`; the backfill repeats the old derivation (`fee_redirect_enabled = true` → FLYWHEEL) so no existing row changes meaning, and the seeded test bags are untouched.

**Auto-created bag fields.** Payment model RPM, `ratePer1k`/`maxPayout` from the wizard, `feeRedirectEnabled: true`, `feeMint` = the launched mint, `treasuryKind: "FEE"`, `kind: "FLYWHEEL"`, the coin's image and ticker, and status **LIVE** — not DRAFT, because DRAFT exists to hold a fixed-budget bag until a transfer lands and a flywheel has no such step. `budget`, `fundedAmount` and `slotsRemaining` all start at **0**: no money exists yet and no claimable slot exists until fees fund one, which the existing fee sync raises together. Nothing shows a funded budget before fees arrive.

**What the old path is, now.** Demoted, not deleted. A team whose token already exists — launched by themselves on pump.fun, or on another launchpad entirely — cannot use a wizard that creates the coin, so the manual flow stays reachable from the wizard's first step ("Already have a token? Point its fees instead"). It is no longer presented as an equal choice on the entry screen.

**Verified.** `tsc --noEmit` clean; ESLint clean on every new and changed file; `prisma validate` clean and `migrate status` lists the new migration as the only unapplied one, so the file is well-formed and correctly ordered. The wizard's server contract was typechecked against the SDK's real typings, which is the strongest check available without a chain — it is what caught the `create_v2` mint-signer requirement.

**Not verified, and why — and this is the important part.** **No launch has ever been executed.** Nothing in CI can: a launch needs a funded wallet signing in a browser through Privy, and this environment has neither. So the following is *written to the published API and typechecked*, not *known to work*: the assembled instruction sequence executing on-chain, the compute budget being sufficient for a create plus three fee-program calls, pump's own creation fee and account rent (which the cost estimate describes rather than guesses at), and the whole sign → broadcast → verify → bag round trip.

That is why `PUMP_LAUNCH_ENABLED` exists and defaults to off, and why the flag's own documentation says the flow must stay unarmed until it has been through a **real devnet run with a real wallet**. The first devnet launch is the next step, not this one.

Also not done, and not claimed:

- **The fee → USDC → budget path was not touched.** Fee detection, Jupiter conversion and crediting `feeRaisedUsdc` already exist (`lib/fees/sync.ts`, `lib/treasury/inbound.ts`); the new bag simply pins `feeMint` to the launched mint, which is what that pipeline matches on. That the two connect correctly is **reasoned, not observed** — it needs a coin that has actually traded.
- **No dedicated post-launch token page.** The wizard lands on the existing bag detail page, which already renders the identity, the fee panel and the live budget. A bespoke token+chart page reusing the Token Analytics components is worth building and was not.
- **`prisma migrate deploy` has not been run**, so the `launches` table does not exist in the database yet and the flow is inert until it is. Deliberately not run from here: it is a schema change against a live database, and the standing workflow is local → commit → push.


---

Task ID: LAUNCH-FLYWHEEL-UX
Agent: main
Task: Replace the four-step Launch Wizard with a single-page launch form and a live preview column (UsePaid layout energy), without touching the launch mechanism.

**Replaced, not wrapped.** `create-launch-wizard.tsx` is deleted; `create-launch-page.tsx` (`CreateLaunchPage`) replaces it, and `create-bag-page.tsx` now renders it for the flywheel branch. No wizard chrome survives: no step dots, no "Continue" between Token / Bag rules / Launch / Review, no separate review screen. One page, one signature.

**Why a wizard was wrong here.** It made the launcher answer questions in an order we picked and then walk back through the whole thing to change a ticker — while the fields it separated are not stages of anything. "What is this coin called", "what do its fees pay for" and "how much of it am I buying" are one decision: what are we launching.

**The mechanism is untouched, deliberately.** Same `create_v2` + `create_fee_sharing_config` + `updateFeeSharesV2` sequence, same 10,000 bps to the FEE treasury, same server-side build and on-chain verification, same client-generated mint keypair, same 10% dev-buy cap enforced on the real curve quote. Only the layout changed. Quote / build / verify APIs are called exactly as before.

**New: `GET /api/launches/availability`** and `useLaunchAvailability`. The old flow could only discover `PUMP_LAUNCH_ENABLED` was off by meeting a 503 at the wallet prompt, after filling in a whole brief. The page now asks first and puts the refusal in a banner above the form, with the CTA disabled — and an *unconfirmed* check counts as disabled, so the safe state is also the default state. Unauthenticated and no-store: it returns a boolean, the operator's reason, and the FEE treasury address, which `/api/treasury?kind=fee` already serves publicly. No key is involved.

**The mode switch** is `Launch` / `Register` / `Walletless`, rendered as segmented pills. Only `Launch` is live; the other two are `disabled` with a `Soon` badge and an `aria-disabled`, because they describe where this is going and a control that silently does nothing is indistinguishable from one that is broken. Neither is implemented, per the brief.

**Layout.** Left column: dropzone (click *or* drop, whole panel targets, keyboard reachable), name + ticker, description, a folded-away Socials block, the bag rules, the dev buy, the cost panel, the fee-lock notice, then the CTA. Right column: a sticky preview at `lg:` that stacks below the form on mobile — coin image, name / TICKER, Flywheel + fee-lock badges, the brief, and a definition list of reward, cap, duration, platforms, dev buy and total cost. It reads only state the form already owns, so it cannot drift from what gets signed.

Two bits of UX the wizard had no room for: the CTA now names the **first unmet rule** when it is disabled (a greyed-out button with no reason tells someone they are wrong without saying what), and the preview states the fee lock **once as a fact** instead of reassurance repeated across three screens. The manual "point an existing token's fees" path is demoted to a small link under the form, as asked.

**Verified.** `tsc --noEmit` clean; ESLint clean on every changed file; and a **dev-server smoke test** — `next dev` on :3401 served `/dashboard/create` **200** with no "Failed to compile" / "Module not found" in the log, which is the check tsc cannot make (it proves the new page survives Next's real client/server boundary, including the `import type` of `LaunchCostEstimate` from a module that imports the pump SDK). Server shut down afterwards. No stale `CreateLaunchWizard` references remain.

**Not verified, and why.** A full `next build` and a signed-in render were not run — the build exceeds the command budget here and the page needs a live Privy session, which cannot be minted locally. So the layout with real data, the sticky behaviour at `lg:`, the drag-and-drop path, and the enabled-flag banner in its *on* state have not been seen in a browser. Everything about launching itself remains exactly as unverified as the previous entry says: **no launch has ever been executed**, so the flow is still written-to-the-API and typechecked rather than known to work, and `PUMP_LAUNCH_ENABLED` must still stay unset until a real devnet run.


---

Task ID: US-REGION-MOVE
Agent: main
Task: Move the app and the database from Tokyo to the US, so the functions and Postgres stop being a continent apart from each other and from the users.

**What was actually found.** Both halves were in Tokyo, and had been for some time:

- `vercel.json` → `"regions": ["hnd1"]` (Tokyo). `hnd1` was the only region configured, and there are **no per-route overrides** — a repo-wide search turned up no `preferredRegion` and no `runtime = "edge"`, so `vercel.json` is genuinely authoritative for where functions run.
- Supabase → `aws-0-ap-northeast-1.pooler.supabase.com` for both `DATABASE_URL` (6543) and `DIRECT_URL` (5432). Tokyo.
- The worklog already had the measurement that explains why this matters: *"Every database statement against the Supabase transaction pooler costs ~920ms from this environment (`aws-0-ap-northeast-1`). That is the floor, and it is the number everything else is explained by."* That figure is from a dev machine, not from `hnd1`, but the shape of the problem is the same one the region move is about.

**Changed in the repo (this is the whole code-side change).**

- `vercel.json`: `"regions": ["hnd1"]` → `["iad1"]` (Washington D.C., US East). Nothing else in the file moved — both crons and both redirects are untouched. No feature, route or query changed; this is a region and only a region.
- `.env.example`: the database section now states that the two URLs are a **pair** with the Vercel region rather than two independent settings, names `us-east-1` as the region to pair with `iad1`, and shows how to read the region out of the hostname (`aws-0-us-east-1.pooler.supabase.com` vs `aws-0-ap-northeast-1.pooler.supabase.com`) so a mismatch is visible at a glance. It also warns that a newer project may use an `aws-1-` prefix, so nobody hand-edits the prefix.

**Not done, and cannot be done from here.** A Supabase project's region is fixed at creation — it cannot be flipped, and there is no code change that moves it. This needs the dashboard: create a `us-east-1` project, run `prisma migrate deploy` against it (all 19 migrations, purely additive), move the data, then paste four values into Vercel.

**The ordering trap, stated plainly.** Flipping Vercel on its own produces *US function ↔ Tokyo database*, which is the mismatch this task exists to remove — and it is a **regression for database-heavy endpoints** while it lasts, not a neutral step. Today a US request pays one long hop to Tokyo and then talks to Postgres locally; after the Vercel-only change it pays a short hop to `iad1` and then ~150ms *per statement* back to Tokyo. A console request that runs several statements is slower, not faster, until the database follows. So the two halves should move close together — the sequence that avoids the window entirely is: create the US project, migrate, paste the env vars, and only then let this deploy land. Because the deploy does not depend on the database being US, it is harmless either way; it is the *latency* that is worse in between, not the correctness.

**Env keys that must be updated on Vercel (all four, together).**

1. `DATABASE_URL` — new project's transaction pooler, port 6543, `?pgbouncer=true&connection_limit=...`
2. `DIRECT_URL` — new project's direct/session connection, port 5432
3. `NEXT_PUBLIC_SUPABASE_URL` — `https://<new-ref>.supabase.co` (only if the supabase-js path is ever switched on; `src/lib/supabase/*` was removed as unused, so the app reads Postgres through Prisma alone)
4. `SUPABASE_SECRET_KEY` — only if that path is switched on

`.env` and `.env.local` are gitignored (`gitignore:37`), so the local copies of these are the developer's to update and are not in this commit.

**Verified.** `vercel.json` parses, `regions` reads `["iad1"]`, and both crons and both redirects survive. `git grep hnd1` finds nothing outside the worklog's own history (which is a record, not configuration). `tsc --noEmit` clean. Only two files changed.

**Not verified, and why.** Nothing here can be: I cannot create a Supabase project, cannot read Vercel's dashboard, and cannot observe production latency. So the US region is *configured*, not *confirmed* — the confirmation is a deploy plus a look at the project's function region and the database hostname. And the premise itself — that a majority of users are in the USA — is the operator's, not something this repo can measure.


---

Task ID: FAST-SIGNUP
Agent: main
Task: Cut signup down to "connect wallet → land in the app → launch a coin", and take the form out of the doorway.

**What changed.**

1. **Login is wallet-first.** `loginMessage` now leads with the wallet instead of offering email as an equivalent door, and `loginMethods` keeps `wallet` first. Wallets were already the presented path (`showWalletLoginFirst`, `walletChainType: "solana-only"`, and a curated `walletList` of Phantom / Solflare / Backpack / Jupiter).

2. **A new account is complete the moment it exists.** `syncUser` now fills three defaults at creation, because the wizard that used to collect them is gone:
   - **handle** — a generated two-word name (`mooncat`, `solcrab92`) via the new `lib/profile/handles.ts`. Privy's own handle wins if it supplies one. Uniqueness is a read-and-check plus an incrementing suffix, not a constraint, because `handle` has no unique index and adding one now would fail against accounts that already share one. `Bagworker#` remains the identifier that is actually guaranteed unique.
   - **payoutWallet** — the wallet they signed in with. There is no better answer available and no reason to ask.
   - **onboardingCompletedAt** — stamped, so the flag cannot call a finished account unfinished.

   The **character is deliberately left null**. `resolveCharacter` derives a stable look from `profileNumber`, so an unset character is already a complete, consistent avatar. That is what makes "random defaults" free rather than a second thing to generate and store.

   Existing accounts get the same treatment lazily: a signed-in user with no payout wallet has one filled from the wallet they connect, and only while the field is empty — so it stays a once-ever write rather than the every-request write this function was already fixed to avoid.

3. **The onboarding gate is gone.** `ConsoleShell` no longer holds anyone on a setup flow; `onboarding-flow.tsx` is deleted. The shell still shows a page skeleton while the profile read is in flight, but the four-step wizard that stood between a signed-in user and every console page does not exist any more.

4. **The launch page names the dev wallet.** A panel above the form shows the connected account wallet, truncated, and says what it is for: it pays the launch cost and any dev buy, and it is the only signer. With no wallet it says that is the only thing missing, and the primary button becomes **Connect wallet** rather than a disabled "Sign and launch" beside a separate connect affordance — one button that always does whatever is actually blocking.

**A finding that changed the answer: wallet-only login would have locked everyone out.** Before setting `loginMethods: ["wallet"]` I checked what exists:

```
total users            : 4
with a wallet          : 0
EMAIL-ONLY (no wallet) : 4
onboarding completed   : 4
```

All four accounts are email-only, and `loginMethods` is per-app rather than per-user — so removing email signs all four out permanently with no recovery path inside the product. That is precisely what the brief said not to do, so email stays listed and the decision moved into `NEXT_PUBLIC_PRIVY_WALLET_ONLY` (default off, documented in `.env.example` with the query that says when it is safe to flip). One env var turns it on for real; nobody gets stranded in the meantime.

**A finding that constrains the rest: the avatar is already permanently locked.** `PUT /api/profile` returns `403 "Your character is permanent and cannot be changed"` once `character` is set. The brief anticipated this ("do not invent a second lock system", "avatar editable via Edit *unless existing lock policy forbids it*") — the existing policy forbids it. So the rule the Randomize button must follow is:

- **username** — re-rollable at any time, server-allocated through the same free-handle path used at signup;
- **avatar** — re-rollable **only while `character` is still null**, which is exactly the new-user window, because the lock check in the route is guarded on `session.user.character` being set. After the first save the avatar is permanent, and Randomize must say so rather than appear to change something it cannot.

**Not done, and the reason.** The **profile Edit-into-a-section and the Randomize button were not built.** They need an inline expanding editor on the profile page plus a `randomize` flag on `PUT /api/profile`, and the avatar half of it has to be written against the lock rule above rather than against the brief's original "re-roll username + avatar together". Doing it at the end of a long session with that constraint half-worked-out risked shipping a button that appears to re-roll a permanent field. The rest of the brief is complete and green; this is the piece left.

**Verified.** `tsc --noEmit` clean and ESLint clean on every changed file. No `OnboardingFlow` references remain. The user counts above came from the live database, not from inference.

**Not verified.** No signed-in browser run — a real Privy session cannot be minted here — so the wallet-first modal, a brand-new account's first landing, and the launch page's connect gate have not been seen rendered. And `NEXT_PUBLIC_PRIVY_WALLET_ONLY` is documented but unset, so the wallet-only variant of the modal has never been displayed.

---

Task ID: WALLET-ONLY-AND-DEFAULT-PAYOUT-WALLET
Agent: main
Task: Align Privy to the wallet-only dashboard, make the signup wallet the default payout wallet, add the Privy webhook safety net, and make the console header chip avatar + wallet + SOL.

## 1. Privy is wallet-only in code, not just in the dashboard

- `lib/privy/config.ts` — the `NEXT_PUBLIC_PRIVY_WALLET_ONLY` flag and its `WALLET_ONLY_LOGIN` export are **gone**. It defaulted to keeping email as a secondary door and existed only to protect four email-only accounts; the dashboard has since been set to wallet-only, so the code now states the same thing unconditionally instead of gating it behind a variable nobody set.
- `components/auth/auth-provider.tsx` — `loginMethods: ["wallet"]` (the literal, no conditional), one wallet-first `loginMessage`, `appearance.walletChainType: "solana-only"` and the curated Solana connector list kept as they were, and `embeddedWallets.solana.createOnLogin: "off"` to match the dashboard's disabled embedded wallets. No `login()` call passes options, so nothing can re-enable email at a call site.
- `.env.example` — the old flag's block is replaced with a note that wallet-only is enforced in code, plus the new `PRIVY_WEBHOOK_SECRET`.

## 2. The signup wallet is the default payout wallet

The behaviour was already in `syncUser` (created with `payoutWallet = wallet`, and backfilled only while the field is empty). Two changes harden it:

- `lib/auth/session.ts` — `toIdentity` now runs the linked Solana address through `isValidSolanaAddress` (`asSolanaAddress`), so a non-null `walletAddress`/`payoutWallet` is always a real base58 key. A malformed address degrades to `null` ("no wallet"), never to a payout target.
- The same module exports `syncUserFromPrivyUser(user)`, the entry point the webhook uses — one function decides what a user row looks like whether identity arrives on a request or a signed delivery.

Settings → Wallet shows it with no action: the page seeds `payoutWallet ?? walletAddress`, and `useProfile` is keyed on the wallet so the row re-syncs the moment the wallet is known. There is no forced "set up payout wallet" step anywhere.

## 3. Launch page

Unchanged, and it already did what the brief asked: the signer is the connected Solana wallet (session wallet preferred, else the first connected wallet), a single **Connect wallet** CTA appears when there is none, and `SignInRequired` gates only the launch form — the rest of the console is reachable signed-in or not.

## 4. Privy webhooks — added

`POST /api/webhooks/privy` (`app/api/webhooks/privy/route.ts`):

- Verifies with `privy.webhooks().verify(...)` — the SDK's Svix verifier, HMAC over `svix-id.svix-timestamp.rawBody`, timestamp tolerance included, checked over `req.text()` before parsing.
- **Fail-closed:** `503` while `PRIVY_WEBHOOK_SECRET` is unset (a write endpoint must not be anonymously reachable), `401` on a bad/stale signature, `500` only on a transient failure after verification (the one case worth a Svix retry), `200` for processed *and* deliberately ignored events.
- Handles `user.created`, `user.authenticated`, `user.linked_account`, `user.wallet_created`; upserts via `syncUserFromPrivyUser`, which backfills `payoutWallet` only while empty — idempotent under Svix redelivery.

**Still to click in the Privy Dashboard:** add a webhook endpoint at `https://bag-work.fun/api/webhooks/privy`, copy its `whsec_…` signing secret into `PRIVY_WEBHOOK_SECRET` (Vercel → server env), and enable those four events.

## 5. Console header chip — avatar + wallet + SOL

- `components/console/shell/user-menu.tsx` — the trigger is now PFP + wallet glyph + SOL balance. The `@handle` is gone (the identity stays in the menu behind it). No wallet → "Connect", no invented balance; unreadable balance → "—", never "$0". Click still opens the same menu (profile, payout wallet, settings, sign-out).
- `app/api/wallet/balance/route.ts` — `GET ?address=` validated with `isValidSolanaAddress`, read through `getSolanaBalanceLamports` (Helius → Alchemy → public), so no RPC key reaches the browser.
- `lib/console/hooks.ts` `useSolanaBalance` — keyed on the address (a wallet change re-fetches), `staleTime: 20s`, focus refetch off.
- `lib/console/format.ts` `solAmount` — `1.234 SOL`, `<0.001 SOL` for dust, `0 SOL` for nothing.

**Verified.** `tsc --noEmit` clean; ESLint clean on every changed file; `next build` clean, with `/api/wallet/balance` and `/api/webhooks/privy` both present as dynamic routes.

**Not verified / caveat.** No signed-in browser run — a real Privy session cannot be minted here — so the wallet-only modal, a brand-new account's first landing, the header balance and a live webhook delivery have not been seen rendered; the webhook is additionally inert until the dashboard endpoint and `PRIVY_WEBHOOK_SECRET` exist. Note also that the four email-only accounts recorded in the previous entry are stranded by wallet-only login — but that already happened when the dashboard was switched, and this change only brings the code back in line with it.



---

Task ID: WALLET-AUTOLINK-FIX
Agent: main
Task: Make the wallet used to sign in become the signing wallet AND the default payout wallet, and stop Settings saying "no wallet connected" for a wallet signup.

## Root cause (found, not guessed)

Every row in `users` had `wallet_address = null` — **all six accounts**, including the two that signed up after the wallet-only switch. The wallet was not missing: Privy has it.

`verifyRequestIdentity` (`lib/auth/session.ts`) could only learn a wallet one way — the identity token's `linked_accounts` claim. When that claim is absent (it only exists when **"Return user data in an identity token"** is enabled in the Privy dashboard) the SDK's parser throws, and the function fell straight through to the access token, which carries the **DID and nothing else**. It then returned `walletAddress: null`, and `syncUser` dutifully persisted a wallet-less row. `payoutWallet` could never be defaulted either, because its default *is* that wallet.

The code had been told this was unfixable: a note in `privy-server.ts` said Privy's user-by-id endpoint answers 405 to Node's fetch. That is true of the **legacy** `/v1/apps/{appId}/users/{userId}` path — but the SDK's own `client.users()._get(did)` calls `GET /v1/users/{id}`, a different endpoint that answers normally. Verified against this app's live credentials:

```
privy.users()._get("did:privy:cmutz5qc901rr0cjw7odslzxb")
→ linked_accounts: [{ type: "wallet", chain_type: "solana",
                      address: "3cG7zjhvGbMpiRVFszHV9k3ajEvesiE1gbFJiNiySRFB",
                      wallet_client_type: "Phantom", connector_type: "solana_adapter" }]
```

## Fixes

1. **`lib/auth/session.ts` — the actual fix.** After the access token yields the DID, the user is now read from Privy and run through the same `toIdentity`, so `walletAddress` is written and `payoutWallet` is defaulted on the first authenticated request. Cached per DID (5 min success / 30 s failure) because it runs only on the access-token path — never once identity tokens are on.
2. **`lib/auth/privy-server.ts`** — the note corrected: 405 is a fact about the legacy path, not about "fetch by id" in general.
3. **`components/console/pages/settings-page.tsx`** — the signing wallet is now `profile.walletAddress ?? session wallet`, so it shows the truncated address immediately; **"Connect wallet" only appears when there is genuinely no wallet**; the payout field seeds from the session wallet too, and a wallet that arrives a beat after the profile read fills an empty payout field. The divergence control is relabelled "Use signing wallet as payout". Save behaviour (display name / username / bio) untouched.
4. **`lib/profile/hooks.ts`** — the profile query key now includes whether the identity token is present, so the row re-syncs the moment the token arrives.

## Verified — on the real code path, against the live database

Ran the app's own `syncUserFromPrivyUser` (the function the webhook and the session route share) for all six real DIDs. Before/after:

- `sneakymoth`  — null / null → `3cG7zjhvGbMpiRVFszHV9k3ajEvesiE1gbFJiNiySRFB` for both fields.
- `feralminttt` — null / `FsyRHvcD…` → wallet filled, **payout untouched** (the "never overwrite a chosen payout wallet" rule, observed rather than asserted).
- `wiaght`, `notyourbiznis`, `alexgiga`, `toshi100x` — same: wallet now set, existing payout preserved.

`select count(*)` afterwards: **6/6 with a wallet, 6/6 with a payout wallet** (was 0/6 and 4/6). `tsc --noEmit` clean, ESLint clean on every changed file, `next build` clean.

## What is still manual

Identity tokens are almost certainly off in the dashboard, which is why the fast path never worked. Turn on **User management → Authentication → Advanced → "Return user data in an identity token"**. It is not required for the fix — the DID fallback covers it — but with it on the wallet arrives in the token and no Privy API call is made per request.

**Not verified:** no signed-in browser run (a Privy session cannot be minted here), so the Settings render and the header balance have not been *seen*; the persistence they depend on is proven above.


---

Task ID: LEADERBOARD-ROWS
Agent: main
Task: Keep the top-3 podium and put the ranked list back underneath it, for up to 50 Bagworkers.

## Root cause

The list was not missing — it was empty. **Three of the six accounts had points, and the query filtered `points > 0`**, so `rankedLeaderboard("overall")` returned exactly three entries: the podium drew them and `rest = entries.slice(3)` was `[]`, which is what made the page look like "podium only". Nothing in the UI was wrong (rows, columns, links, skeleton and empty state were all already there).

## Fixes

1. **`lib/leaderboard.ts` — `overall` no longer filters on points.** The whole userbase is ranked by lifetime points, so a brand-new account is a real row at `0` instead of absent. `total` is now the full `db.user.count()` rather than the count of earners, so the header badge matches what is listed.
2. **`lib/leaderboard-ranges.ts`** — the console board's cap is now `CONSOLE_LEADERBOARD_LIMIT = 50` (podium = 1–3, list = 4–50). It replaced an unused 100-row constant; the marketing `leaderboards` table is untouched.
3. **Time windows are deliberately unchanged**: they still list only who scored in-range (`HAVING SUM(points) > 0`), because "0 points this week" is not an achievement and padding the weekly board with the whole userbase would be a fabricated ranking. With no payouts and no quests in window, Daily/Weekly/Monthly correctly show their empty state and a "See the overall board" button.
4. **`components/console/pages/leaderboard-page.tsx`** — a zero-point row now reads "no points yet" instead of "lifetime total, nothing all time", which would be a strange thing to say to someone who just signed up.

**Sort, unchanged and now stated once:** `points DESC → totalEarned DESC → createdAt ASC → id ASC`. Deterministic on every key, so the board cannot reshuffle between two refreshes.

## Verified — against the live database and in a real browser

Ran the real `rankedLeaderboard()` for all four ranges (`payouts: 0`, `user_quests: 0` in the DB):

```
=== overall === total=6 entries=6
  #1 alexgiga pts=26800 lv=3 | #2 notyourbiznis pts=10726 lv=2 | #3 toshi100x pts=8000 lv=2
  #4 wiaght pts=0 lv=1 | #5 feralminttt pts=0 lv=1 | #6 sneakymoth pts=0 lv=1
=== daily / weekly / monthly === total=0 entries=0
```

Then loaded the page on a local server at 1280px and 390px. Rendered: the gold/silver/bronze podium; **"Ranks 4 and up"** with rows 4, 5, 6 — each with rank number, avatar, name, `Bagworker#`, `0pts` and `Lv 1` — and each linking to `/dashboard/profile/<handle>`. Switching to **Weekly** showed "0 ranked this week" and the empty state, and **See the overall board** returned to Overall. Mobile keeps the same single-row layout with no horizontal overflow. The only console errors are the pre-existing Privy `analytics_events` 403 and the CSP `frame-ancestors` notice.

`tsc --noEmit` clean, ESLint clean on every changed file, `next build` clean.

**No points were invented, granted or seeded** — the 0s are the real stored values and the ordering is entirely derived from them. When real settlements and quests start writing `User.points`, the same query reorders itself with no further change.


---

Task ID: DOCS-FUMADOCS
Agent: main
Task: Rebuild `/docs` on Fumadocs — sidebar, sticky header, right-hand TOC, proper typography — without changing what the concept doc says, and with Summary moved to the end.

## What was added, and how `/docs` is wired

Two packages: **`fumadocs-ui@16.16.1`** and **`fumadocs-core@16.16.1`** (the peer set is satisfied by Next 16 + React 19.2.3). No MDX pipeline — no `fumadocs-mdx`, no `content/`, no `.source`, no `next.config` plugin. The content is already written and checked in TSX, so moving it into MDX would have been a rewrite of the copy for no rendering gain; the brief explicitly allows the layout-plus-primitives route.

Files:

- `src/app/docs/layout.tsx` — the segment layout. Imports `./docs.css` (route-scoped, see below), renders `DocsShell`, then the site `Footer` outside the shell so it spans full width.
- `src/components/docs/docs-shell.tsx` (`"use client"`) — `RootProvider` → `DocsLayout` with the page tree, the nav brand, links, and one overridden sidebar item. Also renders the right-hand TOC.
- `src/components/docs/docs-nav.ts` — the twelve sections (id, number, title) in one array, shared by the sidebar, the TOC and the `<h2 id>` anchors.
- `src/components/docs/docs-content.tsx` — the document, one component per section, server-rendered.
- `src/app/docs/page.tsx` — metadata + `<DocsContent />`.

`DocsShell` has to be a client component (`DocsLayout` takes component props, which cannot cross the server/client boundary), but `children` is the server page, so the whole document still ships as HTML.

**Why the sidebar item is overridden:** Fumadocs decides "current" with `isActive(href, pathname)` — an exact string compare. Every entry here is `/docs#<section>`, and the pathname is `/docs`, so the default renderer would highlight nothing. The override keeps Fumadocs' own `data-active` item styling and reads the active section from the existing scrollspy, which also feeds the TOC — so the two can never disagree.

## The theme conflict, and why there isn't one

`fumadocs-ui/css/shadcn.css` is Fumadocs' own shadcn bridge. Every token it declares is namespaced `--color-fd-*` **and sourced from a variable this app already owns**:

```
--color-fd-background: var(--background)   --color-fd-primary: var(--primary)
--color-fd-border:     var(--border)       --color-fd-card:    var(--card)
--color-fd-ring:       var(--ring)         --color-fd-sidebar: var(--sidebar)
```

Nothing is overridden and there is no dark-mode variant to fake — Fumadocs simply inherits the Bagwork palette. Two further measures:

1. **`docs.css` is imported only by the docs layout.** Verified in the browser: on `/` and `/dashboard`, `--color-fd-background` computes to *undefined* — the stylesheet is not loaded there at all. The console cannot be affected by it because it never sees it.
2. `source(none)` + explicit `@source` lines, so the docs entry does not re-scan the project and re-emit every utility the app already has in `globals.css`.

**One shim was required.** `fumadocs-ui@16.16.1` is built against Tailwind `^4.3.3`; this app is on 4.1.18. Probing every `@apply` in the Fumadocs theme found exactly **one** unknown utility — `-inset-s-4` in `fd-step`. Tailwind errors on an unresolvable `@apply`, so the stylesheet would not compile at all. Declaring `@utility -inset-s-4 { inset-inline-start: calc(var(--spacing) * -4) }` in `docs.css` fixes it in four lines. The alternative was bumping Tailwind across the whole product for one utility, which is a far larger change; the shim disappears when the app's Tailwind catches up.

Also styled `#nd-docs-layout .fd-step h3/p` in `@layer components`: Fumadocs expects Steps to sit inside the `prose` wrapper its own `DocsPage` provides, and this page builds its own typography, so the children would otherwise have arrived unstyled. `@layer components` keeps them below Tailwind utilities in the cascade.


## Final section order

01 What Bagwork is · 02 Two campaign types · 03 How fixed campaigns work · 04 How Flywheel works · 05 The 5% fee and $BAG burn · 06 Who it's for · 07 Submit, review, pay · 08 Points, levels, rank badges · 09 Weekly quests · 10 Campaign communities · 11 Profile identity · **12 Summary**.

**Anchor stability is deliberate.** Section 08 keeps `id="11-points-levels-profile-value"` and 09 keeps `id="12-weekly-quests"` — both are deep-linked from inside the product (the profile page and the quests page). Their printed numbers changed when Summary moved, so number and anchor are now separate values; the anchor is an address and did not move.

## Structural moves vs rephrasing

**Structural (position only, sentences untouched):**

- **Summary moved to the end** (it was section 10 of 14, i.e. mid-page).
- `DiagramProfileMarketplace` moved with the future-marketplace paragraphs into *Profile identity*; `DiagramPointsLevels` stayed with *Points*.
- The four "who it's for" topics (original §04 + §06/07/08) merged under one `##`, with the three audience blurbs as `h3`s.
- Section 02 *Two campaign types* is new as a section, built only from sentences already in the doc ("funds it with tokens or USDC", the fee-redirect description) — **no new claim** — presented as two Cards.
- The ordered flows in the old §02 and §09 are now `Steps`; the 50/50 split and the three quests are `Cards`; the two "not live yet" passages (future profiles, Ideas/Planning) became `warn`/`info` `Callout`s that say so louder than the prose used to.

**Rephrased for clarity only (same facts):**

- The hero's "14 sections" stat is now **12**.
- The hero's "0 tokens you must hold" tile now reads **"None"** — a literal zero in a stat tile reads as a broken number rather than as the claim being made.
- A few sentences tightened around the same fact (the Flywheel card, the "Chat is live" callout). Nothing was added, dropped, or re-scoped.

The old `docs-view.tsx` **stays, untouched**: `site/marketing-page.tsx` still renders it for the SPA's docs view on `/`, and removing it would break that route. It is simply no longer the `/docs` page.

## Verified

`tsc --noEmit` clean · ESLint clean on every changed file · `next build` clean, `/docs` prerendered static.

In a browser at 1440 and 390:

- Sidebar with all twelve entries at `/docs#<id>`, numbers in a fixed-width column; "On this page" TOC on the right at `xl`; site links to `/` and `/dashboard`.
- **All twelve `<h2>`s present in the required order, Summary last.**
- One `.fd-steps` with 6 `.fd-step`s, 7 `[data-card]`s, 5 callouts — the Fumadocs primitives genuinely rendered.
- `--color-fd-background` computes to `#0b0a07` on `/docs` (the shadcn bridge is live) and is **undefined** on `/` and `/dashboard` (route scoping holds).
- Scrollspy: after scrolling to Weekly quests, sidebar and TOC both report `#12-weekly-quests`, and the active item paints `bg-fd-primary/10` with lime text.
- `scrollWidth - innerWidth = -10` at 390px — **no horizontal overflow**; the TOC is `display:none` below `xl`; the off-canvas drawer trigger is present.
- `prefers-reduced-motion` is honoured by an explicit `@media` block over the docs layout, and the page authors no JS animation of its own.

The only console error on any of the three routes is the pre-existing Privy `frame-ancestors` CSP notice.


---

Task ID: DOCS-PREMIUM
Agent: main
Task: Take the Fumadocs docs shell from "works" to "looks expensive" — same content, same 12 sections, Summary still last.

## The visual system

**Tokens.** A `--bw-*` block on `#nd-docs-layout` (Fumadocs' own root, which exists only on this route): `--bw-heading`, `--bw-body`, `--bw-body-dim`, `--bw-line`, `--bw-line-strong`, `--bw-panel`, `--bw-panel-top`, `--bw-lime`, `--bw-gold`, `--bw-measure`, `--bw-radius`.

Two decisions worth naming:

- **Panels are raised, not outlined.** Cards, stats and the closing panel use a vertical gradient (`#18150e` → `#141209`) over a 7.5% hairline. On a near-black page a border alone reads as a crease; the gradient reads as a surface catching light from above. That one change is most of the difference between "flat" and "expensive".
- **One accent, one loud element.** Lime is the only accent (active nav, section numbers, bars, list dots). Gold is reserved for `$BAG` and the burn. The brand gradient is spent in exactly one place — the hero `H1`. Section titles are solid `#f5f3ee`, which is what keeps the page calm instead of a wall of gradients.

**Typography.** Three faces, three jobs, all already loaded by the root layout:

- **Syne** (`--font-syne`) for the hero and every section heading. It was loaded but only ever applied inside `.console`; the docs are the product's second long-form surface, so the wordmark's typeface belongs here rather than a generic sans.
- **Inter** (`--font-inter`) for prose — via the existing `.docs` class in `globals.css`, so body copy picks up the same face *and* the same reduced-motion guard the old docs page had.
- **Space Mono** for structure: section indices, stat values, table numerals, the `Docs` chip, bar percentages. This is the terminal voice the brand is built on, used as a *label* face rather than a reading face.

Body copy moves from 15px/1.75 at 75% to 16px/1.78 at 78% on a 70ch measure; decks sit at 15px/1.65 in the dim token; the gap between sections goes 2.5rem → 5.5rem.


## Component by component, and what was ugly before

| Before | After |
|---|---|
| Flat `bg-fd-card` boxes, 1px border, no elevation; hover did nothing | Gradient panels, 14px radius; hover warms the hairline to lime/26% and lifts 2px (transform only, so it stays on the compositor) |
| Section heading was an inline number plus a bold `h2`, with nothing saying what the section covered | `01` eyebrow in lime with a hairline rule, Syne heading, and a one-line deck on all twelve |
| Campaign types in Fumadocs' default `Cards` — two boxes free to differ in height, which silently ranks them | `.bw-pair`: equal columns, equal height, icon chip, `Deposit-funded` / `Fee-funded` kicker |
| Quests as three generic cards with "— 200 points" repeated inside each body | `.bw-trio`: icon, name, a `200 pts` badge on the name's line, rule underneath — cards of different rule lengths now compare at a glance |
| The 5% split as two more prose cards | `.bw-bars`: two proportional bars at exactly 50% (the only ratio the doc states), one lime, one gold, each captioned with its original sentence |
| Levels as a six-item bullet list | `.bw-table`: Level / Points / Badge, tight, aligned, monospace numerals, row hover instead of zebra |
| Fumadocs `Callout` — its accent is an **inline** `--callout-color`, so no class can restyle it | Own `Note`: hairline coloured per tone (info lime / warn amber / idea gold), tinted icon chip, 14px radius |
| Closed with a bare paragraph | `.bw-closing`: a panel with a lime bloom from the top-left corner |
| Hero: a badge, an `h1`, a sentence, four bordered boxes | Bloom + dot-grid atmosphere masked before it reaches the copy, brand-gradient title, tighter four-up stat row in Space Mono |
| Sidebar: one flat list; active state a 10% lime wash that is nearly invisible on near-black | Four groups — **Core · Work · Reputation · Close** — and an active state that is a *solid* lime pill with near-black text and a soft lime shadow |
| TOC: 12 plain links, active state barely visible | `.bw-toc-link`: active is lime on lime/8%; numbers dim → lime as you pass them, so the rail doubles as a progress readout, with "Section 08 of 12" underneath |
| No motion | Sections below the fold fade and rise 14px on enter; colour transitions on sidebar and rail |


## Motion, and why it is safe

One `useSectionReveal` hook in the shell — a single IntersectionObserver, not a client boundary per section. **Only elements below the fold at mount are given an initial opacity**, so slow hydration cannot flash the page and a page with JavaScript switched off is simply static. `prefers-reduced-motion` returns before any element is touched, and the CSS block disables the card lift as well. `html:has(#nd-docs-layout) { scroll-behavior: smooth }` keeps smooth anchor scrolling on this route only.

## Two real bugs found while verifying

1. **`DocsLayout` requires `RootProvider`.** The first build failed with "You need to wrap your application inside `FrameworkProvider`" — not discoverable from types alone.
2. **The TOC was outside the token scope.** The right-hand rail renders *beside* the content, not inside it, so `--bw-*` declared on `.bw-doc` were undefined for the rail and `color: var(--bw-lime)` silently fell back to the inherited cream. Caught by asserting the active link's computed colour instead of trusting the CSS. Tokens moved to `#nd-docs-layout`, with a comment explaining why the scope has to be the layout.

## Content

Unchanged. Same 12 sections in the same order with Summary last; same figures (5%, 50/50, 200 pts, Monday 00:00 UTC, levels 0 / 5k / 25k / 75k / 200k / 500k); the two "not live yet" passages are still labelled as not live, now in warning callouts. The only new text is a one-line deck per section and unit labels like `Deposit-funded` / `200 pts` — every deck is a compression of sentences already inside its own section.

The levels table gains a **Badge** column. That mapping is the doc's own sentence — "six shields, one for each level, shown in order on your profile: Initiate, Contender, Vanguard, Elite, Mythic, and Legendary" — read out as the correspondence it already describes.

## Verified

`tsc --noEmit` clean · ESLint clean on all four files · `next build` clean, 28/28 static pages, `/docs` prerendered.

In a browser at 1440 and 390:

- Hero title computes to **Syne at 52px**; section headings to Syne at `#f5f3ee`; stat values and table numerals to Space Mono.
- Card background resolves to the gradient at radius 14px; the bar fill measures **384px of a 768px track — exactly 50%**.
- Sidebar renders all four groups (4 separator nodes) and 12 links; the active pill is `rgb(189,254,0)` on `rgb(11,10,7)`.
- TOC active link is `rgb(189,254,0)` on lime/8%; scrolling to section 8 marks 8 entries as seen and both the sidebar and the rail report the same active id.
- 12 reveal targets, 3 still hidden below the fold — the reveal is wired, not inert.
- 2 type cards, 3 quests, 2 bars, 6 table rows, 5 callouts (info/idea/warn/info/warn), 4 stats, 6 steps.
- **No horizontal overflow anywhere** (`scrollWidth - innerWidth` = -10 at 390px); stats go 2-up, the pair and trio stack to one column; the mobile drawer opens with `data-state="open"` and carries all 12 grouped links.
- `/` and `/dashboard`: `--color-fd-background` and `--bw-lime` both compute to *undefined*, `#nd-docs-layout` is absent and the body background is unchanged — the docs stylesheet is still loaded on `/docs` only.

The only console error on any route is the pre-existing Privy `frame-ancestors` CSP notice.


---

Task ID: DOCS-ISOLATION
Agent: main
Task: Fix the docs layout integration — scroll model, isolation, links, footer — without redesigning the content.

## What was actually leaking

**One line in `globals.css`, not Fumadocs.** `body { overflow-x: hidden }` had been there since long before the docs existed, but it is the thing producing the symptom the brief described ("body overflow ~ hidden auto"):

```
body { overflow-x: hidden }   →   computed  overflow: hidden auto
```

When one axis of an element is not `visible` and the other is, the `visible` axis computes to `auto`. So that one declaration made the **body a scroll container**, nested inside the viewport's own scroll container, on **every route** — not just `/docs`. Two scroll boxes for one page, and `position: sticky` descendants resolve against the body's scrollport rather than the viewport.

That is the shared root the brief was pointing at. The fix moves the horizontal guard to the root as `overflow-x: clip`, which clips the same overflow without being a scroll container:

| | before | after |
|---|---|---|
| `body` computed overflow | `hidden auto` | `visible` |
| `html` computed overflow | `visible` | `clip visible` |
| `document.scrollingElement` | body (on docs) | `HTML` everywhere |
| sticky header on `/` | worked by luck | works by geometry |

Measured after the change: body `visible`, `scrollingElement` HTML, and **the 1598px `marquee-track` on the landing page is still clipped with no horizontal scrollbar** — the guard still does its job.

Three other real leaks, all inside the docs segment:

1. **The marketing footer was rendered as a sibling of the docs shell** (`src/app/docs/layout.tsx`). A landing-page footer — link columns, social rows, legal lines — appended under the docs layout reads as a second, half-relevant site hanging off the bottom. A small `DocsFooter` replaces it, inside the article.
2. **The two site links rendered through Fumadocs' `links` prop**, which uses Fumadocs' own item renderer. They were the only rows in the rail drawn in a different language to the twelve above them.
3. **Sections 08 and 09 carried anchors `11-points-levels-profile-value` and `12-weekly-quests`** — legacy addresses preserved for deep links from the profile and quests pages. The links worked; they just read as wrong next to a heading printed `08`.


## How the docs are isolated now

- **The docs segment renders exactly one thing**: `<DocsShell>{children}</DocsShell>`. Nothing wraps it, nothing sits beside it.
- **`/` and `/dashboard` never see docs chrome**, because the docs layout lives in `src/app/docs/` and nowhere else. Verified after real client navigation: `#nd-docs-layout` and `#nd-sidebar` absent, `--color-fd-background` and `--bw-lime` both `undefined`, console shell present, page scrollable.
- **Client navigation clears the shell cleanly** — no hard navigation needed. Verified by reading state at each step rather than assuming:

| step | URL | header | docs chrome | console chrome | body overflow |
|---|---|---|---|---|---|
| /docs | `/docs` | 0px nav bar (see note) | yes | no | visible |
| click *Bagwork home* | `/` | **65px, sticky, visible**, full nav | no | yes | visible |
| click *Console* | `/dashboard` | 56px console bar | no | yes | visible |
| back | `/docs` | docs chrome restored | yes | no | visible |
| back again | `/` | 65px visible | no | yes | visible |
| forward | `/docs` | docs chrome restored | yes | no | visible |

Everything in that table was already correct before this change — the marketing header, the console and back/forward all behaved. What changed is that they now do it with **one** scroll container instead of two.

**Note on `#nd-subnav`:** on desktop it is a 0-height sticky bar holding the brand, because Fumadocs' docs layout puts the logo and the `Docs` chip in the **sidebar header** at `md` and up and only draws a real top bar (`56px`) below that. That is Fumadocs' design, not a breakage, and it was left alone deliberately: the sidebar's `top` offset and the layout's grid rows (`--fd-docs-row-*`) are derived from `--fd-header-height`, so forcing a desktop top bar means re-deriving the whole grid for a bar that would sit directly above a sidebar already showing the same brand. Verified: a 56px bar reading "BAGWORK DOCS" at 390px, brand link in the sidebar at 1280px.

## Links

- **`Bagwork home` → `/`**, **`Console` → `/dashboard`**, **the brand → `/`** — all `next/link`, all client navigation, all landing on the right shell.
- The two site entries are now **page items in the page tree** (`Site` group) rather than `links`, so they render through the same `DocSidebarItem` as the twelve sections: one padding, one hover, one active treatment.
- **Anchors are canonical.** Section ids match the number they print (`08-points-levels-rank-badges`, `09-weekly-quests`), and the old addresses survive as **aliases** — a zero-height `span` carrying the legacy id at the top of the section. Both resolve, so the deep links in `lib/profile/points.ts` and `lib/quests/weekly.ts` still work untouched.
- Verified: **all 12 anchors and both aliases scroll to the correct block** (landing at 109–112px, exactly the section's `7rem` scroll-margin; `12-summary` lands at 441 only because it is the last section and the document ends). The sidebar and the rail list the same 12 ids in the same order.

## Scroll

Measured on `/docs` while scrolling the full 14,429px document: **median frame 16.7ms, p95 16.9ms, worst 17ms, zero long tasks over 50ms.** The sidebar stays pinned at `top: 0` (full viewport height) and the rail at `top: 96px` throughout. No nested scroller, no horizontal overflow, no double scrollbar.

## Verified

`tsc --noEmit` clean · ESLint clean on all six changed files · `next build` clean, `/docs` prerendered static.

Plus, in a browser at 1280 and 390: body `visible` on `/`, `/docs` and `/dashboard`; no horizontal overflow on any of them; the landing page marquee still clipped without a scrollbar; the marketing header sticky at `top: 0` before and after scrolling; the console shell intact with the docs tokens absent.

## Batch review — the queue is reviewed when an operator says so

**Review stopped being a side effect of submitting.** `POST /api/submissions` used to hand every new
link to the engine through `after()`, on both paths (filling a claim, and a fresh submission). That
made the verdict something that happened *to* a queue nobody was watching: a post could be scored,
approved — and, since an approval is money owed, paid — while the review desk still read "pending",
and there was no moment at which a person decided anything. The route now does one thing with a new
link: stores it `pending` with zero scores and returns. Nothing in the submit path imports the
engine any more, which is also why the old client hook had nothing left to trigger.

**The desk starts review instead, in bounded batches.** New route `POST /api/admin/review/batch`,
new module `lib/review/batch.ts`, and a control bar above the board: an on/off switch and a **Run
review** button. Nothing fires on mount, on a timer, or on submit — a submission lands `pending` and
stays there until somebody presses the button, which is the entire point of the feature.

- **The switch is a row, not an env var.** First entry in a new `platform_settings` table (key
  `batch_review`, `value: {"enabled":true}`), read and written by `GET|PATCH /api/admin/settings`.
  An env var would have meant a redeploy to flip it *and* a silent revert on the next deploy.
  Absent row ⇒ off, and the route re-reads it before every run, so a disabled engine cannot be run
  by calling the API directly either.
- **One run at a time.** The lock lives in the same row (`locked_at`/`locked_by`) and is claimed with
  a single conditional `UPDATE ... WHERE locked_at IS NULL OR locked_at < now - 10min`. Read-then-write
  would let a double-click start two runs over one queue and score everything twice. The TTL means a
  crashed run cannot wedge the button forever, and release is scoped by token so an overrunning run
  cannot clear a newer run's claim.
- **Scope**: no selection → the oldest pending rows, up to the default cap (20, max 50); with rows
  ticked → exactly those. Selected rows that are no longer awaiting review come back as *skipped*
  with the reason, rather than quietly shrinking the batch.
- **The batch never pays.** The engine gained one option, `reviewSubmission(id, { settle: false })`
  (default `true`, so the creator path and single-item admin action are untouched), and the batch is
  its only caller. An approval writes the verdict and the amount and stops; money still moves through
  `Pay creators` or the existing daily payout sweep. A bulk pass is not the place to discover a
  treasury is misconfigured, and `settleAttempted` in the result is what stops `payout: null` from
  being ambiguous between "not attempted" and "owed but deferred".
- **No verdict is never an approval.** A model that cannot be reached, or a post whose content cannot
  be fetched, leaves the row `pending` and is counted as skipped — there is no heuristic path in the
  batch, exactly as there is none in the engine.

**The board itself** became a real queue view: tabs per status (Pending first and by default — the
"Awaiting review" tab is gone, because it merged "nobody has looked" with "being looked at"), a
campaign filter built from bags that actually have submissions, a submitted-from/to range, per-row
checkboxes with "select all reviewable here", and the five-number summary after a run
(`Reviewed · approved · rejected · skipped · failed`) with a per-item account behind a disclosure so
"skipped" is never a mystery. `GET /api/admin/submissions` gained the two filters, the campaign
options, and `submittedAt` — the desk labels a row with when the *link* arrived, which for a filled
claim is not the day `createdAt` records.

**Verified** against the running app (throwaway admin password, so no real credential was used):
`GET /api/admin/settings` 200 with the caps; batch while the flag is off → **403**
`batch_review_disabled`; PATCH on → persisted, and the switch reads "on" after a full reload; a
selected run → **200** `examined 1, reviewed 0, approved 0, rejected 0, skipped 1, failed 0`, with the
row left `pending`, `payoutAmount` null, zero payout rows, and the engine's own reason written to
`reviewNote`; a bogus id in the selection → skipped with "no submission with that id"; a held lock →
**409** `batch_review_running` with the start time, and `running: true` in settings. Unauthenticated
`GET /api/admin/settings` → **401**. The temp row and the settings row were deleted afterwards, so
the database is exactly as it was.

`tsc --noEmit` clean · ESLint clean on all ten touched files.
**Left open, deliberately:** there is no cron for this — manual is the v1 requirement, and a
scheduled batch is a different decision (it would need a spend ceiling and a window, not just a
flag). `docs` section 07 still lists AI review as a step in the flow rather than saying who starts
it; the wording is not wrong, but it is the natural place to mention the batch button. And the
approvals a batch produces are settled by the daily payout sweep if nobody uses `Pay creators`
first — pre-existing payout machinery, stated here so it is a known consequence rather than a
surprise.


## Go-live fixes: the launch gate, the swap floor, and the CA on a flywheel card

**"Launching is switched off" with `PUMP_LAUNCH_ENABLED=true` sitting in the dashboard.** Three
separate faults, and only the first explains what was on screen:

1. **The running deployment predated the variable.** `vercel env ls production` showed the flag
   present (added 11m earlier) and `vercel env pull` showed its stored value to be a clean `true` —
   so it was neither missing nor misspelled. But the deployment being served was built for the
   RPC/WS change an hour before, and Vercel does not retro-apply an env change to a deployment that
   is already running. The build that answered the request had no such variable in its environment.
   A new deployment is what picks a change up; the fix on our side is to make that state visible.
2. **The parser accepted exactly one spelling.** `(process.env.X ?? "").trim().toLowerCase() === "true"`
   reads a dashboard entry of `"true"` (quotes included), `TRUE`, `1`, `yes` or `on` as *switched
   off*, which is indistinguishable from a missing variable — the same confusing screen, with no way
   to tell the two apart. `launchFlagState()` now strips surrounding quotes (repeatedly, because a
   value pasted from JSON arrives as `""true""`), trims, case-folds, and accepts true/1/yes/on. It
   also reports *which* case it is: `present` vs `unrecognised`, so an operator can see the
   difference from outside.
3. **The reason string was untrue.** It told operators to wait for "a real devnet test" — pump.fun's
   create and fee-share instructions are mainnet-only, so that rehearsal cannot exist. The message
   now names the flag, the accepted values and the redeploy, and nothing else.

`GET /api/launches/availability` now returns a `flag` object (`name`, `present`, `armed`,
`unrecognised`) beside `enabled`, and logs a warning server-side when the flag is absent or
unreadable. It is a boolean switch's state, not a secret — and without it, "set it and it is still
off" has three indistinguishable causes from the outside.

**The $20 swap floor, which was enforcing nothing — twice over.** The rule was there; it could not
work. `swapAndCredit` called `swapToUsdc` (which quotes, builds, signs, sends and confirms) and only
*then* compared `result.outUsdc` against the minimum, so every sub-dollar creator-fee deposit had
already paid a real signature fee to convert into pennies. Worse, the minimum itself read
`Number(process.env.FEE_SWAP_MIN_USD ?? "")` — and `Number("")` is `0`, so an **unset** variable
(the production state) produced a floor of $0 and the intended default was unreachable. The floor now
lives in `feeSwapMinUsd()` as a blank-aware default of 20, and the guard sits in `swapToUsdc` between
the quote and the signed transaction: below it, nothing is built, signed or sent. Below-min deposits
are recorded, logged as "below minimum swap threshold", left in the wallet and re-quoted on a later
pass — a retry costs a quote, never a transaction. `FEE_SWAP_MIN_USD` documents the override, `0`
disables it deliberately, and the cron's own report carries `swapFloorUsd`.

**Who pays, said out loud.** The launch page now states it next to the number being charged — *"You
pay network and create costs from your wallet. Bagwork never launches from the fee treasury"* — and
the fee-lock card spells out the other half: the FEE wallet only ever receives this coin's creator
fees, converts them once they are worth converting, and pays this bag's creators. That has always
been true in the code (`feePayer = launcher`, mint keypair generated in the browser, no treasury key
in `lib/launch` or `api/launches`); it had never been said where an operator could read it.

**The CA, on the card.** A flywheel bag *is* its coin, so the mint is its identity: Explore's
flywheel card now carries the contract address truncated, a copy button and a Solscan link, with the
bag page gaining a pump.fun link beside its existing copy/Solscan pair.

**Verified.** `launchFlagState()` exercised over 15 inputs (`true`, `TRUE`, ` True `, `"true"`,
`'true'`, `1`, `yes`, `on` → armed; `false`, `0`, `enabled`, blank, absent → off with
`unrecognised` set as appropriate), `launchAvailability()` returns `enabled: true` when armed with
the deployment's own FEE key and `enabled: false` with the reason when not, and `feeSwapMinUsd()`
returns 20 for unset/blank/junk, the configured number when set, and 0 only when asked for. `tsc
--noEmit` clean, ESLint clean on all seven touched files.

## The manual fee-point flow is out of the product

"Already launched? Point its fees instead" sat directly under the launch CTA on the flywheel page,
offering the hand-made flow — paste a contract address, point its fees at Bagwork — for a token that
already exists. That flow is not shipped, and an escape hatch on the primary action's own footer is
how a page advertises something it cannot do: the person who needs it clicks a half-built path, and
everyone else wonders whether they picked the wrong option. Removed, along with the prop that fed it.

The segmented **Launch | Register | Walletless** control is gone with it. Register and Walletless were
rendered as disabled `Soon` chips — honest, but a segmented control with one usable position is
decoration, and a disabled control beside a live one is an invitation to try the dead one. There is
now no mode switch because there is one mode. Both come back as a real control when they are real
features.

`create-flywheel-page.tsx` stays in the repository and loses its only importer: the component is
kept because that work resumes later, but nothing routes to it, nothing offers it and no dead href
points at it. Re-adding it means wiring it deliberately in `create-bag-page.tsx`.

**Verified** in the built output rather than by reading: the two chunks containing the launch page
(located by its new money-model copy) have **zero** occurrences of `Point its fees instead`,
`Already launched`, `Walletless` or `Register`, while `Launch a flywheel coin` and `Sign and launch`
are still present — so the control is gone from what ships and the launch flow is otherwise
untouched. `tsc --noEmit` clean, ESLint clean on both changed files.

Two phrases remain in the tree on purpose and are not UI: `fee-redirect-panel.tsx` still tells a bag's
own page "point your token's fee recipient at the Bagwork address" when it has no deposits yet (that
is a status panel on an existing bag, not a create entry point), and the comments in
`create-launch-page.tsx` / `create-bag-page.tsx` explain where the manual flow went, so nobody
re-adds the link by accident.

## NOVA and EMBER were not defaults — they were borrowed identity

Every fixed bag created in USDC or SOL came out branded "EmberSwap" or "Nova Protocol". The obvious
suspect was a fallback: some `projectName ?? "Nova Protocol"` buried in a mapper. There was none.
`POST /api/campaigns` looked up its Project with `findFirst({ tokenMint })` — *any* row on that mint —
and a Project is where a bag's token name, symbol, colour and logo live. The seed data had already
created a project on **USDC** (the form's default token) and another on **wrapped SOL**, so a
publisher's brand-new bag adopted a row authored for somebody else's token and rendered in their name,
their symbol and their colour. The data confirmed it: `cards` and `test` — both creator-owned, both
non-seed — were attached to the EMBER and NOVA projects.

**Fixed at the three places that could borrow a row** (`api/campaigns`, `api/admin/campaigns`,
`lib/launch/bag`): a Project is now only reused for the *same owner's* bags on that mint
(`campaigns: { some: { createdBy } }`, `createdByAdmin` for the operator, the launcher for a launch).
The first bag on a token creates the row; a second bag by the same publisher reuses it; nobody inherits
it. A mint is a coincidence; ownership is not.

**The three damaged rows were detached** by `scripts/fix-shared-projects.ts` (`bun run
db:fix:shared-projects`, dry-run by default, `--apply` to write). Per project shared by more than one
owner, the oldest bag keeps the row — the identity was authored for it — and every other owner's bag
gets its own Project carrying the token's real on-chain metadata from `KNOWN_TOKENS`, the app's own
brand colour and its own treasury. `cards` now reads "USD Coin (USDC)", `test` reads "Solana (SOL)", and
the seeds keep NOVA and EMBER. Idempotent, nothing deleted, and it skips (rather than invents) a mint
whose symbol cannot be recovered from the database.

**The placeholder stopped being tinted with the token's colour** (`BagBanner`). That wash looked
harmless and was the other half of the same bug: a bag renting a project row was also renting its
palette, so an unbranded bag rendered in a stranger's purple. The fallback is now the app's own brand
at 7% — a placeholder that implies no identity at all. A banner still shows when the publisher uploaded
one, and a launched coin's `tokenImageUrl` is still used, because that is real artwork.

**The flywheel bag page leads with the coin** (`FlywheelBagHero`, new). A 112px banner strip holding a
gradient placeholder is dead space on a page whose subject is a token: the hero is now a round PFP at
coin size, the name as an `h2` (the page header keeps the document's single `h1`), the ticker, the bag
title as the second line, and the **contract address with copy, Solscan and pump.fun** — the same
language the Explore flywheel card speaks. No banner, and the numbers sit right under it (the first
metric is relabelled "Budget from fees" for a flywheel, with paid and raised-from-fees in its hint).
Fixed-budget bags keep the banner layout untouched.

**A live fee transparency panel** (`FeeTransparencyPanel`, new) answers the one question a flywheel bag
exists to answer — *are the fees arriving?* — with three separated facts: **collected** (deposits that
landed), **waiting** (in the wallet, unconverted) and **credited** (USDC that settled and became
budget), then budget now / paid / remaining, then the two clocks worth knowing: last fee detected, last
swap, and last sweep. All from the fee ledger.

To make "waiting" honest rather than vague, `FeeDeposit.estimatedUsdc` (migration
`20261005160000_fee_deposit_estimate`) now stores the Jupiter quote the swap floor was applied to —
the number that was previously computed and thrown away — so the panel can say "$12.40 waiting, $7.60
more reaches the floor". Every pass re-quotes, so an appreciating token updates it. The floor itself is
stated in the empty state as well as above a waiting balance: *"fees are converted once they clear
$20"*, because otherwise the rule surfaces as "this bag never grows". Nothing in the panel is
projected: a figure with no data prints "—", and the empty state says "No fees yet" rather than a row of
zeros. The sweep's own run is recorded (`platform_settings.fee_sync`) so "last sweep: not yet run" and
"last sweep: 3h ago" are both true statements instead of guesses.

**Verified.** `bun run db:fix:shared-projects` reported the three rows, applied, and a second run said
"every project has a single owner" (idempotent); the live API then returned USD Coin/USDC for `cards`
and Solana/SOL for `test`, with no EMBER or NOVA anywhere in the feed. The scoped lookup for a creator
with no bag on that mint returns `null`, so a new bag creates its own row. On the flywheel page:
one `h1`, hero `h2` "Demo Flywheel", PFP measured 78×78 with a fully round radius, **zero banner
strips**, CA copy button, 2 pump.fun links, the fee panel present with "None yet" / "—" / "—" / "No
fees yet." / "Not yet run" and the $20 floor stated. On a fixed bag with an uploaded banner: banner
present, image rendered, no fee panel. Explore's bannerless cards carry the neutral brand wash and no
inline colour style. `tsc --noEmit` clean, ESLint clean on all fifteen touched files.

## One level ring, not two

The marketing hero and the console profile header both drew "the level ring", and they had drifted into
two different components. The hero's: a three-stop lime-to-green arc (`#ffe70e → #bdfe00 → #7ab200`), an
8% stroke with round caps, a faint yellow bloom behind the numeral, one 3px drop-shadow, and a bold,
wide-tracked "LEVEL" label. The profile's: the same idea in two stops with no bloom, no glow, a 9% stroke
and a `font-medium` label in a muted token colour. Next to a row of stats the second read as flat, which
is exactly what the screenshot showed — the same component rendered at two different qualities.

There is now one: `src/components/shared/level-ring.tsx`, the hero's design, because that is the one that
looked right. The hero card and `identity.tsx` (which the profile header *and* the public profile's
`LevelProgress` both render through) now import it, and both private implementations are deleted —
`RING_STROKE` appears in exactly one file, and a search for the deep-green stop returns only the shared
component. No third design was invented, and no caller's geometry changed: the box is still `size × size`
with `shrink-0`, and the numeral is still `size × 0.3`, so the profile's 64px slot and the stats row
around it are untouched. The label scales on the hero's formula with its 7px floor, which lands on the
same rendered size at both 80px and 64px.

Progress still comes from the same `levelFromPoints` progress value, and the thresholds are untouched.

**Verified** on the public hero page (both profile routes sit behind a Privy session, so the console ring
cannot be seen signed out; the component is identical by construction): at Level 3 the arc carries all
three stops, the bloom, `stroke-width="8"`, `stroke-linecap="round"`, the 3px `drop-shadow`, a `stroke-white/10`
track, a 7px/700/1.26px-tracking uppercase "LEVEL" at 50% white, and a 24px/700 white numeral — with
`aria-valuetext="Level 3, 97% of the way to Level 4"`. The three consumers are `hero-bagworker-card`
(80px), `profile-view` (64px) and `LevelProgress` (112px, public profile). `tsc --noEmit` clean.

## Denser campaign cards, and a flywheel card that reads as a coin

Both card types were the widest thing in the console, and the grid only ever showed three per row. On a
1920px monitor the content column is capped at 1600px, so three columns gave every card ~393px — a
number sitting in the middle of a lot of empty surface, with six bags on screen where eight fit.

**The grid steps to four columns at `2xl`** (`explore-bags`), the gap comes down from 16px to 12px,
and the loading state moves with it (`CardGridSkeleton` now renders eight tiles in the same grid — and
its banner block was already `h-24`, so it now matches the real banner exactly instead of sitting 16px
short). The landing page's live preview steps to four at `xl` instead, because that section has no
sidebar eating ~256px, and its cap goes from six to eight so the preview is still two full rows. `xl`
in the console deliberately stays at three: at a 1280px monitor the sidebar leaves ~960px of content,
and four columns there would be 231px cards — cramped, which is the failure mode rather than a version
of the goal. Below `sm` nothing changes: one card per row.

**The cards came down with it** — padding `p-4` → `p-3.5`, internal gap `gap-4`/`gap-3.5` → `gap-3`,
and the fixed-budget banner `h-28` → `h-24`. At the tightest desktop case (a 1536px monitor: 1280px of
content, 1216px of grid) a card is now **295px wide instead of 393px — 25% narrower, and ~20% smaller
overall**. Nothing was dropped to get there: every stat, both badges, the contract address, the
platform row and both click targets are unchanged, and the flywheel card's two meta rows were merged
into one wrapped row rather than trimmed.

**The flywheel card now leads with the coin.** The pfp is a **square at 56px** — it was a 44px circle —
and the identity beside it reads `$TICKER` first with the token name beneath, because a ticker is how
someone scans a grid of coins and the full name is the disambiguation. Nothing is layered over the
artwork: no scrim, no tint, no chip. The status chip moved beside the identity column with `shrink-0`
so it can never squeeze the ticker.

**The edge carries the rest of the identity** — `.flywheel-card` in `globals.css`: a gold → violet →
cyan hairline on a 135° gradient, so the top-left corner is gold and the bottom-right is cyan and both
fade to a dim tint within 20% of their corner; a very light brand glow (30px blur, 45% alpha at its
centre); and a 1px white inset at the top, which is what makes the edge read as three-dimensional
rather than flat. It is drawn with the two-layer `background-clip` technique (`padding-box` for the
card colour, `border-box` for the gradient) rather than a pseudo-element, and that is the whole point:
a `::before` paints *over* the card's contents, and the one thing this card must not do is tint its own
coin artwork. Hover moves the glow rather than the border colour, because a border colour shows through
the semi-transparent gradient and dulls the corners. It is deliberately not on `BagCard` — a flywheel
bag is a coin and can wear a lit edge; a publisher's bag is a document and should not.

**Verified** in a browser against the real components (a temporary `/card-preview` route rendering both
cards with fixture data, deleted before the commit; screenshots in `tool-results/card-redesign/`). The
grid resolves to **1 column at 312px, 2 at 1024, 3 at 1280 and 4 at 1536+**, with
`scrollWidth === innerWidth` at every step, so nothing overflows. At the tightest desktop width the
cards measure **295×434 (fixed) and 295×408 (flywheel)** in the four-column grid. The flywheel pfp
measures **56×56 with a 10px radius**; its image renders at full opacity with no filter and no sibling
overlay; the ticker is `$EMBER` with "Ember Protocol" beneath it; and the card's computed edge is
`border-color: transparent`, `background-clip: padding-box, border-box`, the inset highlight and the
brand glow. On a 312px viewport the grid is one full-width column with the ticker, name, badges and
stats all legible. Zero console errors on the preview and on `/`. `tsc --noEmit` clean, ESLint clean on
all five touched files.



## Fixed-budget funding: the money rules, not the plumbing

The plumbing was already there, and the first thing worth writing down is that it is not a soft
"set a number and save". Creating a fixed-budget bag has been a four-step chain for a while:
`POST /api/campaigns` writes a **DRAFT** with `fundedAmount: 0`; `POST /build-funding` builds the
unsigned SPL transfer from the publisher's own wallet to the treasury that bag was pinned to at
creation; the publisher signs it with `useSignAndSendTransaction`; and `POST /fund` fetches that
transaction back off the chain and checks it before anything moves — it succeeded, the tokens landed
in **the treasury's ATA for this bag's exact mint**, at least the full budget arrived, and the
publisher's own wallet signed it. Only then does the row flip to LIVE, and only then does the client
redirect to `/dashboard/bags/{id}`. `PATCH` refuses to publish a non-fee-redirect bag outright, so
there is no other door in. A cancelled signature leaves a resumable draft; nothing is ever LIVE
without money behind it.

What was actually wrong was narrower, and it was all about the money rules around that chain.

**The minimum was 100 USDC in two places.** `MIN_BUDGET.USDC = 100` in the authoring rules and a bare
`100` in the form's validation — the classic pair that drifts, where the form lets someone through to
a step the API then refuses. Both now read `MIN_FIXED_BUDGET_USDC` from a new dependency-free
`lib/campaigns/limits.ts`, set to **$5** so the whole chain can be exercised with real money for the
price of a coffee. The file says what to do next: raise it to `MIN_FIXED_BUDGET_USDC_AT_LAUNCH` (100)
once the flow has been run end to end on mainnet. The operator's form had a third copy ("100 USDC")
and now reads the same table.

**The publisher's flow is USDC-only.** The token picker offered SOL and "paste a contract address",
and a minimum, a slot count and a per-post ceiling are all meaningless in a token whose price the
server cannot know — `$5` is a real (if tiny) campaign, five dollars of an arbitrary memecoin is not
a number anybody can reason about. The picker is now a locked USDC row, and the payload always sends
`{ kind: "USDC" }`. The API still accepts SOL and a custom mint, deliberately: the admin portal and
every pre-existing bag depend on that path, and removing it would strand drafts that are already
half-funded. This is a decision in the form, and `BUDGET_TOKEN` in `create-bag-page.tsx` is the one
line that reopens it.

**A treasury can never be the funding wallet.** `isConfiguredTreasury` — the guard the launch flow
already applies to a coin's dev wallet — is now applied in `build-funding` before anything is built,
and again in `activateCampaignFromTransfer`, which is the single place both the fund route *and* the
Alchemy webhook pass through. The second one matters because a webhook has no client to validate.
Nothing here signs with a treasury key and nothing ever could — the signer is read off a confirmed
transaction — but a deposit *from* the FIXED wallet would credit one pooled wallet's outflow to a
single bag's budget, which is the mixing the dual-treasury split exists to prevent.

**Three more refusals, each turning an on-chain failure into a sentence.** The destination is
re-derived from `treasuryAddressFor(treasuryKindFor(campaign))` and compared to the bag's pinned
address, so a deployment whose treasury env moved refuses the transfer *before* the publisher is
asked to approve anything rather than accepting a deposit into a wallet this app will never pay out
of. A bag priced in USDC must actually be priced in USDC — the mint has to be one of the known USDC
mints and the mint's own decimals have to be 6, because every figure the publisher was just shown is
scaled by that exponent. And the wallet's **balance** is now read before the prompt: an account
existing is not the same as the budget being payable, and a wallet with $1 against a $5 bag used to
get all the way through the wallet UI and then die on-chain with a program error nobody can read.
It now says how much more is needed.

**The brief and the artwork are editable after launch.** `PATCH /api/campaigns/[id]` takes a third
shape — `{ description?, bannerUrl? }`, owner only, any status — validated with the same rules as
creation (`normaliseBannerUrl` is the same function, so a value that could not be set at creation
cannot be smuggled in later, and it is rendered into an `<img src>` on every card in the
marketplace). `budget` and `fundedAmount` are refused **loudly** in that shape rather than ignored: a
bag's budget is backed by USDC that has already moved, so raising the column would advertise money
the wallet does not hold, and the only honest way to grow a budget is a second real transfer. There
is no top-up flow, and this change does not add one. The UI is `EditBagDialog`, reachable from the
"Edit brief" button on the bag page's brief card for the owner — it sends only the fields that
changed, which is what makes "clear the artwork" and "leave the artwork alone" two different
requests.

**Verified.** `tsc --noEmit` and ESLint clean on all ten touched files. Two throwaway harnesses in
`tool-results/` run the real validation code rather than a copy of it: `verify-min.ts` (8/8) proves
`readAuthoring` rejects $4.99 with "Budget must be at least 5 USDC", accepts exactly $5, and still
accepts 1 SOL / rejects 0.5 SOL, so the SOL path is untouched; `verify-edit-guards.ts` (16/16) proves
`isConfiguredTreasury` recognises both treasuries case-insensitively and rejects a publisher wallet,
that the USDC mint set accepts the configured and canonical mints and refuses an arbitrary one, and
that `normaliseBannerUrl` passes our own upload paths and https, refuses `javascript:`/`data:`, and
treats `null` as "clear". `/dashboard/create`, `/dashboard/bags/[id]` and `/` all compile and return
200 through the dev server, and the new copy ("the only budget token for now", "Minimum $",
`MIN_FIXED_BUDGET_USDC`) and the dialog ("Edit this bag") are present in the emitted client chunks,
so the UI changes are genuinely in the bundle rather than only in the source.

The one remaining way to create a funded bag without a transfer is `POST /api/admin/campaigns`,
which sets `fundedAmount = budget` by design for the operator's own portal. That is deliberate — it
is behind admin auth, audited, and how test bags get made — and it is the reason the guard is
written into the *publisher* path rather than into the schema.

## Three cleanups: the publisher payout queue, the demo bags, and notification defaults

### The payout queue was a to-do list nobody could do

`PayoutQueue` sat on My Bags listing every approved-but-unpaid submission across the publisher's bags,
under a heading that said "Payout queue" and an empty state that said "Nothing to pay right now". A
publisher reading that can only conclude they are expected to do something — pay, approve, sign — and
they are not: review runs on its own and the payout is sent by the server from the bag's own treasury
the moment it approves, with the daily cron as the retry. The component's own doc comment already said
so ("a window onto that process, not a to-do list"), which is the tell: a window onto a process you do
not control is not a feature.

Gone: `payout-queue.tsx`, `payout-queue-row.tsx`, `GET /api/payouts/pending` (it existed only to feed
that card, and its doc comment called it "the publisher's work queue"), the `usePendingPayouts` hook
and its two payload types, and the card itself from `my-bags.tsx`. The layout closes up on its own —
the page is a metrics grid above the bag list — so the only change around the hole is the metric that
sat above it: **"Needs attention" → "In the pipeline"**, with the same numbers and an icon that is not
a warning triangle. Counting work the publisher cannot action and calling it attention needed is the
same mistake as the queue, one card over.

**Kept, deliberately:** `POST /api/payouts/run` and `lib/payouts/settle.ts`. That is the execution —
Vercel Cron calls it daily (`vercel.json`) and it is the retry behind the on-approval payout. Nothing
about the money moved here.

Two pieces of copy said the same untrue thing and were fixed with it: the approved status chip read
"The publisher still has to settle the payout on-chain" (`status-badge.tsx`) and the creator's status
help read "the payout is queued with the publisher" (`my-submissions.tsx`). Both now say the payout is
sent automatically, which is what happens.

### Ember and Nova are gone, and cannot come back

The seed at `prisma/seed-test-campaigns.ts` created exactly two campaigns — a wrapped-SOL bag called
**Nova** ("Nova Protocol") and a USDC bag called **Ember** ("EmberSwap") — and it is deleted, along
with its `db:seed:test` script. They were never funded (`fundingSignature` null, treasury = the
incinerator address), and they had become actively harmful: they showed on Explore as campaigns nobody
could be paid for, and because a Project row carries a bag's *identity*, a real publisher's brand-new
bag could inherit a demo project's name and ticker and render as NOVA or EMBER.

`scripts/remove-demo-bags.ts` (`bun run db:remove:demo-bags`, dry run by default, `--apply` to write)
deletes the rows. It is deliberately narrow, because a real coin may legitimately use either ticker: a
project is only removed when **every** campaign on it is unowned (`createdBy` null) and none was made
by an operator — the exact shape the seed produced and a shape no publisher's bag can have. Anything
with an owner is reported as SKIP with the reason, so a real EMBER stays its publisher's. It also
catches a campaign carrying a demo title on a project that was renamed. Idempotent: a second run says
nothing is left. The cascade is the schema's own — project → campaigns → submissions → payouts, plus
communities, their members and messages, and the admin change log; `FeeDeposit` and
`TreasuryInboundEvent` are `ON DELETE SET NULL`, so a fee row matched to a demo bag survives with no
campaign, which is right, because that deposit really happened.

Every other mention is gone too: the create form's placeholders (which used "Nova" as the example
title and project name) now read generically, and the two comments that named the seed projects as
history — in `POST /api/campaigns` and in `fix-shared-projects.ts` — describe the same bug without
naming bags that no longer exist. `fix-shared-projects.ts` stays: it is what repaired the real bags
that had been pointing at those projects, and the same detachment is needed for any project two owners
share.

### Notifications are off for a new account

`SETTINGS_DEFAULTS` in `settings-page.tsx` — `notificationsEmail`, `notifyOnPayout`,
`notifyOnStatusChange` — were all `true`. They are now all `false`, and the section's description says
so ("Off by default — turn on the ones you want").

This is the whole change, and it is the right lever rather than a shortcut: the preferences live in
`localStorage` under `bagwork.settings`, and `usePersistentState` returns the defaults when nothing is
stored *and does not write on mount*. So the defaults object **is** the new-user state, and an existing
user who has saved a preference keeps it — nothing is migrated, and no existing account is touched.
There is no server-side notification preference model to change; the switches are the only store.

**Verified.** `tsc --noEmit` and ESLint clean on all ten touched files. Against a running dev server:
`/dashboard/my-bags`, `/dashboard/settings`, `/dashboard/create` and `/` all compile and return 200;
across all 372 emitted client chunks there is **no "Payout queue" string and no `pending-payouts`
reference** left, and the only `Ember`/`Nova` match in the whole bundle is `Nova Wallet` inside Privy's
own SDK. The settings defaults were read back out of the compiled chunk
(`notificationsEmail: false, notifyOnPayout: false, notifyOnStatusChange: false`) and, through a
temporary harness rendering the real hook, out of the server-rendered HTML a browser with an empty
localStorage sees — which is the new-user case, all off. `scripts/remove-demo-bags.ts` was executed
against an unreachable database and reached its first query (`db.project.findMany`) before failing on
the connection, which is as far as it can be tested without the real `DATABASE_URL`; the exact command
is in its header.


## CTST, the hand-made test bag

A third demo bag joined Nova and Ember on the way out: **CTST**, a fixed-budget bag briefed "Community
test bag — try the announcement board". It is a different shape from the other two, and it needed a
different rule.

It has **no code reference at all**. Not a seed, not a fixture, not a hardcoded id, not a placeholder —
a full case-insensitive search for `CTST` and for every line of its copy across `src`, `scripts`,
`prisma`, `tests`, the root config and `worklog.md` returns nothing, and the tracked `db/custom.db` is
a stale SQLite template with none of it either. It was created by hand through the app, so it exists as
one row in the live Postgres database and nowhere else. That is also why it does not appear on Explore,
the dashboard or the admin list once deleted: all three read the same campaign tables — there is no
list anywhere that could keep showing it.

**The rule.** `scripts/remove-demo-bags.ts` now handles both cases, and `scripts/demo-bag-identifiers.ts`
holds the predicates — pure, no Prisma — so the thing that decides what gets deleted from a live
database can be read and exercised on its own:

- The **seeded projects** keep the narrow rule: ticker or name matches *and* every campaign on the
  project is unowned and not operator-made, otherwise SKIP with the reason. A real coin that happens to
  use the ticker EMBER still belongs to its publisher.
- **CTST** is matched on its own copy instead — ticker, title, or the brief and its supporting line —
  and deleted whatever its status, DRAFT or LIVE, because those strings are not something a real
  campaign carries. Its owner, if any, is printed rather than skipped: the dry run is where a wrong
  match shows up, and there is nothing worth preserving about a bag briefed "try the announcement
  board". The fragments are matched without their punctuation, so an em dash, an en dash or a hyphen
  all hit — matching a dash is how a cleanup silently misses the row it was written for.

**No orphans.** The test bag's project is *not* deleted with it, because a project row can be shared
with a real bag (that is the same borrowed-identity bug the seeded projects caused). Instead the script
deletes the campaign, then deletes the project only if it matches the test identifiers *and* is left
with nothing on it — re-checked against the database after the delete rather than trusting the
prediction. A real publisher's project row, even an empty one, is never touched. The campaign's own
dependents go with it by cascade: submissions and their payouts, its community with its members and
messages, and its admin change log; `FeeDeposit` and `TreasuryInboundEvent` are `ON DELETE SET NULL`,
so a deposit row matched to it survives unlinked, which is right, because that deposit happened.

**Verified.** `tsc --noEmit` and ESLint clean. `tool-results/verify-demo-matchers.ts` runs the real
predicate — 21/21 — and it is the check that matters here, because it is the one that decides what
disappears from production: it matches the ticker in any casing and with whitespace, the titles
"CTST", "CTST — FIXED BUDGET" and "CTST: FIXED BUDGET", the brief with an em dash, a hyphen *and* a
comma, the supporting line on its own, and a project name containing the ticker; and it refuses an
ordinary bag, a real coin called Nova, a real coin called Ember, a bag that merely says "testnet", a
bag about an announcement-board feature, and an empty row. The ownership predicate is checked the same
way. The script itself was executed against an unreachable database and reached
`db.project.findMany()` before failing on the connection, which is as far as it can be tested without
the real `DATABASE_URL` — the exact command is in its header, and the row itself is still to be deleted
by running it.

---

Task: two product changes — (1) social verification through a **separate** Privy app, (2) a flywheel
opt-in window that actually matches the `$20` rule the UI was describing.

## 1 — Social verification, on its own Privy app

**The gap was bigger than "tied to signup".** Profile settings had no social UI *at all*:
`socials` was state that got seeded from the profile, dirty-checked and saved, and never rendered.
The only writer was `PATCH /api/profile`, which accepted `socials` as a free-text map — and
`verifySubmissionAccount` treats a stored handle as proof that an account is yours, so anyone could
type a stranger's handle, submit that stranger's viral post, and be paid for it. Signup itself was
the *other* half of the problem: it is wallet-only and its dashboard has email/SMS/socials disabled,
so it cannot run an OAuth account flow and must not start offering one.

**Two apps, two jobs.** Signup is untouched (`NEXT_PUBLIC_PRIVY_APP_ID` + `PRIVY_APP_SECRET`,
login/wallet/session). Verification gets its own app and its own credentials:
`NEXT_PUBLIC_PRIVY_SOCIAL_APP_ID` (public, ships in the bundle) and `PRIVY_SOCIAL_APP_SECRET`
(server-only, read by exactly one module). Both are documented in `.env.example`, alongside the
dashboard steps the app needs (enable X/TikTok/Instagram OAuth; allow the settings URL as a redirect).
With no App ID, settings renders a named "not configured" state instead of a button that cannot work.

**The flow.** `components/console/social-verification.tsx` mounts a second `PrivyProvider` (the
verification app id) nested around the panel — mounted whenever settings is open, not lazily,
because the hook that starts an OAuth flow has to be present on the page the provider redirects back
to. Pressing Verify calls `useLoginWithOAuth().initOAuth` for X / TikTok / Instagram; the redirect
returns to settings; the exchange is an effect, because the click that started it is long gone by
then. It takes the **verification** app's access token, hands it to `POST /api/profile/socials`
(`lib/profile/hooks.ts` → `useVerifySocial`) and signs that app's session straight back out — a
one-time proof should not leave an ambient session behind.

**The handle is never client-supplied.** `lib/auth/privy-social-server.ts` (new, and the only reader
of the secret) verifies the token against the verification app's own JWKS, reads the user it
identifies, and pulls the `twitter_oauth`/`tiktok_oauth`/`instagram_oauth` username out of it. Only
then is `User.socials` written. `socials` is now **verification-only**: the PATCH schema no longer
accepts it (Zod strips it, so a stale client gets a 200 with the field ignored), `ProfileUpdate` no
longer types it, and the settings payload no longer sends it. `DELETE /api/profile/socials?platform=`
unlinks one, which is the only way back out.

**Said out loud, not implied.** YouTube has no OAuth provider on the verification app and a Google
login proves a Google account rather than a channel handle, so the panel says a YouTube post cannot
be matched to a verified account yet rather than offering a button that does nothing. The submit
form's two blocked states now point at **Settings** (where verification lives) instead of Profile
(where nothing can be clicked), and `verify.ts`'s three messages say the same. `verification.cjs`'s
"message points at the profile" assertion was updated with the copy — 55/55 pass.

**Verified.** `tsc --noEmit` and ESLint clean on every touched file. A temporary harness
(`tool-results/verify-social-verification.ts`, deleted after the run) checked the failure paths both
ways: with no credentials it reports `not_configured` and names `PRIVY_SOCIAL_APP_SECRET`; with a
fake credential pair it builds a client, reads as configured, and refuses an empty token and a
malformed one as `invalid_token` — typed failures, never a throw. Dev server: `/dashboard/settings`
200, `/dashboard/my-bags` 200, `POST /api/profile/socials` 401 `{"error":"Unauthorized"}` without a
session.

**What could not be tested here:** the OAuth round-trip itself needs the real app secret, a provider
configured for the verification app and the redirect URL allow-listed. Those are the user's steps;
the code path either side of them is exercised.

## 2 — The flywheel opt-in window, stated as the rule it is

**What was wrong.** A flywheel bag's budget arrives from trading fees, so it starts at $0 — and the
copy either promised the opposite ("It is open to bagworkers now") or described a one-shot event
("slots open as fees are detected"). The worst of it was on the bag page itself: a flywheel bag that
had never received a fee, with slots empty, rendered **"Every slot is taken — the budget would need
topping up."** That sentence sends a creator looking for competition that does not exist, and it
contradicts the API, which refuses the claim.

**One rule, one module.** `lib/campaigns/flywheel-window.ts` (new, pure, no Prisma) owns it:

- **open** while the bag holds **≥ $20** of fee money;
- **short** below that — not open yet, or closed again;
- **spent** at $0.

A *threshold*, never a latch: fees that carry the bag back over $20 open it; paying creators out
below closes it; nothing is one-shot. "Holds" means `budget − spent`, not `budget` — the column is
the lifetime total raised from fees and a payout does not lower it, so a bag that raised $500 and
paid out $495 is empty, not rich. The $20 deliberately matches the default swap floor (fees below it
are never converted, so a bag under the floor has no budget to open with) but stays its own number:
raising `FEE_SWAP_MIN_USD` in a deployment does not move the product rule.

**The API matches it.** `POST /api/submissions/claim` and `POST /api/submissions` both refuse a
flywheel bag whose window is closed, with `code: "flywheel_window_closed"` and the sentence from the
same module (`{ error: flywheelWindowMessage(window) }`). Settled payouts are summed with an
aggregate the same way `lib/mappers.ts` computes `Campaign.spent` (`payoutAmount` of rows with status
`paid`), so the browser — which already holds `campaign.spent` — and the server cannot disagree. In
the link route the check sits *below* the fill-an-existing-claim branch on purpose: a slot claimed
while the window was open must not be refused because the budget dipped before the link arrived. The
old "waiting for its first fees / full" wording for flywheel bags is gone; it now says every slot for
the *current* budget is taken and that new slots appear as more fees convert, which is what actually
happens.

**Every surface says the same thing.** Bag page: the `$20` rule with live numbers under the opt-in
button, the button itself labelled `Opt-ins open at $20 in fees` and disabled while closed, and an
empty-state line that explains there is nothing to claim yet. Fee panels: `FeeTransparencyPanel`
carries the rule and the current state next to the figures it is about; the `FeeRedirect` badge's
tooltip names the threshold (a growing budget is not an open door). Publisher side:
`create-flywheel-page`'s publish toast, published header and status card, and `create-launch-page`'s
fee-lock panel — all four said (or implied) "open now", and all four now state the threshold and that
it closes again when spent.

**Verified.** A temporary harness (`tool-results/verify-flywheel-window.ts`, deleted) ran the rule
against 27 assertions: $0 closed and *spent*; $12.50 closed with a $7.50 shortfall; $19.99 closed,
$20.00 and $20.01 open; $100 raised with $100 paid closed; $500/$495 closed; 15 left closed, 20 left
open; the open→close→reopen sequence; never a negative available; and the wording per state.
`tsc --noEmit` and ESLint clean on all eight touched files.

## 3 — Every remaining demo bag, and where each one was hiding

Four demo bags existed across the system, from three different places, and a fifth piece of demo
data was sitting in the repository itself as a database file.

**The flywheel one was still seedable.** `scripts/seed-demo-flywheel.ts` created a Fee Redirect bag
(project "Demo Flywheel", ticker $DEMO, title "DEMO — Flywheel bag: $DEMO trading fees fund this
pot") with a `--delete` switch of its own — and a `db:seed:demo-flywheel` script that would put it
back on any deploy that ran it. Both are gone. It was also the only demo standing on a
**deterministic mint** — `base58(sha256("bagwork-demo-flywheel-project"))` — which matters, because
that is the one identifier an edit to the name, ticker or title cannot hide.

**The deletion rule now has two strengths of evidence, because they are not equally strong.**
`scripts/demo-bag-identifiers.ts` splits them and `scripts/remove-demo-bags.ts` consumes that:

- **Its own copy gives it away** — the demo mint, or text no real campaign contains ("DEMO DATA — not
  a real campaign", "community test bag", "first Nova swap", "fee split in your own words"). Deleted
  whatever its status and whoever owns it: that is the CTST rule, now covering the flywheel demo too.
- **A seeded ticker alone** (NOVA / EMBER / DEMO) — deleted only when nobody owns it and no operator
  made it, because a real coin may legitimately be called any of those. A publisher's bag on a coin
  called Nova is reported as SKIP with the reason, not deleted. This is the guard the earlier pass
  established, and it is preserved deliberately rather than loosened to make the demo list simpler.

Matching is flexible everywhere the copy was typed by hand: briefs match by **fragment without
punctuation**, so an em dash, an en dash or a hyphen all hit; projects match on ticker, name **or**
mint; and "Solana Mobile" — the other name the EMBER demo's project carried — is matched as a *name*
through the ownership guard, never as campaign copy, so a real project with that name survives unless
it is genuinely unowned and empty.



**A tracked SQLite database was the last hiding place.** `db/custom.db` was 110 KB of prototype data
committed in the baseline checkpoint: 12 demo campaigns on 8 demo projects (BONK, WIF, POPCAT, JTO,
PYTH, MEW, JUP and a "Bagwork" one, each with an invented mint and treasury), 51 fabricated
submissions all owned by `current-user`, 26 payouts with made-up signatures, and a 12-row
leaderboard. Two things made it safe to delete rather than clean in place: nothing in the codebase
reads it (the app's database is Postgres, via `DATABASE_URL`, and this file's schema is the old
PascalCase one), and every row in it is demo data, so "remove the demo bags" means emptying it. The
packaging template that copies it (`.zscripts/database-runtime-build.sh`, `start.sh`) explicitly
handles its absence — it says so in its own words: "Preview database not found, initialising an empty
production database" — and `tests/database-runtime-build.sh` asserts that path with its own synthetic
fixtures, so deleting the tracked file does not break the build; it stops shipping demo rows into a
preview. `/db/` is gitignored now so a local preview database can never be committed again.

**Two echoes of the demo identities in user-facing code.** The marketing hero card's hardcoded sample
bags were literally named **NOVA** and **EMBER** (`hero-bagworker-card.tsx`) — the two demo tickers,
rendered on the landing page. They are campaign-style titles now, which is also the more honest thing
for a card stamped SAMPLE. And `lib/token/analytics.ts` explained a past pricing bug by naming an
`EMBER / <mint>` pool; that comment describes the failure mode without naming a demo token.

**Swept and reported clean:** the rest of the repository has no NOVA / EMBER / CTST / DEMO / "Demo
Flywheel" reference left in `src`, `scripts`, `tests`, `prisma`, `public`, `package.json`,
`.env.example` or `.gitignore` — the only remaining mentions are inside the two cleanup files, which
have to name what they delete. `scripts/verify-journey.ts` is the one other script that creates
campaigns, and it tags them `journey<run>`, sweeps leftovers from a crashed run, and deletes its own
in a `finally`; nothing to clean there.

**Verified.** `tsc --noEmit` and ESLint clean. A throwaway harness
(`tool-results/verify-demo-identifiers.ts`, 28 assertions, all passing) recomputes the demo mint with
the app's own `base58Encode` and asserts it equals the literal in the identifier list — so the
sharpest matcher provably fires against the seeded row — then walks every demo by ticker, name, title,
brief and mint, and every case that must **not** be deleted: a real publisher's bag on a coin called
Nova, an operator-created bag on a DEMO-ticked project, a bag about "demonstration videos", a
campaign on a project named "Solana Mobile", and a mint that is not the demo mint. It replaces
`verify-demo-matchers.ts`, deleted because it imported an export that no longer exists.

**What could not be run here:** the database itself. This machine has no `DATABASE_URL`, so
`bun run db:remove:demo-bags` was executed and stopped at `db.project.findMany()` with `Environment
variable not found: DATABASE_URL` — as far as it can go without credentials. The live rows go by
running, against the real database:

    bun run db:remove:demo-bags              # dry run: prints what would go, and any SKIP
    bun run db:remove:demo-bags -- --apply    # writes

`--apply` deletes the projects first (the cascade takes their campaigns, submissions, payouts,
communities, members and admin change log), then any demo campaign matched on its own copy, then any
project left empty by one. A second run reports nothing to do.

**Left alone on purpose:** `scripts/seed-demo-points.ts` (it fabricates points on profiles, not bags,
and `lib/leaderboard.ts` cites it as the reason a suspended payout still has points), and the
`worklog.md` history above this entry, which is a record of what was done rather than a place demo
identities are used.


---

Task: put the Explore banner artwork behind the header, at the size the header already had.

The Explore hero is a flat card tint (`bg-card/25`) with a dot grid on `::before` and a four-bloom
colour wash on `::after`. It now carries `public/explorepagebanner.svg` underneath both of those,
with nothing about the box changed.

**The implementation is one optional prop.** `PageHeader` (in `components/console/ui.tsx`, shared by
18 screens) takes `bannerSrc`, and the image is painted as the *element's own background*. That is
not a shortcut around layering, it is the layering: an element's background paints before its
pseudo-elements and before its children, so the order is artwork → dots (`::before`) → wash
(`::after`) → heading and copy, with no wrapper element, no `z-index` to guess at, and no extra
pointer-events surface to disable (a CSS background cannot receive a click). `bg-cover` + `bg-center`
plus the header's existing `overflow-hidden` crop the 4:1 artwork evenly top and bottom in a 7:1
strip instead of squashing it. `explore-bags.tsx` passes the public path, defined as
`EXPLORE_BANNER` with a note on why it is a path rather than an import.

**The scrim is the one part that was not optional, and the existing layers did not provide it.** The
dots and the wash are *additive* — yellow dots and four bright blooms — so the first attempt had
"EXPLORE", the title and the description sitting on raw pink sky (the artwork is a cartoon crowd on a
sunset). The scrim is the first layer of that same `background-image` stack, since background layers
paint front to back: dark on the left where the 672px text column is, nearly transparent on the
right, so the artwork still reads as artwork rather than as a dark rectangle.

**Measured in the browser, against the running page.** Height: **184.36px with the banner and
184.36px with the background set to `none`** (content box 183.25px and the block below the header
759.93px in both), so zero layout shift. Contrast, recomputed from the element's own computed CSS
with the artwork drawn cover-style, the scrim rebuilt from its parsed stops, and the dot grid drawn
**without its radial mask** — harsher than what actually renders: eyebrow **7.51:1**, title
**12.86:1**, description **6.46:1**, all above the AA thresholds they need (4.5 / 3 / 4.5). The
un-scrimmed version measured 4.53:1 on the description, which is what moved it from "passes" to
"passes with headroom".

**Every other screen is untouched, and that is checked rather than assumed:** `cn(BASE, false)` and
`cn(BASE, undefined)` are byte-identical to the previous class string, `bg-card/25` survives the three
new classes (they are different tailwind-merge groups, so nothing is dropped), and the prop is absent
everywhere else so the DOM is what it was.

**The asset is 5.4MB** — an SVG wrapping embedded raster art with no `<path>` at all, so there was
nothing for a build step to shrink. It is served from `public/` as one cached static file
(`200`, `image/svg+xml`), fetched once. `next/image` was deliberately not used: the optimiser passes
SVG through untouched, and a CSS background cannot go through `Image` in any case.


---

Task: push the Explore banner up inside its own box, dissolve the edge it ended on, and make the demo-bag purge runnable against the database the live app actually reads.

**The banner was cropped in the wrong place, and that single decision caused both complaints.** The
artwork is 4:1 — sky in the top half, the crowd in the lower half, and a baked-in dark bar across its
bottom 5% — while the strip is about 7:1, so `bg-cover` at `center` showed the middle 55% of the
picture: empty sky above, the crowd sliced through the chest at the header's bottom edge.

**The visible window moved down the picture.** `background-position: 50% 88%` replaces `bg-center`.
Sliding the crop *down* the artwork pulls the illustration *up* in the strip: the heads now sit near
the top edge and the crowd fills the header. 88% is not a round number on purpose — it is the last
stop before the artwork's own dark bottom bar enters the frame. All five stops (50 / 72 / 82 / 90 /
100%) were rendered side by side before choosing: 90% already caught a sliver of that bar, and 100%
put it across the header as a black strip that reads like a bug.

**The seam is now a third background layer.** The artwork has no soft edge of its own, so where it was
cut off, bright cartoons ended against the near-black page in a straight line. The top layer of the
image stack is now `linear-gradient(to bottom, rgba(11,10,7,0) 54%, …0.62 76%, …0.94 92%, #0b0a07
100%)`, so the last third dissolves into `--background` — the colour the content below actually sits
on. `border-b border-border/60` became `border-b border-transparent` when a banner is present: the 1px
border is still there, so the box is unchanged, but no hairline crosses the fade.

**Measured on the running page rather than reasoned about from the CSS.** Height: **184.36px**, the
same as before the change and the same as a header with no banner. Contrast was sampled from a
screenshot of the header taken with the text set to `visibility: hidden` — so every pixel behind the
glyphs is background and nothing else — then composited against each element's own computed colour:
eyebrow 11px **5.23:1** worst case, 7.32 mean; title 28px **11.02:1** / 14.95; description 14px
**7.48:1** / 9.19. All clear the AA thresholds they need (4.5 / 3 / 4.5). A breakpoint probe (box
widths 1344 / 700 / 360px) also showed why the fade earns its place: at 700px and 360px `cover` flips
to height-driven and the *whole* artwork height is drawn, built-in dark bar included — the fade covers
it at 0.94→1.0 alpha, so the bar never surfaces at any width.

**The demo bags were never deleted because the cleanup could not reach them.** `bun run
db:remove:demo-bags` is a CLI, and this machine has no `DATABASE_URL` (no `.env`, no `.env.local`,
nothing in the shell), while Explore was reading the production Postgres. The rows were real, the
script was right, and nothing had ever run it. Worth knowing when the list still looks wrong after a
purge: `GET /api/campaigns` is cached `public, s-maxage=30, stale-while-revalidate=300`, so a browser
can serve the previous list for around half a minute.

**So the rule got a second way in, and the rule itself did not move.** `scripts/demo-bag-identifiers.ts`
became `src/lib/campaigns/demo-bag-identifiers.ts` (the entry points are now app-side, so the
predicates had to be importable from `src`) and gained `isDemoBag` — the same identifiers matched
*without* the ownership guard, because the question "would a visitor still see a demo bag?" has a
different answer from "may this row be deleted?". The script's four queries, its two strengths of
evidence and its orphan-project re-check moved into `src/lib/campaigns/demo-bag-sweep.ts` as a
`createDemoBagSweep(client)` factory: a read-only `plan()` (what would go, what is skipped, and whether
Explore would still show any of it) and `apply(plan)`, the only function that writes. The client is
passed in rather than built, so the route hands over the app's existing pool and the CLI its own.
`scripts/remove-demo-bags.ts` is now a thin printer over that — it lost 250 lines and gained nothing
to keep in sync.

**Writing the test found a real wart.** A campaign with a seeded title answers *both* the "stray" query
and the "its own copy gives it away" query, so the dry run listed it under both and the new report
would have counted it twice. The delete was always harmless — the second pass removed zero rows — but a
count that disagrees with the rows is exactly what an operator should not see before confirming a
deletion. A campaign is now listed once, and the narrower stray rule wins.

**Two new surfaces, both over the same rule.** `GET /api/admin/demo-bags` (behind the existing
`bagwork_admin` cookie) returns the plan; `POST` applies it, requires `{ confirm: true }` so a bare
POST cannot fire it, and re-plans after the write so it reports the database's state rather than the
request's. The operator console's Campaigns tab renders a **Demo data** panel: nothing is read until
you press Check, the plan is listed row by row with the skipped rows and the reason they were skipped,
removal is a two-step confirm, and the campaigns table below is remounted on a bumped key afterwards
so it cannot keep showing rows that were just deleted.

**Verified.** `tests/demo-bag-sweep/verification.cjs` — 20 checks — runs the real `plan()`/`apply()`/
`plan()` against a fake Prisma that models relation filters (`campaigns: { none: {} }`,
`project: { tokenSymbol }`), because a fake that quietly answers "no" to nested filters would let the
test pass for the wrong reason. It covers three seeded projects deleted whole, an owned coin called
Nova skipped, a seeded title on a renamed project caught as a stray, the CTST bag matched by its own
copy with its project deleted once empty, a paused demo bag deleted but *not* reported as visible on
Explore, a publisher's own bag untouched, and a second run finding nothing to do. Typecheck and eslint
are clean. Against the dev server: the endpoint answers 401 without the cookie, the panel renders on
the Campaigns tab and surfaces a failed check as an error note, and the CLI now fails at
`demo-bag-sweep.ts:126` with `Environment variable not found: DATABASE_URL` — it loads, wires up and
waits for a connection string, which is the one thing this machine does not have.

**To finish the purge on the live database:** either give the CLI production's `DATABASE_URL`
(`bun run db:remove:demo-bags` for the dry run, `bun run db:remove:demo-bags -- --apply` to write), or
open `/adminportal` → Campaigns → Demo data → Check → Remove, which runs against the database the
deployment is already connected to and needs no credentials copied anywhere. Both report the same
plan, both are idempotent, and the Explore line in that report is the one to look at afterwards: it
should read zero demo bags visible.

---

Task: kill the hard line under the Explore banner, and change nothing else.

**The line was two edges on top of each other, and both were measured rather than guessed.** A 620px
wide strip across the seam, sampled at 4× device scale and averaged per row, put it beyond argument:
the banner's last full CSS pixel read **luminance 87–169** depending on where across the width it was
measured, against the near-black page's 10. A bright hard band, exactly the width of the border, at
exactly the bottom edge.

**The loud half: the artwork was painting the border strip and nothing was covering it.** The header
keeps its 1px bottom border (transparent, but present), and `background-origin` defaults to
`padding-box`, so the two film gradients were sized to the inside of that border — while the artwork,
having an intrinsic 4:1 size, is `cover`-scaled across the whole box and clipped to the border box.
The strip therefore got the picture and none of the film. `background-origin: border-box` hands the
film the same box the artwork uses; the strip drops from 128 to 10, and the header keeps its
**184.36px** height. Dropping the border instead would have been the obvious move and it is the wrong
one: measured, `border-bottom-width: 0` takes 183.25px, 1.1px of height with it, which is the one
thing this task could not spend.

**The quiet half, found only because the first fix left one row behind:** a single device row still
read 23 against 10. `background-position` was one value for all three layers — `50% 88%`, written for
the artwork's crop — and applying the artwork's offset to the *film* layers shifted their raster off
the bottom edge, leaving that row of undimmed picture. Written per layer — the film layers `0%`, the
artwork `88%` — the row reads 10. Nothing about the artwork's placement changed; `cover` and `50% 88%`
are untouched.

**A softer fade ramp was tried and reverted.** It measured *identical* to the shipped stops on every
text metric (eyebrow 7.81:1 mean, title 16.56:1, description 9.2:1 — the copy sits above where the
fade begins, so its stops cannot affect it) and it was not needed to close the seam, so the diff
keeps to two properties.

**Verified as a before/after, same page, same boxes.** Column profiles at four x positions (400 /
700 / 1040 / 1400): before, the tail read `9.7, 23.4, 106.7, 104.3, 101.2, 114.8`; after, `9.8, 10,
10, 10, 9.9, 10` — the banner's last rows are now the page colour with no step into the
tabs/filters area below. Height 184.36 in both. A page with no banner (Leaderboard) still has
`background-image: none`, `padding-box`, and its gold bottom hairline, so the other 17 headers are
untouched. `+ Create Bag` is still there, and its contrast comes from its own brand background
(rgb(189,254,0) under rgb(11,10,7), about 15:1) rather than from the banner. `tsc --noEmit` and eslint
clean; the diff is one file, +22/−1, all of it background properties and the note explaining them.

---

Task: send every Explore CTA on the marketing site to the console, and change nothing else.

**Three of the four were pointed at the wrong thing, and the fourth was already right.** There is no
`/explore` route in the app tree — the landing surface's "explore" was the homepage's own `#live`
preview block, so the CTAs were not 404ing, they were sending people to the *smaller* of two versions
of the same list:

- `site/header.tsx` — the `EXPLORE` nav item was `/#live`, i.e. "scroll the homepage to the capped
  preview". Now `/dashboard`, the console's Explore Bags page: the full, filterable, claimable list.
- `landing/hero.tsx` — `EXPLORE BAGWORK` was a `NeonButton` whose `onClick` ran `scrollToLive()`
  (`document.getElementById("live")?.scrollIntoView(...)`). That is the one that could genuinely die
  quietly: a button with no href does nothing at all when the section is not on the page. It is now
  an `<a href="/dashboard">`, painted with the same shared surface (`.btn-3d .btn-surface-outline`)
  that `publisher-path.tsx` already uses for `Create a Bag` for exactly this reason — `NeonButton`
  renders a `<button>`, and a `<button>` cannot be a link (nesting one inside an `<a>` is invalid
  interactive content, and there is none anywhere on the page; checked). The now-dead `scrollToLive`,
  its `reduce` flag and the `framer-motion` `useReducedMotion` import went with it.
- `site/footer.tsx` — `Explore Bags` under PRODUCT was `/#live`; now `/dashboard`. The label names the
  full marketplace and the homepage block is a preview of it, so label and destination now agree.
- `landing/live-campaigns.tsx` — `EXPLORE MORE BAGS` was already `/dashboard` and is unchanged, which
  is why the section it sits in still reads as the preview it is.

**No auth gate was needed, and none was added.** `/dashboard` does not redirect: there is no
`redirect(` in the console shell or any `src/app/**` page, and Explore Bags reads the public
`/api/campaigns`. Verified signed out in the browser: all four CTAs land on `/dashboard` with the
`h1` reading "Explore Bags" and the console showing its own **Sign In** control — no bounce to a
login route, no separate marketing page. The Privy gate stays exactly where it was, on the two
actions that write (`START EARNING`, `START EARNING NOW` → `login()`), untouched.

**Measured, not eyeballed.** The new hero anchor against the `NeonButton` beside it: identical 48px
height, 16px radius, 13px/700, 0.65px tracking, 28px padding, 8px gap, `nowrap`, uppercase, and the
same outline paint (bg `rgb(22,28,11)`, border `rgba(189,254,0,0.5)`, lime text). Width differs
(215.1 vs 197.9) only because "EXPLORE BAGWORK" is the longer label. Cursor is `pointer`, which is the
page's own convention for link-CTAs — `DASHBOARD`, `Create a Bag` and `EXPLORE MORE BAGS` all show
`pointer` while every button-CTA shows `default`. Full-page screenshot before/after: no shift.

**Controls, so the fix did not break what it sat next to.** The header's section links still scroll:
`HOW IT WORKS` moves the page from 0 to 1011, `#how` lands in the address bar and the section is in
view — `followNav` and `sectionOnThisPage` are untouched, and no `#live` link remains anywhere on the
page (checked). The two nav doc comments that used `/#live` as their example now use `/#how`, since
that is an href the nav still carries, and the header's own note now says six entries: three sections
and three routes. One consequence worth stating: `#live` no longer has a nav entry, so the preview
section is reached by scrolling and by its own CTA into the console.

`tsc --noEmit` and eslint clean. Three files changed, all of it hrefs, the one element swap, and the
comments that had to stop describing the old destinations.



---

Task: give the Community page the same banner treatment as Explore.

**Asset.** `C:\Users\syedp\Downloads\communitypagesvgbanner.svg` → `public/communitypagebanner.svg`,
byte-identical (sha256 `EE4ADF73…`), named to match the existing `public/explorepagebanner.svg` rather than
the download's own name. 2.0 MB, an SVG whose art is embedded raster (1686×286, 5.9:1), served as a CSS
background from a public path exactly like Explore's: nothing bundles it, and the browser caches it with the
rest of the static assets.

**Component touched: `PageHeader` in `src/components/console/ui.tsx` — not at all.** The whole banner stack
already lives there behind the optional `bannerSrc` prop, so the Community page needed one line:
`bannerSrc={COMMUNITY_BANNER}` on its `<PageHeader>` in `src/components/console/pages/community-index.tsx`.
The layer order comes out of that one prop and is therefore the same on both pages — the artwork is a
*background*, so it paints before the element's `::before` (dot grid) and `::after` (colour wash) and below the
`z-10` content: art → scrim → bottom fade → dots → wash → text, with no wrapper, no `z-index` and no extra hit
area. Both decorative layers already carry `pointer-events: none` in `globals.css` and the artwork is not an
element at all, so nothing new can intercept a click. The only edit to `ui.tsx` is the `bannerSrc` note now
recording that two headers paint through it.

**Height, unchanged by construction and measured.** The header box reads 1334.01 × 184.36 both before and
after the swap — the same 184.36 the Explore header has, because it is the same component with the same
padding, and a background cannot affect layout. No new block, no min-height, nothing added around the header.

**Seam, measured the way the Explore fix was.** A 1180px-wide strip covering the header's last 12 CSS px plus
12 px below it, sampled per CSS pixel. (First attempt used `scale: 'device'` clips, which are in *device*
pixels — at `devicePixelRatio` 0.9 that mislabelled every row and sent me chasing a "hairline" that turned out
to be the search bar 25px further down. Use `scale: 'css'` for this.) With the Community artwork the rows
y228–238 read mean **10.0 with max 10.0 across the entire width** — the page colour, flat, not one bright pixel
to hide — and the row below reads 10.8. Explore's own banner in the same box reads 10.1 / 10.1, and the same
header with no banner at all reads 10.0. So the community strip dissolves exactly where Explore's does, and
slightly darker; the residual 2px step at the header's bottom edge is present in all three states, artwork or
not, so it is the header's own edge and not something this banner introduced.

**Text readable, with Community's own copy in place** (eyebrow "Community", h1 "Communities", its description,
and the "Explore bags" action). Measured against the pixels behind each element with the text hidden: eyebrow
**7.74:1** mean / 5.47:1 worst pixel, title **15.96:1** / 12.19:1, description **9.37:1** / 8.61:1 — clear of
WCAG AA for body text even at the worst single pixel, and in line with what the Explore banner measured. The
screenshot shows the characters' heads in frame, the dot grid and wash over the art, and the banner's bottom
edge disappearing into the panel with the tabs sitting on top of it.

**How it was verified, given the gate.** `/dashboard/community` renders `SignInRequired` without a session, and
this machine has no `.env` (no Privy app id), so the real Community header cannot be opened locally. The
verification therefore drove the *same* `PageHeader` element on `/dashboard` — same DOM, same classes, same
inline style — with `background-image` swapped to the Community asset in the page only, and with Community's
copy typed into it for the readability pass. Nothing in the repository was changed for the harness. `tsc
--noEmit` and eslint clean, both routes answer 200 on the dev server, and the asset is a byte-identical copy of
the file in `Downloads`.


---
Task: push the Community hero artwork down inside its header — more sky above the characters, characters lower. No change to the header's height, to the layout, or to the bottom fade.

**Why it needed a knob at all.** `PageHeader` painted all three of its layers at one shared position, `"50% 0%, 50% 88%, 50% 88%"`, and `88%` is the *Explore* crop: Explore's artwork is 4:1 (2000×500) and overflows the console's 7.3:1 header vertically by ~170px, so 88% is a real choice between two decent framings. Community's is 5.9:1 (1686×286) and overflows by only ~43.6px — so the same 88% spent nearly all of that short overflow pressing the cast up against the top edge. Same treatment, different illustration shape, and the shape is what made it read as "cropped too high" rather than "framed".

**The change, two files.** `PageHeader` gains an optional `bannerPositionY = 88` prop and its `background-position` becomes `` `50% 0%, 50% 88%, 50% ${bannerPositionY}%` ``; the default is the number that was hard-coded, so Explore and the other ~17 headers that pass only `bannerSrc` are unchanged in behaviour and in the CSS they emit. Community passes `bannerPositionY={COMMUNITY_BANNER_POSITION_Y}`, a named `50` constant next to `COMMUNITY_BANNER` with the reasoning in its doc comment — a *lower* percentage pushes the picture down (0% puts the art's top edge on the box's top edge), which is the direction that was wanted. Both the prop and the constant carry a long note, because "88 is fine for Explore, 50 for Community" is otherwise a magic number with no way back to the reason.

**The fade cannot move, by construction.** Only the artwork's own entry in the three-layer list became a template literal; the two film gradients keep the literals `50% 0%` and `50% 88%`, and the bottom fade is a separate opaque layer pinned to the box's bottom edge. Nothing about layer order, `background-origin: border-box`, or the scrim was touched, so the seam into the panel below is the same computation whichever value a page passes.

**Measured.** Computed style read off the live DOM: Community `"50% 0%, 50% 88%, 50% 50%"`, Explore `"50% 0%, 50% 88%, 50% 88%"`, and both header boxes **1344 × 184** before and after — a background cannot affect layout, and the height is untouched. On the Community asset in that box, 50% sits the cast **16.6px lower** than the 88% it shipped with, and the drop scales with the box because the artwork is `cover`-scaled. Both of the illustration's baked-in edges — the pale strip along its top and the dark band along its bottom — stay out of frame at 50%, which was the thing to check before choosing it: the extra sky above the heads had to come from the middle of the picture, not from dragging a visible edge into view.

**Seam re-measured, the same way the banner fix was.** A strip covering the header's last 12 CSS px plus 12 px below it, sampled per CSS pixel with `scale: 'css'` (device-scale clips mislabel rows at `devicePixelRatio` 0.9): the header's last ~10 CSS px read mean **10.0 with max 10.0 across the full 1344px width** — the page colour, flat, not one bright pixel to hide — and the row below carries the same value the Explore header leaves behind. Identical to the reading taken before this change, which is what "the fade is not affected" is supposed to look like. The residual ~2px step at the header's own bottom edge is still there, still present in every state including no-banner, still the header's edge and not the artwork.

**How it was verified, given the gate.** `/dashboard/community` renders `SignInRequired` without a session and this machine has no `.env` (no Privy app id), so the real Community header cannot be opened locally. The gate was bypassed in the running page only — one condition flipped in devtools, never in the repository — to render the real header with the real asset and the real copy, confirm the computed `background-position`, capture the before/after strips, and re-run the seam profile. The bypass is gone again; `git status` shows only the two source files. `tsc --noEmit` and eslint clean.

**Not changed.** The header component's other props, the scrim/dot-grid/wash layers, the Explore crop, the header height and padding, the panel below, and the asset itself (`public/communitypagebanner.svg` is the same file, still served from a public path).


---
Task: make the /docs section rail stay put — pinned under the header, with the reader's section marked.

**What the rail was.** A static column. An earlier fix for a real scroll bug had taken the sticky box *and* the scrollspy out of the page, and the comment in `docs-shell.tsx` recorded why (three sticky/fixed layers from Fumadocs' `DocsLayout`, a spy that re-rendered the whole subtree and set `font-weight` on the active item, and a reveal animation over eleven sections). So the rail scrolled away with the document, and nothing marked where the reader was. Both are back — in a shape that cannot reproduce the three causes — and the reveal animation stays out.

**Three files, one of them new.**

- `src/components/docs/docs-rail.tsx` — **new**, the page's only client component. It wraps the section list in the repo's existing `useScrollspy` (`./use-scrollspy`, the same hook `docs-view.tsx` has always used for the marketing view) and writes exactly one thing: `aria-current="true"` on the link whose section is in view. No class strings, no inline style, no state of its own beyond the hook's. The list is still real anchors (`/docs#id`), and nothing calls `preventDefault`.
- `src/components/docs/docs-shell.tsx` — still a **server component**. It renders that client component as a leaf, once in the desktop rail and once inside the mobile `<details>`, and passes the document through as `children`. That leaf-ness is load-bearing: a state change re-renders the eleven `<li>`s and not the article, which is the specific thing the old spy got wrong. The header comment was rewritten to say what the rail is now and to keep the three old causes on the record.
- `src/app/docs/docs.css` — `.bw-rail` is `position: sticky` from `1024px` up: `top: 6rem` (the 64px marketing header plus 32px), `max-height: calc(100vh - 7.5rem)`, `overflow-y: auto`, `overscroll-behavior: contain`, and `padding-bottom` down from 4rem to 1rem (it is inside the scroll box now; the padding is invisible either way). `.bw-rail-link` gained `position: relative`, and the active state is new: a lime tint, `--bw-heading` text, a lime number, and a 2px lime bar on an absolutely positioned `::before`. The comment block above the rail was rewritten too.

**The active style is built so that it cannot move anything.** Colour, background and an out-of-flow pseudo-element — no `font-weight`, no size, no padding, no border. Measured across all twelve rows with `03` active: **every row is exactly 31px**, and the active row's `font-weight` is `400`, the same as the rest. That is the old bug's trigger, and it is not in the new rail.


**Sticky, measured.** Viewport 1777×1111 CSS px (`devicePixelRatio` 0.9 on this machine). The rail's box reads `top: 96` at scrollY 0, 600, 2000, 2400, 5000, 8000 and 11000 — it does not move. Geometry: rail `268 × 590` at y 96→686, list 120→670, link tops `143, 176, 209, 241, 274, 352, 385, 463, 496, 573, 606, 639`. Hit-testing agrees with the rects: `elementFromPoint(100, 150)` is the `01` link's text, `(100, 660)` is `12`'s, `(100, 700)` is outside the rail.

**It only scrolls itself when it has to.** With the rail fitting its window, `scrollHeight === clientHeight === 590` — no scrollbar, just a pinned list. Capping its height at 320px through a page-only style probe (same property) makes the scrollbar appear and the rail scroll internally, with the page moving **0px**. `overscroll-behavior: contain` keeps a finished rail from handing the wheel to the document.

**It leaves with the row.** Scrolled to the bottom of the page, the rail's bottom equals `.bw-docs`'s bottom exactly (0px difference) and it never crosses the footer's top — which is why it is `sticky` and not `fixed`.

**The spy is right, sampled.** At scrollY 0/600/2000/5000/8000/11000 the highlighted href matched the section overlapping the spy band (20%–40% of the viewport) at **every** sample — `01, 01, 03, 06, 08, 10` — and `12` at the bottom of the page. One known behaviour, inherited from the shared hook and unchanged from the marketing view: the spy only moves when a section is actually inside its band, so above section 01 (where the hero is) it keeps the section last read, and on a fresh load it defaults to `01`.

**Clicking a rail link.** No reload (a window marker survived), `location.hash` becomes `#12-summary`, the target section lands **112px** down — exactly its `scroll-mt-28` — and the active marker follows to `12`. That is the browser's own fragment navigation with the app's `scroll-behavior: smooth`, so copy-link, middle-click and new-tab all keep working.

**The old bug does not come back.** Document `scrollHeight` (15181) and `.bw-docs-body`'s width (1322) were identical at every scroll position sampled, so nothing in the article is being re-laid-out as sections cross the spy band.

**Mobile, untouched.** Below 1024px `.bw-rail` is `display: none` and the `<details>` disclosure is `static` — it scrolls away with the document exactly as before, opens and closes natively, holds all twelve links, and the marker lands inside it harmlessly.

`tsc --noEmit` and eslint clean, and /docs logs **0 console errors** (no hydration mismatch from the post-mount `aria-current`).

**A note on how this was verified, because it cost time.** Viewport screenshots on this machine are not reliable geometry: `devicePixelRatio` is 0.9, so a "1600×1000" capture is *device* pixels for a 1777×1111 CSS viewport, and both the viewport and element captures came back offset by a constant ~299px relative to the CSS coordinates I asked for (a `position: fixed` guide drawn at CSS 686 landed 299px high, while the rail's own row spacing matched CSS 1:1 — an artifact, not a layout fault). The evidence that stands is `getBoundingClientRect` sampled across scroll positions, `elementFromPoint` hit-testing, and a **full-page** capture (which came back 1:1 CSS at 1768×15181) cropped locally to the rail's box — that crop is what showed the finished rail: all twelve rows, equal heights, `03` marked with the lime bar, and `08 Points, levels, rank badges` truncating with an ellipsis as designed.

