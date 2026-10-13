import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/app/api/admin/login/route";

export const dynamic = "force-dynamic";

/**
 * Accepted image types. Deliberately a short allow-list: whatever is stored here is served
 * back with its own content type, so accepting `image/svg+xml` would let an uploader serve
 * arbitrary script from our origin.
 */
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** 600 KB. Big enough for a wide banner, small enough to live in a database row. */
const MAX_BYTES = 600 * 1024;

/**
 * POST /api/uploads/banner — store banner artwork and return a URL to it.
 *
 * Returns a same-origin path, so the campaign's `bannerUrl` does not depend on any external
 * host continuing to serve the file. `POST /api/campaigns` accepts this path or an absolute
 * http(s) URL, and rejects anything else.
 *
 * Two callers: a signed-in publisher uploading their bag's artwork, and the operator console,
 * which has no Privy session at all — its credential is the httpOnly admin cookie. Both go
 * through this one handler so there is exactly one place that checks the type, the size and
 * the container signature. The stored row is the same either way; an operator upload simply
 * has no `userId`.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session && !isAdmin(req)) {
    return NextResponse.json(
      { error: "Sign in required to upload artwork" },
      { status: 401 },
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No image was uploaded" }, { status: 400 });
  }

  if (!ALLOWED_TYPES[file.type]) {
    return NextResponse.json(
      { error: "Use a PNG, JPG or WebP image" },
      { status: 415 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That image is ${Math.round(file.size / 1024)} KB — the limit is 600 KB` },
      { status: 413 },
    );
  }

  const data = Buffer.from(await file.arrayBuffer());

  // The declared type is not enough on its own: `file.type` is caller-supplied, so check the
  // magic bytes too. A file claiming to be a PNG but starting with something else is not
  // stored.
  if (!looksLikeImage(data, file.type)) {
    return NextResponse.json(
      { error: "That file is not a valid image" },
      { status: 415 },
    );
  }

  const upload = await db.upload.create({
    data: {
      // Null for an operator upload: the console signs in with a shared password, not a user.
      userId: session?.user.id ?? null,
      mimeType: file.type,
      bytes: data.byteLength,
      data,
    },
    select: { id: true },
  });

  return NextResponse.json({ url: `/api/uploads/banner/${upload.id}` }, { status: 201 });
}

/** Container-signature check for the three formats we accept. */
function looksLikeImage(data: Buffer, mime: string): boolean {
  if (data.byteLength < 12) return false;
  if (mime === "image/png") {
    return data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47;
  }
  if (mime === "image/jpeg") {
    return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  }
  if (mime === "image/webp") {
    // "RIFF" .... "WEBP"
    return (
      data.toString("ascii", 0, 4) === "RIFF" &&
      data.toString("ascii", 8, 12) === "WEBP"
    );
  }
  return false;
}
