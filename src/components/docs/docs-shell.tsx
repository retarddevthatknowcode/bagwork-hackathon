import { SectionList } from "./docs-rail";

/**
 * The /docs chrome: the section rail, and the document.
 *
 * ## What this is
 *
 * One row: a sticky rail and the document column. The rail pins itself under the marketing header
 * while the reader scrolls the article, marks the section they are in, and leaves with the end of the
 * row. The sticky box is in `docs.css` — one `position: sticky` element, no height on this page
 * derived from a variable a script writes.
 *
 * The rail is the only part of this page that runs any JavaScript, and it is one component:
 * `./docs-rail.tsx`. This file stays a **server component** — no state, no effects, no handlers, no
 * `"use client"` — and renders that client component as a leaf.
 *
 * `children` is the document, rendered by the page and passed straight through. That is what keeps
 * the spy cheap: React re-renders the subtree that owns the state, and the article is not in it.
 *
 * Below `lg` the rail is replaced by a native `<details>` disclosure holding the same list: nothing
 * positioned, so it cannot interfere with scrolling, and no JavaScript beyond the list itself.
 *
 * The desktop geometry is unchanged — the rail is 268px and the column is centred in the rest of the
 * row, which is exactly where `DocsLayout`'s grid had it.
 *
 * ## Why the shape is what it is: the bug this page already had
 *
 * This file used to render `DocsLayout` from `fumadocs-ui/layouts/docs`, a `RootProvider`, a
 * `useScrollspy`-driven active section and a section reveal animation. The rail and the spy were then
 * taken out of the page entirely, because between them they moved the page under the pointer while
 * the reader scrolled. The three causes are worth keeping written down, because the rail is back and
 * two of them are still out on purpose:
 *
 *   - **Three sticky/fixed layers from the layout.** `DocsLayout` wrapped the rail in
 *     `sticky top-(--fd-docs-row-1) [grid-area:sidebar] h-[calc(var(--fd-docs-height)-var(--fd-docs-row-1))]`,
 *     rendered a **zero-height** `#nd-subnav` sticky header pinned at the same 64px, and a 36px
 *     `position: fixed` collapse trigger — on a page that already has a `sticky top-0` marketing
 *     header, with every top and height derived from `--fd-docs-*` and recomputed on each scroll.
 *     **Still out.** There is one sticky box here, it is plain CSS, and no height on this page is
 *     derived from a variable a script writes.
 *   - **A spy that re-rendered the subtree and changed a box metric.** The observer fed React state,
 *     so every section boundary re-rendered the whole docs subtree *and* repainted a nav item whose
 *     active style set `font-weight` — a text reflow, inside a sticky column, once per crossing.
 *     **Back, in a shape that cannot do that**: the spy is a leaf (`docs-rail.tsx`), so a state change
 *     re-renders eleven `<li>`s and not the article; and the active style is colour, background and an
 *     absolutely positioned 2px bar, so no part of it is a metric.
 *   - **The reveal animation.** A second IntersectionObserver writing inline `transform`/`opacity`
 *     onto every section below the fold — eleven large composited layers, re-laid-out as they came
 *     into view. **Still out.**
 */

/**
 * The rail, the document, and nothing else.
 *
 * `children` is the page — a server component — so the document still ships as HTML, and the sticky
 * box the rail lives in is `docs.css`'s `.bw-rail` (see the `lg` media query there).
 */
export function DocsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bw-docs">
      {/* Desktop: the sticky box, pinned under the header by `docs.css`. The list inside it is the
          page's one client component, and the only thing it writes is `aria-current`. */}
      <nav aria-label="Document sections" className="bw-rail">
        <SectionList />
      </nav>

      {/* Below `lg`: the same list, as a native disclosure. */}
      <details className="bw-rail-compact">
        <summary>Document sections</summary>
        <nav aria-label="Document sections">
          <SectionList />
        </nav>
      </details>

      {/* `.bw-docs-body` carries the horizontal padding and `.bw-docs-col` the measure, which keeps
          the reading column at the same 768px it had inside Fumadocs' grid — padding on the column
          itself would have eaten into the measure. */}
      <div className="bw-docs-body">
        <div className="bw-docs-col">{children}</div>
      </div>
    </div>
  );
}
