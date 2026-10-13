"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "solid" | "outline" | "ghost" | "gold";
type Size = "sm" | "md" | "lg" | "xl";

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[11px]",
  md: "h-10 px-5 text-xs",
  lg: "h-12 px-7 text-[13px]",
  xl: "h-14 px-9 text-sm",
};

export interface NeonButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  arrow?: boolean;
}

export const NeonButton = React.forwardRef<
  HTMLButtonElement,
  NeonButtonProps
>(
  (
    { className, variant = "solid", size = "md", arrow, children, ...props },
    ref
  ) => {
    const base =
      "btn-3d relative inline-flex items-center justify-center gap-2 font-bold uppercase tracking-wider rounded-xl disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap select-none";
    /**
     * Each variant is a surface from `globals.css` (`.btn-surface-*`), not a set of utility
     * classes: every one of them is a gradient with an inset rim and two shadows plus its own
     * `:hover` / `:active` / `:focus-visible`, and the same five paints are used by the shadcn
     * `Button` so the console and the site cannot drift apart. Geometry stays in `base`, which
     * is why no button changed size or position when the surfaces were applied.
     */
    const variants: Record<Variant, string> = {
      solid: "btn-surface-solid",
      outline: "btn-surface-outline",
      ghost: "btn-surface-ghost",
      gold: "btn-surface-gold",
    };
    return (
      <button
        ref={ref}
        className={cn(base, sizes[size], variants[variant], className)}
        {...props}
      >
        <span className="relative z-10 flex items-center gap-2">
          {children}
          {arrow && <span className="text-[1.1em] leading-none">→</span>}
        </span>
      </button>
    );
  }
);
NeonButton.displayName = "NeonButton";
