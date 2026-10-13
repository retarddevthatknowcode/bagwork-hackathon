import Image from "next/image";

/**
 * The header logo: the brand mark and the wordmark, fixed.
 *
 * This is the console header's lockup, brought to the marketing header: the same artwork file
 * (`/bagwork-logo.png`, the yellow "b") at the same height, "BAGWORK" in the same display face,
 * and a subtext beneath it in the same style the console gives its own "creator console" line.
 * `.brand-wordmark` carries the three values `.console .title-display` declares for the dashboard's
 * own wordmark (Syne, -0.02em, weight 600); it exists as a class rather than as a reused one
 * because `.title-display` is scoped to `.console`, and unscoping it would leak its gradient
 * text-fill onto every wordmark outside the console.
 *
 * Nothing here moves and nothing here changes. That is the point: the header is the one piece of
 * chrome on every page, and it should look identical on every visit.
 *
 * Two things were removed to get here, and each had a cost worth naming:
 *
 * - **The tile.** The mark used to sit in a square `rounded-[9px]` box with a `border-[#bdfe00]/30`
 *   hairline. It framed a mark that does not need framing next to its own name, and it is the
 *   difference between "logo" and "logo in a box".
 * - **`HeaderWordmark`.** The machine that rewrote the word in place every few seconds — erasing
 *   `BAGWORK-` to nothing, holding a clear beat, then typing `MAKING BAGWORKING GREAT AGAIN` back
 *   in. It cost more than the animation: the block had to reserve 29 characters so the nav beside
 *   it never shuffled, and that reservation is why the nav had to wait for `xl` to fit in the row
 *   at all. Seven fixed characters need no reservation.
 *
 * The link still carries the accessible name, because the mark's `alt` is empty — it is decoration
 * standing beside a word that already says what it is.
 */
export function BrandLogo() {
  return (
    <a
      href="/"
      aria-label="Bagwork — home"
      className="group -ml-1 flex shrink-0 items-center gap-2 rounded-xl px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bdfe00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0a07]"
    >
      <Image
        src="/bagwork-logo.png"
        alt=""
        width={191}
        height={256}
        priority
        draggable={false}
        className="h-6 w-auto shrink-0"
      />
      {/* The two-line lockup, with the same wrapper the console sidebar uses for its own. The
          subtext is the console's subtitle classes verbatim — 10px, uppercase, +0.14em tracking,
          `text-muted-foreground` — so the two headers are one treatment resolved in two scopes;
          that token is white/50 here and #bdb29a inside `.console`, which is the only difference. */}
      <span className="grid min-w-0 text-left leading-tight">
        <span className="brand-wordmark text-sm text-white transition-colors duration-200 group-hover:text-[#bdfe00]">
          BAGWORK
        </span>
        <span className="truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          content marketplace
        </span>
      </span>
    </a>
  );
}
