"use client";

import * as React from "react";
import { Check, Copy, ExternalLink, Loader2, Save, Sparkles, Wallet } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { randomHandle } from "@/lib/profile/handles";
import { useProfile, useUpdateProfile, type Profile } from "@/lib/profile/hooks";
import { HANDLE_PATTERN, PLATFORMS } from "@/lib/profile/options";
import { solanaExplorerUrl, truncateAddress } from "@/lib/privy/config";
import { isValidSolanaAddress } from "@/lib/solana/connection";
import { cn } from "@/lib/utils";
import { PageHeader, SectionCard, SignInRequired } from "../ui";
import { SocialVerification } from "../social-verification";

export interface SettingsState {
  notificationsEmail: boolean;
  notifyOnPayout: boolean;
  notifyOnStatusChange: boolean;
  autoClaim: boolean;
  preferredCurrency: "USDC" | "SOL";
}

/**
 * The default preferences.
 *
 * **Every notification starts off.** A new account is opted out of all of them and turns on the ones
 * it wants in Settings — nobody is subscribed to anything by signing up. That is the whole reason
 * these are `false` rather than `true`: an account created by connecting a wallet has not asked to be
 * emailed, pushed to, or told about anything.
 *
 * This object is the value used when nothing is stored, which is exactly "a new user": the store is
 * localStorage and `usePersistentState` does not write on mount, so an untouched browser reads these
 * defaults and a browser that has a saved preference reads that instead. Nothing is migrated or
 * bulk-rewritten, so an existing user who switched a notification on keeps it on.
 */
export const SETTINGS_DEFAULTS: SettingsState = {
  notificationsEmail: false,
  notifyOnPayout: false,
  notifyOnStatusChange: false,
  autoClaim: false,
  preferredCurrency: "USDC",
};

