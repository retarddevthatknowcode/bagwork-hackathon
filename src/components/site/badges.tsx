"use client";

import { cn } from "@/lib/utils";

export function LiveBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[#bdfe00]/40 bg-[#bdfe00]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#bdfe00]",
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[#bdfe00] pulse-dot" />
      LIVE
    </span>
  );
}

export function Tag({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: "default" | "neon" | "gold" | "danger";
  className?: string;
}) {
  const variants = {
    default:
      "border-white/15 bg-white/5 text-white/70",
    neon:
      "border-[#bdfe00]/40 bg-[#bdfe00]/10 text-[#bdfe00]",
    gold:
      "border-[#eab308]/40 bg-[#eab308]/10 text-[#eab308]",
    danger:
      "border-red-500/40 bg-red-500/10 text-red-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
