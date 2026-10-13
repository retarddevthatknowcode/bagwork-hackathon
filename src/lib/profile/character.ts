/**
 * The Bagworker character — a composable pixel character.
 *
 * The old avatar picker offered six finished characters and nothing else, so every
 * profile looked like one of six people. This replaces it with a small character builder:
 * a fixed body silhouette, and independent layers for hair, eyes, accessory, top and
 * background. Drawing it as SVG rects on a 16×16 grid (rather than shipping image files)
 * keeps it crisp at 24px in the top bar and at 160px in onboarding, costs no network, and
 * cannot 404.
 *
 * Grid legend — every glyph is resolved per layer, so the same letter can mean different
 * colours in different layers:
 *   `.` transparent  `o` outline/dark  `s` skin   `h` hair
 *   `e` eye          `m` mouth         `c` top (main)  `a` top (accent) / accessory
 *   `g` lens/glass
 *
 * Layer order: background → body → hair → top → eyes → accessory. The top is painted
 * after the hair so a shirt always covers hair that reaches the collar, and the accessory
 * is last so glasses or headphones sit on top of everything.
 */

export const CHARACTER_SIZE = 16;

/** Pure module: no React, no Prisma — safe on the server and in the browser. */
export interface CharacterOption {
  key: string;
  label: string;
}

/* ------------------------------------------------------------------ skins */

export interface SkinTone extends CharacterOption {
  /** The skin fill. */
  color: string;
  /** A darker version of the same tone, used for the mouth so it never looks pasted on. */
  shade: string;
}

export const SKIN_TONES: readonly SkinTone[] = [
  { key: "porcelain", label: "Porcelain", color: "#f2d3b6", shade: "#b4795d" },
  { key: "sand", label: "Sand", color: "#e8b98d", shade: "#a9553f" },
  { key: "honey", label: "Honey", color: "#d79a6a", shade: "#8c4a2f" },
  { key: "bronze", label: "Bronze", color: "#c98a5b", shade: "#7a4630" },
  { key: "umber", label: "Umber", color: "#8a5836", shade: "#5c3222" },
  { key: "espresso", label: "Espresso", color: "#5c3a24", shade: "#3c2416" },
];

/* ------------------------------------------------------------- hair colours */

export interface HairColor extends CharacterOption {
  color: string;
}

export const HAIR_COLORS: readonly HairColor[] = [
  { key: "ink", label: "Ink", color: "#1b1410" },
  { key: "chestnut", label: "Chestnut", color: "#4a2c1a" },
  { key: "copper", label: "Copper", color: "#b5522a" },
  { key: "blonde", label: "Blonde", color: "#e0b34d" },
  { key: "platinum", label: "Platinum", color: "#e6e1d5" },
  { key: "violet", label: "Violet", color: "#7a4bd0" },
];

/* --------------------------------------------------------------- backgrounds */

export interface BackgroundColor extends CharacterOption {
  color: string;
}

/**
 * Six flat plates. Mid-to-light values on purpose: the outline is near-black, so a plate
 * has to sit clear of it for the silhouette to read at 24px.
 */
export const BACKGROUNDS: readonly BackgroundColor[] = [
  { key: "ink", label: "Ink", color: "#1c1a16" },
  { key: "moss", label: "Moss", color: "#2f4a1e" },
  { key: "dusk", label: "Dusk", color: "#3a2c4e" },
  { key: "rust", label: "Rust", color: "#5a2f1e" },
  { key: "steel", label: "Steel", color: "#2b3a45" },
  { key: "sand", label: "Sand", color: "#c9b283" },
];

/* -------------------------------------------------------------------- body */

/** Row indices → exactly `CHARACTER_SIZE` glyphs. Rows not listed are transparent. */
export type LayerRows = Record<number, string>;

export const OUTLINE_COLOR = "#0b0a07";

/**
 * The silhouette: head (rows 1–10), neck (11) and shoulders (12–15).
 *
 * Fixed for everyone — it is what makes two different characters recognisably part of the
 * same cast. Everything personalisable is drawn on top of it.
 */
export const BODY_ROWS: LayerRows = {
  1: "....oooooooo....",
  2: "...osssssssso...",
  3: "..osssssssssso..",
  4: "..osssssssssso..",
  5: "..osssssssssso..",
  6: "..osssssssssso..",
  7: "..osssssssssso..",
  8: "..osssssssssso..",
  9: "..ossssmmsssso..",
  10: "...osssssssso...",
  11: "....osssssso....",
  12: "...occcccccco...",
  13: "..occcccccccco..",
  14: "..occcccccccco..",
  15: ".occcccccccccco.",
};

