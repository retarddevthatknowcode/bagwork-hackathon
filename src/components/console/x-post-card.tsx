"use client";

import * as React from "react";
import { Heart, MessageCircle, Repeat2 } from "lucide-react";

import { loadXWidgets } from "@/lib/x/widgets";
import { cn } from "@/lib/utils";

/**
 * A real post, in the floating window that opens from a submission link.
 *
 * Two layers, in the order they are tried:
 *
 *   1. **X's own embed** (`widgets.js` → `createTweet`) — the actual post UI, rendered by X, which is
 *      what this card exists to show. `createTweet` resolves with the rendered element or with
 *      `undefined` when X cannot render the post, so the fallback below is a decision, not a guess.
 *   2. **A faithful X-style card** from the same post data — shown instantly while the embed loads,
 *      and left in place when the embed cannot render (script blocked, offline, post deleted, embed
 *      disabled). It is not a stats tooltip: avatar, display name, handle, text, exact time, media
 *      and engagement, laid out like X's own card, and the whole thing opens the real post.
 *
 * Colours are X's own card tokens rather than this app's, because the card is a reproduction of an
 * external surface — themed to our palette it would stop looking like the post it previews. Type
 * stays on the app's sans, which sits very close to X's own face at these sizes.
 */

export interface PostPreviewData {
  platform: string;
  /** Present for X: the id X's embed renders from. */
  statusId: string | null;
  author: { handle: string | null; name: string | null; avatar: string | null; verified: boolean };
  text: string;
  truncated: boolean;
  /** ISO 8601, or null when the source did not date the post. */
  createdAt: string | null;
  permalink: string;
  media: { thumbnail: string | null; kind: string | null };
  metrics: {
    views: number | null;
    likes: number | null;
    reposts: number | null;
    replies: number | null;
  };
  hasMedia: boolean;
  source: string;
}

export type XTheme = "light" | "dark";

/** The document is dark or it is not; X's embed takes one or the other, so follow the page. */
export function currentXTheme(): XTheme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** `1:05 PM · Sep 28, 2026` — how X's own card dates a post. */
export function formatPostTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  const day = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
  return `${time} · ${day}`;
}

/** Thousands-separated, the way X writes counts. */
function count(value: number | null): string | null {
  return value === null ? null : value.toLocaleString();
}

/** X's verified mark. A filled disc with a white tick reads correctly at 18px. */
function VerifiedBadge() {
  return (
    <svg viewBox="0 0 22 22" className="size-[18px] shrink-0" role="img" aria-label="Verified account">
      <circle cx="11" cy="11" r="11" fill="#1D9BF0" />
      <path d="M9.6 15.3 6 11.7l1.4-1.4 2.2 2.2 5-5L16 8.9z" fill="#fff" />
    </svg>
  );
}

