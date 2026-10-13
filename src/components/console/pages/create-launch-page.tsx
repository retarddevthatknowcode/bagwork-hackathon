"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSignAndSendTransaction, useWallets } from "@privy-io/react-auth/solana";
import { Keypair, Transaction } from "@solana/web3.js";
import {
  AlertTriangle,
  ChevronDown,
  Coins,
  ImagePlus,
  Loader2,
  Lock,
  Rocket,
  ShieldCheck,
  Sparkles,
  Upload,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/auth/auth-provider";
import {
  useBuildLaunch,
  useCheckLaunchStep,
  useLaunchAvailability,
  useLaunchQuote,
  useLockLaunch,
  useSubmitLaunch,
  useTreasuryAddress,
  type LaunchStepKind,
  type SubmittedLaunch,
} from "@/lib/console/hooks";
import { useSession } from "@/lib/queries";
import { SOLANA_CAIP2, truncateAddress } from "@/lib/privy/config";
import { base58Encode } from "@/lib/solana/base58";
import { PLATFORMS, PLATFORM_LABELS } from "@/lib/types";
import type { Platform } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MAX_DEV_BUY_BPS } from "@/lib/launch/config";
import { FLYWHEEL_OPT_IN_MIN_USD } from "@/lib/campaigns/flywheel-window";
import { usd } from "@/lib/console/format";
import type { LaunchCostEstimate } from "@/lib/launch/instructions";
import type { LaunchDraft } from "@/lib/launch/wizard";
import { SITE_URL, SITE_X_URL, isFetchableImageUrl } from "@/lib/site";
import { InfoRow, PageHeader, SectionCard, SignInRequired, WalletGate } from "../ui";

/**
 * Launch a flywheel coin — one page, two wallet prompts.
 *
 * This is the same launch as the four-step wizard that preceded it; only the shape of the form
 * changed. A wizard made the launcher answer questions in an order we chose and then walk back
 * through it to change anything, and the fields it separated — what the coin is called, what its
 * fees pay for, how much of it the launcher buys — are not really stages of anything. They are one
 * decision: what are we launching. So they live on one page, next to a preview of the result.
 *
 * The mechanism is untouched and deliberately so: the mint is generated here and never leaves this
 * component, the transaction is assembled server-side against the pump SDK as a create plus a
 * 100%-share fee lock, and nothing becomes a bag until the chain confirms that lock. Only the layout
 * is different.
 *
 * This page has one mode and therefore no mode switch. Register and Walletless used to be rendered
 * here as disabled `Soon` chips; a segmented control with a single usable position is decoration,
 * and a disabled control sitting beside a live one invites people to try the dead one. They come
 * back as a real control when they are real features.
 *
 * The manual "I already launched this elsewhere — point its fees at Bagwork" flow is deliberately
 * *not* reachable from here, or from anywhere else in the product: there is no link, no fallback and
 * no dead route to it. It is unshipped work, and a half-built entry point to it is worse than none.
 */

const EMPTY: LaunchDraft = {
  name: "",
  symbol: "",
  description: "",
  imageUrl: null,
  /*
   * The X link is prefilled with Bagwork's own account, and stays editable.
   *
   * Prefilled because most launchers are opening a campaign *here* and have no separate account to
   * point at, and because a metadata document with no X link reads as unfinished in a wallet.
   * Editable because the coin is theirs: if it has its own account, that is the right link. Whatever
   * is in the field when the form is submitted is what gets written — leaving the default writes
   * Bagwork's, which is the point of prefilling it rather than requiring it.
   *
   * The website is not here at all. It cannot be edited, so there is nothing to hold.
   */
  socials: { x: SITE_X_URL },
  title: "",
  brief: "",
  platforms: ["x"],
  ratePer1k: 10,
  maxPayout: 100,
  durationDays: 30,
  maxSubmissions: null,
  maxPerCreator: null,
  devBuySol: 0,
};

/** Lamports in one SOL, for turning the form's SOL input into the server's unit. */
const LAMPORTS_PER_SOL = 1_000_000_000;

/** The dev buy the slider runs to. Well past the 10% cap, so the cap is reachable and visible. */
const DEV_BUY_SLIDER_MAX_SOL = 5;

/** Base64 → bytes, so the exact serialised transaction the server produced is what gets signed. */
function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function sol(lamports: number, digits = 4): string {
  return `${(lamports / LAMPORTS_PER_SOL).toFixed(digits)} SOL`;
}

/**
 * Where a launch is, one state per wallet prompt.
 *
 * Named per step rather than one "signing", because the launch is two transactions — three with a dev
 * buy — and each one opens a wallet prompt. A second prompt with nothing said about it reads as a
 * duplicate charge.
 */
type LaunchStage = "idle" | "building" | "creating" | "devBuy" | "locking" | "verifying";

/** Which stage a built step is signed in, so the CTA can name the step being approved. */
const STAGE_FOR_STEP: Record<LaunchStepKind, LaunchStage> = {
  create: "creating",
  devBuy: "devBuy",
  feeShare: "locking",
};

/** How each step is named when it has to be referred to in a refusal. */
const STEP_NAMES: Record<LaunchStepKind, string> = {
  create: "create-coin",
  devBuy: "dev-buy",
  feeShare: "lock-fees",
};

/** What the wallet is being asked to do, per stage. Null when nothing is happening. */
function stageLabel(stage: LaunchStage): string | null {
  switch (stage) {
    case "building":
      return "Building the transactions…";
    case "creating":
      return "Create coin — confirm in your wallet";
    case "devBuy":
      return "Buy dev allocation — confirm in your wallet";
    case "locking":
      return "Lock fees — confirm in your wallet";
    case "verifying":
      return "Verifying the fee lock…";
    case "idle":
      return null;
  }
}

/**
 * A launch with its coin created and its fee lock unfinished.
 *
 * Held apart from `error` because it is not a failure of the launch — it is a step left to finish.
 * `createSignature` is kept because the verify route reads *both* transactions off the chain, and the
 * create's signature is still the right one when the lock is retried.
 */
interface PartialLaunch {
  launchId: string;
  mint: string;
  createSignature: string;
  /** Why the lock did not land, verbatim from the wallet or the chain. */
  message: string;
}

