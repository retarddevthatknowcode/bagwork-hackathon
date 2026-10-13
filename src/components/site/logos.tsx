"use client";

import { cn } from "@/lib/utils";
import { PLATFORM_LABELS, normalizePlatform, type Platform } from "@/lib/types";

/** BAGWORK logo mark (yellow "b" lettermark) — supplies the "B" of BAGWORK.
 *  Pairs with the lowercase "agwork" wordmark in header/footer.
 *  Rectangular tight-crop so the b sits flush next to the text (no horizontal dead space). */
export function BagworkLogo({ className }: { className?: string }) {
  return (
    <img
      src="/bagwork-logo.png?v=3"
      alt="BAGWORK"
      className={cn("block shrink-0 h-7 w-auto object-contain", className)}
      draggable={false}
    />
  );
}

/** Circular token badge with symbol letter */
export function TokenLogo({
  symbol,
  color,
  size = 32,
  className,
}: {
  symbol: string;
  color: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold text-black ring-2 ring-white/10",
        className
      )}
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: size * 0.36,
        boxShadow: `0 0 12px ${color}55`,
      }}
    >
      {symbol.slice(0, 3)}
    </span>
  );
}

/** Platform square icon (X, TikTok, IG, YT) */
const platformGlyph: Record<Platform, string> = {
  x: "𝕏",
  tiktok: "♪",
  instagram: "◎",
  youtube: "▷",
};
const platformColor: Record<Platform, string> = {
  x: "#e0dfe3",
  tiktok: "#ff0050",
  instagram: "#e1306c",
  youtube: "#ff0000",
};

export function PlatformIcon({
  platform,
  size = 22,
  className,
}: {
  platform: Platform | string;
  size?: number;
  className?: string;
}) {
  // Tolerates the uppercase keys older rows stored ("X", "TIKTOK"), which rendered as
  // empty tiles because neither map above has an uppercase key.
  const key = normalizePlatform(platform);
  if (!key) return null;
  const color = platformColor[key];
  return (
    <span
      title={PLATFORM_LABELS[key]}
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-white/15 bg-white/5 font-bold",
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.5, color }}
    >
      {platformGlyph[key]}
    </span>
  );
}
