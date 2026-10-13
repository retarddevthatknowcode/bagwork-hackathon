"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number; // 0-100
  className?: string;
  showLabel?: boolean;
  height?: string;
  animated?: boolean;
  leftLabel?: string;
  rightLabel?: string;
}

export function ProgressBar({
  value,
  className,
  showLabel = true,
  height = "h-2",
  animated = true,
  leftLabel = "FUNDED",
  rightLabel,
}: ProgressBarProps) {
  const v = Math.max(0, Math.min(100, value));
  const [w, setW] = React.useState(animated ? 0 : v);
  React.useEffect(() => {
    if (!animated) return setW(v);
    const t = setTimeout(() => setW(v), 80);
    return () => clearTimeout(t);
  }, [v, animated]);
  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-full bg-white/10",
          height
        )}
      >
        <div
          className="relative h-full rounded-full bg-[#bdfe00] transition-[width] duration-700 ease-out"
          style={{
            width: `${w}%`,
            boxShadow: "0 0 12px rgba(189,254,0,0.6)",
          }}
        >
          <div className="absolute inset-0 shine-sweep rounded-full" />
        </div>
      </div>
      {showLabel && (
        <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-white/40">
          <span>{leftLabel}</span>
          <span className="text-[#bdfe00]">{rightLabel ?? `${v.toFixed(0)}%`}</span>
        </div>
      )}
    </div>
  );
}