/**
 * The launch flow — reachable as its own screen and as the "launch a coin" branch of
 * `/dashboard/create`.
 *
 * The Solana wallet hooks are in `CreateLaunchFlow` below so they are only ever reached with a
 * `PrivyProvider` above them. The gate sits here rather than at either call site so both entry points
 * are covered by one: `CreateBagFlow` renders this component, and the router renders it directly.
 */
export function CreateLaunchPage({ onBackToChoice }: { onBackToChoice: () => void }) {
  return (
    <WalletGate>
      <CreateLaunchFlow onBackToChoice={onBackToChoice} />
    </WalletGate>
  );
}

function CreateLaunchFlow({ onBackToChoice }: { onBackToChoice: () => void }) {
  const router = useRouter();
  const { data: session } = useSession();
  const { ready, authenticated, login, getAccessToken } = useAuth();
  const { wallets } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();

  /*
   * Both Bagwork treasuries, so this page can keep them out of the launcher slot.
   *
   * These addresses are already public — `/api/treasury` hands them to every create flow that has
   * to show where money goes. They are read here for the opposite reason: to make sure neither can
   * ever be presented, or used, as the wallet that launches a coin.
   */
  const { data: fixedTreasury } = useTreasuryAddress("FIXED");
  const { data: feeTreasury } = useTreasuryAddress("FEE");

  const treasuryAddresses = useMemo(
    () =>
      [fixedTreasury?.address, feeTreasury?.address]
        .filter((value): value is string => !!value && value.trim().length > 0)
        .map((value) => value.trim().toLowerCase()),
    [fixedTreasury?.address, feeTreasury?.address],
  );

  const isTreasuryAddress = useCallback(
    (address: string | null | undefined) =>
      !!address && treasuryAddresses.includes(address.trim().toLowerCase()),
    [treasuryAddresses],
  );

  const [draft, setDraft] = useState<LaunchDraft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showSocials, setShowSocials] = useState(false);
  /**
   * Where the launch is. `idle` outside an attempt, so the CTA's label only ever describes something
   * that is genuinely happening — the same rule the fixed-budget funding flow follows.
   */
  const [stage, setStage] = useState<LaunchStage>("idle");
  /**
   * A launch that got part-way: the coin exists on-chain, the fee lock did not land. See the type.
   */
  const [partial, setPartial] = useState<PartialLaunch | null>(null);
  /**
   * This bag's page, once the launch has reserved it.
   *
   * The reservation happens on the first build — before the launcher signs anything — so this is
   * null while the form is being filled and set for the whole signing flow. It is what the Website
   * field shows: the exact URL the coin's metadata will carry, not the bare domain.
   */
  const [campaignUrl, setCampaignUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const quote = useLaunchQuote();
  const build = useBuildLaunch();
  const submit = useSubmitLaunch();
  const lock = useLockLaunch();
  const stepCheck = useCheckLaunchStep();
  const availability = useLaunchAvailability();

  /**
   * Adds or removes one platform, computed from the **latest** draft rather than the rendered one.
   *
   * This is why a selection went missing. The picker used to build the next array from `draft` as it
   * was at render time, and `patch` merged that into whatever the state had become — so two clicks
   * close together both started from the same stale list and the second overwrote the first. Someone
   * selecting X and TikTok got one of them, which read as "the second pick never registered". A
   * functional update has no such gap: it is always applied to the current state.
   */
  const togglePlatform = useCallback((platform: Platform) => {
    setDraft((current) => ({
      ...current,
      platforms: current.platforms.includes(platform)
        ? current.platforms.filter((entry) => entry !== platform)
        : [...current.platforms, platform],
    }));
  }, []);

  const patch = useCallback(
    (next: Partial<LaunchDraft>) => setDraft((current) => ({ ...current, ...next })),
    [],
  );

  /**
   * The wallet that will sign — the connected one, and only the connected one.
   *
   * The profile's wallet is preferred, because a Privy session can hold more than one and the launch
   * is built for whichever is about to sign. Building for the wrong one only surfaces as a rejected
   * prompt after the user has already approved it in their wallet UI.
   *
   * A Bagwork treasury is never eligible. It is *skipped* rather than chosen, so a session holding
   * both its own wallet and an imported treasury cannot quietly land on the treasury, and the flow's
   * promise that the fee wallet only ever receives stays true. `treasuryAsLauncher` reports the one
   * case that leaves — a connection holding nothing but a treasury — because that is a state the
   * page has to name rather than paper over with a plausible-looking address.
   */
  const { signer, treasuryAsLauncher } = useMemo(() => {
    const eligible = wallets.filter((wallet) => !isTreasuryAddress(wallet.address));
    const preferred = session?.user.walletAddress;
    const match = preferred
      ? eligible.find((wallet) => wallet.address.toLowerCase() === preferred.toLowerCase())
      : undefined;
    return {
      signer: match ?? eligible[0],
      /*
       * True only when a wallet IS connected and every connected wallet is a treasury. Deliberately
       * not the same as "no wallet": that has its own, simpler answer, and conflating the two would
       * tell someone with a treasury connected to connect a wallet they believe they already have.
       */
      treasuryAsLauncher: eligible.length === 0 && wallets.length > 0,
    };
  }, [wallets, session?.user.walletAddress, isTreasuryAddress]);

  const busy = stage !== "idle";

  /**
   * Polls the verify route until it accepts, gives up, or refuses for a reason waiting will not fix.
   *
   * Verification reads the chain, and a freshly broadcast transaction is not visible for a few
   * seconds — a `409` means exactly that, so it retries. Anything else is a real refusal (the coin was
   * never created, the fee lock is not 100%, or it is not permanent) and must not be retried, because
   * no amount of waiting changes what is on-chain.
   *
   * Both signatures go together: the route reads each transaction back, and it cannot accept a launch
   * whose fee lock was never sent.
   */
  const verifyLaunch = useCallback(
    async (
      launchId: string,
      signature: string,
      feeShareSignature: string,
      devBuySignature?: string,
    ) => {
      let lastReason = "";
      for (let attempt = 0; attempt < 8; attempt++) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2500));
        try {
          return await submit.mutateAsync({
            launchId,
            signature,
            feeShareSignature,
            ...(devBuySignature ? { devBuySignature } : {}),
            ...draft,
          });
        } catch (verifyError) {
          lastReason = verifyError instanceof Error ? verifyError.message : "Verification failed";
          /*
           * A refusal that says the coin exists but the lock did not is final: the chain has already
           * decided. It is surfaced as the partial state instead, so the launcher is offered the lock
           * retry rather than another round of the same poll.
           */
          const detail = verifyError as { retryable?: boolean; feeLockFailed?: boolean };
          if (detail.feeLockFailed) throw verifyError;
          if (!detail.retryable) throw verifyError;
        }
      }
      throw new Error(
        lastReason || "The launch was sent but has not confirmed yet. It will finish on its own.",
      );
    },
    [draft, submit],
  );

  /**
   * A blockhash fetched immediately before a signature, per step.
   *
   * The build route hands back every step in one response and they used to share a single blockhash.
   * A Solana blockhash is good for about 150 blocks — around a minute — and a launch is several
   * wallet approvals with a confirmation wait between each, so the later steps were routinely signed
   * against an expired one. That failure is "blockhash not found": the dev buy reverted and the fee
   * lock stuck, and retrying the lock worked because that path builds its transaction fresh. So each
   * step now asks for its own, one prompt ahead of the signature that needs it.
   */
  const freshBlockhash = useCallback(async () => {
    const token = await getAccessToken();
    const res = await fetch("/api/launches/blockhash", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.blockhash) {
      throw new Error(body.error || "Solana could not be reached for a fresh blockhash. Try again.");
    }
    return body.blockhash as string;
  }, [getAccessToken]);

  /**
   * Waits for one signed step to *succeed* on-chain.
   *
   * The wallet returning a signature means "sent"; `commitment: "confirmed"` means "seen". Neither
   * means it worked — a reverted transaction is confirmed and failed at the same time, which is
   * exactly how a dev buy with no SOL behind it was reported as a completed launch. So the chain is
   * asked directly, and the answer decides what happens next.
   */
  const confirmStep = useCallback(
    async (signature: string): Promise<"confirmed" | "failed" | "pending"> => {
      // ~15s of polling. Long enough for a normal confirmation, short enough that a stuck step does
      // not leave someone staring at a spinner wondering whether to pay again.
      for (let attempt = 0; attempt < 10; attempt++) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1500));
        const result = await stepCheck.mutateAsync({ signature });
        if (result.status !== "pending") return result.status;
      }
      return "pending";
    },
    [stepCheck],
  );

  /** Both paths end the same way: a bag exists, so send the launcher to it. */
  const finish = useCallback(
    (verified: SubmittedLaunch) => {
      if (verified.devBuyFailed) {
        /*
         * The launch is good — coin created, fees locked, bag open — but the buy did not land. Said
         * as a warning rather than an error, because nothing here is broken: it is a fact about the
         * launcher's own wallet that they would otherwise only find out by looking for tokens that
         * were never bought.
         */
        toast.warning("Coin launched and bag created", {
          description:
            "Your dev buy did not go through, so you do not hold any of this coin yet. Everything " +
            "else completed — you can buy on the market as normal. A dev buy needs SOL for the buy " +
            "on top of the coin's own rent, so a wallet that was just enough for the launch is the " +
            "usual cause.",
          duration: 12_000,
        });
      } else {
        toast.success("Coin launched and bag created", {
          description: "100% of this coin's creator fees are locked to Bagwork.",
        });
      }
      // The full console bag — sidebar, submit, claim and all — because a launcher who has just
      // finished a launch is about to work in it, and because it is the same URL the coin carries as
      // its website. The old `/bags/<id>` path stays alive as a permanent redirect for coins that
      // already have it on-chain.
      router.push(`/dashboard/bags/${verified.campaign.id}`);
    },
    [router],
  );

  /**
   * Builds, signs and verifies the launch.
   *
   * The launch is two transactions — three with a dev buy — because all of it together serialises past
   * Solana's 1232-byte packet limit. Each step is signed in turn, and each waits for confirmation
   * before the next is sent: the fee lock writes a config that is a PDA of the mint, so it cannot go
   * until the coin is really on-chain, and the dev buy has nothing to buy until then either.
   *
   * The mint keypair is generated here, per attempt, and never leaves this component — the server is
   * given its public address and nothing else. `create_v2` requires the mint's own signature, so it is
   * applied to the create step before the wallet's, and the wallet fills the remaining (fee-payer)
   * slot.
   */
  const launch = useCallback(async () => {
    if (!signer) {
      setError("Connect a Solana wallet — the launch is paid for from your wallet.");
      return;
    }

    /*
     * Belt and braces over the memo above.
     *
     * `isTreasuryAddress` can only answer once `/api/treasury` has responded, so a fast click could
     * otherwise slip past a resolution that had not landed yet. The server refuses this too — that
     * is where the guarantee lives — but saying it here means the refusal is instant and reads as a
     * rule rather than as a failed transaction.
     */
    if (isTreasuryAddress(signer.address)) {
      setError(
        "That is a Bagwork treasury wallet, so it cannot launch a coin. Connect your own wallet — the launch and any dev buy are paid from it, and the treasury only ever receives this coin's fees.",
      );
      return;
    }

    setError(null);
    setPartial(null);
    setStage("building");

    const mintKeypair = Keypair.generate();
    let createSignature = "";

    try {
      const built = await build.mutateAsync({
        ...draft,
        wallet: signer.address,
        mint: mintKeypair.publicKey.toBase58(),
      });
      // The bag is reserved by now — the build wrote it before it built anything — so the exact URL
      // the coin will carry is known from here on, ahead of the first signature.
      setCampaignUrl(built.campaignUrl);

      let feeShareSignature = "";
      let devBuySignature = "";

      try {
        for (const step of built.steps) {
          setStage(STAGE_FOR_STEP[step.kind]);

          const transaction = Transaction.from(base64ToBytes(step.transaction));
          /*
           * A blockhash this step's own, set immediately before the signature.
           *
           * The plan's steps are built together and would otherwise share one; a three-step launch
           * takes three wallet approvals, which can easily outlive a blockhash's ~60 seconds. Setting
           * it here is the last moment it can be right.
           */
          transaction.recentBlockhash = await freshBlockhash();
          // Only the create carries the mint's signature; the later steps have no mint keypair in them.
          if (step.kind === "create") transaction.partialSign(mintKeypair);

          const { signature } = await signAndSendTransaction({
            transaction: transaction.serialize({
              requireAllSignatures: false,
              verifySignatures: false,
            }),
            wallet: signer,
            chain: built.chain ?? SOLANA_CAIP2,
            /*
             * Confirm before moving on. Without this the next step would be built against state the
             * chain may not have yet — for the fee lock, a sharing config that does not exist — and
             * fail for a reason the launcher can do nothing about.
             *
             * Note this waits for confirmation, not for *success*: a transaction that reverted is
             * still confirmed. That is why every signature is handed to the server, which reads each
             * one's outcome off the chain rather than trusting that a wallet prompt returned.
             */
            options: { commitment: "confirmed" },
          });

          const encoded = base58Encode(signature);
          if (step.kind === "create") createSignature = encoded;
          if (step.kind === "devBuy") devBuySignature = encoded;
          if (step.kind === "feeShare") feeShareSignature = encoded;

          /*
           * ---- the chain's verdict, not the wallet's ---------------------------------------------
           *
           * A step is only done when the chain says it worked. Signing proves intent; this proves
           * the coin exists, the buy filled, or the lock is on.
           */
          const outcome = await confirmStep(encoded);

          if (outcome === "failed") {
            if (step.kind === "create") {
              throw new Error(
                "The coin was not created — the chain rejected that transaction, so nothing was " +
                  "launched and no coin exists. Check your wallet has enough SOL, then try again.",
              );
            }
            if (step.kind === "devBuy") {
              /*
               * The bag is funded by the coin's fees, not by the buy, so the launch continues — but
               * the failure is carried to the end and reported there, rather than being swallowed and
               * leaving the launcher to notice the missing tokens themselves.
               */
              continue;
            }
            // The fee lock. The coin exists, so this is the recoverable half-done state.
            setPartial({
              launchId: built.launchId,
              mint: mintKeypair.publicKey.toBase58(),
              createSignature,
              message: "The fee lock was rejected by the chain.",
            });
            setStage("idle");
            return;
          }

          if (outcome === "pending") {
            /*
             * Not seen after ~15s of polling. A transaction that has not confirmed is not a failed
             * one — it may still land — so this stops instead of pushing on, and says exactly that
             * rather than implying the money is gone. Once the coin exists, the lock retry is offered.
             */
            const message =
              `The ${STEP_NAMES[step.kind]} transaction has not confirmed yet. It may still land, ` +
              `so check your wallet before trying again.`;
            if (createSignature) {
              setPartial({
                launchId: built.launchId,
                mint: mintKeypair.publicKey.toBase58(),
                createSignature,
                message,
              });
              setStage("idle");
              return;
            }
            throw new Error(message);
          }
        }
      } catch (stepError) {
        /*
         * The coin is on-chain, so this is not "the launch failed" — it is a launch with a step left.
         * Claiming otherwise would be telling someone their coin does not exist while it trades.
         * Nothing has been promised to anyone yet either: no bag exists until the lock verifies, so
         * the only thing outstanding is the lock itself.
         */
        if (createSignature) {
          setPartial({
            launchId: built.launchId,
            mint: mintKeypair.publicKey.toBase58(),
            createSignature,
            message:
              stepError instanceof Error
                ? stepError.message
                : "The wallet did not complete that step.",
          });
          setStage("idle");
          return;
        }
        throw stepError;
      }

      setStage("verifying");
      finish(await verifyLaunch(built.launchId, createSignature, feeShareSignature, devBuySignature));

    } catch (launchError) {
      // Every refusal from the server carries the reason it refused — a cap breach, a failing
      // simulation, a fee lock that did not verify — so it is shown verbatim rather than flattened.
      setError(launchError instanceof Error ? launchError.message : "Could not launch this coin");
      setStage("idle");
    }
  }, [
    draft,
    signer,
    build,
    verifyLaunch,
    finish,
    confirmStep,
    freshBlockhash,
    signAndSendTransaction,
    isTreasuryAddress,
  ]);

  /**
   * Finishes a launch whose coin exists but whose fee lock did not land.
   *
   * Rebuilds only the fee-lock transaction — the coin must not be created twice, and `create_v2` would
   * fail on a mint that is already on-chain — signs it, and verifies again. The mint keypair is gone by
   * now and is not needed: the lock writes to the existing mint, not to a new one.
   */
  const retryLock = useCallback(async () => {
    if (!signer || !partial) return;

    setError(null);
    setStage("locking");

    try {
      const rebuilt = await lock.mutateAsync({ launchId: partial.launchId });

      const transaction = Transaction.from(base64ToBytes(rebuilt.transaction));
      const { signature } = await signAndSendTransaction({
        transaction: transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        }),
        wallet: signer,
        chain: SOLANA_CAIP2,
        options: { commitment: "confirmed" },
      });

      setStage("verifying");
      finish(await verifyLaunch(partial.launchId, partial.createSignature, base58Encode(signature)));
    } catch (retryError) {
      // Still partial — back to the same state, carrying whatever this attempt learned.
      setPartial((current) =>
        current
          ? {
              ...current,
              message:
                retryError instanceof Error
                  ? retryError.message
                  : "The fee lock did not go through.",
            }
          : current,
      );
      setStage("idle");
    }
  }, [signer, partial, lock, signAndSendTransaction, verifyLaunch, finish]);

  /** Token artwork, uploaded to the same store the bag banners use. */
  const uploadImage = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      try {
        const token = await getAccessToken();
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/uploads/banner", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.url) throw new Error(body.error || "Could not upload that image");
        patch({ imageUrl: body.url });
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Could not upload that image");
      } finally {
        setUploading(false);
      }
    },
    [getAccessToken, patch],
  );

  /**
   * One entry point for the dropzone and the file picker.
   *
   * The size and type are checked here as well as on the server so an obviously wrong file is
   * refused instantly rather than after a round trip — the route's own checks remain the authority.
   */
  const acceptImage = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
        setError("Use a PNG, JPG or WebP image");
        return;
      }
      if (file.size > 600 * 1024) {
        setError(`That image is ${Math.round(file.size / 1024)} KB — the limit is 600 KB`);
        return;
      }
      void uploadImage(file);
    },
    [uploadImage],
  );

  /**
   * Prices the dev buy as it changes.
   *
   * Debounced because each quote is a round trip to the chain and the slider moves continuously.
   * The quote is only ever used to *show* the size of the buy and to gate the button — the cap itself
   * is enforced on the server against the same curve, so a stale quote can never let an over-large
   * buy through.
   */
  useEffect(() => {
    if (availability.data?.enabled !== true) return;
    const timeout = setTimeout(() => quote.mutate(draft.devBuySol), 350);
    return () => clearTimeout(timeout);
  }, [draft.devBuySol, quote.mutate, availability.data?.enabled]);

  const costs = quote.data?.costs ?? null;
  const maxDevBuyBps = availability.data?.maxDevBuyBps ?? MAX_DEV_BUY_BPS;
  const devBuyOverCap = costs !== null && costs.devBuyLamports > 0 && !costs.withinCap;

  /** Launching is available only when the server says so. Unknown counts as no. */
  const launchEnabled = availability.data?.enabled === true;

  /**
   * Why the CTA is disabled, in the order the launcher would hit it.
   *
   * A greyed-out button with no reason is the worst version of this form: it tells someone they have
   * done something wrong without saying what. Each entry mirrors a rule the server enforces, so the
   * hint is never a guess that gets contradicted on submit.
   */
  /**
   * The artwork as it will be embedded: our own upload path, absolutised against the site.
   *
   * The upload route returns `/api/uploads/banner/<id>` on purpose — the file lives in our database,
   * so the coin's picture never depends on an external host — and the metadata builder absolutises
   * that path when it writes the document. This is that same value, so the form can judge it.
   */
  const imageOnChain = draft.imageUrl
    ? draft.imageUrl.startsWith("/")
      ? `${SITE_URL}${draft.imageUrl}`
      : draft.imageUrl
    : null;

  const blockers = useMemo(() => {
    const reasons: string[] = [];
    if (draft.name.trim().length < 1) reasons.push("Give the coin a name");
    /*
     * Uploading is asked about first, and separately, so the button says what is actually happening.
     * "Upload a token image" while an upload is in flight is the wrong sentence — the image exists,
     * it is on its way — and it is how someone concludes the upload silently failed and presses the
     * button again.
     */
    if (uploading) {
      reasons.push("Uploading image…");
    } else if (!imageOnChain || !isFetchableImageUrl(imageOnChain)) {
      /*
       * The image is required, not optional, and judged with the **server's own predicate** rather
       * than by truthiness. A laxer client check is the bug that produced this: the form accepted a
       * value the build route then refused, so the wizard could look complete and still be rejected.
       */
      reasons.push(
        draft.imageUrl
          ? "That image cannot be fetched publicly — upload it again"
          : "Upload a token image",
      );
    }
    if (!/^[A-Za-z0-9]{1,10}$/.test(draft.symbol.trim()))
      reasons.push("Add a ticker (letters and numbers only)");
    if (draft.description.trim().length < 20)
      reasons.push("Write a description of at least 20 characters");
    if (draft.platforms.length === 0) reasons.push("Pick at least one platform");
    if (!(draft.ratePer1k > 0)) reasons.push("Set a reward per 1,000 views");
    if (!(draft.maxPayout > 0)) reasons.push("Set a per-post cap");
    if (!(draft.durationDays >= 3 && draft.durationDays <= 90))
      reasons.push("Duration must be between 3 and 90 days");
    if ((draft.brief.trim() || draft.description.trim()).length < 20)
      reasons.push("Write a content brief of at least 20 characters");
    if (devBuyOverCap) reasons.push("Reduce the dev buy to 10% of supply or less");
    return reasons;
  }, [draft, devBuyOverCap, uploading, imageOnChain]);

  if (!ready) {
    return (
      <div className="flex min-h-[40svh] items-center justify-center">
        <Loader2 aria-hidden="true" className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <SignInRequired
        title="Sign in to launch a coin"
        description="The launch is signed and paid for by your own wallet. Bagwork never holds a key to your coin."
        onConnect={login}
      />
    );
  }

  const title = draft.title.trim() || draft.name.trim();
  const brief = draft.brief.trim() || draft.description.trim();

  /** A connected wallet that is allowed to launch. The only state the CTA acts on. */
  const usableSigner = !!signer && !treasuryAsLauncher;

  /**
   * What the dev wallet box shows: the wallet that will sign, and failing that the one on the
   * profile.
   *
   * The fallback matters because the two sources arrive independently — an authenticated account
   * whose Privy wallet list has not populated yet should read as "this is the wallet", not as "no
   * wallet", which would be a contradiction the person reading it cannot act on.
   */
  const devWallet = signer?.address ?? session?.user.walletAddress ?? null;

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Launch on Bagwork"
        title="Launch a flywheel coin"
        description="Create the coin and lock its creator fees to Bagwork in two wallet prompts. Those fees become the bag's budget as your coin trades."
      />

      <div className="mx-auto w-full max-w-[1080px] space-y-5 px-4 py-6 sm:px-6">
        {/*
          The refusal goes at the top, before the form, not at the wallet prompt. `launchEnabled` is
          only true when the server has confirmed the flag is armed *and* the fee treasury resolves,
          and an unconfirmed check counts as disabled — so the safe state is also the default state.
        */}
        {!launchEnabled ? (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3.5"
          >
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                Launching is switched off on this deployment
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {availability.data?.reason ??
                  (availability.isError
                    ? "The launch service could not be reached, so launching cannot be confirmed as available."
                    : "Checking whether launching is available…")}
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          {/* --------------------------------------------------------------- Left: the form */}
          <div className="space-y-5">
            {/*
              The dev wallet, above the form rather than beside the button, because it answers
              "what pays for this": the launch cost and any dev buy both come out of it, and it is
              the only signer the transaction will accept.
            */}
            <div
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-3",
                treasuryAsLauncher
                  ? "border-destructive/40 bg-destructive/5"
                  : usableSigner
                    ? "border-border bg-card/40"
                    : "border-brand/40 bg-brand/5",
              )}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg border",
                  treasuryAsLauncher
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : usableSigner
                      ? "border-border bg-muted/40 text-muted-foreground"
                      : "border-brand/40 bg-brand/10 text-brand",
                )}
              >
                <Wallet aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Dev wallet
                </p>
                {treasuryAsLauncher ? (
                  /*
                   * A connected treasury is named and refused, never displayed as a dev wallet. This
                   * is the one path where the box could otherwise show a Bagwork address under this
                   * heading, and showing it — even greyed out — would read as "this is fine".
                   */
                  <>
                    <p className="truncate font-mono text-sm text-destructive">
                      {wallets[0] ? truncateAddress(wallets[0].address, 6, 6) : "—"}
                    </p>
                    <p className="text-[11px] text-destructive">
                      A Bagwork treasury cannot launch a coin. Connect your own wallet.
                    </p>
                  </>
                ) : devWallet ? (
                  <>
                    <p className="truncate font-mono text-sm text-foreground">
                      {truncateAddress(devWallet, 6, 6)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {signer
                        ? "Pays the launch cost and any dev buy. The only signer."
                        : "Connect this wallet to sign — the launch is paid from it."}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-foreground">
                    No wallet connected yet — that is the only thing missing.
                  </p>
                )}
              </div>
              {!usableSigner ? (
                <Button type="button" size="sm" onClick={login}>
                  <Wallet aria-hidden="true" className="size-3.5" />
                  {treasuryAsLauncher ? "Use your own wallet" : "Connect wallet"}
                </Button>
              ) : null}
            </div>

            {/* ................................................................ the token */}
            <SectionCard
              title="The token"
              description="The identity your coin carries in every wallet, explorer and trading terminal."
            >
              <div className="space-y-5">
                {/* Dropzone: click or drop. The whole panel is the target, not just a button. */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Upload token image"
                  onClick={() => fileRef.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      fileRef.current?.click();
                    }
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    acceptImage(event.dataTransfer.files?.[0]);
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-4 rounded-xl border border-dashed px-4 py-4 transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
                    dragging
                      ? "border-brand/60 bg-brand/5"
                      : "border-border bg-muted/10 hover:border-brand/40 hover:bg-muted/20",
                  )}
                >
                  <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30">
                    {draft.imageUrl ? (
                      <img src={draft.imageUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <ImagePlus aria-hidden="true" className="size-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      {uploading ? (
                        <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                      ) : (
                        <Upload aria-hidden="true" className="size-3.5" />
                      )}
                      {draft.imageUrl ? "Replace token image" : "Drop token image or browse"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">PNG, JPG or WebP · max 600 KB</p>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(event) => {
                      acceptImage(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
                  <div className="space-y-1.5">
                    <Label htmlFor="launch-name">Name</Label>
                    <Input
                      id="launch-name"
                      value={draft.name}
                      maxLength={32}
                      placeholder="Bagwork"
                      onChange={(event) => patch({ name: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="launch-symbol">Ticker</Label>
                    <Input
                      id="launch-symbol"
                      value={draft.symbol}
                      maxLength={10}
                      placeholder="BAG"
                      className="uppercase"
                      onChange={(event) => patch({ symbol: event.target.value.toUpperCase() })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="launch-description">Description</Label>
                  <Textarea
                    id="launch-description"
                    value={draft.description}
                    rows={3}
                    placeholder="What is this coin for? This becomes the coin's metadata and seeds the bag brief."
                    onChange={(event) => patch({ description: event.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {draft.description.trim().length}/20 characters minimum
                  </p>
                </div>

                {/* Socials are genuinely optional, so they start folded away rather than as a field
                    every launcher has to read and consciously skip. */}
                <div className="border-t border-border/60 pt-4">
                  <button
                    type="button"
                    aria-expanded={showSocials}
                    onClick={() => setShowSocials((open) => !open)}
                    className="flex w-full items-center justify-between gap-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Socials (optional)
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        "size-3.5 transition-transform duration-200 motion-reduce:transition-none",
                        showSocials && "rotate-180",
                      )}
                    />
                  </button>
                  {showSocials ? (
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="launch-x">X profile</Label>
                        <Input
                          id="launch-x"
                          value={draft.socials.x ?? ""}
                          placeholder={SITE_X_URL}
                          onChange={(event) =>
                            patch({ socials: { ...draft.socials, x: event.target.value } })
                          }
                        />
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          Prefilled with Bagwork&apos;s account. Replace it with your coin&apos;s own if
                          it has one.
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="launch-website" className="flex items-center gap-1.5">
                          <Lock aria-hidden="true" className="size-3 text-muted-foreground" />
                          Website
                        </Label>
                        {/*
                          Read-only, and never bound to the draft — `LaunchSocials` has no website
                          field for a form to hold, so there is nothing here a client could send.
                          What it shows is this bag's own page, which is exactly what the coin's
                          metadata will carry.

                          Before the build there is no id yet, so it shows the shape of the URL rather
                          than a bare domain: a placeholder reading just "bag-work.fun" would be wrong
                          the moment the field became real, and the point of the field is that the
                          launcher can see where their coin points before they sign.

                          `readOnly` rather than `disabled`, so it stays focusable and readable by a
                          screen reader instead of being skipped as an unusable control.
                        */}
                        <Input
                          id="launch-website"
                          value={campaignUrl ?? `${SITE_URL}/dashboard/bags/…`}
                          readOnly
                          aria-describedby="launch-website-note"
                          className="cursor-default bg-muted/40 font-mono text-xs text-muted-foreground"
                        />
                        <p
                          id="launch-website-note"
                          className="text-[11px] leading-relaxed text-muted-foreground"
                        >
                          {campaignUrl
                            ? "This bag's campaign page — fixed for this launch."
                            : "Assigned when you launch — this bag's own page, and the coin's website."}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </SectionCard>

            {/* ............................................................. the bag rules */}
            <SectionCard
              title="What the fees pay for"
              description="Your coin's trading fees become this bag's budget. These rules decide how that budget reaches creators."
            >
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label>Platforms</Label>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORMS.map((platform) => {
                      const active = draft.platforms.includes(platform);
                      return (
                        <button
                          key={platform}
                          type="button"
                          aria-pressed={active}
                          onClick={() => togglePlatform(platform as Platform)}
                          className={cn(
                            "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors duration-200 motion-reduce:transition-none",
                            active
                              ? "border-brand/50 bg-brand/10 text-brand"
                              : "border-border bg-muted/30 text-muted-foreground hover:border-brand/40 hover:text-foreground",
                          )}
                        >
                          {PLATFORM_LABELS[platform] ?? platform}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="launch-rpm">Reward per 1,000 views</Label>
                    <Input
                      id="launch-rpm"
                      inputMode="decimal"
                      value={String(draft.ratePer1k)}
                      onChange={(event) => patch({ ratePer1k: Number(event.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="launch-cap">Max per post</Label>
                    <Input
                      id="launch-cap"
                      inputMode="decimal"
                      value={String(draft.maxPayout)}
                      onChange={(event) => patch({ maxPayout: Number(event.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="launch-days">Duration (days)</Label>
                    <Input
                      id="launch-days"
                      inputMode="numeric"
                      value={String(draft.durationDays)}
                      onChange={(event) => patch({ durationDays: Number(event.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="launch-brief">Content brief</Label>
                  <Textarea
                    id="launch-brief"
                    value={draft.brief}
                    rows={3}
                    placeholder={draft.description || "What should creators post?"}
                    onChange={(event) => patch({ brief: event.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Seeds from the token description. This is what submissions are reviewed against.
                  </p>
                </div>
              </div>
            </SectionCard>

            {/* .............................................................. the dev buy */}
            <SectionCard
              title="Dev buy"
              description="Optional. Buying some of your own coin at launch adds one more wallet step — the buy cannot share the coin's transaction, because together they are too large."
            >
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Input
                    id="launch-devbuy"
                    aria-label="Dev buy in SOL"
                    inputMode="decimal"
                    className="max-w-[130px]"
                    value={String(draft.devBuySol)}
                    onChange={(event) => patch({ devBuySol: Number(event.target.value) || 0 })}
                  />
                  <span className="text-sm text-muted-foreground">SOL</span>
                  <input
                    type="range"
                    aria-label="Dev buy in SOL"
                    min={0}
                    max={DEV_BUY_SLIDER_MAX_SOL}
                    step={0.05}
                    value={Math.min(draft.devBuySol, DEV_BUY_SLIDER_MAX_SOL)}
                    onChange={(event) => patch({ devBuySol: Number(event.target.value) })}
                    className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-brand"
                  />
                </div>

                {/*
                  The cap is stated as a share of supply rather than in SOL, because "10% of supply"
                  is the rule — the SOL it costs moves with the curve, so a SOL-based limit would
                  drift. The live figure comes from the same server quote the build route uses.
                */}
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">
                    {costs && costs.devBuyLamports > 0
                      ? `${(costs.devBuyBps / 100).toFixed(2)}% of supply`
                      : "No dev buy"}
                  </span>
                  <span className={cn(devBuyOverCap ? "text-destructive" : "text-muted-foreground")}>
                    Maximum {maxDevBuyBps / 100}% of supply
                  </span>
                </div>

                {devBuyOverCap ? (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-foreground">
                    That is {(costs ? costs.devBuyBps / 100 : 0).toFixed(2)}% of supply. Reduce the
                    amount to {maxDevBuyBps / 100}% or less to continue.
                  </p>
                ) : null}
              </div>
            </SectionCard>

            {/* ............................................................. the cost panel */}
            <SectionCard
              title="Estimated cost"
              description="Everything the launch charges your wallet, before the launchpad's own fees."
            >
              {quote.isPending && !costs ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                  Pricing this launch…
                </div>
              ) : costs ? (
                <div className="space-y-2">
                  <InfoRow label="Network fee" value={sol(costs.networkFeeLamports)} />
                  <InfoRow label="Mint account rent" value={sol(costs.mintRentLamports)} />
                  {costs.tokenAccountRentLamports > 0 ? (
                    <InfoRow label="Token account rent" value={sol(costs.tokenAccountRentLamports)} />
                  ) : null}
                  {costs.devBuyLamports > 0 ? (
                    <InfoRow label="Dev buy" value={sol(costs.devBuyLamports)} />
                  ) : null}
                  <div className="border-t border-border pt-2">
                    <InfoRow label="Total from your wallet" value={sol(costs.totalLamports)} />
                  </div>
                  <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {costs.excludedNote}
                  </p>

                  {/*
                    Who pays, stated once and plainly — this is the money rule of the whole feature.

                    The create, the rent and any dev buy come from the connected wallet and nowhere
                    else. The Bagwork fee treasury is never a payer in this flow: it only ever
                    *receives* the coin's creator fees, which is what funds the bag afterwards. Said
                    here, next to the number being charged, rather than left to be inferred from a
                    wallet prompt.
                  */}
                  <p className="flex items-start gap-1.5 rounded-lg border border-border bg-muted/20 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                    <Wallet aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
                    <span>
                      <span className="font-medium text-foreground">
                        You pay network and create costs from your wallet.
                      </span>{" "}
                      Bagwork never launches from the fee treasury — that wallet only receives this
                      coin&apos;s creator fees.
                    </span>
                  </p>
                </div>
              ) : quote.error ? (
                <p className="text-sm text-destructive">
                  Could not price this launch: {quote.error.message}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {launchEnabled
                    ? "Cost appears here once pricing succeeds."
                    : "Pricing is unavailable while launching is switched off."}
                </p>
              )}
            </SectionCard>

            {/* .............................................................. the fee lock */}
            <div className="flex items-start gap-3 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3.5">
              <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  100% of creator fees lock to Bagwork
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Applied once, and the program revokes the admin as it applies it — nobody, including
                  us, can point those fees anywhere else afterwards. They are collected in the Bagwork
                  fee treasury, converted to USDC once they are worth swapping, and become this
                  bag&apos;s budget as your coin trades. That treasury pays this bag&apos;s creators and
                  is never used to launch a coin. Creators can opt in once that budget reaches{" "}
                  {usd(FLYWHEEL_OPT_IN_MIN_USD)}, and the window closes again whenever it drops below.
                </p>
              </div>
            </div>

            {/*
              The half-done launch, said as what it is.

              The coin exists — it is trading, with a contract address the launcher can look up — so
              "the launch failed" would be false, and starting over would fail too, because the mint
              already exists. What is true is that the fee lock did not land, no bag was created, and
              the lock can simply be retried. Kept out of the error box below, which is for things that
              stop the launch altogether.
            */}
            {partial ? (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3.5"
              >
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Your coin was created — the fee lock still needs to go through
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {partial.mint
                      ? `The coin at ${truncateAddress(partial.mint, 6, 6)} is live and trading, but `
                      : "The coin is live and trading, but "}
                    its creator fees are not routed to Bagwork yet, so no bag was created and nothing is
                    being paid out. Nothing is lost — those fees are still unlocked, so the lock can be
                    retried against the same coin.
                  </p>
                  {partial.message ? (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {partial.message}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {error ? (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3"
              >
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
                <p className="text-sm leading-relaxed text-foreground">{error}</p>
              </div>
            ) : null}

            {/* ................................................................ the CTA */}
            <div className="space-y-3">
              {/*
                One button, and it always does the thing that is actually blocking. With no wallet
                it connects; with a wallet it launches. A disabled "Sign and launch" sitting beside
                a separate connect affordance made the missing wallet look like one of several
                problems — it is the only one.
              */}
              <Button
                type="button"
                size="lg"
                className="w-full"
                disabled={
                  busy ||
                  uploading ||
                  !launchEnabled ||
                  (!partial && usableSigner && blockers.length > 0)
                }
                onClick={() =>
                  partial ? void retryLock() : usableSigner ? void launch() : login()
                }
              >
                {busy || uploading ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : partial || usableSigner ? (
                  <Sparkles aria-hidden="true" className="size-4" />
                ) : (
                  <Wallet aria-hidden="true" className="size-4" />
                )}
                {uploading
                  ? "Uploading image…"
                  : busy
                    ? (stageLabel(stage) ?? "Working…")
                    : partial
                      ? "Retry the fee lock"
                      : !usableSigner
                        ? treasuryAsLauncher
                          ? "Connect your own wallet"
                          : "Connect wallet"
                        : "Sign and launch"}
              </Button>

              {/*
                Say why the button is off. A disabled control with no reason tells someone they have
                done something wrong without saying what, so the first unmet rule is named — and only
                the first, because a list of nine would read as a rejection.
              */}
              {!busy && blockers.length > 0 ? (
                <p className="text-center text-xs text-muted-foreground">{blockers[0]}</p>
              ) : null}

              {/*
                No manual fallback here.

                A small link used to sit right below this button, offering the hand-made flow for a
                token that is already live. That flow is not shipped, and offering it from the primary
                CTA's own footer is how a page ends up advertising something it cannot do — the person
                who needs it clicks it, and everyone else wonders whether they picked the wrong
                option. Launching a coin is the whole page.
              */}
            </div>
          </div>

          {/* ----------------------------------------------------------- Right: the preview */}
          <LaunchPreview
            draft={draft}
            title={title}
            brief={brief}
            costs={costs}
            devBuyOverCap={devBuyOverCap}
            maxDevBuyBps={maxDevBuyBps}
            treasury={availability.data?.treasury ?? null}
          />
        </div>

        <button
          type="button"
          onClick={onBackToChoice}
          className="text-xs text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground"
        >
          Back to campaign types
        </button>
      </div>
    </div>
  );
}

/**
 * The live preview — what the launch will look like, updating as the form is typed into.
 *
 * Sticky on desktop and simply the next block on mobile, where there is no room to sit beside the
 * form. It is deliberately read-only and cheap: everything here is derived from state the form
 * already owns, so it cannot drift from what will actually be signed, and it gives the fee lock a
 * place to be stated once as a fact rather than repeated as reassurance in three sections.
 */
function LaunchPreview({
  draft,
  title,
  brief,
  costs,
  devBuyOverCap,
  maxDevBuyBps,
  treasury,
}: {
  draft: LaunchDraft;
  title: string;
  brief: string;
  costs: LaunchCostEstimate | null;
  devBuyOverCap: boolean;
  maxDevBuyBps: number;
  treasury: string | null;
}) {
  return (
    <aside aria-label="Launch preview" className="lg:sticky lg:top-6">
      <div className="space-y-4 rounded-2xl border border-border bg-card/40 p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Preview
        </p>

        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30">
            {/*
              The upload's own URL, not a `blob:` preview.

              A blob is the file the browser is holding; this is the stored asset the metadata will
              name. Rendering the path rather than absolutising it here is deliberate — the path
              resolves to the same bytes on whatever host is serving the page, so this preview is
              faithful on a local run as well as in production — and the witness that it is the right
              value is that it is the same string the server is sent.
            */}
            {draft.imageUrl ? (
              <img src={draft.imageUrl} alt="" className="size-full object-cover" />
            ) : (
              <Coins aria-hidden="true" className="size-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {draft.name.trim() || "Your coin"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              ${draft.symbol.trim() || "TICKER"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge
            variant="outline"
            className="gap-1 border-brand/40 bg-brand/10 px-1.5 py-0 text-[10px] font-medium text-brand"
          >
            <Rocket aria-hidden="true" className="size-2.5" />
            Flywheel bag
          </Badge>
          <Badge
            variant="outline"
            className="gap-1 border-border bg-muted/40 px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
          >
            Fees lock to Bagwork
          </Badge>
        </div>

        <p className="line-clamp-3 min-h-8 text-xs leading-relaxed text-muted-foreground">
          {brief.trim() || "The bag brief appears here as you write it."}
        </p>

        <dl className="space-y-2 border-t border-border/60 pt-3">
          <InfoRow label="Bag" value={title.trim() || "—"} />
          <InfoRow label="Reward" value={`$${draft.ratePer1k} per 1K views`} />
          <InfoRow label="Max per post" value={`$${draft.maxPayout}`} />
          <InfoRow label="Duration" value={`${draft.durationDays} days`} />
          <InfoRow
            label="Platforms"
            value={
              draft.platforms.length > 0
                ? draft.platforms
                    .map((platform) => PLATFORM_LABELS[platform] ?? platform)
                    .join(", ")
                : "—"
            }
          />
          <InfoRow
            label="Dev buy"
            value={
              costs && costs.devBuyLamports > 0
                ? `${sol(costs.devBuyLamports, 3)} · ${(costs.devBuyBps / 100).toFixed(2)}%`
                : "None"
            }
          />
          <InfoRow
            label="Launch cost"
            value={costs ? sol(costs.totalLamports, 3) : "—"}
          />
        </dl>

        {devBuyOverCap ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[11px] leading-relaxed text-foreground">
            Dev buy is over the {maxDevBuyBps / 100}% limit and would be refused.
          </p>
        ) : null}

        {/* The one place the fee lock is stated as a fact rather than as a progress step. */}
        <div className="rounded-xl border border-brand/30 bg-brand/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-brand">
            <ShieldCheck aria-hidden="true" className="size-3.5" />
            Fee lock 100%
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Creator fees go to the Bagwork fee treasury, permanently.
            {treasury ? ` ${truncateAddress(treasury)}` : ""}
          </p>
        </div>
      </div>
    </aside>
  );
}





