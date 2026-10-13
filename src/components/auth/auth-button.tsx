"use client";

import * as React from "react";
import { Check, Copy, ExternalLink, LogOut, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/auth-provider";
import { NeonButton, type NeonButtonProps } from "@/components/site/neon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { solanaExplorerUrl, truncateAddress } from "@/lib/privy/config";
import { cn } from "@/lib/utils";

/**
 * The single auth control for the app: sign in, show the live session, sign out.
 *
 * The label is "Sign in" rather than "Connect wallet": the Privy modal it opens offers email
 * *and* wallet, and most people arriving here are signing up rather than connecting a wallet
 * they already have. The flow behind the button is unchanged — this is a label.
 *
 * All four states are real states, not placeholders — unconfigured, loading, anonymous,
 * authenticated — so the control never renders a button that does nothing.
 */

/** Mirrors NeonButton's `sm`/`md` sizing so the loading state occupies identical space. */
const SKELETON_SIZE: Record<NonNullable<NeonButtonProps["size"]>, string> = {
  sm: "h-8 w-[104px]",
  md: "h-10 w-[124px]",
  lg: "h-12 w-[150px]",
  xl: "h-14 w-[170px]",
};

export function AuthButton({
  className,
  size = "sm",
}: {
  className?: string;
  size?: NeonButtonProps["size"];
}) {
  const {
    configured,
    ready,
    authenticated,
    walletAddress,
    isEmbeddedWallet,
    login,
    logout,
  } = useAuth();
  const [copied, setCopied] = React.useState(false);

  const copyAddress = React.useCallback(async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      toast.success("Wallet address copied");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy the address");
    }
  }, [walletAddress]);

  // No credentials on this machine. A disabled control is the honest state: it tells
  // developers why nothing happens instead of failing silently on click.
  if (!configured) {
    return (
      <NeonButton
        variant="ghost"
        size={size}
        disabled
        className={className}
        title="Privy credentials are not configured — see .env.example"
      >
        <Wallet size={14} />
        SIGN IN
      </NeonButton>
    );
  }

  // Privy is still restoring the session. Reserve the exact footprint so the header
  // never reflows when the real control swaps in.
  if (!ready) {
    return (
      <div
        role="status"
        aria-label="Loading sign-in"
        className={cn(
          "animate-pulse rounded-xl bg-white/5",
          SKELETON_SIZE[size ?? "sm"],
          className
        )}
      />
    );
  }

  if (!authenticated || !walletAddress) {
    return (
      <NeonButton variant="solid" size={size} onClick={login} className={className}>
        <Wallet size={14} />
        SIGN IN
      </NeonButton>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <NeonButton variant="outline" size={size} className={className}>
          <span className="h-1.5 w-1.5 rounded-full bg-[#bdfe00]" aria-hidden />
          {truncateAddress(walletAddress)}
          {isEmbeddedWallet && (
            <span className="rounded bg-[#bdfe00]/15 px-1 py-0.5 text-[9px] font-bold tracking-wide text-[#bdfe00]">
              EMBEDDED
            </span>
          )}
        </NeonButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 font-mono text-[11px]">
        <DropdownMenuLabel className="space-y-1">
          <span className="block text-[10px] font-bold tracking-wider text-white/40">
            SIGNED IN
          </span>
          <span className="block break-all text-[11px] font-normal text-white/80">
            {walletAddress}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void copyAddress()}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "COPIED" : "COPY ADDRESS"}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href={solanaExplorerUrl("address", walletAddress)}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={14} />
            VIEW ON EXPLORER
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut size={14} />
          SIGN OUT
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
