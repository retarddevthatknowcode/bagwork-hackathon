"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy, LogOut, Settings, UserRound, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/components/auth/auth-provider";
import { BagworkerTag, ProfileAvatar } from "@/components/console/identity";
import { useSolanaBalance } from "@/lib/console/hooks";
import { shortAddress, solAmount, usd } from "@/lib/console/format";
import { useProfile } from "@/lib/profile/hooks";

/**
 * The single account menu.
 *
 * This replaces the two buttons that used to sit here — a wallet chip showing the signing
 * address and a separate profile chip showing the handle. They were the same person in two
 * controls, and the address in the wallet chip was never the one that mattered (payouts go to
 * the payout wallet). One control that carries all four actions.
 *
 * The control itself is **avatar + wallet + SOL balance** — no handle. The identity is inside the
 * menu, where there is room for the name, the `Bagworker#` and the payout wallet; the header only
 * needs the one at-a-glance fact it was missing, which is whether the wallet is connected and what
 * it holds. The balance is read through `/api/wallet/balance` (see `useSolanaBalance`).
 *
 * It also owns the signed-out states, because it is now the only sign-in affordance in the top
 * bar: unconfigured, loading, anonymous, signed in.
 */
export function UserMenu() {
  const { configured, ready, authenticated, walletAddress, login, logout } = useAuth();
  const { data, isLoading } = useProfile();
  const profile = data?.profile;
  const balance = useSolanaBalance(walletAddress);
  const [copied, setCopied] = useState(false);

  if (!configured) {
    return (
      <Button
        size="sm"
        className="gap-1.5"
        disabled
        title="Privy credentials are not configured — see .env.example"
      >
        <Wallet aria-hidden="true" className="size-3.5" />
        Sign in
      </Button>
    );
  }

  if (!ready) {
    return (
      <Button size="sm" variant="outline" className="w-[124px] animate-pulse" disabled>
        <span className="sr-only">Loading account</span>
      </Button>
    );
  }

  if (!authenticated) {
    return (
      <Button size="sm" onClick={login} className="gap-1.5">
        <Wallet aria-hidden="true" className="size-3.5" />
        Sign in
      </Button>
    );
  }

  if (isLoading || !profile) {
    return <div className="size-8 animate-pulse rounded-full bg-muted" aria-hidden="true" />;
  }

  const handle = profile.handle ?? "bagworker";
  const payout = profile.payoutWallet ?? "";

  /*
   * What the chip shows next to the avatar.
   *
   * `null` means there is no connected wallet at all — the chip says "Connect" rather than
   * inventing a balance. A wallet that exists but whose balance could not be read shows an em dash,
   * so a failed RPC never reads as "you have 0 SOL".
   */
  const solLabel = !walletAddress
    ? null
    : balance.isPending || balance.data?.balanceSol == null
      ? "—"
      : solAmount(balance.data.balanceSol);

  async function copyPayout() {
    try {
      await navigator.clipboard.writeText(payout);
      setCopied(true);
      toast.success("Payout wallet copied");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not access the clipboard");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 pl-1.5" aria-label="Your account">
          <ProfileAvatar
            character={profile.character}
            avatarId={profile.avatarId}
            profileNumber={profile.profileNumber}
            className="size-6 rounded-full"
          />
          {/*
           * No handle here. Identity (face, name, Bagworker#) lives in the menu behind this control;
           * out in the header the wallet is the useful fact — whether one is connected and what it
           * holds. The old chip repeated the handle beside the avatar, which was one fact in two
           * places and the wrong fact for a header.
           */}
          <Wallet aria-hidden="true" className="size-3.5 text-muted-foreground" />
          {solLabel === null ? (
            <span className="text-xs text-muted-foreground">Connect</span>
          ) : (
            <span className="text-xs tabular-nums" aria-label={`Wallet balance ${solLabel}`}>
              {solLabel}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72" sideOffset={8}>
        <DropdownMenuLabel className="flex items-center gap-3">
          <ProfileAvatar
            character={profile.character}
            avatarId={profile.avatarId}
            profileNumber={profile.profileNumber}
            className="size-9 rounded-md"
          />
          <span className="min-w-0 space-y-1">
            <span className="block truncate text-sm font-medium text-foreground">
              {profile.displayName ?? `@${handle}`}
            </span>
            <span className="block truncate text-xs font-normal text-muted-foreground">
              @{handle} · {usd(profile.totalEarned, { cents: true })} earned
            </span>
            {/* The permanent identity, in the one place people look for it. */}
            <BagworkerTag number={profile.profileNumber} className="mt-0.5 text-[11px]" />
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild className="gap-2">
          <Link href="/dashboard/profile">
            <UserRound aria-hidden="true" className="size-4" />
            Profile
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Payout wallet
        </DropdownMenuLabel>
        {payout ? (
          <DropdownMenuItem onSelect={copyPayout} className="gap-2">
            {copied ? (
              <Check aria-hidden="true" className="size-4 text-success" />
            ) : (
              <Copy aria-hidden="true" className="size-4" />
            )}
            <span className="min-w-0 flex-1 truncate font-mono text-xs">
              {shortAddress(payout)}
            </span>
            <span className="sr-only">{copied ? "Copied" : "Copy payout wallet address"}</span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild className="gap-2">
            <Link href="/dashboard/profile">
              <Wallet aria-hidden="true" className="size-4" />
              <span className="text-xs">Not set up yet — add one</span>
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild className="gap-2">
          <Link href="/dashboard/settings">
            <Settings aria-hidden="true" className="size-4" />
            Settings
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          className="gap-2"
          onSelect={() => {
            void logout();
            toast("Signed out");
          }}
        >
          <LogOut aria-hidden="true" className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
