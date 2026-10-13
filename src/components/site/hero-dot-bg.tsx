"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Water-like animated dot background for the hero section.
 *
 * Multi-layered sine waves with different frequencies/directions → organic,
 * unsymmetrical, fluid motion (like water moving in a container). Soft yellow
 * dots on a transparent canvas; the hero's dark grey shows through.
 *
 * Performance: dots are bucketed by alpha (16 levels) and each bucket is drawn
 * with a single batched path + fill call (~16 fills/frame instead of thousands).
 * DPR is capped at 1.5 and near-invisible dots are skipped. Targets 60fps.
 */
export function HeroDotBackground({ className }: { className?: string }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // --- config (per the spec) ---
    const GAP = 8; // dot gap ~8px
    const DOT = 2; // dot size 1.8–2.2px → 2px
    const MAX_ALPHA = 0.45; // max opacity 0.35–0.5
    const RGB = "255, 231, 14"; // #ffe70e soft yellow (brand logo yellow)
    const BUCKETS = 16; // alpha quantization for batched fills
    const SKIP = 0.02; // skip near-invisible dots
    // sum of wave amplitudes = 0.55+0.45+0.4+0.35+0.3+0.2 = 2.25 → range ±2.25
    const WAVE_AMP = 2.25;

    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas!.getBoundingClientRect();
      width = Math.max(0, rect.width);
      height = Math.max(0, rect.height);
      // cap dpr at 1.5 — dots are tiny, retina sharpness isn't worth the fill cost
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // reusable per-frame buckets (avoid GC churn)
    const bx: number[][] = Array.from({ length: BUCKETS }, () => []);
    const by: number[][] = Array.from({ length: BUCKETS }, () => []);
    const bn: number[] = new Array(BUCKETS).fill(0);

    let raf = 0;
    const start = performance.now();

    const frame = (now: number) => {
      const time = (now - start) / 1000; // seconds
      ctx!.clearRect(0, 0, width, height);

      const cols = Math.floor(width / GAP) + 1;
      const rows = Math.floor(height / GAP) + 1;

      // reset buckets
      for (let b = 0; b < BUCKETS; b++) {
        bx[b].length = 0;
        by[b].length = 0;
        bn[b] = 0;
      }

      for (let j = 0; j < rows; j++) {
        const y = j * GAP;
        for (let i = 0; i < cols; i++) {
          const x = i * GAP;

          // === multi-layered sine waves — spatial frequencies ÷3 from previous (3x bigger patterns) ===
          // time multipliers + amplitudes unchanged → same speed & contrast, 3x broader/longer blobs
          let wave = 0;
          wave += Math.sin(x * 0.015 + time * 1.6) * 0.55;
          wave += Math.sin(y * 0.0217 + time * 1.2) * 0.45;
          wave += Math.sin((x * 0.6 + y * 1.4) * 0.0117 + time * 1.4) * 0.4;
          wave += Math.sin((x * 1.3 - y * 0.5) * 0.0133 + time * 1.8) * 0.35;
          wave += Math.sin((x + y * 0.7) * 0.0083 + time * 1.0) * 0.3;
          wave += Math.sin((x * 2.1 + y * 0.9) * 0.0067 + time * 2.1) * 0.2;

          // normalize wave (range ±2.25) → [0,1]
          const norm = (wave + WAVE_AMP) / (2 * WAVE_AMP);
          // soft falloff — low values stay darker (organic water depth, not flat)
          const alpha = Math.pow(norm, 1.6) * MAX_ALPHA;
          if (alpha < SKIP) continue;

          // bucket the dot by alpha for batched fill
          let b = (alpha / MAX_ALPHA * BUCKETS) | 0;
          if (b >= BUCKETS) b = BUCKETS - 1;
          bx[b].push(x);
          by[b].push(y);
          bn[b]++;
        }
      }

      // draw each bucket with ONE fill call (batched rects)
      const half = DOT / 2;
      for (let b = 0; b < BUCKETS; b++) {
        if (bn[b] === 0) continue;
        const a = (b + 0.5) / BUCKETS * MAX_ALPHA;
        ctx!.fillStyle = `rgba(${RGB}, ${a.toFixed(3)})`;
        ctx!.beginPath();
        const xs = bx[b];
        const ys = by[b];
        for (let k = 0; k < bn[b]; k++) {
          ctx!.rect(xs[k] - half, ys[k] - half, DOT, DOT);
        }
        ctx!.fill();
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // pause when tab is hidden (perf + battery)
    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn("block h-full w-full", className)}
    />
  );
}
