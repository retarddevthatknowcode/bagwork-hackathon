"use client";

import { useRef, useState } from "react";
import { Check, ImagePlus, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/auth/auth-provider";
import { useUpdateBag } from "@/lib/console/hooks";
import type { Campaign } from "@/lib/types";

/** The floor the API enforces on a brief, shown here so the rule is visible while typing. */
const MIN_BRIEF = 20;

/**
 * Editing a live bag's brief and artwork.
 *
 * The publisher's answer to "the bag is live and I want to say it differently". Deliberately narrow:
 * a description and a banner, and nothing else. The budget is not here because it cannot be — the
 * money has already moved to the treasury, so the only way to raise a budget is to send more of it,
 * and an editable number would be an offer the app could not honour. Payout model, rate and duration
 * are not here either: they are what a creator already agreed to by posting.
 *
 * Only the fields that actually changed are sent, which is what makes "clear the banner" and "leave
 * the banner alone" two distinguishable requests rather than one ambiguous one.
 */
export function EditBagDialog({ campaign }: { campaign: Campaign }) {
  const { getAccessToken, identityToken } = useAuth();
  const updateBag = useUpdateBag();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState(campaign.description);
  const [bannerUrl, setBannerUrl] = useState<string | null>(campaign.bannerUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = description.trim();
  const descriptionChanged = trimmed !== campaign.description.trim();
  const bannerChanged = bannerUrl !== campaign.bannerUrl;
  const briefTooShort = trimmed.length < MIN_BRIEF;
  const dirty = (descriptionChanged || bannerChanged) && !briefTooShort;

  /** Reopening the dialog after a save starts from the campaign as it now is. */
  function syncFromCampaign() {
    setDescription(campaign.description);
    setBannerUrl(campaign.bannerUrl);
    setError(null);
  }

  async function upload(file: File) {
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
      setBannerUrl(body.url);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setError(null);
    try {
      await updateBag.mutateAsync({
        id: campaign.id,
        // `undefined` means "unchanged" and is simply not sent — see the hook.
        ...(descriptionChanged ? { description: trimmed } : {}),
        ...(bannerChanged ? { bannerUrl } : {}),
      });
      toast.success("Bag updated", {
        description: "The brief and artwork on this bag are live now.",
      });
      setOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the changes");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // A cancelled edit is discarded rather than kept for next time: half-edited copy silently
        // reappearing in the form is how someone saves something they did not mean to.
        if (!next) syncFromCampaign();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="gap-1.5">
          <Pencil aria-hidden="true" className="size-3.5" />
          Edit brief
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit this bag</DialogTitle>
          <DialogDescription>
            The brief and the artwork. The budget is fixed — it is already in the Bagwork treasury,
            and raising it means sending more USDC.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="edit-brief">Brief</Label>
            <Textarea
              id="edit-brief"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              className="min-h-28 resize-y text-sm"
              aria-describedby="edit-brief-hint"
            />
            <p
              id="edit-brief-hint"
              className={briefTooShort ? "text-xs text-warning" : "text-xs text-muted-foreground"}
            >
              {briefTooShort
                ? `At least ${MIN_BRIEF} characters — ${MIN_BRIEF - trimmed.length} to go.`
                : "What a creator reads before deciding to post. The review engine checks against it."}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Artwork</Label>
            <div className="flex items-center gap-3">
              <span className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
                {bannerUrl ? (
                  // A plain <img>, matching the bag card: publisher-uploaded artwork whose
                  // dimensions we do not control, served from our own upload path.
                  <img src={bannerUrl} alt="" className="size-full object-cover" />
                ) : (
                  <span className="text-[11px] text-muted-foreground">No artwork</span>
                )}
              </span>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file);
                    // Cleared so choosing the same file twice fires `change` again.
                    event.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                  ) : (
                    <ImagePlus aria-hidden="true" className="size-3.5" />
                  )}
                  {bannerUrl ? "Replace" : "Upload"}
                </Button>
                {bannerUrl ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-muted-foreground"
                    onClick={() => setBannerUrl(null)}
                  >
                    <Trash2 aria-hidden="true" className="size-3.5" />
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
            >
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="gap-1.5"
            disabled={!dirty || updateBag.isPending}
            onClick={() => void save()}
          >
            {updateBag.isPending ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Check aria-hidden="true" className="size-4" />
            )}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
