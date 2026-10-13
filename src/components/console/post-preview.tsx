"use client";

import * as React from "react";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  currentXTheme,
  XCardSkeleton,
  XPostCard,
  XPostEmbed,
  type EmbedState,
  type PostPreviewData,
} from "./x-post-card";
import { cn } from "@/lib/utils";

/**
 * A submission link that opens a floating window with the actual post in it.
 *
 * The window shows **one** card: X's own embed. There is no second, app-styled card behind it and no
 * extra call to action under it — X's embed already is the post and already links to it.
 *
 * Two rules keep this off the critical path of a table full of links:
 *
 *   1. **Nothing is fetched until a pointer (or keyboard focus) lands on the link**, and the result
 *      is kept for the life of the component, so a dashboard of fifty links costs nothing until
 *      someone reads one.
 *   2. **The window only opens after Radix's own open delay**, so a pointer crossing the table
 *      neither opens a card nor downloads X's embed runtime.
 *
 * It shows a preview, never a verdict: scores and status live on the row, not here.
 */

type PreviewState = "idle" | "loading" | "ready" | "unavailable";

export function PostPreviewLink({
  url,
  className,
  onClick,
  children,
}: {
  url: string;
  className?: string;
  /** Passed through so a link inside a clickable row can still stop that row's navigation. */
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  children: React.ReactNode;
}) {
  const [data, setData] = React.useState<PostPreviewData | null>(null);
  const [state, setState] = React.useState<PreviewState>("idle");

  const load = React.useCallback(() => {
    setState((current) => {
      // Only the first hover (or focus) asks; later ones reuse what came back.
      if (current !== "idle") return current;
      void (async () => {
        try {
          const res = await fetch(`/api/post-preview?url=${encodeURIComponent(url)}`);
          if (!res.ok) throw new Error("No preview");
          setData((await res.json()) as PostPreviewData);
          setState("ready");
        } catch {
          setState("unavailable");
        }
      })();
      return "loading";
    });
  }, [url]);

  return (
    <HoverCard openDelay={220} closeDelay={140}>
      <HoverCardTrigger asChild>
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          onMouseEnter={load}
          onFocus={load}
          onClick={onClick}
          className={className}
        >
          {children}
        </a>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        side="bottom"
        collisionPadding={12}
        /*
         * X's card surface, on top of the app's own tokens: black, hairline border, generous radius.
         * The height cap keeps the promise that this is a small window — a long post scrolls inside
         * rather than growing to fill the viewport.
         */
        className="max-h-[min(640px,80vh)] w-[400px] max-w-[calc(100vw-2rem)] overflow-x-hidden overflow-y-auto rounded-2xl border-[#2F3336] bg-black p-0 text-[#E7E9EA] shadow-2xl motion-reduce:animate-none"
      >
        <PostPreviewWindow state={state} data={data} />
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * The window's contents: one card, never two.
 *
 * X's embed is that card. Until `createTweet` reports ready, the window shows a loading placeholder —
 * never the post rendered twice, and never an app-styled card sitting behind or below X's, which is
 * what previously produced two cards and two calls to action on a single hover.
 *
 * The fallback card is kept for one case only: X declining to render the post (deleted, protected,
 * embed disabled, runtime blocked). Even then it is the only card on screen.
 */
function PostPreviewWindow({
  state,
  data,
}: {
  state: PreviewState;
  data: PostPreviewData | null;
}) {
  const [embedState, setEmbedState] = React.useState<EmbedState>("loading");
  const theme = React.useMemo(() => currentXTheme(), []);

  // Opening the window fires the fetch, so "idle" is only ever a frame or two — read it as loading
  // rather than claiming the post is unavailable before we have even asked.
  if (state === "loading" || state === "idle") return <XCardSkeleton />;

  if (!data || state === "unavailable") {
    return (
      <div className="space-y-1 p-4">
        <p className="text-[13px] font-semibold text-[#E7E9EA]">Preview unavailable</p>
        <p className="text-[13px] leading-5 text-[#71767B]">
          This post could not be read — it may be deleted, private, or on a platform we cannot read.
          Clicking the link still opens it.
        </p>
      </div>
    );
  }

  const embeddable = data.platform === "x" && Boolean(data.statusId);

  // Not X, or X declined to render it: the faithful card is the only card there is.
  if (!embeddable || embedState === "unavailable") return <XPostCard post={data} />;

  return (
    <div className="relative min-h-[168px]">
      {/*
        X's embed sits in normal flow so it measures a real container width — a `display:none` or
        zero-width frame renders wrong. It stays transparent, with the placeholder covering exactly
        the same box, until `createTweet` resolves; then the placeholder goes and X's post is what is
        left. One card at every moment of the hover.
      */}
      <div
        /*
         * `inert` until it is real: X's iframe is focusable, and it must not be reachable by keyboard
         * while the placeholder is what the viewer is looking at.
         */
        inert={embedState !== "ready"}
        className={cn(
          "transition-opacity duration-200",
          embedState === "ready" ? "opacity-100" : "opacity-0",
        )}
      >
        <XPostEmbed statusId={data.statusId as string} theme={theme} onResult={setEmbedState} />
      </div>

      {embedState === "ready" ? null : (
        <div className="absolute inset-0 bg-black">
          <XCardSkeleton />
        </div>
      )}
    </div>
  );
}

