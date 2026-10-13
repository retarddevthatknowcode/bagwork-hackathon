import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Bloom Orb — the pure-CSS sphere, as a component.
 *
 * No `"use client"` on purpose. There is nothing here but markup and one style attribute, so the
 * footer — a server component — renders it without a client boundary being dragged across it, and
 * the landing page, which is a client tree, inlines it exactly as it would any other module. A
 * directive here would have made this the one reason the footer shipped JavaScript.
 *
 * The CSS lives in `globals.css` (`.orb-slot` / `.orb` / `.orb-shadow`) because it is a single
 * chunk of `@property` + gradients + keyframes that reads once and is not worth splitting into a
 * CSS module per consumer. This wrapper only does what a class cannot: sets `--orb-size` and
 * `--orb-speed`, and decides whether the sphere is decoration or content.
 *
 * The elements are `span`s, not the reference snippet's `div`s. Both are `display: flex` / `display:
 * grid` from the CSS below, so nothing renders differently — but a `div` is not valid phrasing
 * content, and React refuses to hydrate one inside the hero's `<p>` pill or the step card's
 * `<button>` (it warns and regenerates the whole tree: "In HTML, <div> cannot be a descendant of
 * <p>"). Spans can sit anywhere this component is used, and the shadow — which is a `div` in the
 * reference and relies on the default block box — carries an explicit `display: block` there
 * instead.
 *
 * `decorative` (the default) is the honest setting everywhere it is used here. The orb sits beside
 * a step's number and title, which already say everything the sphere could; an `aria-label` on each
 * one would have a screen reader announce "Glowing orb" four times down the list. Set
 * `decorative={false}` to get the reference element's own `role="img"` + label back, for anywhere
 * the orb stands alone and *is* the content.
 *
 * `shadow` adds the reference element's contact shadow, which only makes sense when the orb is
 * large enough for a floor to read. The step markers leave it off.
 */
export function BloomOrb({
  size = 32,
  speed = 20,
  decorative = true,
  shadow = false,
  label = "Glowing orb",
  className,
  style,
}: {
  /** Diameter in px. Everything inside the orb is em-based, so this is the only number needed. */
  size?: number;
  /** Seconds for one full gradient drift. Shorter reads as more energetic. */
  speed?: number;
  /** True (default) inlines `aria-hidden`; false renders `role="img"` + `label`. */
  decorative?: boolean;
  /** The reference element's breathing floor shadow. Off by default. */
  shadow?: boolean;
  /** Only used when `decorative` is false. */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={cn("orb-slot", className)}
      style={
        {
          "--orb-size": `${size}px`,
          "--orb-speed": `${speed}s`,
          ...style,
        } as React.CSSProperties
      }
    >
      {decorative ? (
        <span className="orb" aria-hidden="true" />
      ) : (
        <span className="orb" role="img" aria-label={label} />
      )}
      {shadow && <span className="orb-shadow" aria-hidden="true" />}
    </span>
  );
}
