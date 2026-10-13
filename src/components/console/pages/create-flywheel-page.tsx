"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Copy, ImagePlus, Loader2, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/auth/auth-provider";
import {
  useCreateBag,
  usePublishFlywheelBag,
  useResolveToken,
  useTreasuryAddress,
  type CreateBagResult,
  type ResolvedToken,
} from "@/lib/console/hooks";
import { PLATFORMS, PLATFORM_LABELS, type Platform } from "@/lib/types";
import { FLYWHEEL_OPT_IN_MIN_USD } from "@/lib/campaigns/flywheel-window";
import { usd } from "@/lib/console/format";
import { cn } from "@/lib/utils";
import { PlatformIcon } from "../platform-icons";
import { PageHeader, SectionCard, SignInRequired } from "../ui";

/**
 * Flow B — a Fee Redirect flywheel campaign.
 *
 * Separate from the fixed-budget flow in state, steps and payload, because the two disagree about
 * nearly everything: where the money comes from (fees, not a transfer), what makes the campaign
 * open (publication, not a confirmed signature), and what the publisher has to know first.
 *
 * Three consequences worth stating plainly, because they are what a reader of this file will
 * otherwise get wrong:
 *
 *   1. **No funding step, and no budget minimum.** The bag is created at whatever the publisher
 *      declares (usually zero) and `POST /api/campaigns` accepts zero *because* this is a
 *      fee-redirect bag. `PATCH /api/campaigns/[id]` with `publish: true` then opens it, and that
 *      endpoint refuses to do so for anything that is not `feeRedirectEnabled`.
 *   2. **The bag is priced in USDC, always.** The fee loop swaps incoming fees to USDC before
 *      crediting them (`lib/fees/sync.ts`), so denominating this bag in anything else would mean
 *      adding one token's dollars to another token's budget. The *fee source* is the publisher's
 *      token, captured as `feeMint` below.
 *   3. **Fee destination instructions are part of setup, not an afterthought.** The campaign is
 *      inert until someone points the token's fee recipient at Bagwork, so that step carries the
 *      treasury address and the three places it has to be pasted.
 */

const STEPS = [
  { title: "Token & project", blurb: "Which token funds this, and what it is for." },
  { title: "Fee redirect", blurb: "Where the trading fees go, and what they become." },
  { title: "Payout rules", blurb: "What bagworkers earn, and where they can post." },
  { title: "Publish", blurb: "Open it up — no transfer required." },
];

/** Simple, editable defaults for a new flywheel — stated on the card rather than buried. */
const DEFAULT_RATE_PER_1K = 10;
const DEFAULT_MAX_PAYOUT = 100;

interface Draft {
  title: string;
  projectName: string;
  description: string;
  bannerUrl: string | null;
  /** The token whose fees feed this bag. Resolved before it is sent, as `feeMint`. */
  mint: string;
  token: ResolvedToken | null;
  feePct: string;
  platforms: Platform[];
  ratePer1k: string;
  maxPayout: string;
  durationDays: string;
  maxSubmissions: string;
  maxPerCreator: string;
  /** Optional starting pot. Zero is normal — fees are what grow it. */
  startingBudget: string;
}

const EMPTY: Draft = {
  title: "",
  projectName: "",
  description: "",
  bannerUrl: null,
  mint: "",
  token: null,
  feePct: "100",
  platforms: [],
  ratePer1k: String(DEFAULT_RATE_PER_1K),
  maxPayout: String(DEFAULT_MAX_PAYOUT),
  durationDays: "30",
  maxSubmissions: "",
  maxPerCreator: "",
  startingBudget: "0",
};

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function optionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

