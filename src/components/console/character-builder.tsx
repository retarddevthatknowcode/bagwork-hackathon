"use client";

import { Check, Dices } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CharacterAvatar } from "@/components/console/identity";
import {
  ACCESSORIES,
  BACKGROUNDS,
  EYE_STYLES,
  HAIR_COLORS,
  HAIR_STYLES,
  SKIN_TONES,
  TOP_STYLES,
  randomCharacter,
  type CharacterConfig,
  type CharacterOption,
} from "@/lib/profile/character";
import { cn } from "@/lib/utils";

/**
 * The character builder — used by onboarding and by the profile editor.
 *
 * One component for both: a second implementation of "pick your Bagworker" would be a second
 * thing to keep in sync, and the two would drift the first time an option was added.
 *
 * The layout is one row per decision, seven rows, each a single line of options:
 *   - colour decisions (skin, hair colour, background) are swatches, because that is what
 *     the choice actually is;
 *   - shape decisions (hair, eyes, glasses, clothes) show a live miniature of the whole
 *     character with that option applied, because a word like "Fringe" tells you nothing
 *     about how it will look on the head you already picked.
 *
 * Every option is a plain `button` with `aria-pressed`, a visible focus ring and an `sr-only`
 * name, so the whole thing is operable by keyboard and readable by a screen reader.
 */

interface BuilderRow {
  field: keyof CharacterConfig;
  label: string;
  options: readonly CharacterOption[];
  /** Only on colour rows: the fill a swatch should use for an option key. */
  swatch?: (key: string) => string;
}

const skinSwatch = (key: string) =>
  SKIN_TONES.find((tone) => tone.key === key)?.color ?? SKIN_TONES[0].color;
const hairSwatch = (key: string) =>
  HAIR_COLORS.find((colour) => colour.key === key)?.color ?? HAIR_COLORS[0].color;
const backgroundSwatch = (key: string) =>
  BACKGROUNDS.find((plate) => plate.key === key)?.color ?? BACKGROUNDS[0].color;

const ROWS: BuilderRow[] = [
  { field: "skin", label: "Skin tone", options: SKIN_TONES, swatch: skinSwatch },
  { field: "hair", label: "Hair style", options: HAIR_STYLES },
  { field: "hairColor", label: "Hair colour", options: HAIR_COLORS, swatch: hairSwatch },
  { field: "eyes", label: "Eyes", options: EYE_STYLES },
  { field: "accessory", label: "Glasses", options: ACCESSORIES },
  { field: "top", label: "Clothes", options: TOP_STYLES },
  { field: "background", label: "Background", options: BACKGROUNDS, swatch: backgroundSwatch },
];

export function CharacterBuilder({
  value,
  onChange,
  disabled,
  className,
}: {
  value: CharacterConfig;
  onChange: (next: CharacterConfig) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-5", className)}>
      {/* Live preview. The character is the point of this screen, so it gets the space and the
          Randomize control sits with it rather than in a toolbar somewhere. */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center">
        <CharacterAvatar
          character={value}
          className="size-28 shrink-0 self-center rounded-lg sm:self-auto"
        />

        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Live preview
            </p>
            <p className="mt-0.5 text-sm leading-relaxed text-foreground">
              This is you across Bagwork — on your profile, next to every submission.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={disabled}
            onClick={() => onChange(randomCharacter())}
          >
            <Dices aria-hidden="true" className="size-3.5" />
            Randomize
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {ROWS.map((row) => (
          <div key={row.field} className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">{row.label}</Label>

            <div className="flex flex-wrap gap-2">
              {row.options.map((option) => {
                const selected = value[row.field] === option.key;
                const fill = row.swatch?.(option.key);
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={selected}
                    title={option.label}
                    disabled={disabled}
                    onClick={() => onChange({ ...value, [row.field]: option.key })}
                    className={cn(
                      "relative rounded-lg border p-1 transition",
                      "focus-visible:ring-[3px] focus-visible:ring-brand/40 focus-visible:outline-none",
                      selected
                        ? "border-brand bg-brand/10"
                        : "border-border hover:border-muted-foreground/40 hover:bg-accent/60",
                      disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
                    )}
                  >
                    {fill ? (
                      <span
                        className="block size-9 rounded-md border border-black/20"
                        style={{ backgroundColor: fill }}
                      />
                    ) : (
                      <CharacterAvatar
                        character={{ ...value, [row.field]: option.key }}
                        className="size-9 rounded-md"
                      />
                    )}

                    {/* Selection is signalled by the border and ring, plus this tick on colour
                        swatches — never by colour alone. */}
                    {selected && fill ? (
                      <Check
                        aria-hidden="true"
                        className="absolute inset-1 m-auto size-4 text-[#0b0a07]"
                      />
                    ) : null}

                    <span className="sr-only">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
