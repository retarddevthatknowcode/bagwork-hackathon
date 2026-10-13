import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/providers";
import { OPEN_GRAPH_DEFAULTS, SITE_DESCRIPTION, SITE_URL } from "@/lib/site";

/**
 * The three brand faces, self-hosted rather than pulled from `next/font/google`.
 *
 * `next/font/google` resolves a family by fetching Google's css2 stylesheet at build time. That
 * endpoint intermittently answers with an extensionless `/l/font?kit=...&skey=...&v=...` url instead
 * of `/s/<family>/<version>/<hash>.woff2`. Turbopack carries the font url inside the query string of
 * its internal font module and then parses that string with a query-string parser, so the `&` splits
 * it into several pairs and the build dies with:
 *
 *     next/font/google queries have exactly one entry
 *
 * It only bites on a build with a cold font cache — CI, and a clean checkout — never a local rebuild
 * against a warm `.next`, which is exactly what makes it read as a random flake. vercel/next.js#99114
 * is still open across 16.2.x and 16.3.x, so there is no version to move to. Serving the files from
 * the repo removes the fetch, and the failure mode with it.
 *
 * These are byte-for-byte the files Google served for the previous configuration (Inter 100..900,
 * Space Mono 400/700, Syne 400..800), latin subset only — which is all `subsets: ["latin"]` asked
 * for — so nothing renders differently. Inter and Syne are variable, hence the ranges. All three
 * families are OFL, so redistributing them is fine. Refresh with `bun run fonts:fetch`.
 *
 * `adjustFontFallback` is explicit because `next/font/google` generated an Arial-metric fallback
 * automatically; pinning the same here keeps the swap-in identical during the brief `display: swap`
 * window.
 */
const spaceMono = localFont({
  src: [
    { path: "./fonts/space-mono-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/space-mono-latin-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-space-mono",
  display: "swap",
  adjustFontFallback: "Arial",
});

// Console (product) typography — see `.console` in globals.css.
const inter = localFont({
  src: [{ path: "./fonts/inter-latin-100-900.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-inter",
  display: "swap",
  adjustFontFallback: "Arial",
});

const syne = localFont({
  src: [{ path: "./fonts/syne-latin-400-800.woff2", weight: "400 800", style: "normal" }],
  variable: "--font-syne",
  display: "swap",
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  /**
   * Every relative URL in the metadata below is resolved against this — the canonical on each page,
   * and the Open Graph and Twitter images. Without it those tags are emitted as relative paths and
   * each crawler resolves them against whatever host it happened to use, which is how a shared link
   * ends up previewing from a URL the site is not served from.
   */
  metadataBase: new URL(SITE_URL),
  title: "BAGWORK — Get Paid to Create",
  description: SITE_DESCRIPTION,
  keywords: [
    "BAGWORK",
    "Solana",
    "content rewards",
    "creator marketplace",
    "crypto marketing",
    "content rewards",
    "UGC",
    "on-chain payouts",
  ],
  authors: [{ name: "BAGWORK" }],
  icons: {
    icon: "/bagwork-logo.png",
  },
  openGraph: {
    ...OPEN_GRAPH_DEFAULTS,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "BAGWORK — Get Paid to Create",
    description: "Create content. Get paid.",
    images: ["/bagwork-logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${spaceMono.variable} ${inter.variable} ${syne.variable} antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
