"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface GlitchTextProps {
  text: string;
  className?: string;
  as?: "h1" | "h2" | "h3" | "span" | "div";
  animate?: boolean;
}

const SYMBOLS = "!<>-_\\/[]{}—=+*^?#________";

export function GlitchText({
  text,
  className,
  as: Tag = "span",
  animate = true,
}: GlitchTextProps) {
  // CSS-based glitch using ::before/::after via data-text
  if (!animate) {
    return <Tag className={className}>{text}</Tag>;
  }
  const Component = Tag as any;
  return (
    <Component
      className={cn("glitch", className)}
      data-text={text}
      aria-label={text}
    >
      {text}
    </Component>
  );
}

/** Scrambling text effect that resolves to final text on mount */
export function ScrambleText({
  text,
  className,
  duration = 1200,
  as: Tag = "span",
}: {
  text: string;
  className?: string;
  duration?: number;
  as?: "h1" | "h2" | "h3" | "span" | "div";
}) {
  const [display, setDisplay] = React.useState(text);
  const frame = React.useRef<number | null>(null);

  React.useEffect(() => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
    const target = text.split("");
    const reveal = new Array(target.length).fill(false);
    const startTime = performance.now();
    let last = startTime;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const next = target
        .map((ch, i) => {
          if (ch === " ") return " ";
          // reveal from left to right with some randomness
          const revealProb = (progress * target.length - i) * 0.6;
          if (!reveal[i] && Math.random() < revealProb) reveal[i] = true;
          if (reveal[i]) return ch;
          return chars[Math.floor(Math.random() * chars.length)];
        })
        .join("");
      setDisplay(next);
      if (progress < 1 || reveal.some((r) => !r)) {
        frame.current = requestAnimationFrame(tick);
      } else {
        setDisplay(text);
      }
      last = now;
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [text, duration]);

  const Component = Tag as any;
  return <Component className={className}>{display}</Component>;
}
