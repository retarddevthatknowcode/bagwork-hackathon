"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

import { AnimatedCounter } from "@/components/bagwork/animated-counter";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { EASE, StaggerItem } from "./docs-motion";

/**
 * Card set for the docs page, composed from the shadcn registry primitives
 * (Card → CardContent, per https://ui.shadcn.com/docs/components/card) and
 * re-skinned through the tokens in globals.css. Motion hooks come from
 * `docs-motion` so every card reveals on the same rhythm.
 *
 * Contrast note: body copy sits at `text-foreground/65` or higher so every text
 * node clears WCAG AA (4.5:1) on the `#0b0a07` docs background.
 */

const ACCENT = {
  yellow: { fg: "#ffe70e", soft: "bg-[#ffe70e]/[0.08]", line: "border-[#ffe70e]/25" },
  lime: { fg: "#bdfe00", soft: "bg-[#bdfe00]/[0.08]", line: "border-[#bdfe00]/25" },
} as const;

export type Accent = keyof typeof ACCENT;

/** Lifts 2px on hover — transform only, so it stays on the compositor. */
function HoverLift({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18, ease: EASE }}
      className={cn("h-full", className)}
    >
      {children}
    </motion.div>
  );
}

/** Headline metric used in the hero band. */
export function StatTile({
  icon: Icon,
  label,
  value,
  countTo,
  suffix,
  prefix,
  accent = "yellow",
  className,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  countTo?: number;
  suffix?: string;
  prefix?: string;
  accent?: Accent;
  className?: string;
}) {
  const tone = ACCENT[accent];
  return (
    <StaggerItem className={cn("h-full", className)}>
      <HoverLift>
        <Card className="h-full gap-0 border-border/70 bg-card/70 py-0 transition-colors duration-200 hover:border-border hover:bg-card">
          <CardContent className="flex h-full flex-col gap-3 p-4 sm:p-5">
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-lg border",
                tone.line,
                tone.soft,
              )}
              style={{ color: tone.fg }}
            >
              <Icon aria-hidden="true" className="size-4" />
            </span>
            <span className="docs-mono text-2xl font-bold leading-none tracking-tight text-foreground tabular-nums sm:text-[28px]">
              {countTo !== undefined ? (
                <AnimatedCounter
                  value={countTo}
                  prefix={prefix}
                  suffix={suffix}
                  duration={900}
                />
              ) : (
                value
              )}
            </span>
            <span className="text-[11px] leading-snug text-foreground/55">
              {label}
            </span>
          </CardContent>
        </Card>
      </HoverLift>
    </StaggerItem>
  );
}

/** Compact labelled card — used for the fee split (treasury vs burn). */
export function FactCard({
  icon: Icon,
  title,
  body,
  accent = "lime",
  className,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  accent?: Accent;
  className?: string;
}) {
  const tone = ACCENT[accent];
  return (
    <StaggerItem className={cn("h-full", className)}>
      <HoverLift>
        <Card className="h-full gap-0 border-border/70 bg-card/70 py-0 transition-colors duration-200 hover:bg-card">
          <CardContent className="flex h-full flex-col gap-3 p-4">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                  tone.line,
                  tone.soft,
                )}
                style={{ color: tone.fg }}
              >
                <Icon aria-hidden="true" className="size-4" />
              </span>
              <span
                className="docs-mono text-[11px] font-bold uppercase tracking-wider"
                style={{ color: tone.fg }}
              >
                {title}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-foreground/65">{body}</p>
          </CardContent>
        </Card>
      </HoverLift>
    </StaggerItem>
  );
}

/** One card per audience the document addresses (sections 06–08). */
export function AudienceCard({
  n,
  id,
  title,
  body,
  icon: Icon,
  accent = "lime",
}: {
  n: string;
  id: string;
  title: string;
  body: string;
  icon: LucideIcon;
  accent?: Accent;
}) {
  const tone = ACCENT[accent];
  return (
    <StaggerItem className="h-full">
      <HoverLift>
        <Card
          id={id}
          className="h-full scroll-mt-24 gap-0 border-border/70 bg-card/70 py-0 transition-colors duration-200 hover:border-border hover:bg-card"
        >
          <CardContent className="flex h-full flex-col gap-3 p-5">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg border",
                  tone.line,
                  tone.soft,
                )}
                style={{ color: tone.fg }}
              >
                <Icon aria-hidden="true" className="size-4.5" />
              </span>
              <span
                className="docs-mono text-[11px] font-bold tabular-nums tracking-widest"
                style={{ color: tone.fg }}
              >
                {n}
              </span>
            </div>
            <h3 className="docs-mono text-sm font-bold leading-snug tracking-tight text-foreground">
              {title}
            </h3>
            <p className="text-xs leading-relaxed text-foreground/65">{body}</p>
          </CardContent>
        </Card>
      </HoverLift>
    </StaggerItem>
  );
}
