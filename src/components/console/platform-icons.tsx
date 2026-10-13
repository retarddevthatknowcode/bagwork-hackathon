"use client";

import { cn } from "@/lib/utils";
import { normalizePlatform } from "@/lib/types";
import type { Platform } from "@/lib/types";
import { PLATFORM_GLYPHS, PLATFORM_LABEL } from "./platform-glyphs";

/**
 * Canonicalises before lookup. Rows written before the casing fix stored `["X","TIKTOK"]`
 * and the seed script still did until it was updated, and an uppercase key silently
 * missed both the glyph map and the label map — the tiles rendered as empty boxes.
 */
function keyOf(platform: string): string {
  return normalizePlatform(platform) ?? platform.toLowerCase();
}

/** Bare brand glyph, sized by the caller. Decorative (labels are always text). */
export function PlatformIcon({
  platform,
  className,
}: {
  platform: string;
  className?: string;
}) {
  const paths = PLATFORM_GLYPHS[keyOf(platform)];
  if (!paths) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn("size-3.5 shrink-0", className)}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

/** Compact tile row for cards — the accessible name is always announced. */
export function PlatformIconRow({
  platforms,
  className,
  tileClassName,
}: {
  platforms: string[];
  className?: string;
  tileClassName?: string;
}) {
  if (!platforms.length) return null;
  const label = platforms.map((p) => PLATFORM_LABEL[keyOf(p)] ?? p).join(", ");
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {platforms.map((p) => (
        <span
          key={p}
          title={PLATFORM_LABEL[keyOf(p)] ?? p}
          className={cn(
            "inline-flex size-5 items-center justify-center rounded-[6px] border border-border bg-muted/40 text-muted-foreground",
            tileClassName,
          )}
        >
          <PlatformIcon platform={p} className="size-3" />
        </span>
      ))}
      <span className="sr-only">Platforms: {label}</span>
    </span>
  );
}

/** Icon + name chip, used in tables and detail panels. */
export function PlatformChip({
  platform,
  className,
}: {
  platform: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <PlatformIcon platform={platform} />
      {PLATFORM_LABEL[keyOf(platform)] ?? platform}
    </span>
  );
}

/** Display label for a platform value, tolerant of casing. */
export function platformLabel(platform: string): string {
  return PLATFORM_LABEL[keyOf(platform)] ?? platform;
}

export type { Platform };
