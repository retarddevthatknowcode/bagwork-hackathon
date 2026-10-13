/**
 * The Bagworker cast — pixel-art profile pictures.
 *
 * These are drawn as pixel grids rather than shipped as image files: a 12x12 grid scales
 * to any size, stays crisp at 16px in the top bar and at 64px on a profile, costs nothing
 * to download, and cannot 404. Six characters is enough that a bag's participant list
 * reads as different people without anyone having to upload a photo.
 *
 * Grid alphabet (see `PALETTE_KEYS`):
 *   `.` transparent   `o` outline   `s` skin     `h` hair
 *   `e` eye           `m` mouth     `c` cloth    `a` accent
 *   `g` lens/visor    `k` beard
 */

export const AVATAR_SIZE = 12;

/** Every non-transparent glyph, in the order the renderer resolves colours. */
type Glyph = "o" | "s" | "h" | "e" | "m" | "c" | "a" | "g" | "k";

export interface NpcAvatar {
  id: string;
  /** Shown in the picker and used as the accessible name. */
  name: string;
  /** One-line personality, so the picker is not six anonymous blobs. */
  blurb: string;
  colors: Record<Glyph, string>;
  /** Exactly `AVATAR_SIZE` rows of exactly `AVATAR_SIZE` glyphs. */
  grid: string[];
}

export const NPC_AVATARS: NpcAvatar[] = [
  {
    id: "zed",
    name: "Zed",
    blurb: "Hooded night-shift poster",
    colors: {
      o: "#0b0a07",
      s: "#c98a5b",
      h: "#2a2118",
      e: "#0b0a07",
      m: "#7a4630",
      c: "#3f7d7a",
      a: "#5fd97f",
      g: "#22d3ee",
      k: "#2a2118",
    },
    grid: [
      "...oooooo...",
      "..occcccco..",
      ".occcccccco.",
      ".ocssssssco.",
      ".ocssssssco.",
      ".ocggggggco.",
      ".ocggggggco.",
      ".ocssmmssco.",
      ".ocssssssco.",
      ".ocssssssco.",
      "..occcccco..",
      "...oooooo...",
    ],
  },
  {
    id: "mira",
    name: "Mira",
    blurb: "Analyst who moonlights as a creator",
    colors: {
      o: "#0b0a07",
      s: "#e8b98d",
      h: "#5b3a86",
      e: "#0b0a07",
      m: "#a9553f",
      c: "#2b2440",
      a: "#c4a2ff",
      g: "#e9d7ff",
      k: "#5b3a86",
    },
    grid: [
      "...oooooo...",
      "..ohhhhhho..",
      ".ohhhhhhhho.",
      ".ohhhssshho.",
      ".ohssssssho.",
      ".oggggggggo.",
      ".osgssssgso.",
      ".osssssssso.",
      ".osssmmssso.",
      ".ohssssssho.",
      "..ohssssho..",
      "...oooooo...",
    ],
  },
  {
    id: "kofi",
    name: "Kofi",
    blurb: "Runs three bags and a newsletter",
    colors: {
      o: "#0b0a07",
      s: "#8a5836",
      h: "#1b1410",
      e: "#0b0a07",
      m: "#5c3222",
      c: "#b07a1e",
      a: "#ffb528",
      g: "#3a2a1c",
      k: "#1b1410",
    },
    grid: [
      "...oooooo...",
      "..occcccco..",
      ".occcccccco.",
      ".ohhhhhhhho.",
      ".ohssssssho.",
      ".osesssseso.",
      ".osssssssso.",
      ".okssmmssko.",
      ".okksssskko.",
      "..okkkkkko..",
      "..oskkksso..",
      "...oooooo...",
    ],
  },
  {
    id: "yuna",
    name: "Yuna",
    blurb: "Edits clips with headphones on",
    colors: {
      o: "#0b0a07",
      s: "#f0c9a4",
      h: "#f472b6",
      e: "#0b0a07",
      m: "#c2566f",
      c: "#2d2511",
      a: "#f9a8d4",
      g: "#f9a8d4",
      k: "#f472b6",
    },
    grid: [
      "...oooooo...",
      "..ohhhhhho..",
      ".ohhhhhhhho.",
      ".ohhsssssho.",
      ".ohssssssho.",
      ".ogssssssgo.",
      ".ogesssseso.",
      ".ohssssssho.",
      ".ohssmmssho.",
      ".ohssssssho.",
      ".ohssssssho.",
      "...oooooo...",
    ],
  },
  {
    id: "rex",
    name: "Rex",
    blurb: "Loud, fast, allergic to slow review queues",
    colors: {
      o: "#0b0a07",
      s: "#d79a6a",
      h: "#ff7a45",
      e: "#0b0a07",
      m: "#8c4a2f",
      c: "#231a12",
      a: "#ff7a45",
      g: "#1b1410",
      k: "#ff7a45",
    },
    grid: [
      "...oohhoo...",
      "..oohhhhoo..",
      ".ohhhhhhhho.",
      ".ohhsssssho.",
      ".ohssssssho.",
      ".oggggggggo.",
      ".osggssggso.",
      ".osssssssso.",
      ".osssmmssso.",
      ".osssssssso.",
      "..osssssso..",
      "...oooooo...",
    ],
  },
  {
    id: "nia",
    name: "Nia",
    blurb: "Threads, carousels and clean analytics",
    colors: {
      o: "#0b0a07",
      s: "#6f4326",
      h: "#1f1a14",
      e: "#0b0a07",
      m: "#4a2a18",
      c: "#4a6b2f",
      a: "#ffe70e",
      g: "#ffe70e",
      k: "#1f1a14",
    },
    grid: [
      ".oooooooooo.",
      ".ohhoooohho.",
      ".ohhhhhhhho.",
      ".ohhsssssho.",
      ".osssssssso.",
      ".osesssseso.",
      ".osssssssso.",
      ".osssaaasso.",
      ".osssmmssso.",
      ".osssssssso.",
      "..osssssso..",
      "...oooooo...",
    ],
  },
];

export function findAvatar(id: string | null | undefined): NpcAvatar | null {
  if (!id) return null;
  return NPC_AVATARS.find((entry) => entry.id === id) ?? null;
}
