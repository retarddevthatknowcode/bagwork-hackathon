/**
 * Venice AI — the model behind submission review.
 *
 * Server-only by construction: the key is read here and never returned to a caller, and nothing in
 * this module is imported by a Client Component. A leaked key is a billable key.
 *
 * The model is chosen, not hardcoded. Venice exposes its catalogue with per-model pricing, so the
 * cheapest `grok-*` on the account wins; if the catalogue names no grok, the cheapest model in it is
 * used instead. `VENICE_MODEL` overrides both. If none of that resolves, this throws rather than
 * guessing an id — an unanswerable review must leave the submission pending, never invent a score.
 */
const BASE_URL = "https://api.venice.ai/api/v1";

/** How long one model call may take before it is abandoned. */
const REQUEST_TIMEOUT_MS = 20_000;

/** The catalogue is stable; an hour of caching keeps review latency off the models endpoint. */
const CATALOGUE_TTL_MS = 60 * 60 * 1000;

export const VENICE_API_KEY = (process.env.VENICE_API_KEY ?? "").trim();

/** True when review can be attempted at all. */
export const isVeniceConfigured = VENICE_API_KEY.length > 0;

/** Set to pin a model instead of discovering one. Empty means discover. */
const MODEL_OVERRIDE = (process.env.VENICE_MODEL ?? "").trim();

let catalogue: { at: number; model: string | null } | null = null;

function finiteNumber(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : null;
}

interface VeniceModel {
  id?: string;
  model_spec?: { pricing?: { input?: { usd?: number }; output?: { usd?: number } } };
}

/** Input + output price, or Infinity when the catalogue did not price the model. */
function priceOf(model: VeniceModel): number {
  const input = finiteNumber(model.model_spec?.pricing?.input?.usd);
  const output = finiteNumber(model.model_spec?.pricing?.output?.usd);
  if (input === null && output === null) return Number.POSITIVE_INFINITY;
  return (input ?? 0) + (output ?? 0);
}

/**
 * The model id to call, or null when it cannot be determined.
 *
 * Order: `VENICE_MODEL` → cheapest `grok-*` → cheapest model at all → null. That last step is a
 * deliberate refusal: a review that cannot name a model must not run.
 */
export async function resolveVeniceModel(): Promise<string | null> {
  if (MODEL_OVERRIDE) return MODEL_OVERRIDE;
  if (catalogue && Date.now() - catalogue.at < CATALOGUE_TTL_MS) return catalogue.model;

  let model: string | null = null;
  try {
    const res = await fetch(`${BASE_URL}/models`, {
      headers: { authorization: `Bearer ${VENICE_API_KEY}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.ok) {
      const body = (await res.json()) as { data?: VeniceModel[] };
      const priced = (body.data ?? []).filter((m): m is VeniceModel => typeof m.id === "string");
      const groks = priced.filter((m) => /grok/i.test(m.id ?? ""));
      const pool = groks.length ? groks : priced;
      const cheapest = pool
        .slice()
        .sort((a, b) => priceOf(a) - priceOf(b))
        .find((m) => Number.isFinite(priceOf(m)));
      model = cheapest?.id ?? null;
    }
  } catch {
    // Falls through to null: no catalogue, no review. Never a guessed model id.
    model = null;
  }

  catalogue = { at: Date.now(), model };
  return model;
}

/** Pulls the first JSON object out of a model reply, tolerating fences and stray prose. */
export function extractJson<T>(text: string): T | null {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(t.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export interface VeniceJsonResult<T> {
  model: string;
  data: T;
  /** Token usage when the provider reports it, so cost is visible rather than assumed. */
  usage?: { prompt?: number; completion?: number; total?: number };
}

/**
 * One strict-JSON completion.
 *
 * Throws on every failure path — no key, no model, HTTP error, timeout, unparseable reply — so the
 * caller can hold the submission in review instead of deciding it. Silence is never a verdict.
 */
export async function veniceJson<T>(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 160,
): Promise<VeniceJsonResult<T>> {
  if (!isVeniceConfigured) throw new Error("VENICE_API_KEY is not set");

  const model = await resolveVeniceModel();
  if (!model) {
    throw new Error("no Venice model resolved (catalogue unavailable and VENICE_MODEL unset)");
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${VENICE_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      // Deterministic: the same submission reviewed twice must reach the same verdict.
      temperature: 0,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Venice ${res.status}: ${detail.slice(0, 200)}`);
  }

  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const raw = body.choices?.[0]?.message?.content ?? "";

  const data = extractJson<T>(raw);
  if (!data) throw new Error(`Venice returned non-JSON: ${raw.slice(0, 140)}`);

  return {
    model,
    data,
    usage: body.usage
      ? {
          prompt: body.usage.prompt_tokens,
          completion: body.usage.completion_tokens,
          total: body.usage.total_tokens,
        }
      : undefined,
  };
}