/** One engagement figure: X's icon, then the count. Non-interactive — this is a preview. */
function Engagement({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Heart;
  value: number | null;
  label: string;
}) {
  const shown = count(value);
  if (shown === null) return null;
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums" title={`${shown} ${label}`}>
      <Icon aria-hidden="true" className="size-4" />
      <span>{shown}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * The only thing shown while the embed loads.
 *
 * Deliberately a placeholder, not a card: rendering the post here and swapping to X's embed is what
 * produced two cards on hover. It announces itself to assistive tech, and the decoration is hidden
 * from it.
 */
export function XCardSkeleton() {
  return (
    <div role="status" aria-live="polite" className="p-4">
      <span className="sr-only">Loading post preview…</span>
      <div aria-hidden="true" className="space-y-3">
        <div className="flex gap-3">
          <div className="size-10 shrink-0 rounded-full bg-[#2F3336] motion-reduce:animate-none motion-safe:animate-pulse" />
          <div className="flex-1 space-y-2 pt-0.5">
            <div className="h-3.5 w-32 rounded bg-[#2F3336] motion-reduce:animate-none motion-safe:animate-pulse" />
            <div className="h-3.5 w-full rounded bg-[#2F3336]/70 motion-reduce:animate-none motion-safe:animate-pulse" />
            <div className="h-3.5 w-4/5 rounded bg-[#2F3336]/70 motion-reduce:animate-none motion-safe:animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * fxTwitter hands back `?name=orig`, which is a multi-megabyte original. The card is a thumbnail, so
 * ask X's CDN for the small variant instead of downloading a full-resolution image to show 300px.
 */
function previewImageUrl(url: string): string {
  if (!/^https:\/\/pbs\.twimg\.com\//.test(url)) return url;
  return url.replace(/([?&]name=)[a-z]+/i, "$1small");
}

/** The card bottom layer: the post, laid out the way X lays it out. */
export function XPostCard({
  post,
  className,
}: {
  post: PostPreviewData;
  className?: string;
}) {
  const time = formatPostTime(post.createdAt);
  const views = count(post.metrics.views);
  const handle = post.author.handle ? `@${post.author.handle}` : null;
  const name = post.author.name ?? handle ?? "Post";

  return (
    <a
      href={post.permalink}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "block p-4 transition-colors hover:bg-white/[0.03] focus-visible:ring-[3px] focus-visible:ring-[#1D9BF0]/40 focus-visible:outline-none",
        className,
      )}
    >
      <div className="flex gap-3">
        {post.author.avatar ? (
          // X's own CDN avatar, at the size the card shows it.
          <img
            src={post.author.avatar}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            draggable={false}
            referrerPolicy="no-referrer"
            className="size-10 shrink-0 rounded-full bg-[#2F3336] object-cover"
          />
        ) : (
          <span aria-hidden="true" className="size-10 shrink-0 rounded-full bg-[#2F3336]" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[15px] leading-5">
            <span className="truncate font-bold text-[#E7E9EA]">{name}</span>
            {post.author.verified ? <VerifiedBadge /> : null}
            {handle ? <span className="truncate text-[#71767B]">{handle}</span> : null}
          </div>

          <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-5 text-[#E7E9EA]">
            {post.text}
            {post.truncated ? "…" : ""}
          </p>

          {post.media.thumbnail ? (
            <img
              src={previewImageUrl(post.media.thumbnail)}
              alt=""
              loading="lazy"
              draggable={false}
              referrerPolicy="no-referrer"
              className="mt-3 max-h-52 w-full rounded-2xl border border-[#2F3336] bg-[#16181C] object-cover"
            />
          ) : null}

          {time || views ? (
            <p className="mt-3 text-[15px] leading-5 text-[#71767B]">
              {time}
              {time && views ? " · " : ""}
              {views ? `${views} Views` : ""}
            </p>
          ) : null}

          <div className="mt-3 flex items-center gap-6 border-t border-[#2F3336] pt-3 text-[13px] text-[#71767B]">
            <Engagement icon={MessageCircle} value={post.metrics.replies} label="replies" />
            <Engagement icon={Repeat2} value={post.metrics.reposts} label="reposts" />
            <Engagement icon={Heart} value={post.metrics.likes} label="likes" />
          </div>
        </div>
      </div>
    </a>
  );
}

export type EmbedState = "loading" | "ready" | "unavailable";

/**
 * How long X gets to render before the window gives up and uses our own card.
 *
 * A hover window must not sit on a placeholder: whatever X is doing — a stalled script, a frame that
 * never loads, a slow connection — the viewer has an answer by this point, and it is always one card.
 */
const RENDER_TIMEOUT_MS = 5_000;

/**
 * X's own embed, rendered by X.
 *
 * Reports what actually happened rather than assuming: `ready` only when `createTweet` handed back an
 * element. `unavailable` covers a blocked script, an X outage, and a post X refuses to embed — all of
 * which the caller answers with its own card instead of an empty frame.
 */
export function XPostEmbed({
  statusId,
  theme,
  width = 400,
  onResult,
}: {
  statusId: string;
  theme: XTheme;
  width?: number;
  onResult: (state: EmbedState) => void;
}) {
  const host = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const container = host.current;
    if (!container) return;

    let cancelled = false;
    let settled = false;

    /**
     * One answer, once.
     *
     * `createTweet` is not guaranteed to resolve — a stalled script, a blocked frame or a slow
     * network can leave the promise pending — and an unresolved embed would leave the window sitting
     * on its loading placeholder indefinitely. The deadline below forces an answer either way.
     */
    const finish = (state: EmbedState) => {
      if (settled || cancelled) return;
      settled = true;
      window.clearTimeout(deadline);
      onResult(state);
    };

    const deadline = window.setTimeout(() => finish("unavailable"), RENDER_TIMEOUT_MS);

    void (async () => {
      const widgets = await loadXWidgets();
      if (cancelled) return;
      if (!widgets) {
        finish("unavailable");
        return;
      }
      try {
        const rendered = await widgets.createTweet(statusId, container, {
          theme,
          // No advertising or analytics cookies for a hover preview.
          dnt: true,
          // The post itself, not the whole thread.
          conversation: "none",
          align: "left",
          width,
          lang: "en",
        });
        finish(rendered ? "ready" : "unavailable");
      } catch {
        finish("unavailable");
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(deadline);
      // X renders an iframe in here; removing it stops playback/timers when the window closes.
      container.replaceChildren();
    };
    // `onResult` is a state setter at the only call site, so its identity is stable; passing it
    // through avoids re-running the embed (and rendering the post twice) on an unrelated re-render.
  }, [statusId, theme, width, onResult]);

  return <div ref={host} className="px-1 py-2 [&_iframe]:!rounded-xl" />;
}

