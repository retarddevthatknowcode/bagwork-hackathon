import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";

/**
 * GET /api/uploads/banner/[id] — serve stored banner artwork.
 *
 * Public on purpose: a bag's banner has to render for every visitor on the marketplace, so
 * there is nothing to authenticate. The id is a cuid, so it is not guessable, and the
 * response is immutable — the bytes for an id never change, so it can be cached hard.
 *
 * `Content-Type` comes from the stored value, which was checked against the file's magic
 * bytes at upload time, and `X-Content-Type-Options: nosniff` stops a browser from treating
 * it as anything else.
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

  // `data` arrives as a Buffer from Prisma's Bytes column; copy it into a plain Uint8Array
  // so the response body is a stable, transferable type.
  const body = new Uint8Array(upload.data);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": upload.mimeType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
