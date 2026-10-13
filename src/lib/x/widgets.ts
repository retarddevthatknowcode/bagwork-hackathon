"use client";

/**
 * X's official embed runtime, loaded on demand.
 *
 * `widgets.js` is what renders the *real* post card — the same one X serves on any site that embeds
 * a post — and it reports honestly: `createTweet` resolves with the element it rendered, or with
 * `undefined` when the post cannot be rendered (deleted, protected, embed disabled). That promise is
 * the whole reason this is preferred over hand-rolling the card: it is a real success signal, not a
 * guess, so the caller can fall back without pretending.
 *
 * It is ~94 KB, so it is never loaded on page render: only when someone actually hovers a link long
 * enough to read it. The script tag is injected once per session and the browser caches it, so a
 * second hover costs nothing but a re-render.
 */

const SCRIPT_ID = "x-widgets-script";
const SCRIPT_SRC = "https://platform.twitter.com/widgets.js";
/** Past this, stop waiting and let the caller render its own card. */
const LOAD_TIMEOUT_MS = 8_000;

export interface XCreateTweetOptions {
  theme?: "light" | "dark";
  /** X's do-not-track flag: no advertising/analytics cookies for this embed. */
  dnt?: boolean;
  conversation?: "none" | "all";
  align?: "left" | "center" | "right";
  lang?: string;
  width?: number;
}

interface XWidgets {
  createTweet: (
    statusId: string,
    target: HTMLElement,
    options?: XCreateTweetOptions,
  ) => Promise<HTMLElement | undefined>;
}

declare global {
  interface Window {
    twttr?: { widgets?: XWidgets };
  }
}

let pending: Promise<XWidgets | null> | null = null;

/** Resolves with X's widgets API, or null when it could not be loaded in time. */
export function loadXWidgets(): Promise<XWidgets | null> {
  if (typeof window === "undefined") return Promise.resolve(null);

  const available = window.twttr?.widgets;
  if (available) return Promise.resolve(available);
  if (pending) return pending;

  pending = new Promise<XWidgets | null>((resolve) => {
    let settled = false;
    const finish = (widgets: XWidgets | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(widgets);
    };

    const timer = window.setTimeout(() => finish(window.twttr?.widgets ?? null), LOAD_TIMEOUT_MS);

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      // Already in the document (a previous hover started it): just wait for the API to appear.
      const poll = window.setInterval(() => {
        const widgets = window.twttr?.widgets;
        if (widgets) {
          window.clearInterval(poll);
          finish(widgets);
        }
      }, 100);
      window.setTimeout(() => window.clearInterval(poll), LOAD_TIMEOUT_MS);
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.charset = "utf-8";
    script.addEventListener("load", () => finish(window.twttr?.widgets ?? null), { once: true });
    // A blocked script (offline, an extension, a network policy) must not leave the card spinning.
    script.addEventListener("error", () => finish(null), { once: true });
    document.head.appendChild(script);
  });

  return pending;
}
