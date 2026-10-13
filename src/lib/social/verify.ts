import { normalizePlatform, type Platform } from "../types";

/**
 * Proving that a submitted post was made by an account this user has verified.
 *
 * The farming this guards against is trivial without it: one person posts one piece of content
 * and submits it from several accounts, or submits someone else's viral post as their own. Both
 * collapse if a submission is only accepted when the post's author *is* an account the user has
 * connected in their profile — you cannot claim work you did not do if the account has to be
 * proven yours first.
 *
 * Everything here is pure so the rules can be tested exhaustively: this decides whether money can
 * eventually be paid, and a matcher that is subtly too lenient fails silently.
 */

export type SocialRejectionCode =
  /** Nothing connected at all — the user has to do their profile first. */
  | "no_accounts"
  /** The link does not carry its author, so authorship cannot be proven. */
  | "unverifiable_link"
  /** The link is from a different platform to the one selected. */
  | "wrong_platform"
  /** The author is named, but is not an account on this profile. */
  | "not_connected";

export type SocialCheckResult =
  | { ok: true; handle: string; platform: Platform }
  | { ok: false; code: SocialRejectionCode; message: string };

/** Paths that appear in the first segment of an X URL but are not usernames. */
const X_RESERVED = new Set([
  "i", "home", "search", "explore", "notifications", "messages", "settings", "intent",
  "share", "hashtag", "compose", "login", "logout", "signup", "tos", "privacy", "about",
  "jobs", "help", "verify", "account", "topics", "trends", "lists", "communities",
  "premium", "following", "followers", "bookmarks", "moments",
]);

/** Instagram path segments that sit where a username would. */
const IG_CONTENT_SEGMENTS = new Set(["p", "reel", "reels", "tv", "stories", "explore"]);

function hostOf(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/^m\./, "")
    .replace(/^mobile\./, "");
}

function pathSegments(pathname: string): string[] {
  return pathname
    .split("/")
    .map((part) => decodeURIComponent(part).trim())
    .filter(Boolean);
}

/** Which platform a link belongs to, from its host alone. Null when it is none of the four. */
export function platformFromUrl(rawUrl: string): Platform | null {
  let host: string;
  try {
    host = hostOf(new URL(rawUrl.trim()).hostname);
  } catch {
    return null;
  }
  if (host === "x.com" || host === "twitter.com") return "x";
  if (host === "tiktok.com" || host === "vm.tiktok.com") return "tiktok";
  if (host === "instagram.com" || host === "instagr.am") return "instagram";
  if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") {
    return "youtube";
  }
  return null;
}

/**
 * Pulls the author's handle out of a post URL.
 *
 * Returns `null` when the URL form does not name its author — a YouTube `watch?v=` link, a
 * canonical `instagram.com/p/<id>`, a `youtu.be` short link. Those are genuinely unverifiable
 * rather than a user error, and the caller says so instead of inventing a match.
 */
export function extractHandle(rawUrl: string, platform: Platform): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  const segments = pathSegments(url.pathname);

  if (platform === "x") {
    const [first, second] = segments;
    if (!first || !second) return null;
    // Only a post link: a bare profile URL is not evidence of published content.
    if (second.toLowerCase() !== "status") return null;
    const handle = first.replace(/^@/, "").toLowerCase();
    if (!handle || X_RESERVED.has(handle)) return null;
    return handle;
  }

  if (platform === "tiktok") {
    const first = segments[0];
    if (!first || !first.startsWith("@")) return null;
    return first.slice(1).toLowerCase() || null;
  }

  if (platform === "instagram") {
    const [first, second] = segments;
    if (!first) return null;
    // Canonical `/p/<id>` and `/reel/<id>` URLs carry no username.
    if (IG_CONTENT_SEGMENTS.has(first.toLowerCase())) return null;
    if (!second || !IG_CONTENT_SEGMENTS.has(second.toLowerCase())) return null;
    return first.replace(/^@/, "").toLowerCase() || null;
  }

  // youtube
  const first = segments[0]?.toLowerCase();
  if (!first) return null;
  if (first.startsWith("@")) return segments[0].slice(1).toLowerCase() || null;
  // Legacy `/c/<name>` and `/user/<name>` forms name the channel, so they can be matched.
  if ((first === "c" || first === "user") && segments[1]) return segments[1].toLowerCase();
  // `/watch`, `/shorts/<id>`, `/channel/<id>`, `youtu.be/<id>` — uploader not present.
  return null;
}

/** Best-effort handle from a profile URL's path (no post id required). */
function extractProfileHandle(pathname: string): string | null {
  const segments = pathSegments(pathname);
  const first = segments[0];
  if (!first) return null;
  const lowered = first.toLowerCase();
  if (lowered === "c" || lowered === "user") return segments[1]?.toLowerCase() ?? null;
  const handle = first.replace(/^@/, "").toLowerCase();
  if (!handle || X_RESERVED.has(handle) || IG_CONTENT_SEGMENTS.has(handle)) return null;
  return handle;
}

