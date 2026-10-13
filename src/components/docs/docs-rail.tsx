"use client";

import { DOC_GROUPS, DOC_SECTIONS } from "./docs-nav";
import { useScrollspy } from "./use-scrollspy";

/**
 * The docs' section list, with the section the reader is in marked.
 *
 * ## Why this is the one client component in the chrome
 *
 * The rail has to know which section is on screen, and that is scroll-driven state — there is no
 * CSS-only way to ask "which of these twelve anchors is in view". So this file is `"use client"`,
 * and it is the *only* thing on /docs that ships JavaScript for its chrome. `docs-shell.tsx` stays a
 * server component and renders this as a leaf inside the rail; the document is passed to the shell
 * as `children` and is never re-rendered by anything in here.
 *
 * That separation is the whole safety argument, and it is worth being explicit about. A React state
 * change re-renders the subtree that owns the state — this list — and nothing else. The article, the
 * diagrams, the tables and the reveal animations are outside that subtree, so a section boundary
 * cannot re-render, re-measure or repaint the document. The rail repaints eleven `<li>`s and stops.
 *
 * ## The active state is written to `aria-current`, and styled in CSS
 *
 * One attribute, no class strings, no inline style: `aria-current="true"` on the link that is in
 * view. Everything visual about it lives in `docs.css`, which is also where the reason is recorded —
 * the highlight is colour, background and an absolutely positioned 2px bar, and **not one box
 * metric changes**. That is the specific thing the previous rail got wrong: it went `font-semibold`
 * when active, which rewrapped the label, resized the row and moved the page under the pointer once
 * per section boundary. `aria-current` is also what a screen reader announces, so the styling and
 * the accessibility tree are driven by the same attribute rather than two parallel states.
 *
 * ## The spy itself is the repo's existing one
 *
 * `useScrollspy` from `./use-scrollspy` — the same hook the marketing `/docs` view in
 * `docs-view.tsx` has used since it was written. It is an IntersectionObserver over the section ids
 * with a `-20% 0px -60% 0px` band, and it reports the most-visible section in that band. Reusing it
 * means the two docs surfaces cannot disagree about what "in view" means, and there is one place to
 * fix if that band ever needs tuning.
 *
 * `SECTION_IDS` is module-level on purpose: the hook keys its effect on the ids, and a fresh array
 * on every render would re-subscribe the observer each time.
 *
 * ## Why the same list is rendered twice
 *
 * The desktop rail and the mobile `<details>` disclosure need different containers and only one of
 * them is ever displayed (`display: none` keeps the other out of the accessibility tree, so the
 * duplicate is not a duplicate to a screen reader). The highlight is harmless in the disclosure —
 * it is simply invisible while the disclosure is closed, and correct when it is open.
 *
 * The number is decoration: it is the section's printed number, and the title is the link text. The
 * title truncates rather than wrapping, which is what keeps every row the same height — a rail whose
 * rows change height as you move through them would move the page under the pointer.
 *
 * The links stay **real anchors** (`/docs#id`). Nothing here calls `preventDefault`, so the browser
 * performs the fragment navigation, `scroll-margin` on the section is honoured, the URL keeps the
 * section address, and right-click/copy/middle-click keep working. `globals.css` sets
 * `scroll-behavior: smooth` for the whole app and `docs.css` restates it for this route, so
 * following a link here is the smooth scroll — and the spy marks the target as the reader arrives.
 */
const SECTION_IDS = DOC_SECTIONS.map((section) => section.id);

export function SectionList() {
  const activeId = useScrollspy(SECTION_IDS);

  return (
    <ul className="bw-rail-list">
      {DOC_GROUPS.map((group) => (
        <li key={group}>
          <p className="bw-rail-label">{group}</p>
          <ul>
            {DOC_SECTIONS.filter((section) => section.group === group).map((section) => (
              <li key={section.id}>
                <a
                  className="bw-rail-link"
                  href={`/docs#${section.id}`}
                  aria-current={section.id === activeId ? "true" : undefined}
                >
                  <span aria-hidden="true" className="bw-rail-num">
                    {section.n}
                  </span>
                  <span className="bw-rail-text">{section.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
