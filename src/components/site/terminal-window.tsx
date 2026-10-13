"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TerminalWindowProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  glow?: boolean;
  tilt?: boolean;
}

export function TerminalWindow({
  title = "REWARDS_DASHBOARD.EXE",
  glow = true,
  tilt = false,
  className,
  children,
  ...props
}: TerminalWindowProps) {
  return (
    <div
      className={cn(
        "relative rounded-xl border border-white/10 bg-[#111111]/95 backdrop-blur",
        glow && "shadow-[0_0_60px_rgba(189,254,0,0.12),0_30px_60px_-20px_rgba(0,0,0,0.8)]",
        tilt && "float-tilt",
        className
      )}
      {...props}
    >
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#161616] px-4 py-2.5 rounded-t-xl">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <span className="ml-3 text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">
          {title}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-[#bdfe00]/70">
          <span className="h-1.5 w-1.5 rounded-full bg-[#bdfe00] pulse-dot" />
          CONNECTED
        </span>
      </div>
      {/* Body */}
      <div className="relative">{children}</div>
    </div>
  );
}
