"use client";

import Link from "next/link";
import useSWR from "swr";
import { ChevronLeft, ExternalLink, Pause, Play } from "lucide-react";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/common";
import { TrackList, usePlayList } from "@/components/player/track-list";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/client/api";
import type { CuratorListItem } from "@/lib/repo/curators";
import { FollowButton } from "./curators-view";

function PlayButton({ c }: { c: CuratorListItem }) {
  const list = usePlayList(c.recent_tracks, `@${c.x_handle} の推薦`);
  return (
    <Button variant="brand" onClick={list.toggleAll} disabled={c.recent_tracks.length === 0}>
      {list.playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
      {list.playing ? "一時停止" : "推薦曲を再生"}
    </Button>
  );
}

export function CuratorDetailView({ id }: { id: string }) {
  const { data, error, isLoading, mutate } = useSWR<{ curator: CuratorListItem }>(`/api/curators/${id}`, fetcher);
  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;
  if (isLoading || !data) return <ListSkeleton />;
  const c = data.curator;
  return (
    <div className="space-y-6">
      <Link href="/curators" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ChevronLeft className="size-4" />
        目利き一覧
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar className="size-16 text-xl">
          <AvatarFallback>{c.display_name.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-bold">{c.display_name}</h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <a
              href={`https://x.com/${c.x_handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              @{c.x_handle}
              <ExternalLink className="size-3" />
            </a>
            <span>直近30日 {c.recent_count}曲</span>
            <span>フォロワー {c.follower_count}</span>
            {c.claimed && <Badge variant="outline">本人確認済み</Badge>}
          </div>
          {c.bio && <p className="text-sm">{c.bio}</p>}
        </div>
        <div className="flex gap-2">
          <PlayButton c={c} />
          <FollowButton curator={c} onChange={() => mutate()} size="default" />
        </div>
      </div>
      <section>
        <h2 className="mb-2 text-lg font-semibold">推した曲</h2>
        {c.recent_tracks.length === 0 ? (
          <EmptyState title="まだ曲がありません" />
        ) : (
          <TrackList items={c.recent_tracks} label={`@${c.x_handle} の推薦`} showReason={false} />
        )}
      </section>
    </div>
  );
}
