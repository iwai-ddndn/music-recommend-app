"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { Check, Play, Plus, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/common";
import { Artwork } from "@/components/player/artwork";
import * as controls from "@/components/player/controls";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiSend, fetcher, useMe } from "@/lib/client/api";
import { useRequireLogin } from "@/lib/client/use-require-login";
import { getPlayerStore } from "@/lib/player/store";
import type { CuratorListItem } from "@/lib/repo/curators";

export function FollowButton({
  curator,
  onChange,
  size = "sm",
}: {
  curator: Pick<CuratorListItem, "id" | "following" | "x_handle">;
  onChange: () => void;
  size?: "sm" | "default";
}) {
  const requireLogin = useRequireLogin();
  const { mutate: mutateMe } = useMe();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size={size}
      variant={curator.following ? "outline" : "default"}
      disabled={busy}
      data-testid="follow-button"
      aria-pressed={curator.following}
      onClick={async (e) => {
        e.preventDefault();
        if (!requireLogin("フォロー")) return;
        setBusy(true);
        try {
          await apiSend(`/api/curators/${curator.id}/follow`, curator.following ? "DELETE" : "POST");
          toast(curator.following ? `@${curator.x_handle} のフォローを解除しました` : `@${curator.x_handle} をフォローしました`);
          onChange();
          void mutateMe();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {curator.following ? <Check /> : <Plus />}
      {curator.following ? "フォロー中" : "フォロー"}
    </Button>
  );
}

function SuggestDialog() {
  const requireLogin = useRequireLogin();
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v && !requireLogin("目利きの推薦")) return;
        setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlus />
          目利きを推薦
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await apiSend<{ status: string; handle: string }>("/api/curators/suggest", "POST", {
                handle,
                comment: comment || null,
              });
              toast(
                r.status === "already_active"
                  ? `@${r.handle} は既に目利きです。フォローしてみてください`
                  : r.status === "voted"
                    ? `@${r.handle} への推薦に1票加えました`
                    : `@${r.handle} を推薦しました。管理者の承認後に追加されます`,
              );
              setOpen(false);
              setHandle("");
              setComment("");
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>目利きを推薦する</DialogTitle>
            <DialogDescription>
              信頼できるディガー（レコード店・レーベル・音楽ライター・個人）を教えてください。収集にはXの費用がかかるため、管理者の承認後に追加されます。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="handle">Xのハンドル</Label>
            <Input
              id="handle"
              placeholder="@example"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="comment">ひとこと（任意）</Label>
            <Textarea
              id="comment"
              placeholder="どんな曲を紹介している人か"
              value={comment}
              maxLength={200}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !handle.trim()}>
              推薦する
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CuratorCard({ c, onChange }: { c: CuratorListItem; onChange: () => void }) {
  return (
    <Card className="gap-4 py-4" data-testid="curator-card">
      <CardContent className="space-y-3 px-4">
        <div className="flex items-start gap-3">
          <Avatar className="size-10">
            <AvatarFallback>{c.display_name.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <Link href={`/curators/${c.id}`} className="block truncate font-semibold hover:underline">
              {c.display_name}
            </Link>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
              <span>@{c.x_handle}</span>
              <span>直近30日 {c.recent_count}曲</span>
              {c.claimed && <Badge variant="outline" className="h-4 px-1 text-[10px]">本人確認済み</Badge>}
            </div>
          </div>
          <FollowButton curator={c} onChange={onChange} />
        </div>
        {c.bio && <p className="text-muted-foreground line-clamp-2 text-sm">{c.bio}</p>}
        {c.recent_tracks.length > 0 && (
          <div className="space-y-1">
            <div className="text-muted-foreground text-xs font-medium">最近推した曲</div>
            <ul className="grid gap-1">
              {c.recent_tracks.map((t, i) => (
                <li key={t.track_id}>
                  <button
                    className="hover:bg-accent group flex w-full items-center gap-2 rounded-md p-1 text-left"
                    onClick={() => {
                      controls.markUserGesture();
                      getPlayerStore().getState().playQueue(c.recent_tracks, i, `@${c.x_handle} の推薦`);
                    }}
                  >
                    <span className="relative">
                      <Artwork src={t.artwork_url} seed={t.track_id} alt="" className="size-8" />
                      <Play className="absolute inset-0 m-auto size-4 fill-white text-white opacity-0 group-hover:opacity-100" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {t.title} <span className="text-muted-foreground">— {t.artist_name}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CuratorsView() {
  const [q, setQ] = useState("");
  const { data, error, isLoading, mutate } = useSWR<{ curators: CuratorListItem[] }>("/api/curators", fetcher);
  const list = (data?.curators ?? []).filter(
    (c) =>
      !q ||
      c.x_handle.toLowerCase().includes(q.toLowerCase().replace(/^@/, "")) ||
      c.display_name.toLowerCase().includes(q.toLowerCase()),
  );
  const following = list.filter((c) => c.following);
  const others = list.filter((c) => !c.following);
  return (
    <div className="space-y-6">
      <PageHeader
        title="目利き"
        description="信頼できるディガーをフォローすると、その人が推す曲が上位に来ます。"
        actions={<SuggestDialog />}
      />
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          className="pl-9"
          placeholder="名前や @ハンドルで探す"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="目利きを検索"
        />
      </div>
      {error ? (
        <ErrorState message={error.message} onRetry={() => mutate()} />
      ) : isLoading ? (
        <ListSkeleton />
      ) : list.length === 0 ? (
        <EmptyState title="見つかりませんでした">別の名前で探すか、目利きを推薦してください。</EmptyState>
      ) : (
        <>
          {following.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">フォロー中（{following.length}）</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {following.map((c) => (
                  <CuratorCard key={c.id} c={c} onChange={() => mutate()} />
                ))}
              </div>
            </section>
          )}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">{following.length ? "その他の目利き" : "すべての目利き"}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {others.map((c) => (
                <CuratorCard key={c.id} c={c} onChange={() => mutate()} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
