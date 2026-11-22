"use client";

import Link from "next/link";
import useSWR from "swr";
import { Bookmark, Pause, Play } from "lucide-react";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/common";
import { TrackList, usePlayList } from "@/components/player/track-list";
import { Button } from "@/components/ui/button";
import { fetcher, useMe } from "@/lib/client/api";
import { usePlayer } from "@/lib/player/store";
import type { QueueItem } from "@/lib/types";

function PlayAll({ items }: { items: QueueItem[] }) {
  const list = usePlayList(items, "ライブラリ");
  return (
    <Button variant="brand" onClick={list.toggleAll} disabled={!items.length}>
      {list.playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
      {list.playing ? "一時停止" : "すべて再生"}
    </Button>
  );
}

export function LibraryView() {
  const { user, loading } = useMe();
  const savedCount = usePlayer((s) => s.savedTrackIds.length);
  const { data, error, isLoading, mutate } = useSWR<{ items: QueueItem[] }>(
    user ? ["/api/library", savedCount] : null,
    ([url]: [string]) => fetcher<{ items: QueueItem[] }>(url),
    { keepPreviousData: true },
  );
  if (loading) return <ListSkeleton />;
  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader title="ライブラリ" />
        <EmptyState icon={<Bookmark className="size-6" />} title="保存した曲がここに並びます">
          <Button asChild className="mt-3">
            <Link href="/login?next=/library">ログインする</Link>
          </Button>
        </EmptyState>
      </div>
    );
  }
  const items = data?.items ?? [];
  return (
    <div className="space-y-6">
      <PageHeader title="ライブラリ" description="保存した曲" actions={<PlayAll items={items} />} />
      {error ? (
        <ErrorState message={error.message} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState icon={<Bookmark className="size-6" />} title="まだ保存した曲はありません">
          曲の <Bookmark className="inline size-3.5" /> を押すと保存できます。
        </EmptyState>
      ) : (
        <TrackList items={items} label="ライブラリ" showReason={false} />
      )}
    </div>
  );
}