/* --------------------------------------------------------------- hair styles */

export interface HairStyle extends CharacterOption {
  rows: LayerRows;
}

/**
 * Six styles, authored against the body above.
 *
 * They only ever use 'h' and 'o' (hair colour and its outline) and stop at the collar —
 * hair drawn onto the shirt would have to know which top was chosen, which is how a
 * character system turns into an unmaintainable matrix of combinations.
 */
export const HAIR_STYLES: readonly HairStyle[] = [
  {
    key: "crop",
    label: "Short crop",
    rows: {
      0: "....oooooooo....",
      1: "...ohhhhhhhho...",
      2: "..ohhhhhhhhhho..",
      3: "..ohhsssssshho..",
      4: "..ohssssssssho..",
    },
  },
  {
    key: "fringe",
    label: "Fringe",
    rows: {
      0: "....oooooooo....",
      1: "...ohhhhhhhho...",
      2: "..ohhhhhhhhhho..",
      3: "..ohhhhhhhhhho..",
      4: "..ohhhhhhhhhho..",
      5: "..ohssssssssho..",
    },
  },
  {
    key: "crest",
    label: "Crest",
    rows: {
      0: ".......oo.......",
      1: "......ohho......",
      2: "...ohhhhhhhho...",
      3: "..ohhhhhhhhhho..",
      4: "..ohssssssssho..",
    },
  },
  {
    key: "long",
    label: "Long",
    rows: {
      0: "....oooooooo....",
      1: "...ohhhhhhhho...",
      2: "..ohhhhhhhhhho..",
      3: "..ohhsssssshho..",
      4: "..ohssssssssho..",
      5: "..ohssssssssho..",
      6: "..ohssssssssho..",
      7: "..ohssssssssho..",
      8: "..ohssssssssho..",
      9: "..ohssssssssho..",
      10: "..ohssssssssho..",
      11: "..ohssssssssho..",
    },
  },
  {
    key: "bun",
    label: "Top bun",
    rows: {
      0: "......oooo......",
      1: "......ohho......",
      2: "...ohhhhhhhho...",
      3: "..ohhhhhhhhhho..",
      4: "..ohhsssssshho..",
      5: "..ohssssssssho..",
    },
  },
  {
    key: "puff",
    label: "Volume",
    rows: {
      0: "..ohhhhhhhhhho..",
      1: ".ohhhhhhhhhhhho.",
      2: "..ohhhhhhhhhho..",
      3: "..ohhsssssshho..",
      4: "..ohssssssssho..",
    },
  },
];

/* ---------------------------------------------------------------------- eyes */

export interface EyeStyle extends CharacterOption {
  rows: LayerRows;
}

/** Four looks. All of them sit inside the body's head interior (x3–x12). */
export const EYE_STYLES: readonly EyeStyle[] = [
  {
    key: "round",
    label: "Round",
    rows: {
      6: "..osseesseesso..",
      7: "..osseesseesso..",
    },
  },
  {
    key: "wide",
    label: "Wide",
    rows: {
      6: "..oseeesseeeso..",
      7: "..oseeesseeeso..",
    },
  },
  {
    key: "narrow",
    label: "Narrow",
    rows: {
      6: "..osssessessso..",
      7: "..osssessessso..",
    },
  },
  {
    key: "calm",
    label: "Calm",
    rows: {
      6: "..ossoossoosso..",
      7: "..osseesseesso..",
    },
  },
];

/* -------------------------------------------------------------- accessories */

export interface Accessory extends CharacterOption {
  rows: LayerRows;
  /**
   * Its own palette, so a pair of glasses can have a metal rim.
   *
   * Without this, the accessory layer's `o` was the same near-black as the eyes, and a rim
   * drawn *around* the eyes merged with them into one dark band across the face — which reads
   * as a blindfold, not as glasses.
   */
  colors: Record<string, string>;
}

/** "None" first so it is the natural resting choice in the picker. */
export const ACCESSORIES: readonly Accessory[] = [
  { key: "none", label: "None", rows: {}, colors: {} },
  {
    key: "glasses",
    label: "Glasses",
    rows: {
      // Inset by two on each side so the head's own outline still reads at the temples.
      5: "....oooooooo....",
      6: "....o..oo..o....",
      7: "....oooooooo....",
    },
    colors: { o: "#9fb4c0" },
  },
  {
    key: "sunglasses",
    label: "Sunglasses",
    rows: {
      5: "..oooooooooooo..",
      6: "..gggggggggggg..",
      7: "..gggggggggggg..",
    },
    colors: { o: OUTLINE_COLOR, g: "#101c26" },
  },
  {
    key: "headphones",
    label: "Headphones",
    rows: {
      0: "....oooooooo....",
      1: "...o........o...",
      2: "..o..........o..",
      3: "aa............aa",
      4: "aa............aa",
      5: "aa............aa",
      6: "aa............aa",
      7: "aa............aa",
      8: "a..............a",
      9: "a..............a",
    },
    colors: { o: OUTLINE_COLOR, a: "#bdfe00" },
  },
];

