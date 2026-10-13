"use client";

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  type Variants,
} from "framer-motion";
import { ArrowUp } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Motion primitives for the docs surface.
 *
 * Scroll-linked + spring patterns follow the Motion docs
 * (`whileInView` with `viewport={{ once: true }}`, `useSpring` over a
 * `MotionValue`): https://motion.dev/docs/react-scroll-animations
 *
 * Constraints from the UI animation skill:
 *   - only `opacity` / `transform` animate (never width/height/top/box-shadow)
 *   - reveals 300–450ms, stagger 40–80ms, custom ease — never linear/default
 *   - `prefers-reduced-motion` removes offsets and spring physics
 */
export const EASE = [0.22, 0.61, 0.36, 0.98] as const;

export const staggerParent: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.38, ease: EASE },
  },
};

/** Fade + rise, once, when the element scrolls into view. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 16,
  amount = 0.2,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  amount?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.42, ease: EASE, delay: reduce ? 0 : delay }}
    >
      {children}
    </motion.div>
  );
}

/** Parent that staggers its `StaggerItem` children as it enters view. */
export function Stagger({
  children,
  className,
  step = 0.06,
  delay = 0.04,
  amount = 0.15,
}: {
  children: React.ReactNode;
  className?: string;
  step?: number;
  delay?: number;
  amount?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: reduce ? 0 : step,
            delayChildren: reduce ? 0 : delay,
          },
        },
      }}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={staggerChild} className={className}>
      {children}
    </motion.div>
  );
}

/**
 * Scroll-linked reading progress across the docs container.
 *
 * Deliberately not `useScroll({ target })`: framer resolves that call's
 * `container` to `document.scrollingElement` (`<html>`), which is
 * `position: static`, so it emits its dev warning on every page that uses it
 * and derives offsets from the scrolling element rather than our container.
 * Measuring the container directly is quieter and exact, and the value is still
 * spring-smoothed (the documented `useSpring` pattern) so fast flicks don't snap.
 */
export function ReadingProgress({
  targetRef,
  className,
}: {
  targetRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const raw = useMotionValue(0);
  const smooth = useSpring(raw, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });

  React.useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    let frame = 0;

    const compute = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      const passed = -rect.top;
      raw.set(scrollable > 0 ? Math.min(1, Math.max(0, passed / scrollable)) : 0);
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [raw, targetRef]);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-x-0 top-16 z-40 h-px",
        className,
      )}
    >
      <motion.div
        className="h-px origin-left bg-gradient-to-r from-[#ffe70e] to-[#bdfe00]"
        style={{ scaleX: reduce ? raw : smooth }}
      />
    </div>
  );
}

/**
 * Back-to-top affordance.
 *
 * Rendered inside the docs column with `position: sticky` rather than `fixed`.
 * A fixed button floats over whatever is at the bottom of the viewport — when
 * measured, it was sitting on top of the site footer and blocking one of its
 * social icons. Sticky is confined to its containing block, so the button rides
 * the viewport while the docs section is on screen and then stops at the end of
 * the section instead of drifting into the footer.
 */
export function ScrollToTop({
  threshold = 700,
  label = "Back to top",
}: {
  threshold?: number;
  label?: string;
}) {
  const [visible, setVisible] = React.useState(false);
  const reduce = useReducedMotion();

  React.useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return (
    /* h-11 keeps the flow height constant whether or not the button is shown,
       so toggling it can never shift the page; mb-6 keeps it clear of the
       footer below. */
    <div className="pointer-events-none sticky bottom-6 z-30 mb-6 flex h-11 justify-end">
      <AnimatePresence>
        {visible ? (
          <motion.button
            type="button"
            aria-label={label}
            onClick={() =>
              window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" })
            }
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 8 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="pointer-events-auto flex size-11 items-center justify-center rounded-full border border-border bg-card/90 text-foreground/60 shadow-lg backdrop-blur transition-colors hover:border-[#ffe70e]/40 hover:text-[#ffe70e] focus-visible:ring-[3px] focus-visible:ring-[#ffe70e]/40 focus-visible:outline-none"
          >
            <ArrowUp aria-hidden="true" className="size-4" />
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
