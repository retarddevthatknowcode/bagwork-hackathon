import Link from "next/link";

import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { LEGAL_UPDATED, type LegalDocument } from "@/lib/legal";

/**
 * The shell both legal pages share.
 *
 * Deliberately outside the console chrome: these are public documents about the whole product, not
 * a creator's workspace, so they render with the marketing header and footer and nothing else. A
 * reader arriving from a search result should see the site they are being asked to trust, and a
 * page about on-chain risk should never be sitting inside a signed-in dashboard.
 *
 * The reading width is capped (`max-w-3xl`) and the type is the site's rather than the console's:
 * legal copy is the one thing here people read to the end, so it gets a proper measure and a single
 * plain column with nothing decorative competing with it.
 */
export function LegalPage({ document }: { document: LegalDocument }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#bdfe00]/80">
            Legal
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {document.title}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/60">
            {document.summary}
          </p>
          <p className="mt-6 border-t border-white/10 pt-4 text-[11px] uppercase tracking-wider text-white/40">
            Last updated {LEGAL_UPDATED}
          </p>

          {/* A plain index rather than a scroll-spy rail: the document is static, and a jump list is
              the one navigation aid a long legal page genuinely needs. */}
          <nav
            aria-label="Sections of this document"
            className="mt-10 rounded-xl border border-white/10 bg-white/[0.02] p-5"
          >
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-white/40">
              On this page
            </h2>
            <ol className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {document.sections.map((section) => (
                <li key={section.id} className="text-xs">
                  <a
                    href={`#${section.id}`}
                    className="rounded text-white/60 transition-colors hover:text-[#bdfe00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bdfe00]"
                  >
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="mt-12 space-y-10">
            {document.sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-24">
                <h2 className="text-lg font-semibold text-white">{section.heading}</h2>

                {section.body.map((paragraph, index) => (
                  <p key={index} className="mt-3 text-sm leading-relaxed text-white/70">
                    {paragraph}
                  </p>
                ))}

                {section.points ? (
                  <ul className="mt-4 space-y-2">
                    {section.points.map((point, index) => (
                      <li key={index} className="flex gap-2.5 text-sm leading-relaxed text-white/70">
                        <span
                          aria-hidden="true"
                          className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#bdfe00]"
                        />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>

          {/* Stated on the page itself, not only in a README. Anyone reading this to make a decision
              deserves to know what they are reading. */}
          <div className="mt-14 rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <h2 className="text-sm font-semibold text-white">A note on this document</h2>
            <p className="mt-2 text-xs leading-relaxed text-white/60">
              This is a plain-language default, written to describe what Bagwork actually does. It is a
              starting point for review rather than a finished legal instrument: have it checked by a
              qualified professional for the jurisdiction you operate in before relying on it.
            </p>
          </div>

          <nav
            aria-label="Related pages"
            className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/10 pt-6 text-xs"
          >
            <Link
              href="/terms"
              className="rounded text-white/60 underline decoration-white/20 underline-offset-4 transition-colors hover:text-[#bdfe00] hover:decoration-[#bdfe00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bdfe00]"
            >
              Terms of Service
            </Link>
            <Link
              href="/privacy"
              className="rounded text-white/60 underline decoration-white/20 underline-offset-4 transition-colors hover:text-[#bdfe00] hover:decoration-[#bdfe00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bdfe00]"
            >
              Privacy Policy
            </Link>
            <Link
              href="/docs"
              className="rounded text-white/60 underline decoration-white/20 underline-offset-4 transition-colors hover:text-[#bdfe00] hover:decoration-[#bdfe00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bdfe00]"
            >
              How Bagwork works
            </Link>
            <Link
              href="/"
              className="ml-auto rounded text-white/50 transition-colors hover:text-[#bdfe00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bdfe00]"
            >
              ← Back to bag-work.fun
            </Link>
          </nav>
        </article>
      </main>

      <Footer />
    </div>
  );
}