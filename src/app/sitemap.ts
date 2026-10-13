import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/site";

/**
 * The public, indexable pages.
 *
 * `/`, `/docs` and the two legal pages are the surfaces that make sense in a search result, and the
 * legal pair belong here for a practical reason as well as a marketing one: people look for a
 * privacy policy by searching for it, and a page that is only reachable from a footer is a page a
 * crawler may never find.
 *
 * The console is behind authentication and is disallowed in `robots.txt`; the bag detail pages are
 * campaign-specific, change constantly and are reached from the site itself, so listing them would
 * mean publishing a sitemap that is stale the moment a campaign is funded or ends.
 *
 * `lastModified` is omitted rather than set to "now": the content is not rebuilt on a schedule, and
 * a timestamp that moves on every deploy teaches crawlers to distrust the field.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteUrl("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteUrl("/docs"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: absoluteUrl("/terms"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: absoluteUrl("/privacy"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
