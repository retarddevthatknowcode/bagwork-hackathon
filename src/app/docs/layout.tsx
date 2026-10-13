import type { ReactNode } from "react";

import { DocsShell } from "@/components/docs/docs-shell";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";

// Route-scoped on purpose: this is the only place Fumadocs' stylesheet is loaded, so the marketing
// site and the console never pay for it. See the file for why the tokens cannot collide.
import "./docs.css";

/**
 * The /docs segment.
 *
 * `/docs` wears the **same chrome as the rest of the site**: the marketing `Header` above it and the
 * marketing `Footer` below it — literally the components `/` renders, not copies of them. That is
 * the whole point of this layout: no docs-only header, no docs-only footer, no second logo. The
 * only thing between them is the docs' own section rail, which is the one piece of chrome this page
 * genuinely needs.
 *
 * The `<div className="flex min-h-screen flex-col">` wrapper is what makes the footer sit at the
 * bottom of a short page instead of floating mid-screen, and it mirrors the marketing page exactly
 * so the two routes compose the same way.
 *
 * `DocsShell` is a **server component**: the rail is a static list with no state, no effects, no
 * observers and no event handlers, so /docs ships no JavaScript for its chrome at all. `children`
 * here is the server-rendered page, so the document still ships as HTML.
 */
export default function DocsRouteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <DocsShell>{children}</DocsShell>
      </main>
      <Footer />
    </div>
  );
}
