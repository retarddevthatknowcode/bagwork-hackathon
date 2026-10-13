"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bell,
  CheckCheck,
  Coins,
  Loader2,
  Plus,
  ShieldCheck,
  ShieldX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { relative } from "@/lib/console/format";
import { useConsoleNotifications } from "@/lib/console/hooks";
import { cn } from "@/lib/utils";

const KIND_META: Record<
  string,
  { icon: typeof Coins; tone: string }
> = {
  payout: { icon: Coins, tone: "text-success" },
  approved: { icon: ShieldCheck, tone: "text-success" },
  rejected: { icon: ShieldX, tone: "text-destructive" },
  reviewing: { icon: Loader2, tone: "text-info" },
  "new-bag": { icon: Plus, tone: "text-foreground" },
};

export function NotificationMenu() {
  const { data, isLoading } = useConsoleNotifications();
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = usePersistentState<string[]>(
    "bagwork.console.readNotifications",
    [],
  );

  const items = data?.notifications ?? [];
  const unread = items.filter((n) => !readIds.includes(n.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-9"
          aria-label={
            unread.length
              ? `Notifications — ${unread.length} unread`
              : "Notifications"
          }
        >
          <Bell aria-hidden="true" className="size-4" />
          {unread.length > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-info px-1 text-[10px] font-semibold leading-4 text-background">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="flex max-h-[min(80vh,36rem)] w-[22rem] flex-col overflow-hidden p-0"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2.5">
          <div>
            <p className="text-sm font-semibold text-foreground">Notifications</p>
            <p className="text-xs text-muted-foreground">
              Review decisions and payouts on your posts
            </p>
          </div>
          {unread.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 gap-1 px-2 text-xs"
              onClick={() => setReadIds(items.map((n) => n.id))}
            >
              <CheckCheck aria-hidden="true" className="size-3.5" />
              Read all
            </Button>
          ) : null}
        </div>

        <Separator className="shrink-0" />

        {isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-muted/50" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            Nothing yet. Submit a post to start the review loop.
          </p>
        ) : (
          /* A plain scroll container, not ScrollArea: Radix's viewport sizes to
             `height:100%` and its inner wrapper is `display:table`
             (`min-width:max-content`), so with a max-height parent the list grew
             to its full height and painted outside the card, and rows could not
             wrap. This scrolls inside the popover and wraps normally. */
          <div
            role="region"
            aria-label="Notifications"
            tabIndex={0}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ul>
              {items.map((n) => {
                const meta = KIND_META[n.kind] ?? KIND_META["new-bag"];
                const Icon = meta.icon;
                const isUnread = !readIds.includes(n.id);
                return (
                  <li key={n.id}>
                    <Link
                      href={n.href}
                      onClick={() => {
                        setReadIds([...readIds, n.id]);
                        setOpen(false);
                      }}
                      className="flex gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <Icon
                        aria-hidden="true"
                        className={cn("mt-0.5 size-4 shrink-0", meta.tone)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "truncate text-xs",
                              isUnread
                                ? "font-semibold text-foreground"
                                : "font-medium text-muted-foreground",
                            )}
                          >
                            {n.title}
                          </span>
                          {isUnread ? (
                            <span className="shrink-0 rounded-full bg-info/15 px-1.5 text-[10px] font-medium text-info">
                              New
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block wrap-anywhere text-xs text-muted-foreground">
                          {n.body}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-muted-foreground/70">
                          {relative(n.at)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <Separator className="shrink-0" />
        <div className="shrink-0 p-1">
          <Button asChild variant="ghost" size="sm" className="w-full justify-center">
            <Link href="/dashboard/submissions" onClick={() => setOpen(false)}>
              View all submissions
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
