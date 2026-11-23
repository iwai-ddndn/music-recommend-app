"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Anchor, Check, Heart, Plus, SlidersHorizontal, Waves } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/common";
import { ScreenHeader } from "@/components/layout/app-shell";
import { Onboarding } from "@/components/onboarding/onboarding";
import { Artwork } from "@/components/player/artwork";
import { WhyChips } from "@/components/player/now-playing";
import { PlayFab, TrackList, usePlayList } from "@/components/player/track-list";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { apiSend, fetcher, useMe } from "@/lib/client/api";
import { useProfile } from "@/lib/client/profile";
import { useRequireLogin } from "@/lib/client/use-require-login";
import { appConfig } from "@/lib/config";
import { getPlayerStore, usePlayer } from "@/lib/player/store";
import type { CuratorListItem } from "@/lib/repo/curators";
import { userTags } from "@/lib/scoring/taste";
import { sceneLabel } from "@/lib/taste/vocabulary";
import type { QueueItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export const HOME = "ホーム";
type FeedResponse = { items: QueueItem[]; depth: number };

export function depthLabel(d: number) {
  if (d <= 0.15) return "人気曲も";
  if (d < 0.4) return "浅め";
  if (d <= 0.6) return "バランス";
  if (d < 0.85) return "深め";
  return "とことん無名";
}

/** 端末の好み・聴いた曲を添えてキューを取る */
function useHomeFeed(enabled: boolean) {
  const depth = useProfile((s) => s.depth);
  const taste = useProfile((s) => s.taste);
  const heard = useProfile((s) => s.heard);
  const favorites = useProfile((s) => s.favorites);
  const body = useMemo(
    () => JSON.stringify({ depth, taste, exclude: heard, favorites }),
    [depth, taste, heard, favorites],
  );
  return useSWR<FeedResponse>(
    enabled ? ["/api/feed", body] : null,
    ([url, b]: [string, string]) => apiSend<FeedResponse>(url, "POST", JSON.parse(b)),
    { keepPreviousData: true, revalidateOnFocus: false },
  );
}

/** 深さ: 浅い（波）〜深い（錨）。説明文の代わりに両端のアイコンと現在値で示す */
function DepthControl() {
  const stored = useProfile((s) => s.depth);
  const [value, setValue] = useState<number | null>(null);
  const { user, mutate } = useMe();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const v = value ?? stored;
  return (
    <div className="bg-card flex h-14 items-center gap-3 rounded-2xl border px-4">
      <Waves className="text-muted-foreground size-5 shrink-0" aria-hidden />
      <Slider
        aria-label="深さ"
        min={0}
        max={1}
        step={0.1}
        value={[v]}
        onValueChange={([n]) => {
          setValue(n);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            useProfile.getState().setDepth(n);
            if (user) void apiSend("/api/me", "PATCH", { depth: n }).then(() => mutate());
          }, 300);
        }}
      />
      <Anchor className="text-muted-foreground size-5 shrink-0" aria-hidden />
      <span className="w-24 shrink-0 text-right text-sm font-semibold" data-testid="depth-label">
        {depthLabel(v)}
      </span>
    </div>
  );
}

/** いまの好み（学習結果）をチップで見せる。右端から選び直せる */
function TasteChips() {
  const taste = useProfile((s) => s.taste);
  const tags = Object.entries(userTags(taste, appConfig.taste))
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" data-testid="taste-chips">
      {tags.map(([id], i) => (
        <span
          key={id}
          className={cn(
            "inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-medium",
            i === 0 ? "bg-foreground text-background" : "bg-muted",
          )}
        >
          {sceneLabel(id)}
        </span>
      ))}
      <button
        type="button"
        aria-label="好みを選び直す"
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium"
        onClick={() => useProfile.getState().restart()}
      >
        <SlidersHorizontal className="size-4" />
        {tags.length === 0 && "好みを選ぶ"}
      </button>
    </div>
  );
}

