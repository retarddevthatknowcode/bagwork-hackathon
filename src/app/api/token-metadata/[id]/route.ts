import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";

/**
 * GET /api/token-metadata/[id] — serve a launched coin's metadata document.
 *
 * Public and CORS-open on purpose. This URL is handed to the pump program and then read by every
 * wallet, explorer and trading terminal that renders the coin — none of which share our origin, and
 * several of which fetch from a browser. A same-origin-only document would mean a coin that displays
 * a blank name in the places it matters most.
 *
 * Safe to serve that widely because the content is not user-authored HTML: it is a JSON document
 * whose fields were validated when the launch was drafted, served with `nosniff` so a browser cannot
 * be talked into treating it as anything else. The bytes for an id never change, so it caches hard.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const upload = await db.upload.findUnique({
    where: { id },
    select: { data: true, mimeType: true },
  });

  if (!upload) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // `data` arrives as a Buffer from Prisma's Bytes column; copy it into a plain Uint8Array so the
  // response body is a stable, transferable type.
  const body = new Uint8Array(upload.data);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": upload.mimeType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
