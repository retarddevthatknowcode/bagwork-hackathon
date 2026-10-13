"use client";

import * as React from "react";
import { useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  format?: (n: number) => string;
}

export function AnimatedCounter({
  value,
  duration = 1400,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
  format,
}: AnimatedCounterProps) {
  /*
   * Starts at the final value, never at zero.
   *
   * The count-up is decoration, and decoration must not decide what the number says. This used to
   * start at `0` and wait for an IntersectionObserver; when that observer did not fire — which on
   * the docs page is the *normal* case, because those tiles sit in the hero strip and are already
   * on screen before hydration completes — it simply stayed at zero. The page therefore advertised
   * a "0% platform fee" and "0 sections in this document".
   *
   * Starting at the answer means the worst case is a figure that does not animate, rather than a
   * figure that is wrong. The number is right in the server HTML, right before hydration, right
   * under reduced motion, and right if the observer never fires.
   */
  const [n, setN] = React.useState(value);
  const [popKey, setPopKey] = React.useState(0);
  const ref = React.useRef<HTMLSpanElement>(null);
  const started = React.useRef(false);
  const prevValue = React.useRef(value);
  const rafRef = React.useRef<number | null>(null);
  const reduce = useReducedMotion();

  // animate from `from` to `target`
  const animateTo = React.useCallback(
    (target: number, from: number) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setN(from + (target - from) * eased);
        if (p < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setN(target);
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [duration]
  );

  /*
   * Drop to zero before the first paint after hydration, so the count-up still reads as one — but
   * only when motion is allowed. `useLayoutEffect` rather than `useEffect` is what keeps this
   * invisible: it runs before the browser paints, so the final figure is never shown and then
   * snatched away.
   */
  React.useLayoutEffect(() => {
    if (reduce) return;
    setN(0);
  }, [reduce]);

  // initial mount animation when scrolled into view
  React.useEffect(() => {
    // Reduced motion: the figure stays exactly as rendered, at its final value.
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !started.current) {
            started.current = true;
            animateTo(value, 0);
            prevValue.current = value;
          }
        });
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, animateTo]);

  // re-animate + pop when value changes after first render
  React.useEffect(() => {
    if (reduce || !started.current) return;
    if (value !== prevValue.current) {
      animateTo(value, prevValue.current);
      prevValue.current = value;
      setPopKey((k) => k + 1); // remount inner span → replay count-pop
    }
  }, [value, animateTo]);

  const display = format
    ? format(n)
    : `${prefix}${n.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}${suffix}`;

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      <span key={popKey} className={popKey > 0 ? "count-pop" : undefined}>
        {display}
      </span>
    </span>
  );
}