/** 好みに合う目利き（仮フォロー中）。横スクロールのカードで、その場でフォローできる */
function CuratorShelf() {
  const softFollows = useProfile((s) => s.taste.softFollows);
  const { data, mutate } = useSWR<{ curators: CuratorListItem[] }>("/api/curators", fetcher);
  const { mutate: mutateMe } = useMe();
  const requireLogin = useRequireLogin();
  const all = data?.curators ?? [];
  const list = [
    ...all.filter((c) => c.following),
    ...softFollows.map((id) => all.find((c) => c.id === id && !c.following)).filter((c): c is CuratorListItem => !!c),
  ];
  if (list.length === 0) return null;
  return (
    <section aria-label="あなたに合う目利き">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-bold">目利き</h2>
        <Link href="/curators" className="text-muted-foreground flex h-11 items-center text-sm">
          すべて
        </Link>
      </div>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {list.map((c) => {
          const top = Object.entries(c.profile_tags).sort((a, b) => b[1] - a[1])[0]?.[0];
          return (
            <div key={c.id} className="bg-card w-36 shrink-0 snap-start rounded-3xl border p-3 text-center" data-testid="shelf-curator">
              <Link href={`/curators/${c.id}`} className="block">
                <Avatar className="mx-auto size-16">
                  <AvatarFallback className="text-xl">{c.display_name.slice(0, 1)}</AvatarFallback>
                </Avatar>
                <div className="mt-2 truncate text-sm font-semibold">{c.display_name}</div>
                <div className="text-muted-foreground truncate text-xs">{top ? sceneLabel(top) : `@${c.x_handle}`}</div>
              </Link>
              <button
                type="button"
                aria-pressed={c.following}
                aria-label={c.following ? `${c.display_name} のフォローを解除` : `${c.display_name} をフォロー`}
                className={cn(
                  "mt-2 inline-flex h-9 w-full items-center justify-center gap-1 rounded-full text-sm font-semibold",
                  c.following ? "bg-muted" : "bg-foreground text-background",
                )}
                onClick={async () => {
                  if (!requireLogin("フォロー")) return;
                  try {
                    await apiSend(`/api/curators/${c.id}/follow`, c.following ? "DELETE" : "POST");
                    if (c.following) useProfile.getState().dropSoftFollow(c.id);
                    await mutate();
                    void mutateMe();
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                {c.following ? <Check className="size-4" /> : <Plus className="size-4" />}
                {c.following ? "フォロー中" : "フォロー"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** 先頭の1曲を大きく見せ、ここから再生を始める */
function Hero({ items }: { items: QueueItem[] }) {
  const list = usePlayList(items, HOME);
  const playingItem = usePlayer((s) => (s.label === HOME ? s.queue[s.index] : undefined));
  const item = playingItem ?? items[0];
  if (!item) return null;
  return (
    <div className="relative overflow-hidden rounded-[28px]">
      <Artwork src={item.artwork_url} seed={item.track_id} alt="" className="absolute inset-0 size-full scale-125 rounded-none blur-2xl" />
      <div className="absolute inset-0 bg-black/45" />
      <div className="relative flex items-end gap-4 p-4 text-white">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          aria-label="再生パネルを開く"
          onClick={() => (list.isThis ? getPlayerStore().getState().setPanelOpen(true) : list.playFrom(0, { open: true }))}
        >
          <Artwork src={item.artwork_url} seed={item.track_id} alt="" className="size-28 rounded-2xl shadow-xl" />
          <div className="mt-3 truncate text-xl font-bold">{item.title}</div>
          <div className="truncate text-white/80">{item.artist_name}</div>
          <div className="mt-2 [&_span]:text-foreground">
            <WhyChips item={item} max={2} />
          </div>
        </button>
        <PlayFab items={items} label={HOME} className="size-16" />
      </div>
    </div>
  );
}

function PitchBanner() {
  const favorites = useProfile((s) => s.favorites);
  const { data } = useSWR<{ matched_count: number }>(
    `/api/campaigns?fav=${encodeURIComponent(favorites.join("|"))}`,
    fetcher,
  );
  const n = data?.matched_count ?? 0;
  if (n === 0) return null;
  return (
    <Link href="/campaigns" className="bg-brand/15 flex h-14 items-center gap-3 rounded-2xl px-4">
      <Heart className="fill-brand text-brand size-5" />
      <span className="flex-1 font-semibold">あなたへの推薦</span>
      <span className="bg-brand text-brand-foreground flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-sm font-bold tabular-nums">
        {n}
      </span>
    </Link>
  );
}

export function DiscoverView() {
  const hydrated = useProfile((s) => s.hydrated);
  const onboarded = useProfile((s) => s.onboarded);
  const { data, error, isLoading, mutate } = useHomeFeed(hydrated && onboarded);
  const autostart = useRef(false);
  const playingHome = usePlayer((s) => s.label === HOME && s.index >= 0);
  const queue = usePlayer((s) => s.queue);
  const items = data?.items;

  // オンボーディング直後は、そのまま1曲目を鳴らす
  useEffect(() => {
    if (!autostart.current || !items?.length) return;
    autostart.current = false;
    const st = getPlayerStore().getState();
    st.playQueue(items, 0, HOME);
    st.setPanelOpen(true);
  }, [items]);

  // 再生中に好みが更新されたら、これから流れる曲だけを並べ直す（直近の数曲は動かさない）
  useEffect(() => {
    if (items && getPlayerStore().getState().label === HOME) getPlayerStore().getState().replaceTail(items);
  }, [items]);

  if (!hydrated) {
    return (
      <div className="space-y-4 pt-16">
        <Skeleton className="h-56 rounded-[28px]" />
        <ListSkeleton rows={4} />
      </div>
    );
  }
  if (!onboarded) return <Onboarding onDone={() => (autostart.current = true)} />;

  // 再生中はキューそのもの（並べ直しが反映された状態）を見せる
  const shown = playingHome ? queue : (items ?? []);
  return (
    <div className="space-y-5">
      <ScreenHeader title={HOME} />
      <TasteChips />
      {error ? (
        <ErrorState message={error.message} onRetry={() => mutate()} />
      ) : !items && isLoading ? (
        <>
          <Skeleton className="h-56 rounded-[28px]" />
          <ListSkeleton rows={4} />
        </>
      ) : shown.length === 0 ? (
        <EmptyState title="まだ曲がありません" />
      ) : (
        <>
          <Hero items={shown} />
          <DepthControl />
          <PitchBanner />
          <CuratorShelf />
          <section aria-label="キュー">
            <div className="mb-1 flex items-baseline justify-between">
              <h2 className="text-lg font-bold">キュー</h2>
              <span className="text-muted-foreground text-sm tabular-nums">{shown.length}</span>
            </div>
            <TrackList items={shown} label={HOME} />
          </section>
        </>
      )}
    </div>
  );
}
