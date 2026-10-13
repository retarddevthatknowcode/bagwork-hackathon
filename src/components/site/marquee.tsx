"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface MarqueeProps {
  items: React.ReactNode[];
  className?: string;
  speed?: number; // seconds
  /**
   * Spacing applied to *each item*, rather than a `gap` on the track.
   *
   * This is what makes the loop seamless. The strip is rendered twice and slides by exactly `-50%`,
   * so the second copy has to begin precisely one copy's width after the first. With `gap` the track
   * holds `2n - 1` gaps, half of it is *not* one copy, and the seam lands half a gap out — the strip
   * jumps every lap. Padding inside the item puts the trailing space in the copy's own width, so
   * `-50%` is exact and the join is indistinguishable from the spacing between any two pills.
   */
  itemClassName?: string;
}

export function Marquee({ items, className, speed = 40, itemClassName = "pr-3" }: MarqueeProps) {
  const doubled = [...items, ...items];
  return (
    <div
      className={cn(
        "relative overflow-hidden",
        className
      )}
      style={{
        maskImage:
          "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
        WebkitMaskImage:
          "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
      }}
    >
      <div
        className="flex w-max marquee-track"
        style={{ animationDuration: `${speed}s` }}
      >
        {doubled.map((item, i) => {
          /*
           * The second copy is the same markup, so it is inert: out of the accessibility tree and out
           * of the tab order, which keeps a keyboard user from walking the same pill twice while
           * leaving the pills in the visible copy fully clickable.
           */
          const duplicate = i >= items.length;
          return (
            <div key={i} className={cn("shrink-0", itemClassName)} inert={duplicate}>
              {item}
            </div>
          );
        })}
      </div>
    </div>
  );
}
