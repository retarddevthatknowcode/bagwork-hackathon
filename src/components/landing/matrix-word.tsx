"use client";

import * as React from "react";
import { useReducedMotion } from "framer-motion";

/**
 * A phrase that rewrites itself, character by character.
 *
 * One place uses it now: the hero headline's last word, cycling through `MATRIX_WORDS`. The header
 * wordmark used to share this machine and no longer does — it overwrites itself character by
 * character instead of scrambling through noise frames, which is a different effect on a different
 * clock (`site/header-wordmark.tsx`).
 *
 * Behaviour: hold a phrase for two seconds, then burn through a handful of frames of random
 * glyphs and land on the next one, forever, in order. The hero's two lines above the word are
 * static text; this is the only moving part of that heading.
 *
 * Three decisions worth knowing about:
 *
 *   - **The frame is always the same width as the phrase it resolves into.** Space Mono is
 *     monospace (see `--font-sans` in `globals.css`), so a frame of the same *length* is
 *     the same *width*: the burst cannot jitter sideways, and the line only changes width
 *     when a phrase of a different length settles. The hero's longest entry is "UGC creators?"
 *     at 13 characters, still shorter than its longest fixed line ("when you can pay", 16) — so
 *     no rotating word can ever be the line that overflows that clamp.
 *
 *   - **Nothing is animated with a transition.** Each frame is a text replacement, so this
 *     costs one small re-render per frame — roughly three a second — and no compositor work
 *     at all. There is no fade, no blur and no transform to keep on the GPU.
 *
 *   - **Reduced motion turns the whole thing off** (see the effect). No flicker, no rotation:
 *     the phrase simply reads its first entry — "bagworkers?", the word the heading rests on.
 *     An endlessly re-scrambling phrase is precisely the motion the setting asks us to drop,
 *     and the phrase is content, so it stays on screen.
 */

/** The cycle, in the brief's order — it ends on the longest entry, not the shortest. */
export const MATRIX_WORDS = [
  "bagworkers?",
  "hustlers?",
  "shillers?",
  "kols?",
  "UGC creators?",
] as const;

/** Hold each word for the brief's 2s, of which the final ~270ms is the flicker. */
const HOLD_MS = 2000;

/** One frame. 45ms reads as a sharp stutter; much slower starts to look like a fade. */
const FRAME_MS = 45;

/** Frames of noise per word change — long enough to read as chaos, short enough to be a burst. */
const FRAMES = 6;

/**
 * Matrix noise: caps, digits and symbols. Deliberately nothing from the words themselves, so
 * a frame can never be mistaken for a half-settled word, and all ASCII, so the monospace
 * metric is identical to the letters it is standing in for.
 */
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@$?!*";

/**
 * One frame of the flicker: everything before `resolved` is already the real word, the rest is
 * noise. Resolving left to right over a handful of frames is what reads as a matrix *settle*
 * rather than a slot machine, and it guarantees the last frame is the word itself.
 */
function noiseFrame(target: string, resolved: number): string {
  return Array.from(target, (char, index) =>
    index < resolved ? char : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
  ).join("");
}

export function MatrixWord({
  words = MATRIX_WORDS,
  className,
  holdMs = HOLD_MS,
}: {
  /**
   * The phrases to cycle. Pass a module-level constant: the effect depends on this array, so an
   * inline literal would re-seed the whole cycle on every render.
   */
  words?: readonly string[];
  className?: string;
  /** How long each phrase holds. Defaults to the hero's 2s. */
  holdMs?: number;
}) {
  const reduce = useReducedMotion();

  /*
   * The first word is the initial state on purpose: it is rendered on the server and again on
   * the client's first pass, so the two agree. Everything below only ever runs after mount —
   * branching the *rendered* value on `useReducedMotion()` is a hydration mismatch, because
   * that hook answers differently on the server and the client.
   */
  const [text, setText] = React.useState<string>(words[0]);

  React.useEffect(() => {
    if (reduce) return;

    let index = 0;
    let frames: number[] = [];

    const advance = () => {
      // The previous burst has already fired; clearing it just keeps this array at FRAMES.
      frames.forEach((timer) => window.clearTimeout(timer));
      frames = [];

      index = (index + 1) % words.length;
      const next: string = words[index];

      for (let frame = 0; frame < FRAMES; frame++) {
        const resolved = Math.floor((frame / FRAMES) * next.length);
        frames.push(window.setTimeout(() => setText(noiseFrame(next, resolved)), frame * FRAME_MS));
      }

      // The settle. Separate from the loop above so the word is set exactly once, on an exact
      // string, rather than as the last noise frame that happens to be fully resolved.
      frames.push(window.setTimeout(() => setText(next), FRAMES * FRAME_MS));
    };

    const cycle = window.setInterval(advance, holdMs);

    return () => {
      window.clearInterval(cycle);
      frames.forEach((timer) => window.clearTimeout(timer));
    };
  }, [reduce, words, holdMs]);

  /*
   * `aria-hidden`: the heading carries the stable name (the `h1`'s `aria-label`), so a word
   * that rewrites itself every two seconds must not be announced over and over. It would be —
   * a live region is not the only thing a screen reader reads.
   */
  return (
    <span aria-hidden="true" className={className}>
      {text}
    </span>
  );
}
