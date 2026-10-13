import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { fetchPostContent, parseXStatus } from "@/lib/review/post-content";

/**
 * Everything the hover card needs to render a real post, in one response.
 *
 * The card shows X's own embed when it can, so this exists to (a) prove the post is readable before
 * an embed is attempted, and (b) render a faithful card — avatar, display name, handle, text, exact
 * time, media, engagement — when the embed cannot load (blocked, offline, deleted).
 *
 * The client only asks for this when a pointer or keyboard focus lands on a link, and the answer is
 * shared at the edge for five minutes, so a table of twenty links costs nothing until someone reads
 * one. Signed-in only: without that this would be an open proxy for fetching arbitrary post
 * metadata on someone else's bandwidth bill.
 */

/** The platform a link belongs to, derived from its host — never trusted from the caller. */
function platformFromUrl(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
  if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")) {
    return "x";
  }
  if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") {
    return "youtube";
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
  return null;
}

export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const url = (request.nextUrl.searchParams.get("url") ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "A full http(s) link is required" }, { status: 400 });
  }

  const platform = platformFromUrl(url);
  if (!platform) {
    return NextResponse.json({ error: "No preview available for this link" }, { status: 404 });
  }

  const post = await fetchPostContent(url, platform);
  if (!post) {
    return NextResponse.json({ error: "No preview available for this post" }, { status: 404 });
  }

  return NextResponse.json(
    {
      platform,
      // What X's embed renders from. Distinct from the link's handle, which can be wrong.
      statusId: platform === "x" ? (parseXStatus(url)?.id ?? null) : null,
      author: {
        handle: post.author,
        name: post.authorName ?? null,
        avatar: post.authorAvatar ?? null,
        verified: Boolean(post.authorVerified),
      },
      // A snippet, not the whole thread: this is a hover card, not a reader.
      text: post.text.slice(0, 280),
      truncated: post.text.length > 280,
      createdAt: post.createdAt ?? null,
      permalink: post.permalink ?? post.url,
      media: { thumbnail: post.mediaThumbnail ?? null, kind: post.mediaKind ?? null },
      metrics: post.metrics,
      hasMedia: post.hasMedia,
      source: post.source,
    },
    {
      headers: {
        // Public post metadata, so it is safe to share between users; short enough to stay honest
        // when a post is edited or deleted.
        "cache-control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