export function CreateFlywheel({ onBackToChoice }: { onBackToChoice: () => void }) {
  const { ready, authenticated, login, getAccessToken, identityToken } = useAuth();
  const router = useRouter();
  const createBag = useCreateBag();
  const publishBag = usePublishFlywheelBag();
  const resolveToken = useResolveToken();
  // FEE on purpose: this flow's fees must be routed to the fee-redirect treasury, never the
  // fixed-budget wallet a publisher's own transfer goes to. Detection watches this address only.
  const { data: treasury } = useTreasuryAddress("FEE");

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  /**
   * The campaign once it exists, kept apart from `published` for the same reason the fixed-budget
   * flow keeps one: if creation succeeds and publication fails, a retry must publish *that*
   * campaign rather than silently creating a second one.
   */
  const [created, setCreated] = useState<CreateBagResult | null>(null);
  const [published, setPublished] = useState<CreateBagResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next }));

  const feePct = toNumber(draft.feePct);
  const ratePer1k = toNumber(draft.ratePer1k);
  const maxPayout = toNumber(draft.maxPayout);
  const startingBudget = toNumber(draft.startingBudget);
  const treasuryAddress = treasury?.address ?? null;

  /** Validated against the field that is actually on this step, never the whole form. */
  function issuesFor(current: number): string[] {
    const found: string[] = [];
    if (current === 0) {
      if (draft.title.trim().length < 4) found.push("Give the campaign a title");
      if (draft.description.trim().length < 20)
        found.push("Write a brief of at least 20 characters");
      if (draft.mint.trim().length < 32 || !draft.token)
        found.push("Look up the token's contract address");
    } else if (current === 1) {
      if (!Number.isFinite(feePct) || feePct < 1 || feePct > 100)
        found.push("Share of fees must be between 1 and 100");
      if (!treasuryAddress) found.push("The treasury address is not configured yet");
    } else if (current === 2) {
      if (draft.platforms.length === 0) found.push("Select at least one platform");
      if (!Number.isFinite(ratePer1k) || ratePer1k <= 0)
        found.push("Enter a reward per 1,000 views");
      if (!Number.isFinite(maxPayout) || maxPayout <= 0) found.push("Enter a per-post cap");
      const days = toNumber(draft.durationDays);
      if (!Number.isFinite(days) || days < 3 || days > 90)
        found.push("Duration must be between 3 and 90 days");
      const subs = optionalInt(draft.maxSubmissions);
      const per = optionalInt(draft.maxPerCreator);
      if (subs !== null && per !== null && per > subs)
        found.push("Max per creator cannot exceed max submissions");
    } else if (current === 3) {
      if (!Number.isFinite(startingBudget) || startingBudget < 0)
        found.push("Starting budget cannot be negative");
    }
    return found;
  }

  const issues = issuesFor(step);

  async function uploadBanner(file: File) {
    setUploading(true);
    try {
      const token = await getAccessToken();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/uploads/banner", {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(identityToken ? { "X-Privy-Identity-Token": identityToken } : {}),
        },
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not upload that image");
      patch({ bannerUrl: body.url });
      toast.success("Image added");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  /** Resolves a pasted contract address into the token's real name, symbol and decimals. */
  async function lookUpToken(mint: string) {
    setError(null);
    patch({ mint, token: null });
    if (mint.trim().length < 32) return;
    try {
      const resolved = await resolveToken.mutateAsync(mint);
      patch({ token: resolved, mint: resolved.mint });
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : "Could not read that token");
    }
  }

  /**
   * Create the campaign, then open it.
   *
   * Two calls, in that order, because the publisher's confirmation in step 4 is the only thing this
   * bag ever gets — there is no transfer to wait for. `created` is kept so a publication that
   * fails retries the campaign that already exists instead of making a second one.
   */
  async function createAndPublish() {
    setError(null);
    setBusy(true);
    try {
      const bag =
        created ??
        (await createBag.mutateAsync({
          title: draft.title.trim(),
          description: draft.description.trim(),
          projectName: draft.projectName.trim(),
          platforms: draft.platforms,
          bannerUrl: draft.bannerUrl,
          contentType: "PROMO",
          budget: Number.isFinite(startingBudget) && startingBudget > 0 ? startingBudget : 0,
          // Priced in USDC because the fee loop swaps incoming fees to USDC before crediting the
          // budget; the token whose *fees* feed this bag is captured as `feeMint`.
          token: { kind: "USDC" },
          chain: "solana",
          paymentModel: "RPM",
          ratePer1k,
          maxPayout,
          durationDays: toNumber(draft.durationDays),
          maxSubmissions: optionalInt(draft.maxSubmissions),
          maxPerCreator: optionalInt(draft.maxPerCreator),
          holderGate: false,
          holderMin: 0,
          feeRedirectEnabled: true,
          feeRedirectPct: feePct,
          feeMint: draft.token?.mint ?? draft.mint.trim(),
        }));
      setCreated(bag);

      await publishBag.mutateAsync({ id: bag.campaign.id });
      setPublished(bag);
      toast.success("Flywheel campaign published", {
        description: `It is live now. Fees start filling the budget as they are routed — creators can opt in once it holds ${usd(
          FLYWHEEL_OPT_IN_MIN_USD,
        )}.`,
      });
    } catch (publishError) {
      setError(
        publishError instanceof Error ? publishError.message : "Could not publish this campaign",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 aria-hidden="true" className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <SignInRequired
        title="Sign in to publish a flywheel"
        description="A flywheel campaign is published from your own account, so we need to know who is running it."
        onConnect={login}
      />
    );
  }

  /*
   * Published, as its own state rather than as a step with the controls still on it: from here the
   * only useful actions are viewing the campaign or starting another one.
   */
  if (published) {
    return (
      <div className="pb-16">
        <PageHeader
          eyebrow="Fee Redirect flywheel"
          title="Campaign published"
          description={`Fees routed to Bagwork start filling the budget — no transfer needed from you. Opt-ins open to creators once the budget reaches ${usd(
            FLYWHEEL_OPT_IN_MIN_USD,
          )}, and close again whenever it drops below.`}
        />
        <div className="mx-auto w-full max-w-[880px] space-y-5 px-4 py-6 sm:px-6">
          <SectionCard title="What happens next" contentClassName="space-y-4 p-5">
            <ol className="list-decimal space-y-2 pl-4 text-sm leading-relaxed text-muted-foreground">
              <li>Point your token&apos;s fee recipient at the Bagwork treasury below.</li>
              <li>
                Each sync detects the fees, swaps them to USDC, and adds them to this campaign&apos;s
                budget — slots included.
              </li>
              <li>
                Bagworkers get paid from that budget at the rate you set — opt-ins open to them once
                it reaches {usd(FLYWHEEL_OPT_IN_MIN_USD)}.
              </li>
            </ol>

            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                {treasuryAddress ?? "Treasury not configured"}
              </code>
              {treasuryAddress ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1"
                  onClick={() => {
                    void navigator.clipboard?.writeText(treasuryAddress);
                    toast.success("Fee address copied");
                  }}
                >
                  <Copy aria-hidden="true" className="size-3.5" />
                  Copy
                </Button>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => router.push(`/dashboard/bags/${published.campaign.id}`)}
              >
                View campaign
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onBackToChoice}>
                Back to options
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Fee Redirect flywheel"
        title="Create a flywheel campaign"
        description="Your token's trading and creator fees become this campaign's content budget. No upfront transfer: it grows as the token trades."
        actions={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={onBackToChoice}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to options
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-[880px] space-y-5 px-4 py-6 sm:px-6">
        <nav aria-label="Flywheel campaign progress" className="space-y-2.5">
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STEPS.map((entry, index) => {
              const state = index === step ? "current" : index < step ? "done" : "todo";
              return (
                <li key={entry.title} className="min-w-0">
                  <div
                    aria-hidden="true"
                    className={cn(
                      "h-1 rounded-full",
                      state === "todo" ? "bg-border" : "bg-brand",
                    )}
                  />
                  <div className="mt-2 flex items-center gap-1.5">
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums",
                        state === "done" && "bg-brand text-brand-foreground",
                        state === "current" && "border border-brand text-brand",
                        state === "todo" && "border border-border text-muted-foreground",
                      )}
                    >
                      {state === "done" ? (
                        <Check aria-hidden="true" className="size-3" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span
                      aria-current={state === "current" ? "step" : undefined}
                      className={cn(
                        "truncate text-xs font-medium",
                        state === "todo" ? "text-muted-foreground" : "text-foreground",
                      )}
                      title={entry.title}
                    >
                      {entry.title}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </nav>

        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
          >
            {error}
          </p>
        ) : null}

        {step === 0 ? (
          <SectionCard
            title="Token & project"
            description={STEPS[0].blurb}
            contentClassName="space-y-4 p-5"
          >
            <div className="space-y-2">
              <Label htmlFor="fw-title">Campaign title</Label>
              <Input
                id="fw-title"
                value={draft.title}
                onChange={(event) => patch({ title: event.target.value })}
                placeholder="e.g. NOVA trading-fee creator rewards"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fw-mint">Token contract address</Label>
              <Input
                id="fw-mint"
                value={draft.mint}
                onChange={(event) => void lookUpToken(event.target.value)}
                placeholder="Paste the CA of the token whose fees fund this bag"
                className="font-mono text-xs"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                {resolveToken.isPending
                  ? "Reading the token…"
                  : draft.token
                    ? `${draft.token.symbol} — ${draft.token.name}`
                    : "Its fees are what this campaign is funded from."}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fw-project">Project name</Label>
              <Input
                id="fw-project"
                value={draft.projectName}
                onChange={(event) => patch({ projectName: event.target.value })}
                placeholder="Who is behind it"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fw-description">Brief</Label>
              <Textarea
                id="fw-description"
                value={draft.description}
                onChange={(event) => patch({ description: event.target.value })}
                rows={5}
                placeholder="What bagworkers should make, what to include, and what to avoid."
              />
            </div>

            <div className="space-y-2">
              <Label>Banner</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadBanner(file);
                  event.target.value = "";
                }}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                  ) : (
                    <ImagePlus aria-hidden="true" className="size-3.5" />
                  )}
                  {draft.bannerUrl ? "Replace image" : "Upload an image"}
                </Button>
                {draft.bannerUrl ? (
                  <img
                    src={draft.bannerUrl}
                    alt=""
                    className="h-12 rounded-lg border border-border object-cover"
                  />
                ) : null}
              </div>
            </div>
          </SectionCard>
        ) : null}

        {step === 1 ? (
          <SectionCard
            title="Fee redirect"
            description={STEPS[1].blurb}
            contentClassName="space-y-4 p-5"
          >
            {/* The mechanism, stated as the sequence it actually is: fees → treasury → USDC → budget. */}
            <ol className="grid gap-2 sm:grid-cols-4">
              {["Trading fees", "Bagwork treasury", "Swapped to USDC", "Live content budget"].map(
                (label, index) => (
                  <li
                    key={label}
                    className="flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 px-2.5 py-2 text-[11px] font-medium text-foreground"
                  >
                    <span className="size-4 shrink-0 rounded-full bg-brand/20 text-center text-[10px] leading-4 text-brand">
                      {index + 1}
                    </span>
                    {label}
                  </li>
                ),
              )}
            </ol>

            <div className="space-y-2">
              <Label htmlFor="fw-fee-pct">Share of fees to redirect (%)</Label>
              <Input
                id="fw-fee-pct"
                inputMode="numeric"
                value={draft.feePct}
                onChange={(event) => patch({ feePct: event.target.value })}
                className="tabular-nums sm:max-w-[180px]"
              />
              <p className="text-xs text-muted-foreground">
                What you set on the launchpad or in your contract. Recorded here so bagworkers can
                see it.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">
                Send your fees to this Bagwork address
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                  {treasuryAddress ?? "Treasury not configured"}
                </code>
                {treasuryAddress ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1"
                    onClick={() => {
                      void navigator.clipboard?.writeText(treasuryAddress);
                      toast.success("Fee address copied");
                    }}
                  >
                    <Copy aria-hidden="true" className="size-3.5" />
                    Copy
                  </Button>
                ) : null}
              </div>
              {/*
                The fee-redirect wallet is not the fixed-budget treasury, and the two are not
                interchangeable: detection watches this address only, so fees pointed at the other
                wallet are recorded but never converted. Saying so here is cheaper than a support
                ticket after a launchpad is already configured.
              */}
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                This is Bagwork&apos;s <span className="font-medium text-foreground">fee-redirect
                wallet</span> — not the fixed-budget treasury that self-funded Bags use. Fees sent
                to any other address are not detected, so double-check the recipient before saving
                it on your launchpad or in your contract.
              </p>
            </div>

            <div className="space-y-2 rounded-lg border border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
              <p className="font-medium text-foreground">How to set it up</p>
              <p>
                <span className="text-foreground">pump.fun</span> — on your coin page open Creator
                fees → Share fees, and set the address above as the recipient.
              </p>
              <p>
                <span className="text-foreground">Other launchpads</span> — look for &ldquo;fee
                recipient&rdquo;, &ldquo;creator fee wallet&rdquo; or &ldquo;revenue split&rdquo; and
                use the same address.
              </p>
              <p>
                <span className="text-foreground">Your own contract</span> — point the fee
                vault&apos;s withdrawal or the treasury authority at the address above.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs font-medium text-foreground">Status: waiting for fees</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Nothing is detected until two things are true: the recipient above is set, and this
                campaign is published. Deposits then show up on the campaign page as they are
                detected, swapped and credited.
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Creators cannot opt in until that credited budget reaches{" "}
                {usd(FLYWHEEL_OPT_IN_MIN_USD)}. The window is a threshold, not a switch: it closes
                again if the budget is spent, and reopens as fees refill it.
              </p>
            </div>
          </SectionCard>
        ) : null}

        {step === 2 ? (
          <SectionCard
            title="Payout rules"
            description={STEPS[2].blurb}
            contentClassName="space-y-4 p-5"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fw-rate">Reward per 1,000 views (USDC)</Label>
                <Input
                  id="fw-rate"
                  inputMode="decimal"
                  value={draft.ratePer1k}
                  onChange={(event) => patch({ ratePer1k: event.target.value })}
                  className="tabular-nums"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fw-cap">Per-post cap (USDC)</Label>
                <Input
                  id="fw-cap"
                  inputMode="decimal"
                  value={draft.maxPayout}
                  onChange={(event) => patch({ maxPayout: event.target.value })}
                  className="tabular-nums"
                />
                <p className="text-xs text-muted-foreground">
                  Keeps one viral post from draining the bag.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Where bagworkers post</Label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((platform) => {
                  const active = draft.platforms.includes(platform);
                  return (
                    <button
                      key={platform}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        patch({
                          platforms: active
                            ? draft.platforms.filter((entry) => entry !== platform)
                            : [...draft.platforms, platform],
                        })
                      }
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        active
                          ? "border-brand bg-brand/10 text-brand"
                          : "border-border text-muted-foreground hover:border-brand/50 hover:text-foreground",
                      )}
                    >
                      <PlatformIcon platform={platform} className="size-3.5" />
                      {PLATFORM_LABELS[platform]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="fw-days">Duration (days)</Label>
                <Input
                  id="fw-days"
                  inputMode="numeric"
                  value={draft.durationDays}
                  onChange={(event) => patch({ durationDays: event.target.value })}
                  className="tabular-nums"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fw-subs">Max submissions</Label>
                <Input
                  id="fw-subs"
                  inputMode="numeric"
                  value={draft.maxSubmissions}
                  onChange={(event) => patch({ maxSubmissions: event.target.value })}
                  placeholder="No limit"
                  className="tabular-nums"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fw-per">Max per creator</Label>
                <Input
                  id="fw-per"
                  inputMode="numeric"
                  value={draft.maxPerCreator}
                  onChange={(event) => patch({ maxPerCreator: event.target.value })}
                  placeholder="No limit"
                  className="tabular-nums"
                />
              </div>
            </div>
          </SectionCard>
        ) : null}

        {step === 3 ? (
          <SectionCard
            title="Publish"
            description={STEPS[3].blurb}
            contentClassName="space-y-4 p-5"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Campaign", draft.title.trim() || "—"],
                ["Token", draft.token ? `${draft.token.symbol} (${draft.token.name})` : "—"],
                ["Payouts", `${ratePer1k || 0} USDC / 1K views · cap ${maxPayout || 0} USDC`],
                ["Fee share", `${feePct || 0}% → Bagwork treasury`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border bg-background px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  <p className="truncate text-sm font-medium text-foreground" title={value}>
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="fw-budget">Starting budget (USDC, optional)</Label>
              <Input
                id="fw-budget"
                inputMode="decimal"
                value={draft.startingBudget}
                onChange={(event) => patch({ startingBudget: event.target.value })}
                className="tabular-nums sm:max-w-[180px]"
              />
              <p className="text-xs text-muted-foreground">
                Leave it at zero. This bag is not funded by a transfer — fees fill it as the token
                trades.
              </p>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-brand/30 bg-brand/5 p-3 text-xs leading-relaxed text-foreground">
              <TrendingUp aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-brand" />
              <p>
                Publishing opens the campaign straight away — there is no signature to wait for.
                Budget and claimable slots start at{" "}
                <span className="font-medium tabular-nums">
                  {draft.startingBudget && toNumber(draft.startingBudget) > 0
                    ? `${draft.startingBudget} USDC`
                    : "zero"}
                </span>{" "}
                and grow with each detected fee deposit.
              </p>
            </div>

            {issues.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-xs text-destructive">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}
          </SectionCard>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => (step === 0 ? onBackToChoice() : setStep(step - 1))}
            disabled={busy}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            {step === 0 ? "Back to options" : "Back"}
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={issues.length > 0}
              onClick={() => setStep(step + 1)}
            >
              Continue
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={issues.length > 0 || busy}
              onClick={() => void createAndPublish()}
            >
              {busy ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Check aria-hidden="true" className="size-4" />
              )}
              {created ? "Retry publish" : "Publish flywheel"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