/**
 * Reduces a stored social value to a bare handle.
 *
 * People type `@handle`, `handle`, or paste a profile URL. All three mean the same account, so
 * all three are normalised here rather than rejected — the strictness belongs in *comparison*,
 * not in how the value was entered.
 */
export function normaliseHandle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let value = raw.trim();
  if (!value) return "";

  if (/^https?:\/\//i.test(value)) {
    try {
      const fromUrl = extractProfileHandle(new URL(value).pathname);
      if (fromUrl) return fromUrl;
    } catch {
      /* fall through to plain-text handling */
    }
  }

  value = value.replace(/^@+/, "");
  value = value.split(/[/?#]/)[0] ?? "";
  return value.trim().toLowerCase();
}

/** The accounts this user has connected, keyed by platform, as bare handles. */
export function verifiedAccounts(socials: unknown): Partial<Record<Platform, string>> {
  const source = (socials ?? {}) as Record<string, unknown>;
  const out: Partial<Record<Platform, string>> = {};
  for (const [key, value] of Object.entries(source)) {
    const platform = normalizePlatform(key);
    if (!platform) continue;
    const handle = normaliseHandle(value);
    if (handle) out[platform] = handle;
  }
  return out;
}

/** Human guidance for the URL forms that cannot be verified, per platform. */
function unverifiableGuidance(platform: Platform): string {
  switch (platform) {
    case "youtube":
      return "That YouTube link does not name the channel, so it cannot be verified. Open the video from your own channel and copy that link instead — it looks like youtube.com/@yourhandle/shorts/…";
    case "instagram":
      return "That Instagram link does not name the account, so it cannot be verified. Open the post from your profile and copy the link — it looks like instagram.com/yourhandle/reel/…";
    case "tiktok":
      return "That TikTok link does not name the account, so it cannot be verified. Paste the full link, which looks like tiktok.com/@yourhandle/video/…";
    default:
      return "That X link does not name an account. Paste the link to the post itself — it looks like x.com/yourhandle/status/…";
  }
}

/**
 * The rule, in one place: a link is only accepted when its author is an account this user has
 * verified in their profile.
 *
 * Order matters for the message quality. "You have not connected anything yet" is more useful
 * than "that handle does not match", and "that is a TikTok link" is more useful than "unverified".
 */
export function verifySubmissionAccount({
  url,
  platform,
  socials,
}: {
  url: string;
  /** The platform the user picked in the form. */
  platform: Platform;
  /** Raw `User.socials` from the database. */
  socials: unknown;
}): SocialCheckResult {
  const accounts = verifiedAccounts(socials);
  const connected = Object.entries(accounts) as [Platform, string][];

  // 1. Nothing connected: no link could ever pass, so say that first.
  if (connected.length === 0) {
    return {
      ok: false,
      code: "no_accounts",
      message:
        "Verify a social account in Settings before submitting. Bagwork only accepts content from accounts you have verified.",
    };
  }

  // 2. Which platform is this link actually from?
  const detected = platformFromUrl(url);
  if (!detected) {
    return {
      ok: false,
      code: "unverifiable_link",
      message:
        "That link is not a post on X, TikTok, Instagram or YouTube. Paste the full link to your post, starting with https://.",
    };
  }

  // 3. The host must agree with the platform selected, otherwise the verified account being
  //    checked would be the wrong one entirely.
  if (detected !== platform) {
    const theirs = accounts[detected];
    return {
      ok: false,
      code: "wrong_platform",
      message: `That is a ${label(detected)} link, but you selected ${label(platform)}. Switch the platform to ${label(detected)}${
        theirs ? ` (your verified account there is @${theirs})` : ""
      } and submit again.`,
    };
  }

  // 4. Is the author named in the link at all?
  const handle = extractHandle(url, platform);
  if (!handle) {
    return { ok: false, code: "unverifiable_link", message: unverifiableGuidance(platform) };
  }

  // 5. Does the author match the account this user verified for that platform?
  const verified = accounts[platform];
  if (verified === handle) {
    return { ok: true, handle, platform };
  }

  if (verified) {
    return {
      ok: false,
      code: "not_connected",
      message: `${label(platform)} account @${handle} is not linked to your profile. The ${label(platform)} account you verified is @${verified} — verify @${handle} in Settings to submit its content.`,
    };
  }

  return {
    ok: false,
    code: "not_connected",
    message: `This account is not verified. ${label(platform)} account @${handle} is not linked to your profile — verify it in Settings first.`,
  };
}

function label(platform: Platform): string {
  return { x: "X", tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" }[platform];
}

