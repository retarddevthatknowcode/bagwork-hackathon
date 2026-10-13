/**
 * Random handles, so a new account has a name before anyone asks for one.
 *
 * Onboarding used to open with a form asking who you are. That is a strange thing to demand
 * before someone has seen the product: they signed in to launch a coin or to claim a bag, and
 * the first screen made them invent a username. A new account is now born with a complete,
 * slightly ridiculous name and a character, and can go straight to what they came for.
 *
 * The shape is `head + tail`, with a two-digit number on roughly a third of them:
 *
 *   mooncat · bagfrog · solcrab · chipmint · yeetfox · pixeltoad · solcrab92
 *
 * Two short words rather than one long one because the result is read at 24px in a top bar and
 * typed into a URL — `mooncat` is memorable in a way `creative_content_creator` is not. The
 * number is not decoration: it breaks the collisions between the ~250 word pairs, which matters
 * because these are generated without asking anyone whether they mind sharing a name.
 *
 * Pure module — no database, no React — so the generator can be used from the server (where a
 * new account is created) and from anywhere that wants to *show* a suggestion. Claiming one is a
 * separate, server-side job: see `allocateFreeHandle` in `lib/auth/session.ts`.
 */

/** First halves. Concrete nouns that read as a brand when glued to something small. */
const HEADS = [
  "moon",
  "bag",
  "sol",
  "chip",
  "yeet",
  "pixel",
  "cosmic",
  "turbo",
  "hyper",
  "lazy",
  "feral",
  "salty",
  "crispy",
  "chunky",
  "wobbly",
  "sneaky",
  "gassed",
  "toasted",
] as const;

/** Second halves. Small, mostly animal, always one syllable-ish. */
const TAILS = [
  "cat",
  "frog",
  "crab",
  "mint",
  "fox",
  "ape",
  "toad",
  "moth",
  "sock",
  "lamp",
  "tuna",
  "goblin",
  "yeti",
  "moose",
  "duck",
  "worm",
  "shrimp",
  "otter",
] as const;

/** The longest result is 7 + 7 + 2 = 16 characters, comfortably inside `HANDLE_PATTERN`. */
export const MAX_GENERATED_HANDLE_LENGTH = 16;

/** Roughly a third carry a number: enough to spread the space, rare enough to stay clean. */
const NUMBER_CHANCE = 0.34;

function pick<T>(options: readonly T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}

/** A two-digit number, 2–99. Never `0` or `1` — a trailing single digit reads as a typo. */
export function randomHandleSuffix(): string {
  return String(2 + Math.floor(Math.random() * 98));
}

/**
 * One candidate handle. Not guaranteed to be free — that is the caller's job, because only the
 * server can ask the database, and a generator that claimed uniqueness would be lying.
 */
export function randomHandle(): string {
  const handle = `${pick(HEADS)}${pick(TAILS)}`;
  return Math.random() < NUMBER_CHANCE ? `${handle}${randomHandleSuffix()}` : handle;
}

/**
 * The same handle with a number appended, for when the plain form is taken.
 *
 * Called with an incrementing counter rather than a fresh random number, so repeated collisions
 * walk through `solcrab2`, `solcrab3`, … instead of re-rolling and landing on the same few values.
 */
export function handleWithSuffix(handle: string, attempt: number): string {
  return `${handle}${attempt}`;
}
