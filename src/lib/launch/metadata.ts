import { db } from "@/lib/db";
import { SITE_URL, absoluteUrl, isFetchableImageUrl } from "@/lib/site";

import type { LaunchDraft } from "./wizard";

/**
 * The coin's metadata document, hosted by Bagwork.
 *
 * pump's `create_v2` does not take a name and a picture; it takes a *URI* to a JSON document, and
 * every wallet, explorer and trading terminal reads the coin's identity out of that document. So a
 * launch is not possible without somewhere to host it, and pointing the instruction at a URL the
 * launcher has to prepare themselves would make the wizard a lie.
 *
 * Stored in the same `uploads` table the banner flow uses, for the same reason: this deployment has
 * no object-storage bucket, and these documents are a few hundred bytes. The row is the artwork and
 * the identity together, so there is one thing to serve and one thing to cache.
 */

const METADATA_MIME = "application/json";

/**
 * The document wallets expect, as the pump/metaplex convention defines it.
 *
 * `website` is required and `twitter` is not: a coin launched here always points home at Bagwork, so
 * that field is never empty, while the X link is the launcher's to set or leave alone.
 */
export interface TokenMetadataDocument {
  name: string;
  symbol: string;
  description: string;
  image: string;
  showName: boolean;
  createdOn: string;
  twitter?: string;
  telegram?: string;
  website: string;
}

/**
 * Builds the metadata document for a draft.
 *
 * `image` is absolutised on purpose. `draft.imageUrl` is usually a same-origin path like
 * `/api/uploads/banner/<id>`, which is right for our own pages but useless to a wallet reading the
 * JSON from elsewhere — it would resolve against whatever host fetched it and render nothing. Every
 * outbound reference in this document is made absolute for that reason, and the result is checked to
 * be fetchable before it is written.
 *
 * `website` is passed in rather than derived, because the only correct value is this bag's own page
 * and that URL belongs to the caller — the launch route, which is where the bag's id comes from. See
 * the note on the field below.
 */
export function buildTokenMetadata(
  draft: LaunchDraft,
  { website }: { website: string },
): TokenMetadataDocument {
  if (!draft.imageUrl) {
    throw new Error(
      "A coin cannot be launched without an image — the metadata would point every wallet at a " +
        "placeholder.",
    );
  }

  const image = draft.imageUrl.startsWith("/")
    ? absoluteUrl(draft.imageUrl)
    : draft.imageUrl;

  /*
   * Checked here as well as at the route, because this is the last point before the string is
   * written into a document that cannot be corrected afterwards.
   */
  if (!isFetchableImageUrl(image)) {
    throw new Error(`The token image URL is not fetchable from outside this app: ${image}`);
  }

  return {
    name: draft.name,
    symbol: draft.symbol,
    description: draft.description,
    image,
    showName: true,
    createdOn: SITE_URL,
    ...(draft.socials.x ? { twitter: draft.socials.x } : {}),
    ...(draft.socials.telegram ? { telegram: draft.socials.telegram } : {}),
    /*
     * Not from the draft, and not optional.
     *
     * `website` is this coin's page on Bagwork — the bag it was launched to fund — so it is this
     * bag's own URL (`https://bag-work.fun/dashboard/bags/<id>`), not the domain. That is why the
     * launch reserves the bag before it builds anything: the id has to exist before the metadata can
     * name it, and the metadata has to exist before the transaction can embed its URI.
     *
     * It is passed in rather than read from `LaunchSocials`, which has no `website` field at all. A
     * request cannot set it, which is what "fixed" has to mean for a value written on-chain and
     * uneditable afterwards.
     */
    website,
  };
}

export interface StoredMetadata {
  /** The upload row's id, kept on the launch so the document is traceable to what was signed. */
  id: string;
  /** The absolute URL that goes into `create_v2`. */
  url: string;
}

/**
 * Persists a draft's metadata and returns the absolute URL to put in the instruction.
 *
 * Written before the transaction is built rather than after, so the URI in a signed transaction
 * already resolves. A launch whose metadata 404s is a coin that shows up as a blank name in every
 * wallet, which is worse than a launch that did not happen.
 */
export async function storeTokenMetadata({
  userId,
  draft,
  website,
}: {
  userId: string | null;
  draft: LaunchDraft;
  /** This bag's public page, which is what the coin's `website` points at. */
  website: string;
}): Promise<StoredMetadata> {
  const document = buildTokenMetadata(draft, { website });
  const bytes = Buffer.from(JSON.stringify(document), "utf8");

  const upload = await db.upload.create({
    data: {
      userId,
      mimeType: METADATA_MIME,
      bytes: bytes.byteLength,
      data: bytes,
    },
    select: { id: true },
  });

  return { id: upload.id, url: absoluteUrl(`/api/token-metadata/${upload.id}`) };
}
