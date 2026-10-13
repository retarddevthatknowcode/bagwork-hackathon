"use client";

import * as React from "react";

/**
 * Scrollspy hook — returns the id of the section currently "active".
 *
 * Uses IntersectionObserver with a rootMargin of `-20% 0px -60% 0px` so a
 * section becomes active once its top has scrolled past the top ~20% of the
 * viewport (and is still above the bottom ~60% line). The "best" candidate
 * (the most-visible intersecting section) wins.
 *
 * Returns the active id, or null until the observer has fired at least once.
 */
export function useScrollspy(ids: string[]): string | null {
  const [activeId, setActiveId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (ids.length === 0) return;

    const visible = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.set(entry.target.id, entry.intersectionRatio);
          } else {
            visible.delete(entry.target.id);
          }
        }
        // pick the most-visible id; ties broken by DOM order
        let best: string | null = null;
        let bestRatio = -1;
        for (const id of ids) {
          const r = visible.get(id);
          if (r !== undefined && r > bestRatio) {
            best = id;
            bestRatio = r;
          }
        }
        if (best) setActiveId(best);
      },
      {
        rootMargin: "-20% 0px -60% 0px",
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      }
    );

    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    for (const el of els) observer.observe(el);

    // fallback: if nothing intersected yet (e.g., all sections below the fold
    // except the first), default to the first id
    if (!activeId && els.length > 0) {
      setActiveId(els[0].id);
    }

    return () => observer.disconnect();
  }, [ids.join("|")]);

  return activeId;
}

/**
 * Smooth-scrolls to a section id, accounting for the sticky header.
 * Uses `scrollIntoView` with `behavior: smooth`; the section element itself
 * has `scroll-mt-24` so the heading isn't hidden under the header.
 */
export function scrollToSection(id: string) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id);
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}
