import { characterFromSeed, renderCharacter } from "@/lib/profile/character";
import { BAGWORKER_NUMBER_EXAMPLE, formatBagworkerNumber } from "@/lib/profile/points";

/**
 * The profile cast — a small moving preview of what a Bagworker profile actually is.
 *
 * Section 11 says a profile carries "a character, a permanent number, and a record of work". Those
 * are abstract until you see them, so this shows four Bagworkers cycling: the face, the handle, and
 * the number that outlives both.
 *
 * ## It is not invented art
 *
 * The faces come from `characterFromSeed` → `renderCharacter`, the same pure functions the console
 * uses to draw every real profile — the 16×16 layer system, the same palettes, the same
 * `shapeRendering="crispEdges"` rects. Nothing here is a mock-up of the product's art; it *is* the
 * product's art, drawn from four numbers. That is why the first one is
 * `BAGWORKER_NUMBER_EXAMPLE` — the number the rest of the docs already use in "Bagworker#3578".
 *
 * ## Deterministic on purpose
 *
 * `characterFromSeed` is a pure function of the number, so the cast is identical on the server and
 * on the client. That is what makes this a **server component with no "use client"**: there is no
 * state, no effect and no event handler anywhere in it, because the animation is CSS. The page
 * ships exactly zero JavaScript for this.
 *
 * `randomCharacter()` / `randomHandle()` were the other option and are the wrong one: they would
 * change on every render, which means a hydration mismatch, a new face on every navigation, and a
 * component that has to become a client boundary to be stable.
 *
 * ## Motion
 *
 * One `@keyframes` rule (`bw-cast-cycle`, in `docs.css`) is shared by every layer, and only the
 * **delay** differs — layer *n* is offset by its own slot, so the cast takes turns. `opacity` is the
 * only property animated, so it stays on the compositor and cannot cost layout; this is not a scroll
 * listener and cannot fight the scroll.
 *
 * `prefers-reduced-motion` is handled in `docs.css`, and it needed an explicit rule rather than that
 * file's blanket one: the blanket block forces `animation-duration: 0.01ms`, which would stop all
 * four layers on their *last* keyframe — every face and every name at full opacity, stacked. The
 * reduced-motion rule turns the animation off instead and shows the first layer alone. Which only
 * works because the base rule declares `opacity: 0`.
 */

interface CastMember {
  /** The permanent number. It is also the seed the face is derived from, exactly as the product does it. */
  number: number;
  /** A handle in the shape `lib/profile/handles.ts` generates: a head, a tail, sometimes two digits. */
  handle: string;
}

/**
 * Four Bagworkers.
 *
 * The handles are built from the real word lists (heads × tails), so they read like the names the
 * generator actually produces — `mooncat`, `bagfrog`, `pixeltoad` are the examples its own comment
 * gives. The numbers all sit inside `BAGWORKER_NUMBER_MIN`–`MAX` and none of them collide.
 */
const CAST: CastMember[] = [
  { number: BAGWORKER_NUMBER_EXAMPLE, handle: "pixeltoad" },
  { number: 1042, handle: "mooncat" },
  { number: 8841, handle: "yeetfox" },
  { number: 2196, handle: "solcrab" },
];

/** How long one Bagworker is on screen. The full cycle is this × the cast. */
const SLOT_SECONDS = 4.2;

/**
 * The faces, flattened once at module load.
 *
 * Four calls to a pure function over static input, so this is a constant in everything but
 * spelling — and computing it here rather than per render keeps the rect list from being rebuilt on
 * every pass.
 */
const FACES = CAST.map((member) => renderCharacter(characterFromSeed(member.number)));

export function DocsProfileCast() {
  const cycle = `${(SLOT_SECONDS * CAST.length).toFixed(2)}s`;

  /**
   * Duration and delay, handed to CSS as inline values.
   *
   * They live here rather than in the stylesheet so the length of a slot has exactly one owner:
   * changing `SLOT_SECONDS` retimes the faces, the names and the bars together, and the CSS only
   * owns the shape of the fade.
   *
   * The delay is **negative** on purpose — the layers start partway through the cycle rather than
   * waiting their turn, so the first painted frame is already a cast in rotation instead of four
   * seconds of a single face.
   */
  const layerStyle = (index: number) => ({
    animationDuration: cycle,
    animationDelay: `-${(index * SLOT_SECONDS).toFixed(2)}s`,
  });

  return (
    /*
     * Decorative, and hidden as a whole.
     *
     * The four name layers are stacked and only one is opaque at a time, but `opacity: 0` does not
     * remove text from the accessibility tree — a screen reader would read all four handles and all
     * four numbers, in order, with no indication of why. The surrounding prose is what carries the
     * meaning, so this is marked the way the product marks every avatar it draws: decoration,
     * described by the text beside it.
     */
    <div className="bw-cast" aria-hidden="true">
      <div className="bw-cast-pfp">
        {FACES.map((face, index) => (
          <svg
            key={CAST[index].number}
            viewBox={`0 0 ${face.size} ${face.size}`}
            shapeRendering="crispEdges"
            focusable="false"
            className="bw-cast-face bw-cast-layer"
            style={layerStyle(index)}
          >
            <rect x={0} y={0} width={face.size} height={face.size} fill={face.background} />
            {face.parts.map((part) => (
              <rect
                key={`${part.x}-${part.y}`}
                x={part.x}
                y={part.y}
                width={1}
                height={1}
                fill={part.fill}
              />
            ))}
          </svg>
        ))}
      </div>

      <div className="bw-cast-meta">
        <p className="bw-cast-kicker">Profile preview</p>

        {/* Absolute layers over a fixed-height box: four names in normal flow would make the card
            four lines tall and resize it on every step of the cycle. */}
        <div className="bw-cast-lines">
          {CAST.map((member, index) => (
            <p key={member.number} className="bw-cast-line bw-cast-layer" style={layerStyle(index)}>
              <span className="bw-cast-handle">{member.handle}</span>
              <span className="bw-cast-number">{formatBagworkerNumber(member.number)}</span>
            </p>
          ))}
        </div>

        {/* Which of the four is up. Same keyframes and the same offsets as the faces, so the lit bar
            and the visible face can never disagree. */}
        <div className="bw-cast-bars">
          {CAST.map((member, index) => (
            <span key={member.number} className="bw-cast-bar">
              <i className="bw-cast-layer" style={layerStyle(index)} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
