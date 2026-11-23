"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { Check, Play, Plus, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/common";
import { ScreenHeader } from "@/components/layout/app-shell";
import { Artwork } from "@/components/player/artwork";
import * as controls from "@/components/player/controls";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiSend, fetcher, useMe } from "@/lib/client/api";
import { useProfile } from "@/lib/client/profile";
import { useRequireLogin } from "@/lib/client/use-require-login";
import { getPlayerStore } from "@/lib/player/store";
import type { CuratorListItem } from "@/lib/repo/curators";
import { sceneLabel, scenes } from "@/lib/taste/vocabulary";
import { cn } from "@/lib/utils";

export function topScenes(c: Pick<CuratorListItem, "profile_tags">, n = 2) {
  return Object.entries(c.profile_tags)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id);
}

export function FollowButton({
  curator,
  onChange,
  wide,
}: {
  curator: Pick<CuratorListItem, "id" | "following" | "x_handle">;
  onChange: () => void;
  wide?: boolean;
}) {
  const requireLogin = useRequireLogin();
  const { mutate: mutateMe } = useMe();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      data-testid="follow-button"
      aria-pressed={curator.following}
      className={cn(
        "inline-flex h-11 shrink-0 items-center justify-center gap-1 rounded-full px-4 text-sm font-semibold transition-transform active:scale-95",
        wide && "flex-1",
        curator.following ? "bg-muted" : "bg-foreground text-background",
      )}
      onClick={async (e) => {
        e.preventDefault();
        if (!requireLogin("フォロー")) return;
        setBusy(true);
        try {
          await apiSend(`/api/curators/${curator.id}/follow`, curator.following ? "DELETE" : "POST");
          if (curator.following) useProfile.getState().dropSoftFollow(curator.id);
          onChange();
          void mutateMe();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {curator.following ? <Check className="size-4" /> : <Plus className="size-4" />}
      {curator.following ? "フォロー中" : "フォロー"}
    </button>
  );
}

/** 目利きの推薦（管理者の承認制）。下からのシートに入力1つ */
function SuggestSheet() {
  const requireLogin = useRequireLogin();
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Drawer
      open={open}
      onOpenChange={(v) => {
        if (v && !requireLogin("目利きの推薦")) return;
        setOpen(v);
      }}
    >
      <DrawerTrigger asChild>
        <Button variant="ghost" className="size-11 rounded-full" aria-label="目利きを推薦">
          <UserPlus className="size-5" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <form
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
                  ? `@${r.handle} は既に目利きです`
                  : r.status === "voted"
                    ? `@${r.handle} に1票入れました`
                    : `@${r.handle} を推薦しました（承認待ち）`,
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
          <DrawerHeader>
            <DrawerTitle>目利きを推薦</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-4 px-5">
            <div className="space-y-2">
              <Label htmlFor="handle">Xのハンドル</Label>
              <Input id="handle" className="h-12" placeholder="@example" value={handle} onChange={(e) => setHandle(e.target.value)} autoComplete="off" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="comment">ひとこと</Label>
              <Input id="comment" className="h-12" value={comment} maxLength={200} onChange={(e) => setComment(e.target.value)} />
            </div>
          </div>
          <DrawerFooter>
            <Button type="submit" className="h-12 rounded-full text-base" disabled={busy || !handle.trim()}>
              推薦する
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

function CuratorCard({ c, onChange }: { c: CuratorListItem; onChange: () => void }) {
  return (
    <div className="bg-card space-y-3 rounded-3xl border p-4" data-testid="curator-card">
      <div className="flex items-center gap-3">
        <Link href={`/curators/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar className="size-12">
            <AvatarFallback className="text-lg">{c.display_name.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate font-semibold">{c.display_name}</span>
            <span className="text-muted-foreground block truncate text-sm">@{c.x_handle}</span>
          </span>
        </Link>
        <FollowButton curator={c} onChange={onChange} />
      </div>
      <div className="flex items-center gap-2">
        {topScenes(c).map((id) => (
          <span key={id} className="bg-muted rounded-full px-2.5 py-1 text-xs font-medium">
            {sceneLabel(id)}
          </span>
        ))}
        <span className="text-muted-foreground ml-auto text-xs tabular-nums" title="直近30日の推薦曲数">
          30日 {c.recent_count}曲
        </span>
      </div>
      {c.recent_tracks.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {c.recent_tracks.map((t, i) => (
            <button
              key={t.track_id}
              type="button"
              aria-label={`${t.title}を再生`}
              className="group relative text-left"
              onClick={() => {
                controls.markUserGesture();
                getPlayerStore().getState().playQueue(c.recent_tracks, i, `@${c.x_handle}`);
              }}
            >
              <Artwork src={t.artwork_url} seed={t.track_id} alt="" className="aspect-square w-full rounded-2xl" />
              <span className="absolute right-1.5 bottom-7 flex size-8 items-center justify-center rounded-full bg-black/60 text-white">
                <Play className="ml-0.5 size-3.5 fill-current" />
              </span>
              <span className="mt-1 block truncate text-xs font-medium">{t.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CuratorsView() {
  const [q, setQ] = useState("");
  const [scene, setScene] = useState<string | null>(null);
  const { data, error, isLoading, mutate } = useSWR<{ curators: CuratorListItem[] }>("/api/curators", fetcher);
  const softFollows = useProfile((s) => s.taste.softFollows);
  const list = (data?.curators ?? [])
    .filter(
      (c) =>
        (!q ||
          c.x_handle.toLowerCase().includes(q.toLowerCase().replace(/^@/, "")) ||
          c.display_name.toLowerCase().includes(q.toLowerCase())) &&
        (!scene || topScenes(c).includes(scene)),
    )
    // フォロー中 → 好みに合う目利き → その他
    .sort(
      (a, b) =>
        Number(b.following) - Number(a.following) ||
        Number(softFollows.includes(b.id)) - Number(softFollows.includes(a.id)),
    );
  return (
    <div className="space-y-4">
      <ScreenHeader title="目利き" action={<SuggestSheet />} />
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-4 size-5 -translate-y-1/2" />
        <Input
          className="bg-muted h-12 rounded-full border-0 pl-12 text-base"
          placeholder="検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="目利きを検索"
        />
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {[{ id: null as string | null, label: "すべて" }, ...scenes].map((s) => (
          <button
            key={s.id ?? "all"}
            type="button"
            aria-pressed={scene === s.id}
            onClick={() => setScene(s.id)}
            className={cn(
              "h-9 shrink-0 rounded-full px-3.5 text-sm font-medium",
              scene === s.id ? "bg-foreground text-background" : "bg-muted",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      {error ? (
        <ErrorState message={error.message} onRetry={() => mutate()} />
      ) : isLoading ? (
        <ListSkeleton />
      ) : list.length === 0 ? (
        <EmptyState title="見つかりませんでした" />
      ) : (
        <div className="grid gap-3">
          {list.map((c) => (
            <CuratorCard key={c.id} c={c} onChange={() => mutate()} />
          ))}
        </div>
      )}
    </div>
  );
}