/* ---------------------------------------------------------------------- tops */

export interface TopStyle extends CharacterOption {
  rows: LayerRows;
  /** Each top ships its own pair, so five tops read as five different garments. */
  colors: { main: string; accent: string };
}

/** Five tops. Rows 12–15 are the shoulders; a hooded top also takes row 11 (the collar). */
export const TOP_STYLES: readonly TopStyle[] = [
  {
    key: "tee",
    label: "Tee",
    colors: { main: "#31507a", accent: "#e9e2d0" },
    rows: {
      12: "...oaaaaaaaao...",
      13: "..occcccccccco..",
      14: "..occcccccccco..",
      15: ".oaaaaaaaaaaaao.",
    },
  },
  {
    key: "vneck",
    label: "V-neck",
    colors: { main: "#7a3b2f", accent: "#7a3b2f" },
    rows: {
      12: "...ocssssssco...",
      13: "..occcssssccco..",
      14: "..occcccccccco..",
      15: ".occcccccccccco.",
    },
  },
  {
    key: "hoodie",
    label: "Hoodie",
    colors: { main: "#33452f", accent: "#bdfe00" },
    rows: {
      11: "...occcccccco...",
      12: "...occcccccco...",
      13: "..occcacccacco..",
      14: "..occcccccccco..",
      15: ".occcccccccccco.",
    },
  },
  {
    key: "jacket",
    label: "Jacket",
    colors: { main: "#2b2440", accent: "#c4a2ff" },
    rows: {
      12: "...occcaaacco...",
      13: "..occcaaaaccco..",
      14: "..occcaaaaccco..",
      15: ".occccaaaacccco.",
    },
  },
  {
    key: "striped",
    label: "Striped",
    colors: { main: "#1f3a3a", accent: "#e0b34d" },
    rows: {
      12: "...occcccccco...",
      13: "..occcccccccco..",
      14: "..oaaaaaaaaaao..",
      15: ".occcccccccccco.",
    },
  },
];

/* ------------------------------------------------------------------- config */

/**
 * A saved character: one key per option row.
 *
 * Stored as the *choice set*, not as baked pixels, so the renderer can be repainted later
 * without migrating a single row.
 */
export interface CharacterConfig {
  skin: string;
  hair: string;
  hairColor: string;
  eyes: string;
  accessory: string;
  top: string;
  background: string;
}

export const DEFAULT_CHARACTER: CharacterConfig = {
  skin: "sand",
  hair: "crop",
  hairColor: "ink",
  eyes: "round",
  accessory: "none",
  top: "tee",
  background: "ink",
};

/** Every option key, per field — the validation table for the API and the pickers. */
export const CHARACTER_KEYS: Record<keyof CharacterConfig, readonly string[]> = {
  skin: SKIN_TONES.map((option) => option.key),
  hair: HAIR_STYLES.map((option) => option.key),
  hairColor: HAIR_COLORS.map((option) => option.key),
  eyes: EYE_STYLES.map((option) => option.key),
  accessory: ACCESSORIES.map((option) => option.key),
  top: TOP_STYLES.map((option) => option.key),
  background: BACKGROUNDS.map((option) => option.key),
};

export const CHARACTER_FIELDS = Object.keys(CHARACTER_KEYS) as (keyof CharacterConfig)[];

function pickKey(options: readonly CharacterOption[], roll: number): string {
  return options[Math.min(options.length - 1, Math.floor(roll * options.length))].key;
}

/** A fresh, complete, random look — the "Randomize" button and the first-run default. */
export function randomCharacter(): CharacterConfig {
  return {
    skin: pickKey(SKIN_TONES, Math.random()),
    hair: pickKey(HAIR_STYLES, Math.random()),
    hairColor: pickKey(HAIR_COLORS, Math.random()),
    eyes: pickKey(EYE_STYLES, Math.random()),
    accessory: pickKey(ACCESSORIES, Math.random()),
    top: pickKey(TOP_STYLES, Math.random()),
    background: pickKey(BACKGROUNDS, Math.random()),
  };
}

