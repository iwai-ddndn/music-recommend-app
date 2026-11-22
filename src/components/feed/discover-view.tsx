"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import useSWR from "swr";
import { ArrowRight, Megaphone, Pause, Play, Sparkles, Users } from "lucide-react";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/common";
import { TrackList, usePlayList } from "@/components/player/track-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { apiSend, fetcher, useMe } from "@/lib/client/api";
import type { QueueItem } from "@/lib/types";

type FeedResponse = { items: QueueItem[]; depth: number };

export function depthLabel(d: number) {
  if (d <= 0.15) return "人気曲も混ぜる";
  if (d < 0.4) return "浅め";
  if (d <= 0.6) return "バランス";
  if (d < 0.85) return "深め";
  return "とことん無名";
}

function DepthControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Card className="gap-3 py-4">
      <CardContent className="space-y-3 px-4">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="depth" className="text-sm font-semibold">
            深さ
          </label>
          <span className="text-brand text-sm font-semibold" data-testid="depth-label">
            {depthLabel(value)}
          </span>
        </div>
        <Slider
          id="depth"
          aria-label="深さ"
          min={0}
          max={1}
          step={0.1}
          value={[value]}
          onValueChange={([v]) => onChange(v)}
        />
        <div className="text-muted-foreground flex justify-between text-xs">
          <span>人気曲も混ぜる</span>
          <span>とことん無名</span>
        </div>
        <p className="text-muted-foreground text-xs">深いほど、リスナー数の多い曲を強く割り引いて並べます。</p>
      </CardContent>
    </Card>
  );
}

function Onboarding() {
  const { user, stats } = useMe();
  const { data: campaigns } = useSWR<{ matched_count: number }>(user ? "/api/campaigns" : null, fetcher);
  const steps: { href: string; icon: React.ReactNode; title: string; body: string }[] = [];
  if (!user) {
    steps.push({
      href: "/login",
      icon: <Sparkles className="size-4" />,
      title: "ログインして自分好みに",
      body: "目利きのフォローや曲の保存ができ、聴いた曲は次から出にくくなります。",
    });
  } else {
    if (!stats?.follows)
      steps.push({
        href: "/curators",
        icon: <Users className="size-4" />,
        title: "目利きをフォロー",
        body: "フォローした目利きの推し曲が上位に来ます。",
      });
    if (!stats?.favorites)
      steps.push({
        href: "/settings#favorites",
        icon: <Megaphone className="size-4" />,
        title: "好きなアーティストを登録",
        body: "「この人が好きな人へ」という推薦キャンペーンの曲が届きます。",
      });
  }
  const matched = campaigns?.matched_count ?? 0;
  if (steps.length === 0 && matched === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {matched > 0 && (
        <Link
          href="/campaigns"
          className="border-brand/40 bg-brand/10 hover:bg-brand/15 flex items-start gap-3 rounded-xl border p-4 transition-colors sm:col-span-2"
        >
          <Megaphone className="text-brand mt-0.5 size-5 shrink-0" />
          <span className="flex-1">
            <span className="block font-semibold">あなたの好きなアーティストに合う推薦が{matched}件あります</span>
            <span className="text-muted-foreground text-sm">推薦キャンペーンを見る</span>
          </span>
          <ArrowRight className="mt-0.5 size-4" />
        </Link>
      )}
      {steps.map((s) => (
        <Link key={s.href} href={s.href} className="hover:bg-accent/60 flex items-start gap-3 rounded-xl border p-4 transition-colors">
          <span className="bg-muted mt-0.5 rounded-md p-1.5">{s.icon}</span>
          <span className="flex-1">
            <span className="block text-sm font-semibold">{s.title}</span>
            <span className="text-muted-foreground text-xs">{s.body}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

function PlayAllButton({ items }: { items: QueueItem[] }) {
  const list = usePlayList(items, "発見");
  return (
    <Button variant="brand" size="lg" onClick={list.toggleAll} disabled={items.length === 0} data-testid="play-all">
      {list.playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
      {list.playing ? "一時停止" : list.isThis ? "再開" : "すべて再生"}
    </Button>
  );
}

export function DiscoverView() {
  const { user, loading: meLoading, mutate: mutateMe } = useMe();
  // 初期値はユーザー設定（未ログインは既定値）。操作したらその値で上書きする
  const [depthOverride, setDepth] = useState<number | null>(null);
  const [queryOverride, setQueryDepth] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseDepth = meLoading ? null : (user?.depth ?? 0.5);
  const depth = depthOverride ?? baseDepth;
  const queryDepth = queryOverride ?? baseDepth;

  const key = queryDepth === null ? null : `/api/feed?depth=${queryDepth}`;
  const { data, error, isLoading, mutate } = useSWR<FeedResponse>(key, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });

  const onDepth = (v: number) => {
    setDepth(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setQueryDepth(v);
      if (user) void apiSend("/api/me", "PATCH", { depth: v }).then(() => mutateMe());
    }, 350);
  };

  const items = data?.items ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        title="発見"
        description="目利きが推す、まだ知られていない曲。いいね数や再生数は使わず、少数の目利きの熱量で並べています。"
        actions={<PlayAllButton items={items} />}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="order-2 lg:order-1">
          <Onboarding />
        </div>
        <div className="order-1 lg:order-2">{depth !== null && <DepthControl value={depth} onChange={onDepth} />}</div>
      </div>
      <section aria-label="キュー">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">今日のキュー</h2>
          {items.length > 0 && <span className="text-muted-foreground text-xs">{items.length}曲</span>}
        </div>
        {error ? (
          <ErrorState message={error.message} onRetry={() => mutate()} />
        ) : isLoading || !data ? (
          <ListSkeleton />
        ) : items.length === 0 ? (
          <EmptyState title="まだ曲がありません">
            目利きの収集バッチが動くと、ここに曲が並びます。
            {user ? "" : " ログインすると、聴いた曲が次から出にくくなります。"}
          </EmptyState>
        ) : (
          <div className={isLoading ? "opacity-60" : undefined}>
            <TrackList items={items} label="発見" />
          </div>
        )}
      </section>
    </div>
  );
}
