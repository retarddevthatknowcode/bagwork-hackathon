"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSignAndSendTransaction, useWallets } from "@privy-io/react-auth/solana";
import { Transaction } from "@solana/web3.js";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ImagePlus,
  Info,
  Loader2,
  Lock,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/auth/auth-provider";
import { useSession } from "@/lib/queries";
import { MIN_FIXED_BUDGET_USDC } from "@/lib/campaigns/limits";
import {
  useCreateBag,
  useFundBag,
  useTreasuryAddress,
  type CreateBagResult,
} from "@/lib/console/hooks";
import { SOLANA_CAIP2, truncateAddress } from "@/lib/privy/config";
import { explorerUrl } from "@/lib/solana/connection";
import { base58Encode } from "@/lib/solana/base58";
import { CHAINS, PAYMENT_MODELS, PLATFORMS, PLATFORM_LABELS } from "@/lib/types";
import type { PaymentModel, Platform } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PlatformIcon } from "../platform-icons";
import { PageHeader, SectionCard, SignInRequired, WalletGate } from "../ui";
import { CreateBagKindChoice, type BagKind } from "./create-bag-kind-choice";
import { CreateLaunchPage } from "./create-launch-page";

/**
 * The token a fixed-budget bag is priced in.
 *
 * USDC, and only USDC, while this flow is being proven. A budget has to be worth a known amount
 * for a minimum, a slot count and a per-post ceiling to mean anything: `$5` is a real (if tiny)
 * campaign, five dollars of an arbitrary memecoin is not a number anyone can reason about, and a
 * custom token's price is unknowable to the server at all. So the picker that used to offer SOL and
 * "paste a contract address" is gone from this flow — the API still accepts both (the admin portal
 * and every pre-existing bag depend on it), but the publisher's path is one token.
 *
 * Everything below reads this constant rather than a literal, so re-opening the flow to another
 * token is a change in one place.
 */
const BUDGET_TOKEN = "USDC" as const;

type Step = 0 | 1 | 2;

/** What the publisher is building, before anything is persisted. */
interface Draft {
  title: string;
  projectName: string;
  description: string;
  platforms: Platform[];
  bannerUrl: string | null;
  budget: string;
  chain: string;
  paymentModel: PaymentModel;
  fixedFee: string;
  ratePer1k: string;
  maxPayout: string;
  durationDays: string;
  maxSubmissions: string;
  maxPerCreator: string;
}

const EMPTY: Draft = {
  title: "",
  projectName: "",
  description: "",
  platforms: [],
  bannerUrl: null,
  budget: "",
  chain: "solana",
  paymentModel: "FIXED",
  fixedFee: "",
  ratePer1k: "",
  maxPayout: "",
  durationDays: "14",
  maxSubmissions: "",
  maxPerCreator: "",
};

/** The fixed-budget flow: three steps, none of which belong to the flywheel product. */
const STEPS = [
  { title: "Basics & content", blurb: "What the bag is and where it can be posted." },
  { title: "Rates, token & limits", blurb: "How much, in what, and how it pays out." },
  { title: "Fund the bag", blurb: "Send the budget to Bagwork to switch it on." },
];

/** Formats an amount in the bag's own token — not always dollars. */
function amount(value: number, symbol: string, maxFractionDigits = 6): string {
  const rounded = Number(value.toFixed(maxFractionDigits));
  return `${rounded.toLocaleString("en-US", { maximumFractionDigits: maxFractionDigits })} ${symbol}`;
}