export function SettingsPage() {
  const [settings, setSettings] = usePersistentState<SettingsState>(
    "bagwork.settings",
    SETTINGS_DEFAULTS,
  );
  const { data, isLoading } = useProfile();
  const profile = data?.profile;
  const { login, walletAddress: sessionWallet } = useAuth();
  const signingWallet = profile?.walletAddress ?? sessionWallet ?? null;
  const update = useUpdateProfile();

  const [displayName, setDisplayName] = React.useState("");
  const [handle, setHandle] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [platforms, setPlatforms] = React.useState<string[]>([]);
  const [payoutWallet, setPayoutWallet] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [seeded, setSeeded] = React.useState(false);

  /*
   * Seed the form from the profile exactly once.
   *
   * The page used to be a drawer that stayed mounted behind a close animation, so it re-seeded on
   * every open. A route does not need that: seeding once and then leaving the fields alone means a
   * refetch while someone is typing cannot overwrite what they are typing.
   */
  React.useEffect(() => {
    if (!profile || seeded) return;
    setDisplayName(profile.displayName ?? "");
    setHandle(profile.handle ?? "");
    setBio(profile.bio ?? "");
    setPlatforms(profile.interests ?? []);
    setPayoutWallet(profile.payoutWallet ?? profile.walletAddress ?? sessionWallet ?? "");
    setSeeded(true);
  }, [profile, seeded]);

  /*
   * Fill the payout field from the signing wallet when Privy hands the connection over a beat
   * after the profile read.
   *
   * This is the same default the server writes, expressed in the UI as well, so a brand-new
   * wallet signup sees their address in both fields instead of an empty payout box. Guarded on
   * "still empty" so it can never overwrite something the user typed or pasted.
   */
  React.useEffect(() => {
    if (!seeded || !sessionWallet) return;
    setPayoutWallet((current) => (current.trim() ? current : sessionWallet));
  }, [seeded, sessionWallet]);

  const handleNormalised = handle.trim().toLowerCase();
  const handleValid = HANDLE_PATTERN.test(handleNormalised);
  const showHandleError = handleNormalised.length > 0 && !handleValid;

  const payoutNormalised = payoutWallet.trim();
  const payoutValid = isValidSolanaAddress(payoutNormalised);
  const showPayoutError = payoutNormalised.length > 0 && !payoutValid;
  /** True when this is only the signing wallet, so the field can say so. */
  const payoutIsJustTheSigningWallet =
    !profile?.payoutWallet && Boolean(signingWallet);

  const dirty =
    !!profile &&
    (displayName.trim() !== (profile.displayName ?? "") ||
      handleNormalised !== (profile.handle ?? "") ||
      bio.trim() !== (profile.bio ?? "") ||
      payoutNormalised !== (profile.payoutWallet ?? profile.walletAddress ?? "") ||
      [...platforms].sort().join(",") !== [...(profile.interests ?? [])].sort().join(","));

  async function copy(value: string, what: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${what} copied`);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not access the clipboard");
    }
  }

  /** One save for profile + wallet + platforms, because the API takes them as one PATCH. */
  async function save() {
    if (!handleValid) {
      setError("Handle must be 3-24 characters: a-z, 0-9 or underscore.");
      return;
    }
    if (showPayoutError) {
      setError("That is not a valid Solana address — payouts would be sent to nobody.");
      return;
    }
    setError(null);
    try {
      await update.mutateAsync({
        displayName: displayName.trim(),
        handle: handleNormalised,
        bio: bio.trim(),
        // `null` clears it. An empty string would fail validation, which is right: "no payout
        // wallet" is a deliberate state, not a missing value.
        payoutWallet: payoutNormalised || null,
        interests: platforms,
      });
      toast.success("Settings saved");
    } catch (saveError) {
      const issues = (saveError as Error & { issues?: { message: string }[] }).issues;
      setError(issues?.[0]?.message ?? (saveError as Error).message);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[40svh] items-center justify-center">
        <Loader2 aria-hidden="true" className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) {
    return (
      <SignInRequired
        title="Sign in to open settings"
        description="Your profile, your payout wallet and your preferences all live behind an account."
        onConnect={login}
      />
    );
  }

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Your profile, where you get paid, and what you are told about. Every editable field lives here — the profile page is a view, not a form."
        actions={
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={update.isPending || !dirty}
            onClick={() => void save()}
          >
            {update.isPending ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Save aria-hidden="true" className="size-4" />
            )}
            {dirty ? "Save changes" : "Saved"}
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-[1000px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3"
          >
            <p className="text-sm leading-relaxed text-foreground">{error}</p>
          </div>
        ) : null}

        {/* ---- A. Profile ------------------------------------------------------------- */}
        <SectionCard
          title="Profile"
          description="How you appear to projects and other creators."
        >
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="settings-name">Display name</Label>
                <Input
                  id="settings-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="How projects should address you"
                  maxLength={60}
                  disabled={update.isPending}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="settings-handle">Username</Label>
                {/*
                  The control row is `@` + field + Randomize, all at the field's own height.
                  Randomize used to sit on the label line, which made this column's first row taller
                  than the Display-name column's — so the two inputs did not line up and the username
                  field looked pushed down. One row for the label, one for the control, both columns
                  identical.

                  The name is generated client-side from the same word lists a new account gets. The
                  server is still the authority on whether it is free: a clash comes back as a 409
                  and the field says so, which is a retry rather than a mystery.
                */}
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="font-mono text-sm text-muted-foreground">
                    @
                  </span>
                  <Input
                    id="settings-handle"
                    value={handle}
                    onChange={(event) => setHandle(event.target.value)}
                    placeholder="yourhandle"
                    maxLength={24}
                    spellCheck={false}
                    autoComplete="off"
                    className="min-w-0 font-mono text-sm"
                    aria-invalid={showHandleError}
                    disabled={update.isPending}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 gap-1.5"
                    disabled={update.isPending}
                    onClick={() => setHandle(randomHandle())}
                  >
                    <Sparkles aria-hidden="true" className="size-3.5" />
                    Randomize
                  </Button>
                </div>
                <p
                  className={cn(
                    "text-xs",
                    showHandleError ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {showHandleError
                    ? "3-24 characters: a-z, 0-9 or underscore."
                    : handleNormalised
                      ? `Your profile: /dashboard/profile/${handleNormalised}`
                      : "Used for your public profile link and @mentions."}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-bio">Bio</Label>
              <Textarea
                id="settings-bio"
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                placeholder="Short-form video creator. I cover Solana tooling and ship two clips a week."
                maxLength={280}
                rows={3}
                disabled={update.isPending}
              />
              <p className="text-right text-xs tabular-nums text-muted-foreground">
                {bio.length}/280
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
              <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Bagworker
              </span>
              <span className="docs-mono text-sm font-semibold tabular-nums text-foreground">
                #{profile.profileNumber ?? "—"}
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                Permanent, and the only identifier that is guaranteed unique to you.
              </span>
            </div>
          </div>
        </SectionCard>

        {/* ---- B. Verified socials ---------------------------------------------------- */}
        {/*
          Next to the profile, not the wallet: a verified handle is part of who you are on Bagwork —
          it is what decides whether a submitted post can be credited — rather than a payment detail.
          The flow lives behind `SocialVerification`, which links the account through Privy on the
          signed-in user — one Privy app for the whole product, so there is never a second session
          that could clear this one underneath somebody.
        */}
        <SectionCard
          title="Verified socials"
          description="Prove the accounts you post from — only a verified handle can be credited for a submission."
        >
          <SocialVerification />
        </SectionCard>

        {/* ---- C. Wallet -------------------------------------------------------------- */}
        <SectionCard title="Wallet" description="Two addresses, and they are allowed to be different.">
          <div className="space-y-5">
            {/*
              The signing wallet first, and read-only: it is whatever Privy holds, it authorises a
              launch and any transaction, and it is not a setting.
            */}
            <div className="space-y-1.5">
              <Label>Signing wallet</Label>
              {signingWallet ? (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                    {truncateAddress(signingWallet, 8, 8)}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => void copy(signingWallet, "Signing wallet")}
                  >
                    <Copy aria-hidden="true" className="size-3" />
                    Copy
                  </Button>
                  <Button asChild size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs">
                    <a
                      href={solanaExplorerUrl("address", signingWallet)}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Explorer
                      <ExternalLink aria-hidden="true" className="size-3" />
                    </a>
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand/40 bg-brand/5 px-3 py-2.5">
                  <p className="text-xs leading-relaxed text-foreground">
                    No wallet connected. Connect one to sign launches.
                  </p>
                  <Button type="button" size="sm" className="gap-1.5" onClick={login}>
                    <Wallet aria-hidden="true" className="size-3.5" />
                    Connect wallet
                  </Button>
                </div>
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">
                Signs your launches and transactions. You never hand anyone a key — it stays in your
                wallet.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settings-payout">Payout wallet</Label>
              <Input
                id="settings-payout"
                value={payoutWallet}
                onChange={(event) => setPayoutWallet(event.target.value)}
                placeholder="Paste a Solana address"
                autoComplete="off"
                spellCheck={false}
                className="h-9 font-mono text-xs"
                aria-invalid={showPayoutError}
                aria-describedby="settings-payout-help"
                disabled={update.isPending}
              />
              <p
                id="settings-payout-help"
                className={cn(
                  "text-xs leading-relaxed",
                  showPayoutError ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {showPayoutError
                  ? "That is not a valid Solana address — payouts would be sent to nobody."
                  : payoutIsJustTheSigningWallet
                    ? "Currently your connected wallet. Save to confirm it, or paste a different address."
                    : payoutNormalised
                      ? "Every payout for every bag is sent here."
                      : "Not set. No bag can pay you until you add an address."}
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {signingWallet && payoutNormalised !== signingWallet ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={update.isPending}
                    onClick={() => setPayoutWallet(signingWallet)}
                  >
                    <Wallet aria-hidden="true" className="size-3.5" />
                    Use signing wallet as payout
                  </Button>
                ) : null}

                {payoutNormalised && payoutValid ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => void copy(payoutNormalised, "Payout wallet")}
                  >
                    <Copy aria-hidden="true" className="size-3.5" />
                    Copy address
                  </Button>
                ) : null}

                {payoutNormalised ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={update.isPending}
                    onClick={() => setPayoutWallet("")}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Notifications & Alerts"
          description="Off by default — turn on the ones you want"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="notifyPayout" className="text-sm font-medium">
                  Instant Payout Notifications
                </Label>
                <p className="text-xs text-muted-foreground">
                  Receive a prompt as soon as USDC settlement tx lands on Solana
                </p>
              </div>
              <Switch
                id="notifyPayout"
                checked={settings.notifyOnPayout}
                onCheckedChange={(c) =>
                  setSettings({ ...settings, notifyOnPayout: c })
                }
              />
            </div>

            <div className="h-px bg-border/40" />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="notifyStatus" className="text-sm font-medium">
                  Submission Status Updates
                </Label>
                <p className="text-xs text-muted-foreground">
                  Get notified when AI evaluation completes or manual reviews clear
                </p>
              </div>
              <Switch
                id="notifyStatus"
                checked={settings.notifyOnStatusChange}
                onCheckedChange={(c) =>
                  setSettings({ ...settings, notifyOnStatusChange: c })
                }
              />
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
