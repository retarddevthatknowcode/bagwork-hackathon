"use client";

import * as React from "react";
import { Check, Loader2, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { useProfile, useRemoveSocial } from "@/lib/profile/hooks";
import { SOCIAL_VERIFY_PLATFORMS, type SocialVerifyPlatform } from "@/lib/privy/config";
import { cn } from "@/lib/utils";
import { platformLabel, PlatformIcon } from "./platform-icons";

/**
 * "Verified socials" — proving an X / TikTok / Instagram handle for the signed-in account.
 *
 * One Privy app does this: the same one that signs the user in with a wallet. A Verify click starts
 * Privy's own link flow (`useLinkAccount`, via `useAuth().linkSocial`), the handle is read back from
 * the user's linked accounts, and it is stored against `User.socials` — which is what the submission
 * gate matches post links against later.
 *
 * There used to be a second Privy app for exactly this, and it is gone on purpose: two providers on
 * one origin share a session, so the second app could sign people out. Nothing here is automatic
 * either — no link flow runs until a button is pressed, and opening this page reads a profile and
 * nothing else.
 */
export function SocialVerification() {
  const {
    configured,
    linkedSocials,
    socialLinkPending,
    socialLinkResult,
    clearSocialLinkResult,
    linkSocial,
    saveLinkedSocial,
    unlinkSocial,
  } = useAuth();
  const profile = useProfile().data?.profile;
  const socials = profile?.socials ?? {};
  const remove = useRemoveSocial();

  function unlink(platform: SocialVerifyPlatform) {
    remove.mutate(platform, {
      onSuccess: () => {
        toast.success(`${platformLabel(platform)} account removed`);
        // Keeps the Privy account in step with our record. Best-effort, and never blocks the removal.
        void unlinkSocial(platform);
      },
    });
  }

  if (!configured) {
    return (
      <div className="space-y-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3.5">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ShieldAlert aria-hidden="true" className="size-4 text-warning" />
          Social verification is unavailable
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Verifying an account runs on the same Privy app that signs you in, and this deployment has no
          Privy credentials. Set <code className="font-mono text-foreground">NEXT_PUBLIC_PRIVY_APP_ID</code>{" "}
          and <code className="font-mono text-foreground">PRIVY_APP_SECRET</code> to turn it on.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Bagwork only accepts a post from an account it has proven is yours, so a verified handle is
        what makes a submission eligible. Linking happens on your own Bagwork account — it never
        touches your sign-in, your wallet or your payout address.
      </p>

      {socialLinkResult ? (
        <div
          role="status"
          className={cn(
            "flex items-start gap-2 rounded-xl border px-3.5 py-3",
            socialLinkResult.ok ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5",
          )}
        >
          {socialLinkResult.ok ? (
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
          )}
          <p className="flex-1 text-xs leading-relaxed text-foreground">{socialLinkResult.message}</p>
          <button
            type="button"
            onClick={clearSocialLinkResult}
            aria-label="Dismiss"
            className="shrink-0 rounded text-muted-foreground transition-colors hover:text-foreground"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      ) : null}

      <ul className="grid list-none gap-2.5 p-0">
        {SOCIAL_VERIFY_PLATFORMS.map((platform) => (
          <PlatformRow
            key={platform}
            platform={platform}
            stored={socials[platform] ?? null}
            linked={linkedSocials[platform] ?? null}
            pending={socialLinkPending === platform}
            busy={remove.isPending}
            onVerify={() => linkSocial(platform)}
            onSave={() => void saveLinkedSocial(platform)}
            onRemove={() => unlink(platform)}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * One platform, in whichever of its three states it is in.
 *
 * `stored` is our own record, which is what the submission gate reads; `linked` is what Privy knows
 * about the account. They are usually the same, and when they are not — a link finished but the store
 * call did not — the row offers to save it rather than doing so by itself.
 */
function PlatformRow({
  platform,
  stored,
  linked,
  pending,
  busy,
  onVerify,
  onSave,
  onRemove,
}: {
  platform: SocialVerifyPlatform;
  stored: string | null;
  linked: string | null;
  pending: boolean;
  busy: boolean;
  onVerify: () => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  const label = platformLabel(platform);
  const needsSaving = !stored && Boolean(linked);
  const disabled = pending || busy;

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-secondary/20 px-3.5 py-3">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg border",
          stored
            ? "border-brand/40 bg-brand/10 text-brand"
            : "border-border bg-muted/30 text-muted-foreground",
        )}
      >
        <PlatformIcon platform={platform} className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="truncate text-xs text-muted-foreground" title={stored ? `@${stored}` : undefined}>
          {stored
            ? `@${stored}`
            : needsSaving
              ? `@${linked} — linked, not saved yet`
              : "No account verified"}
        </p>
      </div>

      {stored ? (
        <>
          <Badge
            variant="outline"
            className="shrink-0 gap-1 border-success/30 bg-success/10 font-normal text-success"
          >
            <Check aria-hidden="true" className="size-3" />
            Verified
          </Badge>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            disabled={disabled}
            onClick={onVerify}
            aria-label={`Verify a different ${label} account`}
          >
            {pending ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : "Re-verify"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="shrink-0"
            disabled={busy}
            onClick={onRemove}
            aria-label={`Remove the verified ${label} account`}
          >
            Remove
          </Button>
        </>
      ) : needsSaving ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5"
          disabled={disabled}
          onClick={onSave}
          aria-label={`Save the linked ${label} account`}
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          ) : (
            <ShieldCheck aria-hidden="true" className="size-3.5" />
          )}
          {pending ? "Saving…" : "Save"}
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5"
          disabled={disabled}
          onClick={onVerify}
          aria-label={`Verify your ${label} account`}
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          ) : (
            <ShieldCheck aria-hidden="true" className="size-3.5" />
          )}
          {pending ? "Opening…" : "Verify"}
        </Button>
      )}
    </li>
  );
}