/** Reads a numeric field, treating empty/invalid as NaN so callers can validate. */
function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/** Reads an optional limit, where blank means "no limit" rather than zero. */
function optionalInt(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

/** Decodes base64 without assuming a Buffer polyfill exists. */
function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The `/dashboard/create` route — a gate, and nothing else.
 *
 * Everything with state lives in `CreateBagFlow` below, because that component calls the Solana
 * wallet hooks (`useWallets`, `useSignAndSendTransaction`), which need a mounted `PrivyProvider`
 * above them. Splitting them apart is the whole point: it makes those hooks *not called* on a
 * deployment that has no Privy credentials, instead of called-and-thrown. See `WalletGate` in `../ui`
 * for why that difference decides whether `next build` succeeds.
 */
export function CreateBag() {
  return (
    <WalletGate>
      <CreateBagFlow />
    </WalletGate>
  );
}

function CreateBagFlow() {
  const { ready, authenticated, login, getAccessToken, identityToken } = useAuth();
  const router = useRouter();
  const createBag = useCreateBag();
  const fundBag = useFundBag();
  // FIXED on purpose: this flow's budget transfer goes to the fixed-budget treasury, never the
  // fee-redirect wallet a flywheel's fees land in.
  const { data: treasury } = useTreasuryAddress("FIXED");
  const { data: session } = useSession();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const { wallets } = useWallets();

  const [step, setStep] = useState<Step>(0);
  /**
   * Which product is being built. Null until the publisher picks, and every field downstream
   * belongs to exactly one of the two flows — that is the whole point of asking first.
   */
  const [kind, setKind] = useState<BagKind | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [created, setCreated] = useState<CreateBagResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  /**
   * Where the funding transfer is: waiting for the wallet prompt → confirming on-chain →
   * verified (the bag flips LIVE). `idle` outside a funding attempt, so the stepper below only
   * ever describes a transfer that is genuinely happening.
   */
  const [fundStage, setFundStage] = useState<"idle" | "awaiting" | "confirming" | "verified">(
    "idle",
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = useCallback(
    (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next })),
    [],
  );

  /**
   * The budget's denomination, fixed by this flow. Kept as a variable rather than inlined so every
   * amount, hint and summary on the page reads the same value the payload sends.
   */
  const symbol = BUDGET_TOKEN;

  const budget = toNumber(draft.budget);
  const fixedFee = toNumber(draft.fixedFee);
  const ratePer1k = toNumber(draft.ratePer1k);

  /**
   * The most one post can ever earn. For FIXED that *is* the fee; for RPM and HYBRID it is a
   * cap, because without one a single viral post would take the whole budget.
   */
  const ceiling = useMemo(() => {
    if (draft.paymentModel === "FIXED") return fixedFee;
    if (draft.paymentModel === "HYBRID") return fixedFee || NaN;
    const explicit = toNumber(draft.maxPayout);
    return Number.isFinite(explicit) && explicit > 0 ? explicit : ratePer1k * 25;
  }, [draft.paymentModel, draft.maxPayout, fixedFee, ratePer1k]);

  /** How many creators the budget can pay. What the publisher is actually buying. */
  const slots = useMemo(() => {
    if (!Number.isFinite(budget) || !Number.isFinite(ceiling) || ceiling <= 0) return 0;
    return Math.max(0, Math.min(2000, Math.floor(budget / ceiling)));
  }, [budget, ceiling]);

  const stepOneIssues = useMemo(() => {
    const issues: string[] = [];
    if (draft.title.trim().length < 4) issues.push("Give the bag a title");
    if (draft.description.trim().length < 20)
      issues.push("Write a brief of at least 20 characters");
    if (draft.platforms.length === 0) issues.push("Select at least one platform");
    return issues;
  }, [draft.title, draft.description, draft.platforms]);

  const stepTwoIssues = useMemo(() => {
    const issues: string[] = [];
    if (!Number.isFinite(budget) || budget <= 0) issues.push("Enter a budget amount");
    else if (budget < MIN_FIXED_BUDGET_USDC)
      // The same constant the API enforces, so the form can never let someone through to a 400.
      issues.push(`The minimum budget is $${MIN_FIXED_BUDGET_USDC} USDC`);
    if (draft.paymentModel !== "RPM" && !(fixedFee > 0))
      issues.push("Enter a flat fee per post");
    if (draft.paymentModel !== "FIXED" && !(ratePer1k > 0))
      issues.push("Enter a reward per 1,000 views");
    if (Number.isFinite(budget) && Number.isFinite(ceiling) && ceiling > budget)
      issues.push("Payout per post cannot exceed the budget");
    const days = toNumber(draft.durationDays);
    if (!Number.isFinite(days) || days < 3 || days > 90)
      issues.push("Duration must be between 3 and 90 days");
    const maxSubs = optionalInt(draft.maxSubmissions);
    const maxCreator = optionalInt(draft.maxPerCreator);
    if (maxSubs !== null && maxCreator !== null && maxCreator > maxSubs)
      issues.push("Max per creator cannot exceed max submissions");
    return issues;
  }, [
    draft.paymentModel,
    draft.durationDays,
    draft.maxSubmissions,
    draft.maxPerCreator,
    budget,
    fixedFee,
    ratePer1k,
    ceiling,
  ]);

  const issues = step === 0 ? stepOneIssues : step === 1 ? stepTwoIssues : [];



  async function uploadBanner(file: File) {
    setUploading(true);
    setError(null);
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
      toast.success("Banner added");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  /**
   * Step 3, in order: persist the draft, have the publisher sign the transfer into Bagwork's
   * treasury, then record the signature to switch the bag on.
   *
   * Funding is deliberately last. The bag exists as a DRAFT before the wallet prompt, so a
   * cancelled or rejected signature leaves a resumable draft — never a bag that looks live
   * with an empty treasury.
   */
  async function createThenFund() {
    setError(null);
    setBusy(true);
    setFundStage("idle");
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
          budget,
          /*
           * USDC, always, from this flow.
           *
           * The API still accepts SOL and an arbitrary SPL mint (the admin portal and every
           * pre-existing bag depend on that), but a publisher creating a bag here sends dollars:
           * the minimum, the slot count and the per-post ceiling are all meaningless in a token
           * whose price the server cannot know.
           */
          token: { kind: BUDGET_TOKEN },
          chain: draft.chain,
          paymentModel: draft.paymentModel,
          fixedFee: Number.isFinite(fixedFee) ? fixedFee : undefined,
          ratePer1k: Number.isFinite(ratePer1k) ? ratePer1k : undefined,
          maxPayout:
            draft.paymentModel === "RPM" && Number.isFinite(ceiling) ? ceiling : undefined,
          durationDays: toNumber(draft.durationDays),
          maxSubmissions: optionalInt(draft.maxSubmissions),
          maxPerCreator: optionalInt(draft.maxPerCreator),
          holderGate: false,
          holderMin: 0,
          /*
           * No fee-redirect fields, on purpose.
           *
           * This flow exists to create a fixed-budget bag funded from the publisher's wallet. The
           * API defaults `feeRedirectEnabled` to false, so simply not sending these is what makes
           * it impossible for a bag created here to become a flywheel campaign by accident.
           */
        }));

      setCreated(bag);

      /*
       * Which wallet will pay.
       *
       * The profile's wallet is preferred so the default matches what the publisher expects, but it
       * is not assumed: a Privy session can hold an embedded wallet and an external one (Phantom) at
       * once, and only one of them is on the profile. Falling back to whatever is connected, and
       * telling the server which one, is what makes the wallet prompt appear instead of an error
       * about a wallet the user cannot sign with.
       */
      const preferred = session?.user.walletAddress;
      const signer =
        (preferred
          ? wallets.find((w) => w.address.toLowerCase() === preferred.toLowerCase())
          : undefined) ?? wallets[0];
      if (!signer) {
        throw new Error(
          "No Solana wallet is connected yet. Link one to send the budget.",
        );
      }

      // Built server-side so the amount, mint, decimals and destination all match what the payout
      // path will later expect — and from the wallet that is about to sign it.
      const token = await getAccessToken();
      const res = await fetch(`/api/campaigns/${bag.campaign.id}/build-funding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(identityToken ? { "X-Privy-Identity-Token": identityToken } : {}),
        },
        body: JSON.stringify({ wallet: signer.address }),
      });
      const built = (await res.json().catch(() => ({}))) as {
        error?: string;
        transaction?: string;
        from?: string;
        chain?: "solana:mainnet" | "solana:devnet";
      };
      if (!res.ok || !built.transaction || !built.from) {
        throw new Error(built.error ?? "Could not build the funding transfer");
      }

      /*
       * Handed to Privy as the exact bytes the server produced.
       *
       * They were serialised with `verifySignatures: false`, so the signature slot is present and
       * empty — precisely what a wallet-standard `signAndSendTransaction` expects to fill. Decoding
       * and re-encoding here would only create a way for the two sides to disagree about the
       * transaction, and the chain comes back from the server so the wallet is always asked to sign
       * for the cluster the blockhash was taken from.
       */
      setFundStage("awaiting");
      const { signature } = await signAndSendTransaction({
        transaction: base64ToBytes(built.transaction),
        wallet: signer,
        chain: built.chain ?? SOLANA_CAIP2,
      });

      setFundStage("confirming");
      // The bag is only activated once the server has confirmed the transfer on-chain, and a
      // freshly broadcast transaction is not visible for a few seconds. A `retryable` response
      // means exactly that, so poll rather than showing a failure for a transfer that is fine.
      const encoded = base58Encode(signature);
      let activated = false;
      let lastReason = "";
      for (let attempt = 0; attempt < 8 && !activated; attempt++) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2500));
        try {
          await fundBag.mutateAsync({ id: bag.campaign.id, txSignature: encoded });
          activated = true;
        } catch (fundError) {
          const retryable = (fundError as Error & { retryable?: boolean }).retryable;
          lastReason = fundError instanceof Error ? fundError.message : "Verification failed";
          // A definitive rejection will never succeed on a retry, so stop immediately and let
          // the publisher read why.
          if (!retryable) throw fundError;
        }
      }

      if (!activated) {
        throw new Error(
          lastReason ||
            "The transfer was sent but has not confirmed yet. It will activate automatically once it does.",
        );
      }

      setFundStage("verified");
      toast.success("Bag is live", {
        description: `${amount(bag.funding.amount, bag.funding.symbol)} verified in the Bagwork fixed-budget treasury.`,
      });
      router.push(`/dashboard/bags/${bag.campaign.id}`);
    } catch (fundError) {
      setError(fundError instanceof Error ? fundError.message : "Could not fund the bag");
    } finally {
      setBusy(false);
    }
  }


  /* ------------------------------------------------------------------ render */

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 aria-hidden="true" className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!authenticated)
    return (
      <SignInRequired
        title="Sign in to create a bag"
        description="A bag is funded from your own wallet, so we need to know who is publishing it."
        onConnect={login}
      />
    );

  const funding = created?.funding;
  /**
   * Where the budget goes. Read from the treasury endpoint so it is known *before* the button is
   * pressed — this used to only appear after a create call, i.e. after a failure.
   */
  const treasuryAddress = treasury?.address ?? funding?.treasury ?? null;
  /**
   * The wallet the budget must come from.
   *
   * The server builds the transfer from the wallet on the account, so this is the one that has
   * to sign. Shown up front: without it, a mismatch only surfaced as an error after the wallet
   * prompt had already opened.
   */
  const fundingWallet = session?.user.walletAddress ?? null;

  /*
   * The choice comes first, as its own screen.
   *
   * Deliberately before the progress bar and before any field: a publisher should not have to read
   * a form — or learn what "Fee Redirect" means — to discover which of the two products they are
   * about to build. Each flow below then owns its own steps, and neither can render the other's
   * inputs because neither holds the other's state.
   */
  if (kind === null) {
    return (
      <div className="pb-16">
        <PageHeader
          eyebrow="Publish"
          title="Create a campaign"
          description="Two kinds of campaign, funded two different ways. Pick the one that matches how you want to pay creators."
        />
        <div className="mx-auto w-full max-w-[880px] px-4 py-6 sm:px-6">
          <CreateBagKindChoice onSelect={setKind} />
        </div>
      </div>
    );
  }

  /**
   * Flywheel bags launch from a single page — see `create-launch-page.tsx`.
   *
   * That page is the product: it creates the coin and locks 100% of its creator fees, in a short
   * sequence of wallet prompts — the launch does not fit in one Solana transaction — and opens the bag
   * once the chain confirms the lock. A live preview sits beside the form.
   *
   * There is one flywheel flow and no second entry point. A manual "paste your contract address and
   * point its fees at Bagwork" flow exists in this repository (`create-flywheel-page.tsx`) but is
   * deliberately unreferenced: it is unshipped, so nothing routes to it, nothing offers it, and the
   * component is kept only because that work resumes later. Re-adding it means wiring it here — a
   * deliberate act, rather than a link left behind on the page a publisher actually uses.
   */
  if (kind === "flywheel") {
    return <CreateLaunchPage onBackToChoice={() => setKind(null)} />;
  }

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Fixed budget"
        title="Create a Bag campaign"
        description="You fund a fixed budget and creators get paid for posts that pass review. Bagwork holds it for the life of the campaign, and the bag pays out until it runs out."
      />

      <div className="mx-auto w-full max-w-[880px] space-y-5 px-4 py-6 sm:px-6">
        {/* Progress. A grid rather than an inline list: the three labels are long enough that
            flex-wrapping used to scramble them into one run of text on narrower screens. */}
        <nav aria-label="Create bag progress" className="space-y-2.5">
          <ol className="grid grid-cols-3 gap-2">
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
            title="Basics & content"
            description={STEPS[0].blurb}
            // `SectionCard` renders children in a bare div, so the vertical rhythm has to be
            // declared here — without it every field butts straight into the next one.
            contentClassName="space-y-5"
          >
            <div className="space-y-2">
              <Label htmlFor="title">Bag title</Label>
              <Input
                id="title"
                value={draft.title}
                onChange={(event) => patch({ title: event.target.value })}
                placeholder="Show how your first swap works in 60 seconds"
                maxLength={120}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project">Project name</Label>
              <Input
                id="project"
                value={draft.projectName}
                onChange={(event) => patch({ projectName: event.target.value })}
                placeholder="Your project name"
                maxLength={60}
              />
              <p className="text-xs text-muted-foreground">
                Optional. Shown on the bag so creators know whose product they are posting
                about.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="brief">Campaign brief / requirements</Label>
              <Textarea
                id="brief"
                value={draft.description}
                onChange={(event) => patch({ description: event.target.value })}
                placeholder="What to post, what to avoid, and what a good submission looks like. Mention any hashtags, tags or talking points creators must include."
                rows={5}
                maxLength={1200}
              />
              <p className="text-right text-xs tabular-nums text-muted-foreground">
                {draft.description.length}/1200
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="banner">Banner image</Label>
              {draft.bannerUrl ? (
                <div className="relative h-32 overflow-hidden rounded-xl border border-border">
                  { }
                  <img
                    src={draft.bannerUrl}
                    alt="Banner preview"
                    className="size-full object-cover"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="absolute right-2 top-2 gap-1"
                    onClick={() => patch({ bannerUrl: null })}
                  >
                    <X aria-hidden="true" className="size-3.5" />
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-4">
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
                    {uploading ? "Uploading…" : "Upload image"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG or WebP up to 600 KB. Wide images look best.
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadBanner(file);
                      event.target.value = "";
                    }}
                  />
                </div>
              )}
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Eligible platforms</legend>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((platform) => {
                  const selected = draft.platforms.includes(platform);
                  return (
                    <button
                      key={platform}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        patch({
                          platforms: selected
                            ? draft.platforms.filter((entry) => entry !== platform)
                            : [...draft.platforms, platform],
                        })
                      }
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                        selected
                          ? "border-brand bg-brand/10 text-foreground"
                          : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:bg-muted/40",
                      )}
                    >
                      <PlatformIcon platform={platform} className="size-3.5" />
                      {PLATFORM_LABELS[platform]}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </SectionCard>
        ) : null}


        {step === 1 ? (
          <SectionCard
            title="Budget, token & limits"
            description={STEPS[1].blurb}
            contentClassName="space-y-5"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="budget">Budget amount (USDC)</Label>
                <Input
                  id="budget"
                  inputMode="decimal"
                  value={draft.budget}
                  onChange={(event) => patch({ budget: event.target.value })}
                  placeholder="100"
                  className="tabular-nums"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum ${MIN_FIXED_BUDGET_USDC}. Total to fund in {symbol} — this is exactly
                  what you send in step 3.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Token</Label>
                {/*
                  Locked, not a picker.

                  The budget has to be worth a known amount for the minimum, the slot count and the
                  per-post ceiling to mean anything, and a custom token's price is unknowable to the
                  server. So this reads as a fact about the flow rather than a choice — the same
                  reason the flywheel flow's USDC pricing is not a field either.
                */}
                <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 text-sm">
                  <span className="font-medium tracking-wide text-foreground">{symbol}</span>
                  <span className="text-xs text-muted-foreground">
                    Solana · the only budget token for now
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="chain">Chain</Label>
                <Select value={draft.chain} onValueChange={(value) => patch({ chain: value })}>
                  <SelectTrigger id="chain" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHAINS.map((chain) => (
                      <SelectItem key={chain.id} value={chain.id} disabled={!chain.live}>
                        {chain.label}
                        {chain.live ? "" : " — coming soon"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration">Duration (days)</Label>
                <Input
                  id="duration"
                  inputMode="numeric"
                  value={draft.durationDays}
                  onChange={(event) => patch({ durationDays: event.target.value })}
                  className="tabular-nums"
                />
              </div>
            </div>


            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Payment model</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {PAYMENT_MODELS.map((model) => {
                  const selected = draft.paymentModel === model.id;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => patch({ paymentModel: model.id })}
                      className={cn(
                        "rounded-xl border p-3 text-left transition",
                        selected
                          ? "border-brand bg-brand/5"
                          : "border-border hover:border-muted-foreground/40 hover:bg-muted/40",
                      )}
                    >
                      <span className="block text-sm font-medium text-foreground">
                        {model.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {model.blurb}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              {draft.paymentModel !== "RPM" ? (
                <div className="space-y-2">
                  <Label htmlFor="fixed">Flat fee per post</Label>
                  <Input
                    id="fixed"
                    inputMode="decimal"
                    value={draft.fixedFee}
                    onChange={(event) => patch({ fixedFee: event.target.value })}
                    placeholder="25"
                    className="tabular-nums"
                  />
                  <p className="text-xs text-muted-foreground">
                    In {symbol}. Paid in full at quality 100, scaled down by the anti-slop
                    score.
                  </p>
                </div>
              ) : null}

              {draft.paymentModel !== "FIXED" ? (
                <div className="space-y-2">
                  <Label htmlFor="rpm">Reward per 1,000 views</Label>
                  <Input
                    id="rpm"
                    inputMode="decimal"
                    value={draft.ratePer1k}
                    onChange={(event) => patch({ ratePer1k: event.target.value })}
                    placeholder="4"
                    className="tabular-nums"
                  />
                  <p className="text-xs text-muted-foreground">In {symbol} per 1K views.</p>
                </div>
              ) : null}
            </div>

            {draft.paymentModel === "RPM" ? (
              <div className="space-y-2">
                <Label htmlFor="cap">Max per post</Label>
                <Input
                  id="cap"
                  inputMode="decimal"
                  value={draft.maxPayout}
                  onChange={(event) => patch({ maxPayout: event.target.value })}
                  placeholder={Number.isFinite(ceiling) ? String(Math.round(ceiling)) : "100"}
                  className="tabular-nums"
                />
                <p className="text-xs text-muted-foreground">
                  The most one post can earn. Blank defaults to 25,000 views&apos; worth.
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="maxsubs">Max submissions</Label>
                <Input
                  id="maxsubs"
                  inputMode="numeric"
                  value={draft.maxSubmissions}
                  onChange={(event) => patch({ maxSubmissions: event.target.value })}
                  placeholder={slots > 0 ? String(slots) : "Unlimited"}
                  className="tabular-nums"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxcreator">Max per creator</Label>
                <Input
                  id="maxcreator"
                  inputMode="numeric"
                  value={draft.maxPerCreator}
                  onChange={(event) => patch({ maxPerCreator: event.target.value })}
                  placeholder="1"
                  className="tabular-nums"
                />
              </div>
            </div>

            {Number.isFinite(budget) && budget > 0 ? (
              <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-3">
                <Info
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {amount(budget, symbol)} pays about{" "}
                  <span className="font-medium text-foreground">
                    {slots.toLocaleString("en-US")} creators
                  </span>
                  {Number.isFinite(ceiling) && ceiling > 0
                    ? ` at ${amount(ceiling, symbol)} each`
                    : ""}
                  .
                </p>
              </div>
            ) : null}

            {/*
              Fee Redirect deliberately has no controls here any more.

              It is a different product with a different funding model — fees rather than a wallet
              transfer — so it is its own flow, chosen on the first screen of Create Bag. Keeping a
              switch here meant this form asked questions that only applied to the other product,
              and a publisher had to understand both to fill in one. A fixed-budget bag is funded
              from the publisher's wallet and nothing else.
            */}
          </SectionCard>
        ) : null}


        {step === 2 ? (
          <SectionCard
            title="Fund the bag"
            description={STEPS[2].blurb}
            contentClassName="space-y-5"
          >
            {/* The summary is the point of this step: what you get, and exactly what you pay. */}
            <dl className="divide-y divide-border rounded-xl border border-border">
              {[
                ["Bag", draft.title.trim() || "Untitled bag"],
                ["Project", draft.projectName.trim() || "—"],
                [
                  "Platforms",
                  draft.platforms.map((entry) => PLATFORM_LABELS[entry]).join(", ") || "—",
                ],
                [
                  "Payout model",
                  PAYMENT_MODELS.find((m) => m.id === draft.paymentModel)!.label,
                ],
                [
                  draft.paymentModel === "FIXED" ? "Per post" : "Per post (up to)",
                  Number.isFinite(ceiling) ? amount(ceiling, symbol) : "—",
                ],
                ["Creators funded", slots.toLocaleString("en-US")],
                ["Runs for", `${toNumber(draft.durationDays)} days`],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-xs"
                >
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium text-foreground">{value}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-4 bg-brand/5 px-4 py-3">
                <dt className="text-sm font-medium text-foreground">You send</dt>
                <dd className="text-right text-base font-semibold tabular-nums text-foreground">
                  {amount(budget, symbol)}
                </dd>
              </div>
            </dl>

            {treasuryAddress ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Bagwork fixed-budget treasury — your transfer lands here and pays this bag&apos;s
                  creators. This is not the fee-redirect wallet flywheel fees go to.
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                    {treasuryAddress}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1"
                    onClick={() => {
                      void navigator.clipboard?.writeText(treasuryAddress);
                      setCopied(true);
                      toast.success("Treasury address copied");
                    }}
                  >
                    {copied ? (
                      <Check aria-hidden="true" className="size-3.5" />
                    ) : (
                      <Copy aria-hidden="true" className="size-3.5" />
                    )}
                    Copy
                  </Button>
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-warning/30 bg-warning/5 p-3.5 text-xs text-warning">
                Funding is unavailable right now — the fixed-budget treasury is not configured, so
                there is nowhere to send the budget. This bag cannot be activated until that is
                fixed.
              </p>
            )}

            {/*
              The funding transfer, as it happens: waiting for the wallet prompt → confirming
              on-chain → verified. A transfer that has been sent but not verified reads very
              differently from one nobody has approved yet, and this is the difference.
            */}
            {busy || fundStage !== "idle" ? (
              <ol
                aria-live="polite"
                className="space-y-1.5 rounded-xl border border-border bg-muted/20 p-3.5 text-xs"
              >
                {[
                  { key: "awaiting", label: "Waiting for your wallet's approval" },
                  { key: "confirming", label: "Confirming on-chain" },
                  { key: "verified", label: "Verified — the bag goes LIVE" },
                ].map((entry, index) => {
                  const order = ["awaiting", "confirming", "verified"];
                  const current = order.indexOf(fundStage);
                  const done = fundStage !== "idle" && index < current;
                  const active = fundStage === entry.key;
                  return (
                    <li
                      key={entry.key}
                      className={cn(
                        "flex items-center gap-2",
                        !done && !active && "text-muted-foreground/70",
                        done && "text-success",
                        active && "font-medium text-foreground",
                      )}
                    >
                      {done ? (
                        <Check aria-hidden="true" className="size-3.5 shrink-0" />
                      ) : active ? (
                        <Loader2 aria-hidden="true" className="size-3.5 shrink-0 animate-spin" />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="size-1.5 shrink-0 rounded-full bg-border"
                        />
                      )}
                      {entry.label}
                    </li>
                  );
                })}
              </ol>
            ) : null}

            <div className="flex items-start gap-2.5 rounded-xl border border-brand/30 bg-brand/5 p-4">
              <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
              <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                <p className="font-medium text-foreground">
                  Once funded, you cannot withdraw this budget.
                </p>
                <p>
                  The money moves to Bagwork&apos;s treasury and is only ever paid out to
                  creators whose posts pass review. There is no refund or cancel — a bag is a
                  commitment for its full duration.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-border p-4">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
              <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                <p className="font-medium text-foreground">Signed by your own wallet</p>
                {fundingWallet ? (
                  <p>
                    The transfer is built from{" "}
                    <span className="font-mono text-foreground">
                      {truncateAddress(fundingWallet)}
                    </span>
                    , the wallet on your account. Bagwork never holds your keys and cannot move
                    anything you have not signed for.
                  </p>
                ) : (
                  <p className="text-warning">
                    No Solana wallet is linked to your account, so there is nothing to fund from.
                    Link a wallet first — the budget is transferred from your own wallet.
                  </p>
                )}
              </div>
            </div>
          </SectionCard>
        ) : null}


        {created ? (
          <Button
            type="button"
            variant="outline"
            className="w-full gap-1.5"
            disabled={busy}
            onClick={() => {
              // Reuses the draft that is already persisted, so a second attempt does not
              // create a duplicate bag.
              setCreated(null);
              void createThenFund();
            }}
          >
            <Wallet aria-hidden="true" className="size-4" />
            Retry the transfer
          </Button>
        ) : null}

        {/*
          What is blocking the step, stated *before* the button. This used to render below the
          controls, so on a phone you got a greyed-out Continue with the explanation scrolled off
          the screen — the most confusing part of the flow.
        */}
        {issues.length > 0 ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-xl border border-warning/30 bg-warning/5 p-3.5"
          >
            <p className="text-xs font-medium text-warning">
              {issues.length === 1
                ? "One thing to finish first"
                : `${issues.length} things to finish first`}
            </p>
            <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
              {issues.map((issue) => (
                <li key={issue} className="flex gap-1.5">
                  <span aria-hidden="true">•</span>
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            className="gap-1.5"
            onClick={() => {
              /*
               * Step 0's "back" leaves this flow entirely. Switching product otherwise means
               * abandoning a half-filled form, so this is the one reasonable exit.
               */
              if (step === 0) setKind(null);
              else setStep((current) => (current - 1) as Step);
            }}
            disabled={busy}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            {step === 0 ? "Back to options" : "Back"}
          </Button>

          {step < 2 ? (
            <Button
              type="button"
              className="flex-1 gap-1.5 sm:flex-none"
              onClick={() => setStep((current) => (current + 1) as Step)}
              disabled={issues.length > 0}
            >
              Continue
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              className="flex-1 gap-2 sm:flex-none"
              onClick={() => void createThenFund()}
              disabled={
                busy || issues.length > 0 || !treasuryAddress || !fundingWallet
              }
            >
              {busy ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Wallet aria-hidden="true" className="size-4" />
              )}
              {busy
                ? fundStage === "confirming"
                  ? "Confirming on-chain…"
                  : "Waiting for your wallet…"
                : "Confirm funding in your wallet"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