/**
 * A stable character for a seed (we use the Bagworker number).
 *
 * This is the fallback for accounts that predate the builder and never chose a character.
 * Deriving it from the number rather than hashing noise means a given profile keeps exactly
 * the same face across devices, sessions and servers.
 */
export function characterFromSeed(seed: number): CharacterConfig {
  // Park–Miller LCG: tiny, deterministic, and good enough to spread ~9,000 seeds across the
  // option space without visible clustering.
  let state = (Math.abs(Math.floor(seed)) % 2147483647) || 1;
  const roll = () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
  return {
    skin: pickKey(SKIN_TONES, roll()),
    hair: pickKey(HAIR_STYLES, roll()),
    hairColor: pickKey(HAIR_COLORS, roll()),
    eyes: pickKey(EYE_STYLES, roll()),
    accessory: pickKey(ACCESSORIES, roll()),
    top: pickKey(TOP_STYLES, roll()),
    background: pickKey(BACKGROUNDS, roll()),
  };
}

/**
 * Reads an arbitrary JSON value into a valid character.
 *
 * Returns `null` only when there is nothing usable at all. Individual unknown keys fall back
 * to the default, so a character saved by an older version — or one whose option was renamed
 * — still renders instead of throwing.
 */
export function parseCharacter(value: unknown): CharacterConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;

  const result = { ...DEFAULT_CHARACTER };
  let matched = false;

  for (const field of CHARACTER_FIELDS) {
    const raw = source[field];
    if (typeof raw === "string" && CHARACTER_KEYS[field].includes(raw)) {
      result[field] = raw;
      matched = true;
    }
  }

  return matched ? result : null;
}

/** `parseCharacter`, with the profile's own seeded look as the fallback. */
export function resolveCharacter(value: unknown, seed: number): CharacterConfig {
  return parseCharacter(value) ?? characterFromSeed(seed);
}

/* ------------------------------------------------------------------- render */

export interface CharacterPart {
  x: number;
  y: number;
  fill: string;
}

export interface RenderedCharacter {
  size: number;
  background: string;
  parts: CharacterPart[];
}

const EYE_COLOR = OUTLINE_COLOR;

function findOption<T extends CharacterOption>(options: readonly T[], key: string): T {
  return options.find((option) => option.key === key) ?? options[0];
}

/**
 * Flattens a character into positioned rects.
 *
 * Layers are painted in order into a `size × size` grid of colours and the result is
 * flattened once, so a pixel covered by a later layer is never emitted and the caller gets
 * the smallest possible list to render.
 */
export function renderCharacter(character: CharacterConfig): RenderedCharacter {
  const skin = findOption(SKIN_TONES, character.skin);
  const hair = findOption(HAIR_STYLES, character.hair);
  const hairColor = findOption(HAIR_COLORS, character.hairColor);
  const eyes = findOption(EYE_STYLES, character.eyes);
  const accessory = findOption(ACCESSORIES, character.accessory);
  const top = findOption(TOP_STYLES, character.top);
  const background = findOption(BACKGROUNDS, character.background);

  const grid: (string | null)[][] = Array.from({ length: CHARACTER_SIZE }, () =>
    Array.from({ length: CHARACTER_SIZE }, () => null as string | null),
  );

  const paint = (rows: LayerRows, palette: Record<string, string>) => {
    for (const [rowKey, line] of Object.entries(rows)) {
      const y = Number(rowKey);
      if (!Number.isInteger(y) || y < 0 || y >= CHARACTER_SIZE) continue;
      const glyphs = [...line];
      for (let x = 0; x < CHARACTER_SIZE && x < glyphs.length; x++) {
        const fill = palette[glyphs[x]];
        if (fill) grid[y][x] = fill;
      }
    }
  };

  paint(BODY_ROWS, {
    o: OUTLINE_COLOR,
    s: skin.color,
    m: skin.shade,
    c: top.colors.main,
    a: top.colors.accent,
  });
  paint(hair.rows, { o: OUTLINE_COLOR, h: hairColor.color });
  paint(top.rows, {
    o: OUTLINE_COLOR,
    c: top.colors.main,
    a: top.colors.accent,
    s: skin.color,
  });
  paint(eyes.rows, { e: EYE_COLOR, o: EYE_COLOR });
  paint(accessory.rows, accessory.colors);

  const parts: CharacterPart[] = [];
  for (let y = 0; y < CHARACTER_SIZE; y++) {
    for (let x = 0; x < CHARACTER_SIZE; x++) {
      const fill = grid[y][x];
      if (fill) parts.push({ x, y, fill });
    }
  }

  return { size: CHARACTER_SIZE, background: background.color, parts };
}
