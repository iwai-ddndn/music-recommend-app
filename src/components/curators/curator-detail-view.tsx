"use client";

import useSWR from "swr";
import { ExternalLink } from "lucide-react";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/common";
import { ScreenHeader } from "@/components/layout/app-shell";
import { PlayFab, TrackList } from "@/components/player/track-list";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { fetcher } from "@/lib/client/api";
import type { CuratorListItem } from "@/lib/repo/curators";
import { sceneLabel } from "@/lib/taste/vocabulary";
import { FollowButton, topScenes } from "./curators-view";

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="flex-1 text-center">
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}

export function CuratorDetailView({ id }: { id: string }) {
  const { data, error, isLoading, mutate } = useSWR<{ curator: CuratorListItem }>(`/api/curators/${id}`, fetcher);
  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;
  if (isLoading || !data) return <ListSkeleton />;
  const c = data.curator;
  const label = `@${c.x_handle}`;
  return (
    <div className="space-y-5">
      <ScreenHeader title="" back={{ href: "/curators", label: "目利き" }} />
      <div className="flex flex-col items-center gap-2 text-center">
        <Avatar className="size-24">
          <AvatarFallback className="text-3xl">{c.display_name.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <h1 className="text-2xl font-bold">{c.display_name}</h1>
        <a
          href={`https://x.com/${c.x_handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground inline-flex h-8 items-center gap-1 text-sm"
        >
          @{c.x_handle}
          <ExternalLink className="size-3" />
        </a>
        <div className="flex flex-wrap justify-center gap-2">
          {topScenes(c, 3).map((s) => (
            <span key={s} className="bg-muted rounded-full px-3 py-1 text-xs font-medium">
              {sceneLabel(s)}
            </span>
          ))}
        </div>
        {c.bio && <p className="text-sm">{c.bio}</p>}
      </div>
      <div className="bg-card flex rounded-3xl border py-3">
        <Stat value={c.recent_count} label="30日の推薦" />
        <Stat value={c.follower_count} label="フォロワー" />
        <Stat value={c.claimed ? "✓" : "—"} label="本人確認" />
      </div>
      <div className="flex items-center gap-3">
        <FollowButton curator={c} onChange={() => mutate()} wide />
        <PlayFab items={c.recent_tracks} label={label} />
      </div>
      {c.recent_tracks.length === 0 ? (
        <EmptyState title="まだ曲がありません" />
      ) : (
        <TrackList items={c.recent_tracks} label={label} showWhy={false} />
      )}
    </div>
  );
}
