"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  Lock,
  Map as MapIcon,
  Megaphone,
  Pin,
  PinOff,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/auth/auth-provider";
import { relative } from "@/lib/console/format";
import {
  useCommunity,
  useCreateCommunity,
  useDeleteCommunityMessage,
  usePinCommunityMessage,
  usePostCommunityMessage,
} from "@/lib/community/hooks";
import type { CommunityDetailPayload, CommunityMessageDto } from "@/lib/community/mappers";
import { cn } from "@/lib/utils";

import { ProfileAvatar } from "../identity";
import { EmptyState, ErrorState, PageHeader, SignInRequired } from "../ui";

/**
 * One bag's community.
 *
 * Addressed by **either** a community id or a campaign id: the sidebar and index link to the
 * former, a bag page links with the campaign it already holds. That is why this works on a bag
 * whose publisher has not opened a space yet — the page offers to create one instead of 404ing.
 *
 * The role is decided by the server on every request and only *displayed* here. Nothing in this
 * file grants access, and the composer is hidden for members because the route refuses them
 * anyway — the UI is a consequence of the rule, not the rule itself.
 */
export function CommunityView({ communityRef }: { communityRef: string }) {
  const { ready, authenticated, login } = useAuth();
  const { data, isLoading, isError, error, refetch } = useCommunity(communityRef);

  if (ready && !authenticated) {
    return (
      <SignInRequired
        title="Sign in to open communities"
        description="A community is a bag's announcement board, visible to the Bagworkers who joined that campaign. Sign in so we know who you are."
        onConnect={login}
      />
    );
  }

  if (isLoading) return <CommunitySkeleton />;

  if (isError || !data) {
    // A 403 is not a failure: it is the answer "you have not joined this bag".
    if (error?.status === 403) {
      return <JoinPrompt campaignId={error.campaignId ?? communityRef} />;
    }
    // Nothing here yet — a prompt for the publisher, an explanation for everyone else. Which of
    // the two you get is decided by the server when you try, not assumed on the client.
    if (error?.status === 404) {
      return (
        <NoCommunityYet
          campaignId={error.campaignId ?? communityRef}
          campaignTitle={error.campaignTitle}
          canCreate={error.canCreate}
        />
      );
    }

    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow={`${data.campaign.tokenSymbol} · community`}
        title={data.campaign.title}
        description={`${data.community.title} — announcements from the campaign admin.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RoleBadge isAdmin={data.isAdmin} />
            <Badge
              variant="outline"
              className="gap-1 border-border bg-muted/40 font-normal text-muted-foreground"
            >
              <Users aria-hidden="true" className="size-3" />
              <span className="tabular-nums">{data.memberCount}</span>
              {data.memberCount === 1 ? "member" : "members"}
            </Badge>
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link href={`/dashboard/bags/${data.campaign.id}`}>
                <ArrowLeft aria-hidden="true" className="size-4" />
                Back to bag
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mx-auto w-full max-w-[1100px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <Tabs defaultValue="chat" className="gap-4">
          <TabsList>
            <TabsTrigger value="chat" className="gap-1.5">
              <Megaphone aria-hidden="true" className="size-3.5" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="ideas" className="gap-1.5">
              <Lightbulb aria-hidden="true" className="size-3.5" />
              Ideas
            </TabsTrigger>
            <TabsTrigger value="planning" className="gap-1.5">
              <MapIcon aria-hidden="true" className="size-3.5" />
              Planning
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat">
            <ChatPanel detail={data} communityRef={communityRef} />
          </TabsContent>

          <TabsContent value="ideas">
            <PlaceholderPanel
              icon={Lightbulb}
              title="Ideas"
              description="Where the campaign will collect angles, hooks and content ideas from members. Not open yet — the structure exists so it can be switched on without rebuilding this page."
            />
          </TabsContent>

          <TabsContent value="planning">
            <PlaceholderPanel
              icon={MapIcon}
              title="Planning"
              description="Milestones, posting schedule and what the campaign needs next. Not open yet — Chat is the only live channel."
            />
          </TabsContent>
        </Tabs>

        <MembersPanel detail={data} />
      </div>
    </div>
  );
}

/** Admin or member, in one badge. A rendering of the server's answer, nothing more. */
function RoleBadge({ isAdmin }: { isAdmin: boolean }) {
  return isAdmin ? (
    <Badge className="gap-1 border-brand/40 bg-brand/10 font-medium text-brand">
      <Megaphone aria-hidden="true" className="size-3" />
      Admin
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="gap-1 border-border bg-muted/40 font-normal text-muted-foreground"
    >
      <Users aria-hidden="true" className="size-3" />
      Member
    </Badge>
  );
}

/**
 * The feed.
 *
 * Pinned announcements are lifted into their own block above the chronological list — a pinned
 * message is a standing instruction, and hunting for it by scrolling is exactly what pinning is
 * meant to save you from. Pinned messages are therefore not repeated below.
 */
function ChatPanel({
  detail,
  communityRef,
}: {
  detail: CommunityDetailPayload;
  communityRef: string;
}) {
  const pinned = detail.messages.filter((message) => message.isPinned);
  const feed = detail.messages.filter((message) => !message.isPinned);

  return (
    <div className="space-y-4">
      {pinned.length > 0 ? (
        <section className="space-y-3" aria-label="Pinned announcements">
          <h2 className="flex items-center gap-1.5 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            <Pin aria-hidden="true" className="size-3" />
            Pinned
          </h2>
          {pinned.map((message) => (
            <MessageCard
              key={message.id}
              message={message}
              isAdmin={detail.isAdmin}
              communityRef={communityRef}
              pinned
            />
          ))}
        </section>
      ) : null}

      {detail.messages.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          description={
            detail.isAdmin
              ? "This is your campaign's board. Post the brief, the rules, or what you want to see next — members see it the moment you send it."
              : "Nothing has been posted here yet. When the campaign admin shares something, it appears on this board."
          }
        />
      ) : (
        <div className="space-y-3">
          {feed.map((message) => (
            <MessageCard
              key={message.id}
              message={message}
              isAdmin={detail.isAdmin}
              communityRef={communityRef}
            />
          ))}
        </div>
      )}

      {detail.isAdmin ? <Composer communityRef={communityRef} /> : <MemberNotice />}
    </div>
  );
}

/** One announcement: who, when, what, and the admin controls for it. */
function MessageCard({
  message,
  isAdmin,
  communityRef,
  pinned = false,
}: {
  message: CommunityMessageDto;
  isAdmin: boolean;
  communityRef: string;
  pinned?: boolean;
}) {
  const pin = usePinCommunityMessage(communityRef);
  const remove = useDeleteCommunityMessage(communityRef);
  const busy = pin.isPending || remove.isPending;

  async function togglePin() {
    try {
      await pin.mutateAsync({ messageId: message.id, isPinned: !message.isPinned });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the pin");
    }
  }

  async function deleteMessage() {
    try {
      await remove.mutateAsync({ messageId: message.id });
      toast.success("Announcement removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete that");
    }
  }

  return (
    <Card
      className={cn(
        "gap-0 py-0",
        // A pinned card is tinted rather than outlined in a louder colour: it should read as a
        // standing instruction, not as a warning.
        pinned && "border-brand/30 bg-brand/[0.04]",
      )}
    >
      <CardContent className="flex gap-3.5 p-4">
        <ProfileAvatar
          character={message.sender?.character ?? null}
          avatarId={message.sender?.avatarId ?? null}
          profileNumber={message.sender?.profileNumber ?? null}
          className="size-9 shrink-0 rounded-lg border border-border"
        />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-foreground">
              {message.sender?.name ?? "Bagwork"}
            </span>
            {isAdmin ? (
              <Badge
                variant="outline"
                className="gap-1 border-brand/40 bg-brand/10 px-1.5 py-0 text-[10px] font-medium text-brand"
              >
                Admin
              </Badge>
            ) : null}
            <span className="text-[11px] text-muted-foreground">
              {relative(message.createdAt)}
            </span>
            {pinned ? (
              <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-brand">
                <Pin aria-hidden="true" className="size-3" />
                Pinned
              </span>
            ) : null}
          </div>

          {message.body ? <MessageBody body={message.body} /> : null}

          {/* Same-origin upload path; the bytes were type- and size-checked by the upload route. */}
          {message.imageUrl ? (
            <img
              src={message.imageUrl}
              alt=""
              loading="lazy"
              className="max-h-80 w-auto rounded-lg border border-border object-contain"
            />
          ) : null}

          {/* Admin controls only. A member sees no actions because a member has none. */}
          {isAdmin ? (
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={togglePin}
                disabled={busy}
              >
                {pinned ? (
                  <PinOff aria-hidden="true" className="size-3" />
                ) : (
                  <Pin aria-hidden="true" className="size-3" />
                )}
                {pinned ? "Unpin" : "Pin"}
              </Button>
              {message.canDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                  onClick={deleteMessage}
                  disabled={busy}
                >
                  <Trash2 aria-hidden="true" className="size-3" />
                  Delete
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** Message text, with any http(s) URL turned into a real link. */
const IS_LINK = /^https?:\/\//i;
const URL_SPLIT = /(https?:\/\/[^\s<>()"']+)/gi;

function MessageBody({ body }: { body: string }) {
  return (
    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground/90">
      {body.split(URL_SPLIT).map((part, index) =>
        IS_LINK.test(part) ? (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium break-all text-brand underline decoration-brand/40 underline-offset-4 hover:decoration-brand"
          >
            {part}
          </a>
        ) : (
          <React.Fragment key={index}>{part}</React.Fragment>
        ),
      )}
    </p>
  );
}

/**
 * The admin's composer: text, an optional image, send.
 *
 * No voice notes — deliberately, and not as a missing feature: a bag's board is a record that
 * members read later and that has to be searchable, and audio is neither.
 */
function Composer({ communityRef }: { communityRef: string }) {
  const post = usePostCommunityMessage(communityRef);
  const { getAccessToken, identityToken } = useAuth();
  const [body, setBody] = React.useState("");
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const canSend = (body.trim().length > 0 || Boolean(imageUrl)) && !post.isPending && !uploading;

  /** Same route the bag banner uses, so the type/size/signature checks are the existing ones. */
  async function upload(file: File) {
    setUploading(true);
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
      const payload = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !payload.url) throw new Error(payload.error ?? "Could not upload that image");
      setImageUrl(payload.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function send() {
    if (!canSend) return;
    try {
      await post.mutateAsync({ body: body.trim(), imageUrl });
      setBody("");
      setImageUrl(null);
      toast.success("Announcement posted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not post that");
    }
  }

  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-2.5 p-3">
        {imageUrl ? (
          <div className="relative w-fit">
            <img
              src={imageUrl}
              alt=""
              className="max-h-40 rounded-lg border border-border object-contain"
            />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute -top-2 -right-2 size-6 rounded-full"
              onClick={() => setImageUrl(null)}
              aria-label="Remove attached image"
            >
              <X aria-hidden="true" className="size-3" />
            </Button>
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write an announcement for this bag's members…"
            rows={2}
            maxLength={2000}
            disabled={post.isPending}
            className="min-h-11 resize-none"
            // ⌘/Ctrl+Enter sends; plain Enter stays a newline, because announcements are
            // multi-line by nature and losing a draft to a stray keypress is unforgivable.
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="Attach an image"
          >
            {uploading ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <ImageIcon aria-hidden="true" className="size-4" />
            )}
          </Button>
          <Button
            type="button"
            onClick={() => void send()}
            disabled={!canSend}
            className="gap-1.5"
          >
            {post.isPending ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Send aria-hidden="true" className="size-4" />
            )}
            Send
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Only you can post in this community. Links become clickable automatically.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * What a member gets instead of a composer.
 *
 * Said plainly rather than by omission: a read-only board with no explanation reads like a bug,
 * and a greyed-out input would suggest they are one permission away from posting.
 */
function MemberNotice() {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-4 py-3">
      <Lock aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">
        Only the campaign admin can post in this community.
      </p>
    </div>
  );
}

/** Who is in: the admin first, then members in the order they joined. */
function MembersPanel({ detail }: { detail: CommunityDetailPayload }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Members</h2>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {detail.memberCount}
          </span>
        </div>

        {detail.members.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nobody has opened this community yet.
          </p>
        ) : (
          <ScrollArea className="max-h-72">
            <ul className="space-y-2.5 pr-3">
              {detail.members.map((member) => (
                <li key={member.id} className="flex items-center gap-2.5">
                  <ProfileAvatar
                    character={member.character}
                    avatarId={member.avatarId}
                    profileNumber={member.profileNumber}
                    className="size-7 shrink-0 rounded-md border border-border"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                    {member.name}
                  </span>
                  {member.role === "ADMIN" ? (
                    <Badge
                      variant="outline"
                      className="shrink-0 border-brand/40 bg-brand/10 px-1.5 py-0 text-[10px] font-medium text-brand"
                    >
                      Admin
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Ideas and Planning.
 *
 * Placeholders, and labelled as such rather than filled with something that looks finished. The
 * tab structure is real, so switching these on later is a change to one component and not a
 * rebuild of the page.
 */
function PlaceholderPanel({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: typeof Megaphone;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <span
          aria-hidden="true"
          className="flex size-10 items-center justify-center rounded-full border border-border bg-muted/40"
        >
          <Icon className="size-4 text-muted-foreground" />
        </span>
        <div className="max-w-md space-y-1">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <Badge
          variant="outline"
          className="border-border bg-muted/40 font-normal text-muted-foreground"
        >
          Coming soon
        </Badge>
      </CardContent>
    </Card>
  );
}

/**
 * The 403 state: signed in, but not in this bag's community.
 *
 * Deliberately not an error page. It is a "how to get in" page, with the one action that actually
 * grants access — opt into the bag. Naming the bag matters: "no access" leaves someone guessing.
 */
function JoinPrompt({ campaignId }: { campaignId: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <EmptyState
        icon={Lock}
        title="Join this bag first"
        description="A community only opens to Bagworkers who joined the campaign. Opt into the bag and this board unlocks — claiming a slot is what grants access, and there is nothing else to apply for."
        action={
          <Button asChild>
            <Link href={`/dashboard/bags/${campaignId}`}>Open the bag</Link>
          </Button>
        }
        secondary={
          <Button asChild variant="outline">
            <Link href="/dashboard/community">All communities</Link>
          </Button>
        }
      />
    </div>
  );
}

/**
 * Nothing here yet.
 *
 * Two audiences, and the server has already decided which one is looking: the bag's publisher
 * gets the create form, everyone else is told who can open it and left alone. A joined Bagworker
 * must never be shown a button the POST route would answer with a 403 — that is what `canCreate`
 * is for, and it comes from ownership of the campaign rather than from anything the client knows.
 */
function NoCommunityYet({
  campaignId,
  campaignTitle,
  canCreate,
}: {
  campaignId: string;
  campaignTitle?: string;
  canCreate: boolean;
}) {
  const create = useCreateCommunity();
  const [title, setTitle] = React.useState("");

  async function open() {
    try {
      // No navigation needed: the create mutation invalidates every `community` query, and this
      // page's own query is keyed on the campaign id — which now resolves. The board replaces
      // this panel by itself.
      await create.mutateAsync({ campaignId, title: title.trim() || undefined });
      toast.success("Community opened");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the community");
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <Card className="gap-0 py-0">
        <CardContent className="space-y-4 p-6 text-center">
          <span
            aria-hidden="true"
            className="mx-auto flex size-10 items-center justify-center rounded-full border border-border bg-muted/40"
          >
            <Megaphone className="size-4 text-muted-foreground" />
          </span>

          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-foreground">
              {canCreate ? "No community here yet" : "No community yet"}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {canCreate
                ? "A community is an announcement board for one bag. Open it and you can post the brief, the rules and updates for the Bagworkers who joined."
                : `The publisher of ${
                    campaignTitle ? `“${campaignTitle}”` : "this bag"
                  } has not opened its community yet. When they do, everyone who joined the bag can read it — there is nothing to apply for.`}
            </p>
          </div>

          {canCreate ? (
            <>
              <div className="space-y-2 text-left">
                <label
                  htmlFor="community-title"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  Community name (optional)
                </label>
                <Input
                  id="community-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Defaults to the bag's name"
                  maxLength={80}
                  disabled={create.isPending}
                />
              </div>

              <Button
                onClick={() => void open()}
                disabled={create.isPending}
                className="w-full gap-1.5"
              >
                {create.isPending ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Megaphone aria-hidden="true" className="size-4" />
                )}
                Open the community
              </Button>

              <p className="text-[11px] text-muted-foreground">
                Only the publisher of this bag can open its community.
              </p>
            </>
          ) : (
            /* No form, no create button: this viewer is not the publisher, and the API would
               refuse them. The only useful action left is going back to the bag. */
            <Button asChild variant="outline" className="w-full">
              <Link href={`/dashboard/bags/${campaignId}`}>Back to the bag</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Shaped like the real page — header, tabs, a few announcements — so nothing shifts when it lands. */
function CommunitySkeleton() {
  return (
    <div className="pb-16">
      <div className="border-b border-border/60 bg-card/25 px-4 py-8 sm:px-6 lg:px-8">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-3 h-7 w-64" />
        <Skeleton className="mt-2.5 h-3 w-80" />
      </div>
      <div className="mx-auto w-full max-w-[1100px] space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <Skeleton className="h-9 w-64 rounded-lg" />
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
