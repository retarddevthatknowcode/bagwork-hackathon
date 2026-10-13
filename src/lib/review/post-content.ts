/**
 * The post a submission points at — fetched so review reads the content, not the URL string.
 *
 * A model asked to judge `https://x.com/user/status/123` has nothing to judge. This fetches the
 * actual text, plus whatever engagement the platform publishes, and returns null when it cannot:
 * a submission whose content cannot be loaded stays in review rather than being decided blind.
 *
 * Sources, all public and keyless:
 *   - X/Twitter: `api.fxtwitter.com` returns the text *and* views/likes/reposts — which also means
 *     authenticity can be scored on real numbers instead of a neutral placeholder.
 *     `publish.twitter.com/oembed` is the fallback: text only, no metrics.
 *   - YouTube and TikTok: their public oEmbed endpoints give the title and author.
 *   - Instagram: oEmbed needs a token, so there is no source yet. Those stay pending.
 */
const TIMEOUT_MS = 12_000;

export interface PostContent {
  platform: string;
  author: string | null;
  /** The post's own words, or its title where the platform only publishes one. */
  text: string;
  url: string;
  metrics: {
    views: number | null;
    likes: number | null;
    reposts: number | null;
    replies: number | null;
  };
  hasMedia: boolean;
  source: "fxtwitter" | "oembed";
  /*
   * Everything below exists for the preview card, and is optional on purpose: only some sources
   * publish it, and a source that has none leaves the field undefined rather than inventing a
   * placeholder that would render as a fake profile.
   */
  /** Display name, as opposed to the `@handle` in `author`. */
  authorName?: string | null;
  authorAvatar?: string | null;
  authorVerified?: boolean;
  /** ISO 8601. Null when the source did not date the post. */
  createdAt?: string | null;
  /** The canonical URL — a submitted link's handle can differ from the real author's. */
  permalink?: string | null;
  mediaThumbnail?: string | null;
  mediaKind?: "photo" | "video" | "gif" | null;
}

const NO_METRICS = { views: null, likes: null, reposts: null, replies: null } as const;

function finiteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** An ISO 8601 date from whatever shape a source dated its post with, or null. */
function isoDate(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      // fxTwitter's `created_timestamp` is epoch *seconds*.
      return new Date(candidate * 1000).toISOString();
    }
    if (typeof candidate === "string" && candidate.trim()) {
      const parsed = new Date(candidate);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
  }
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `<handle>/status/<id>` out of an x.com or twitter.com link. */
export function parseXStatus(url: string): { handle: string; id: string } | null {
  const match = url.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]+)\/status(?:es)?\/(\d+)/i);
  return match ? { handle: match[1], id: match[2] } : null;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** X, via fxTwitter for text + metrics, then oEmbed for text alone. */
async function readX(url: string): Promise<PostContent | null> {
  const parsed = parseXStatus(url);
  if (!parsed) return null;

  const fx = await getJson<{
    tweet?: {
      id?: string;
      url?: string;
      text?: string;
      author?: {
        name?: string;
        screen_name?: string;
        avatar_url?: string;
        verification?: { verified?: boolean } | null;
      };
      likes?: number;
      retweets?: number;
      replies?: number;
      views?: number;
      created_at?: string;
      created_timestamp?: number;
      media?: {
        photos?: { url?: string }[];
        videos?: { thumbnail_url?: string }[];
      };
    };
  }>(`https://api.fxtwitter.com/${parsed.handle}/status/${parsed.id}`);

  const tweet = fx?.tweet;
  const text = (tweet?.text ?? "").trim();
  if (text) {
    const photo = tweet?.media?.photos?.[0]?.url ?? null;
    const videoThumb = tweet?.media?.videos?.[0]?.thumbnail_url ?? null;
    return {
      platform: "x",
      author: tweet?.author?.screen_name ?? parsed.handle,
      text,
      url,
      metrics: {
        views: finiteNumber(tweet?.views),
        likes: finiteNumber(tweet?.likes),
        reposts: finiteNumber(tweet?.retweets),
        replies: finiteNumber(tweet?.replies),
      },
      hasMedia: Boolean(tweet?.media?.photos?.length || tweet?.media?.videos?.length),
      source: "fxtwitter",
      authorName: tweet?.author?.name ?? null,
      authorAvatar: tweet?.author?.avatar_url ?? null,
      authorVerified: Boolean(tweet?.author?.verification?.verified),
      createdAt: isoDate(tweet?.created_timestamp, tweet?.created_at),
      // fxTwitter resolves the status id and reports the post's *real* author, so this permalink is
      // right even when the submitted link names a different handle.
      permalink: tweet?.url ?? null,
      mediaThumbnail: photo ?? videoThumb,
      mediaKind: photo ? "photo" : videoThumb ? "video" : null,
    };
  }

  const oembed = await getJson<{ author_name?: string; html?: string }>(
    `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=1`,
  );
  const fallbackText = stripHtml(oembed?.html ?? "");
  if (fallbackText) {
    return {
      platform: "x",
      author: oembed?.author_name ?? parsed.handle,
      text: fallbackText,
      url,
      metrics: { ...NO_METRICS },
      hasMedia: false,
      source: "oembed",
    };
  }
  return null;
}

/** YouTube and TikTok publish a title, author and thumbnail over keyless oEmbed. */
async function readOembedTitle(
  url: string,
  platform: string,
  endpoint: string,
): Promise<PostContent | null> {
  const body = await getJson<{ title?: string; author_name?: string; thumbnail_url?: string }>(
    `${endpoint}${encodeURIComponent(url)}`,
  );
  const text = (body?.title ?? "").trim();
  if (!text) return null;
  return {
    platform,
    author: body?.author_name ?? null,
    text,
    url,
    metrics: { ...NO_METRICS },
    hasMedia: true,
    source: "oembed",
    authorName: body?.author_name ?? null,
    mediaThumbnail: body?.thumbnail_url ?? null,
    mediaKind: "video",
  };
}

/**
 * The post's content, or null when this platform has no keyless source — in which case the
 * submission must stay in review rather than be judged on its URL alone.
 */
export async function fetchPostContent(rawUrl: string, platform: string): Promise<PostContent | null> {
  const url = rawUrl.trim();
  if (!url) return null;

  switch (platform) {
    case "x":
      return readX(url);
    case "youtube":
      return readOembedTitle(url, "youtube", "https://www.youtube.com/oembed?format=json&url=");
    case "tiktok":
      return readOembedTitle(url, "tiktok", "https://www.tiktok.com/oembed?url=");
    default:
      // Instagram's oEmbed requires an app token. No source, no verdict — stays pending.
      return null;
  }
}
