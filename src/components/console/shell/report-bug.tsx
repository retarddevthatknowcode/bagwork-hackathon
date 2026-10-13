"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Bug, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  OPS_CATEGORY_LABELS,
  OPS_MESSAGE_MAX,
  USER_REPORT_CATEGORIES,
  type OpsCategory,
} from "@/lib/ops/types";

/** Matches the server's floor (`POST /api/reports`), so the button and the route agree. */
const MIN_MESSAGE = 10;

/**
 * The dashboard's only bug-reporting surface.
 *
 * Deliberately the whole of it: one icon in the top bar, one small dialog, one toast on success.
 * There is no "my reports" list, no status, no history — the reporter sends it and it is gone
 * from their view, because the receiving end is an operator tool, not a support desk.
 *
 * The page field is pre-filled from the route the user is on, which is the context an operator
 * most often has to reconstruct by hand.
 */
export function ReportBugButton() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [category, setCategory] = React.useState<OpsCategory>("other");
  const [page, setPage] = React.useState(pathname);
  const [sending, setSending] = React.useState(false);

  // Reset on every open, so a cancelled draft never resurfaces on the next visit.
  function handleOpenChange(next: boolean) {
    if (next) {
      setMessage("");
      setCategory("other");
      setPage(pathname);
    }
    setOpen(next);
  }

  const trimmed = message.trim();
  const tooShort = trimmed.length < MIN_MESSAGE;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (tooShort || sending) return;

    setSending(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, category, path: page }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Could not send that report.");

      toast.success("Thanks — sent to the team.");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send that report.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Report a bug" title="Report a bug">
          <Bug className="size-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report a bug</DialogTitle>
          <DialogDescription>
            Tell us what happened and it goes straight to the team. There is no reply here.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="report-message">What went wrong?</Label>
            <Textarea
              id="report-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              maxLength={OPS_MESSAGE_MAX}
              required
              aria-describedby="report-message-hint"
              placeholder="Describe what you were doing and what happened instead."
            />
            <p id="report-message-hint" className="text-xs text-muted-foreground">
              {tooShort
                ? `At least ${MIN_MESSAGE} characters.`
                : `${message.length} / ${OPS_MESSAGE_MAX}`}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="report-category">Area</Label>
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as OpsCategory)}
              >
                <SelectTrigger id="report-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_REPORT_CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {OPS_CATEGORY_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="report-page">Page</Label>
              <Input
                id="report-page"
                value={page}
                onChange={(event) => setPage(event.target.value)}
                maxLength={300}
                placeholder="/dashboard"
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={sending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={tooShort || sending}>
              {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Send report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
