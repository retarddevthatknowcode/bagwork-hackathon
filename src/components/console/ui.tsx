"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  RefreshCw,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/auth/auth-provider";
import { isPrivyAppIdMalformed } from "@/lib/privy/config";
import { cn } from "@/lib/utils";

/** Static class map — Tailwind only generates classes it can see literally. */
const METER_TONE: Record<string, string> = {
  default: "",
  brand: "[&>div]:bg-brand",
  success: "[&>div]:bg-success",
  warning: "[&>div]:bg-warning",
  info: "[&>div]:bg-info",
};

/* --------------------------------------------------------- sign-in gate */

/**
 * Shown on screens that are meaningless without a session (submissions, earnings).
 *
 * Before this, an anonymous visitor hitting `/dashboard/submissions` got a generic
 * "We couldn't load this — the request failed" panel, and `/dashboard/earnings` silently
 * rendered zeros, which reads like "you have earned nothing" rather than "you are not
 * signed in".
 */
export function SignInRequired({
  title,
  description,
  onConnect,
}: {
  title: string;
  description: string;
  onConnect: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[50svh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <span
        aria-hidden="true"
        className="flex size-10 items-center justify-center rounded-full border border-border bg-muted/40"
      >
        <Wallet aria-hidden="true" className="size-4 text-muted-foreground" />
      </span>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Button onClick={onConnect} className="gap-1.5">
        <Wallet aria-hidden="true" className="size-4" />
        Sign in
      </Button>
    </div>
  );
}

/* -------------------------------------------------- wallet-hook gate */

/**
 * Renders its children only when there is a mounted `PrivyProvider` above them.
 *
 * The Solana wallet hooks — `useWallets` and `useSignAndSendTransaction` — throw the moment they are
 * called without a provider above them ("useWallets was called outside the PrivyProvider
 * component"). Without `NEXT_PUBLIC_PRIVY_APP_ID`, `AuthProvider` deliberately mounts no provider
 * and publishes its inert state instead, so any page that calls those hooks unconditionally cannot
 * render at all.
 *
 * That is not only a broken page, it is a failed **build**: `next build` renders every route to
 * produce its HTML, so one unguarded wallet hook fails the whole deployment — including routes that
 * have nothing to do with wallets, and every Preview deploy that was never given Privy credentials.
 * It cost exactly that, once.
 *
 * So the rule this component enforces: a component that needs a signing wallet is only ever mounted
 * when something can supply one. The hooks live in a child, which means they are genuinely *not
 * called* on the unconfigured path rather than merely not used — the difference between a page that
 * renders an honest state and a build that stops.
 *
 * What is below is that state. It names the two variables instead of offering a Sign in button that
 * could not do anything, which is the same honesty as the disabled controls in
 * `components/auth/auth-button.tsx`.
 */
export function WalletGate({ children }: { children: ReactNode }) {
  const { configured } = useAuth();

  if (configured) return <>{children}</>;

  return (
    <div className="mx-auto flex min-h-[50svh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <span
        aria-hidden="true"
        className="flex size-10 items-center justify-center rounded-full border border-border bg-muted/40"
      >
        <AlertTriangle aria-hidden="true" className="size-4 text-muted-foreground" />
      </span>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-foreground">
          {isPrivyAppIdMalformed ? "Wallet sign-in is misconfigured" : "Wallets are not available"}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {isPrivyAppIdMalformed ? (
            <>
              <code className="font-mono text-foreground">NEXT_PUBLIC_PRIVY_APP_ID</code> is set on
              this deployment, but its value is not a Privy App ID (they look like{" "}
              <code className="font-mono text-foreground">cm…</code>). Nothing here can sign until
              that value is corrected — the build deliberately carries on without it rather than
              failing and leaving an older release live.
            </>
          ) : (
            <>
              Funding a bag and launching a coin both sign with your own Solana wallet, and this
              deployment has no Privy credentials to provide one. Set{" "}
              <code className="font-mono text-foreground">NEXT_PUBLIC_PRIVY_APP_ID</code> and{" "}
              <code className="font-mono text-foreground">PRIVY_APP_SECRET</code> to turn it on.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ page header */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  bannerSrc,
  bannerPositionY = 88,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  /**
   * Optional banner artwork, painted as this header's own background.
   *
   * Background rather than a positioned layer, and that is the whole trick. The header already
   * stacks three things: `::before` draws the dot grid, `::after` draws the colour wash, and the
   * content sits at `z-10`. Anything painted as a *background* is guaranteed to land beneath all
   * three (the element's background paints before its pseudo-elements and its children), so the
   * order is image → dots → wash → text with no wrapper, no `z-index` guesswork and no extra
   * pointer-events surface — and the box is untouched, because a background cannot affect layout.
   *
   * `bg-cover` inside the header's existing `overflow-hidden`: artwork taller than the strip is
   * cropped rather than squashed, and the strip keeps exactly the height its own padding gives it.
   *
   * The crop is positioned, not centred. The artwork's crowd sits in its lower half with sky above,
   * so `50% 88%` slides the visible window *down* the picture: the characters fill the strip and the
   * heads sit near the top edge, which is the part worth looking at. It is also the last stop that
   * keeps the artwork's own baked-in dark bottom edge out of frame — a step further and that edge
   * shows up as a dark band along the bottom of the header.
   *
   * The fade above the scrim is what stops the header looking like a photograph pasted onto the page.
   * The artwork has no soft edge of its own: where it is cut off at the bottom of the strip, bright
   * artwork ends against the near-black page in a straight line. Fading the last third into
   * `--background` — the colour the content below actually sits on — turns that edge into a dissolve,
   * and `border-transparent` is part of the same fix: the header keeps its 1px bottom border, so the
   * box is untouched, but no hairline is drawn across the fade.
   *
   * `background-position` is written per layer, and the film's entry is the part that matters. The
   * `88%` vertical offset belongs to the artwork; the film layers are full-box gradients that should
   * simply be read top-to-bottom, so they take `0%`. Applying the artwork's offset to them shifted
   * their raster off the bottom edge and let one device row of undimmed artwork through — measured,
   * the last row of the strip read luminance 23 against the page's 10.
   *
   * `background-origin: border-box` is the other half, and it is load-bearing rather than tidiness.
   * It defaults to `padding-box`, which sizes the two gradient layers to the inside of the 1px border
   * — while the artwork, which has an intrinsic 4:1 size, is `cover`-scaled across the whole box and
   * therefore *also* paints the border strip. That strip was the loudest of the two remaining edges:
   * one full pixel of undimmed artwork, measured at luminance 128 against the page's 10. It reaches
   * the border box now, and the strip reads 10 — the page colour — with the header's 184.36px height
   * untouched (`border-b` stays, because removing it takes 1.1px of height with it).
   *
   * Between them the dissolve ends on the same colour the panel below sits on, at the same time as
   * the box does: nothing to step against, and nothing to hide behind a border.
   *
   * The scrim is the layer under the fade and the artwork the last, which is how a CSS background
   * stack is read: layers paint front to back. It exists because the dots and the wash are
   * *additive* — a yellow dot grid and four colour blooms — so on artwork like this the eyebrow, the
   * title and the description were being read against the picture's brightest areas, sky and skin
   * tones alike. It is weighted to the left, where the text column is, and nearly transparent on the
   * right so the artwork still reads as artwork.
   * Deliberately part of the same background rather than another element: nothing extra to stack,
   * nothing extra to click through, and still no effect on the box.
   *
   * Deliberately not `next/image`: the asset is an SVG, which the optimiser passes through
   * untouched, and a CSS background cannot go through `Image` in any case.
   *
   * Two headers paint through this prop — Explore and Community — and they share every value above
   * rather than each carrying its own crop and fade. That is the point: the layer order, the scrim,
   * the dissolve and the box the fade ends on are one implementation, so the seam cannot be right on
   * one page and wrong on the other. The `88%` crop was chosen on the Explore artwork, and the crop is
   * the one thing that is *not* shared: the Community strip is wider and shorter (5.9:1 against 4:1)
   * and did not want that offset, which is what `bannerPositionY` below is for. Measured on the
   * Community asset,
   * the header's last twelve rows read the page colour flat — no bright pixel anywhere across the
   * width — and the row below them carries the same value the Explore header leaves behind.
   */
  bannerSrc?: string;
  /**
   * Vertical position of the artwork layer alone, as a `background-position` percentage.
   *
   * `0%` puts the top of the illustration on the header's top edge and `100%` puts its bottom edge on
   * the header's bottom edge, so a *lower* number pushes the picture down inside the box: more of its
   * upper part comes into frame, and whatever it draws sits lower in the strip. The default `88%` is
   * the Explore crop described above.
   *
   * Community overrides it, because the two artworks are different shapes. Explore's is 4:1, so in
   * this box it overflows vertically by ~170px and `88%` is a real choice between crops; Community's
   * is 5.9:1 and overflows by only ~44px, so the same offset left its cast pressed against the top
   * edge. `50%` centres that crop instead: measured on the Community asset in the console's 1344×184
   * header, the artwork drops 16.6px against the `88%` it shipped with, more sky reads above the
   * heads, and both of the illustration's baked-in edges — the pale top and the dark bottom — stay
   * out of frame. The drop scales with the box, since the artwork is `cover`-scaled.
   *
   * Only the artwork's entry moves. The two film layers keep the positions they had, so the fade into
   * the panel below is identical whichever value a page passes — this prop cannot disturb the seam.
   */
  bannerPositionY?: number;
}) {
  return (
    <div
      className={cn(
        "console-dotgrid console-header-wash relative overflow-hidden border-b bg-card/25",
        bannerSrc ? "border-transparent bg-cover bg-no-repeat" : "border-border/60",
      )}
      style={
        bannerSrc
          ? {
              // Written per layer, as it always was; only the artwork's entry is a knob.
              backgroundPosition: `50% 0%, 50% 88%, 50% ${bannerPositionY}%`,
              // Sized against the border box, so the fade also covers the 1px border strip the
              // artwork bleeds into (see the note above).
              backgroundOrigin: "border-box",
              backgroundImage:
                `linear-gradient(to bottom, rgba(11, 10, 7, 0) 54%, rgba(11, 10, 7, 0.62) 76%, ` +
                `rgba(11, 10, 7, 0.94) 92%, rgba(11, 10, 7, 1) 100%), ` +
                `linear-gradient(97deg, rgba(6, 6, 5, 0.95) 0%, rgba(6, 6, 5, 0.9) 32%, ` +
                `rgba(6, 6, 5, 0.74) 56%, rgba(6, 6, 5, 0.46) 78%, rgba(6, 6, 5, 0.3) 100%), ` +
                `url("${bannerSrc}")`,
            }
          : undefined
      }
    >
      {/* z-10 so the dot grid and the colour wash both paint behind the heading. */}
      <div className="relative z-10 flex flex-col gap-4 px-4 py-8 sm:px-6 md:py-9 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            {eyebrow ? (
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="title-display text-2xl text-foreground sm:text-[1.75rem]">
              {title}
            </h1>
            {description ? (
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- sparkline */

export function Sparkline({
  data,
  label,
  className,
}: {
  data: number[];
  label: string;
  className?: string;
}) {
  if (data.length < 2) return null;
  const w = 96;
  const h = 28;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - 2 - ((v - min) / span) * (h - 6);
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className={cn("h-7 w-24", className)}
    >
      <polygon points={`0,${h} ${line} ${w},${h}`} className="fill-current opacity-10" />
      <polyline
        points={line}
        fill="none"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        className="stroke-current"
      />
    </svg>
  );
}

/** Trend chip: arrow + signed value + plain-language context (never colour alone). */
export function Delta({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) {
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium tabular-nums",
        up ? "text-success" : "text-destructive",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {up ? "+" : "−"}
      {Math.abs(value).toFixed(1)}%
      <span className="font-normal text-muted-foreground">{label}</span>
    </span>
  );
}

/* ------------------------------------------------------------ metric card */

export function MetricCard({
  label,
  value,
  valueClassName,
  hint,
  delta,
  spark,
  sparkLabel,
  icon: Icon,
  href,
  actionLabel,
  className,
}: {
  label: string;
  value: string;
  /**
   * Overrides the size and weight of the value line. For a slot whose placeholder is a phrase
   * rather than a figure: "To be announced" in the 2xl tabular slot is a truncated word.
   */
  valueClassName?: string;
  hint?: string;
  delta?: number;
  spark?: number[];
  sparkLabel?: string;
  icon?: LucideIcon;
  href?: string;
  actionLabel?: string;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <CardContent className="flex h-full flex-col justify-between gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {Icon ? (
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          ) : null}
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p
              className={cn(
                "truncate text-2xl font-semibold tabular-nums text-foreground",
                valueClassName,
              )}
            >
              {value}
            </p>
            {delta !== undefined ? (
              <Delta value={delta} label="vs prev 30d" />
            ) : hint ? (
              <p className="text-xs text-muted-foreground">{hint}</p>
            ) : null}
          </div>
          {spark && spark.length > 1 ? (
            <Sparkline
              data={spark}
              label={sparkLabel ?? `${label} trend`}
              className="shrink-0 text-muted-foreground/60"
            />
          ) : null}
        </div>

        {href && actionLabel ? (
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none rounded-sm"
          >
            {actionLabel}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* ----------------------------------------------------------- section card */

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      {title || action ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3.5 sm:px-5">
          <div className="min-w-0 space-y-0.5">
            {title ? (
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            ) : null}
            {description ? (
              <p className="text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn("px-4 py-4 sm:px-5", contentClassName)}>{children}</div>
    </Card>
  );
}

/* ---------------------------------------------------------------- states */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondary,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  secondary?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/80 bg-muted/10 px-6 py-14 text-center",
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="max-w-sm space-y-1">
        <p className="title-display text-base text-foreground">{title}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {action || secondary ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondary}
        </div>
      ) : null}
    </div>
  );
}

export function ErrorState({
  title = "We couldn't load this",
  description = "The request failed. Retry — if it keeps failing the dev server log will say why.",
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10 text-destructive">
        <AlertTriangle aria-hidden="true" className="size-5" />
      </span>
      <div className="max-w-sm space-y-1">
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw aria-hidden="true" className="size-3.5" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- fragments */

export function InfoRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        {hint ? <p className="text-xs text-muted-foreground/70">{hint}</p> : null}
      </div>
      <dd className="shrink-0 text-sm font-medium tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}

/** Token mark — tinted tile with the symbol, no external assets needed. */
export function TokenMark({
  symbol,
  color,
  className,
}: {
  symbol: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold tracking-tight",
        className,
      )}
      style={{
        backgroundColor: `${color}1f`,
        borderColor: `${color}3d`,
        color,
      }}
    >
      {symbol.slice(0, 4)}
    </span>
  );
}

/** Labelled meter used for budgets, streaks and level progress. */
export function ProgressRow({
  label,
  value,
  max,
  valueLabel,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: number;
  max: number;
  valueLabel: string;
  hint?: string;
  tone?: "default" | "brand" | "success" | "warning" | "info";
  className?: string;
}) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums text-foreground">{valueLabel}</span>
      </div>
      <Progress
        value={percent}
        aria-label={`${label}: ${valueLabel}`}
        className={cn("h-1.5 bg-accent", METER_TONE[tone])}
      />
      {hint ? (
        <p className="text-[11px] text-muted-foreground/80">{hint}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- skeletons */

export function MetricSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="gap-0 py-0">
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * The bag grid's loading state.
 *
 * It mirrors the real grid exactly — the same columns, the same gap, the same 96px banner — because
 * a skeleton whose blocks land in different places than the content is a second layout flashing on
 * screen. (`h-24` is the card's banner height, `sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4` the
 * grid it has to match; if either moves, this moves with it.)
 */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="gap-0 overflow-hidden py-0">
          <Skeleton className="h-24 w-full rounded-none" />
          <CardContent className="space-y-3 p-3.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-8 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 py-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 shrink-0 rounded-md" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="hidden h-3.5 w-20 sm:block" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}
