"use client";

import { NPC_AVATARS, findAvatar, AVATAR_SIZE } from "@/lib/profile/avatars";
import { cn } from "@/lib/utils";

/**
 * A Bagworker pixel avatar.
 *
 * Drawn as SVG rects on a 12x12 grid with `shapeRendering="crispEdges"`, so it stays sharp
 * at 16px in the top bar and at 64px on a profile without shipping six image files that
 * could 404. Decorative by design: every place it appears also prints the handle or name,
 * so giving it its own accessible name would just double-announce the same person.
 *
 * This is the *legacy* set. Characters are now built in onboarding (see `character-builder`
 * and `ProfileAvatar`), and this only draws for an account that picked one of these six
 * before the builder existed.
 */
export function NpcAvatar({ id, className }: { id: string | null | undefined; className?: string }) {
  const avatar = findAvatar(id) ?? NPC_AVATARS[0];

  return (
    <svg
      viewBox={`0 0 ${AVATAR_SIZE} ${AVATAR_SIZE}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      className={cn("size-8 shrink-0 rounded-full bg-muted", className)}
    >
      {avatar.grid.flatMap((row, y) =>
        [...row].map((glyph, x) => {
          if (glyph === ".") return null;
          const fill = avatar.colors[glyph as keyof typeof avatar.colors];
          if (!fill) return null;
          return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />;
        }),
      )}
    </svg>
  );
}

