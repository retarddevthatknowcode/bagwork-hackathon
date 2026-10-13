import { db } from "@/lib/db";

/**
 * Finding a Bagworker by whatever a link or an address bar happens to carry.
 *
 * A profile is named either by `handle` or by the permanent `Bagworker#number`, and the profile
 * rules allow an all-digit handle — so a purely numeric value is tried as *both* a number and a
 * handle before giving up. Shared by the contribution calendar and the public profile, so a link
 * that resolves in one always resolves in the other.
 */

/** Identity only — a public read must not be able to ask for more than this. */
const PUBLIC_USER = { id: true, handle: true, profileNumber: true } as const;

export interface PublicIdentity {
  id: string;
  handle: string | null;
  profileNumber: number | null;
}

/** Strips a leading `@` or `#` so pasted identifiers work either way. */
export async function resolveBagworker(raw: string | null): Promise<PublicIdentity | null> {
  const value = (raw ?? "").trim().replace(/^@/, "").replace(/^#/, "");
  if (!value) return null;

  const asNumber = /^\d+$/.test(value) ? Number.parseInt(value, 10) : null;

  return db.user.findFirst({
    where:
      asNumber === null
        ? { handle: value.toLowerCase() }
        : { OR: [{ profileNumber: asNumber }, { handle: value.toLowerCase() }] },
    select: PUBLIC_USER,
  });
}
