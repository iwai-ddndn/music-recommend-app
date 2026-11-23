"use client";

import Link from "next/link";
import useSWR from "swr";
import { Bookmark } from "lucide-react";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/common";
import { ScreenHeader } from "@/components/layout/app-shell";
import { PlayFab, TrackList } from "@/components/player/track-list";
import { Button } from "@/components/ui/button";
import { fetcher, useMe } from "@/lib/client/api";
import { usePlayer } from "@/lib/player/store";
import type { QueueItem } from "@/lib/types";

export function LibraryView() {
  const { user, loading } = useMe();
  const savedCount = usePlayer((s) => s.savedTrackIds.length);
  const { data, error, isLoading, mutate } = useSWR<{ items: QueueItem[] }>(
    user ? ["/api/library", savedCount] : null,
    ([url]: [string]) => fetcher<{ items: QueueItem[] }>(url),
    { keepPreviousData: true },
  );
  const items = data?.items ?? [];
  return (
    <div className="space-y-4">
      <ScreenHeader title="保存した曲" action={items.length > 0 ? <PlayFab items={items} label="保存した曲" className="size-12" /> : undefined} />
      {loading ? (
        <ListSkeleton />
      ) : !user ? (
        <EmptyState icon={<Bookmark className="size-7" />} title="保存した曲がここに並びます">
          <Button asChild className="h-12 rounded-full px-6">
            <Link href="/login?next=/library">ログイン</Link>
          </Button>
        </EmptyState>
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => mutate()} />
      ) : isLoading && !data ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState icon={<Bookmark className="size-7" />} title="まだ保存した曲はありません" />
      ) : (
        <TrackList items={items} label="保存した曲" showWhy={false} />
      )}
    </div>
  );
}
