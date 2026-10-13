/**
 * Re-downloads the self-hosted brand faces in `src/app/fonts/`.
 *
 * Why these files are in the repo at all: the app used to let `next/font/google` fetch them during
 * the build, and that fetch intermittently broke the production build. Google's css2 endpoint
 * sometimes answers with an extensionless `/l/font?kit=...&skey=...&v=...` url instead of the usual
 * `/s/<family>/<version>/<hash>.woff2`; Turbopack carries the font url inside the query string of its
 * internal font module and parses that string with a query-string parser, so the `&` splits it into
 * several pairs and the build dies with "next/font/google queries have exactly one entry"
 * (vercel/next.js#99114). Serving the files locally removes the fetch, and the failure with it.
 * `src/app/layout.tsx` carries the longer version of that story.
 *
 * Run with:  bun run fonts:fetch
 *
 * Only needed if a face is added or updated. Two details are load-bearing:
 *
 *   - The User-Agent is the exact string Next sends. Google varies its response by UA, so asking as
 *     a browser would hand back files a `next/font/google` build would never have used.
 *   - Only the latin subset is downloaded, because that is all `subsets: ["latin"]` ever requested.
 *     Taking every subset would multiply the bytes for ranges this site cannot render.
 *
 * A response using the extensionless shape is retried rather than accepted, so a later person to run
 * this gets the same tidy `.woff2` urls the committed files came from. The bytes are woff2 either
 * way, which is why the retry is a nicety and not a correctness requirement.
 */

export {};

import * as fs from "node:fs";
import * as path from "node:path";

/** The UA Next pins for Google Fonts, so the response shape matches a real build. */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36";

const OUT_DIR = path.join("src", "app", "fonts");

type Job = {
  /** The css2 request. Weights are the ranges/values `src/app/layout.tsx` declares. */
  url: string;
  /** Output files are named `<prefix>-<weight>.woff2`, with spaces in a range turned into `-`. */
  prefix: string;
};

type Face = { weight: string; url: string };

const JOBS: Job[] = [
  // Inter is variable, so one file covers 100-900.
  {
    url: "https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap",
    prefix: "inter-latin",
  },
  // Space Mono is static: two weights, two files.
  {
    url: "https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap",
    prefix: "space-mono-latin",
  },
  // Syne is variable too. Google serves a single 400-800 file and points both the 600 and the 700
  // @font-face at it, so a range file is the faithful equivalent of the previous configuration.
  {
    url: "https://fonts.googleapis.com/css2?family=Syne:wght@400..800&display=swap",
    prefix: "syne-latin",
  },
];

/** Pull the latin-subset @font-face blocks out of a Google Fonts stylesheet. */
function latinFaces(css: string): Face[] {
  const faces: Face[] = [];
  const blocks = /\/\*\s*([a-z0-9-[\]]+?)\s*\*\/\s*@font-face\s*\{([\s\S]*?)\}/gi;
  let match: RegExpExecArray | null;
  while ((match = blocks.exec(css)) !== null) {
    if (match[1].trim().toLowerCase() !== "latin") continue;
    const body = match[2];
    const weight = (body.match(/font-weight:\s*([^;]+);/) ?? [])[1];
    const url = (body.match(/url\((https?:\/\/[^)]+)\)/) ?? [])[1];
    if (url) faces.push({ weight: (weight ?? "400").trim(), url });
  }
  return faces;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`css2 responded ${res.status} for ${url}`);
  return res.text();
}

/** Retries while Google answers with the extensionless `/l/font?kit=` shape. */
async function cleanFaces(url: string): Promise<Face[]> {
  let last: Face[] = [];
  for (let attempt = 1; attempt <= 8; attempt++) {
    last = latinFaces(await fetchText(url));
    if (last.length > 0 && last.every((face) => /\.woff2$/i.test(face.url))) return last;
    console.log(`  attempt ${attempt}: extensionless url, retrying`);
  }
  if (last.length > 0) {
    console.log("  giving up on a tidy url; the bytes are still woff2");
    return last;
  }
  throw new Error(`no latin @font-face found for ${url}`);
}

async function download(face: Face, prefix: string): Promise<void> {
  const weightSlug = face.weight.replace(/\s+/g, "-");
  const file = path.join(OUT_DIR, `${prefix}-${weightSlug}.woff2`);
  const res = await fetch(face.url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`font file responded ${res.status} for ${face.url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const magic = buf.subarray(0, 4).toString("latin1");
  // Guard against an HTML error page or a redirect body landing in an asset the build will serve.
  if (magic !== "wOF2") throw new Error(`${file}: expected woff2, got magic ${JSON.stringify(magic)}`);
  fs.writeFileSync(file, buf);
  console.log(`  weight ${face.weight.padEnd(9)} -> ${file} (${buf.length} bytes)`);
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const job of JOBS) {
    console.log(`\n${job.prefix}`);
    for (const face of await cleanFaces(job.url)) {
      await download(face, job.prefix);
    }
  }
  console.log(`\nwrote ${JOBS.length} families into ${OUT_DIR}`);
}

main().catch((err: unknown) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
