"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { rateLabel } from "@/components/console/bag-card";
import { usd } from "@/lib/console/format";
import { useCampaigns, useSession } from "@/lib/queries";
import { CONSOLE_NAV_FOOTER, consoleNavItems } from "../nav";

export function SearchCommand() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { data } = useCampaigns("ALL", { enabled: open });
  const { data: session } = useSession();
  const bags = data?.campaigns ?? [];
  // Search offers the same pages the sidebar does — for everyone, since there is one nav.
  const pages = consoleNavItems();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-52 justify-start gap-2 px-3 text-xs font-normal text-muted-foreground lg:w-64 xl:inline-flex"
        title="Search — ⌘K / Ctrl K"
      >
        <Search aria-hidden="true" className="size-3.5" />
        Search bags and pages
        <kbd className="ml-auto rounded border border-border bg-muted/50 px-1.5 font-mono text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="size-9 xl:hidden"
        onClick={() => setOpen(true)}
        aria-label="Search bags and pages"
      >
        <Search aria-hidden="true" className="size-4" />
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search Bagwork"
        description="Jump to a bag, a page or an action"
      >
        <CommandInput placeholder="Search bags, tokens or pages…" />
        <CommandList>
          <CommandEmpty>No matches. Try a token symbol like BONK or WIF.</CommandEmpty>

          <CommandGroup heading="Open bags">
            {bags.slice(0, 14).map((campaign) => (
              <CommandItem
                key={campaign.id}
                value={`${campaign.title} ${campaign.token.symbol} ${campaign.token.name}`}
                onSelect={() => go(`/dashboard/bags/${campaign.id}`)}
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: campaign.token.color }}
                />
                <span className="truncate">{campaign.title}</span>
                <CommandShortcut>{rateLabel(campaign)}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Pages">
            {[...pages, ...CONSOLE_NAV_FOOTER].map((item) => (
              <CommandItem
                key={item.href}
                value={`${item.label} ${item.href}`}
                onSelect={() => go(item.href)}
              >
                <item.icon aria-hidden="true" className="size-4" />
                {item.label}
              </CommandItem>
            ))}
            <CommandItem
              value="Total paid out metrics"
              onSelect={() => go("/dashboard/earnings")}
            >
              <span className="truncate">
                Lifetime payouts ·{" "}
                {usd(bags.reduce((sum, c) => sum + c.fundedAmount, 0), {
                  compact: true,
                })}{" "}
                funded across bags
              </span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
