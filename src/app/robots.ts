import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

/**
 * `robots.txt`, generated rather than static.
 *
 * The static file this replaces allowed everything for four named crawlers and then allowed
 * everything again for `*` — two versions of the same instruction, and neither could carry the
 * sitemap URL, because a file on disk cannot know which domain is serving it. Generating it keeps
 * that line correct on the apex domain, on a preview deployment and on localhost alike.
 *
 * The console and the operator surface are excluded: both sit behind a session or a password, so
 * there is nothing there a search result should be offering. `/api` is excluded because those are
 * JSON endpoints — indexing them would only spend crawl budget on routes nobody can read.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/adminportal", "/api"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
